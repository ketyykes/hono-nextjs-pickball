import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";

// /matchmaker/stats 球員統計與排行榜頁的 E2E 驗收（M11 §6）。
// 對應 test-plan 的三條 e2e 錨點：空狀態、直接開啟路由載入表格、切換區間後只反映該區間。
//
// 本頁屬 TDD 例外層（app/**/page.tsx 不強制單元 TDD，見 nextjs-pickball/CLAUDE.md），
// 所有驗收落在本檔。
//
// 歷史資料存在 localStorage["matchmaker:history:v1"]、名單存在
// localStorage["matchmaker:roster:v1"]，兩者的容器形狀皆為 { version: 1, ... }
// （見 lib/matchmaker/round-storage.ts 的 writeHistory 與 lib/matchmaker/storage.ts 的
// writeRoster），不是裸陣列——外層 version 不符會被 reader 判為結構層級損壞而清空整份。
//
// 為避免 localStorage 跨測試污染，beforeEach 只清除本頁會讀到的兩個 key，
// 刻意不用 localStorage.clear()（沿用 matchmaker-history.spec.ts 的既有慣例）。

const HISTORY_STORAGE_KEY = "matchmaker:history:v1";
const ROSTER_STORAGE_KEY = "matchmaker:roster:v1";
const STATS_PAGE = "/matchmaker/stats";
const STATS_TABLE_NAME = "球員排行榜";

// 排行榜欄位在 <tr> 內的索引，供 getByRole("cell").nth() 精準取值——用整列
// toContainText 會讓「出場數 2」與「勝負 2 - 0」等數字互相干擾，測不出單一欄位。
const CELL_INDEX_CURRENT_RATING = 2;
const CELL_INDEX_GAMES_PLAYED = 3;

// 已知的 dev-only 噪音，不視為本測試的失敗（沿用 matchmaker-history.spec.ts 的既有慣例）：
// Turbopack 的 HMR client 與 Next 內建 global-error boundary 是背景延遲載入的 chunk，
// 高並發 E2E 下偶爾被下一次 page.goto() 中斷，已證實與頁面本身的產品邏輯無關。
const KNOWN_DEV_ONLY_NOISE = /ChunkLoadError.*(hmr-client|global-error)/;

// 監控瀏覽器 console：收集 error 與 warning，並收集未捕捉的 pageerror。
// 本頁在 render 期間呼叫 new Date() 取「現在」（tasks 6.2 明文指定），因此特別留意
// hydration mismatch——首次伺服器輸出與 hydration 當下的 history 皆為空、走同一個
// 空狀態分支，理論上不會不一致，這條測試就是那個「理論上」的實證。
function trackConsoleIssues(page: Page): string[] {
	const issues: string[] = [];
	page.on("console", (msg) => {
		if (msg.type() === "error" || msg.type() === "warning") {
			issues.push(`[console.${msg.type()}] ${msg.text()}`);
		}
	});
	page.on("pageerror", (error) => {
		if (KNOWN_DEV_ONLY_NOISE.test(error.message)) return;
		issues.push(`[pageerror] ${error.message}`);
	});
	return issues;
}

// 兩個區間各自的固定取樣時間，皆以測試執行當下的「現在」為基準運算，避免寫死
// 絕對日期造成測試在未來某天失效（沿用 matchmaker-history.spec.ts 的既有慣例）。
const now = new Date();
function isoToday(hour = 10): string {
	return new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, 0, 0).toISOString();
}
function isoLastMonth(day = 15, hour = 10): string {
	return new Date(now.getFullYear(), now.getMonth() - 1, day, hour, 0, 0).toISOString();
}

// 種入一批歷史紀錄：外層容器 MUST 是 { version: 1, entries: [...] }。
// 以 page.addInitScript 於頁面任何 script 執行前寫入，保證第一次載入就讀得到。
function seedHistory(page: Page, entries: unknown[]) {
	return page.addInitScript(
		(arg: { key: string; value: string }) => {
			window.localStorage.setItem(arg.key, arg.value);
		},
		{ key: HISTORY_STORAGE_KEY, value: JSON.stringify({ version: 1, entries }) },
	);
}

// 種入名單：外層容器 MUST 是 { version: 1, players: [...] }（writeRoster 的寫入形狀）。
function seedRoster(page: Page, players: unknown[]) {
	return page.addInitScript(
		(arg: { key: string; value: string }) => {
			window.localStorage.setItem(arg.key, arg.value);
		},
		{ key: ROSTER_STORAGE_KEY, value: JSON.stringify({ version: 1, players }) },
	);
}

// 單一名單球員 fixture，欄位形狀複製自 lib/matchmaker/types.ts 的 PlayerSchema。
function rosterPlayer(id: string, name: string, rating: number) {
	return {
		id,
		name,
		gender: "male" as const,
		colorFrom: "#2563EB",
		colorTo: "#1E40AF",
		rating,
		restCount: 0,
		gamesPlayed: 0,
		isActive: true,
		createdAt: isoToday(8),
	};
}

// 單一歷史球員快照 fixture。ratingBefore／ratingAfter 給預設值——多數 test 不關心
// 實際分數，只有驗「目前強度取自名單而非歷史」的那條需要指定精確值。
interface PlayerFixture {
	id: string;
	name: string;
	ratingBefore: number;
	ratingAfter: number;
}
function player(id: string, name: string, ratingBefore = 3.5, ratingAfter = 3.6): PlayerFixture {
	return { id, name, ratingBefore, ratingAfter };
}

function averageRating(players: readonly PlayerFixture[]): number {
	return players.reduce((sum, p) => sum + p.ratingBefore, 0) / players.length;
}

interface EntryFixtureOptions {
	matchId: string;
	playedAt: string;
	teamA: PlayerFixture[];
	teamB: PlayerFixture[];
	courtNumber?: number;
	scoreA?: number;
	scoreB?: number;
	winner?: "teamA" | "teamB";
	doublesComposition?: "mixed" | "mens" | "womens" | "general";
}

// 唯一的歷史紀錄 fixture 組裝點，欄位形狀複製自 lib/matchmaker/history.ts 的
// MatchHistoryEntrySchema。format 依 teamA／teamB 人數自動推導（任一隊 > 1 人即為
// 雙打），doublesComposition 只在雙打時附加，與 schema 的 discriminated union
// （單打不得帶、雙打必須帶）保持一致。
function buildEntry(options: EntryFixtureOptions) {
	const isDoubles = options.teamA.length > 1 || options.teamB.length > 1;
	const base = {
		matchId: options.matchId,
		courtNumber: options.courtNumber ?? 1,
		playedAt: options.playedAt,
		teamA: { players: options.teamA, rating: averageRating(options.teamA) },
		teamB: { players: options.teamB, rating: averageRating(options.teamB) },
		scoreA: options.scoreA ?? 11,
		scoreB: options.scoreB ?? 5,
		winner: options.winner ?? ("teamA" as const),
	};
	if (isDoubles) {
		return { ...base, format: "doubles" as const, doublesComposition: options.doublesComposition ?? "mixed" };
	}
	return { ...base, format: "singles" as const };
}

test.describe("/matchmaker/stats 球員統計頁", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/");
		await page.evaluate((keys) => {
			for (const key of keys) {
				window.localStorage.removeItem(key);
			}
		}, [HISTORY_STORAGE_KEY, ROSTER_STORAGE_KEY]);
	});

	test("完全沒有歷史紀錄時顯示引導型空狀態", async ({ page }) => {
		await page.goto(STATS_PAGE);

		// 引導型空狀態＝EmptyHistory 的 range === null 分支（data-testid="empty-history"）。
		await expect(page.getByTestId("empty-history")).toBeVisible();
		await expect(page.getByText("完成對戰後才會有紀錄")).toBeVisible();
		// range 若誤傳 selectedRange 會改走「該區間沒有紀錄」分支，文案完全不同——
		// 只斷言上面兩條擋不住這個退化，故正面確認另一個分支沒有被渲染。
		await expect(page.getByTestId("empty-history-range")).toHaveCount(0);
		// spec：SHALL NOT 顯示只有標題列的空表格。
		await expect(page.getByRole("table", { name: STATS_TABLE_NAME })).toHaveCount(0);
		// tasks 6.2：完全沒有紀錄時只渲染 EmptyHistory，區間篩選一併不出現。
		await expect(page.getByRole("radiogroup", { name: "歷史區間" })).toHaveCount(0);
	});

	test("直接開啟 /matchmaker/stats 可載入排行榜表格", async ({ page }) => {
		await seedHistory(page, [
			buildEntry({
				matchId: "e2e-stats-load-1",
				playedAt: isoToday(),
				teamA: [player("p-load-a", "排行今日壹")],
				teamB: [player("p-load-b", "排行今日貳")],
			}),
		]);

		await page.goto(STATS_PAGE);

		const table = page.getByRole("table", { name: STATS_TABLE_NAME });
		await expect(table).toBeVisible();

		// 九項欄位名稱只在標題列出現，故把斷言限縮在標題列——用整張表比對會被
		// 內文（球員姓名、數值）干擾而失真。
		const headerRow = table.getByRole("row").first();
		for (const columnName of [
			"名次",
			"球員",
			"強度",
			"出場",
			"勝負",
			"勝率",
			"淨變化",
			"常搭檔",
			"常對手",
		]) {
			await expect(headerRow).toContainText(columnName);
		}

		// 有紀錄時 MUST 走表格分支，不得同時（或改為）顯示引導型空狀態。
		await expect(page.getByTestId("empty-history")).toHaveCount(0);
		// 表格內容確實來自種入的歷史紀錄，而非只渲染出一列空標題。
		await expect(page.getByTestId("player-stat-row-p-load-a")).toBeVisible();
		await expect(page.getByTestId("player-stat-row-p-load-b")).toBeVisible();
	});

	test("切換區間後排行榜只反映該區間的歷史紀錄", async ({ page }) => {
		// 焦點球員今日兩場、上月一場：三個區間狀態（今日 2、上月 1、未篩選 3）互不相同，
		// 任一端接錯都會讓出場數對不上——只種「今日一場、上月一場」時，把
		// computePlayerStats 的第一引數換成未篩選的 history 仍可能矇混過關。
		await seedHistory(page, [
			buildEntry({
				matchId: "e2e-stats-range-today-1",
				playedAt: isoToday(10),
				teamA: [player("p-range-focus", "區間焦點員")],
				teamB: [player("p-range-today-1", "區間今日對手壹")],
			}),
			buildEntry({
				matchId: "e2e-stats-range-today-2",
				playedAt: isoToday(14),
				teamA: [player("p-range-focus", "區間焦點員")],
				teamB: [player("p-range-today-2", "區間今日對手貳")],
			}),
			buildEntry({
				matchId: "e2e-stats-range-lastmonth-1",
				playedAt: isoLastMonth(),
				teamA: [player("p-range-focus", "區間焦點員")],
				teamB: [player("p-range-lastmonth", "區間上月對手")],
			}),
		]);

		await page.goto(STATS_PAGE);

		const focusRow = page.getByTestId("player-stat-row-p-range-focus");
		await expect(focusRow).toBeVisible();

		// 初次開啟 MUST 預設選中今日（spec「統計依區間篩選」）：只斷言「今日為選中」
		// 擋不住「每個按鈕都標成選中」，另取一個區間確認其為未選中。
		await expect(page.getByRole("radio", { name: "今日", checked: true })).toBeVisible();
		await expect(page.getByRole("radio", { name: "上月", checked: false })).toBeVisible();
		// 今日區間：焦點球員只計入今日那兩場。
		await expect(focusRow.getByRole("cell").nth(CELL_INDEX_GAMES_PLAYED)).toHaveText("2");
		await expect(page.getByTestId("player-stat-row-p-range-today-1")).toBeVisible();
		await expect(page.getByTestId("player-stat-row-p-range-today-2")).toBeVisible();
		// 上月才出現的對手在今日區間不得入榜（雙向斷言）。
		await expect(page.getByTestId("player-stat-row-p-range-lastmonth")).toHaveCount(0);

		await page.getByRole("radio", { name: "上月" }).click();

		// 切換後：出場數只計入上月那一筆，不含今日的兩筆。
		await expect(focusRow.getByRole("cell").nth(CELL_INDEX_GAMES_PLAYED)).toHaveText("1");
		await expect(page.getByTestId("player-stat-row-p-range-lastmonth")).toBeVisible();
		// 今日兩位對手隨之消失，否則「篩選沒生效、只是多算了幾場」也會通過。
		await expect(page.getByTestId("player-stat-row-p-range-today-1")).toHaveCount(0);
		await expect(page.getByTestId("player-stat-row-p-range-today-2")).toHaveCount(0);
		// 選取狀態也 MUST 隨之轉移，否則「每個按鈕都標成選中」照樣通過。
		await expect(page.getByRole("radio", { name: "上月", checked: true })).toBeVisible();
		await expect(page.getByRole("radio", { name: "今日", checked: false })).toBeVisible();

		// 切回今日：確認區間狀態是雙向可逆的，不是一次性地被切成上月就回不去。
		await page.getByRole("radio", { name: "今日" }).click();
		await expect(focusRow.getByRole("cell").nth(CELL_INDEX_GAMES_PLAYED)).toHaveText("2");
		await expect(page.getByTestId("player-stat-row-p-range-lastmonth")).toHaveCount(0);
	});

	// 非錨點補強：鎖住 computePlayerStats 的第二引數確實接上 useRosterStore 的名單。
	// 只驗上面三條時，把第二引數換成空陣列（或不接名單）照樣全綠——名單內球員會
	// 靜默降級成「已不在名單」、目前強度改讀歷史快照，數字全對不上。
	test("名單內球員取名單姓名與目前強度，已離開名單者標示且取歷史最後一筆", async ({ page }) => {
		// 名單裡的 rating（4.80）與歷史快照的 ratingAfter（3.10）刻意不同，且姓名也不同，
		// 兩個欄位各自都能單獨指出「這筆讀的是名單還是歷史」。
		await seedRoster(page, [rosterPlayer("p-roster-a", "名單內成員", 4.8)]);
		await seedHistory(page, [
			buildEntry({
				matchId: "e2e-stats-roster-1",
				playedAt: isoToday(9),
				teamA: [player("p-roster-a", "名單內成員的舊名", 3.0, 3.1)],
				teamB: [player("p-off-roster", "已離開名單者", 3.0, 2.9)],
			}),
		]);

		await page.goto(STATS_PAGE);

		const rosterRow = page.getByTestId("player-stat-row-p-roster-a");
		await expect(rosterRow).toBeVisible();
		await expect(rosterRow).toContainText("名單內成員");
		await expect(rosterRow).not.toContainText("名單內成員的舊名");
		await expect(rosterRow).not.toContainText("已不在名單");
		await expect(rosterRow.getByRole("cell").nth(CELL_INDEX_CURRENT_RATING)).toHaveText("4.80");

		const offRosterRow = page.getByTestId("player-stat-row-p-off-roster");
		await expect(offRosterRow).toBeVisible();
		await expect(offRosterRow).toContainText("已不在名單");
		await expect(offRosterRow.getByRole("cell").nth(CELL_INDEX_CURRENT_RATING)).toHaveText("2.90");
	});

	// 非錨點補強：本頁在 render 期間取「現在」（new Date()），這條確認它沒有造成
	// hydration mismatch——首屏空狀態與 hydration 後的表格切換 MUST 靜默完成。
	test("統計頁載入後無 console error", async ({ page }) => {
		const consoleIssues = trackConsoleIssues(page);
		await seedHistory(page, [
			buildEntry({
				matchId: "e2e-stats-hydration-1",
				playedAt: isoToday(11),
				teamA: [player("p-hydration-a", "統計載入員甲")],
				teamB: [player("p-hydration-b", "統計載入員乙")],
			}),
		]);

		await page.goto(STATS_PAGE);

		await expect(page.getByTestId("player-stat-row-p-hydration-a")).toBeVisible();

		expect(
			consoleIssues,
			`不應有 console error/warning：\n${consoleIssues.join("\n")}`,
		).toEqual([]);
	});
});
