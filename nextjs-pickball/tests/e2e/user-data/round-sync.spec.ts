import { existsSync } from "node:fs";
import { test, expect, type Browser, type Page, type Response } from "@playwright/test";
import { AUTH_SKIP_REASON, storageStatePath } from "../helpers/storage-state";
import { clearTestAccountUserData } from "../helpers/user-data";

// 登入後的對戰回合與場次分槽以雲端為準。所有等待都以 data-sync-status 或 response 為依據，
// 不用固定延遲：已登入者在 /api/session 回應前會先看到本機畫面，必須等同步狀態再操作。

const ROUND_KEY = "matchmaker:round:v1";
const MATCH_SLOTS_KEY = "scoreboard:matches:v1";
const MATCHMAKER_PAGE = "/matchmaker";
const PLAYERS_PAGE = "/matchmaker/players";
const PLAYERS_API = "/api/matchmaker/players";
const ROUND_API = "/api/matchmaker/round";
const SLOTS_API = "/api/matchmaker/slots";
const SYNCED = '[data-sync-status="synced"]';
const CONFLICT = '[data-sync-status="conflict"]';
const LOAD_FAILED = '[data-sync-status="load-failed"]';
const COURT_GRIDS = '[data-testid="match-stage-courts"] [data-testid$="-grid"]';

test.use({ storageState: storageStatePath });
test.skip(() => !existsSync(storageStatePath), AUTH_SKIP_REASON);

test.beforeEach(() => {
	clearTestAccountUserData();
});

function buildPlayer(index: number) {
	return {
		id: `rs${index}`,
		name: `回合測試員${index}`,
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

const PLAYER_NAMES = [1, 2, 3, 4].map((index) => buildPlayer(index).name);

// 準備雲端名單走 API 而非 UI：比逐一開 Dialog 快且穩。
// page.request 與頁面共用同一份 storage state 的 cookie，等同已登入的同一位使用者。
async function seedCloudPlayers(page: Page, count: number) {
	for (let index = 1; index <= count; index++) {
		const player = buildPlayer(index);
		const response = await page.request.put(`${PLAYERS_API}/${player.id}`, {
			data: { data: player, version: 0 },
		});
		expect(response.ok(), `種入雲端參賽者 ${player.id} 失敗：${response.status()}`).toBe(true);
	}
}

function isRoundPut(response: Response) {
	return response.url().endsWith(ROUND_API) && response.request().method() === "PUT";
}

function isSlotPut(response: Response) {
	return response.url().includes(`${SLOTS_API}/`) && response.request().method() === "PUT";
}

function isScorePost(response: Response) {
	return response.url().includes(`${ROUND_API}/matches/`) && response.request().method() === "POST";
}

// 開啟對戰頁、等雲端名單與回合載入完成後產生一輪（預設 1 場地單打），並等回合 PUT 完成
async function generateRound(page: Page) {
	await page.goto(MATCHMAKER_PAGE);
	await expect(page.locator(SYNCED)).toBeVisible();
	await Promise.all([
		page.waitForResponse((response) => isRoundPut(response) && response.ok()),
		page.getByRole("button", { name: "產生本輪對戰" }).click(),
	]);
	await expect(page.locator(COURT_GRIDS)).toHaveCount(1);
	await expect(page.locator(SYNCED)).toBeVisible();
}

// 從場地色塊既有的 data-testid（`court-${match.id}-grid`）反解析 matchId
async function courtMatchId(page: Page, courtIndex: number): Promise<string> {
	const testId = await page.locator(COURT_GRIDS).nth(courtIndex).getAttribute("data-testid");
	const match = /^court-(.*)-grid$/.exec(testId ?? "");
	if (!match) {
		throw new Error(`無法從 data-testid 解析 matchId：${String(testId)}`);
	}
	return match[1];
}

// 手動輸入比分並送出，等 POST 完成再等 synced
async function submitScoreManually(page: Page, matchId: string, scoreA: string, scoreB: string) {
	const court = page.getByTestId(`court-${matchId}`);
	await court.getByLabel("第一隊比分").fill(scoreA);
	await court.getByLabel("第二隊比分").fill(scoreB);
	await Promise.all([
		page.waitForResponse((response) => isScorePost(response)),
		court.getByRole("button", { name: "送出比分" }).click(),
	]);
}

// 從場地卡進入計分板：雲端模式導向前會先建立分槽，等 PUT 回應後才會換頁
async function enterScoreboard(page: Page, matchId: string) {
	await Promise.all([
		page.waitForResponse((response) => isSlotPut(response) && response.ok()),
		page.getByTestId(`court-${matchId}`).getByRole("link", { name: "進入計分板" }).click(),
	]);
	await expect(page).toHaveURL(new RegExp(`/scoreboard\\?match=${matchId}$`));
	await expect(page.locator(SYNCED)).toBeVisible();
}

// 我方得分並等該次分槽 PUT 完成；先等 PUT 再等 synced，避免讀到送出前的舊 synced
async function scoreUs(page: Page, times: number) {
	for (let i = 0; i < times; i++) {
		await Promise.all([
			page.waitForResponse((response) => isSlotPut(response) && response.ok()),
			page.getByRole("button", { name: /我方贏這一球/ }).click(),
		]);
		await expect(page.locator(SYNCED)).toBeVisible();
	}
}

async function readLocal(page: Page, key: string) {
	return page.evaluate((storageKey) => window.localStorage.getItem(storageKey), key);
}

async function readCourtsText(page: Page) {
	return page.getByTestId("match-stage-courts").innerText();
}

async function withSecondContext(browser: Browser, run: (pageB: Page) => Promise<void>) {
	const contextB = await browser.newContext({ storageState: storageStatePath });
	try {
		await run(await contextB.newPage());
	} finally {
		await contextB.close();
	}
}

// 從參賽者頁讀出「姓名 → 強度」，用來比對評分前後的變化
async function readRatings(page: Page, names: string[]) {
	const ratings: Record<string, number> = {};
	for (const name of names) {
		const card = page.locator('[data-slot="card"]').filter({ hasText: name });
		const text = await card.innerText();
		const match = /強度 (\d+\.\d+)/.exec(text);
		expect(match, `找不到 ${name} 的強度文字`).not.toBeNull();
		ratings[name] = Number(match?.[1]);
	}
	return ratings;
}

test.describe("matchmaker 對戰回合雲端同步", () => {
	test("登入後產生的回合在重新整理與另一個 context 中由雲端還原", async ({ page, browser }) => {
		await seedCloudPlayers(page, 4);
		await generateRound(page);
		const matchId = await courtMatchId(page, 0);
		const courtsText = await readCourtsText(page);

		await page.reload();
		await expect(page.locator(SYNCED)).toBeVisible();
		await expect(page.locator(COURT_GRIDS)).toHaveCount(1);
		expect(await courtMatchId(page, 0)).toBe(matchId);
		expect(await readCourtsText(page)).toBe(courtsText);
		expect(await readLocal(page, ROUND_KEY)).toBeNull();

		await withSecondContext(browser, async (pageB) => {
			await pageB.goto(MATCHMAKER_PAGE);
			await expect(pageB.locator(SYNCED)).toBeVisible();
			await expect(pageB.locator(COURT_GRIDS)).toHaveCount(1);
			expect(await courtMatchId(pageB, 0)).toBe(matchId);
			expect(await readCourtsText(pageB)).toBe(courtsText);
		});
	});

	test("登入時經計分板完成的場次由雲端寫入評分並清除分槽", async ({ page }) => {
		await seedCloudPlayers(page, 4);
		await page.goto(PLAYERS_PAGE);
		await expect(page.locator(SYNCED)).toBeVisible();
		const before = await readRatings(page, PLAYER_NAMES);

		await generateRound(page);
		const matchId = await courtMatchId(page, 0);
		await enterScoreboard(page, matchId);

		// 11 分制下我方連贏 11 球（side-out：對方全程未曾發球）後出現結束對話框
		await scoreUs(page, 11);
		await page.getByRole("button", { name: "關閉" }).click();
		// 本機分槽是訪客時期的資料：雲端模式的回填不得動它（分槽由後端送出比分的 batch 刪除）
		await page.evaluate(
			({ key, id }) => window.localStorage.setItem(key, JSON.stringify({ [id]: { sentinel: true } })),
			{ key: MATCH_SLOTS_KEY, id: matchId },
		);
		await Promise.all([
			page.waitForResponse((response) => isScorePost(response) && response.ok()),
			page.getByRole("link", { name: "返回對戰" }).click(),
		]);
		await expect(page).toHaveURL(/\/matchmaker$/);

		const court = page.getByTestId(`court-${matchId}`);
		await expect(court.getByTestId(`court-${matchId}-score`)).toHaveText("11:0");
		await expect(court.getByRole("link", { name: "進入計分板" })).toHaveCount(0);
		await expect(court.getByRole("link", { name: "繼續計分" })).toHaveCount(0);
		await expect(page.locator(SYNCED)).toBeVisible();

		expect(await readLocal(page, MATCH_SLOTS_KEY)).toContain("sentinel");

		const slotsResponse = await page.request.get(SLOTS_API);
		expect(slotsResponse.ok()).toBe(true);
		const slots = (await slotsResponse.json()) as { items: { id?: string }[] };
		expect(JSON.stringify(slots)).not.toContain(matchId);

		await page.goto(PLAYERS_PAGE);
		await expect(page.locator(SYNCED)).toBeVisible();
		const after = await readRatings(page, PLAYER_NAMES);
		const higher = PLAYER_NAMES.filter((name) => after[name] > before[name]);
		expect(higher, `升分者：${JSON.stringify({ before, after })}`).toHaveLength(1);
	});

	test("另一裝置先送出同一場比分時顯示衝突提示並載入最新回合", async ({ page, browser }) => {
		await seedCloudPlayers(page, 4);
		await generateRound(page);
		const matchId = await courtMatchId(page, 0);

		await withSecondContext(browser, async (pageB) => {
			await pageB.goto(MATCHMAKER_PAGE);
			await expect(pageB.locator(SYNCED)).toBeVisible();
			await expect(pageB.locator(COURT_GRIDS)).toHaveCount(1);

			// A 先送出 11:5 並等雲端寫入完成
			await submitScoreManually(page, matchId, "11", "5");
			await expect(page.getByTestId(`court-${matchId}-score`)).toHaveText("11:5");
			await expect(page.locator(SYNCED)).toBeVisible();

			// B 仍持有舊版本回合，送出不同比分會得到 409 並重新載入雲端
			await submitScoreManually(pageB, matchId, "3", "11");
			await expect(pageB.getByText("資料已在其他裝置更新，已重新載入最新資料")).toBeVisible();
			await expect(pageB.locator(CONFLICT)).toBeVisible();
			await expect(pageB.getByTestId(`court-${matchId}-score`)).toHaveText("11:5");
		});
	});

	test("雲端回合載入失敗時對戰頁顯示錯誤提示", async ({ page }) => {
		await page.route(`**${ROUND_API}`, async (route) => {
			if (route.request().method() === "GET") {
				await route.fulfill({ status: 500, body: "" });
				return;
			}
			await route.continue();
		});

		await page.goto(MATCHMAKER_PAGE);
		await expect(page.getByText("無法載入雲端資料，請重新整理頁面")).toBeVisible();
		await expect(page.locator(LOAD_FAILED)).toBeVisible();
		await expect(page.getByRole("button", { name: "產生本輪對戰" })).toHaveCount(0);
	});

	test("登入時重置名單後雲端回合與分槽一併清除", async ({ page }) => {
		await seedCloudPlayers(page, 4);
		await generateRound(page);
		const matchId = await courtMatchId(page, 0);
		await submitScoreManually(page, matchId, "11", "5");
		await expect(page.getByTestId(`court-${matchId}-score`)).toHaveText("11:5");
		await expect(page.locator(SYNCED)).toBeVisible();

		await page.goto(PLAYERS_PAGE);
		await expect(page.locator(SYNCED)).toBeVisible();
		await page.getByRole("button", { name: "重置名單" }).click();
		const alert = page.getByRole("alertdialog", { name: "重置參賽者名單" });
		await Promise.all([
			page.waitForResponse(
				(response) => response.url().endsWith("/api/matchmaker/reset") && response.ok(),
			),
			alert.getByRole("button", { name: "確定重置" }).click(),
		]);
		await expect(page.locator(SYNCED)).toBeVisible();

		await page.goto(MATCHMAKER_PAGE);
		await expect(page.locator(SYNCED)).toBeVisible();
		await expect(page.locator(COURT_GRIDS)).toHaveCount(0);
		await expect(page.getByRole("button", { name: "產生本輪對戰" })).toBeVisible();

		const roundResponse = await page.request.get(ROUND_API);
		expect(await roundResponse.json()).toEqual({ data: null, version: 0 });
		const slotsResponse = await page.request.get(SLOTS_API);
		expect(await slotsResponse.json()).toEqual({ items: [] });
	});

	test("登入時場次計分板的進度在重新整理後由雲端還原且不寫入本機", async ({ page }) => {
		await seedCloudPlayers(page, 4);
		await generateRound(page);
		const matchId = await courtMatchId(page, 0);
		await enterScoreboard(page, matchId);

		await scoreUs(page, 2);
		await expect(page.getByLabel(/我方目前 2 分/)).toBeVisible();

		await page.reload();
		await expect(page.locator(SYNCED)).toBeVisible();
		await expect(page.getByLabel(/我方目前 2 分/)).toBeVisible();
		expect(await readLocal(page, MATCH_SLOTS_KEY)).toBeNull();

		// 回到對戰頁：計分中的標示與目標分數鎖定都以雲端分槽為準
		await page.getByRole("link", { name: "返回對戰" }).click();
		await expect(page).toHaveURL(/\/matchmaker$/);
		await expect(page.locator(SYNCED)).toBeVisible();
		const court = page.getByTestId(`court-${matchId}`);
		await expect(court.getByText("計分中")).toBeVisible();
		await expect(court.getByText("2:0")).toBeVisible();
		await expect(page.getByText("本輪已開始計分，目標分數不可更改")).toBeVisible();
	});
});
