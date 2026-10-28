import { existsSync, readFileSync } from "node:fs";
import { test, expect, type Page, type Request, type Response } from "@playwright/test";
import { AUTH_SKIP_REASON, storageStatePath } from "../helpers/storage-state";
import { clearTestAccountUserData, expectedUserHeaders } from "../helpers/user-data";

// 登入後的歷史與統計以雲端為準。所有等待都以 data-sync-status 或 response 為依據，
// 不用固定延遲：已登入者在 /api/session 回應前會先看到本機畫面，必須等同步狀態再操作。

const HISTORY_KEY = "matchmaker:history:v1";
const MATCHMAKER_PAGE = "/matchmaker";
const HISTORY_PAGE = "/matchmaker/history";
const STATS_PAGE = "/matchmaker/stats";
const DATA_PAGE = "/matchmaker/data";
const PLAYERS_API = "/api/matchmaker/players";
const ROUND_API = "/api/matchmaker/round";
const HISTORY_API = "/api/matchmaker/history";
const SYNCED = '[data-sync-status="synced"]';
const LOAD_FAILED = '[data-sync-status="load-failed"]';
const COURT_GRIDS = '[data-testid="match-stage-courts"] [data-testid$="-grid"]';
const RANGE_LABELS = ["今日", "本週", "本月", "上月", "更早"] as const;
const JSON_RESTORE_DISABLED_TEXT =
	"登入時暫不支援從 JSON 備份還原，請登出後還原，或使用之後提供的匯入本機資料功能";
const GUEST_PLAYER_NAME_A = "訪客歷史甲";
const GUEST_PLAYER_NAME_B = "訪客歷史乙";
// 統計表欄位索引：名次、球員、目前強度、出場數、勝負和
const CELL_INDEX_GAMES_PLAYED = 3;
const CELL_INDEX_WIN_LOSS_DRAW = 4;

test.use({ storageState: storageStatePath });
test.skip(() => !existsSync(storageStatePath), AUTH_SKIP_REASON);

test.beforeEach(() => {
	clearTestAccountUserData();
});

function buildPlayer(index: number) {
	return {
		id: `hs${index}`,
		name: `歷史測試員${index}`,
		gender: "other" as const,
		colorFrom: "#4f46e5",
		colorTo: "#818cf8",
		rating: 3,
		restCount: 0,
		gamesPlayed: 0,
		isActive: true,
		createdAt: "2026-01-01T00:00:00.000Z",
	};
}

// 準備雲端名單走 API 而非 UI：比逐一開 Dialog 快且穩。
// page.request 與頁面共用同一份 storage state 的 cookie，等同已登入的同一位使用者。
async function seedCloudPlayers(page: Page, count: number) {
	for (let index = 1; index <= count; index++) {
		const player = buildPlayer(index);
		const response = await page.request.put(`${PLAYERS_API}/${player.id}`, {
			data: { data: player, version: 0 },
			headers: await expectedUserHeaders(page.request),
		});
		expect(response.ok(), `種入雲端參賽者 ${player.id} 失敗：${response.status()}`).toBe(true);
	}
}

function isRoundPut(response: Response) {
	return response.url().endsWith(ROUND_API) && response.request().method() === "PUT";
}

function isScorePost(response: Response) {
	return response.url().includes(`${ROUND_API}/matches/`) && response.request().method() === "POST";
}

function isHistoryGet(response: Response) {
	return new URL(response.url()).pathname === HISTORY_API && response.request().method() === "GET";
}

// 從場地色塊既有的 data-testid（`court-${match.id}-grid`）反解析 matchId
async function courtMatchId(page: Page): Promise<string> {
	const testId = await page.locator(COURT_GRIDS).first().getAttribute("data-testid");
	const match = /^court-(.*)-grid$/.exec(testId ?? "");
	if (!match) {
		throw new Error(`無法從 data-testid 解析 matchId：${String(testId)}`);
	}
	return match[1];
}

interface PlayMatchOptions {
	scoreA: string;
	scoreB: string;
	/** 設定 10 分鐘計時並開始計時：只有計時回合允許送出同分。 */
	timed?: boolean;
}

// 開啟對戰頁、產生一輪（預設 1 場地單打）並送出比分，回傳該場出賽者的姓名。
// 每個等待都以雲端 response 或同步狀態為依據。
async function playOneMatch(page: Page, options: PlayMatchOptions): Promise<string[]> {
	await page.goto(MATCHMAKER_PAGE);
	await expect(page.locator(SYNCED)).toBeVisible();
	if (options.timed) {
		await page.getByRole("radio", { name: "10 分鐘", exact: true }).click();
	}
	await Promise.all([
		page.waitForResponse((response) => isRoundPut(response) && response.ok()),
		page.getByRole("button", { name: "產生本輪對戰" }).click(),
	]);
	await expect(page.locator(COURT_GRIDS)).toHaveCount(1);
	await expect(page.locator(SYNCED)).toBeVisible();

	if (options.timed) {
		await Promise.all([
			page.waitForResponse((response) => isRoundPut(response) && response.ok()),
			page.getByRole("button", { name: "開始計時" }).click(),
		]);
		await expect(page.getByRole("button", { name: "開始計時" })).toHaveCount(0);
		await expect(page.locator(SYNCED)).toBeVisible();
	}

	const matchId = await courtMatchId(page);
	const courtsText = await page.getByTestId("match-stage-courts").innerText();
	const playedNames = [1, 2, 3, 4]
		.map((index) => buildPlayer(index).name)
		.filter((name) => courtsText.includes(name));

	const court = page.getByTestId(`court-${matchId}`);
	await court.getByLabel("第一隊比分").fill(options.scoreA);
	await court.getByLabel("第二隊比分").fill(options.scoreB);
	await Promise.all([
		page.waitForResponse((response) => isScorePost(response) && response.ok()),
		court.getByRole("button", { name: "送出比分" }).click(),
	]);
	// 計時回合同分時比分旁會多出「平手」標籤，所以比對開頭而非整段文字
	await expect(page.getByTestId(`court-${matchId}-score`)).toContainText(
		`${options.scoreA}:${options.scoreB}`,
	);
	await expect(page.locator(SYNCED)).toBeVisible();
	return playedNames;
}

// 本機訪客歷史：與雲端那一場刻意不同的姓名，用來證明畫面與匯出不取本機
function buildGuestHistoryRaw(): string {
	const playedAt = new Date().toISOString();
	const guestPlayer = (id: string, name: string) => ({ id, name, ratingBefore: 3, ratingAfter: 3.1 });
	const entry = {
		matchId: "guest-history-1",
		courtNumber: 1,
		playedAt,
		teamA: { players: [guestPlayer("guest-a", GUEST_PLAYER_NAME_A)], rating: 3 },
		teamB: { players: [guestPlayer("guest-b", GUEST_PLAYER_NAME_B)], rating: 3 },
		scoreA: 11,
		scoreB: 2,
		winner: "teamA" as const,
		format: "singles" as const,
	};
	return JSON.stringify({ version: 1, entries: [entry] });
}

async function seedGuestHistory(page: Page): Promise<string> {
	const raw = buildGuestHistoryRaw();
	await page.evaluate(({ key, value }) => window.localStorage.setItem(key, value), {
		key: HISTORY_KEY,
		value: raw,
	});
	return raw;
}

async function readLocal(page: Page, key: string) {
	return page.evaluate((storageKey) => window.localStorage.getItem(storageKey), key);
}

// 記錄頁面發出的 /api/ 請求，供「只發出讀取」類的斷言使用
function trackApiRequests(page: Page): Request[] {
	const requests: Request[] = [];
	page.on("request", (request) => {
		if (new URL(request.url()).pathname.startsWith("/api/")) {
			requests.push(request);
		}
	});
	return requests;
}

// 依序切換五個區間，每次都等該次雲端歷史請求完成且畫面回到 synced
async function switchThroughAllRanges(page: Page) {
	for (const label of RANGE_LABELS.slice(1)) {
		await Promise.all([
			page.waitForResponse((response) => isHistoryGet(response) && response.ok()),
			page.getByRole("radio", { name: label }).click(),
		]);
		await expect(page.locator(SYNCED)).toBeVisible();
		await expect(page.getByRole("radio", { name: label })).toBeChecked();
	}
}

test.describe("matchmaker 歷史與統計雲端同步", () => {
	test("登入時瀏覽歷史頁只發出 GET 且不改動本機歷史", async ({ page }) => {
		await seedCloudPlayers(page, 2);
		await playOneMatch(page, { scoreA: "11", scoreB: "5" });
		const guestRaw = await seedGuestHistory(page);

		const requests = trackApiRequests(page);
		await Promise.all([
			page.waitForResponse((response) => isHistoryGet(response) && response.ok()),
			page.goto(HISTORY_PAGE),
		]);
		await expect(page.locator(SYNCED)).toBeVisible();
		await expect(page.locator('[data-testid^="history-record-"][data-slot="card"]')).toHaveCount(1);
		await switchThroughAllRanges(page);

		const matchmakerRequests = requests.filter((request) =>
			new URL(request.url()).pathname.startsWith("/api/matchmaker/"),
		);
		// 至少要有雲端歷史的讀取，否則「全部為 GET」可能只是什麼請求都沒發
		expect(
			matchmakerRequests.some((request) => new URL(request.url()).pathname === HISTORY_API),
			"歷史頁沒有發出雲端歷史請求",
		).toBe(true);
		expect(
			matchmakerRequests.map((request) => `${request.method()} ${new URL(request.url()).pathname}`),
		).toEqual(matchmakerRequests.map((request) => `GET ${new URL(request.url()).pathname}`));
		expect(await readLocal(page, HISTORY_KEY)).toBe(guestRaw);
	});

	test("登入後完成的對戰由雲端顯示在歷史頁且不寫入本機", async ({ page }) => {
		await seedCloudPlayers(page, 4);
		const playedNames = await playOneMatch(page, { scoreA: "11", scoreB: "5" });
		expect(playedNames).toHaveLength(2);

		await page.goto(HISTORY_PAGE);
		await expect(page.locator(SYNCED)).toBeVisible();
		const card = page.locator('[data-testid^="history-record-"][data-slot="card"]');
		await expect(card).toHaveCount(1);
		for (const name of playedNames) {
			await expect(card).toContainText(name);
		}
		await expect(card.locator('[data-testid$="-score"]')).toHaveText("11:5");
		await expect(card).toContainText(/\d+\.\d{2} → \d+\.\d{2}/);
		expect(await readLocal(page, HISTORY_KEY)).toBeNull();
	});

	test("雲端歷史載入失敗時歷史頁顯示錯誤提示", async ({ page }) => {
		await page.route(`**${HISTORY_API}*`, async (route) => {
			await route.fulfill({ status: 500, body: "" });
		});

		await page.goto(HISTORY_PAGE);
		await expect(page.getByText("無法載入雲端資料，請重新整理頁面")).toBeVisible();
		await expect(page.locator(LOAD_FAILED)).toBeVisible();
		await expect(page.getByRole("radio", { name: "今日" })).toHaveCount(0);
	});

	test("登入時計時回合的平局在統計頁計為和局", async ({ page }) => {
		await seedCloudPlayers(page, 2);
		await playOneMatch(page, { scoreA: "9", scoreB: "9", timed: true });

		await page.goto(STATS_PAGE);
		await expect(page.locator(SYNCED)).toBeVisible();
		const rows = page.locator('[data-testid^="player-stat-row-"]');
		await expect(rows).toHaveCount(2);
		for (let index = 0; index < 2; index++) {
			const cells = rows.nth(index).getByRole("cell");
			await expect(cells.nth(CELL_INDEX_GAMES_PLAYED)).toHaveText("1");
			await expect(cells.nth(CELL_INDEX_WIN_LOSS_DRAW)).toHaveText("0 - 0 - 1");
		}
	});

	test("登入時瀏覽統計頁只發出名單與歷史的讀取請求", async ({ page }) => {
		await seedCloudPlayers(page, 2);
		await playOneMatch(page, { scoreA: "11", scoreB: "5" });

		const requests = trackApiRequests(page);
		await Promise.all([
			page.waitForResponse((response) => isHistoryGet(response) && response.ok()),
			page.goto(STATS_PAGE),
		]);
		await expect(page.locator(SYNCED)).toBeVisible();
		await expect(page.locator('[data-testid^="player-stat-row-"]')).toHaveCount(2);
		await switchThroughAllRanges(page);

		expect(requests.map((request) => request.method()).filter((method) => method !== "GET")).toEqual([]);
		const matchmakerPaths = new Set(
			requests
				.map((request) => new URL(request.url()).pathname)
				.filter((pathname) => pathname.startsWith("/api/matchmaker/")),
		);
		expect([...matchmakerPaths].sort()).toEqual([HISTORY_API, PLAYERS_API].sort());
	});

	test("登入時歷史 CSV 匯出的內容來自雲端", async ({ page }) => {
		await seedCloudPlayers(page, 2);
		const playedNames = await playOneMatch(page, { scoreA: "11", scoreB: "5" });
		expect(playedNames).toHaveLength(2);
		await seedGuestHistory(page);

		await page.goto(DATA_PAGE);
		// 還原停用的說明只在雲端模式出現，作為「session 已就緒、已切到雲端分支」的同步點
		await expect(page.getByText(JSON_RESTORE_DISABLED_TEXT)).toBeVisible();

		const [download] = await Promise.all([
			page.waitForEvent("download"),
			page.getByRole("button", { name: "匯出 CSV" }).click(),
		]);
		const downloadPath = await download.path();
		expect(downloadPath).not.toBeNull();
		const csv = readFileSync(downloadPath as string, "utf-8");
		for (const name of playedNames) {
			expect(csv).toContain(name);
		}
		expect(csv).not.toContain(GUEST_PLAYER_NAME_A);
		expect(csv).not.toContain(GUEST_PLAYER_NAME_B);
	});
});
