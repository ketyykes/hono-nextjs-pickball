// Minor-2：同 repo 既有風格勝出——tests/e2e/specs/matchmaker-data-transfer.spec.ts 第 1 行
// 即是 `import { Buffer } from "node:buffer";`，本檔沿用而非依賴全域 Buffer。
import { Buffer } from "node:buffer";
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

// Major-1 (A)：JPEG 位圖尺寸期望值推導。
//
// 本測試的種子資料為 2 位球員（seedRoster(page, 2)），「產生本輪對戰」點擊時使用
// app/matchmaker/page.tsx 的 createRoundSettings() 預設值——
// DEFAULT_FORMAT = "singles"、DEFAULT_COURT_COUNT = 1（lib/matchmaker/allocation-types.ts），
// 2 位球員、1 個場地、單打，必定產出「1 個單打場地」的回合，不會因球員數不足而報錯
// （單打每場恰需 2 人）。
//
// 依 export-scene.ts 目前的公式與常數手算 logical px 尺寸：
//   scene.width  = CANVAS_WIDTH = 800
//   scene.height = TITLE_AREA_HEIGHT
//                  + courtCount * courtBlockHeight("singles")
//                  + (courtCount + 1) * COURT_BLOCK_SPACING
//                = 96 + 1 * (COURT_HEADER_HEIGHT + TILE_ROWS_BY_FORMAT.singles * TILE_ROW_HEIGHT)
//                  + (1 + 1) * 24
//                = 96 + 1 * (56 + 1 * 88) + 48
//                = 96 + 144 + 48
//                = 288
// scene-canvas.ts 的 downloadSceneAsJpeg 再把 canvas 位圖尺寸乘上 EXPORT_BITMAP_SCALE = 2
// （見該檔常數），故實際輸出的 JPEG 位圖尺寸：
//   寬 = 800 * 2 = 1600
//   高 = 288 * 2 = 576
const EXPECTED_JPEG_BITMAP_WIDTH = 800 * 2;
const EXPECTED_JPEG_BITMAP_HEIGHT = (96 + 1 * (56 + 1 * 88) + (1 + 1) * 24) * 2;

// JPEG 有損壓縮下，純白（255,255,255）可能被編碼成 250 幾，故用門檻而非等值比對。
const WHITE_CORNER_THRESHOLD = 240;

/**
 * 從 JPEG 位元組讀出 SOF（Start Of Frame）標記內記錄的寬高（Major-1 (A)）。
 *
 * JPEG 結構：FFD8（SOI）之後是一連串 segment，每個 segment 為
 * `FF <marker> <2 bytes length，big-endian，含這兩個 length 位元組本身> <payload>`；
 * 少數標記（TEM 0x01、RST0～RST7 0xD0～D7、SOI 0xD8、EOI 0xD9）沒有 length／payload。
 * SOF 標記落在 0xC0～0xCF，但排除 0xC4（DHT）、0xC8（JPG 保留）、0xCC（DAC）——
 * 這三個雖同落在該區間但不是 SOF，payload 結構完全不同。
 * SOF payload 結構：第 1 byte 是精度，第 2～3 byte 是高度（BE），第 4～5 byte 是寬度（BE）。
 */
function readJpegSize(buffer: Buffer): { width: number; height: number } {
	if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
		throw new Error("不是合法的 JPEG（缺少 SOI 標記 FFD8）");
	}

	let offset = 2;
	while (offset + 1 < buffer.length) {
		if (buffer[offset] !== 0xff) {
			throw new Error(`偏移 ${offset} 處不是合法的標記邊界（非 0xFF）`);
		}

		// JPEG 容許標記前有任意數量的填充位元組 0xFF，真正的標記碼是第一個非 0xFF 的位元組。
		let markerCodeOffset = offset + 1;
		while (buffer[markerCodeOffset] === 0xff) {
			markerCodeOffset += 1;
		}
		const marker = buffer[markerCodeOffset];
		const payloadOffset = markerCodeOffset + 1;

		const isStandaloneMarker =
			marker === 0x01 || marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7);
		if (isStandaloneMarker) {
			offset = payloadOffset;
			continue;
		}

		const length = buffer.readUInt16BE(payloadOffset);

		const isSofMarker =
			marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
		if (isSofMarker) {
			const height = buffer.readUInt16BE(payloadOffset + 3);
			const width = buffer.readUInt16BE(payloadOffset + 5);
			return { width, height };
		}

		if (marker === 0xda) {
			// SOS：熵編碼資料緊接在後，理論上 SOF 必然已在此之前出現過，掃到這裡代表找不到。
			break;
		}

		offset = payloadOffset + length;
	}

	throw new Error("在 JPEG 位元組中找不到 SOF 標記，無法讀出尺寸");
}

/**
 * 在瀏覽器內把 JPEG buffer 解碼並讀出四個角落的像素 RGB 值（Major-1 (B)）。
 * SHALL NOT 在 Node 端引入任何影像解碼套件——瀏覽器原生的 Image + canvas 已足夠。
 */
async function readCornerPixels(
	page: Page,
	buffer: Buffer,
): Promise<{
	topLeft: { r: number; g: number; b: number };
	topRight: { r: number; g: number; b: number };
	bottomLeft: { r: number; g: number; b: number };
	bottomRight: { r: number; g: number; b: number };
}> {
	const base64 = buffer.toString("base64");

	return page.evaluate((dataUrlBase64) => {
		return new Promise<{
			topLeft: { r: number; g: number; b: number };
			topRight: { r: number; g: number; b: number };
			bottomLeft: { r: number; g: number; b: number };
			bottomRight: { r: number; g: number; b: number };
		}>((resolve, reject) => {
			const image = new Image();
			image.onload = () => {
				const canvas = document.createElement("canvas");
				canvas.width = image.naturalWidth;
				canvas.height = image.naturalHeight;
				// willReadFrequently：本函式緊接著呼叫 4 次 getImageData（四個角落），
				// 不加此選項 Chromium 會噴 console.warning 提示效能建議，被本檔的
				// trackConsoleIssues 誤判為測試失敗（這是測試輔助工具本身的 canvas 用法，
				// 與待測的 scene-canvas.ts 無關）。
				const ctx = canvas.getContext("2d", { willReadFrequently: true });
				if (ctx === null) {
					reject(new Error("測試環境不支援 2D canvas"));
					return;
				}
				ctx.drawImage(image, 0, 0);

				function pixelAt(x: number, y: number): { r: number; g: number; b: number } {
					const data = ctx!.getImageData(x, y, 1, 1).data;
					return { r: data[0], g: data[1], b: data[2] };
				}

				resolve({
					topLeft: pixelAt(0, 0),
					topRight: pixelAt(canvas.width - 1, 0),
					bottomLeft: pixelAt(0, canvas.height - 1),
					bottomRight: pixelAt(canvas.width - 1, canvas.height - 1),
				});
			};
			image.onerror = () => reject(new Error("測試用 JPEG 圖片載入失敗"));
			image.src = `data:image/jpeg;base64,${dataUrlBase64}`;
		});
	}, base64);
}

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
		// Minor-1：本組唯一的 SSR 防線是「模組層級 window 觸碰 → SSR 500」的 console 斷言，
		// 實測顯示它只在第一個 test 有掛，第二個 test（下載那條）漏掉了——補上，
		// 讓本測試也能偵測到 scene-canvas.ts／page.tsx 若不慎在模組層級碰 window／document。
		const consoleIssues = trackConsoleIssues(page);

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
		// Minor-7：上一行 `expect(stream).not.toBeNull()` 已經是邏輯上的斷言，但 Playwright 的
		// expect 沒有 TypeScript type predicate，型別系統看不到那個斷言，`stream` 在此仍是
		// `ReadStream | null`。這個 `if` 是型別窄化需要，不是重複的防禦性邏輯——
		// 維持現寫法，不改用 non-null assertion（repo 內未見該用法）。
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

		// Major-1 (A)：JPEG 位圖尺寸恰等於 scene.width/height * EXPORT_BITMAP_SCALE。
		// 殺掉「EXPORT_BITMAP_SCALE 2 → 1」與「拿掉 ctx.scale(...)」這兩種會讓輸出尺寸
		// 偏離期望值、但既有斷言（下載成功＋JPEG magic bytes）測不出來的存活 mutant。
		const jpegSize = readJpegSize(buffer);
		expect(jpegSize).toEqual({
			width: EXPECTED_JPEG_BITMAP_WIDTH,
			height: EXPECTED_JPEG_BITMAP_HEIGHT,
		});

		// Major-1 (B)：四個角落像素皆應接近白色。這條擋的是「忘了先填不透明底色」——
		// JPEG 無 alpha，透明區會被編碼成黑色，整張圖變黑底白字（design Decision 9）。
		// 拿掉 scene-canvas.ts 的 `ctx.fillRect(0, 0, scene.width, scene.height)` 後，
		// Stage 2 實測角落像素會變成 [0, 0, 0, 255]（純黑），本斷言可清楚偵測到。
		const corners = await readCornerPixels(page, buffer);
		for (const corner of Object.values(corners)) {
			expect(corner.r).toBeGreaterThan(WHITE_CORNER_THRESHOLD);
			expect(corner.g).toBeGreaterThan(WHITE_CORNER_THRESHOLD);
			expect(corner.b).toBeGreaterThan(WHITE_CORNER_THRESHOLD);
		}

		expect(
			consoleIssues,
			`不應有 console error/warning：\n${consoleIssues.join("\n")}`,
		).toEqual([]);
	});

	// §8：列印流程與 print CSS（tasks 8.1）。

	test("點擊列印 PDF 會呼叫瀏覽器列印一次", async ({ page }) => {
		const consoleIssues = trackConsoleIssues(page);

		// 覆寫 window.print 為記錄呼叫次數的 stub，MUST 在頁面任何 script 執行前注入。
		// ExportActions.handlePrint 是在點擊當下才以 `printer ?? window.print?.bind(window)`
		// 取得列印函式（見該檔），故此處覆寫對「點擊當下」仍然有效。
		await page.addInitScript(() => {
			const win = window as unknown as { __printCallCount: number };
			win.__printCallCount = 0;
			window.print = () => {
				win.__printCallCount += 1;
			};
		});

		await seedRoster(page, 2);
		await page.goto("/matchmaker");
		await page.getByRole("button", { name: "產生本輪對戰" }).click();

		await page.getByRole("button", { name: "列印 PDF" }).click();

		const callCount = await page.evaluate(
			() => (window as unknown as { __printCallCount: number }).__printCallCount,
		);
		expect(callCount).toBe(1);

		expect(
			consoleIssues,
			`不應有 console error/warning：\n${consoleIssues.join("\n")}`,
		).toEqual([]);
	});

	test("列印媒體下隱藏全站導覽與操作控制項並顯示列印版內容", async ({ page }) => {
		await seedRoster(page, 2);
		await page.goto("/matchmaker");
		await page.getByRole("button", { name: "產生本輪對戰" }).click();

		await page.emulateMedia({ media: "print" });

		// 全站導覽（app/layout.tsx 的 SiteNavbar，渲染出 body 直接子節點 <header>）。
		await expect(page.locator("body > header")).toBeHidden();

		// M7／M8 之後的區段導覽（裁決 3）：nav 本身與其四個分頁連結（對戰／參賽者／
		// 歷史／資料）逐一斷言，而非只驗 nav 元素本身——nav 隱藏不代表連結本身
		// 沒有各自被其他規則影響到可見性。
		const sectionNav = page.locator('nav[aria-label="對戰分配區段導覽"]');
		await expect(sectionNav).toBeHidden();
		for (const label of ["對戰", "參賽者", "歷史", "資料"]) {
			await expect(sectionNav.getByRole("link", { name: label, exact: true })).toBeHidden();
		}

		// 對戰頁的操作控制項（data-print="hide"）：頁面標題區、匯出入口、
		// RoundControls 包裝、對戰舞台區。
		await expect(page.getByRole("heading", { name: "對戰分配", exact: true })).toBeHidden();
		await expect(page.getByRole("button", { name: "匯出 JPG" })).toBeHidden();
		await expect(page.getByRole("button", { name: "列印 PDF" })).toBeHidden();
		await expect(page.getByTestId("match-stage-region")).toBeHidden();

		// 列印版內容為可見。
		await expect(page.locator('[data-print="sheet"]')).toBeVisible();
	});

	test("列印版的每個場地區塊設定為不跨頁切斷", async ({ page }) => {
		await seedRoster(page, 2);
		await page.goto("/matchmaker");
		await page.getByRole("button", { name: "產生本輪對戰" }).click();

		await page.emulateMedia({ media: "print" });

		const breakInside = await page
			.locator('[data-print="court"]')
			.first()
			.evaluate((element) => getComputedStyle(element).breakInside);
		expect(breakInside).toBe("avoid");
	});

	// self-review checklist 額外驗收：@media print 的規則以 body:has([data-print="sheet"])
	// 收斂，SHALL NOT 外溢到 matchmaker 以外的路由——在沒有 PrintSheet 的首頁驗證
	// navbar 於列印媒體下仍可見。
	test("非 matchmaker 路由的全站導覽不受列印樣式影響", async ({ page }) => {
		await page.goto("/");
		await page.emulateMedia({ media: "print" });

		await expect(page.locator("body > header")).toBeVisible();
	});
});
