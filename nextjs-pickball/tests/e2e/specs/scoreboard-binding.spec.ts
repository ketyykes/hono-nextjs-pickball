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

// 零捲動驗收共用的四個 viewport（手機直向／手機橫向／平板直向／桌機臨界）
const VIEWPORTS = [
	{ width: 390, height: 844 },
	{ width: 844, height: 390 },
	{ width: 768, height: 1024 },
	{ width: 1024, height: 600 },
] as const;

// 種入單一場次的分槽條目，欄位形狀複製自 ScoreboardStateSchema（見頁首註解）。
// 以 addInitScript 於頁面任何 script 執行前寫入，保證第一次載入就讀到綁定資料。
function seedMatchSlot(
	page: import("@playwright/test").Page,
	matchId: string,
	overrides: { targetScore?: 11 | 15 | 21; courtNumber?: number | null } = {},
) {
	// courtNumber 用 in 判斷而非 ??：`?? 3` 會把明確傳入的 null 一併吃成 3，
	// 使「綁定但無場地編號」這個分支在測試裡根本無法表達（Stage 2 mutation 補洞）。
	const courtNumber = "courtNumber" in overrides ? overrides.courtNumber : 3;
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
		courtNumber,
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

		// Stage 2 mutation 補洞：原本只斷言兩個出口，把標題與說明段落整段刪掉仍全綠——
		// 但 test 名稱要求的正是「顯示繁中說明」，需要對文案本身的正向斷言。
		await expect(page.getByText("這場比賽目前無法計分")).toBeVisible();
		await expect(
			page.getByText(/可能是本輪已重新配對，或該場次已被刪除。/),
		).toBeVisible();
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
		// targetScore 刻意選 21（不同於 seed 預設的 15、也不同於 courtNumber 與
		// createInitialState 的 11），否則把「本輪 {targetScore} 分制」寫死成常數
		// 或改讀 courtNumber 都能蒙混過關（Stage 2 mutation 補洞）
		await seedMatchSlot(page, "m1", { targetScore: 21, courtNumber: 7 });
		await page.goto("/scoreboard?match=m1");

		await expect(page.getByText("本輪 21 分制")).toBeVisible();
		await expect(page.getByRole("radiogroup", { name: "目標分數" })).toHaveCount(0);
		await expect(page.getByRole("combobox", { name: "比賽形式" })).toHaveCount(0);
	});

	test("綁定模式顯示場地標示且返回對戰可回到對戰頁", async ({ page }) => {
		// courtNumber 刻意選 7（不同於 seed 預設的 3、也不同於 targetScore 的 15），
		// 否則把「場地 {courtNumber}」寫死成常數 3 或改讀 targetScore 都能蒙混過關
		// （Stage 2 mutation 補洞）
		await seedMatchSlot(page, "m1", { courtNumber: 7, targetScore: 15 });
		await page.goto("/scoreboard?match=m1");

		await expect(page.getByText("場地 7")).toBeVisible();
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

	// Stage 2 mutation 補洞：page.tsx 的 `Array.isArray(rawMatch) ? rawMatch[0] : rawMatch`
	// 收斂零覆蓋——改成直接 `rawMatch as string` 後全套仍綠。同名 query 重複出現時
	// searchParams 的值為 string[]，未收斂會把整個陣列當成 matchId，分槽查不到而
	// 把合法場次誤判為失效。
	test("match query 重複出現時取第一個值仍能綁定該場次", async ({ page }) => {
		await seedMatchSlot(page, "m1", { courtNumber: 7 });
		await page.goto("/scoreboard?match=m1&match=zzz");

		await expect(page.getByText("場地 7")).toBeVisible();
		// 正向對照：確實進到綁定模式，而不是因為選不到元素才「通過」
		await expect(page.getByRole("link", { name: "返回對戰" })).toBeVisible();
		await expect(page.getByRole("link", { name: "回到對戰頁" })).toHaveCount(0);
	});

	// Stage 2 mutation 補洞：courtNumber 為 null 的綁定場次（該場尚未指派場地）零覆蓋——
	// 原本的 seedMatchSlot 連 null 都表達不出來（`?? 3` 會吃掉）。此分支比一般綁定模式
	// 少渲染一個節點，需一併確認設定列其餘部分仍在、且高度預算不因此走樣。
	test("綁定模式 courtNumber 為 null 時不渲染場地標示且維持零捲動", async ({
		page,
	}) => {
		await seedMatchSlot(page, "m1", { courtNumber: null, targetScore: 21 });

		for (const vp of VIEWPORTS) {
			await page.setViewportSize(vp);
			await page.goto("/scoreboard?match=m1");

			// 先釘住綁定模式的其餘節點，下面的 toHaveCount(0) 才有對照、
			// 不會變成「選不到元素就自動通過」
			await expect(page.getByText("本輪 21 分制")).toBeVisible();
			await expect(page.getByRole("link", { name: "返回對戰" })).toBeVisible();
			await expect(page.getByText(/^場地/)).toHaveCount(0);

			const { scrollHeight, clientHeight } = await page.evaluate(() => ({
				scrollHeight: document.scrollingElement!.scrollHeight,
				clientHeight: document.scrollingElement!.clientHeight,
			}));
			expect(
				scrollHeight,
				`${vp.width}x${vp.height} 不應有垂直捲動`,
			).toBeLessThanOrEqual(clientHeight + 1);
		}
	});

	// Stage 2 checklist 補洞：失效說明畫面自成一個 h-dvh 容器，不共用計分板本體的
	// 高度預算，既有零捲動測試（只跑計分板本體）完全涵蓋不到它——往說明裡加內容
	// 會靜默溢出。
	test("場次失效畫面多 viewport 零捲動", async ({ page }) => {
		for (const vp of VIEWPORTS) {
			await page.setViewportSize(vp);
			await page.goto("/scoreboard?match=gone");

			await expect(page.getByRole("link", { name: "回到對戰頁" })).toBeVisible();
			await expect(
				page.getByRole("link", { name: "改用獨立計分板" }),
			).toBeVisible();

			const { scrollHeight, clientHeight } = await page.evaluate(() => ({
				scrollHeight: document.scrollingElement!.scrollHeight,
				clientHeight: document.scrollingElement!.clientHeight,
			}));
			expect(
				scrollHeight,
				`${vp.width}x${vp.height} 失效畫面不應有垂直捲動`,
			).toBeLessThanOrEqual(clientHeight + 1);
		}
	});
});
