import { existsSync, readFileSync } from "node:fs";
import { test, expect, type Browser, type Page, type Response } from "@playwright/test";
import { ROSTER_CSV_HEADERS } from "@/lib/matchmaker/roster-csv";
import { AUTH_SKIP_REASON, storageStatePath } from "../helpers/storage-state";
import { clearTestAccountUserData } from "../helpers/user-data";

// 登入後的 matchmaker 名單以雲端為準。所有等待都以 data-sync-status 或 response 為依據，
// 不用固定延遲：已登入者在 /api/session 回應前會先看到本機名單，必須等同步狀態再操作。

const ROSTER_KEY = "matchmaker:roster:v1";
const PLAYERS_PAGE = "/matchmaker/players";
const MATCHMAKER_PAGE = "/matchmaker";
const DATA_PAGE = "/matchmaker/data";
const PLAYERS_API = "/api/matchmaker/players";
const SYNCED = '[data-sync-status="synced"]';
const CONFLICT = '[data-sync-status="conflict"]';
const LOAD_FAILED = '[data-sync-status="load-failed"]';
const JSON_RESTORE_DISABLED_TEXT =
	"登入時暫不支援從 JSON 備份還原，請登出後還原，或使用之後提供的匯入本機資料功能";

test.use({ storageState: storageStatePath });
test.skip(() => !existsSync(storageStatePath), AUTH_SKIP_REASON);

test.beforeEach(() => {
	clearTestAccountUserData();
});

interface PlayerFixtureOptions {
	id: string;
	name: string;
	rating?: number;
}

function buildPlayer(options: PlayerFixtureOptions) {
	return {
		id: options.id,
		name: options.name,
		gender: "other" as const,
		colorFrom: "#4f46e5",
		colorTo: "#818cf8",
		rating: options.rating ?? 3,
		restCount: 0,
		gamesPlayed: 0,
		isActive: true,
		createdAt: "2026-01-01T00:00:00.000Z",
	};
}

// 準備雲端資料走 API 而非 UI：比逐一開 Dialog 快且穩，也讓「頁面如何呈現」與「資料如何進去」分開驗證。
// page.request 與頁面共用同一份 storage state 的 cookie，等同已登入的同一位使用者。
async function seedCloudPlayers(page: Page, players: ReturnType<typeof buildPlayer>[]) {
	for (const player of players) {
		const response = await page.request.put(`${PLAYERS_API}/${player.id}`, {
			data: { data: player, version: 0 },
		});
		expect(response.ok(), `種入雲端參賽者 ${player.id} 失敗：${response.status()}`).toBe(true);
	}
}

async function addPlayerViaDialog(page: Page, name: string) {
	await page.getByRole("button", { name: "新增參賽者", exact: true }).click();
	const dialog = page.getByRole("dialog", { name: "新增參賽者" });
	await expect(dialog).toBeVisible();
	await dialog.getByLabel("姓名").fill(name);
	await dialog.getByRole("button", { name: "新增參賽者", exact: true }).click();
	await expect(dialog).toBeHidden();
}

function isPlayerPut(response: Response) {
	return response.url().includes(`${PLAYERS_API}/`) && response.request().method() === "PUT";
}

// 改名並等到該次 PUT 完成；先等 PUT 再由呼叫端等 synced，避免在 saving 之前讀到舊的 synced
async function renameFirstPlayer(page: Page, newName: string) {
	await page.getByRole("button", { name: "編輯" }).click();
	const dialog = page.getByRole("dialog", { name: "編輯參賽者" });
	await expect(dialog).toBeVisible();
	await dialog.getByLabel("姓名").fill(newName);
	await dialog.getByRole("button", { name: "儲存變更" }).click();
	await expect(dialog).toBeHidden();
}

async function readLocalRoster(page: Page) {
	return page.evaluate((key) => window.localStorage.getItem(key), ROSTER_KEY);
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

function buildRosterCsv(rows: readonly { name: string; gender: string; rating: string }[]): string {
	const header = [
		ROSTER_CSV_HEADERS.name,
		ROSTER_CSV_HEADERS.gender,
		ROSTER_CSV_HEADERS.rating,
		ROSTER_CSV_HEADERS.colorFrom,
		ROSTER_CSV_HEADERS.colorTo,
	].join(",");
	return [header, ...rows.map((row) => `${row.name},${row.gender},${row.rating},,`)].join("\n");
}

test.describe("matchmaker 名單雲端同步", () => {
	test("登入後新增的參賽者在重新整理後由雲端還原且不寫入本機", async ({ page }) => {
		await page.goto(PLAYERS_PAGE);
		await expect(page.locator(SYNCED)).toBeVisible();

		for (const name of ["雲端甲", "雲端乙"]) {
			await Promise.all([
				page.waitForResponse((response) => isPlayerPut(response) && response.ok()),
				addPlayerViaDialog(page, name),
			]);
			await expect(page.locator(SYNCED)).toBeVisible();
		}

		await page.reload();
		await expect(page.locator(SYNCED)).toBeVisible();
		await expect(page.getByText("雲端甲", { exact: true })).toBeVisible();
		await expect(page.getByText("雲端乙", { exact: true })).toBeVisible();
		expect(await readLocalRoster(page)).toBeNull();
	});

	test("另一個瀏覽器 context 看到相同名單", async ({ page, browser }) => {
		await page.goto(PLAYERS_PAGE);
		await expect(page.locator(SYNCED)).toBeVisible();
		for (const name of ["雲端甲", "雲端乙"]) {
			await Promise.all([
				page.waitForResponse((response) => isPlayerPut(response) && response.ok()),
				addPlayerViaDialog(page, name),
			]);
			await expect(page.locator(SYNCED)).toBeVisible();
		}

		await withSecondContext(browser, async (pageB) => {
			await pageB.goto(PLAYERS_PAGE);
			await expect(pageB.locator(SYNCED)).toBeVisible();
			await expect(pageB.getByText("雲端甲", { exact: true })).toBeVisible();
			await expect(pageB.getByText("雲端乙", { exact: true })).toBeVisible();
		});
	});

	test("另一裝置先編輯同一位參賽者時顯示衝突提示並載入最新名單", async ({ page, browser }) => {
		await page.goto(MATCHMAKER_PAGE);
		await seedCloudPlayers(page, [buildPlayer({ id: "p1", name: "原始名字" })]);

		await withSecondContext(browser, async (pageB) => {
			await page.goto(PLAYERS_PAGE);
			await pageB.goto(PLAYERS_PAGE);
			await expect(page.locator(SYNCED)).toBeVisible();
			await expect(pageB.locator(SYNCED)).toBeVisible();
			await expect(pageB.getByText("原始名字", { exact: true })).toBeVisible();

			await Promise.all([
				page.waitForResponse((response) => isPlayerPut(response) && response.ok()),
				renameFirstPlayer(page, "A裝置改的名字"),
			]);
			await expect(page.locator(SYNCED)).toBeVisible();

			// B 仍持有舊版本，送出會得到 409 並重新載入雲端
			await renameFirstPlayer(pageB, "B裝置改的名字");
			await expect(pageB.getByText("資料已在其他裝置更新，已重新載入最新資料")).toBeVisible();
			await expect(pageB.locator(CONFLICT)).toBeVisible();
			await expect(pageB.getByText("A裝置改的名字", { exact: true })).toBeVisible();
			await expect(pageB.getByText("B裝置改的名字", { exact: true })).toHaveCount(0);
		});
	});

	test("刪除參賽者後重新整理不再出現", async ({ page }) => {
		await page.goto(MATCHMAKER_PAGE);
		await seedCloudPlayers(page, [
			buildPlayer({ id: "keep", name: "保留的人" }),
			buildPlayer({ id: "drop", name: "要刪的人" }),
		]);

		await page.goto(PLAYERS_PAGE);
		await expect(page.locator(SYNCED)).toBeVisible();
		await expect(page.getByText("要刪的人", { exact: true })).toBeVisible();

		const card = page.locator('[data-slot="card"]').filter({ hasText: "要刪的人" });
		await card.getByRole("button", { name: "刪除" }).click();
		await Promise.all([
			page.waitForResponse(
				(response) => response.request().method() === "DELETE" && response.ok(),
			),
			page.getByRole("button", { name: "確定刪除" }).click(),
		]);
		await expect(page.locator(SYNCED)).toBeVisible();

		await page.reload();
		await expect(page.locator(SYNCED)).toBeVisible();
		await expect(page.getByText("保留的人", { exact: true })).toBeVisible();
		await expect(page.getByText("要刪的人", { exact: true })).toHaveCount(0);
	});

	test("登入時送出比分後評分寫入雲端名單", async ({ page }) => {
		const names = ["強度甲", "強度乙", "強度丙", "強度丁"];
		await page.goto(MATCHMAKER_PAGE);
		await seedCloudPlayers(
			page,
			names.map((name, index) => buildPlayer({ id: `r${index}`, name, rating: 3 })),
		);

		await page.goto(PLAYERS_PAGE);
		await expect(page.locator(SYNCED)).toBeVisible();
		const before = await readRatings(page, names);

		await page.goto(MATCHMAKER_PAGE);
		await expect(page.locator(SYNCED)).toBeVisible();
		await page.getByRole("button", { name: "產生本輪對戰" }).click();
		await expect(page.getByLabel("第一隊比分").first()).toBeVisible();

		// 四位參賽者可能排成一場雙打或兩場單打；逐場送出，等每次評分寫入的 PUT 完成
		const matchCount = await page.getByLabel("第一隊比分").count();
		for (let i = 0; i < matchCount; i++) {
			const court = page.locator('[data-testid^="court-card-"]').nth(i);
			await court.getByLabel("第一隊比分").fill("11");
			await court.getByLabel("第二隊比分").fill("5");
			const puts = page.waitForResponse((response) => isPlayerPut(response) && response.ok());
			await court.getByRole("button", { name: "送出比分" }).click();
			await puts;
			await expect(page.locator(SYNCED)).toBeVisible();
		}

		await page.goto(PLAYERS_PAGE);
		await expect(page.locator(SYNCED)).toBeVisible();
		const after = await readRatings(page, names);
		const higher = names.filter((name) => after[name] > before[name]);
		const lower = names.filter((name) => after[name] < before[name]);
		expect(higher, `升分者：${JSON.stringify({ before, after })}`).toHaveLength(2);
		expect(lower, `降分者：${JSON.stringify({ before, after })}`).toHaveLength(2);
	});

	test("雲端名單載入失敗時參賽者頁顯示錯誤提示", async ({ page }) => {
		await page.route(`**${PLAYERS_API}`, async (route) => {
			if (route.request().method() === "GET") {
				await route.fulfill({ status: 500, body: "" });
				return;
			}
			await route.continue();
		});

		await page.goto(PLAYERS_PAGE);
		await expect(page.getByText("無法載入雲端資料，請重新整理頁面")).toBeVisible();
		await expect(page.locator(LOAD_FAILED)).toBeVisible();
		await expect(page.getByRole("button", { name: "新增參賽者" })).toHaveCount(0);
	});

	test("登入時重置名單清空雲端名單並保留本機訪客名單", async ({ page }) => {
		await page.goto(MATCHMAKER_PAGE);
		await seedCloudPlayers(page, [
			buildPlayer({ id: "c1", name: "雲端一號" }),
			buildPlayer({ id: "c2", name: "雲端二號" }),
		]);
		// 準備本機訪客名單；寫入後 reload 一次，讓本機 hook 的 hydrate 把它正規化，
		// 之後讀到的值才是「重置前的基準」
		await page.evaluate(
			({ key, value }) => window.localStorage.setItem(key, value),
			{
				key: ROSTER_KEY,
				value: JSON.stringify({
					version: 1,
					players: [buildPlayer({ id: "guest-1", name: "訪客一號" })],
				}),
			},
		);

		await page.goto(PLAYERS_PAGE);
		await expect(page.locator(SYNCED)).toBeVisible();
		await expect(page.getByText("雲端一號", { exact: true })).toBeVisible();
		const baseline = await readLocalRoster(page);
		expect(baseline).not.toBeNull();

		await page.getByRole("button", { name: "重置名單" }).click();
		const alert = page.getByRole("alertdialog", { name: "重置參賽者名單" });
		await Promise.all([
			page.waitForResponse(
				(response) =>
					response.url().endsWith("/api/matchmaker/reset") && response.ok(),
			),
			alert.getByRole("button", { name: "確定重置" }).click(),
		]);
		await expect(page.locator(SYNCED)).toBeVisible();

		await page.reload();
		await expect(page.locator(SYNCED)).toBeVisible();
		await expect(page.getByText("目前還沒有參賽者")).toBeVisible();
		expect(await readLocalRoster(page)).toBe(baseline);
	});

	test("登入時 CSV 匯入的參賽者寫入雲端", async ({ page }) => {
		await page.goto(DATA_PAGE);
		// 雲端模式才會出現這段說明；等它出現，確保 session 已解析、元件走雲端分支
		await expect(page.getByText(JSON_RESTORE_DISABLED_TEXT)).toBeVisible();

		await page.getByTestId("roster-csv-import-input").setInputFiles({
			name: "roster.csv",
			mimeType: "text/csv",
			buffer: Buffer.from(
				buildRosterCsv([
					{ name: "CSV雲端一", gender: "男", rating: "3.50" },
					{ name: "CSV雲端二", gender: "女", rating: "4.20" },
				]),
				"utf-8",
			),
		});
		await expect(page.getByTestId("roster-csv-preview")).toBeVisible();

		await Promise.all([
			page.waitForResponse(
				(response) =>
					response.url().endsWith(`${PLAYERS_API}/import`) &&
					response.request().method() === "POST" &&
					response.ok(),
			),
			page.getByRole("button", { name: "確認匯入" }).click(),
		]);

		await page.goto(PLAYERS_PAGE);
		await expect(page.locator(SYNCED)).toBeVisible();
		await expect(page.getByText("CSV雲端一", { exact: true })).toBeVisible();
		await expect(page.getByText("CSV雲端二", { exact: true })).toBeVisible();
		expect(await readLocalRoster(page)).toBeNull();
	});

	test("登入時 JSON 匯出的參賽者來自雲端", async ({ page }) => {
		await page.goto(MATCHMAKER_PAGE);
		const cloudPlayers = [
			buildPlayer({ id: "cloud-1", name: "雲端匯出一" }),
			buildPlayer({ id: "cloud-2", name: "雲端匯出二" }),
		];
		await seedCloudPlayers(page, cloudPlayers);
		await page.evaluate(
			({ key, value }) => window.localStorage.setItem(key, value),
			{
				key: ROSTER_KEY,
				value: JSON.stringify({
					version: 1,
					players: [buildPlayer({ id: "guest-1", name: "不同的訪客" })],
				}),
			},
		);

		await page.goto(DATA_PAGE);
		await expect(page.getByText(JSON_RESTORE_DISABLED_TEXT)).toBeVisible();

		const [download] = await Promise.all([
			page.waitForEvent("download"),
			page.getByRole("button", { name: "匯出 JSON" }).click(),
		]);
		const downloadPath = await download.path();
		expect(downloadPath).not.toBeNull();
		const content = JSON.parse(readFileSync(downloadPath as string, "utf-8")) as {
			players: { id: string; name: string }[];
		};
		expect(content.players.map((player) => player.name).sort()).toEqual([
			"雲端匯出一",
			"雲端匯出二",
		]);
	});

	test("登入時 JSON 還原停用並顯示說明", async ({ page }) => {
		await page.goto(DATA_PAGE);
		await expect(page.getByText(JSON_RESTORE_DISABLED_TEXT)).toBeVisible();
		await expect(page.getByTestId("json-backup-import-input")).toHaveCount(0);
		await expect(page.getByText("選擇備份檔…")).toHaveCount(0);
	});
});
