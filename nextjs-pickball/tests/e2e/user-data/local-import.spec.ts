import { existsSync } from "node:fs";
import { test, expect, type Page } from "@playwright/test";
import { createInitialState } from "@pickball/core/scoreboard/reducer";
import { AUTH_SKIP_REASON, storageStatePath } from "../helpers/storage-state";
import { clearTestAccountUserData, expectedUserHeaders } from "../helpers/user-data";

// 本機資料匯入雲端（B9）。所有等待都以 data-sync-status、元素或 response 為依據，不用固定延遲：
// 已登入者在 /api/session 回應前會先看到本機（訪客）畫面，必須等雲端分支的元素出現再操作。

const ROSTER_KEY = "matchmaker:roster:v1";
const ROUND_KEY = "matchmaker:round:v1";
const HISTORY_KEY = "matchmaker:history:v1";
const SLOTS_KEY = "scoreboard:matches:v1";
const CURRENT_KEY = "scoreboard:current:v1";
const LOCAL_KEYS = [ROSTER_KEY, ROUND_KEY, HISTORY_KEY, SLOTS_KEY, CURRENT_KEY] as const;

const NEUTRAL_PAGE = "/quiz";
const MATCHMAKER_PAGE = "/matchmaker";
const PLAYERS_PAGE = "/matchmaker/players";
const HISTORY_PAGE = "/matchmaker/history";
const DATA_PAGE = "/matchmaker/data";
const SCOREBOARD_CURRENT_API = "/api/scoreboard/current";
const SYNCED = '[data-sync-status="synced"]';
const HISTORY_CARDS = '[data-testid^="history-record-"][data-slot="card"]';

const JSON_CLOUD_IMPORT_HINT_TEXT =
	"登入時選擇的備份檔會匯入到雲端，只有雲端沒有任何對戰分配機資料時才會寫入；不會覆寫或合併雲端資料，也不會寫入本機";
// B6 在登入時停用 JSON 還原所顯示的說明；B9 起不得再出現
const LEGACY_JSON_RESTORE_DISABLED_TEXT =
	"登入時暫不支援從 JSON 備份還原，請登出後還原，或使用之後提供的匯入本機資料功能";
const EMPTY_TEXT = "本機沒有可匯入的資料";
const OVERSIZE_TEXT = "本機資料量超過單次匯入上限，請先匯出 JSON 備份後聯絡管理者";
const CONFLICT_TEXT = "雲端已有對戰分配機資料，無法匯入。若要以本機資料取代，請先在參賽者頁重置名單。";
const FAILED_TEXT = "匯入失敗，請稍後再試";
const SKIPPED_TEXT = "雲端已有進行中的獨立計分板，未匯入該場";
const HINT_TEXT = "只有在雲端沒有任何對戰分配機資料時才能匯入；匯入後本機資料會保留";
const IMPORT_BUTTON_NAME = "匯入本機資料到雲端";
const NO_RELOAD_MARKER = "__localImportNoReloadMarker";

test.use({ storageState: storageStatePath });
test.skip(() => !existsSync(storageStatePath), AUTH_SKIP_REASON);

test.beforeEach(async ({ page }) => {
	clearTestAccountUserData();
	// 每個 test 都是全新 context，本機本來就是空的；仍明確清一次，讓前提不依賴 Playwright 的隔離實作。
	// 停在不掛載任何本機 store 的頁面上，之後的 seed 才不會被 write effect 改寫。
	await page.goto(NEUTRAL_PAGE);
	await page.evaluate(() => window.localStorage.clear());
});

function buildPlayer(id: string, name: string) {
	return {
		id,
		name,
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

// 歷史的 playedAt 取測試當下：歷史頁預設區間是「今日」，固定日期會讓匯入後的歷史在畫面上看不到
function buildHistoryEntry(matchId: string, nameA: string, nameB: string) {
	return {
		format: "singles" as const,
		matchId,
		courtNumber: 1,
		playedAt: new Date().toISOString(),
		teamA: { rating: 3, players: [{ id: "lp1", name: nameA, ratingBefore: 3, ratingAfter: 3.2 }] },
		teamB: { rating: 3, players: [{ id: "lp2", name: nameB, ratingBefore: 3, ratingAfter: 2.8 }] },
		scoreA: 11,
		scoreB: 4,
		winner: "teamA" as const,
	};
}

function buildPendingRound() {
	return {
		roundNumber: 1,
		createdAt: "2026-01-01T00:00:00.000Z",
		format: "singles" as const,
		courtCount: 1,
		targetScore: 11 as const,
		matches: [
			{
				id: "lm1",
				courtNumber: 1,
				format: "singles" as const,
				teams: [
					{ playerIds: ["lp1"], rating: 3 },
					{ playerIds: ["lp2"], rating: 3 },
				],
				status: "pending" as const,
				scores: null,
				winner: null,
				completedAt: null,
				playerRatings: [
					{ playerId: "lp1", before: 3, after: null },
					{ playerId: "lp2", before: 3, after: null },
				],
			},
		],
		restingPlayerIds: [],
		seenSignatures: { teammateKeys: [], opponentKeys: [], fullMatchKeys: [] },
		timer: null,
	};
}

const LOCAL_NAME_A = "本機甲";
const LOCAL_NAME_B = "本機乙";

// 五個 key 都有資料的訪客本機資料；回合含一個進行中場次，分槽才會被匯入
function buildFullLocalData(): Record<string, string> {
	const slot = { ...createInitialState({ mode: "singles" }), matchId: "lm1", courtNumber: 1 };
	const current = createInitialState({ mode: "singles" });
	return {
		[ROSTER_KEY]: JSON.stringify({
			version: 1,
			players: [buildPlayer("lp1", LOCAL_NAME_A), buildPlayer("lp2", LOCAL_NAME_B)],
		}),
		[ROUND_KEY]: JSON.stringify({ version: 1, round: buildPendingRound() }),
		[HISTORY_KEY]: JSON.stringify({
			version: 1,
			entries: [buildHistoryEntry("lh1", LOCAL_NAME_A, LOCAL_NAME_B)],
		}),
		[SLOTS_KEY]: JSON.stringify({ lm1: slot }),
		[CURRENT_KEY]: JSON.stringify({ ...current, scores: { us: 3, them: 1 } }),
	};
}

async function seedLocal(page: Page, entries: Record<string, string>) {
	await page.evaluate((items) => {
		for (const [key, value] of Object.entries(items)) {
			window.localStorage.setItem(key, value);
		}
	}, entries);
}

async function readLocalKeys(page: Page): Promise<Record<string, string | null>> {
	return page.evaluate(
		(keys) => Object.fromEntries(keys.map((key) => [key, window.localStorage.getItem(key)])),
		[...LOCAL_KEYS],
	);
}

// 匯入成功後元件不得 reload：reload 會讓 window 上的標記消失
async function markNoReload(page: Page) {
	await page.evaluate((name) => {
		(window as unknown as Record<string, unknown>)[name] = true;
	}, NO_RELOAD_MARKER);
}

async function expectNotReloaded(page: Page) {
	const marker = await page.evaluate(
		(name) => (window as unknown as Record<string, unknown>)[name] === true,
		NO_RELOAD_MARKER,
	);
	expect(marker, "匯入後頁面被重新載入").toBe(true);
}

function importButton(page: Page) {
	return page.getByRole("button", { name: IMPORT_BUTTON_NAME, exact: true });
}

// 以 JSON 備份檔作為 fixture：不含任何帳密，只有兩位參賽者與一筆歷史
function buildBackupFile() {
	const backup = {
		version: 1,
		players: [buildPlayer("bp1", "備份甲"), buildPlayer("bp2", "備份乙")],
		currentRound: null,
		history: [buildHistoryEntry("bh1", "備份甲", "備份乙")],
	};
	return {
		name: "matchmaker-backup.json",
		mimeType: "application/json",
		buffer: Buffer.from(JSON.stringify(backup), "utf-8"),
	};
}

test.describe("本機資料匯入雲端", () => {
	test("登入時以 JSON 備份匯入到空的雲端且不寫入本機", async ({ page }) => {
		const guestRoster = JSON.stringify({ version: 1, players: [buildPlayer("guest-1", "不同的訪客")] });
		await seedLocal(page, { [ROSTER_KEY]: guestRoster });

		await page.goto(DATA_PAGE);
		// 雲端分支才有的說明，作為「session 已就緒、已切到雲端分支」的同步點
		await expect(page.getByText(JSON_CLOUD_IMPORT_HINT_TEXT)).toBeVisible();
		await expect(page.getByTestId("json-backup-import-input")).toHaveCount(0);
		await expect(page.getByText(LEGACY_JSON_RESTORE_DISABLED_TEXT)).toHaveCount(0);
		await expect(page.getByTestId("json-backup-cloud-import-input")).toHaveCount(1);

		const before = await readLocalKeys(page);
		await markNoReload(page);
		await page.getByTestId("json-backup-cloud-import-input").setInputFiles(buildBackupFile());

		await expect(page.getByTestId("json-backup-import-message")).toHaveText(
			"已匯入 2 位參賽者、1 筆歷史、0 個回合、0 個場次計分板。",
		);
		await expectNotReloaded(page);
		expect(await readLocalKeys(page)).toEqual(before);

		// 雲端已有資料後再匯入同一份備份：與匯入本機資料相同，拒絕且不覆寫、不合併
		await page.getByTestId("json-backup-cloud-import-input").setInputFiles(buildBackupFile());
		await expect(page.getByText(CONFLICT_TEXT)).toBeVisible();
		await expect(page.getByTestId("json-backup-import-message")).toHaveCount(0);
		await expectNotReloaded(page);
		expect(await readLocalKeys(page)).toEqual(before);

		await page.goto(PLAYERS_PAGE);
		await expect(page.locator(SYNCED)).toBeVisible();
		await expect(page.getByText("備份甲", { exact: true })).toBeVisible();
		await expect(page.getByText("備份乙", { exact: true })).toBeVisible();
		// 本機名單仍是訪客那一份（本機 hook 載入時會正規化回寫，所以比內容而不比原始字串）
		const localRoster = await page.evaluate((key) => window.localStorage.getItem(key), ROSTER_KEY);
		const localNames = (JSON.parse(localRoster ?? "{}") as { players?: { name: string }[] }).players?.map(
			(player) => player.name,
		);
		expect(localNames).toEqual(["不同的訪客"]);
	});

	test("登入後匯入本機資料到空的雲端並保留本機資料", async ({ page }) => {
		await seedLocal(page, buildFullLocalData());

		await page.goto(DATA_PAGE);
		await expect(importButton(page)).toBeVisible();
		await expect(page.getByTestId("local-import-summary")).toHaveText(
			"本機資料：2 位參賽者、1 筆歷史、1 個回合、1 個場次計分板、1 場獨立計分板",
		);
		await expect(page.getByText(HINT_TEXT)).toBeVisible();
		const before = await readLocalKeys(page);
		await markNoReload(page);

		await importButton(page).click();

		await expect(page.getByTestId("local-import-message")).toHaveText(
			"已匯入 2 位參賽者、1 筆歷史、1 個回合、1 個場次計分板、1 場獨立計分板。",
		);
		// 雲端沒有獨立計分板，所以沒有「略過」的提示
		await expect(page.getByText(SKIPPED_TEXT)).toHaveCount(0);
		await expectNotReloaded(page);
		expect(await readLocalKeys(page)).toEqual(before);

		await page.goto(PLAYERS_PAGE);
		await expect(page.locator(SYNCED)).toBeVisible();
		await expect(page.getByText(LOCAL_NAME_A, { exact: true })).toBeVisible();
		await expect(page.getByText(LOCAL_NAME_B, { exact: true })).toBeVisible();

		await page.goto(HISTORY_PAGE);
		await expect(page.locator(SYNCED)).toBeVisible();
		await expect(page.locator(HISTORY_CARDS)).toHaveCount(1);
		await expect(page.getByTestId("history-record-lh1")).toContainText(LOCAL_NAME_A);

		await page.goto(MATCHMAKER_PAGE);
		await expect(page.locator(SYNCED)).toBeVisible();
		await expect(page.getByTestId("court-lm1")).toBeVisible();
	});

	test("重複匯入時顯示雲端已有資料且歷史不重複", async ({ page }) => {
		await seedLocal(page, buildFullLocalData());
		// 雲端先有一場獨立計分板：第一次成功匯入時該段必須略過，並提示使用者
		const cloudCurrent = { ...createInitialState({ mode: "singles" }), scores: { us: 7, them: 5 } };
		const seeded = await page.request.put(SCOREBOARD_CURRENT_API, {
			data: { data: cloudCurrent, version: 0 },
			headers: await expectedUserHeaders(page.request),
		});
		expect(seeded.ok(), `種入雲端獨立計分板失敗：${seeded.status()}`).toBe(true);

		// 第一次請求擋在 gate 後面並回 500，才能觀察「送出期間」與失敗分支；之後的請求原樣放行
		let releaseFirst: () => void = () => {};
		const firstGate = new Promise<void>((resolve) => {
			releaseFirst = resolve;
		});
		let importRequestCount = 0;
		await page.route("**/api/import", async (route) => {
			importRequestCount += 1;
			if (importRequestCount === 1) {
				await firstGate;
				await route.fulfill({ status: 500, body: "" });
				return;
			}
			await route.continue();
		});

		await page.goto(DATA_PAGE);
		await expect(importButton(page)).toBeVisible();
		const firstRequest = page.waitForRequest(
			(request) => request.url().endsWith("/api/import") && request.method() === "POST",
		);
		await importButton(page).click();
		await firstRequest;
		// 送出期間按鈕停用；硬點也不得多送一次
		await expect(importButton(page)).toBeDisabled();
		await importButton(page).click({ force: true });
		releaseFirst();
		await expect(page.getByTestId("local-import-message")).toHaveText(FAILED_TEXT);
		await expect(importButton(page)).toBeEnabled();
		expect(importRequestCount).toBe(1);

		await importButton(page).click();
		await expect(page.getByTestId("local-import-message")).toHaveText(
			"已匯入 2 位參賽者、1 筆歷史、1 個回合、1 個場次計分板。",
		);
		await expect(page.getByText(SKIPPED_TEXT)).toBeVisible();

		await page.goto(HISTORY_PAGE);
		await expect(page.locator(SYNCED)).toBeVisible();
		await expect(page.locator(HISTORY_CARDS)).toHaveCount(1);

		await page.goto(DATA_PAGE);
		await expect(importButton(page)).toBeVisible();
		await importButton(page).click();
		await expect(page.getByTestId("local-import-message")).toHaveText(CONFLICT_TEXT);
		await expect(page.getByText(SKIPPED_TEXT)).toHaveCount(0);

		await page.goto(HISTORY_PAGE);
		await expect(page.locator(SYNCED)).toBeVisible();
		await expect(page.locator(HISTORY_CARDS)).toHaveCount(1);
	});

	test("雲端名單為空且本機有資料時參賽者頁顯示匯入提示", async ({ page, browser }) => {
		// 本機沒有資料時：本機 hook 掛載會寫出只含空陣列的容器，那不算可匯入的資料，不得顯示提示
		await page.goto(PLAYERS_PAGE);
		await expect(page.locator(SYNCED)).toBeVisible();
		await expect(page.getByText("目前還沒有參賽者")).toBeVisible();
		await expect(page.getByTestId("local-import-notice")).toHaveCount(0);

		await seedLocal(page, {
			[ROSTER_KEY]: JSON.stringify({ version: 1, players: [buildPlayer("lp1", LOCAL_NAME_A)] }),
		});
		await page.reload();
		await expect(page.locator(SYNCED)).toBeVisible();
		const notice = page.getByTestId("local-import-notice");
		await expect(notice).toBeVisible();
		await expect(notice.getByRole("link")).toHaveAttribute("href", "/matchmaker/data#local-import");
		// 連結指向資料頁上實際存在的匯入區塊
		await notice.getByRole("link").click();
		await expect(page).toHaveURL(/\/matchmaker\/data#local-import$/);
		await expect(page.locator("#local-import")).toBeVisible();

		await page.goto(DATA_PAGE);
		await expect(importButton(page)).toBeVisible();
		await importButton(page).click();
		await expect(page.getByTestId("local-import-message")).toContainText("已匯入 1 位參賽者");

		await page.goto(PLAYERS_PAGE);
		await expect(page.locator(SYNCED)).toBeVisible();
		await expect(page.getByText(LOCAL_NAME_A, { exact: true })).toBeVisible();
		await expect(page.getByTestId("local-import-notice")).toHaveCount(0);

		// 訪客（本機模式）即使名單為空、本機有可匯入的資料也不顯示：匯入只服務已登入的帳號
		const guestContext = await browser.newContext({ storageState: { cookies: [], origins: [] } });
		try {
			const guestPage = await guestContext.newPage();
			await guestPage.goto(NEUTRAL_PAGE);
			await seedLocal(guestPage, {
				[HISTORY_KEY]: JSON.stringify({
					version: 1,
					entries: [buildHistoryEntry("lh1", LOCAL_NAME_A, LOCAL_NAME_B)],
				}),
			});
			const sessionResponse = guestPage.waitForResponse((response) => response.url().endsWith("/api/session"));
			await guestPage.goto(PLAYERS_PAGE);
			await sessionResponse;
			await expect(guestPage.getByText("目前還沒有參賽者")).toBeVisible();
			await expect(guestPage.getByTestId("local-import-notice")).toHaveCount(0);
		} finally {
			await guestContext.close();
		}
	});

	test("本機沒有資料時匯入區塊不提供匯入按鈕", async ({ page }) => {
		await page.goto(DATA_PAGE);
		await expect(page.getByText(EMPTY_TEXT)).toBeVisible();
		await expect(importButton(page)).toHaveCount(0);

		// 資料量超過單次匯入上限時同樣不提供按鈕：單一姓名 70 萬個中文字約 2.1MB（UTF-8）
		await seedLocal(page, {
			[ROSTER_KEY]: JSON.stringify({
				version: 1,
				players: [buildPlayer("big", "大".repeat(700_000))],
			}),
		});
		await page.reload();
		await expect(page.getByText(OVERSIZE_TEXT)).toBeVisible();
		await expect(page.getByText(EMPTY_TEXT)).toHaveCount(0);
		await expect(importButton(page)).toHaveCount(0);
	});
});
