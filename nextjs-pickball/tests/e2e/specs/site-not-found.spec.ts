import { test, expect } from "@playwright/test";

// 全站 404 頁。
//
// 這裡刻意不使用 trackConsoleIssues：瀏覽器會把主文件的 404 回應記成
// console error，對本頁而言是預期行為，掛上去只會讓測試永遠失敗。
// 連結一律限定在 main 內查找，因為 navbar 也有「對戰分配」「首頁」等同名連結。
test.describe("全站 404 頁", () => {
	test("造訪不存在的路徑回應 404 並顯示中文說明與導回連結", async ({ page }) => {
		const response = await page.goto("/this-page-does-not-exist");
		expect(response?.status()).toBe(404);

		await expect(page).toHaveTitle("找不到頁面 | 匹克球指南");
		const main = page.getByRole("main");
		await expect(main.getByRole("heading", { name: "找不到這個頁面" })).toBeVisible();
		await expect(main.getByRole("link", { name: "回首頁", exact: true })).toBeVisible();
		await expect(main.getByRole("link", { name: "前往對戰分配", exact: true })).toBeVisible();
		await expect(page.getByText("This page could not be found")).toHaveCount(0);
		await expect(page.getByRole("banner")).toBeVisible();
	});

	test("404 頁點擊回首頁後導回首頁", async ({ page }) => {
		await page.goto("/this-page-does-not-exist");
		await page.getByRole("main").getByRole("link", { name: "回首頁", exact: true }).click();

		await expect(page).toHaveURL(/\/$/);
		await expect(page.getByRole("heading", { name: "找不到這個頁面" })).toHaveCount(0);
	});
});
