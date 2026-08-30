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

// 最小的單打紀錄 fixture：欄位形狀複製自 lib/matchmaker/history.ts 的
// MatchHistoryEntrySchema（singles 分支）。跨月週測試只需分辨「哪幾筆該出現」，
// 不需要 8.2 全部欄位的細節斷言（那些由 4.5／4.6 的三個 test 專責覆蓋）。
function buildSinglesEntry(matchId: string, playedAt: string, playerName: string) {
	return {
		matchId,
		courtNumber: 1,
		playedAt,
		format: "singles" as const,
		teamA: {
			players: [{ id: `${matchId}-a`, name: playerName, ratingBefore: 3.5, ratingAfter: 3.6 }],
			rating: 3.5,
		},
		teamB: {
			players: [{ id: `${matchId}-b`, name: `${playerName}的對手`, ratingBefore: 3.4, ratingAfter: 3.3 }],
			rating: 3.4,
		},
		scoreA: 11,
		scoreB: 5,
		winner: "teamA" as const,
	};
}

test.describe("/matchmaker/history 對戰歷史頁", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/");
		await page.evaluate((key) => {
			window.localStorage.removeItem(key);
		}, HISTORY_STORAGE_KEY);
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
			{
				matchId: "e2e-history-today-1",
				courtNumber: 1,
				playedAt: isoToday(),
				format: "singles",
				teamA: {
					players: [{ id: "p-today-a", name: "今日對戰員A", ratingBefore: 3.5, ratingAfter: 3.6 }],
					rating: 3.5,
				},
				teamB: {
					players: [{ id: "p-today-b", name: "今日對戰員B", ratingBefore: 3.4, ratingAfter: 3.3 }],
					rating: 3.4,
				},
				scoreA: 11,
				scoreB: 5,
				winner: "teamA",
			},
			{
				matchId: "e2e-history-earlier-1",
				courtNumber: 1,
				playedAt: isoEarlier(),
				format: "singles",
				teamA: {
					players: [{ id: "p-earlier-a", name: "更早對戰員A", ratingBefore: 3.0, ratingAfter: 3.1 }],
					rating: 3.0,
				},
				teamB: {
					players: [{ id: "p-earlier-b", name: "更早對戰員B", ratingBefore: 3.2, ratingAfter: 3.1 }],
					rating: 3.2,
				},
				scoreA: 11,
				scoreB: 8,
				winner: "teamA",
			},
		]);

		await page.goto(HISTORY_PAGE);

		await expect(page.getByRole("radio", { name: "今日", checked: true })).toBeVisible();
		// 雙向斷言：該出現的今日紀錄出現，不該出現的更早紀錄消失。
		await expect(page.getByText("今日對戰員A")).toBeVisible();
		await expect(page.getByText("更早對戰員A")).toHaveCount(0);
	});

	test("切換區間後只顯示該區間的紀錄", async ({ page }) => {
		await seedHistory(page, [
			{
				matchId: "e2e-history-today-2",
				courtNumber: 1,
				playedAt: isoToday(),
				format: "singles",
				teamA: {
					players: [{ id: "p-today2-a", name: "今日對戰員C", ratingBefore: 3.5, ratingAfter: 3.6 }],
					rating: 3.5,
				},
				teamB: {
					players: [{ id: "p-today2-b", name: "今日對戰員D", ratingBefore: 3.4, ratingAfter: 3.3 }],
					rating: 3.4,
				},
				scoreA: 11,
				scoreB: 5,
				winner: "teamA",
			},
			{
				matchId: "e2e-history-lastmonth-1",
				courtNumber: 1,
				playedAt: isoLastMonth(),
				format: "singles",
				teamA: {
					players: [{ id: "p-lastmonth-a", name: "上月對戰員A", ratingBefore: 3.1, ratingAfter: 3.2 }],
					rating: 3.1,
				},
				teamB: {
					players: [{ id: "p-lastmonth-b", name: "上月對戰員B", ratingBefore: 3.3, ratingAfter: 3.2 }],
					rating: 3.3,
				},
				scoreA: 11,
				scoreB: 9,
				winner: "teamA",
			},
		]);

		await page.goto(HISTORY_PAGE);

		// 切換前：預設今日區間，今日紀錄可見、上月紀錄不可見。
		await expect(page.getByText("今日對戰員C")).toBeVisible();
		await expect(page.getByText("上月對戰員A")).toHaveCount(0);

		await page.getByRole("radio", { name: "上月" }).click();

		// 切換後：雙向斷言——上月紀錄出現，今日紀錄消失。
		await expect(page.getByText("上月對戰員A")).toBeVisible();
		await expect(page.getByText("今日對戰員C")).toHaveCount(0);
	});

	test("雙打紀錄顯示 8.2 全部欄位含雙打組成標示", async ({ page }) => {
		const matchId = "e2e-history-doubles-1";
		const playedAt = isoToday(14);
		await seedHistory(page, [
			{
				matchId,
				courtNumber: 3,
				playedAt,
				format: "doubles",
				doublesComposition: "mixed",
				teamA: {
					players: [
						{ id: "p-doubles-a1", name: "雙打今日員A1", ratingBefore: 4.0, ratingAfter: 4.1 },
						{ id: "p-doubles-a2", name: "雙打今日員A2", ratingBefore: 3.8, ratingAfter: 3.9 },
					],
					rating: 3.9,
				},
				teamB: {
					players: [
						{ id: "p-doubles-b1", name: "雙打今日員B1", ratingBefore: 3.5, ratingAfter: 3.4 },
						{ id: "p-doubles-b2", name: "雙打今日員B2", ratingBefore: 3.6, ratingAfter: 3.5 },
					],
					rating: 3.55,
				},
				scoreA: 11,
				scoreB: 7,
				winner: "teamA",
			},
		]);

		await page.goto(HISTORY_PAGE);

		const card = page.getByTestId(`history-record-${matchId}`);
		await expect(card).toBeVisible();
		// 對戰 ID、場地、對戰時間、對戰方式、雙打組成標示。
		await expect(card.getByText(matchId)).toBeVisible();
		await expect(card.getByText("第 3 場地")).toBeVisible();
		await expect(card.locator(`time[datetime="${playedAt}"]`)).toBeVisible();
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
	});

	test("單打紀錄不顯示雙打組成標示", async ({ page }) => {
		const matchId = "e2e-history-singles-1";
		await seedHistory(page, [
			{
				matchId,
				courtNumber: 2,
				playedAt: isoToday(15),
				format: "singles",
				teamA: {
					players: [{ id: "p-singles-a", name: "單打今日員A", ratingBefore: 3.7, ratingAfter: 3.8 }],
					rating: 3.7,
				},
				teamB: {
					players: [{ id: "p-singles-b", name: "單打今日員B", ratingBefore: 3.6, ratingAfter: 3.5 }],
					rating: 3.6,
				},
				scoreA: 11,
				scoreB: 9,
				winner: "teamA",
			},
		]);

		await page.goto(HISTORY_PAGE);

		const card = page.getByTestId(`history-record-${matchId}`);
		await expect(card).toBeVisible();
		await expect(card.getByText("單打", { exact: true })).toBeVisible();
		// 單打不得帶任何雙打組成標示文字（四種寫死文案逐一確認不存在）。
		for (const label of ["混雙", "男雙", "女雙", "一般雙打"]) {
			await expect(card.getByText(label)).toHaveCount(0);
		}
	});

	test("每位球員同時顯示賽前與賽後分數", async ({ page }) => {
		const matchId = "e2e-history-rating-1";
		await seedHistory(page, [
			{
				matchId,
				courtNumber: 1,
				playedAt: isoToday(16),
				format: "singles",
				teamA: {
					players: [{ id: "p-rating-a", name: "分數變化員A", ratingBefore: 4.2, ratingAfter: 4.35 }],
					rating: 4.2,
				},
				teamB: {
					players: [{ id: "p-rating-b", name: "分數變化員B", ratingBefore: 3.9, ratingAfter: 3.8 }],
					rating: 3.9,
				},
				scoreA: 11,
				scoreB: 6,
				winner: "teamA",
			},
		]);

		await page.goto(HISTORY_PAGE);

		const card = page.getByTestId(`history-record-${matchId}`);
		await expect(card.getByText("4.20")).toBeVisible();
		await expect(card.getByText("4.35")).toBeVisible();
	});

	test("跨月週時本月顯示空狀態而非錯誤", async ({ page }) => {
		const days = [27, 28, 29, 30, 31];
		const entries = days.map((day) =>
			buildSinglesEntry(`e2e-history-crossmonth-${day}`, isoCrossMonthWeek(day), `跨月週球員${day}`),
		);
		await seedHistory(page, entries);

		// MUST 在 page.goto() 之前呼叫：只固定 Date，不暫停 timer（design Risks）。
		await page.clock.setFixedTime(new Date(2026, 7, 1, 12, 0, 0));
		await page.goto(HISTORY_PAGE);

		await page.getByRole("radio", { name: "本月" }).click();

		// 本月為空：友善空狀態可見，且不出現任何錯誤字樣（正向斷言空狀態本身，
		// 不只是斷言「沒有錯誤」——避免頁面整個壞掉、什麼都沒 render 時誤判通過）。
		await expect(page.getByTestId("empty-history-range")).toBeVisible();
		await expect(page.getByTestId(/^history-record-e2e-history-crossmonth-/)).toHaveCount(0);
		const bodyText = await page.locator("body").innerText();
		expect(bodyText).not.toMatch(/Error/);

		await page.getByRole("radio", { name: "本週" }).click();

		// 本週如常列出該批紀錄：正向對照，證明不是整份資料都消失。
		for (const day of days) {
			await expect(page.getByTestId(`history-record-e2e-history-crossmonth-${day}`)).toBeVisible();
		}
	});
});
