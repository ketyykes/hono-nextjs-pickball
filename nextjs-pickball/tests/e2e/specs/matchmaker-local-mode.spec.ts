import { test, expect } from "@playwright/test";

// 訪客的 DOM 必須與雲端同步功能加入前相同：matchmaker 三頁不渲染任何同步元素或屬性。
// 本檔不帶 storageState，確保以訪客身分執行。
// regression guard：寫入時即綠，防止日後 local 模式誤輸出 data-sync-status。

const SYNC_MESSAGES = [
	"正在載入雲端資料…",
	"尚未儲存到雲端，將自動重試",
	"資料已在其他裝置更新，已重新載入最新資料",
	"無法載入雲端資料，請重新整理頁面",
	"雲端拒絕儲存，請重新整理頁面",
];

const PAGES = [
	{ path: "/matchmaker", heading: "對戰分配" },
	{ path: "/matchmaker/players", heading: "參賽者名單" },
	{ path: "/matchmaker/stats", heading: "球員統計" },
];

for (const { path, heading } of PAGES) {
	test(`訪客模式下 ${path} 不渲染同步提示與 data-sync-status`, async ({ page }) => {
		await page.goto(path);
		await expect(page.getByRole("heading", { name: heading, level: 1 })).toBeVisible();

		await expect(page.locator("[data-sync-status]")).toHaveCount(0);
		await expect(page.getByRole("status")).toHaveCount(0);
		for (const message of SYNC_MESSAGES) {
			await expect(page.getByText(message)).toHaveCount(0);
		}
	});
}
