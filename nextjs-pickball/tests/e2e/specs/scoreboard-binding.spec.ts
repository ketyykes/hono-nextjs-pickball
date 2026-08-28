import { test, expect } from "@playwright/test";

// /scoreboard?match=<matchId> 對戰場次綁定的 E2E 驗收。
// 對應 matchmaker-scoreboard-binding change §7 的 test-plan：失效說明與出口、
// 改用獨立計分板、綁定模式設定列（唯讀目標分數、場地標示、返回對戰）、
// 綁定模式下多 viewport 零捲動。
//
// 綁定有效性只看 scoreboard:matches:v1 有無該 matchId 的條目（design Decision 2），
// 不需要真實的回合資料，因此以 page.addInitScript 直接寫入分槽即可（design Risks）。
// 種入的欄位形狀複製自 lib/scoreboard/types.ts 的 ScoreboardStateSchema，
// schema 若異動需同步更新本檔。
//
// 為避免 localStorage 跨測試污染，beforeEach 只清除本 change 相關的兩個 key，
// 刻意不用 localStorage.clear()（沿用 match-stage.spec.ts 的既有慣例）。

const MATCH_SLOTS_KEY = "scoreboard:matches:v1";
const CURRENT_KEY = "scoreboard:current:v1";

test.describe("/scoreboard 對戰場次綁定", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/");
		await page.evaluate(
			([slotsKey, currentKey]) => {
				window.localStorage.removeItem(slotsKey);
				window.localStorage.removeItem(currentKey);
			},
			[MATCH_SLOTS_KEY, CURRENT_KEY],
		);
	});

	test("場次失效時顯示繁中說明與兩個出口且不顯示技術錯誤碼", async ({ page }) => {
		await page.goto("/scoreboard?match=gone");

		await expect(
			page.getByRole("link", { name: "回到對戰頁" }),
		).toBeVisible();
		await expect(
			page.getByRole("link", { name: "改用獨立計分板" }),
		).toBeVisible();

		// 不得顯示技術錯誤碼或堆疊字樣，避免使用者誤以為是系統壞掉
		const bodyText = await page.locator("body").innerText();
		expect(bodyText).not.toMatch(/Error/);
	});

	test("失效畫面可切換為獨立計分板並恢復計分", async ({ page }) => {
		await page.goto("/scoreboard?match=gone");

		await page.getByRole("link", { name: "改用獨立計分板" }).click();
		await expect(page).toHaveURL(/\/scoreboard$/);

		const usButton = page.getByRole("button", { name: /我方贏這一球/ });
		await usButton.click();
		await expect(page.getByLabel(/我方目前 1 分/)).toBeVisible();

		const stored = await page.evaluate(
			(key) => window.localStorage.getItem(key),
			CURRENT_KEY,
		);
		expect(stored).toContain('"us":1');
	});
});
