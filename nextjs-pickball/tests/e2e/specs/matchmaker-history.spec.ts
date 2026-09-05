import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";

// /matchmaker/history 歷史頁的 E2E 驗收。
// 對應 matchmaker-history-page change §4 的 test-plan：直接開啟路由、預設區間、
// 切換區間、8.2 欄位呈現、賽前／賽後分數、空狀態（引導型與跨月週）。
//
// 歷史資料存在 localStorage["matchmaker:history:v1"]，容器形狀為
// { version: 1, entries: [...] }（見 lib/matchmaker/round-storage.ts 的 writeHistory），
// 不是裸陣列——外層 version 不符會被 reader 判為結構層級損壞而清空整份。
//
// 為避免 localStorage 跨測試污染，beforeEach 只清除本 capability 的
// matchmaker:history:v1，刻意不用 localStorage.clear()（沿用 player-roster.spec.ts
// 與 scoreboard-binding.spec.ts 的既有慣例）。

const HISTORY_STORAGE_KEY = "matchmaker:history:v1";
const HISTORY_PAGE = "/matchmaker/history";

// 已知的 dev-only 噪音，不視為本測試的失敗（沿用 match-stage.spec.ts／
// player-roster.spec.ts 的既有慣例）：Turbopack 的 HMR client 與 Next 內建
// global-error boundary 是背景延遲載入的 chunk，高並發 E2E 下偶爾被下一次
// page.goto() 中斷，已證實與頁面本身的產品邏輯無關。
const KNOWN_DEV_ONLY_NOISE = /ChunkLoadError.*(hmr-client|global-error)/;

// 監控瀏覽器 console：收集 error 與 warning，並收集未捕捉的 pageerror。特別留意
// hydration mismatch——歷史頁在 render 期間 SHALL NOT 取用 localStorage 或系統
// 時鐘，若寫錯會在此以 warning 或 error 現形（spec「歷史頁唯讀消費既有紀錄」）。
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

// 三個區間各自的固定取樣時間，皆以測試執行當下的「現在」為基準運算，避免寫死
// 絕對日期造成測試在未來某天失效。isoEarlier() 刻意用一個遠早於任何「上月」判定
// 的絕對日期（2000 年）——「更早」是無下界的兜底區間，不需要相對於現在計算。
const now = new Date();
function isoToday(hour = 10): string {
	return new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, 0, 0).toISOString();
}
function isoLastMonth(day = 15, hour = 10): string {
	return new Date(now.getFullYear(), now.getMonth() - 1, day, hour, 0, 0).toISOString();
}
function isoEarlier(): string {
	return new Date(2000, 0, 1, 10, 0, 0).toISOString();
}
// 跨月週固定情境：假時鐘固定於 2026-08-01（週六），該週週一落在 2026-07-27，
// 使「本月」（8/1 起算的當月）與「本週」的左端點皆為 7/27，讓「本月」自然成為
// 空區間（design Risks：跨月週時本月顯示空狀態而非錯誤）。
function isoCrossMonthWeek(day: number, hour = 10): string {
	return new Date(2026, 6, day, hour, 0, 0).toISOString();
}

// Next.js 的 route announcer（`__next-route-announcer__`）本身即帶 role="alert"，
// 但恆為空字串內容，且並非 aria-hidden，會被 getByRole("alert") 一併命中，
// 讓「有幾個 alert」與「alert 文字是什麼」兩種斷言都失真——本頁新增的損毀提示
// 必須排除這個固定 id 才能鎖定實際渲染出來的提示本身。
function historyCorruptionAlert(page: Page) {
	return page.locator('[role="alert"]:not(#__next-route-announcer__)');
}

// 種入一批歷史紀錄：外層容器 MUST 是 { version: 1, entries: [...] }（round-storage.ts
// 的 writeHistory() 寫入形狀），裸陣列會被 readHistory() 判為結構層級損壞而整份清空。
// 以 page.addInitScript 於頁面任何 script 執行前寫入，保證第一次載入就讀得到
// （沿用 scoreboard-binding.spec.ts 的既有慣例）。
function seedHistory(page: Page, entries: unknown[]) {
	return page.addInitScript(
		(arg: { key: string; value: string }) => {
			window.localStorage.setItem(arg.key, arg.value);
		},
		{ key: HISTORY_STORAGE_KEY, value: JSON.stringify({ version: 1, entries }) },
	);
}

// 單一球員 fixture 組裝點，ratingBefore／ratingAfter 給預設值——多數 test 不關心
// 實際分數，只有「每位球員同時顯示賽前與賽後分數」需要指定精確值。
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

type DoublesComposition = "mixed" | "mens" | "womens" | "general";

interface EntryFixtureOptions {
	matchId: string;
	playedAt: string;
	teamA: PlayerFixture[];
	teamB: PlayerFixture[];
	courtNumber?: number;
	scoreA?: number;
	scoreB?: number;
	winner?: "teamA" | "teamB";
	doublesComposition?: DoublesComposition;
}

// 唯一的歷史紀錄 fixture 組裝點（4.9 REFACTOR）：欄位形狀複製自
// lib/matchmaker/history.ts 的 MatchHistoryEntrySchema。format 依 teamA／teamB
// 人數自動推導（任一隊 > 1 人即為雙打），doublesComposition 只在雙打時附加，
// 與 schema 的 discriminated union（單打不得帶、雙打必須帶）保持一致——本檔六個
// 需要種資料的 test 皆呼叫本函式，不再各自拼一份 JSON 物件字面量。
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

test.describe("/matchmaker/history 對戰歷史頁", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/");
		await page.evaluate((key) => {
			window.localStorage.removeItem(key);
		}, HISTORY_STORAGE_KEY);
	});

	test("可由對戰頁的連結進入歷史頁", async ({ page }) => {
		await page.goto("/matchmaker");
		const nav = page.getByRole("navigation", { name: "對戰分配區段導覽" });
		await nav.getByRole("link", { name: "歷史", exact: true }).click();

		await expect(page).toHaveURL(/\/matchmaker\/history$/);
		await expect(page.getByRole("heading", { name: "對戰歷史" })).toBeVisible();
	});

	test("直接開啟 /matchmaker/history 可載入歷史頁", async ({ page }) => {
		await page.goto(HISTORY_PAGE);

		await expect(page.getByRole("heading", { name: "對戰歷史" })).toBeVisible();
		await expect(page.getByRole("radio", { name: "今日" })).toBeVisible();
		await expect(page.getByRole("radio", { name: "本週" })).toBeVisible();
		await expect(page.getByRole("radio", { name: "本月" })).toBeVisible();
		await expect(page.getByRole("radio", { name: "上月" })).toBeVisible();
		await expect(page.getByRole("radio", { name: "更早" })).toBeVisible();
	});

	test("沒有任何歷史紀錄時顯示引導空狀態", async ({ page }) => {
		await page.goto(HISTORY_PAGE);

		await expect(page.getByText("完成對戰後才會有紀錄")).toBeVisible();
	});

	test("開啟歷史頁預設顯示今日區間", async ({ page }) => {
		await seedHistory(page, [
			buildEntry({
				matchId: "e2e-history-today-1",
				playedAt: isoToday(),
				teamA: [player("p-today-a", "今日對戰員A")],
				teamB: [player("p-today-b", "今日對戰員B")],
			}),
			buildEntry({
				matchId: "e2e-history-earlier-1",
				playedAt: isoEarlier(),
				teamA: [player("p-earlier-a", "更早對戰員A")],
				teamB: [player("p-earlier-b", "更早對戰員B")],
			}),
		]);

		await page.goto(HISTORY_PAGE);

		await expect(page.getByRole("radio", { name: "今日", checked: true })).toBeVisible();
		// 只斷言「今日為選中」擋不住「每個按鈕都標成選中」，另取一個區間確認其為未選中。
		await expect(page.getByRole("radio", { name: "上月", checked: false })).toBeVisible();
		// 雙向斷言：該出現的今日紀錄出現，不該出現的更早紀錄消失。
		await expect(page.getByText("今日對戰員A")).toBeVisible();
		await expect(page.getByText("更早對戰員A")).toHaveCount(0);
	});

	test("切換區間後只顯示該區間的紀錄", async ({ page }) => {
		await seedHistory(page, [
			buildEntry({
				matchId: "e2e-history-today-2",
				playedAt: isoToday(),
				teamA: [player("p-today2-a", "今日對戰員C")],
				teamB: [player("p-today2-b", "今日對戰員D")],
			}),
			buildEntry({
				matchId: "e2e-history-lastmonth-1",
				playedAt: isoLastMonth(),
				teamA: [player("p-lastmonth-a", "上月對戰員A")],
				teamB: [player("p-lastmonth-b", "上月對戰員B")],
			}),
		]);

		await page.goto(HISTORY_PAGE);

		// 切換前：預設今日區間，今日紀錄可見、上月紀錄不可見。
		await expect(page.getByText("今日對戰員C")).toBeVisible();
		await expect(page.getByText("上月對戰員A")).toHaveCount(0);

		await page.getByRole("radio", { name: "上月" }).click();

		// 切換後：雙向斷言——上月紀錄出現，今日紀錄消失。
		await expect(page.getByText("上月對戰員A")).toBeVisible();
		await expect(page.getByText("今日對戰員C")).toHaveCount(0);
		// 選取狀態也 MUST 隨之轉移，否則「每個按鈕都標成選中」照樣通過。
		await expect(page.getByRole("radio", { name: "上月", checked: true })).toBeVisible();
		await expect(page.getByRole("radio", { name: "今日", checked: false })).toBeVisible();

		await page.getByRole("radio", { name: "本週" }).click();

		// 切到一個沒有紀錄的區間：MUST 顯示該區間自己的文案，不得沿用別的區間。
		// 兩筆種資料分別落在今日與上月，本週因此必為空區間。
		await expect(page.getByTestId("empty-history-range")).toHaveText("本週目前沒有任何對戰紀錄。");
		await expect(page.getByText("今日對戰員C")).toHaveCount(0);
		await expect(page.getByText("上月對戰員A")).toHaveCount(0);
	});

	test("雙打紀錄顯示 8.2 全部欄位含雙打組成標示", async ({ page }) => {
		const matchId = "e2e-history-doubles-1";
		const playedAt = isoToday(14);
		// 第二筆刻意在每個欄位上都與第一筆相異（場地 5、比分 8:11、第二隊獲勝、男雙）：
		// 只種一筆時，把 courtNumber／scoreA／winner／doublesComposition 任一項寫死成第一筆
		// 的值，測試依然全綠——單一取值的欄位等於零保護。第三、四筆補滿剩下兩種組成文案。
		const mensMatchId = "e2e-history-doubles-2";
		const womensMatchId = "e2e-history-doubles-3";
		const generalMatchId = "e2e-history-doubles-4";
		await seedHistory(page, [
			buildEntry({
				matchId,
				playedAt,
				courtNumber: 3,
				doublesComposition: "mixed",
				teamA: [
					player("p-doubles-a1", "雙打今日員A1", 4.0, 4.1),
					player("p-doubles-a2", "雙打今日員A2", 3.8, 3.9),
				],
				teamB: [
					player("p-doubles-b1", "雙打今日員B1", 3.5, 3.4),
					player("p-doubles-b2", "雙打今日員B2", 3.6, 3.5),
				],
				scoreA: 11,
				scoreB: 7,
			}),
			buildEntry({
				matchId: mensMatchId,
				playedAt: isoToday(13),
				courtNumber: 5,
				doublesComposition: "mens",
				// 球員姓名刻意不含「男雙」等字樣，否則 getByText 會同時命中姓名與組成標示。
				teamA: [player("p-mens-a1", "甲組今日員A1"), player("p-mens-a2", "甲組今日員A2")],
				teamB: [player("p-mens-b1", "甲組今日員B1"), player("p-mens-b2", "甲組今日員B2")],
				scoreA: 8,
				scoreB: 11,
				winner: "teamB",
			}),
			buildEntry({
				matchId: womensMatchId,
				playedAt: isoToday(12),
				doublesComposition: "womens",
				teamA: [player("p-womens-a1", "乙組今日員A1"), player("p-womens-a2", "乙組今日員A2")],
				teamB: [player("p-womens-b1", "乙組今日員B1"), player("p-womens-b2", "乙組今日員B2")],
			}),
			buildEntry({
				matchId: generalMatchId,
				playedAt: isoToday(11),
				doublesComposition: "general",
				teamA: [player("p-general-a1", "丙組今日員A1"), player("p-general-a2", "丙組今日員A2")],
				teamB: [player("p-general-b1", "丙組今日員B1"), player("p-general-b2", "丙組今日員B2")],
			}),
		]);

		await page.goto(HISTORY_PAGE);

		const card = page.getByTestId(`history-record-${matchId}`);
		await expect(card).toBeVisible();
		// 對戰 ID、場地、對戰時間、對戰方式、雙打組成標示。
		await expect(card.getByText(matchId)).toBeVisible();
		await expect(card.getByText("第 3 場地")).toBeVisible();
		await expect(card.locator(`time[datetime="${playedAt}"]`)).toBeVisible();
		// 人眼可讀的對戰時間 MUST 是當地時區：預期值由與 fixture 同一個 now 取當地時間
		// 分量組出，元件若改用 getUTC* 會在此轉紅（只驗 <time datetime> 驗不到這件事）。
		const expectedPlayedAtText = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, "0")}/${String(now.getDate()).padStart(2, "0")} 14:00`;
		await expect(card.locator(`time[datetime="${playedAt}"]`)).toHaveText(expectedPlayedAtText);
		await expect(card.getByText("雙打", { exact: true })).toBeVisible();
		await expect(card.getByText("混雙")).toBeVisible();
		// 兩隊球員與比分、勝方。
		await expect(card.getByText("雙打今日員A1")).toBeVisible();
		await expect(card.getByText("雙打今日員A2")).toBeVisible();
		await expect(card.getByText("雙打今日員B1")).toBeVisible();
		await expect(card.getByText("雙打今日員B2")).toBeVisible();
		await expect(card.getByTestId(`history-record-${matchId}-score`)).toHaveText("11:7");
		await expect(card.getByTestId(`history-record-${matchId}-team-a`)).toContainText("勝");
		await expect(card.getByTestId(`history-record-${matchId}-team-b`)).not.toContainText("勝");
		// 兩隊各自的文字標籤與成員 MUST 對得起來，否則兩隊內容互換也測不出來。
		await expect(card.getByTestId(`history-record-${matchId}-team-a`)).toContainText("第一隊");
		await expect(card.getByTestId(`history-record-${matchId}-team-a`)).toContainText("雙打今日員A1");
		await expect(card.getByTestId(`history-record-${matchId}-team-b`)).toContainText("第二隊");
		await expect(card.getByTestId(`history-record-${matchId}-team-b`)).toContainText("雙打今日員B1");

		// 第二筆：場地、比分與勝方皆與第一筆相異，逐一鎖住這些欄位真的讀自紀錄。
		const mensCard = page.getByTestId(`history-record-${mensMatchId}`);
		await expect(mensCard.getByText("第 5 場地")).toBeVisible();
		await expect(mensCard.getByText("男雙")).toBeVisible();
		await expect(mensCard.getByTestId(`history-record-${mensMatchId}-score`)).toHaveText("8:11");
		await expect(mensCard.getByTestId(`history-record-${mensMatchId}-team-b`)).toContainText("勝");
		await expect(mensCard.getByTestId(`history-record-${mensMatchId}-team-a`)).not.toContainText("勝");

		// 剩下兩種雙打組成的文案（女雙、一般雙打）逐字覆蓋。
		await expect(page.getByTestId(`history-record-${womensMatchId}`).getByText("女雙")).toBeVisible();
		await expect(
			page.getByTestId(`history-record-${generalMatchId}`).getByText("一般雙打"),
		).toBeVisible();
	});

	test("單打紀錄不顯示雙打組成標示", async ({ page }) => {
		const matchId = "e2e-history-singles-1";
		await seedHistory(page, [
			buildEntry({
				matchId,
				playedAt: isoToday(15),
				courtNumber: 2,
				teamA: [player("p-singles-a", "單打今日員A", 3.7, 3.8)],
				teamB: [player("p-singles-b", "單打今日員B", 3.6, 3.5)],
				scoreA: 11,
				scoreB: 9,
			}),
		]);

		await page.goto(HISTORY_PAGE);

		const card = page.getByTestId(`history-record-${matchId}`);
		await expect(card).toBeVisible();
		await expect(card.getByText("單打", { exact: true })).toBeVisible();
		// 場地取自本筆紀錄（雙打那個 test 用的是 3 與 5），三個相異值才擋得住寫死。
		await expect(card.getByText("第 2 場地")).toBeVisible();
		// 單打不得帶任何雙打組成標示文字（四種寫死文案逐一確認不存在）。
		for (const label of ["混雙", "男雙", "女雙", "一般雙打"]) {
			await expect(card.getByText(label)).toHaveCount(0);
		}
	});

	test("每位球員同時顯示賽前與賽後分數", async ({ page }) => {
		const matchId = "e2e-history-rating-1";
		await seedHistory(page, [
			buildEntry({
				matchId,
				playedAt: isoToday(16),
				teamA: [player("p-rating-a", "分數變化員A", 4.2, 4.35)],
				teamB: [player("p-rating-b", "分數變化員B", 3.9, 3.8)],
				scoreA: 11,
				scoreB: 6,
			}),
		]);

		await page.goto(HISTORY_PAGE);

		const card = page.getByTestId(`history-record-${matchId}`);
		await expect(card.getByText("4.20")).toBeVisible();
		await expect(card.getByText("4.35")).toBeVisible();
	});

	test("跨月週時本月顯示空狀態而非錯誤", async ({ page }) => {
		const days = [27, 28, 29, 30, 31];
		const entries = days.map((day) => {
			const matchId = `e2e-history-crossmonth-${day}`;
			return buildEntry({
				matchId,
				playedAt: isoCrossMonthWeek(day),
				teamA: [player(`${matchId}-a`, `跨月週球員${day}`)],
				teamB: [player(`${matchId}-b`, `跨月週球員${day}的對手`)],
			});
		});
		await seedHistory(page, entries);

		// MUST 在 page.goto() 之前呼叫：只固定 Date，不暫停 timer（design Risks）。
		await page.clock.setFixedTime(new Date(2026, 7, 1, 12, 0, 0));
		await page.goto(HISTORY_PAGE);

		await page.getByRole("radio", { name: "本月" }).click();

		// 本月為空：友善空狀態可見，且不出現任何錯誤字樣（正向斷言空狀態本身，
		// 不只是斷言「沒有錯誤」——避免頁面整個壞掉、什麼都沒 render 時誤判通過）。
		await expect(page.getByTestId("empty-history-range")).toBeVisible();
		await expect(page.getByTestId("empty-history-range")).toHaveText("本月目前沒有任何對戰紀錄。");
		await expect(page.getByTestId(/^history-record-e2e-history-crossmonth-/)).toHaveCount(0);
		const bodyText = await page.locator("body").innerText();
		expect(bodyText).not.toMatch(/Error/);

		// 此時鐘下今日（8/1）、上月（7/1～7/26）與更早（7/1 之前）也都是空區間，
		// 三者各自的文案 MUST 不同：只驗其中一個區間時，把 range 參數忽略、寫死成
		// 單一文案照樣全綠（§3 出現過同型缺口）。
		for (const [rangeName, expectedText] of [
			["今日", "今日目前沒有任何對戰紀錄。"],
			["上月", "上月沒有任何對戰紀錄。"],
			["更早", "沒有更早的對戰紀錄。"],
		] as const) {
			await page.getByRole("radio", { name: rangeName }).click();
			await expect(page.getByTestId("empty-history-range")).toHaveText(expectedText);
		}

		await page.getByRole("radio", { name: "本週" }).click();

		// 本週如常列出該批紀錄：正向對照，證明不是整份資料都消失。
		for (const day of days) {
			await expect(page.getByTestId(`history-record-e2e-history-crossmonth-${day}`)).toBeVisible();
		}

		// design Decision 7：「現在」只在 hydration 取樣一次，之後的 render SHALL NOT
		// 再取時鐘。把假時鐘推到 2026-08-10（週一）——若元件在 render 期間重取，
		// 7/27～7/31 會被改判為「上月」，本週隨即變成空狀態而在此轉紅。
		await page.clock.setFixedTime(new Date(2026, 7, 10, 12, 0, 0));
		await page.getByRole("radio", { name: "本月" }).click();
		await page.getByRole("radio", { name: "本週" }).click();
		for (const day of days) {
			await expect(page.getByTestId(`history-record-e2e-history-crossmonth-${day}`)).toBeVisible();
		}
	});

	test("瀏覽與切換區間後 matchmaker:history:v1 內容不變", async ({ page }) => {
		// 種入的兩筆皆為合法紀錄（buildEntry 產出符合 schema 的形狀）：readHistory()
		// 只在 droppedCount > 0 時才會回寫清理後的歷史（round-storage.ts 第 142～147
		// 行），全數合法即可避免踩到 M4 的回寫路徑而讓「內容不變」誤判失守。
		const entries = [
			buildEntry({
				matchId: "e2e-history-readonly-1",
				playedAt: isoToday(9),
				teamA: [player("p-readonly-a1", "唯讀驗證員A1")],
				teamB: [player("p-readonly-b1", "唯讀驗證員B1")],
			}),
			buildEntry({
				matchId: "e2e-history-readonly-2",
				playedAt: isoLastMonth(),
				teamA: [player("p-readonly-a2", "唯讀驗證員A2")],
				teamB: [player("p-readonly-b2", "唯讀驗證員B2")],
			}),
		];
		const rawValue = JSON.stringify({ version: 1, entries });

		// 開頁前直接寫入並記下原始字串：與 seedHistory() 的 addInitScript 寫法
		// 不同，這裡刻意先 goto("/") 佔一次導覽，確保「記下開頁前的原始字串」
		// 這個動作真的發生在歷史頁載入之前，而不是與其競態。
		await page.goto("/");
		await page.evaluate(
			(arg: { key: string; value: string }) => {
				window.localStorage.setItem(arg.key, arg.value);
			},
			{ key: HISTORY_STORAGE_KEY, value: rawValue },
		);

		await page.goto(HISTORY_PAGE);
		await expect(page.getByText("唯讀驗證員A1")).toBeVisible();

		// 依序切換五個區間（含切回最初的今日）。
		for (const rangeName of ["本週", "本月", "上月", "更早", "今日"] as const) {
			await page.getByRole("radio", { name: rangeName }).click();
		}

		const afterValue = await page.evaluate(
			(key) => window.localStorage.getItem(key),
			HISTORY_STORAGE_KEY,
		);
		expect(afterValue).toBe(rawValue);
	});

	test("有損毀歷史紀錄時顯示提示且其餘紀錄正常顯示", async ({ page }) => {
		const validEntry = buildEntry({
			matchId: "e2e-history-valid-1",
			playedAt: isoToday(9),
			teamA: [player("p-valid-a", "損毀提示合法員A")],
			teamB: [player("p-valid-b", "損毀提示合法員B")],
		});
		// 刻意缺必要欄位（teamB）製造一筆不合法紀錄：外層容器 version 仍合法，
		// 只有這一筆個別紀錄不合法，readHistory() 會逐筆丟棄並回報 droppedCount。
		const corruptEntry = { matchId: "e2e-history-corrupt-1", playedAt: isoToday(9) };
		await seedHistory(page, [validEntry, corruptEntry]);

		await page.goto(HISTORY_PAGE);

		const alert = historyCorruptionAlert(page);
		await expect(alert).toBeVisible();
		await expect(alert).toContainText("1");
		await expect(alert).toContainText("損毀");
		await expect(alert).toContainText("歷史紀錄");
		// spec Scenario 1 的 THEN 除了損毀筆數，還要求「說明其餘紀錄不受影響」；
		// 前三條斷言擋不住把後半句拿掉的退化（例如只剩「有 N 筆損毀的歷史紀錄已略過。」），
		// 這裡直接鎖字面量文字，不引用 HistoryView.tsx 的字串（避免恆真同義反覆）。
		await expect(alert).toContainText("不受影響");
		// 合法那筆紀錄不受影響，正常顯示。
		await expect(page.getByText("損毀提示合法員A")).toBeVisible();
	});

	test("沒有損毀歷史紀錄時不顯示損毀提示", async ({ page }) => {
		await seedHistory(page, [
			buildEntry({
				matchId: "e2e-history-nodrop-1",
				playedAt: isoToday(9),
				teamA: [player("p-nodrop-a", "無損毀員A")],
				teamB: [player("p-nodrop-b", "無損毀員B")],
			}),
		]);

		await page.goto(HISTORY_PAGE);

		await expect(page.getByText("無損毀員A")).toBeVisible();
		await expect(historyCorruptionAlert(page)).toHaveCount(0);
	});

	test("紀錄於 hydration 後顯示且無 console error", async ({ page }) => {
		const consoleIssues = trackConsoleIssues(page);
		await seedHistory(page, [
			buildEntry({
				matchId: "e2e-history-hydration-1",
				playedAt: isoToday(9),
				teamA: [player("p-hydration-a", "hydration顯示員A")],
				teamB: [player("p-hydration-b", "hydration顯示員B")],
			}),
		]);

		await page.goto(HISTORY_PAGE);

		await expect(page.getByText("hydration顯示員A")).toBeVisible();

		expect(
			consoleIssues,
			`不應有 console error/warning：\n${consoleIssues.join("\n")}`,
		).toEqual([]);
	});
});
