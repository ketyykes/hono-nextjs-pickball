import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";

// 帳號入口在 /api/session 回應前後，五個導航連結與入口根元素的水平位置必須不變。
// 入口是否啟用只有回應後才知道，因此 guest、user、disabled 三種回應都要驗；
// 各分支一個 step、位移斷言用 expect.soft，一次執行就能看到每個分支的結果。
//
// 位移測試在所有 project 執行：各 project 的預設視口剛好涵蓋 1280／393／390px。
const TOLERANCE_PX = 0.5;
const SESSION_TIMEOUT = 15_000;

interface Box {
	x: number;
	width: number;
}

interface Snapshot {
	links: Array<Box & { label: string }>;
	entry: Box | null;
}

interface SessionBody {
	authEnabled: boolean;
	user: { id: string; email: string; name: string } | null;
}

const GUEST: SessionBody = { authEnabled: true, user: null };
const USER: SessionBody = {
	authEnabled: true,
	user: { id: "e2e-user", email: "e2e@example.com", name: "E2E 測試員" },
};
const DISABLED: SessionBody = { authEnabled: false, user: null };

// Noto Sans TC 由 next/font 載入；字型換上前後字寬不同，會讓量測出現與入口無關的差異。
async function fontsReady(page: Page): Promise<void> {
	await page.evaluate(async () => {
		await document.fonts.ready;
		return true;
	});
}

// 入口根元素用 `nav ~ *` 取得：`:last-child` 在入口不存在時會取到 <nav> 本身。
async function measure(page: Page): Promise<Snapshot> {
	await fontsReady(page);
	return page.evaluate(() => {
		const toBox = (el: Element) => {
			const rect = el.getBoundingClientRect();
			return { x: rect.x, width: rect.width };
		};
		const links = Array.from(
			document.querySelectorAll("header > div > nav a"),
		).map((link) => ({
			label: link.textContent ?? "",
			...toBox(link),
		}));
		const entry = document.querySelector("header > div > nav ~ *");
		return { links, entry: entry === null ? null : toBox(entry) };
	});
}

function expectStable(before: Snapshot, after: Snapshot): void {
	expect.soft(before.links, "載入中應有五個導航連結").toHaveLength(5);
	expect.soft(after.links, "放行後應有五個導航連結").toHaveLength(5);

	for (const [index, beforeLink] of before.links.entries()) {
		const afterLink = after.links[index];
		if (afterLink === undefined) continue;
		expect
			.soft(Math.abs(afterLink.x - beforeLink.x), `「${beforeLink.label}」x 位移量`)
			.toBeLessThanOrEqual(TOLERANCE_PX);
		expect
			.soft(
				Math.abs(afterLink.width - beforeLink.width),
				`「${beforeLink.label}」width 差`,
			)
			.toBeLessThanOrEqual(TOLERANCE_PX);
	}

	expect.soft(before.entry, "載入中帳號入口根元素應存在").not.toBeNull();
	expect.soft(after.entry, "放行後帳號入口根元素應存在").not.toBeNull();
	if (before.entry === null || after.entry === null) return;
	expect
		.soft(Math.abs(after.entry.x - before.entry.x), "帳號入口 x 位移量")
		.toBeLessThanOrEqual(TOLERANCE_PX);
	expect
		.soft(Math.abs(after.entry.width - before.entry.width), "帳號入口 width 差")
		.toBeLessThanOrEqual(TOLERANCE_PX);
}

// 攔住 /api/session 直到呼叫 release；每次呼叫都要在 step 結束前放行並 unroute，
// 否則 handler 會在測試結束時懸置。
async function holdSession(page: Page, body: SessionBody) {
	let release: () => void = () => {};
	const gate = new Promise<void>((resolve) => {
		release = resolve;
	});
	const handler = async (route: import("@playwright/test").Route) => {
		await gate;
		try {
			await route.fulfill({ json: body });
		} catch {
			// 頁面已換掉或關閉時請求會被取消，fulfill 失敗不影響測試結果。
		}
	};
	await page.route("**/api/session", handler);
	return {
		release,
		async dispose() {
			release();
			await page.unroute("**/api/session", handler);
		},
	};
}

test.describe("帳號入口位移", () => {
	test("帳號入口載入前後導航連結位置不變", async ({ page }) => {
		const branches: Array<{
			name: string;
			body: SessionBody;
			waitReady: () => Promise<void>;
		}> = [
			{
				name: "guest：未登入",
				body: GUEST,
				waitReady: () =>
					expect
						.soft(page.locator("header").getByRole("link", { name: "登入", exact: true }))
						.toBeVisible({ timeout: SESSION_TIMEOUT }),
			},
			{
				name: "user：已登入",
				body: USER,
				waitReady: () =>
					expect
						.soft(page.locator("header").getByRole("button", { name: "登出" }))
						.toBeVisible({ timeout: SESSION_TIMEOUT }),
			},
			{
				// 佔位元素是 visibility: hidden，用 toBeAttached 而非 toBeVisible。
				name: "disabled：未啟用",
				body: DISABLED,
				waitReady: () =>
					expect
						.soft(page.locator('[data-account-entry="disabled"]'))
						.toBeAttached({ timeout: SESSION_TIMEOUT }),
			},
		];

		for (const branch of branches) {
			await test.step(branch.name, async () => {
				const held = await holdSession(page, branch.body);
				try {
					await page.goto("/");
					const before = await measure(page);

					held.release();
					await branch.waitReady();
					const after = await measure(page);

					expectStable(before, after);
				} finally {
					await held.dispose();
				}
			});
		}
	});
});
