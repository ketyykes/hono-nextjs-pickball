import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";

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
const ROSTER_STORAGE_KEY = "matchmaker:roster:v1";
const ROUND_STORAGE_KEY = "matchmaker:round:v1";
const HISTORY_STORAGE_KEY = "matchmaker:history:v1";

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

// /matchmaker 對戰頁的計分板接線 E2E 驗收（§8）。
// 對應 test-plan：計分中標示與當前比分、離開後再進入接續、多場地互不覆蓋、
// 回填後轉為已完成、已完成場次不顯示入口、鎖定說明、手動輸入路徑不受影響、
// 重設本輪後舊連結顯示失效說明。
//
// 前置以真實路徑鋪設（建立參賽者 → 產生本輪對戰，見 seedRoster／generateRound），
// 沿用 match-stage.spec.ts 的既有慣例（seedRoster 用 addInitScript）。matchId 由
// crypto.randomUUID() 產生，測試無法預先得知，改由 courtMatchId() 從 CourtCard
// 既有的 data-testid（`court-${match.id}-grid`）反解析取得（design Risks：
// 能用 UI 操作產生的狀態優先用 UI 操作）。
//
// 種入「計分中」的槽狀態時改用 page.evaluate 直接寫 localStorage（而非
// addInitScript）：此時頁面已完成一次真實的產生本輪對戰，需要在既有頁面基礎上
// 疊加一個槽，而非在下一次載入前重新佔用整個 localStorage。槽欄位形狀複製自
// lib/scoreboard/types.ts 的 ScoreboardStateSchema（同上方 seedMatchSlot() 的
// 既有慣例），schema 若異動需同步更新本檔。
test.describe("/matchmaker 對戰頁的計分板接線", () => {
	function buildTestPlayer(index: number) {
		return {
			id: `e2e-binding-player-${index}`,
			name: `計分板測試員${index}`,
			gender: "other" as const,
			colorFrom: "#4f46e5",
			colorTo: "#818cf8",
			rating: 5,
			restCount: 0,
			gamesPlayed: 0,
			isActive: true,
			createdAt: "2026-01-01T00:00:00.000Z",
		};
	}

	async function seedRoster(page: Page, count: number): Promise<void> {
		const players = Array.from({ length: count }, (_, i) => buildTestPlayer(i + 1));
		await page.addInitScript(
			({ key, value }) => {
				window.localStorage.setItem(key, value);
			},
			{ key: ROSTER_STORAGE_KEY, value: JSON.stringify({ version: 1, players }) },
		);
	}

	async function generateRound(page: Page, courtCount = 1): Promise<void> {
		await page.goto("/matchmaker");
		for (let i = 1; i < courtCount; i++) {
			await page.getByRole("button", { name: "增加場地數" }).click();
		}
		await page.getByRole("button", { name: "產生本輪對戰" }).click();
		await expect(
			page.getByTestId("match-stage-courts").locator('[data-testid$="-grid"]'),
		).toHaveCount(courtCount);
	}

	// 從場地色塊既有的 data-testid（`court-${match.id}-grid`）反解析出 matchId——
	// 貪婪比對 `.*` 再要求結尾為 `-grid` 是刻意的：matchId 本身（crypto.randomUUID()）
	// 含連字號，非貪婪比對會在第一個連字號就截斷，取到錯誤的子字串。
	async function courtMatchId(page: Page, courtIndex: number): Promise<string> {
		const grids = page.getByTestId("match-stage-courts").locator('[data-testid$="-grid"]');
		const testId = await grids.nth(courtIndex).getAttribute("data-testid");
		const match = /^court-(.*)-grid$/.exec(testId ?? "");
		if (!match) {
			throw new Error(`無法從 data-testid 解析 matchId：${String(testId)}`);
		}
		return match[1];
	}

	// 直接寫入單一場次的計分板槽（模擬「已在場邊計分到一半」的既有進度），
	// 欄位形狀複製自 ScoreboardStateSchema（見本 describe 頁首註解）。
	async function writeMatchSlot(
		page: Page,
		matchId: string,
		overrides: {
			scores: { us: number; them: number };
			status?: "setup" | "playing" | "finished";
			targetScore?: 11 | 15 | 21;
			courtNumber?: number | null;
		},
	): Promise<void> {
		await page.evaluate(
			(arg: { key: string; id: string; state: unknown }) => {
				const raw = window.localStorage.getItem(arg.key);
				const slots = raw ? JSON.parse(raw) : {};
				slots[arg.id] = arg.state;
				window.localStorage.setItem(arg.key, JSON.stringify(slots));
			},
			{
				key: MATCH_SLOTS_KEY,
				id: matchId,
				state: {
					mode: "singles",
					scores: overrides.scores,
					servingTeam: "us",
					serverNumber: 2,
					isFirstServiceOfGame: true,
					history: [],
					status: overrides.status ?? "playing",
					winner: null,
					firstServer: "us",
					targetScore: overrides.targetScore ?? 11,
					matchId,
					courtNumber: overrides.courtNumber ?? null,
				},
			},
		);
	}

	async function clickWin(page: Page, side: "us" | "them", times: number): Promise<void> {
		const label = side === "us" ? /我方贏這一球/ : /對方贏這一球/;
		const button = page.getByRole("button", { name: label });
		for (let i = 0; i < times; i++) {
			await button.click();
		}
	}

	test.beforeEach(async ({ page }) => {
		await page.goto("/");
		await page.evaluate(
			(keys) => {
				for (const key of keys) window.localStorage.removeItem(key);
			},
			[MATCH_SLOTS_KEY, CURRENT_KEY, ROSTER_STORAGE_KEY, ROUND_STORAGE_KEY, HISTORY_STORAGE_KEY],
		);
	});

	test("計分中的場次顯示計分中標示與當前比分", async ({ page }) => {
		await seedRoster(page, 4);
		await generateRound(page, 2);
		const matchId = await courtMatchId(page, 1);

		await writeMatchSlot(page, matchId, { scores: { us: 8, them: 5 }, status: "playing" });
		await page.reload();

		const court = page.getByTestId(`court-${matchId}`);
		await expect(court.getByText("計分中")).toBeVisible();
		await expect(court.getByText("8:5")).toBeVisible();
		await expect(court.getByRole("link", { name: "繼續計分" })).toBeVisible();
	});

	test("未完成的計分進度可離開後再進入接續", async ({ page }) => {
		await seedRoster(page, 4);
		await generateRound(page, 2);
		const matchId = await courtMatchId(page, 1);
		const court = page.getByTestId(`court-${matchId}`);

		await court.getByRole("link", { name: "進入計分板" }).click();
		await expect(page).toHaveURL(new RegExp(`/scoreboard\\?match=${matchId}$`));
		await clickWin(page, "us", 8);
		// side-out 記分：我方先發、連贏 8 球後我方持續發球（比分 8:0）；接下來對方
		// 第 1 次贏球只換發球權不得分，第 2～6 次贏球才各 +1 分——6 次點擊使對方得 5 分
		// （見 tasks.md §8 開工盤點的實測與 lib/scoreboard/rules.ts 的 applyRallyResult）。
		await clickWin(page, "them", 6);
		await page.getByRole("link", { name: "返回對戰" }).click();
		await expect(page).toHaveURL(/\/matchmaker$/);

		await court.getByRole("link", { name: "繼續計分" }).click();
		await expect(page).toHaveURL(new RegExp(`/scoreboard\\?match=${matchId}$`));
		await expect(page.getByLabel(/我方目前 8 分/)).toBeVisible();
		await expect(page.getByLabel(/對方目前 5 分/)).toBeVisible();
		// targetScore 仍為該輪設定值（createRoundSettings 預設 11）——確認接續進入時
		// 沒有被覆蓋成別的值（見 spec「已有進度時再次進入不覆蓋」）。
		await expect(page.getByText("本輪 11 分制")).toBeVisible();
	});

	test("多場地同時計分時各場進度互不覆蓋", async ({ page }) => {
		await seedRoster(page, 4);
		await generateRound(page, 2);
		const matchId1 = await courtMatchId(page, 0);
		const matchId2 = await courtMatchId(page, 1);
		const court1 = page.getByTestId(`court-${matchId1}`);
		const court2 = page.getByTestId(`court-${matchId2}`);

		await court1.getByRole("link", { name: "進入計分板" }).click();
		await expect(page).toHaveURL(new RegExp(`/scoreboard\\?match=${matchId1}$`));
		await clickWin(page, "us", 5);
		// side-out 記分：對方第 1 次贏球只換發球權不得分，故需點擊 3 次才能讓對方
		// 得 2 分（同上方測試的計算方式）。
		await clickWin(page, "them", 3);
		await page.getByRole("link", { name: "返回對戰" }).click();
		await expect(page).toHaveURL(/\/matchmaker$/);

		await court2.getByRole("link", { name: "進入計分板" }).click();
		await expect(page).toHaveURL(new RegExp(`/scoreboard\\?match=${matchId2}$`));
		await clickWin(page, "us", 3);
		await clickWin(page, "them", 2);
		await page.getByRole("link", { name: "返回對戰" }).click();
		await expect(page).toHaveURL(/\/matchmaker$/);

		await expect(court1.getByText("5:2")).toBeVisible();
		await expect(court2.getByText("3:1")).toBeVisible();

		await court1.getByRole("link", { name: "繼續計分" }).click();
		await expect(page.getByLabel(/我方目前 5 分/)).toBeVisible();
		await expect(page.getByLabel(/對方目前 2 分/)).toBeVisible();
	});

	test("由計分板判定勝負後返回，比分自動回填且該場轉為已完成", async ({ page }) => {
		await seedRoster(page, 4);
		// 兩個場地：第二場用來驗證回填只清除該場次的槽，不動其他場次的槽
		// （spec「回填後清除該場次的計分板槽」Scenario 的「其他場次的條目不受影響」半句，
		// 只用一個場次時沒有「其他場次」可供斷言，Stage 1 review 判定為零覆蓋）。
		await generateRound(page, 2);
		const matchId = await courtMatchId(page, 0);
		const otherMatchId = await courtMatchId(page, 1);
		const court = page.getByTestId(`court-${matchId}`);

		const otherScores = { us: 3, them: 1 };
		await writeMatchSlot(page, otherMatchId, { scores: otherScores, status: "playing" });

		await court.getByRole("link", { name: "進入計分板" }).click();
		await expect(page).toHaveURL(new RegExp(`/scoreboard\\?match=${matchId}$`));
		// 11 分制下我方連贏 11 球（side-out：對方全程未曾發球，得 0 分）觸發 GameOverDialog。
		await clickWin(page, "us", 11);
		await page.getByRole("button", { name: "關閉" }).click();
		await page.getByRole("link", { name: "返回對戰" }).click();
		await expect(page).toHaveURL(/\/matchmaker$/);

		// E2E 由計分板完成一場並回填：對戰頁顯示最終比分、勝方與已完成樣式，且不再提供入口。
		await expect(court.getByTestId(`court-${matchId}-score`)).toHaveText("11:0");
		await expect(court.getByTestId(`court-${matchId}-team-a`)).toHaveText("第一隊勝");
		await expect(court.getByRole("link", { name: "進入計分板" })).toHaveCount(0);
		await expect(court.getByRole("link", { name: "繼續計分" })).toHaveCount(0);

		// 回填後清除該場次的計分板槽：scoreboard:matches:v1 內該條目被移除，
		// 其他場次的條目不受影響——逐欄比對 scores 而非只斷言 key 存在，否則
		// 「清槽時把其他槽的內容清空但保留 key」這種壞法會存活。
		const slots = await page.evaluate(
			(key) => window.localStorage.getItem(key),
			MATCH_SLOTS_KEY,
		);
		const parsedSlots: Record<string, { scores?: unknown }> = slots ? JSON.parse(slots) : {};
		expect(Object.prototype.hasOwnProperty.call(parsedSlots, matchId)).toBe(false);
		expect(Object.prototype.hasOwnProperty.call(parsedSlots, otherMatchId)).toBe(true);
		expect(parsedSlots[otherMatchId].scores).toEqual(otherScores);
	});

	test("已完成場次不顯示進入計分板入口", async ({ page }) => {
		await seedRoster(page, 4);
		await generateRound(page, 1);
		const matchId = await courtMatchId(page, 0);
		const court = page.getByTestId(`court-${matchId}`);

		// 不經計分板，直接以手動輸入完成該場（prd.md 6.3 的 fallback 路徑）。
		await court.getByLabel("第一隊比分").fill("11");
		await court.getByLabel("第二隊比分").fill("5");
		await court.getByRole("button", { name: "送出比分" }).click();

		await expect(court.getByTestId(`court-${matchId}-score`)).toHaveText("11:5");
		await expect(court.getByRole("link", { name: "進入計分板" })).toHaveCount(0);
		await expect(court.getByRole("link", { name: "繼續計分" })).toHaveCount(0);
	});

	test("本輪開始計分後目標分數控制項停用並說明原因", async ({ page }) => {
		await seedRoster(page, 4);
		await generateRound(page, 1);
		const matchId = await courtMatchId(page, 0);
		const court = page.getByTestId(`court-${matchId}`);

		// 進入計分板打一球即視為「已開始計分」（isTargetScoreLocked：任一計分板槽
		// status !== "setup"），不需要真的打完整場。
		await court.getByRole("link", { name: "進入計分板" }).click();
		await page.getByRole("button", { name: /我方贏這一球/ }).click();
		await page.getByRole("link", { name: "返回對戰" }).click();
		await expect(page).toHaveURL(/\/matchmaker$/);

		const targetGroup = page.getByRole("radiogroup", { name: "目標分數" });
		const radios = targetGroup.getByRole("radio");
		await expect(radios).toHaveCount(3);
		for (const radio of await radios.all()) {
			await expect(radio).toBeDisabled();
		}
		await expect(page.getByText("本輪已開始計分，目標分數不可更改。")).toBeVisible();
	});

	test("手動輸入比分的路徑仍可獨立完成一場", async ({ page }) => {
		await seedRoster(page, 4);
		await generateRound(page, 1);
		const matchId = await courtMatchId(page, 0);
		const court = page.getByTestId(`court-${matchId}`);

		// 不經計分板，直接於場地區塊填入兩隊比分並送出（prd.md 6.3、13.4 的 fallback）。
		await court.getByLabel("第一隊比分").fill("11");
		await court.getByLabel("第二隊比分").fill("5");
		await court.getByRole("button", { name: "送出比分" }).click();

		await expect(court.getByTestId(`court-${matchId}-score`)).toHaveText("11:5");
		await expect(court.getByTestId(`court-${matchId}-team-a`)).toHaveText("第一隊勝");

		// 評分更新並寫入歷史：手動輸入不因計分板入口存在而改變既有行為，直接讀
		// localStorage 驗證兩者皆確實發生（本 change 尚無歷史 UI 頁面可供操作驗收）。
		// 容器形狀為 { version, entries }（見 lib/matchmaker/round-storage.ts 的
		// writeHistory），不是裸陣列。
		const history = await page.evaluate(
			(key) => window.localStorage.getItem(key),
			HISTORY_STORAGE_KEY,
		);
		const parsedHistory: { entries?: unknown[] } = history ? JSON.parse(history) : {};
		expect(parsedHistory.entries?.length ?? 0).toBeGreaterThan(0);
	});

	// round-lifecycle delta 的 Scenario「回到已失效場次的計分板時顯示說明」——重排本輪
	// 會丟棄未完成場次並清除對應計分板槽（§6），使舊的 ?match= 連結指向的槽消失，
	// 落地於 §7 已完成的 MatchBindingNotice。此測試補上「從對戰頁實際重排」這條真實
	// 前置路徑的驗收（前五棒遺漏、由第六棒 leader 於 tasks.md 補上此錨點）。
	test("重設本輪後回到舊計分板連結顯示失效說明", async ({ page }) => {
		await seedRoster(page, 8);
		await generateRound(page, 2);
		const matchId2 = await courtMatchId(page, 1);
		const court2 = page.getByTestId(`court-${matchId2}`);

		await court2.getByRole("link", { name: "進入計分板" }).click();
		await expect(page).toHaveURL(new RegExp(`/scoreboard\\?match=${matchId2}$`));
		await clickWin(page, "us", 5);
		await clickWin(page, "them", 3);
		await page.getByRole("link", { name: "返回對戰" }).click();
		await expect(page).toHaveURL(/\/matchmaker$/);

		// 重設／再排：兩場皆未完成，符合 hasIncompleteMatch，丟棄所有 pending 場次
		// 並改配出新的場次 id，matchId2 因此不再對應任何場次。
		await page.getByRole("button", { name: "重設／再排" }).click();

		// 重新開啟該場舊的 ?match= 連結。
		await page.goto(`/scoreboard?match=${matchId2}`);

		await expect(page.getByText("這場比賽目前無法計分")).toBeVisible();
		await expect(page.getByRole("link", { name: "回到對戰頁" })).toBeVisible();
		await expect(page.getByRole("link", { name: "改用獨立計分板" })).toBeVisible();
		const bodyText = await page.locator("body").innerText();
		expect(bodyText).not.toMatch(/Error/);
	});
});
