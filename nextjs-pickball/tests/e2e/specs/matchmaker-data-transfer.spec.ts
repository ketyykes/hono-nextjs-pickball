import { Buffer } from "node:buffer";
import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";

// /matchmaker/data 資料工具頁的 E2E 驗收（M8 §8）。
// §8.1 只涵蓋兩個入口驗收 test；§8.3 起補上 JSON／CSV 匯出入與清除本機資料的實際行為，
// 對應 delta spec `openspec/changes/matchmaker-data-transfer/specs/data-transfer/spec.md`
// 的各 Scenario。
//
// §8.1 的兩個 test 皆不讀寫 localStorage；§8.3 起新增的 test 會讀寫
// matchmaker:roster:v1／matchmaker:round:v1／matchmaker:history:v1，比照
// matchmaker-history.spec.ts／player-roster.spec.ts 的既有慣例，只清除本 capability
// 的 key，不使用 localStorage.clear()。

const MATCHMAKER_PAGE = "/matchmaker";
const DATA_PAGE = "/matchmaker/data";
const PLAYERS_PAGE = "/matchmaker/players";
const HISTORY_PAGE = "/matchmaker/history";

const ROSTER_STORAGE_KEY = "matchmaker:roster:v1";
const ROUND_STORAGE_KEY = "matchmaker:round:v1";
const HISTORY_STORAGE_KEY = "matchmaker:history:v1";

// 清除本 capability 三個 key（沿用 player-roster.spec.ts／matchmaker-history.spec.ts
// 的既有慣例：只清自己的 key，不用 localStorage.clear()）。
async function clearMatchmakerStorage(page: Page): Promise<void> {
	await page.goto("/");
	await page.evaluate((keys) => {
		for (const key of keys) {
			window.localStorage.removeItem(key);
		}
	}, [ROSTER_STORAGE_KEY, ROUND_STORAGE_KEY, HISTORY_STORAGE_KEY]);
}

// 種入名單：外層容器 MUST 是 { version: 1, players: [...] }（storage.ts 的
// writeRoster() 寫入形狀）。以 page.addInitScript 於頁面任何 script 執行前寫入
// （沿用 matchmaker-history.spec.ts 的 seedHistory 慣例）。
interface PlayerFixtureOptions {
	id: string;
	name: string;
	rating?: number;
}
function buildPlayerFixture(options: PlayerFixtureOptions) {
	return {
		id: options.id,
		name: options.name,
		gender: "other" as const,
		colorFrom: "#111111",
		colorTo: "#222222",
		rating: options.rating ?? 3.5,
		restCount: 0,
		gamesPlayed: 0,
		isActive: true,
		createdAt: "2026-01-01T00:00:00.000Z",
	};
}
// 刻意用 page.evaluate（一次性寫入）而非 page.addInitScript：本檔多個 test 會在
// 匯入確認後呼叫 location.reload()，addInitScript 的腳本會在每次 reload／導覽時
// 重新執行，把 reload 前才剛寫入的名單覆蓋回種子值——這與
// matchmaker-history.spec.ts「瀏覽與切換區間後…內容不變」test 選擇不用
// addInitScript 的理由相同（見該檔開頭的既有慣例說明）。呼叫端須確保 page
// 已導覽至同源頁面（clearMatchmakerStorage 已 goto("/")）。
async function seedRoster(page: Page, players: unknown[]): Promise<void> {
	await page.evaluate(
		(arg: { key: string; value: string }) => {
			window.localStorage.setItem(arg.key, arg.value);
		},
		{ key: ROSTER_STORAGE_KEY, value: JSON.stringify({ version: 1, players }) },
	);
}

// 一筆單打歷史紀錄 fixture：欄位形狀對應 MatchHistoryEntrySchema
// （lib/matchmaker/history.ts），供 JSON 備份匯入測試使用。
interface HistoryEntryFixtureOptions {
	matchId: string;
	teamAPlayer: { id: string; name: string };
	teamBPlayer: { id: string; name: string };
}
function buildHistoryEntryFixture(options: HistoryEntryFixtureOptions) {
	return {
		matchId: options.matchId,
		courtNumber: 1,
		// 歷史頁預設顯示「今日」區間（matchmaker-history.spec.ts 的既有行為），
		// 故 playedAt 必須是測試執行當下的「現在」，不可寫死絕對日期。
		playedAt: new Date().toISOString(),
		format: "singles" as const,
		teamA: {
			players: [{ ...options.teamAPlayer, ratingBefore: 3.5, ratingAfter: 3.6 }],
			rating: 3.5,
		},
		teamB: {
			players: [{ ...options.teamBPlayer, ratingBefore: 3.4, ratingAfter: 3.3 }],
			rating: 3.4,
		},
		scoreA: 11,
		scoreB: 5,
		winner: "teamA" as const,
	};
}

// 參賽者名單 CSV 匯入 fixture：欄位名稱對應 ROSTER_CSV_HEADERS
// （lib/matchmaker/roster-csv.ts），逐字沿用「名稱／性別／強度分數／顏色起點／顏色終點」，
// 不另抄一份不同拼法。顏色兩欄留空以測試自動配色路徑（非本測試重點，故不特別指定）。
function buildRosterCsv(rows: readonly { name: string; gender: string; rating: string }[]): string {
	const header = "名稱,性別,強度分數,顏色起點,顏色終點";
	const lines = rows.map((row) => `${row.name},${row.gender},${row.rating},,`);
	return [header, ...lines].join("\n");
}

test.describe("/matchmaker/data 資料工具頁", () => {
	test("可從 matchmaker 區段導覽抵達資料頁並看到四個功能區塊", async ({ page }) => {
		// 從 matchmaker 區段點擊導覽入口抵達，不是直接 goto——驗收的是「可從區段導覽抵達」
		// 這個導覽路徑本身（spec「從 matchmaker 區段導覽抵達資料頁」）。
		await page.goto(MATCHMAKER_PAGE);
		const nav = page.getByRole("navigation", { name: "對戰分配區段導覽" });
		await nav.getByRole("link", { name: "資料", exact: true }).click();

		await expect(page).toHaveURL(/\/matchmaker\/data$/);

		// 四個功能區塊的標題（overview.md UI Mockup 的固定版面）。
		await expect(page.getByRole("heading", { name: "JSON 完整備份" })).toBeVisible();
		await expect(page.getByRole("heading", { name: "歷史賽果 CSV 匯出" })).toBeVisible();
		await expect(page.getByRole("heading", { name: "參賽者名單 CSV 匯入" })).toBeVisible();
		await expect(page.getByRole("heading", { name: "清除本機資料" })).toBeVisible();
	});

	test("資料頁標示 CSV 匯出入不對稱且完整還原請用 JSON", async ({ page }) => {
		await page.goto(DATA_PAGE);

		// prd.md 9.3 前言的不對稱說明：CSV 匯出的是歷史賽果、匯入的是參賽者名單，
		// 兩者不構成 round-trip；且需同時指出完整還原請使用 JSON（spec「頁面標示 CSV
		// 匯出入不對稱」）。
		await expect(page.getByText("CSV 匯出的是歷史賽果", { exact: false })).toBeVisible();
		await expect(page.getByText("匯入的是參賽者名單", { exact: false })).toBeVisible();
		await expect(page.getByText("不構成 round-trip", { exact: false })).toBeVisible();
		await expect(page.getByText("完整還原請使用 JSON", { exact: false })).toBeVisible();
	});

	// §8.3／8.4：JSON 完整備份的匯入（spec「匯入成功後參賽者、回合與歷史一併還原」）。
	test("匯入合法 JSON 備份後參賽者與歷史一併還原", async ({ page }) => {
		await clearMatchmakerStorage(page);

		const matchId = "e2e-data-transfer-import-1";
		const backup = {
			version: 1,
			players: [buildPlayerFixture({ id: "p-import-1", name: "匯入還原員A" })],
			currentRound: null,
			history: [
				buildHistoryEntryFixture({
					matchId,
					teamAPlayer: { id: "p-import-1", name: "匯入還原員A" },
					teamBPlayer: { id: "p-import-2", name: "匯入還原員B" },
				}),
			],
		};

		await page.goto(DATA_PAGE);

		// 選檔後元件會依序 File.text() → parseBackup → writeBackup → location.reload()，
		// 用 waitForEvent("load") 等到 reload 完成，避免在寫入完成前就往下讀 localStorage。
		await Promise.all([
			page.waitForEvent("load"),
			page.getByTestId("json-backup-import-input").setInputFiles({
				name: "matchmaker-backup-test.json",
				mimeType: "application/json",
				buffer: Buffer.from(JSON.stringify(backup)),
			}),
		]);

		await page.goto(PLAYERS_PAGE);
		await expect(page.getByText("匯入還原員A", { exact: true })).toBeVisible();

		await page.goto(HISTORY_PAGE);
		await expect(page.getByTestId(`history-record-${matchId}`)).toBeVisible();
	});

	// §8.5／8.6：參賽者名單 CSV 匯入的預覽、取消與確認
	// （spec「於預覽取消時不寫入任何資料」／「確認預覽後名單新增匯入的參賽者」）。
	test("在 CSV 匯入預覽按取消後名單維持不變", async ({ page }) => {
		await clearMatchmakerStorage(page);
		await seedRoster(page, [buildPlayerFixture({ id: "p-csv-cancel-existing", name: "CSV取消既有員" })]);

		await page.goto(DATA_PAGE);

		const csv = buildRosterCsv([{ name: "CSV取消匯入員", gender: "男", rating: "3.50" }]);
		await page.getByTestId("roster-csv-import-input").setInputFiles({
			name: "roster.csv",
			mimeType: "text/csv",
			buffer: Buffer.from(csv),
		});

		await expect(page.getByText("可新增 1 人")).toBeVisible();
		await page.getByRole("button", { name: "取消" }).click();

		await page.goto(PLAYERS_PAGE);
		await expect(page.getByText("CSV取消既有員", { exact: true })).toBeVisible();
		await expect(page.getByText("CSV取消匯入員", { exact: true })).toHaveCount(0);
		await expect(page.getByText("共 1 位參賽者")).toBeVisible();
	});

	test("確認 CSV 匯入預覽後名單新增匯入的參賽者", async ({ page }) => {
		await clearMatchmakerStorage(page);
		await seedRoster(page, [buildPlayerFixture({ id: "p-csv-confirm-existing", name: "CSV確認既有員" })]);

		await page.goto(DATA_PAGE);

		const csv = buildRosterCsv([
			{ name: "CSV確認匯入員一", gender: "男", rating: "3.50" },
			{ name: "CSV確認匯入員二", gender: "女", rating: "4.20" },
		]);
		await page.getByTestId("roster-csv-import-input").setInputFiles({
			name: "roster.csv",
			mimeType: "text/csv",
			buffer: Buffer.from(csv),
		});

		await expect(page.getByText("可新增 2 人")).toBeVisible();

		await Promise.all([
			page.waitForEvent("load"),
			page.getByRole("button", { name: "確認匯入" }).click(),
		]);

		await page.goto(PLAYERS_PAGE);
		await expect(page.getByText("CSV確認既有員", { exact: true })).toBeVisible();
		await expect(page.getByText("CSV確認匯入員一", { exact: true })).toBeVisible();
		await expect(page.getByText("CSV確認匯入員二", { exact: true })).toBeVisible();
		await expect(page.getByText("共 3 位參賽者")).toBeVisible();
	});

	// §8.7／8.8：清除本機資料的二次確認（spec「清除本機資料與其確認流程」）。
	test("清除本機資料的確認提示載明無法復原、建議先匯出並說明備份不含計分進度", async ({ page }) => {
		await page.goto(DATA_PAGE);

		await page.getByRole("button", { name: "清除本機資料" }).click();
		const alert = page.getByRole("alertdialog", { name: "清除本機資料" });
		await expect(alert).toBeVisible();

		await expect(alert.getByText("無法復原", { exact: false })).toBeVisible();
		await expect(alert.getByText("建議先匯出 JSON 備份", { exact: false })).toBeVisible();
		await expect(
			alert.getByText("JSON 備份不包含 /scoreboard 進行中的逐球計分進度", { exact: false }),
		).toBeVisible();
	});

	test("取消清除本機資料後名單維持不變", async ({ page }) => {
		await clearMatchmakerStorage(page);
		await seedRoster(page, [buildPlayerFixture({ id: "p-clear-cancel", name: "清除取消員" })]);

		await page.goto(DATA_PAGE);

		await page.getByRole("button", { name: "清除本機資料" }).click();
		const alert = page.getByRole("alertdialog", { name: "清除本機資料" });
		await expect(alert).toBeVisible();
		await alert.getByRole("button", { name: "取消" }).click();
		await expect(alert).toBeHidden();

		await page.goto(PLAYERS_PAGE);
		await expect(page.getByText("清除取消員", { exact: true })).toBeVisible();
		await expect(page.getByText("共 1 位參賽者")).toBeVisible();
	});

	test("確認清除本機資料後參賽者頁回到空白狀態", async ({ page }) => {
		await clearMatchmakerStorage(page);
		await seedRoster(page, [buildPlayerFixture({ id: "p-clear-confirm", name: "清除確認員" })]);

		await page.goto(DATA_PAGE);

		await page.getByRole("button", { name: "清除本機資料" }).click();
		const alert = page.getByRole("alertdialog", { name: "清除本機資料" });
		await expect(alert).toBeVisible();
		await alert.getByRole("button", { name: "確定清除" }).click();
		await expect(alert).toBeHidden();

		await page.goto(PLAYERS_PAGE);
		await expect(page.getByText("目前還沒有參賽者")).toBeVisible();
		await expect(page.getByRole("button", { name: "新增第一位參賽者" })).toBeVisible();
		await expect(page.getByText("清除確認員", { exact: true })).toHaveCount(0);
	});
});
