import { test, expect, type Page } from "@playwright/test";

// /matchmaker/players 參賽者名單頁的 E2E 驗收
// 對應 add-player-roster change 的驗收錨點：空白初始狀態、reload 持久化、
// 重置名單的二次確認（確認／取消兩條路徑）。
//
// 此頁刻意未加進全站 navbar（功能尚不完整，見 app/matchmaker/players/page.tsx
// 檔頭註解），因此一律用 page.goto() 直接以網址存取，不走 navbar 連結。
//
// 名單資料存在 localStorage["matchmaker:roster:v1"]，格式為
// { version: 1, players: [...] }（見 lib/matchmaker/storage.ts）。首次 render
// 一律為空名單，useEffect 讀取 localStorage 後才 dispatch HYDRATE（design
// Decision 8，沿用 useScoreboardStore 的模式），故斷言時一律等待畫面穩定
// （expect(...).toBeVisible() 本身即帶重試，不需額外 waitForTimeout）。
//
// 為避免 localStorage 跨測試污染，beforeEach 只清除本 capability 的
// matchmaker:roster:v1，刻意不用 localStorage.clear()——那會連
// scoreboard:current:v1（既有 capability 的資料）一併清掉，違反本 change
// 「不誤傷既有名單以外資料」的核心保證。

const STORAGE_KEY = "matchmaker:roster:v1";
const PLAYERS_PAGE = "/matchmaker/players";

// 已知的 dev-only 噪音，不視為本測試的失敗（見
// .claude/agent-memory/nextjs-expert/e2e-webserver-cold-start-chunkloaderror.md）：
// Turbopack 的 HMR client 與 Next 內建 global-error boundary 是背景延遲載入的
// chunk，在高並發 E2E 執行、dev server 回應變慢時，偶爾被下一次 page.goto()
// 中斷而拋出 ChunkLoadError；該記憶已用 production build 對照實驗證實 100%
// 只在 WebKit engine（webkit／mobile-safari）出現、production 下重現 0 次，
// 與任何頁面的產品邏輯無關。排除它是為了不讓本測試變成看機器負載臉色的假紅燈，
// 其餘任何 error／warning（尤其是 hydration mismatch）一律不放過。
const KNOWN_DEV_ONLY_NOISE = /ChunkLoadError.*(hmr-client|global-error)/;

// 監控瀏覽器 console：收集 error 與 warning（不含 info/log，避免把 Next.js dev
// 模式的 React DevTools 提示、HMR 連線訊息這類雜訊誤判為問題），並收集未捕捉的
// pageerror。特別留意 hydration mismatch——若「首次 render 空名單、effect 後才
// HYDRATE」的模式寫錯，會在此以 warning 或 error 現形。
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

// 透過頁首「新增參賽者」按鈕開啟新增 Dialog，只填姓名與強度分數（用預設強度按鈕
// 而非直接操作 number input，避免各瀏覽器對 type="color" / type="number" 的
// fill 行為差異），其餘欄位（性別、雙色漸層）留用預設值後送出。
//
// 用 exact: true 且限定在頁首範圍外的按鈕文字精確比對「新增參賽者」——EmptyRoster
// 的入口按鈕文字是「新增第一位參賽者」，不會誤中；Dialog 內的送出鈕文字同樣是
// 「新增參賽者」，但透過 dialog locator 的子樹範圍即可與頁首鈕區隔開來。
async function addPlayerViaDialog(page: Page, name: string): Promise<void> {
	await page.getByRole("button", { name: "新增參賽者", exact: true }).click();
	const dialog = page.getByRole("dialog", { name: "新增參賽者" });
	await expect(dialog).toBeVisible();
	await dialog.getByLabel("姓名").fill(name);
	await dialog.getByRole("button", { name: "新手 1.00" }).click();
	await dialog.getByRole("button", { name: "新增參賽者", exact: true }).click();
	await expect(dialog).toBeHidden();
}

test.describe("/matchmaker/players 參賽者名單", () => {
	test.beforeEach(async ({ page }) => {
		// 先到同源頁面才能操作 localStorage（避免 about:blank 無法存取）。
		// 只 removeItem 本 capability 的 key，不可用 clear()。
		await page.goto("/");
		await page.evaluate((key) => {
			window.localStorage.removeItem(key);
		}, STORAGE_KEY);
	});

	// 1. 首次開啟顯示空白狀態與新增入口
	test("首次開啟顯示空白狀態與新增入口", async ({ page }) => {
		const consoleIssues = trackConsoleIssues(page);

		await page.goto(PLAYERS_PAGE);

		await expect(page.getByText("目前還沒有參賽者")).toBeVisible();
		await expect(page.getByText("新增參賽者後即可開始安排對戰。")).toBeVisible();
		await expect(
			page.getByRole("button", { name: "新增第一位參賽者" }),
		).toBeVisible();
		await expect(page.getByText("共 0 位參賽者")).toBeVisible();

		// 不出現任何參賽者資料：PlayerCard 才會渲染「編輯」「刪除」與強度分數文字
		await expect(page.getByRole("button", { name: "編輯" })).toHaveCount(0);
		await expect(page.getByRole("button", { name: "刪除" })).toHaveCount(0);
		await expect(page.getByText(/強度 \d/)).toHaveCount(0);

		expect(
			consoleIssues,
			`不應有 console error/warning：\n${consoleIssues.join("\n")}`,
		).toEqual([]);
	});

	// 2. 重整後名單仍在
	test("重整後名單仍在", async ({ page }) => {
		const consoleIssues = trackConsoleIssues(page);

		await page.goto(PLAYERS_PAGE);
		await addPlayerViaDialog(page, "小明");

		await expect(page.getByText("小明", { exact: true })).toBeVisible();
		await expect(page.getByText("共 1 位參賽者")).toBeVisible();

		await page.reload();

		// reload 後首次 render 仍為空名單，等 hydration 完成後才重新出現
		await expect(page.getByText("小明", { exact: true })).toBeVisible();
		await expect(page.getByText("共 1 位參賽者")).toBeVisible();

		const stored = await page.evaluate(
			(key) => window.localStorage.getItem(key),
			STORAGE_KEY,
		);
		expect(stored).toContain("小明");

		expect(
			consoleIssues,
			`不應有 console error/warning：\n${consoleIssues.join("\n")}`,
		).toEqual([]);
	});

	// 3. 確認重置後名單清空且持久化資料被移除
	test("確認重置後名單清空且持久化資料被移除", async ({ page }) => {
		const consoleIssues = trackConsoleIssues(page);

		await page.goto(PLAYERS_PAGE);
		await addPlayerViaDialog(page, "小華");
		await expect(page.getByText("小華", { exact: true })).toBeVisible();

		await page.getByRole("button", { name: "重置名單" }).click();
		const alert = page.getByRole("alertdialog", { name: "重置參賽者名單" });
		await expect(alert).toBeVisible();
		await alert.getByRole("button", { name: "確定重置" }).click();
		await expect(alert).toBeHidden();

		await expect(page.getByText("目前還沒有參賽者")).toBeVisible();
		await expect(page.getByText("共 0 位參賽者")).toBeVisible();
		await expect(page.getByText("小華", { exact: true })).toHaveCount(0);

		const stored = await page.evaluate(
			(key) => window.localStorage.getItem(key),
			STORAGE_KEY,
		);
		expect(stored).toBeNull();

		expect(
			consoleIssues,
			`不應有 console error/warning：\n${consoleIssues.join("\n")}`,
		).toEqual([]);
	});

	// 4. 取消重置後名單維持不變
	test("取消重置後名單維持不變", async ({ page }) => {
		const consoleIssues = trackConsoleIssues(page);

		await page.goto(PLAYERS_PAGE);
		await addPlayerViaDialog(page, "小美");
		await expect(page.getByText("小美", { exact: true })).toBeVisible();
		await expect(page.getByText("共 1 位參賽者")).toBeVisible();

		const storedBefore = await page.evaluate(
			(key) => window.localStorage.getItem(key),
			STORAGE_KEY,
		);

		await page.getByRole("button", { name: "重置名單" }).click();
		const alert = page.getByRole("alertdialog", { name: "重置參賽者名單" });
		await expect(alert).toBeVisible();
		await alert.getByRole("button", { name: "取消" }).click();
		await expect(alert).toBeHidden();

		// 名單內容與重置前完全相同：畫面與 localStorage 兩者都要驗
		await expect(page.getByText("小美", { exact: true })).toBeVisible();
		await expect(page.getByText("共 1 位參賽者")).toBeVisible();

		const storedAfter = await page.evaluate(
			(key) => window.localStorage.getItem(key),
			STORAGE_KEY,
		);
		expect(storedAfter).toBe(storedBefore);

		expect(
			consoleIssues,
			`不應有 console error/warning：\n${consoleIssues.join("\n")}`,
		).toEqual([]);
	});
});
