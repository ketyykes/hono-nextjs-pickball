import { test, expect } from "@playwright/test";

// SiteNavbar 的窄螢幕行為。
//
// ⚠️ 驗收重點是「不換行」而非「不橫向溢出」。實測（vw=390）發現：
// header 是 flex 容器，logo 與 nav 會被壓縮到剛好填滿寬度，
// 因此 scrollWidth === clientWidth 恆成立、驗不出問題；
// 真正的破口是文字斷成兩行（logo 高度 20→40px、連結高度 36→56px），
// 塞在固定 h-14（56px）的 bar 裡。
//
// 只在 chromium 跑一次：這是排版行為，與瀏覽器引擎無關，
// 且 firefox/webkit/mobile-safari 的本機瀏覽器版本落後（見 archive 的已知問題）。
test.describe("SiteNavbar 窄螢幕呈現", () => {
	test.skip(
		({ browserName }) => browserName !== "chromium",
		"排版行為只需在 chromium 驗一次",
	);

	const NARROW = { width: 390, height: 844 }; // iPhone 12
	const WIDE = { width: 1280, height: 800 };

	async function measure(page: import("@playwright/test").Page) {
		return page.locator("header > div").evaluate((el) => {
			const nav = el.querySelector("nav") as HTMLElement;
			const logo = el.querySelector("a") as HTMLElement;
			const firstLink = nav.querySelector("a") as HTMLElement;
			return {
				logoHeight: Math.round(logo.getBoundingClientRect().height),
				linkHeight: Math.round(firstLink.getBoundingClientRect().height),
				scrollWidth: el.scrollWidth,
				clientWidth: el.clientWidth,
			};
		});
	}

	test("窄螢幕下 logo 與導航連結皆不換行", async ({ page }) => {
		await page.setViewportSize(WIDE);
		await page.goto("/");
		const wide = await measure(page);

		await page.setViewportSize(NARROW);
		const narrow = await measure(page);

		// 換行會讓高度倍增；容許 4px 誤差以吸收字型度量差異。
		expect(narrow.logoHeight).toBeLessThanOrEqual(wide.logoHeight + 4);
		expect(narrow.linkHeight).toBeLessThanOrEqual(wide.linkHeight + 4);
	});

	test("窄螢幕下導航列內容不橫向溢出", async ({ page }) => {
		await page.setViewportSize(NARROW);
		await page.goto("/");

		const { scrollWidth, clientWidth } = await measure(page);
		expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
	});

	test("窄螢幕下四個導航連結全部可見", async ({ page }) => {
		await page.setViewportSize(NARROW);
		await page.goto("/");

		for (const label of ["首頁", "完整體驗", "計分板", "測驗"]) {
			await expect(
				page.getByRole("link", { name: label, exact: true }),
			).toBeVisible();
		}
	});

	test("窄螢幕下對戰分配連結亦全部可見", async ({ page }) => {
		await page.setViewportSize(NARROW);
		await page.goto("/");

		const matchmakerLink = page.getByRole("link", {
			name: "對戰分配",
			exact: true,
		});
		await expect(matchmakerLink).toBeVisible();

		// 與其餘四條同列不換行：高度應與寬螢幕下一致（換行會讓高度倍增）。
		const narrowHeight = await matchmakerLink.evaluate(
			(el) => el.getBoundingClientRect().height,
		);

		await page.setViewportSize(WIDE);
		const wideHeight = await matchmakerLink.evaluate(
			(el) => el.getBoundingClientRect().height,
		);

		expect(narrowHeight).toBeLessThanOrEqual(wideHeight + 4);
	});

	test("寬螢幕顯示 logo 文字，窄螢幕收合只留圖示", async ({ page }) => {
		await page.setViewportSize(WIDE);
		await page.goto("/");
		await expect(page.locator("header").getByText("匹克球指南")).toBeVisible();

		await page.setViewportSize(NARROW);
		await expect(page.locator("header").getByText("匹克球指南")).toBeHidden();
	});
});
