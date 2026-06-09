import { test, expect } from "@playwright/test";

// /scoreboard 計分器頁的 E2E 驗收
// 對應 plan Task 26：navbar 進入、完整比賽到結束、Undo、二次確認重置、持久化、直式提示橫幅
//
// 注意 side-out 規則：我方先發、連續贏 11 球的劇本下接發方無法得分，
// 比分會直接從 0-0 跑到 11-0 觸發 GameOverDialog。
//
// 為避免 localStorage 跨測試污染，beforeEach 會清除 storage 與重新進入頁面。

const LS_KEY = "scoreboard:current:v1";

test.describe("/scoreboard 計分器", () => {
	test.beforeEach(async ({ page }) => {
		// 先到任一同 origin 的頁面，才能操作 localStorage（避免 about:blank）
		await page.goto("/");
		await page.evaluate(() => {
			window.localStorage.clear();
		});
	});

	test("從首頁 Navbar 可進入 /scoreboard 並顯示雙方面板", async ({ page }) => {
		await page.goto("/");
		await page.getByRole("link", { name: "計分板" }).click();
		await expect(page).toHaveURL(/\/scoreboard$/);
		await expect(page.getByText("我方", { exact: true })).toBeVisible();
		await expect(page.getByText("對方", { exact: true })).toBeVisible();
	});

	test("我方連贏 11 球觸發 GameOverDialog 顯示「🏆 我方獲勝」與「11 – 0」", async ({
		page,
	}) => {
		await page.goto("/scoreboard");
		const usButton = page.getByRole("button", { name: /我方贏這一球/ });

		// 按 11 次。每次按下後 aria-label 會更新，因此用 role+name 正則重新查詢
		for (let i = 0; i < 11; i++) {
			await usButton.click();
		}

		const dialog = page.getByRole("dialog", { name: /我方獲勝/ });
		await expect(dialog).toBeVisible();
		await expect(dialog.getByText("11 – 0")).toBeVisible();
	});

	test("Undo 可退回一分（按兩次得 2 → 撤銷後為 1）", async ({ page }) => {
		await page.goto("/scoreboard");
		const usButton = page.getByRole("button", { name: /我方贏這一球/ });

		await usButton.click();
		await usButton.click();
		await expect(page.getByLabel(/我方目前 2 分/)).toBeVisible();

		await page.getByRole("button", { name: "撤銷上一分" }).click();
		await expect(page.getByLabel(/我方目前 1 分/)).toBeVisible();
	});

	test("重置含二次確認；確認後 mode toggle 解鎖（enabled）", async ({ page }) => {
		await page.goto("/scoreboard");
		const usButton = page.getByRole("button", { name: /我方贏這一球/ });

		// 開賽得 1 分，確認 mode toggle 已 lock
		await usButton.click();
		await expect(page.getByRole("combobox", { name: "比賽形式" })).toBeDisabled();

		// 按重置 → 跳出 AlertDialog
		await page.getByRole("button", { name: "重置比賽" }).click();
		const alert = page.getByRole("alertdialog", { name: /確定要重置比賽/ });
		await expect(alert).toBeVisible();

		// 按「確定重置」→ dialog 關閉 + mode toggle 解鎖
		await alert.getByRole("button", { name: "確定重置" }).click();
		await expect(alert).toBeHidden();
		await expect(page.getByRole("combobox", { name: "比賽形式" })).toBeEnabled();
		await expect(page.getByLabel(/我方目前 0 分/)).toBeVisible();
	});

	test("localStorage 持久化：reload 後分數保留", async ({ page }) => {
			await page.goto("/scoreboard");
			const usButton = page.getByRole("button", { name: /我方贏這一球/ });
			await usButton.click();
			await usButton.click();
			await expect(page.getByLabel(/我方目前 2 分/)).toBeVisible();

			// 確認已寫進 localStorage
			const stored = await page.evaluate(
				(key) => window.localStorage.getItem(key),
				LS_KEY,
			);
			expect(stored).toContain('"us":2');

			await page.reload();
			await expect(page.getByLabel(/我方目前 2 分/)).toBeVisible();
		},
	);

	test("直式 viewport 顯示「💡 建議橫向使用」提示橫幅", async ({ page }) => {
		// 進頁前先清 sessionStorage 避免「關閉提示」狀態殘留
		await page.addInitScript(() => {
			window.sessionStorage.clear();
		});
		await page.setViewportSize({ width: 400, height: 800 });
		await page.goto("/scoreboard");
		const hint = page.getByRole("status").filter({ hasText: "建議橫向使用" });
		await expect(hint).toBeVisible();
	});
});
