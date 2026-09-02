import { test, expect } from "@playwright/test";

// /matchmaker/data 資料工具頁的 E2E 驗收（M8 §8）。
// 本檔只涵蓋 §8.1 的兩個入口驗收 test；JSON／CSV 匯出入與清除本機資料的實際行為
// 由後續任務（§8.3 起）補上，本組只做骨架（page.tsx ＋ 四個區塊元件），
// 對應 delta spec `openspec/changes/matchmaker-data-transfer/specs/data-transfer/spec.md`
// 的頭兩個 Scenario。
//
// 本檔兩個 test 皆不讀寫 localStorage，故不需比照 matchmaker-history.spec.ts 的
// seedHistory／beforeEach 清理慣例；四個區塊標題與不對稱說明文字皆為靜態文案，
// 與本機資料狀態無關。

const MATCHMAKER_PAGE = "/matchmaker";
const DATA_PAGE = "/matchmaker/data";

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
});
