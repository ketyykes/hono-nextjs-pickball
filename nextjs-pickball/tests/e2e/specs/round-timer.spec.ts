import { test, expect } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

// /matchmaker 對戰頁的回合計時器 E2E 驗收（spec match-stage
// 「計時器顯示與時間到提示」的兩個 Scenario）。
//
// 本檔驗的是單元測試驗不到的兩件事：① 真實瀏覽器的 setInterval tick 真的會把畫面推進到
// 「時間到」；② 例外層 lib/matchmaker/round-timer-sound.ts 真的會去建構 AudioContext
// （單元測試只能驗「被注入的假函式被呼叫了」，驗不到那個函式裡面做了什麼）。
//
// 常數、trackConsoleIssues／buildTestPlayer／seedRoster 的形態沿用 match-stage.spec.ts
// 的既有慣例，並依 tasks 12.1 於本檔內建立同構的區域函式，不跨檔 import helper。
//
// ── page.clock 的語意實測結論（本 repo 第一次使用這個 API，design Risks 要求 apply
//    階段實測確認；以下數字是 chromium 上實跑觀察到的，不是照文件推測）──
//   ① install() 後假時鐘會隨真實時間自走：Node 端真的等 2 秒後，頁面的 Date.now() 前進
//      2001ms，畫面倒數同步由 10:00 走到 09:58——即 setInterval 在假時鐘下照常每秒觸發。
//   ② runFor(1000) 逐一觸發中間回呼，畫面恰好走一秒（09:58 → 09:57）。
//   ③ pauseAt() 之後時鐘凍結：真實再等 2 秒，畫面停在 09:01 不動。
//   ④ 承 ③ 的凍結狀態下單獨呼叫 fastForward(30s)，畫面前進到 08:31——排除「碰巧被真實
//      時間推動」之後，仍會前進，證明 fastForward 本身確實觸發了 setInterval 回呼並讓
//      React 重新 render。本檔因此用 fastForward 而非 runFor：兩者都能驅動，但到期判定
//      是由 startedAt 與當下時間現算（useRoundTimer 不做累加式計數），只需要「到期後至少
//      觸發一次回呼」，fastForward 一次跳完 10 分鐘遠比 runFor 逐一觸發 600 次便宜。
//   ⑤ 對照組：凍結狀態下改用 setSystemTime() 把時間直接設到到期之後（該 API 只改時間、
//      不觸發任何 timer），畫面停在 09:01、「時間到」節點數為 0。這條反證了畫面是被
//      timer 回呼推動的，而不是「Date 變了就會自己更新」。
//
// 為避免 localStorage 跨測試污染，beforeEach 只清除本 capability 的三個 key，
// 刻意不用 localStorage.clear()（會誤傷 scoreboard:current:v1）。

const ROSTER_STORAGE_KEY = "matchmaker:roster:v1";
const ROUND_STORAGE_KEY = "matchmaker:round:v1";
const HISTORY_STORAGE_KEY = "matchmaker:history:v1";

// 已知的 dev-only 噪音，不視為本測試的失敗（沿用 match-stage.spec.ts 的既有記憶：
// Turbopack 的 HMR client 與 Next 內建 global-error boundary 是背景延遲載入的 chunk，
// 高並發 E2E 下偶爾被下一次 page.goto() 中斷，已證實 100% 只在 WebKit engine 出現、
// production 下重現 0 次，與頁面本身的產品邏輯無關）。
const KNOWN_DEV_ONLY_NOISE = /ChunkLoadError.*(hmr-client|global-error)/;

// 本檔固定用最短的計時選項（10 分鐘）：計時長度不是被驗的行為，越短的快轉距離越不容易
// 因為假時鐘與真實時鐘的微小落差而落在到期邊界上。選項文案帶「分鐘」二字是刻意的
// （RoundControls.tsx），與目標分數的裸數字「11／15／21」區隔，getByRole 才不會誤中。
const TIMER_DURATION_MINUTES = 10;
const TIMER_OPTION_LABEL = `${TIMER_DURATION_MINUTES} 分鐘`;
const TIMER_DURATION_MS = TIMER_DURATION_MINUTES * 60 * 1000;

// 假時鐘的起始時刻。固定值而非 Date.now()：頁面所有 new Date() 都會被 page.clock 接管，
// 起始時刻固定後，同一個 test 每次跑經歷的時間序列完全相同。
const FAKE_CLOCK_START = "2026-03-01T09:00:00.000Z";

function trackConsoleIssues(page: Page): string[] {
	const issues: string[] = [];
	page.on("console", (msg) => {
		if (msg.type() === "error" || msg.type() === "warning") {
			issues.push(`[console.${msg.type()}] ${msg.text()}`);
		}
	});
	page.on("pageerror", (error) => {
		if (KNOWN_DEV_ONLY_NOISE.test(error.message)) return;
		issues.push(`[pageerror] ${error.message}`);
	});
	return issues;
}

// 種入測試用參賽者的最小合法欄位（見 lib/matchmaker/types.ts 的 PlayerSchema）。
// rating 固定 5（合法範圍 1～8 內的中間值，本組不測強度分佈與配對細節）。
function buildTestPlayer(index: number) {
	return {
		id: `e2e-player-${index}`,
		name: `測試員${index}`,
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

// 用 addInitScript 而非 goto+evaluate：保證在頁面任何 script 執行前就已寫入
// localStorage，不會有 hydration 前資料尚未就緒的競態（同 match-stage.spec.ts）。
async function seedRoster(page: Page, count: number): Promise<void> {
	const players = Array.from({ length: count }, (_, i) => buildTestPlayer(i + 1));
	await page.addInitScript(
		({ key, value }) => {
			window.localStorage.setItem(key, value);
		},
		{ key: ROSTER_STORAGE_KEY, value: JSON.stringify({ version: 1, players }) },
	);
}

// 以假的 AudioContext 建構式取代真的，並把建構次數記在 window 上供 page.evaluate 讀取。
//
// MUST 用 addInitScript（頁面載入前安裝），否則 round-timer-sound.ts 取到的會是真的
// 建構式；AudioContext 與 webkitAudioContext 兩個都要蓋，因為該檔是
// `window.AudioContext ?? window.webkitAudioContext`——WebKit 上兩者都存在，只蓋一個
// 會讓「到底用了哪一個」隨瀏覽器而異。
//
// 假物件提供的介面剛好是 round-timer-sound.ts 會碰到的那些（createOscillator／
// createGain／connect／start／stop／onended／close／currentTime／destination）；
// 少任何一個，頁面在時間到那一刻就會拋 TypeError 而不是靜靜地記一次數。
async function stubAudioContext(page: Page): Promise<void> {
	await page.addInitScript(() => {
		const counterWindow = window as unknown as {
			__roundTimerAudioContextCount: number;
		};
		counterWindow.__roundTimerAudioContextCount = 0;

		class StubAudioContext {
			currentTime = 0;
			destination = {};

			constructor() {
				counterWindow.__roundTimerAudioContextCount += 1;
			}

			createOscillator() {
				return {
					type: "sine",
					frequency: { setValueAtTime: () => undefined },
					connect: () => undefined,
					start: () => undefined,
					stop: () => undefined,
					onended: null as (() => void) | null,
				};
			}

			createGain() {
				return {
					gain: {
						setValueAtTime: () => undefined,
						exponentialRampToValueAtTime: () => undefined,
					},
					connect: () => undefined,
				};
			}

			close() {
				return Promise.resolve();
			}
		}

		for (const key of ["AudioContext", "webkitAudioContext"]) {
			Object.defineProperty(window, key, {
				configurable: true,
				writable: true,
				value: StubAudioContext,
			});
		}
	});
}

// 讀回建構次數。stub 未安裝成功時回傳 -1 而非 0——0 會讓「到期前必須為 0」那條前置
// 斷言在 stub 根本沒裝上的情況下照樣通過。
async function readAudioContextCount(page: Page): Promise<number> {
	return page.evaluate(
		() =>
			(window as unknown as { __roundTimerAudioContextCount?: number })
				.__roundTimerAudioContextCount ?? -1,
	);
}

interface StoredMatch {
	id: string;
	status: string;
	scores: { teamA: number; teamB: number } | null;
	winner: string | null;
	completedAt: string | null;
}

interface StoredRound {
	matches: StoredMatch[];
	timer: { durationMinutes: number; startedAt: string | null } | null;
}

// 從 LocalStorage 讀回目前回合。狀態比對取持久化資料而非畫面文字：畫面只呈現得出
// 「有沒有完成」，而 spec 要的是「所有場次的狀態與到期前完全相同」。
async function readStoredRound(page: Page): Promise<StoredRound> {
	const raw = await page.evaluate((key) => window.localStorage.getItem(key), ROUND_STORAGE_KEY);
	expect(raw).not.toBeNull();
	const parsed = JSON.parse(raw ?? "{}") as { round: StoredRound | null };
	expect(parsed.round).not.toBeNull();
	// 上一行的 expect 已保證非 null，這裡只是把型別收斂掉。
	return parsed.round as StoredRound;
}

// 「時間到」大字的精確 locator：MUST 鎖到「文字內容恰為『時間到』」的那個節點，且它
// MUST 位於某個 role="alert" 之下。
// ⚠️ 不可改成寬鬆的子字串比對——同一個 alert 區塊裡的說明句
// ROUND_TIMER_EXPIRED_MESSAGE 開頭就是「時間到：……」，用 toContainText("時間到")
// 之類的寫法即使大字沒渲染也會通過，是一條恆真斷言。
function expiredHeadline(page: Page): Locator {
	return page.getByRole("alert").getByText("時間到", { exact: true });
}

// 選好計時長度 → 產生本輪 → 按下「開始計時」。
//
// 最後那條 toHaveCount(0) 是同步點而非附加驗證：「開始計時」只在
// timer !== null && timer.startedAt === null 時渲染（RoundControls.tsx），按鈕消失
// 即代表 startedAt 已寫入回合並持久化。少了它，後面的 readStoredRound 可能讀到
// startedAt 仍為 null 的回合，快轉就永遠等不到到期。
async function startRoundTimer(page: Page): Promise<void> {
	await page.getByRole("radio", { name: TIMER_OPTION_LABEL, exact: true }).click();
	await page.getByRole("button", { name: "產生本輪對戰" }).click();

	const startButton = page.getByRole("button", { name: "開始計時" });
	await expect(startButton).toBeVisible();
	await startButton.click();
	await expect(startButton).toHaveCount(0);
}

test.describe("/matchmaker 回合計時器", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/");
		await page.evaluate(
			(keys) => {
				for (const key of keys) window.localStorage.removeItem(key);
			},
			[ROSTER_STORAGE_KEY, ROUND_STORAGE_KEY, HISTORY_STORAGE_KEY],
		);
	});

	test("計時到期不自動結束任何場次，仍可手動送出比分", async ({ page }) => {
		const consoleIssues = trackConsoleIssues(page);

		await seedRoster(page, 2);
		// page.clock.install() MUST 在頁面載入前呼叫：裝晚了就 stub 不到頁面已經建立的
		// setInterval，也 stub 不到 useRoundTimer 初次 render 時取樣的那個 new Date()。
		await page.clock.install({ time: new Date(FAKE_CLOCK_START) });
		await page.goto("/matchmaker");

		await startRoundTimer(page);

		// 快轉前的基準快照。MUST 是「前後比對」而不是「斷言到期後仍為 pending」——
		// 後者在實作真的把場次改成 completed 時，只要查詢方式稍有偏差就仍可能通過。
		const before = await readStoredRound(page);
		expect(before.matches.length).toBeGreaterThan(0);
		// 先把基準錨定住：下面的 toEqual 是「後 === 前」的相對比對，若兩邊都是空陣列
		// 或都已完成，一樣會綠。
		expect(before.matches.map((match) => match.status)).toEqual(
			before.matches.map(() => "pending"),
		);
		expect(before.timer).not.toBeNull();
		expect(before.timer?.startedAt).not.toBeNull();

		await page.clock.fastForward(TIMER_DURATION_MS);

		// 先確認快轉真的把本輪推到到期：少了這一條，下面「狀態沒變」會在「快轉根本沒
		// 生效」的情況下照樣全綠，整個 test 失去鑑別力。
		await expect(expiredHeadline(page)).toHaveCount(1);
		await expect(expiredHeadline(page)).toBeVisible();

		// spec 主斷言：時間到 MUST NOT 自動結束任何場次或改變任何場次的 status。
		const after = await readStoredRound(page);
		expect(after.matches).toEqual(before.matches);

		// 且仍可手動送出比分並成功完成——「不自動結束」不能是靠把送出流程一起弄壞達成的。
		await page.getByLabel("第一隊比分").fill("11");
		await page.getByLabel("第二隊比分").fill("7");
		await page.getByRole("button", { name: "送出比分" }).click();

		await expect(page.getByRole("button", { name: "送出比分" })).toBeDisabled();
		await expect(page.locator('[data-testid$="-score"]')).toHaveText("11:7");

		const completed = await readStoredRound(page);
		expect(completed.matches).toHaveLength(before.matches.length);
		expect(completed.matches.map((match) => match.status)).toEqual(
			before.matches.map(() => "completed"),
		);
		expect(completed.matches[0].scores).toEqual({ teamA: 11, teamB: 7 });
		expect(completed.matches[0].winner).toBe("teamA");

		// 送出確實走完 round-lifecycle 的完成流程（歷史被寫入一筆），而不只是畫面停用。
		const historyRaw = await page.evaluate(
			(key) => window.localStorage.getItem(key),
			HISTORY_STORAGE_KEY,
		);
		const history = JSON.parse(historyRaw ?? "{}") as { entries: unknown[] };
		expect(history.entries).toHaveLength(1);

		expect(
			consoleIssues,
			`不應有 console error/warning：\n${consoleIssues.join("\n")}`,
		).toEqual([]);
	});

	test("開始計時後快轉至到期會顯示時間到並觸發一次提示音", async ({ page }) => {
		const consoleIssues = trackConsoleIssues(page);

		await seedRoster(page, 2);
		await stubAudioContext(page);
		await page.clock.install({ time: new Date(FAKE_CLOCK_START) });
		await page.goto("/matchmaker");

		await startRoundTimer(page);

		// 到期前必須是 0：少了這條，「恰為 1」在「頁面載入時就誤建了一個」的情況下
		// 仍可能因為時間到那次沒播而湊巧等於 1。-1 代表 stub 沒安裝成功。
		expect(await readAudioContextCount(page)).toBe(0);

		await page.clock.fastForward(TIMER_DURATION_MS);

		await expect(expiredHeadline(page)).toHaveCount(1);
		await expect(expiredHeadline(page)).toBeVisible();

		// 提示音是 effect 內的副作用，與 render 不在同一個 microtask，用 poll 等它。
		await expect
			.poll(() => readAudioContextCount(page), {
				message: "時間到 MUST 觸發一次 AudioContext 建構",
			})
			.toBe(1);

		// 同一次到期 MUST 只播放一次：再讓計時 tick 幾秒（expired 持續為 true、
		// useRoundTimer 每秒都會重新 render），次數不得增加。
		await page.clock.fastForward(5000);
		await page.clock.fastForward(5000);
		expect(await readAudioContextCount(page)).toBe(1);

		expect(
			consoleIssues,
			`不應有 console error/warning：\n${consoleIssues.join("\n")}`,
		).toEqual([]);
	});
});
