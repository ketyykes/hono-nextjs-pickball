import { existsSync } from "node:fs";
import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { AUTH_SKIP_REASON, storageStatePath } from "../helpers/storage-state";
import { readTestAccount } from "../helpers/test-account";

const NAV_LABELS = ["首頁", "完整體驗", "計分板", "測驗", "對戰分配"];
const WIDE = { width: 1280, height: 800 };
// 帳號入口 < sm（640px）隱藏；以下寬度驗證隱藏，640 以上驗證顯示。
const HIDDEN_WIDTHS = [320, 375, 390];
const VISIBLE_WIDTHS = [640, 1280];
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
	// 預設 mobile-chrome 的視口 < 640px 會隱藏帳號入口；依賴 navbar 入口的 test 固定寬螢幕。
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

		test("窄螢幕下隱藏帳號入口且五個導航連結皆完整落在視口內", async ({
			page,
			browserName,
		}) => {
			test.skip(browserName !== "chromium", "排版行為只需在 chromium 驗一次");
			const loginLink = page.locator("header").getByRole("link", { name: "登入" });
			const navLink = (label: string) =>
				page.getByRole("link", { name: label, exact: true });

			await page.setViewportSize(WIDE);
			await page.goto("/");
			await expectSession(loginLink).toBeVisible();
			const wideHeights: Record<string, number> = {};
			for (const label of NAV_LABELS) {
				wideHeights[label] = await navLink(label).evaluate(
					(el) => el.getBoundingClientRect().height,
				);
			}

			for (const width of HIDDEN_WIDTHS) {
				await page.setViewportSize({ width, height: 700 });
				await expect(loginLink).toBeHidden();
				for (const label of NAV_LABELS) {
					await expect(navLink(label)).toBeInViewport({ ratio: 1 });
					const height = await navLink(label).evaluate(
						(el) => el.getBoundingClientRect().height,
					);
					expect(height).toBeLessThanOrEqual(wideHeights[label] + 4);
				}
			}

			for (const width of VISIBLE_WIDTHS) {
				await page.setViewportSize({ width, height: 700 });
				await expect(loginLink).toBeVisible();
				await expect(loginLink).toBeInViewport({ ratio: 1 });
				// 入口須在 <nav> 之後（位於最右），驗證接線位置
				const loginBox = await loginLink.boundingBox();
				const matchmakerBox = await navLink("對戰分配").boundingBox();
				expect(loginBox).not.toBeNull();
				expect(matchmakerBox).not.toBeNull();
				expect(loginBox!.x + loginBox!.width).toBeGreaterThanOrEqual(
					matchmakerBox!.x + matchmakerBox!.width,
				);
			}
		});
	});

	test.describe("窄螢幕訪客", () => {
		test.use({ storageState: guestState, viewport: { width: 390, height: 800 } });

		test("窄螢幕下可經由登入頁登入與登出", async ({ page }) => {
			await loginViaUi(page);
			await expect(page).toHaveURL("/", { timeout: SESSION_TIMEOUT });
			await expect(
				page.locator("header").getByRole("link", { name: "登入" }),
			).toBeHidden();
			await expect(page.locator("header").getByRole("button", { name: "登出" })).toBeHidden();

			await page.goto("/login");
			await expectSession(page.getByText("已登入：")).toBeVisible();
			await page.getByRole("button", { name: "登出" }).click();
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
