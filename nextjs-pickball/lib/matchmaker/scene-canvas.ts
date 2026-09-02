// lib/matchmaker/scene-canvas.ts
//
// 【例外層】本檔是本 workspace TDD 規則的例外層，不走「先紅燈單元測試」——原因：
// 所有內容決策（畫什麼、畫在哪、什麼顏色、多大）都已在 `ExportScene`（export-scene.ts）
// 裡定死，本檔只是把 scene 逐項翻成 canvas 呼叫，沒有任何網域邏輯分支。happy-dom
// 沒有實作 2D context，硬要在單元測試裡驗證就得自造一個假 ctx 錄下呼叫序列——那驗證的是
// 「我有沒有照我自己寫的順序呼叫 canvas API」，不是「圖對不對」，沒有意義。
// 故本檔改以 E2E 驗收（tests/e2e/specs/visual-export.spec.ts），驗證「有沒有真的產出一張
// 非空的 JPEG」；「畫了什麼內容」由 export-scene.test.ts 的純函式單元測試涵蓋
// （design Decision 7、Decision 9）。
//
// Cloudflare Workers（OpenNext）部署注意：本檔所有瀏覽器 API（document／window／canvas）
// 呼叫 MUST 只在函式內部觸發，模組層級零觸碰，否則 SSR／prerender 階段會在 workerd 內炸掉。

import {
	CANVAS_WIDTH,
	COURT_BLOCK_SPACING,
	COURT_HEADER_HEIGHT,
	TILE_ROW_HEIGHT,
	TILE_ROWS_BY_FORMAT,
	TITLE_AREA_HEIGHT,
	courtBlockHeight,
} from "./export-scene";
import type { ExportCourt, ExportScene, ExportTile } from "./export-scene";
import type { MatchFormat } from "./allocation-types";

// 位圖縮放倍率：canvas 的 CSS 尺寸與位圖尺寸分離，位圖取 2 倍讓文字在高解析螢幕與列印時
// 不糊（design Decision 9）。
//
// 不採 `window.devicePixelRatio`：那會讓同一輪在不同裝置匯出得到不同尺寸的檔案，違反
// 「同一份輸入產生同一份輸出」的一貫要求（同一份 ExportScene 不論在哪台裝置匯出，
// 都應得到位元組層級可預期的同一種尺寸規格）。
const EXPORT_BITMAP_SCALE = 2;

// JPEG 編碼品質：0.9 以下在大面積漸層（球員色塊正是大面積漸層）上會出現可見色帶，
// 1.0 則檔案暴增而肉眼無差，0.92 是常見的平衡點（design Decision 9）。
const EXPORT_JPEG_QUALITY = 0.92;

// 每個球員格內縮的留白（logical px），讓相鄰格之間留出可辨識的間隙，避免色塊互相貼合。
const TILE_INNER_PADDING = 8;

// 場地區塊內，球員格固定切兩欄（單打／雙打皆是——teamIndex 0／1 各佔一欄，
// 雙打同隊兩人再往下一列展開，見 stage-layout.ts buildCourtTiles 的既有版面規則）。
const TILE_COLUMNS = 2;

// 標題／場地表頭／狀態文字的預設文字色（在 ExportScene.background 白底上需可讀）；
// 球員格文字色一律使用 ExportTile.textColor（由 pickTextColor 依漸層對比度算出），
// 不套用本常數。
const DEFAULT_TEXT_COLOR = "#1F2937";

// 標題／場地表頭／狀態文字／球員格姓名的字級（logical px）。
const TITLE_FONT_SIZE = 32;
const COURT_HEADER_FONT_SIZE = 20;
const STATUS_FONT_SIZE = 16;
const TILE_NAME_FONT_SIZE = 22;

// 場地表頭與畫布邊界之間的水平留白。
const COURT_HEADER_HORIZONTAL_PADDING = 16;

/**
 * 由 TILE_ROWS_BY_FORMAT 反推「球員格列數 → 對戰方式」的對照表，供由 ExportCourt.tiles
 * 反推該場地的 MatchFormat（ExportCourt 本身沒有 format 欄位，見 tasks §7 裁決 2）。
 * 純粹由既有常數（TILE_ROWS_BY_FORMAT）在模組載入時衍生一次，不重寫任何幾何公式。
 */
const FORMAT_BY_ROW_COUNT = new Map<number, MatchFormat>(
	(Object.entries(TILE_ROWS_BY_FORMAT) as [MatchFormat, number][]).map(([format, rows]) => [
		rows,
		format,
	]),
);

/** 由一個場地區塊的球員格列數，反推其對戰方式，以便呼叫既有的 courtBlockHeight(format)。 */
function resolveCourtFormat(court: ExportCourt): MatchFormat {
	const rowCount = court.tiles.reduce((max, tile) => Math.max(max, tile.row), 0) + 1;
	const format = FORMAT_BY_ROW_COUNT.get(rowCount);
	if (format === undefined) {
		// 理論上不可達：TILE_ROWS_BY_FORMAT 目前只有 1（單打）與 2（雙打）兩種列數，
		// buildExportScene 的輸出必定落在其中之一。留下明確錯誤而非靜默用預設值，
		// 資料損壞時才不會畫出錯誤高度的版面卻無跡可尋。
		throw new Error(`無法由球員格列數 ${rowCount} 推導對戰方式`);
	}
	return format;
}

/** 取得目前頁面實際套用的字型堆疊（解析 CSS 變數後的結果），讓 canvas 文字與頁面視覺一致。 */
function resolveBodyFontFamily(): string {
	return getComputedStyle(document.body).fontFamily;
}

/** 畫出標題列：置中於 TITLE_AREA_HEIGHT 區塊內。 */
function drawTitle(ctx: CanvasRenderingContext2D, scene: ExportScene, fontFamily: string): void {
	ctx.fillStyle = DEFAULT_TEXT_COLOR;
	ctx.font = `700 ${TITLE_FONT_SIZE}px ${fontFamily}`;
	ctx.textAlign = "center";
	ctx.textBaseline = "middle";
	ctx.fillText(scene.title, scene.width / 2, TITLE_AREA_HEIGHT / 2);
}

/** 畫出一個場地區塊的表頭：場地編號（左）與場次狀態文字（右），垂直置中於表頭高度內。 */
function drawCourtHeader(
	ctx: CanvasRenderingContext2D,
	court: ExportCourt,
	courtY: number,
	fontFamily: string,
): void {
	const headerCenterY = courtY + COURT_HEADER_HEIGHT / 2;

	ctx.fillStyle = DEFAULT_TEXT_COLOR;
	ctx.textBaseline = "middle";

	ctx.font = `700 ${COURT_HEADER_FONT_SIZE}px ${fontFamily}`;
	ctx.textAlign = "left";
	ctx.fillText(`場地 ${court.courtNumber}`, COURT_HEADER_HORIZONTAL_PADDING, headerCenterY);

	ctx.font = `400 ${STATUS_FONT_SIZE}px ${fontFamily}`;
	ctx.textAlign = "right";
	ctx.fillText(court.statusText, CANVAS_WIDTH - COURT_HEADER_HORIZONTAL_PADDING, headerCenterY);
}

/** 畫出單一球員格：漸層底色（先內縮留白）＋置中姓名。 */
function drawTile(ctx: CanvasRenderingContext2D, tile: ExportTile, courtTilesTop: number, fontFamily: string): void {
	const columnWidth = CANVAS_WIDTH / TILE_COLUMNS;
	const cellX = tile.column * columnWidth;
	const cellY = courtTilesTop + tile.row * TILE_ROW_HEIGHT;

	const rectX = cellX + TILE_INNER_PADDING;
	const rectY = cellY + TILE_INNER_PADDING;
	const rectWidth = columnWidth - TILE_INNER_PADDING * 2;
	const rectHeight = TILE_ROW_HEIGHT - TILE_INNER_PADDING * 2;

	// 水平漸層：由格子左緣到右緣，colorFrom → colorTo。
	const gradient = ctx.createLinearGradient(rectX, rectY, rectX + rectWidth, rectY);
	gradient.addColorStop(0, tile.colorFrom);
	gradient.addColorStop(1, tile.colorTo);
	ctx.fillStyle = gradient;
	ctx.fillRect(rectX, rectY, rectWidth, rectHeight);

	ctx.fillStyle = tile.textColor;
	ctx.font = `700 ${TILE_NAME_FONT_SIZE}px ${fontFamily}`;
	ctx.textAlign = "center";
	ctx.textBaseline = "middle";
	ctx.fillText(tile.name, rectX + rectWidth / 2, rectY + rectHeight / 2);
}

/** 畫出一個場地區塊（表頭 + 全部球員格），回傳其佔用高度供呼叫端累加下一個場地的起點。 */
function drawCourt(ctx: CanvasRenderingContext2D, court: ExportCourt, courtY: number, fontFamily: string): number {
	drawCourtHeader(ctx, court, courtY, fontFamily);

	const tilesTop = courtY + COURT_HEADER_HEIGHT;
	for (const tile of court.tiles) {
		drawTile(ctx, tile, tilesTop, fontFamily);
	}

	return courtBlockHeight(resolveCourtFormat(court));
}

/**
 * 依 ExportScene 逐項翻譯為 canvas 繪製呼叫。繪製順序：先以 scene.background 填滿整張
 * 畫布（JPEG 無 alpha 通道，未先填底色會讓透明區在部分瀏覽器編碼成黑色，design Decision 9），
 * 再畫標題，最後依序畫每個場地區塊。
 */
function drawScene(ctx: CanvasRenderingContext2D, scene: ExportScene): void {
	const fontFamily = resolveBodyFontFamily();

	ctx.fillStyle = scene.background;
	ctx.fillRect(0, 0, scene.width, scene.height);

	drawTitle(ctx, scene, fontFamily);

	let courtY = TITLE_AREA_HEIGHT + COURT_BLOCK_SPACING;
	for (const court of scene.courts) {
		const blockHeight = drawCourt(ctx, court, courtY, fontFamily);
		courtY += blockHeight + COURT_BLOCK_SPACING;
	}
}

/**
 * 將 ExportScene 繪製為 JPEG 並觸發瀏覽器下載。
 *
 * canvas 繪製、`toBlob`、`URL.createObjectURL`、`<a download>`、`revokeObjectURL`
 * 全部留在本檔（matchmaker-visual-export tasks §7 裁決 1）：Stage 2 的分層檢查要求
 * 「canvas 與 <a download> 只出現在 scene-canvas.ts 與 ExportActions.tsx」，若由呼叫端
 * （page.tsx）組裝下載，`<a download>` 會跑進例外層的頁面，變成三個檔案都碰瀏覽器 I/O。
 *
 * SHALL NOT import `components/matchmaker/downloadTextFile.ts`（M8 的下載樣板）：
 * 它的輸入是字串，本函式的輸入是 Blob，共用會繞 `Blob → 字串 → Blob` 一圈，刻意各自
 * 持有一份（tasks §7 裁決 1）。
 */
export async function downloadSceneAsJpeg(scene: ExportScene, fileName: string): Promise<void> {
	const canvas = document.createElement("canvas");
	canvas.width = scene.width * EXPORT_BITMAP_SCALE;
	canvas.height = scene.height * EXPORT_BITMAP_SCALE;

	const ctx = canvas.getContext("2d");
	if (ctx === null) {
		throw new Error("瀏覽器不支援 2D canvas，無法匯出 JPG");
	}
	ctx.scale(EXPORT_BITMAP_SCALE, EXPORT_BITMAP_SCALE);

	// 繪製前 MUST 等字型就緒，否則 Noto Sans TC 尚未載入時 fillText 會以 fallback 字型
	// 繪出，中文姓名的字寬與字形都會走樣（design Decision 9）。
	await document.fonts.ready;

	drawScene(ctx, scene);

	const blob = await new Promise<Blob | null>((resolve) => {
		canvas.toBlob(resolve, "image/jpeg", EXPORT_JPEG_QUALITY);
	});
	if (blob === null) {
		throw new Error("canvas 編碼 JPEG 失敗");
	}

	const url = URL.createObjectURL(blob);
	const anchor = document.createElement("a");
	anchor.href = url;
	anchor.download = fileName;
	document.body.appendChild(anchor);
	anchor.click();
	document.body.removeChild(anchor);
	URL.revokeObjectURL(url);
}
