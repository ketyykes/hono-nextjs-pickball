import { test, expect } from "@playwright/test";
import type { Page, Route } from "@playwright/test";

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
	const handler = async (route: Route) => {
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
					// waitReady 是 soft 斷言；等待失敗時頁面還停在 loading，前後量測會相同而全部通過，
					// 因此以錯誤數是否增加判斷等待是否成功，失敗就不做位移比較。
					const errorsBefore = test.info().errors.length;
					await branch.waitReady();
					if (test.info().errors.length > errorsBefore) return;
					const after = await measure(page);

					expectStable(before, after);
				} finally {
					await held.dispose();
				}
			});
		}
	});
});

// 各寬度的入口可見性是排版行為，與瀏覽器引擎無關，寫法同 navbar-rwd.spec.ts。
// 位移測試不放進這個 describe，才不會被這裡的 skip 波及。
test.describe("帳號入口各寬度呈現", () => {
	test.skip(
		({ browserName }) => browserName !== "chromium",
		"排版行為只需在 chromium 驗一次",
	);

	const NAV_LABELS = ["首頁", "完整體驗", "計分板", "測驗", "對戰分配"];
	const WIDTHS = [320, 375, 390, 640, 1280];
	const HEIGHT = 700;
	// 窄螢幕連結高度以 1280px 為基準，換行會讓高度倍增；容許 4px 誤差。
	const WRAP_TOLERANCE_PX = 4;

	test("各寬度下帳號入口與五個導航連結皆完整落在視口內且不溢出", async ({
		page,
	}) => {
		// 2 種狀態 × 5 種寬度、全為 soft 斷言；入口隱藏時每個 toBeInViewport 要等滿預設 5 秒，
		// 預設 30 秒會在列出所有失敗寬度前先逾時。
		test.setTimeout(90_000);
		let body: SessionBody = GUEST;
		await page.route("**/api/session", async (route: Route) => {
			await route.fulfill({ json: body });
		});

		const states = [
			{
				name: "guest：未登入",
				body: GUEST,
				entry: () =>
					page.locator("header").getByRole("link", { name: "登入", exact: true }),
			},
			{
				name: "user：已登入",
				body: USER,
				entry: () => page.locator("header").getByRole("button", { name: "登出" }),
			},
		];
		const navLink = (label: string) =>
			page.locator("header nav").getByRole("link", { name: label, exact: true });

		for (const state of states) {
			await test.step(state.name, async () => {
				body = state.body;
				await page.setViewportSize({ width: 1280, height: HEIGHT });
				await page.goto("/");
				const entry = state.entry();
				await expect(entry).toBeVisible({ timeout: SESSION_TIMEOUT });

				const wideHeights: Record<string, number> = {};
				for (const label of NAV_LABELS) {
					wideHeights[label] = await navLink(label).evaluate(
						(el) => el.getBoundingClientRect().height,
					);
				}

				for (const width of WIDTHS) {
					await test.step(`${width}px`, async () => {
						await page.setViewportSize({ width, height: HEIGHT });
						await fontsReady(page);

						await expect.soft(entry, "帳號入口").toBeInViewport({ ratio: 1 });
						for (const label of NAV_LABELS) {
							const link = navLink(label);
							await expect.soft(link, `「${label}」`).toBeInViewport({ ratio: 1 });
							const height = await link.evaluate(
								(el) => el.getBoundingClientRect().height,
							);
							expect
								.soft(height, `「${label}」高度（不換行）`)
								.toBeLessThanOrEqual(wideHeights[label] + WRAP_TOLERANCE_PX);
						}

						// 入口位於 <nav> 之後，右緣不應小於最後一個連結的右緣。
						// boundingBox 找不到元素會一路等到測試逾時，先以 count 判斷，失敗才能就地記錄。
						const entryBox =
							(await entry.count()) === 0 ? null : await entry.boundingBox();
						const matchmakerBox = await navLink("對戰分配").boundingBox();
						expect.soft(entryBox, "帳號入口 boundingBox").not.toBeNull();
						expect.soft(matchmakerBox, "對戰分配 boundingBox").not.toBeNull();
						if (entryBox !== null && matchmakerBox !== null) {
							expect
								.soft(entryBox.x + entryBox.width, "入口右緣不小於對戰分配右緣")
								.toBeGreaterThanOrEqual(matchmakerBox.x + matchmakerBox.width);
						}

						// 入口靠 nav 的 ml-auto 貼齊容器內容框右緣；內容溢出時會先吃掉容器右內距，
						// toBeInViewport 與 scrollWidth 都還看不出來，只有右緣超出內容框才抓得到。
						const contentRight = await page.locator("header > div").evaluate((el) => {
							const rect = el.getBoundingClientRect();
							return rect.right - Number.parseFloat(getComputedStyle(el).paddingRight);
						});
						if (entryBox !== null) {
							expect
								.soft(entryBox.x + entryBox.width, "入口右緣不超出容器內容框")
								.toBeLessThanOrEqual(contentRight + TOLERANCE_PX);
						}

						const overflow = await page.evaluate(() => {
							const container = document.querySelector("header > div");
							return {
								containerScroll: container?.scrollWidth ?? -1,
								containerClient: container?.clientWidth ?? -1,
								pageScroll: document.documentElement.scrollWidth,
								innerWidth: window.innerWidth,
							};
						});
						expect
							.soft(overflow.containerScroll, "header 內層容器 scrollWidth")
							.toBeLessThanOrEqual(overflow.containerClient);
						expect
							.soft(overflow.pageScroll, "頁面 scrollWidth")
							.toBeLessThanOrEqual(overflow.innerWidth);
					});
				}
			});
		}
	});
});
