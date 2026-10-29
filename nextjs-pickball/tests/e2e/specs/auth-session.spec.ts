import { existsSync } from "node:fs";
import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { AUTH_SKIP_REASON, storageStatePath } from "../helpers/storage-state";
import { readTestAccount } from "../helpers/test-account";

const WIDE = { width: 1280, height: 800 };
// 帳號入口與登入頁已登入分支都要等 hydration 後 /api/session 回應才渲染；
// 高負載時 reload 後實測 2～8 秒，預設 5 秒 expect timeout 不足。
// 導向 URL 的等待（dev server 首次編譯路由）同樣使用此值。
const SESSION_TIMEOUT = 15_000;
const expectSession = expect.configure({ timeout: SESSION_TIMEOUT });

// 登入／登出流程一律在新 context 走登入頁取得獨立 session，
// 不對共用 storage state 的 session 登出，否則同批其他測試的登入態會失效。
const guestState = { cookies: [], origins: [] };

function requireAccount() {
	const account = readTestAccount();
	if (account === null) {
		throw new Error("storage state 存在卻讀不到測試帳密");
	}
	return account;
}

async function loginViaUi(page: Page, password?: string) {
	const account = requireAccount();
	await page.goto("/login");
	await page.getByLabel("電子郵件").fill(account.email);
	await page.getByLabel("密碼").fill(password ?? account.password);
	await page.getByRole("button", { name: "登入", exact: true }).click();
}

test.describe("auth session", () => {
	// 以 callback 在執行期判斷：檔案是否存在取決於 globalSetup 的結果
	test.skip(() => !existsSync(storageStatePath), AUTH_SKIP_REASON);
	// dev server 首次編譯路由、firefox 載入偏慢，預設 30 秒在負載高的機器上不足
	test.describe.configure({ timeout: 60_000 });
	// 除「窄螢幕訪客」外，各 Scenario 以 viewport >= 640px 為前提；固定寬螢幕讓 mobile project 也驗同一寬度。
	test.use({ viewport: WIDE });

	test.describe("訪客", () => {
		test.use({ storageState: guestState });

		test("未登入時 navbar 顯示登入入口並可前往登入頁", async ({ page }) => {
			await page.goto("/");
			await page.locator("header").getByRole("link", { name: "登入" }).click();
			// dev server 首次編譯 /login 可能超過預設 5 秒
			await expect(page).toHaveURL("/login", { timeout: SESSION_TIMEOUT });
			await expectSession(page.getByLabel("電子郵件")).toBeVisible();
		});

		test("以測試帳號登入後 navbar 顯示登出", async ({ page }) => {
			await loginViaUi(page);
			await expect(page).toHaveURL("/", { timeout: SESSION_TIMEOUT });
			await expectSession(page.getByRole("button", { name: "登出" })).toBeVisible();
		});

		test("帳號或密碼錯誤時登入頁顯示錯誤訊息", async ({ page }) => {
			await loginViaUi(page, "definitely-wrong-password");
			await expect(page).toHaveURL("/login");
			await expect(page.getByText("帳號或密碼錯誤")).toBeVisible();
		});

		test("登出後 navbar 回到登入入口", async ({ page }) => {
			await loginViaUi(page);
			// 登入頁已登入時也有「登出」按鈕：須等導向首頁，並限定 header 內的入口，否則會同時比對到兩個。
			await expect(page).toHaveURL("/", { timeout: SESSION_TIMEOUT });
			await page.locator("header").getByRole("button", { name: "登出" }).click();
			const loginLink = page.locator("header").getByRole("link", { name: "登入" });
			await expectSession(loginLink).toBeVisible();
			// reload 證明 session 真的被撤銷，而非只改 UI
			await page.reload();
			await expectSession(loginLink).toBeVisible();
		});
	});

	test.describe("窄螢幕訪客", () => {
		test.use({ storageState: guestState, viewport: { width: 390, height: 800 } });

		test("窄螢幕下 navbar 登入入口可前往登入頁", async ({ page }) => {
			await page.goto("/");
			await page.locator("header").getByRole("link", { name: "登入" }).click();
			// dev server 首次編譯 /login 可能超過預設 5 秒
			await expect(page).toHaveURL("/login", { timeout: SESSION_TIMEOUT });
			await expectSession(page.getByLabel("電子郵件")).toBeVisible();
		});

		test("窄螢幕下可經由登入頁登入與登出", async ({ page }) => {
			await loginViaUi(page);
			await expect(page).toHaveURL("/", { timeout: SESSION_TIMEOUT });
			// 先等 header 的登出按鈕出現，才能確定「登入」連結的消失不是 session 尚未回應。
			await expectSession(
				page.locator("header").getByRole("button", { name: "登出" }),
			).toBeVisible();
			await expect(
				page.locator("header").getByRole("link", { name: "登入" }),
			).toBeHidden();

			// 登入頁已登入時 header 與 main 各有一個「登出」，須以 main 限定。
			await page.goto("/login");
			const main = page.getByRole("main");
			await expectSession(main.getByText("已登入：")).toBeVisible();
			await main.getByRole("button", { name: "登出" }).click();
			await expectSession(page.getByLabel("電子郵件")).toBeVisible();
			// reload 證明 session 真的被撤銷，而非只改 UI
			await page.reload();
			await expectSession(page.getByLabel("電子郵件")).toBeVisible();
		});
	});

	test.describe("已登入", () => {
		test.use({ storageState: storageStatePath });

		test("重整後仍維持登入", async ({ page }) => {
			await page.goto("/");
			await expectSession(page.getByRole("button", { name: "登出" })).toBeVisible();
			await page.reload();
			await expectSession(page.getByRole("button", { name: "登出" })).toBeVisible();
		});
	});
});
