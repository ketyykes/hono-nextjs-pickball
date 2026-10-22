import { test, expect } from "@playwright/test";

// 訪客的 DOM 必須與雲端同步功能加入前相同：不渲染任何同步元素或屬性。

const SYNC_MESSAGES = [
	"正在載入雲端資料…",
	"尚未儲存到雲端，將自動重試",
	"資料已在其他裝置更新，已重新載入最新資料",
	"無法載入雲端資料，請重新整理頁面",
	"雲端拒絕儲存，請重新整理頁面",
];

test("訪客模式下計分板不渲染同步提示與 data-sync-status", async ({ page }) => {
	await page.goto("/");
	await page.evaluate(() => window.localStorage.clear());
	await page.goto("/scoreboard");

	await page.getByRole("button", { name: /我方贏這一球/ }).click();
	await expect(page.getByLabel(/我方目前 1 分/)).toBeVisible();

	await expect(page.locator("[data-sync-status]")).toHaveCount(0);
	// 單純加分不會觸發換發球 toast，所以頁面上不應有任何 role="status"；
	// 這能抓到「文案為 null 時仍渲染空容器」的情況
	await expect(page.getByRole("status")).toHaveCount(0);
	for (const message of SYNC_MESSAGES) {
		await expect(page.getByText(message)).toHaveCount(0);
	}
});
