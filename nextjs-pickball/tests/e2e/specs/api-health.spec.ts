import { test, expect } from "@playwright/test";

// 驗證 Next.js → service binding → Hono 的 API 通路。
// 需前後端 dev 同時運行（playwright.config.ts 的 webServer 陣列會自動帶起）。
// 通路與瀏覽器無關，只需在 chromium 執行一次。
test.describe("API health 通路", () => {
	test.skip(
		({ browserName }) => browserName !== "chromium",
		"API 通路測試只需在 chromium 執行一次",
	);

	// Test A：/health 頁面（Server Component 直連 binding）
	test("開 /health 頁面顯示 ok", async ({ page }) => {
		await page.goto("/health");
		const status = page.getByTestId("health-status");
		await expect(status).toHaveAttribute("data-status", "ok");
	});

	// Test B：/api/* proxy route（未來所有 API 都走這條 same-origin 通路）
	test("GET /api/health 經 proxy 回傳 status ok", async ({ request }) => {
		const res = await request.get("/api/health");
		expect(res.status()).toBe(200);
		const body = await res.json();
		expect(body.status).toBe("ok");
	});
});
