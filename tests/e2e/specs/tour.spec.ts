import { test, expect } from "@playwright/test";

// /tour 體驗 + Hero CTA 的端對端驗收
// - 對應 spec: tour-experience › 對應 E2E 驗收
// - 6 條 case 涵蓋：CTA 導向、Stage 1 標題、6 個 stage 容器排序、ClosingStage 返回鈕、Skip 跳過、reduced-motion 可讀性

// 6 個 stage 的 data-stage-id 與對應的 aria-label（與 stage 元件保持同步）
// 用於 reduced-motion 案例：逐一捲到並斷言對應 region + 內部代表性元素可見
const STAGE_ARIAS = [
	{
		id: "court-size",
		label: "比網球更小，但同樣激烈",
		innerText: "匹克球場",
	},
	{ id: "player-growth", label: "14 萬人正在打", innerText: "2025" },
	{
		id: "two-bounce",
		label: "兩跳規則，最關鍵的一條",
		innerText: "兩跳規則",
	},
	{
		id: "kitchen-violation",
		label: "廚房：站在裡面絕對不能截擊",
		innerText: "廚房 NVZ",
	},
	{ id: "materials-spectrum", label: "球拍材質光譜", innerText: "凱夫拉" },
	{ id: "closing", label: "準備好開始了嗎？", innerText: "回到完整指南" },
] as const;

test.describe("/tour 體驗", () => {
	test("首頁有 CTA 並能導向 /tour", async ({ page }) => {
		await page.goto("/");
		// CTA 內嵌於 Hero 內部主內容末段、由 staggerChildren 帶出後永遠可見
		// HeroTourCta 使用 Button asChild + Link，DOM 渲染為 <a>（role=link）走 Next.js view transition
		const cta = page.getByRole("link", { name: /進入完整體驗/ });
		await expect(cta).toBeVisible();
		await cta.click();
		await expect(page).toHaveURL(/\/tour$/);
		// 補：驗證 /tour 實際載入第一個 stage 容器
		await expect(page.locator('[data-stage-id="court-size"]')).toBeVisible();
	});

	test("/tour 載入後可見 Stage 1 標題", async ({ page }) => {
		await page.goto("/tour");
		await expect(page.getByText("比網球更小，")).toBeVisible();
	});

	test("DOM 中存在 6 個 data-stage-id 容器並依序排列", async ({ page }) => {
		await page.goto("/tour");
		const stages = page.locator("[data-stage-id]");
		await expect(stages).toHaveCount(6);
		const ids = await stages.evaluateAll((els) =>
			els.map((el) => el.getAttribute("data-stage-id")),
		);
		expect(ids).toEqual([
			"court-size",
			"player-growth",
			"two-bounce",
			"kitchen-violation",
			"materials-spectrum",
			"closing",
		]);
	});

	test("捲動到底可見 ClosingStage 與返回按鈕", async ({ page }) => {
		await page.goto("/tour");
		const main = page.locator("main");
		// scroll-snap 容器手動下捲到底
		await main.evaluate((el) => {
			el.scrollTo({ top: el.scrollHeight, behavior: "instant" as ScrollBehavior });
		});
		await expect(page.getByRole("button", { name: "回到完整指南" })).toBeVisible();
	});

	test("Skip 按鈕導向 /#court", async ({ page }) => {
		await page.goto("/tour");
		await page.getByRole("button", { name: /跳過/ }).click();
		await expect(page).toHaveURL(/\/#court$/);
		// 直接以 toBeInViewport 自動輪詢，移除脆弱的 waitForTimeout
		const courtSection = page.locator("#court");
		await expect(courtSection).toBeInViewport();
	});

	test("reduced motion 下 6 個 stage 內容仍可讀", async ({ browser }) => {
		const context = await browser.newContext({ reducedMotion: "reduce" });
		const page = await context.newPage();
		await page.goto("/tour");

		// 逐一捲到每個 stage 並斷言其 region（aria-label）+ 內部代表性元素可見
		// scroll-snap 容器內以 scrollIntoViewIfNeeded() 帶該 stage 進視窗
		// 內部元素檢查確保 reduced-motion 下動畫終點狀態可達（避免 fallback 留在起點 opacity 0）
		for (const stage of STAGE_ARIAS) {
			const el = page.locator(`[data-stage-id="${stage.id}"]`);
			await el.scrollIntoViewIfNeeded();
			await expect(el).toBeVisible();
			// <section aria-label="..."> 在 Playwright 對應 role=region
			await expect(page.getByRole("region", { name: stage.label })).toBeVisible();
			// 斷言 stage 內代表性文字可見（防止 reduced-motion 下 motion 元素停留在 opacity 0）
			await expect(el.getByText(stage.innerText, { exact: false }).first()).toBeVisible();
		}

		await context.close();
	});
});
