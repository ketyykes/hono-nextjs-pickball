import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";

// 對戰頁（/matchmaker）匯出 JPG／列印 PDF 兩個入口的 E2E 驗收。
// 對應 matchmaker-visual-export change tasks §7 的 test-plan：入口可見性、
// 匯出 JPG 的下載行為與檔案本體（JPEG 位元組標記）。
//
// 種資料與「已有回合」狀態的建立方式沿用 M5 match-stage.spec.ts 的既有 helper
// （seedRoster／buildTestPlayer／trackConsoleIssues），「已有回合」一律用 UI 操作
// （點「產生本輪對戰」）達成，不種 matchmaker:round:v1（M5 design Decision 10 既有裁決）。

const ROSTER_STORAGE_KEY = "matchmaker:roster:v1";
const ROUND_STORAGE_KEY = "matchmaker:round:v1";
const HISTORY_STORAGE_KEY = "matchmaker:history:v1";

// 已知的 dev-only 噪音，不視為本測試的失敗（沿用 match-stage.spec.ts 的既有記憶）。
const KNOWN_DEV_ONLY_NOISE = /ChunkLoadError.*(hmr-client|global-error)/;

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
// localStorage（沿用 match-stage.spec.ts 的既有裁決）。
async function seedRoster(page: Page, count: number): Promise<void> {
	const players = Array.from({ length: count }, (_, i) => buildTestPlayer(i + 1));
	await page.addInitScript(
		({ key, value }) => {
			window.localStorage.setItem(key, value);
		},
		{ key: ROSTER_STORAGE_KEY, value: JSON.stringify({ version: 1, players }) },
	);
}

test.describe("/matchmaker 匯出功能", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/");
		await page.evaluate(
			(keys) => {
				for (const key of keys) window.localStorage.removeItem(key);
			},
			[ROSTER_STORAGE_KEY, ROUND_STORAGE_KEY, HISTORY_STORAGE_KEY],
		);
	});

	test("對戰頁提供匯出 JPG 與列印 PDF 兩個入口", async ({ page }) => {
		const consoleIssues = trackConsoleIssues(page);

		await seedRoster(page, 2);
		await page.goto("/matchmaker");
		await page.getByRole("button", { name: "產生本輪對戰" }).click();

		await expect(page.getByRole("button", { name: "匯出 JPG" })).toBeVisible();
		await expect(page.getByRole("button", { name: "列印 PDF" })).toBeVisible();

		expect(
			consoleIssues,
			`不應有 console error/warning：\n${consoleIssues.join("\n")}`,
		).toEqual([]);
	});

	test("匯出 JPG 會下載檔名含回合編號與日期的 JPEG 檔案", async ({ page }) => {
		await seedRoster(page, 2);
		await page.goto("/matchmaker");
		await page.getByRole("button", { name: "產生本輪對戰" }).click();

		const [download] = await Promise.all([
			page.waitForEvent("download"),
			page.getByRole("button", { name: "匯出 JPG" }).click(),
		]);

		expect(download.suggestedFilename()).toMatch(
			/^matchmaker-round-\d+-\d{4}-\d{2}-\d{2}\.jpg$/,
		);

		const stream = await download.createReadStream();
		expect(stream).not.toBeNull();
		const chunks: Buffer[] = [];
		if (stream !== null) {
			for await (const chunk of stream) {
				chunks.push(chunk as Buffer);
			}
		}
		const buffer = Buffer.concat(chunks);

		expect(buffer.length).toBeGreaterThan(0);
		expect(buffer[0]).toBe(0xff);
		expect(buffer[1]).toBe(0xd8);
		expect(buffer[2]).toBe(0xff);
	});
});
