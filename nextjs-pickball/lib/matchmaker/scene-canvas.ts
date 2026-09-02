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
	TILE_COLUMNS,
	TILE_ROW_HEIGHT,
	TITLE_AREA_HEIGHT,
} from "./export-scene";
import type { ExportCourt, ExportScene, ExportTile } from "./export-scene";

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
	// 這是刻意的選擇而非疏漏：畫面版 tile-style.ts 用 135 度（對角）漸層，但 canvas 的
	// createLinearGradient 是取兩個座標點而非角度，在球員格這種窄格內把對角漸層換算成
	// 座標點的收益極低（design Risks 已接受手繪版與畫面版漸層方向可以不同）。
	const gradient = ctx.createLinearGradient(rectX, rectY, rectX + rectWidth, rectY);
	gradient.addColorStop(0, tile.colorFrom);
	gradient.addColorStop(1, tile.colorTo);
	ctx.fillStyle = gradient;
	ctx.fillRect(rectX, rectY, rectWidth, rectHeight);

	ctx.fillStyle = tile.textColor;
	ctx.font = `700 ${TILE_NAME_FONT_SIZE}px ${fontFamily}`;
	ctx.textAlign = "center";
	ctx.textBaseline = "middle";
	// 第四個參數 maxWidth：canvas 原生的「壓縮至不超過此寬度」語意，是畫面版
	// PlayerTile.tsx 的 truncate + overflow-hidden 在手繪版的對應物。PlayerSchema
	// 對姓名沒有長度上限，沒有這個參數，極長姓名會不換行、不裁切地衝出畫布並覆蓋鄰格
	// （design Decision 3、matchmaker-visual-export tasks §7 Major-3）。
	ctx.fillText(
		tile.name,
		rectX + rectWidth / 2,
		rectY + rectHeight / 2,
		rectWidth - TILE_INNER_PADDING * 2,
	);
}

/** 畫出一個場地區塊（表頭 + 全部球員格）。區塊高度由 court.blockHeight 提供，本檔不推導。 */
function drawCourt(ctx: CanvasRenderingContext2D, court: ExportCourt, courtY: number, fontFamily: string): void {
	drawCourtHeader(ctx, court, courtY, fontFamily);

	const tilesTop = courtY + COURT_HEADER_HEIGHT;
	for (const tile of court.tiles) {
		drawTile(ctx, tile, tilesTop, fontFamily);
	}
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
		drawCourt(ctx, court, courtY, fontFamily);
		// 區塊高度直接取自 scene，不由 tiles 反推對戰方式再套公式——推導屬行為邏輯，
		// 不該住在例外層，且反推在 tiles 為空時會靜默給出錯誤答案（§7 Stage 2 Major-2）。
		courtY += court.blockHeight + COURT_BLOCK_SPACING;
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
