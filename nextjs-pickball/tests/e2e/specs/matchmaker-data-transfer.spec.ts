import { Buffer } from "node:buffer";
import { readFileSync } from "node:fs";
import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
// M8 §8 修正輪（Stage 2 review B3）：歷史 CSV 標題列 MUST 直接比對 lib 層的單一真相來源，
// SHALL NOT 在本檔另抄一份「日期,時間,對戰方式,…」字面值——常數改了測試也要一起改。
import { HISTORY_CSV_HEADERS } from "@/lib/matchmaker/history-csv";

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

// 種入歷史紀錄：外層容器 MUST 是 { version: 1, entries: [...] }（round-storage.ts 的
// writeHistory() 寫入形狀），沿用 seedRoster 同一個 page.evaluate 一次性寫入的理由
// （本檔的 HistoryCsvSection 匯出測試不需要 reload，但仍統一走一次性寫入以維持一致慣例）。
async function seedHistory(page: Page, entries: unknown[]): Promise<void> {
	await page.evaluate(
		(arg: { key: string; value: string }) => {
			window.localStorage.setItem(arg.key, arg.value);
		},
		{ key: HISTORY_STORAGE_KEY, value: JSON.stringify({ version: 1, entries }) },
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
		// 保留種子物件本身（而非只記文字姓名），以便取消後能與 LocalStorage 逐字元比對
		// （M8 §8 修正輪 Stage 1 review A2：只比姓名＋人數不足以證明性別／強度分數／
		// 顏色等欄位未被誤動）。
		const existingPlayers = [buildPlayerFixture({ id: "p-csv-cancel-existing", name: "CSV取消既有員" })];
		await seedRoster(page, existingPlayers);

		await page.goto(DATA_PAGE);

		const csv = buildRosterCsv([{ name: "CSV取消匯入員", gender: "男", rating: "3.50" }]);
		await page.getByTestId("roster-csv-import-input").setInputFiles({
			name: "roster.csv",
			mimeType: "text/csv",
			buffer: Buffer.from(csv),
		});

		await expect(page.getByText("可新增 1 人")).toBeVisible();
		await page.getByRole("button", { name: "取消" }).click();

		// J2：取消後 UI MUST 真的重置為 idle——預覽面板（含「可新增 N 人」與問題列）
		// 須整個收回，不能只是「沒有寫入」這個更弱的事實（handleCancel 若被誤改成
		// no-op，UI 仍會停在 ready 狀態，本斷言可以抓到）。
		await expect(page.getByTestId("roster-csv-preview")).toBeHidden();

		// 逐字元比對整個 matchmaker:roster:v1：比只驗姓名＋人數更嚴格，
		// 能同時守住既有參賽者的性別／強度分數／顏色等欄位未被誤動。
		const storedRosterAfterCancel = await page.evaluate(
			(key) => window.localStorage.getItem(key),
			ROSTER_STORAGE_KEY,
		);
		expect(storedRosterAfterCancel).toBe(JSON.stringify({ version: 1, players: existingPlayers }));

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
		const existingPlayers = [buildPlayerFixture({ id: "p-clear-cancel", name: "清除取消員" })];
		await seedRoster(page, existingPlayers);

		await page.goto(DATA_PAGE);

		await page.getByRole("button", { name: "清除本機資料" }).click();
		const alert = page.getByRole("alertdialog", { name: "清除本機資料" });
		await expect(alert).toBeVisible();
		await alert.getByRole("button", { name: "取消" }).click();
		await expect(alert).toBeHidden();

		// 逐字元比對整個 matchmaker:roster:v1（M8 §8 修正輪 Stage 1 review A2），
		// 比只驗姓名＋人數更嚴格。
		const storedRosterAfterCancel = await page.evaluate(
			(key) => window.localStorage.getItem(key),
			ROSTER_STORAGE_KEY,
		);
		expect(storedRosterAfterCancel).toBe(JSON.stringify({ version: 1, players: existingPlayers }));

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

	// M8 §8 修正輪（Stage 2 review Blocker B1）：JSON 匯入失敗（parseBackup 回 ok:false）
	// 完全零覆蓋，含「是否誤 reload」。餵入語法錯誤的 JSON，斷言錯誤訊息顯示、名單不變、
	// 且沒有誤觸發 location.reload()——若誤 reload，component state（message）會被清空，
	// 畫面上的 alert 會消失，故等待一段時間後再次確認 alert 仍可見即可證明沒有誤 reload。
	// 用 `p[role="alert"]` 而非 `getByRole("alert")`：Next.js 的
	// `#__next-route-announcer__` 本身也帶 role="alert"，直接用 role 選會撞成 strict
	// mode violation（兩個符合的元素）。
	test("匯入語法錯誤的 JSON 備份時顯示錯誤訊息且不寫入不誤 reload", async ({ page }) => {
		await clearMatchmakerStorage(page);
		const existingPlayers = [buildPlayerFixture({ id: "p-json-invalid-existing", name: "JSON錯誤既有員" })];
		await seedRoster(page, existingPlayers);

		await page.goto(DATA_PAGE);

		await page.getByTestId("json-backup-import-input").setInputFiles({
			name: "broken-backup.json",
			mimeType: "application/json",
			buffer: Buffer.from("{ 這不是合法的 JSON"),
		});

		const alert = page.locator('p[role="alert"]');
		await expect(alert).toBeVisible();
		await expect(alert.getByText("不是合法的 JSON 格式", { exact: false })).toBeVisible();

		// 誤 reload 防護：等待一段時間後訊息仍留在畫面上。
		await page.waitForTimeout(500);
		await expect(alert).toBeVisible();

		const storedRosterAfterFailedImport = await page.evaluate(
			(key) => window.localStorage.getItem(key),
			ROSTER_STORAGE_KEY,
		);
		expect(storedRosterAfterFailedImport).toBe(JSON.stringify({ version: 1, players: existingPlayers }));

		await page.goto(PLAYERS_PAGE);
		await expect(page.getByText("JSON錯誤既有員", { exact: true })).toBeVisible();
		await expect(page.getByText("共 1 位參賽者")).toBeVisible();
	});

	// M8 §8 修正輪（Stage 2 review Blocker B1，mutant M3）：writeBackup 回 ok:false
	// （LocalStorage 寫入拋例外，如配額超出）的分支同樣零覆蓋。以
	// window.localStorage.setItem 抽換成拋例外版本，模擬 writeBackup 內
	// try/catch 捕捉到的邊界情境；此抽換只存在於目前的 page context（page.evaluate，
	// 非 addInitScript），若元件誤觸發 location.reload() 會產生全新 document、
	// 抽換自動失效，之後的 page.goto 用的是原生 setItem，不影響後續斷言的可靠性。
	test("LocalStorage 寫入失敗時 JSON 匯入不誤 reload 且顯示訊息", async ({ page }) => {
		await clearMatchmakerStorage(page);
		const existingPlayers = [
			buildPlayerFixture({ id: "p-json-writefail-existing", name: "JSON寫入失敗既有員" }),
		];
		await seedRoster(page, existingPlayers);

		await page.goto(DATA_PAGE);

		await page.evaluate(() => {
			window.localStorage.setItem = () => {
				throw new DOMException("模擬 LocalStorage 配額超出", "QuotaExceededError");
			};
		});

		const backup = {
			version: 1,
			players: [buildPlayerFixture({ id: "p-writefail-import", name: "寫入失敗匯入員" })],
			currentRound: null,
			history: [],
		};
		await page.getByTestId("json-backup-import-input").setInputFiles({
			name: "matchmaker-backup-writefail.json",
			mimeType: "application/json",
			buffer: Buffer.from(JSON.stringify(backup)),
		});

		const alert = page.locator('p[role="alert"]');
		await expect(alert).toBeVisible();
		await expect(alert.getByText("已超出瀏覽器的容量上限", { exact: false })).toBeVisible();

		// 誤 reload 防護：等待一段時間後訊息仍留在畫面上。
		await page.waitForTimeout(500);
		await expect(alert).toBeVisible();

		// 確認沒有誤 reload、既有名單未受影響——page.goto 會建立全新 document，
		// 前面抽換的 setItem 自動失效，讀到的是真正的 LocalStorage 內容。
		await page.goto(PLAYERS_PAGE);
		await expect(page.getByText("JSON寫入失敗既有員", { exact: true })).toBeVisible();
		await expect(page.getByText("共 1 位參賽者")).toBeVisible();
	});

	// M8 §8 修正輪（Stage 2 review Blocker B2）：JSON 匯出功能完全零覆蓋。
	// 點擊「匯出 JSON」，以 waitForEvent("download") 攔截下載，驗證檔名格式與
	// 內容的四個頂層欄位，且 players 與先前種入的名單一致。
	test("匯出 JSON 產生內容正確的備份檔案", async ({ page }) => {
		await clearMatchmakerStorage(page);
		const existingPlayers = [buildPlayerFixture({ id: "p-json-export-1", name: "JSON匯出員" })];
		await seedRoster(page, existingPlayers);

		await page.goto(DATA_PAGE);

		const [download] = await Promise.all([
			page.waitForEvent("download"),
			page.getByRole("button", { name: "匯出 JSON" }).click(),
		]);

		expect(download.suggestedFilename()).toMatch(/^matchmaker-backup-\d{4}-\d{2}-\d{2}\.json$/);

		const downloadPath = await download.path();
		expect(downloadPath).not.toBeNull();
		const content = JSON.parse(readFileSync(downloadPath as string, "utf-8")) as {
			version: unknown;
			players: unknown;
			currentRound: unknown;
			history: unknown;
		};
		expect(content).toHaveProperty("version");
		expect(content).toHaveProperty("players");
		expect(content).toHaveProperty("currentRound");
		expect(content).toHaveProperty("history");
		expect(content.players).toEqual(existingPlayers);
	});

	// M8 §8 修正輪（Stage 2 review Blocker B3）：HistoryCsvSection（歷史賽果 CSV 匯出）
	// 完全零覆蓋。此 describe 固定裝置時區為 Asia/Taipei（UTC+8），並選一個在 UTC 與
	// Asia/Taipei 屬於不同曆日的 playedAt（世界協調時 18:30 → 台北時間已跨入隔日
	// 02:30），用來驗證 Decision 12（時區必須注入本地時區，SHALL NOT 用 UTC）——
	// 斷言方式刻意不直接比對某個字面值時區換算結果（測試機時區會造成假紅燈），
	// 改為比對 CSV 的「日期」欄與 /matchmaker/history 頁面同一筆記錄顯示的日期是否相等：
	// 兩者都在同一個 page context（同一個被固定為 Asia/Taipei 的裝置時區）內產生，
	// 若 HistoryCsvSection 誤把時區改回 UTC，兩者就會不一致並使斷言失敗。
	test.describe("歷史賽果 CSV 匯出（固定裝置時區驗證 Decision 12）", () => {
		test.use({ timezoneId: "Asia/Taipei" });

		test("匯出歷史賽果 CSV 內容正確且日期與歷史頁顯示一致", async ({ page }) => {
			await clearMatchmakerStorage(page);

			const matchId = "e2e-data-transfer-history-csv-1";
			await seedHistory(page, [
				buildHistoryEntryFixture({
					matchId,
					teamAPlayer: { id: "p-history-csv-a", name: "CSV匯出球員A" },
					teamBPlayer: { id: "p-history-csv-b", name: "CSV匯出球員B" },
				}),
			]);
			// buildHistoryEntryFixture 的 playedAt 固定為「現在」，本測試需要跨曆日的
			// 固定時間，改以 page.evaluate 直接覆寫剛種入的那一筆 playedAt。
			await page.evaluate(
				(arg: { key: string; matchId: string; playedAt: string }) => {
					const raw = window.localStorage.getItem(arg.key);
					if (raw === null) return;
					const parsed = JSON.parse(raw) as {
						version: number;
						entries: { matchId: string; playedAt: string }[];
					};
					for (const entry of parsed.entries) {
						if (entry.matchId === arg.matchId) {
							entry.playedAt = arg.playedAt;
						}
					}
					window.localStorage.setItem(arg.key, JSON.stringify(parsed));
				},
				{ key: HISTORY_STORAGE_KEY, matchId, playedAt: "2000-01-01T18:30:00.000Z" },
			);

			await page.goto(DATA_PAGE);

			const [download] = await Promise.all([
				page.waitForEvent("download"),
				page.getByRole("button", { name: "匯出 CSV" }).click(),
			]);

			expect(download.suggestedFilename()).toMatch(/^matchmaker-history-\d{4}-\d{2}-\d{2}\.csv$/);

			const downloadPath = await download.path();
			expect(downloadPath).not.toBeNull();
			const rawContent = readFileSync(downloadPath as string, "utf-8");
			expect(rawContent.charCodeAt(0)).toBe(0xfeff);
			const content = rawContent.slice(1);

			const lines = content.split("\r\n");
			const headerFields = lines[0]?.split(",") ?? [];
			expect(headerFields).toEqual([...HISTORY_CSV_HEADERS]);

			const dataRow = lines[1] ?? "";
			expect(dataRow).toContain("CSV匯出球員A");
			expect(dataRow).toContain("CSV匯出球員B");

			const dateColumnIndex = HISTORY_CSV_HEADERS.indexOf("日期");
			const csvDate = dataRow.split(",")[dateColumnIndex];

			await page.goto(HISTORY_PAGE);
			await page.getByRole("radio", { name: "更早" }).click();
			const record = page.getByTestId(`history-record-${matchId}`);
			await expect(record).toBeVisible();
			const displayedDateTime = await record.locator("time").innerText();
			const displayedDate = displayedDateTime.slice(0, 10).replaceAll("/", "-");

			expect(csvDate).toBe(displayedDate);
		});
	});

	// M8 §8 修正輪（Stage 2 review Blocker B4）：parseRosterCsv 回 ok:false
	// （缺必填標題欄）的分支在元件層完全零覆蓋。餵入只有「名稱,性別」兩欄的 CSV
	// （缺「強度分數」），斷言結構性錯誤訊息顯示且含缺少的欄位名稱、確認匯入按鈕維持 disabled。
	test("CSV 標題列缺少必填欄位時顯示結構性錯誤且確認匯入按鈕維持 disabled", async ({ page }) => {
		await clearMatchmakerStorage(page);
		await page.goto(DATA_PAGE);

		await page.getByTestId("roster-csv-import-input").setInputFiles({
			name: "roster-missing-header.csv",
			mimeType: "text/csv",
			buffer: Buffer.from("名稱,性別\n結構錯誤員,男"),
		});

		const alert = page.locator('p[role="alert"]');
		await expect(alert).toBeVisible();
		await expect(alert.getByText("強度分數", { exact: false })).toBeVisible();
		await expect(page.getByRole("button", { name: "確認匯入" })).toBeDisabled();
	});

	// M8 §8 修正輪（Stage 2 review Major J1 + Minor N1，合併一條）：含錯誤列的預覽畫面
	// 從未被渲染過。CSV 混 3 列合法＋1 列強度分數超出範圍，斷言「可新增 3 人」、
	// 錯誤列表含正確的試算表列號（第 5 列：標題列第 1 列＋4 筆資料）、欄位名稱與
	// 繁體中文原因，並且（N1）「確認匯入」按鈕在此狀態為 disabled。
	test("CSV 匯入預覽同時顯示可新增人數與錯誤列且確認匯入按鈕 disabled", async ({ page }) => {
		await clearMatchmakerStorage(page);
		await page.goto(DATA_PAGE);

		const csv = buildRosterCsv([
			{ name: "混合員一", gender: "男", rating: "3.50" },
			{ name: "混合員二", gender: "女", rating: "4.20" },
			{ name: "混合員三", gender: "其他", rating: "5.00" },
			{ name: "混合員四", gender: "男", rating: "9.00" }, // 強度分數超出範圍（>8.00）
		]);
		await page.getByTestId("roster-csv-import-input").setInputFiles({
			name: "roster-mixed.csv",
			mimeType: "text/csv",
			buffer: Buffer.from(csv),
		});

		await expect(page.getByText("可新增 3 人")).toBeVisible();

		const errorList = page.getByTestId("roster-csv-errors");
		await expect(errorList).toBeVisible();
		await expect(errorList).toContainText("第 5 列");
		await expect(errorList).toContainText("強度分數");
		await expect(errorList).toContainText("需介於 1.00 至 8.00 之間");

		await expect(page.getByRole("button", { name: "確認匯入" })).toBeDisabled();
	});
});
