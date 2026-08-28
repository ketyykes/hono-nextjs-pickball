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

// 種入單一場次的分槽條目，欄位形狀複製自 ScoreboardStateSchema（見頁首註解）。
// 以 addInitScript 於頁面任何 script 執行前寫入，保證第一次載入就讀到綁定資料。
function seedMatchSlot(
	page: import("@playwright/test").Page,
	matchId: string,
	overrides: { targetScore?: 11 | 15 | 21; courtNumber?: number | null } = {},
) {
	const seed = {
		mode: "doubles",
		scores: { us: 0, them: 0 },
		servingTeam: "us",
		serverNumber: 2,
		isFirstServiceOfGame: true,
		history: [],
		status: "playing",
		winner: null,
		firstServer: "us",
		targetScore: overrides.targetScore ?? 15,
		matchId,
		courtNumber: overrides.courtNumber ?? 3,
	};
	return page.addInitScript(
		(arg: { key: string; id: string; state: unknown }) => {
			const raw = window.localStorage.getItem(arg.key);
			const slots = raw ? JSON.parse(raw) : {};
			slots[arg.id] = arg.state;
			window.localStorage.setItem(arg.key, JSON.stringify(slots));
		},
		{ key: MATCH_SLOTS_KEY, id: matchId, state: seed },
	);
}

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

	test("綁定模式設定列以唯讀文字顯示目標分數且無比賽形式下拉", async ({ page }) => {
		await seedMatchSlot(page, "m1", { targetScore: 15 });
		await page.goto("/scoreboard?match=m1");

		await expect(page.getByText("本輪 15 分制")).toBeVisible();
		await expect(page.getByRole("radiogroup", { name: "目標分數" })).toHaveCount(0);
		await expect(page.getByRole("combobox", { name: "比賽形式" })).toHaveCount(0);
	});

	test("綁定模式顯示場地標示且返回對戰可回到對戰頁", async ({ page }) => {
		await seedMatchSlot(page, "m1", { courtNumber: 3 });
		await page.goto("/scoreboard?match=m1");

		await expect(page.getByText("場地 3")).toBeVisible();
		await page.getByRole("link", { name: "返回對戰" }).click();
		await expect(page).toHaveURL(/\/matchmaker$/);
	});

	// design Decision 8：綁定模式設定列組成改變（少三顆按鈕、多場地標示與返回入口），
	// 既有的零捲動測試只驗過獨立模式 URL，不會自動覆蓋綁定 URL，故需在此重跑一次。
	test("綁定模式多 viewport 零捲動：整頁不可垂直捲動且核心按鈕完整可見", async ({
		page,
	}) => {
		await seedMatchSlot(page, "m1");

		const viewports = [
			{ width: 390, height: 844 }, // 手機直向
			{ width: 844, height: 390 }, // 手機橫向
			{ width: 768, height: 1024 }, // 平板直向
			{ width: 1024, height: 600 }, // 桌機臨界
		];
		for (const vp of viewports) {
			await page.setViewportSize(vp);
			await page.goto("/scoreboard?match=m1");
			await expect(page.getByText("我方", { exact: true })).toBeVisible();

			if (vp.width > vp.height) {
				await expect(
					page.getByRole("status").filter({ hasText: "建議橫向使用" }),
				).toBeHidden();
			}

			const { scrollHeight, clientHeight } = await page.evaluate(() => ({
				scrollHeight: document.scrollingElement!.scrollHeight,
				clientHeight: document.scrollingElement!.clientHeight,
			}));
			expect(
				scrollHeight,
				`${vp.width}x${vp.height} 不應有垂直捲動`,
			).toBeLessThanOrEqual(clientHeight + 1);

			const coreButtons = [
				page.getByRole("button", { name: /我方贏這一球/ }),
				page.getByRole("button", { name: /對方贏這一球/ }),
				page.getByRole("button", { name: "撤銷上一分" }),
				page.getByRole("button", { name: "重置比賽" }),
			];
			for (const button of coreButtons) {
				const box = await button.boundingBox();
				expect(box, `${vp.width}x${vp.height} 按鈕應可見`).not.toBeNull();
				if (box) {
					expect(box.y).toBeGreaterThanOrEqual(0);
					expect(box.y + box.height).toBeLessThanOrEqual(vp.height);
					expect(box.x).toBeGreaterThanOrEqual(0);
					expect(box.x + box.width).toBeLessThanOrEqual(vp.width);
				}
			}
		}
	});
});
