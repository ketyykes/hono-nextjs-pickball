import { existsSync } from "node:fs";
import {
	test,
	expect,
	type APIRequestContext,
	type Browser,
	type Page,
	type Response,
} from "@playwright/test";
import { EXPECTED_USER_ID_HEADER } from "@pickball/core/api/headers";
import { AUTH_SKIP_REASON, storageStatePath } from "../helpers/storage-state";
import { readSwitchAccount, signInAsSwitchAccount } from "../helpers/test-account";
import { clearTestAccountUserData, expectedUserHeaders } from "../helpers/user-data";

// 以 A 的 storage state 開頁並同步完成後，在同一 context 以衍生帳號 B 登入（cookie 被覆寫，
// 等同另一分頁換帳號）。之後本分頁的寫入必須被後端以 401 拒絕。
// 所有等待都以 data-sync-status 或 response 為依據，不用固定延遲。

const SCOREBOARD_PAGE = "/scoreboard";
const MATCHMAKER_PAGE = "/matchmaker";
const PLAYERS_PAGE = "/matchmaker/players";
const SCOREBOARD_API = "/api/scoreboard/current";
const PLAYERS_API = "/api/matchmaker/players";
const ROUND_API = "/api/matchmaker/round";
const SLOTS_API = "/api/matchmaker/slots";
const SYNCED = '[data-sync-status="synced"]';
const COURT_GRIDS = '[data-testid="match-stage-courts"] [data-testid$="-grid"]';
// 帳號切換後 session refresh 與重新載入要走完整的網路往返
const REFRESH_TIMEOUT = 15_000;

test.use({ storageState: storageStatePath });
test.skip(() => !existsSync(storageStatePath), AUTH_SKIP_REASON);

test.beforeEach(() => {
	clearTestAccountUserData();
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

// 以 request 目前的 session 寫入名單；呼叫端決定這個 request 當下是 A 還是 B
async function seedPlayers(request: APIRequestContext, players: ReturnType<typeof buildPlayer>[]) {
	const headers = await expectedUserHeaders(request);
	for (const player of players) {
		const response = await request.put(`${PLAYERS_API}/${player.id}`, {
			data: { data: player, version: 0 },
			headers,
		});
		expect(response.ok(), `種入參賽者 ${player.id} 失敗：${response.status()}`).toBe(true);
	}
}

async function getJson(request: APIRequestContext, path: string): Promise<unknown> {
	const response = await request.get(path, { headers: await expectedUserHeaders(request) });
	expect(response.ok(), `GET ${path} 失敗：${response.status()}`).toBe(true);
	return response.json();
}

async function playerIds(request: APIRequestContext): Promise<string[]> {
	const body = (await getJson(request, PLAYERS_API)) as { items: { data: { id: string } }[] };
	return body.items.map((item) => item.data.id).sort();
}

// 另開一個仍是 A 的 context 讀取 A 的雲端資料，用來證明 A 沒有被動到
async function withAccountA(browser: Browser, run: (pageA: Page) => Promise<void>) {
	const contextA = await browser.newContext({ storageState: storageStatePath });
	try {
		await run(await contextA.newPage());
	} finally {
		await contextA.close();
	}
}

function isScoreboardPut(response: Response) {
	return response.url().endsWith(SCOREBOARD_API) && response.request().method() === "PUT";
}

function isPlayerPut(response: Response) {
	return response.url().includes(`${PLAYERS_API}/`) && response.request().method() === "PUT";
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

// 得分一次並等該次 PUT 成功；先等 PUT 再等 synced，避免讀到送出前的舊 synced
async function scoreAndSync(page: Page) {
	await Promise.all([
		page.waitForResponse((response) => isScoreboardPut(response) && response.ok()),
		page.getByRole("button", { name: /我方贏這一球/ }).click(),
	]);
	await expect(page.locator(SYNCED)).toBeVisible();
}

// 以 A 開啟 /matchmaker，等雲端載入後產生一輪（1 場地單打），並等回合 PUT 完成
async function generateRoundAsA(page: Page) {
	await seedPlayers(page.request, [1, 2, 3, 4].map((index) => buildPlayer(`sw${index}`, `換帳號測試員${index}`)));
	await page.goto(MATCHMAKER_PAGE);
	await expect(page.locator(SYNCED)).toBeVisible();
	await Promise.all([
		page.waitForResponse((response) => isRoundPut(response) && response.ok()),
		page.getByRole("button", { name: "產生本輪對戰" }).click(),
	]);
	await expect(page.locator(COURT_GRIDS)).toHaveCount(1);
	await expect(page.locator(SYNCED)).toBeVisible();
}

async function courtMatchId(page: Page): Promise<string> {
	const testId = await page.locator(COURT_GRIDS).first().getAttribute("data-testid");
	const match = /^court-(.*)-grid$/.exec(testId ?? "");
	if (!match) {
		throw new Error(`無法從 data-testid 解析 matchId：${String(testId)}`);
	}
	return match[1];
}

test.describe("另一分頁換帳號時本分頁不寫入新帳號", () => {
	test("另一分頁換成帳號 B 後，本分頁的計分不會寫入 B 且改以 B 的資料重新載入", async ({
		page,
		browser,
	}) => {
		const accountB = readSwitchAccount();
		await page.goto(SCOREBOARD_PAGE);
		await expect(page.locator(SYNCED)).toBeVisible();

		await signInAsSwitchAccount(page.context());
		// 前置斷言：beforeEach 清空涵蓋衍生帳號，B 一開始是初始計分板
		expect(await getJson(page.request, SCOREBOARD_API)).toEqual({ data: null, version: 0 });

		// 另開 context 以 B 的身分把 B 的計分板寫為 2:0
		const contextB = await browser.newContext();
		try {
			await signInAsSwitchAccount(contextB);
			const pageB = await contextB.newPage();
			await pageB.goto(SCOREBOARD_PAGE);
			await expect(pageB.locator(SYNCED)).toBeVisible();
			await scoreAndSync(pageB);
			await scoreAndSync(pageB);
		} finally {
			await contextB.close();
		}
		const boardBBefore = (await getJson(page.request, SCOREBOARD_API)) as { version: number };
		expect(boardBBefore.version).toBeGreaterThan(0);

		const [response] = await Promise.all([
			page.waitForResponse(isScoreboardPut),
			page.getByRole("button", { name: /我方贏這一球/ }).click(),
		]);
		expect(response.status()).toBe(401);

		await expect(page.getByLabel(/我方目前 2 分/)).toBeVisible({ timeout: REFRESH_TIMEOUT });
		await expect(page.getByTitle(`已登入：${accountB.name}`)).toBeVisible({ timeout: REFRESH_TIMEOUT });
		expect(await getJson(page.request, SCOREBOARD_API)).toEqual(boardBBefore);

		await withAccountA(browser, async (pageA) => {
			expect(await getJson(pageA.request, SCOREBOARD_API)).toEqual({ data: null, version: 0 });
		});
	});

	test("另一分頁換成帳號 B 後，本分頁新增的參賽者不會寫入 B 的名單", async ({ page, browser }) => {
		const accountB = readSwitchAccount();
		await page.goto(PLAYERS_PAGE);
		await expect(page.locator(SYNCED)).toBeVisible();

		await signInAsSwitchAccount(page.context());
		await seedPlayers(page.request, [buildPlayer("b1", "帳號B參賽者")]);

		await page.getByRole("button", { name: "新增參賽者", exact: true }).click();
		const dialog = page.getByRole("dialog", { name: "新增參賽者" });
		await expect(dialog).toBeVisible();
		await dialog.getByLabel("姓名").fill("本分頁新增者");
		await dialog.getByRole("button", { name: "新手 1.00" }).click();
		const [response] = await Promise.all([
			page.waitForResponse(isPlayerPut),
			dialog.getByRole("button", { name: "新增參賽者", exact: true }).click(),
		]);
		expect(response.status()).toBe(401);

		await expect(page.getByTitle(`已登入：${accountB.name}`)).toBeVisible({ timeout: REFRESH_TIMEOUT });
		await expect(page.getByText("帳號B參賽者", { exact: true })).toBeVisible({ timeout: REFRESH_TIMEOUT });
		expect(await playerIds(page.request)).toEqual(["b1"]);
		await withAccountA(browser, async (pageA) => {
			expect(await playerIds(pageA.request)).toEqual([]);
		});
	});

	test("另一分頁換成帳號 B 後，本分頁的重置不會刪除 B 的資料", async ({ page, browser }) => {
		await seedPlayers(page.request, [buildPlayer("a1", "帳號A參賽者")]);
		await page.goto(PLAYERS_PAGE);
		await expect(page.locator(SYNCED)).toBeVisible();
		await expect(page.getByText("帳號A參賽者", { exact: true })).toBeVisible();

		await signInAsSwitchAccount(page.context());
		await seedPlayers(page.request, [buildPlayer("b1", "帳號B參賽者")]);

		await page.getByRole("button", { name: "重置名單" }).click();
		const alert = page.getByRole("alertdialog", { name: "重置參賽者名單" });
		const [response] = await Promise.all([
			page.waitForResponse(
				(candidate) => candidate.url().endsWith("/api/matchmaker/reset") && candidate.request().method() === "POST",
			),
			alert.getByRole("button", { name: "確定重置" }).click(),
		]);
		expect(response.status()).toBe(401);

		expect(await playerIds(page.request)).toEqual(["b1"]);
		await withAccountA(browser, async (pageA) => {
			expect(await playerIds(pageA.request)).toEqual(["a1"]);
		});
	});

	test("另一分頁換成帳號 B 後，本分頁產生的對戰不會寫入 B 的回合", async ({ page, browser }) => {
		await seedPlayers(page.request, [1, 2, 3, 4].map((index) => buildPlayer(`sw${index}`, `換帳號測試員${index}`)));
		await page.goto(MATCHMAKER_PAGE);
		await expect(page.locator(SYNCED)).toBeVisible();

		await signInAsSwitchAccount(page.context());

		const [response] = await Promise.all([
			page.waitForResponse(isRoundPut),
			page.getByRole("button", { name: "產生本輪對戰" }).click(),
		]);
		expect(response.status()).toBe(401);

		expect(await getJson(page.request, ROUND_API)).toEqual({ data: null, version: 0 });
		await withAccountA(browser, async (pageA) => {
			expect(await getJson(pageA.request, ROUND_API)).toEqual({ data: null, version: 0 });
		});
	});

	// 紅燈性質：守衛不存在時，B 沒有 A 的回合，送出比分會因場次不符回 409，
	// 資料本來就不會被寫入，所以此條的紅燈只來自狀態碼（預期 401、實得 409）。
	// 真正的資料毀損面由後端列舉測試守住；此條驗證前端走 401 → refresh 的路徑。
	test("另一分頁換成帳號 B 後，本分頁送出比分不會寫入 B 的回合與歷史", async ({ page, browser }) => {
		await generateRoundAsA(page);
		const matchId = await courtMatchId(page);
		const roundA = await getJson(page.request, ROUND_API);

		await signInAsSwitchAccount(page.context());

		const court = page.getByTestId(`court-${matchId}`);
		await court.getByLabel("第一隊比分").fill("11");
		await court.getByLabel("第二隊比分").fill("5");
		const [response] = await Promise.all([
			page.waitForResponse(isScorePost),
			court.getByRole("button", { name: "送出比分" }).click(),
		]);
		expect(response.status()).toBe(401);

		expect(await getJson(page.request, ROUND_API)).toEqual({ data: null, version: 0 });
		expect(await playerIds(page.request)).toEqual([]);
		await withAccountA(browser, async (pageA) => {
			expect(await getJson(pageA.request, ROUND_API)).toEqual(roundA);
			await pageA.goto(MATCHMAKER_PAGE);
			await expect(pageA.locator(SYNCED)).toBeVisible();
			await expect(
				pageA.getByTestId(`court-${matchId}`).getByRole("link", { name: "進入計分板" }),
			).toBeVisible();
		});
	});

	test("另一分頁換成帳號 B 後，本分頁進入計分板不會在 B 建立分槽", async ({ page }) => {
		const accountB = readSwitchAccount();
		await generateRoundAsA(page);
		const matchId = await courtMatchId(page);

		await signInAsSwitchAccount(page.context());

		const [response] = await Promise.all([
			page.waitForResponse(isSlotPut),
			page.getByTestId(`court-${matchId}`).getByRole("link", { name: "進入計分板" }).click(),
		]);
		expect(response.status()).toBe(401);

		await expect(page.getByText("無法建立計分板，請稍後再試")).toBeVisible();
		await expect(page).toHaveURL(/\/matchmaker$/);
		await expect(page.getByTitle(`已登入：${accountB.name}`)).toBeVisible({ timeout: REFRESH_TIMEOUT });
		expect(await getJson(page.request, SLOTS_API)).toEqual({ items: [] });
	});

	test("使用者資料請求經前端 proxy 帶上目前帳號的標頭", async ({ page }) => {
		const [response] = await Promise.all([
			page.waitForResponse(
				(candidate) => candidate.url().endsWith(SCOREBOARD_API) && candidate.request().method() === "GET",
			),
			page.goto(SCOREBOARD_PAGE),
		]);
		const sentHeaders = await response.request().allHeaders();
		const sessionHeaders = await expectedUserHeaders(page.request);

		expect(sentHeaders[EXPECTED_USER_ID_HEADER.toLowerCase()]).toBe(sessionHeaders[EXPECTED_USER_ID_HEADER]);
		expect(response.status()).toBe(200);
	});
});
