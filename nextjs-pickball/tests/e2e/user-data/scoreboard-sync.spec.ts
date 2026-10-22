import { existsSync } from "node:fs";
import { test, expect, type Page, type Route } from "@playwright/test";
import { AUTH_SKIP_REASON, storageStatePath } from "../helpers/storage-state";
import { clearTestAccountUserData } from "../helpers/user-data";

// 登入後的獨立計分板以雲端為準。所有等待都以 data-sync-status 或 PUT 回應為依據，
// 不用固定延遲：已登入者在 /api/session 回應前會先看到本機計分，必須等同步狀態再操作。

const LS_KEY = "scoreboard:current:v1";
const SYNCED = '[data-sync-status="synced"]';
const CONFLICT = '[data-sync-status="conflict"]';
const LOADING = '[data-sync-status="loading"]';
const LOAD_FAILED = '[data-sync-status="load-failed"]';

test.use({ storageState: storageStatePath });
test.skip(() => !existsSync(storageStatePath), AUTH_SKIP_REASON);

test.beforeEach(() => {
	clearTestAccountUserData();
});

function isScoreboardPut(response: { url: () => string; request: () => { method: () => string } }) {
	return (
		response.url().endsWith("/api/scoreboard/current") &&
		response.request().method() === "PUT"
	);
}

// 得分一次並等到該次 PUT 完成；先等 PUT 再等 synced，避免在 saving 之前就讀到舊的 synced
async function scoreAndSync(page: Page) {
	await Promise.all([
		page.waitForResponse((response) => isScoreboardPut(response) && response.ok()),
		page.getByRole("button", { name: /我方贏這一球/ }).click(),
	]);
	await expect(page.locator(SYNCED)).toBeVisible();
}

test.describe("/scoreboard 雲端同步", () => {
	test("登入後計分在重新整理後由雲端還原且不寫入本機", async ({ page }) => {
		await page.goto("/scoreboard");
		await expect(page.locator(SYNCED)).toBeVisible();

		for (let i = 0; i < 3; i++) {
			await scoreAndSync(page);
		}
		await expect(page.getByLabel(/我方目前 3 分/)).toBeVisible();

		await page.reload();
		await expect(page.locator(SYNCED)).toBeVisible();
		await expect(page.getByLabel(/我方目前 3 分/)).toBeVisible();
		const stored = await page.evaluate((key) => window.localStorage.getItem(key), LS_KEY);
		expect(stored).toBeNull();
	});

	test("另一個瀏覽器 context 載入同一份雲端比分", async ({ page, browser }) => {
		await page.goto("/scoreboard");
		await expect(page.locator(SYNCED)).toBeVisible();
		await scoreAndSync(page);
		await scoreAndSync(page);

		const contextB = await browser.newContext({ storageState: storageStatePath });
		try {
			const pageB = await contextB.newPage();
			await pageB.goto("/scoreboard");
			await expect(pageB.locator(SYNCED)).toBeVisible();
			await expect(pageB.getByLabel(/我方目前 2 分/)).toBeVisible();
		} finally {
			await contextB.close();
		}
	});

	test("另一裝置先寫入時顯示衝突提示並載入最新比分", async ({ page, browser }) => {
		const contextB = await browser.newContext({ storageState: storageStatePath });
		try {
			const pageB = await contextB.newPage();
			// 兩邊都載入同一個版本（雲端為空）
			await page.goto("/scoreboard");
			await pageB.goto("/scoreboard");
			await expect(page.locator(SYNCED)).toBeVisible();
			await expect(pageB.locator(SYNCED)).toBeVisible();

			// A 先寫入兩分；兩分而非一分，才能區分「B 載入雲端」與「B 只剩自己的本機一分」
			await scoreAndSync(page);
			await scoreAndSync(page);

			// B 以過期版本得分 → 409 → 重新載入雲端
			await pageB.getByRole("button", { name: /我方贏這一球/ }).click();
			await expect(
				pageB.getByText("資料已在其他裝置更新，已重新載入最新資料"),
			).toBeVisible();
			await expect(pageB.locator(CONFLICT)).toBeVisible();
			await expect(pageB.getByLabel(/我方目前 2 分/)).toBeVisible();
		} finally {
			await contextB.close();
		}
	});

	test("儲存失敗時顯示重試提示並於恢復後自動送出", async ({ page }) => {
		await page.goto("/scoreboard");
		await expect(page.locator(SYNCED)).toBeVisible();

		const handler = async (route: Route) => {
			if (route.request().method() === "PUT") {
				await route.fulfill({ status: 503, body: "" });
				return;
			}
			await route.continue();
		};
		await page.route("**/api/scoreboard/current", handler);

		await page.getByRole("button", { name: /我方贏這一球/ }).click();
		await expect(page.getByText("尚未儲存到雲端，將自動重試")).toBeVisible();

		await page.unroute("**/api/scoreboard/current", handler);
		// 先等回到 synced，再斷言提示已消失（反過來會在提示消失前的瞬間誤判）
		await expect(page.locator(SYNCED)).toBeVisible();
		await expect(page.getByText("尚未儲存到雲端，將自動重試")).toHaveCount(0);

		await page.reload();
		await expect(page.locator(SYNCED)).toBeVisible();
		await expect(page.getByLabel(/我方目前 1 分/)).toBeVisible();
	});

	test("雲端載入失敗時顯示錯誤提示且不顯示計分畫面", async ({ page }) => {
		// 先把 GET 掛起，才能觀察 loading 階段；放行後才回 500
		let releaseGet: () => void = () => {};
		const getGate = new Promise<void>((resolve) => {
			releaseGet = resolve;
		});
		await page.route("**/api/scoreboard/current", async (route) => {
			if (route.request().method() === "GET") {
				await getGate;
				await route.fulfill({ status: 500, body: "" });
				return;
			}
			await route.continue();
		});

		await page.goto("/scoreboard");
		await expect(page.getByText("正在載入雲端資料…")).toBeVisible();
		await expect(page.locator(LOADING)).toBeVisible();
		await expect(page.getByRole("button", { name: /我方贏這一球/ })).toHaveCount(0);

		releaseGet();
		await expect(page.getByText("無法載入雲端資料，請重新整理頁面")).toBeVisible();
		await expect(page.locator(LOAD_FAILED)).toBeVisible();
		await expect(page.getByRole("button", { name: /我方贏這一球/ })).toHaveCount(0);
	});

	test("清空使用者資料後仍為登入態且雲端為初始比分", async ({ page }) => {
		await page.goto("/scoreboard");
		await expect(page.locator(SYNCED)).toBeVisible();
		await scoreAndSync(page);
		await expect(page.getByLabel(/我方目前 1 分/)).toBeVisible();

		clearTestAccountUserData();

		await page.reload();
		// session 未被清掉才會進入雲端模式；退回本機模式時不會有 data-sync-status
		await expect(page.locator(SYNCED)).toBeVisible();
		await expect(page.getByLabel(/我方目前 0 分/)).toBeVisible();
	});
});
