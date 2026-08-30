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
});
