// 匯出內容的組裝——由「目前回合 + 參賽者名單」推導出單一份 ExportScene，
// JPG 與 PDF 兩條匯出路徑共用這同一份內容，不各自組裝（design Decision 2）。
// 本檔為純函式：零 window／document／Blob／canvas 引用、零 new Date()，
// ExportScene 為可序列化純資料（無函式、無 class 實例）。

import { pickTextColor } from "./colors";
import { FORMAT_LABEL, TEAM_LABELS_BY_KEY } from "./labels";
import { buildCourtTiles } from "./stage-layout";
import type { CourtTileTeamSource } from "./stage-layout";
import type { MatchFormat } from "./allocation-types";
import type { Round, RoundMatch } from "./round-types";
import type { Gender, Player } from "./types";

/** App 名稱，匯出標題與（未來的）列印稿共用，SHALL NOT 由各呼叫端各自寫死（prd.md 9.4）。 */
export const EXPORT_APP_NAME = "匹克球對戰分配機";

/** 回合編號標題片段的前後綴，例如「第 3 輪」。 */
const ROUND_LABEL_PREFIX = "第 ";
const ROUND_LABEL_SUFFIX = " 輪";

/** 標題各段落之間的分隔符（全形空白，避免中文字緊貼難以辨讀）。 */
const TITLE_SEPARATOR = "　";

/** 已完成場次狀態文字中，比分兩數之間的分隔符。 */
const SCORE_SEPARATOR = " : ";

/**
 * 已完成場次狀態文字中，比分與勝方之間的分隔符。與 `TITLE_SEPARATOR` 恰好同為全形空白，
 * 但兩者是不同的排版決策（一個分隔標題段落、一個分隔狀態文字段落）：獨立持有常數，
 * 避免日後改動標題分隔符時無意間連帶改掉狀態文字排版，且改動時沒有測試會示警。
 */
const STATUS_SEPARATOR = "　";

/** 已完成場次狀態文字的「獲勝」後綴，例如「第一隊獲勝」。 */
const WINNER_SUFFIX = "獲勝";

/** 未完成場次（pending／scoring 皆算未完成）的狀態文字，SHALL NOT 留白（spec：比分或未完成狀態）。 */
const INCOMPLETE_STATUS_TEXT = "未完成";

/** 名單中找不到該球員時的替代文字（design Decision 8：輸出替代文字，不跳過該格、不拋錯）。 */
const MISSING_PLAYER_NAME = "已離開名單";

/** 替代文字球員的中性色（灰階），與真實球員的漸層調色盤區隔，一眼可辨識該格是佔位。 */
const PLACEHOLDER_COLOR_FROM = "#9CA3AF";
const PLACEHOLDER_COLOR_TO = "#4B5563";

/** 替代文字球員的其餘 Player 欄位固定值——這些欄位不參與版面推導或顯示，僅為滿足型別。 */
const PLACEHOLDER_GENDER: Gender = "other";
const PLACEHOLDER_RATING = 1;
const PLACEHOLDER_CREATED_AT = "1970-01-01T00:00:00.000Z";

/** 匯出畫布底色：不透明白色。JPEG 無 alpha 通道，透明底在部分瀏覽器會編碼成黑色（design Decision 9）。 */
const EXPORT_BACKGROUND_COLOR = "#FFFFFF";

/**
 * 匯出畫布寬度（邏輯像素，未乘 2 倍縮放；縮放由 scene-canvas.ts 處理，見 design Decision 9）。
 * 對 scene-canvas.ts 而言是唯一內容真相來源需要匯出的幾何常數之一（matchmaker-visual-export
 * tasks §7 裁決 2）：本檔負責「場地區塊高度／畫布高度只算一次」，scene-canvas.ts 只能引用、
 * SHALL NOT 自行重算。
 */
export const CANVAS_WIDTH = 800;

/** 標題區高度。 */
export const TITLE_AREA_HEIGHT = 96;

/** 場地區塊之間與頭尾的間距；courtCount 個場地共有 courtCount + 1 段間距。 */
export const COURT_BLOCK_SPACING = 24;

/** 每個場地區塊固定部分的高度（場地編號列 + 狀態文字列），與對戰方式無關。 */
export const COURT_HEADER_HEIGHT = 56;

/** 每一列球員格的高度。 */
export const TILE_ROW_HEIGHT = 88;

/**
 * 場地區塊內，球員格固定切兩欄（單打／雙打皆是——teamIndex 0／1 各佔一欄，
 * 雙打同隊兩人再往下一列展開，見 stage-layout.ts buildCourtTiles 的既有版面規則）。
 * 幾何的唯一真相來源在本檔（matchmaker-visual-export tasks §7 Minor-4），scene-canvas.ts
 * 只能引用、SHALL NOT 自行持有一份。
 *
 * ⚠️ 隱含假設：本常數為 2 隱含 `stage-layout.ts` 的 `buildCourtTiles` 只會輸出
 * `column ∈ {0, 1}`——若該檔日後改為輸出兩欄以外的 column 值，本常數與依賴它的
 * 版面計算（scene-canvas.ts 的 columnWidth 切分）都需要同步檢視。
 */
export const TILE_COLUMNS = 2;

/**
 * 各對戰方式的球員列數：單打 1 列（兩格左右並排），雙打 2 列（上下各兩格）。
 * 僅供本檔的 courtBlockHeight 使用，不對外匯出——場地區塊高度已由
 * `ExportCourt.blockHeight` 一併算好交給消費端，沒有人需要自行重算。
 */
const TILE_ROWS_BY_FORMAT: Record<MatchFormat, number> = {
	singles: 1,
	doubles: 2,
};

/** 一個球員格：姓名、隊伍歸屬、版面座標與可直接繪製的顏色資訊。 */
export interface ExportTile {
	readonly name: string;
	readonly teamIndex: 0 | 1;
	readonly row: number;
	readonly column: number;
	readonly colorFrom: string;
	readonly colorTo: string;
	readonly textColor: string;
}

/** 一個場地區塊：場地編號、場次狀態文字與該場全部球員格。 */
export interface ExportCourt {
	readonly courtNumber: number;
	readonly statusText: string;
	readonly tiles: readonly ExportTile[];
	/**
	 * 此場地區塊佔用的高度（邏輯像素），由 courtBlockHeight(format) 求得。
	 * 之所以放進 ExportScene 而不讓消費端自己算：scene-canvas.ts 需要它來累加下一個場地的
	 * 起點 y，但該檔是 TDD 例外層（「所有決策已在 ExportScene 內定死、本檔無推導」）。
	 * 由本檔一併算好，例外層才真的只剩「把 scene 逐項翻成 canvas 呼叫」，
	 * 也維持 tasks 2.9 的「場地區塊高度的計算只有一處」。
	 */
	readonly blockHeight: number;
}

/**
 * 匯出內容：JPG 與 PDF 兩條匯出路徑共用的唯一內容真相來源。
 * 刻意不含任何 CSS 或 canvas 概念——只有色碼、文字、座標與尺寸（design Decision 2）。
 */
export interface ExportScene {
	readonly background: string;
	readonly width: number;
	readonly height: number;
	readonly title: string;
	readonly courts: readonly ExportCourt[];
}

/** 由回合編號與對戰方式組裝標題，同時含 App 名稱、回合編號與對戰方式三項資訊（prd.md 9.4）。 */
function buildTitle(roundNumber: number, format: MatchFormat): string {
	const roundLabel = `${ROUND_LABEL_PREFIX}${roundNumber}${ROUND_LABEL_SUFFIX}`;
	return [EXPORT_APP_NAME, roundLabel, FORMAT_LABEL[format]].join(TITLE_SEPARATOR);
}

/**
 * 依 id 於名單中查找球員；找不到時（該員已被刪除）回傳灰階佔位 Player，
 * 使該格照常進入版面推導並顯示替代文字，SHALL NOT 跳過該格、SHALL NOT 拋錯
 * （design Decision 8：跳過會讓雙打場地缺一格，造成版面錯位）。
 */
function resolvePlayer(playerId: string, players: readonly Player[]): Player {
	const found = players.find((player) => player.id === playerId);
	if (found !== undefined) {
		return found;
	}

	return {
		id: playerId,
		name: MISSING_PLAYER_NAME,
		gender: PLACEHOLDER_GENDER,
		colorFrom: PLACEHOLDER_COLOR_FROM,
		colorTo: PLACEHOLDER_COLOR_TO,
		rating: PLACEHOLDER_RATING,
		restCount: 0,
		gamesPlayed: 0,
		isActive: false,
		createdAt: PLACEHOLDER_CREATED_AT,
	};
}

/**
 * 場次狀態文字：已完成場次顯示最終比分與勝方；未完成場次（pending／scoring 一律視為
 * 未完成，不為 scoring 另立第三種文案）顯示可判讀的「未完成」文字，SHALL NOT 留白。
 */
function buildStatusText(match: RoundMatch): string {
	if (match.status === "completed" && match.scores !== null && match.winner !== null) {
		const winnerLabel = TEAM_LABELS_BY_KEY[match.winner];
		return `${match.scores.teamA}${SCORE_SEPARATOR}${match.scores.teamB}${STATUS_SEPARATOR}${winnerLabel}${WINNER_SUFFIX}`;
	}

	return INCOMPLETE_STATUS_TEXT;
}

/** 由一場對戰（含名單解析）組裝出一個場地區塊。 */
function buildExportCourt(match: RoundMatch, players: readonly Player[]): ExportCourt {
	const resolvedTeams: readonly [CourtTileTeamSource, CourtTileTeamSource] = [
		{ players: match.teams[0].playerIds.map((id) => resolvePlayer(id, players)) },
		{ players: match.teams[1].playerIds.map((id) => resolvePlayer(id, players)) },
	];

	// 隊伍歸屬與列欄位置一律取自 stage-layout.ts 的既有版面推導，不在本模組重新推導一次
	// 單打／雙打的排列規則（spec：匯出內容的組成）。
	const tiles = buildCourtTiles({ format: match.format, teams: resolvedTeams }).map(
		(tile): ExportTile => ({
			name: tile.player.name,
			teamIndex: tile.teamIndex,
			row: tile.row,
			column: tile.column,
			colorFrom: tile.player.colorFrom,
			colorTo: tile.player.colorTo,
			textColor: pickTextColor(tile.player.colorFrom, tile.player.colorTo),
		}),
	);

	return {
		courtNumber: match.courtNumber,
		statusText: buildStatusText(match),
		tiles,
		blockHeight: courtBlockHeight(match.format),
	};
}

/**
 * 場地區塊高度：固定的表頭部分（場地編號＋狀態文字）加上該對戰方式的球員列數 ×
 * 每列高度。單打與雙打共用同一條公式，差異只在於 TILE_ROWS_BY_FORMAT 的列數——
 * SHALL NOT 為兩種對戰方式各寫一份公式（tasks 2.9）。
 * 不對外匯出：唯一的外部消費端 scene-canvas.ts 已改為直接讀 `ExportCourt.blockHeight`，
 * 「場地區塊高度只算一處」因此收斂在本檔內。
 */
function courtBlockHeight(format: MatchFormat): number {
	return COURT_HEADER_HEIGHT + TILE_ROWS_BY_FORMAT[format] * TILE_ROW_HEIGHT;
}

/**
 * 畫布高度：標題區 + 場地數 × 該對戰方式的場地區塊高度 + 間距。
 * 場地數愈多、或對戰方式的球員列數愈多（雙打 2 列 > 單打 1 列），高度愈高。
 *
 * 這裡的 format 取自 `round.format`（單一值），而 `buildCourtTiles` 用的是各場 `match.format`——
 * 兩者現行前提是一致的：`lib/matchmaker/round.ts` 保證同一回合每場 `format` 皆與回合相同。
 * 若日後支援同回合混合對戰方式，本函式的高度預算需改由逐場 `courts` 加總推導，
 * 不能再用單一 `round.format` 乘上場地數。
 */
function computeCanvasHeight(courtCount: number, format: MatchFormat): number {
	return (
		TITLE_AREA_HEIGHT +
		courtCount * courtBlockHeight(format) +
		(courtCount + 1) * COURT_BLOCK_SPACING
	);
}

/**
 * 由目前回合與參賽者名單，推導出單一份匯出內容。輸入視為唯讀，SHALL NOT 就地修改
 * （spec：匯出為純前端唯讀操作）。
 */
export function buildExportScene(round: Round, players: readonly Player[]): ExportScene {
	const courts = round.matches.map((match) => buildExportCourt(match, players));

	return {
		background: EXPORT_BACKGROUND_COLOR,
		width: CANVAS_WIDTH,
		height: computeCanvasHeight(round.matches.length, round.format),
		title: buildTitle(round.roundNumber, round.format),
		courts,
	};
}
