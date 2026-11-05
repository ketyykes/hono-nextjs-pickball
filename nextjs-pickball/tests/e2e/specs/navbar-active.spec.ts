import { test, expect } from "@playwright/test";

// 全站 navbar 的「目前所在區塊」標示。
//
// 參賽者頁同時有兩層導覽：全站 navbar 與頁內區段導覽。
// 兩者都用 aria-current="page" 表示目前位置，但各自獨立——navbar 標的是
// 「對戰分配」這個大區塊，區段導覽標的是其下的「參賽者」分頁。
// navbar 與區段導覽都有同名文字，所以 navbar 連結一律限定在 banner 內查找。
// 非 active 必須是「完全沒有屬性」，aria-current="false" 也算違規。
test.describe("SiteNavbar 目前頁標示", () => {
	test("參賽者頁的 navbar 對戰分配連結帶 aria-current", async ({ page }) => {
		await page.goto("/matchmaker/players");

		const header = page.getByRole("banner");
		await expect(header.getByRole("link", { name: "對戰分配", exact: true })).toHaveAttribute(
			"aria-current",
			"page",
		);
		await expect(header.getByRole("link", { name: "首頁", exact: true })).not.toHaveAttribute(
			"aria-current",
		);

		// 既有的區段導覽行為不應受影響
		const nav = page.getByRole("navigation", { name: "對戰分配區段導覽" });
		await expect(nav.getByRole("link", { name: "參賽者", exact: true })).toHaveAttribute(
			"aria-current",
			"page",
		);
		await expect(nav.getByRole("link", { name: "對戰", exact: true })).not.toHaveAttribute(
			"aria-current",
		);
	});
});
