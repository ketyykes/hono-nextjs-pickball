// Minor-2：同 repo 既有風格勝出——tests/e2e/specs/matchmaker-data-transfer.spec.ts 第 1 行
// 即是 `import { Buffer } from "node:buffer";`，本檔沿用而非依賴全域 Buffer。
import { Buffer } from "node:buffer";
import { test, expect } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

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

// 取得整份 LocalStorage 的快照。唯讀保證的 spec 文字是「MUST NOT 修改……或**任何**
// LocalStorage 資料」，因此比對範圍必須是整份而非單一 key——只比對 matchmaker:round:v1
// 的話，「寫別的 key」「刪掉某個 key」「新增全新 key」三種違規都會靜默通過。
async function snapshotLocalStorage(page: Page): Promise<Record<string, string>> {
	return page.evaluate(() => {
		const snapshot: Record<string, string> = {};
		for (let index = 0; index < window.localStorage.length; index++) {
			const key = window.localStorage.key(index);
			if (key === null) continue;
			snapshot[key] = window.localStorage.getItem(key) ?? "";
		}
		return snapshot;
	});
}

// §9 tasks 9.3：把「種名單 + 產生一輪」這段各 test 重複的前置動作收斂為單一 helper。
// 回合格式來源為 M4 的 `matchmaker:round:v1`，改動請同步。
// 能用 UI 操作到達的狀態優先用 UI 操作，只有無法用 UI 到達的狀態（球員名單本身沒有
// 對應的 UI 建立流程）才種資料——「已有回合」一律靠點擊「產生本輪對戰」達成，
// 不直接寫入 matchmaker:round:v1（沿用 M5 design Decision 10 既有裁決）。
async function gotoMatchmakerWithRound(page: Page, count: number): Promise<void> {
	await seedRoster(page, count);
	await page.goto("/matchmaker");
	await page.getByRole("button", { name: "產生本輪對戰" }).click();
}

// §9 tasks 9.1：以鍵盤 Tab 走訪，而非直接呼叫 locator.focus()——後者會繞過瀏覽器真實的
// 鍵盤走訪順序，測不出「使用者只用鍵盤是否真的到得了這裡」（spec：MUST 可由鍵盤操作）。
// 逐次按 Tab 後才檢查是否已聚焦（而非先檢查再按），因為起始焦點在 body，需要先移動一次
// 才可能命中任何元素。
async function tabUntilFocused(page: Page, locator: Locator, maxTabPresses = 50): Promise<void> {
	for (let attempt = 0; attempt < maxTabPresses; attempt++) {
		await page.keyboard.press("Tab");
		const isFocused = await locator
			.evaluate((element) => element === document.activeElement)
			.catch(() => false);
		if (isFocused) return;
	}
	throw new Error(`Tab 鍵在 ${maxTabPresses} 次內未能到達目標元素`);
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

		await gotoMatchmakerWithRound(page, 2);

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

		await gotoMatchmakerWithRound(page, 2);

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

		await gotoMatchmakerWithRound(page, 2);

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
		await gotoMatchmakerWithRound(page, 2);

		// 先在**螢幕媒體**下確認這些元素都真的存在——Playwright 的 role 查詢會把
		// display:none 的元素排除在無障礙樹外，切到 print 之後 getByRole 一律回 0 個，
		// 屆時 toBeHidden() 對「元素根本不存在」同樣通過，只寫後者會讓「把整塊刪掉」
		// 的實作也綠燈（Stage 2 Minor-4）。故存在性一律在切換媒體前確認。
		const pageHeading = page.getByRole("heading", { name: "對戰分配", exact: true });
		const exportJpgButton = page.getByRole("button", { name: "匯出 JPG" });
		const printPdfButton = page.getByRole("button", { name: "列印 PDF" });
		// 「產生本輪對戰」是 RoundControls 內的按鈕（Stage 2 Major-2）：原本四條斷言裡
		// 「匯出 JPG」與「列印 PDF」同屬 ExportActions，等於 ExportActions 驗兩次、
		// RoundControls 那層包裝一次都沒驗——拿掉它的 data-print="hide" 測試照樣全綠。
		const generateButton = page.getByRole("button", { name: "產生本輪對戰" });
		const stageRegion = page.getByTestId("match-stage-region");
		for (const locator of [pageHeading, exportJpgButton, printPdfButton, generateButton, stageRegion]) {
			await expect(locator).toHaveCount(1);
		}

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
		// RoundControls 包裝、對戰舞台區。存在性已於切換媒體前確認（見上方）。
		// 以 CSS 選擇器（而非 role）判定可見性：role 查詢在 display:none 下回 0 個元素，
		// toBeHidden() 會空洞通過，無法區分「被隱藏」與「不存在」。
		// ⚠️ 選擇器**刻意不含** [data-print="hide"]：若把它寫進選擇器，一旦某塊的
		// data-print="hide" 被拿掉，該選擇器就match 到 0 個元素，toBeHidden() 又會空洞
		// 通過——正是這條斷言要擋的那個 mutant。改以「這個元素本身」定位，才真的在驗
		// 「它有沒有被隱藏」。
		// 用完全比對的 regex 挑出頁面標題那個 h1——PrintSheet 的 h1 是
		// 「匹克球對戰分配機　第 1 輪　單打」，含有「對戰分配」四字，
		// 用 hasText 部分比對會同時命中兩個而觸發 strict mode violation。
		await expect(page.locator("main h1").filter({ hasText: /^對戰分配$/ })).toBeHidden();
		await expect(page.locator("main button", { hasText: "匯出 JPG" })).toBeHidden();
		await expect(page.locator("main button", { hasText: "列印 PDF" })).toBeHidden();
		await expect(page.locator("main button", { hasText: "產生本輪對戰" })).toBeHidden();
		await expect(stageRegion).toBeHidden();

		// 列印版內容為可見。
		await expect(page.locator('[data-print="sheet"]')).toBeVisible();

		// 列印版的內容 MUST 來自與 JPG 相同的那一份 ExportScene（spec：PDF 以瀏覽器
		// 列印流程輸出）。Stage 2 實測：把 scene 換成另外組出來的物件（例如改掉 title）
		// 測試照樣全綠——同源這件事完全沒有驗收。這裡以列印版標題必須逐字等於
		// buildExportScene 組出的標題來釘住：App 名稱常數、回合編號、對戰方式三者
		// 任一被另一份來源覆寫都會轉紅。
		await expect(page.locator('[data-print="sheet"] h1')).toHaveText(
			"匹克球對戰分配機　第 1 輪　單打",
		);
	});

	test("列印版的每個場地區塊設定為不跨頁切斷", async ({ page }) => {
		await gotoMatchmakerWithRound(page, 2);

		await page.emulateMedia({ media: "print" });

		// 逐一驗**每個**場地區塊，而非只驗第一個（Stage 2 Minor-3）：規則若被寫成
		// 只作用於首個區塊（例如誤用 :first-child），只驗第一個會完全看不出來。
		const courts = page.locator('[data-print="court"]');
		const courtCount = await courts.count();
		expect(courtCount).toBeGreaterThan(0);
		for (let index = 0; index < courtCount; index++) {
			const breakInside = await courts
				.nth(index)
				.evaluate((element) => getComputedStyle(element).breakInside);
			expect(breakInside).toBe("avoid");
		}
	});

	// Stage 2 Major-1：spec 明訂「列印版內容 MUST 顯示（**螢幕上則 MUST 隱藏**）」，
	// 但「螢幕上隱藏」的唯一防線是 globals.css 那條 @media print 之外的基礎規則
	// `[data-print="sheet"] { display: none }`，而它被拿掉時**全套 E2E 都不會紅**。
	// 這條就是那道防線。
	test("列印版內容在螢幕媒體下隱藏，只有列印時才顯示", async ({ page }) => {
		await gotoMatchmakerWithRound(page, 2);

		const sheet = page.locator('[data-print="sheet"]');
		// 先確認它確實掛在 DOM 上——否則「根本沒渲染」也會讓 toBeHidden() 通過。
		// 用 CSS 選擇器而非 role 查詢：後者在 display:none 下回 0 個元素，count 驗不到。
		await expect(sheet).toHaveCount(1);
		await expect(sheet).toBeHidden();

		// 同一個元素在列印媒體下 MUST 轉為可見，證明隱藏是媒體查詢造成的、
		// 不是元件永遠不顯示。
		await page.emulateMedia({ media: "print" });
		await expect(sheet).toBeVisible();
	});

	// self-review checklist 額外驗收：@media print 的規則以 body:has([data-print="sheet"])
	// 收斂，SHALL NOT 外溢到 matchmaker 以外的路由——在沒有 PrintSheet 的首頁驗證
	// navbar 於列印媒體下仍可見。
	test("非 matchmaker 路由的全站導覽不受列印樣式影響", async ({ page }) => {
		await page.goto("/");
		await page.emulateMedia({ media: "print" });

		await expect(page.locator("body > header")).toBeVisible();
	});

	// §9：匯出 SHALL 為唯讀操作——匯出流程 MUST NOT 改動目前回合或任何 LocalStorage 資料
	// （spec「匯出為純前端唯讀操作」）。
	test("匯出 JPG 後目前回合與本機資料保持不變", async ({ page }) => {
		await gotoMatchmakerWithRound(page, 2);

		// 比對**整份** LocalStorage 而非只挑 matchmaker:round:v1：spec 的文字是
		// 「MUST NOT 修改參賽者名單、目前回合、歷史紀錄或**任何** LocalStorage 資料」，
		// 只比對單一 key 會漏掉「寫別的 key」「刪掉某個 key」「新增全新 key」三種違規
		// （審查實測：這三種在單 key 比對下全部綠燈）。
		const storageBeforeExport = await snapshotLocalStorage(page);
		// 前置條件：回合確實已存在，否則後面比對的是兩份空快照，測試會空洞通過。
		expect(storageBeforeExport[ROUND_STORAGE_KEY]).toBeDefined();

		await Promise.all([
			page.waitForEvent("download"),
			page.getByRole("button", { name: "匯出 JPG" }).click(),
		]);

		expect(await snapshotLocalStorage(page)).toEqual(storageBeforeExport);

		// 重新整理後再確認一次（spec 的 AND）：場地數、場次狀態與比分全部包在
		// matchmaker:round:v1 這份 JSON 裡，整份快照逐鍵逐值相同即代表三者都未被改動。
		await page.reload();
		expect(await snapshotLocalStorage(page)).toEqual(storageBeforeExport);
	});

	// §9：匯出 MUST 完全在瀏覽器本機完成，不得將參賽者資料送往後端或第三方服務
	// （spec「匯出為純前端唯讀操作」；prd.md 12.4）。
	test("匯出過程不發出任何網路請求", async ({ page }) => {
		// 列印用 stub，避免真的呼叫瀏覽器原生列印對話框卡住測試（沿用既有列印測試的既有裁決）。
		await page.addInitScript(() => {
			window.print = () => {};
		});

		await gotoMatchmakerWithRound(page, 2);

		// 頁面載入期間本身會有 RSC payload、字型、chunk 等請求（開發模式下還有 HMR），
		// 那些不是「匯出動作發出的請求」，故等頁面完全靜止後才開始計數。
		await page.waitForLoadState("networkidle");

		// 用 URL 黑名單而非 resourceType 白名單。spec 的 THEN 雖只列 fetch 與 XHR，
		// 但 Requirement 正文是「SHALL NOT 將**任何**參賽者資料送往後端或第三方服務」，
		// 且 design Decision 1 明言「這條 e2e 就是那個決策的自動化防線」。審查實測：
		// 只認 fetch／xhr 的話，navigator.sendBeacon（resourceType 為 **ping**，POST，
		// body 可夾帶全部姓名與比分）與 new Image().src（resourceType 為 image）
		// 這兩種最常見的外洩手法可以直接繞過防線。
		// 排除項只有 Next.js 的建置產物與 RSC payload——實測 networkidle 之後，
		// 匯出路徑的 await document.fonts.ready 仍會補一筆
		// /_next/static/media/*.woff2，那不是「匯出把資料送出去」。
		const IGNORED_REQUEST_URL = /\/_next\/|[?&]_rsc=|^data:|^blob:/;
		// 記錄違規清單而非計數：失敗訊息才能直接指出是哪一個 URL 把資料送了出去。
		const offendingRequests: string[] = [];
		page.on("request", (request) => {
			if (request.resourceType() === "websocket") return;
			const url = request.url();
			if (IGNORED_REQUEST_URL.test(url)) return;
			offendingRequests.push(`${request.resourceType()} ${request.method()} ${url}`);
		});

		await Promise.all([
			page.waitForEvent("download"),
			page.getByRole("button", { name: "匯出 JPG" }).click(),
		]);

		await page.getByRole("button", { name: "列印 PDF" }).click();

		// 留一段沉澱時間再斷言：fire-and-forget 的外洩（例如在 setTimeout 或
		// Promise 尾巴才送出）在點擊當下還沒發生，立即斷言會讓它逃掉。
		await page.waitForTimeout(1000);

		expect(
			offendingRequests,
			`匯出過程 MUST NOT 發出任何請求，實際發出：\n${offendingRequests.join("\n")}`,
		).toEqual([]);
	});

	// §9：兩個匯出入口 MUST 具備可辨識的文字或 aria-label，且 MUST 可由鍵盤操作
	// （spec「匯出入口的可用性與無障礙」；prd.md 12.3、12.5）。
	test("匯出入口具備可存取名稱且可由鍵盤操作", async ({ page }) => {
		await gotoMatchmakerWithRound(page, 2);

		// gotoMatchmakerWithRound 內點擊「產生本輪對戰」後，該按鈕仍保有 focus——Firefox
		// 對「Tab 到文件最後一個可聚焦元素後再按 Tab」不會循環回文件開頭（Chromium／WebKit
		// 會），若不清掉這個殘留 focus，往後 Tab 永遠到不了在 DOM 順序上更早的匯出入口
		// （debug 實測：firefox 卡在最後一顆「送出比分」按鈕原地不動）。清空 focus 讓起點
		// 回到中性狀態（document.activeElement 為 body），與「使用者剛載入頁面、尚未點擊
		// 任何東西就開始按 Tab」的情境等價，三種桌面瀏覽器行為才會一致。
		await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());

		const exportJpgButton = page.getByRole("button", { name: "匯出 JPG" });
		const printPdfButton = page.getByRole("button", { name: "列印 PDF" });

		await tabUntilFocused(page, exportJpgButton);
		await expect(exportJpgButton).toBeFocused();
		await expect(exportJpgButton).toHaveAccessibleName(/\S/);

		await tabUntilFocused(page, printPdfButton);
		await expect(printPdfButton).toBeFocused();
		await expect(printPdfButton).toHaveAccessibleName(/\S/);
	});
});
