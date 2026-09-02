// 歷史賽果 → CSV 列（9.3.1 的欄位對應）。序列化（BOM、跳脫、換行）一律委派 csv.ts 的
// toCsv，本模組完全不知道那些規則的存在（design.md Decision 1）。

import { toCsv } from "./csv";
import type { MatchHistoryEntry } from "./history";

/** 對戰方式的顯示文字，與 round.ts／HistoryRecordCard.tsx 既有對照表逐字相同。 */
const FORMAT_LABEL: Record<MatchHistoryEntry["format"], string> = {
	singles: "單打",
	doubles: "雙打",
};

/** 雙打組成的顯示文字，與 HistoryRecordCard.tsx／CourtCard.tsx 既有對照表逐字相同。 */
const DOUBLES_COMPOSITION_LABEL = {
	mixed: "混雙",
	mens: "男雙",
	womens: "女雙",
	general: "一般雙打",
} as const;

/** 隊伍顯示文字，與 HistoryRecordCard.tsx 的 TEAM_LABELS 逐字相同。 */
const TEAM_LABELS: readonly [string, string] = ["第一隊", "第二隊"];

/**
 * 同一欄內多筆數值（球員姓名／分數）之間的分隔符。選用頓號而非逗號，是因為逗號已是
 * csv.ts 的欄位分隔符——若欄內也用逗號，多數情況下該欄就得被 toCsv 的跳脫規則包住
 * 引號，在試算表裡反而較難一眼讀出多人姓名或分數的分界。
 */
const MULTI_VALUE_SEPARATOR = "、";

/**
 * 比分欄（scoreA／scoreB）的分隔符。SHALL NOT 用半形冒號 `:`——`11:7` 符合 Excel／
 * Google Sheets 的 `h:mm` 時間樣式，匯入時會被自動轉型成時間值（顯示成 `11:07`），
 * 且轉型後原始文字不可逆（Stage 2 review J4）。也 SHALL NOT 用 `-` 或 `/`，
 * 那兩者會被誤判為日期（例如 11 月 7 日）。全形冒號不是任何 locale 的時間或日期
 * 分隔符，試算表會當成純文字，也符合繁體中文排版慣例。
 */
const SCORE_SEPARATOR = "：";

/**
 * 賽前／賽後分數欄的小數位數，沿用 rating 既有的顯示精度（見 HistoryRecordCard.tsx
 * 的 `ratingBefore.toFixed(2)`／`ratingAfter.toFixed(2)`）——CSV 與畫面顯示的小數位數
 * 需一致，避免使用者比對時誤以為兩處數字不同。
 */
const RATING_DECIMAL_PLACES = 2;

/**
 * 建立換算 playedAt（UTC 瞬間）用的 Intl 格式化器。時區由呼叫端注入（見 historyToCsv
 * 的 options.timeZone），而非讀執行環境的預設時區——使用者匯出與檢視 App 是在同一台
 * 裝置、同一個時區，CSV 與畫面（HistoryRecordCard.tsx）的數字必須一致；注入時區也讓
 * 測試能以固定值斷言，不必依賴跑測試的機器時區（design.md Decision 12）。
 *
 * 用 `formatToParts` 而非 `Date` 的 `getHours()` 等 getter，是因為那些 getter 一律讀
 * 「執行行程」的本地時區、無法注入指定時區；`hourCycle: "h23"` 確保 00:00 一律輸出
 * `00`，不會出現部分 locale 對午夜的 `24` 表示法。
 */
function createPlayedAtFormatter(timeZone: string): Intl.DateTimeFormat {
	return new Intl.DateTimeFormat("en-US", {
		timeZone,
		hourCycle: "h23",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
	});
}

/**
 * 由 playedAt 換算出指定時區的日期與時間文字。每列只呼叫一次（呼叫端負責傳入
 * 共用的 formatter，且只在 historyToCsv 的 row 迴圈內建立一次 context），
 * 避免同一筆 playedAt 被重複格式化兩次。
 */
function formatPlayedAt(
	playedAt: string,
	formatter: Intl.DateTimeFormat,
): { date: string; time: string } {
	const parts = formatter.formatToParts(new Date(playedAt));
	const get = (type: Intl.DateTimeFormatPartTypes): string =>
		parts.find((part) => part.type === type)?.value ?? "";
	return {
		date: `${get("year")}-${get("month")}-${get("day")}`,
		time: `${get("hour")}:${get("minute")}:${get("second")}`,
	};
}

/**
 * 雙打組成標示：單打分支型別上根本沒有 doublesComposition 欄位，該欄輸出空字串
 * （spec 明文：單打時該欄為空）。以 entry.format === "doubles" 判斷讓 discriminated
 * union 在此分支內把 entry 收窄為雙打分支，不需要 `as any` 繞過。
 */
function doublesCompositionLabel(entry: MatchHistoryEntry): string {
	if (entry.format === "doubles") {
		return DOUBLES_COMPOSITION_LABEL[entry.doublesComposition];
	}
	return "";
}

/**
 * 單一列組裝時共用的上下文：playedAtParts 在 historyToCsv 的 row 迴圈內每列只算一次，
 * 「日期」「時間」兩欄共用同一份結果，不必各自重算（m4：原本每列會被格式化兩次）。
 */
interface HistoryRowContext {
	entry: MatchHistoryEntry;
	playedAtParts: { date: string; time: string };
}

/**
 * 11 個欄位的單一定義來源（task 4.7）：標題列與資料列都從這份陣列衍生，
 * 避免兩處各自維護順序而漂移。陣列順序即 9.3.1 要求的欄位順序。
 *
 * 球員姓名與賽前／賽後分數一律取自歷史紀錄本身的快照欄位（players[].name／
 * ratingBefore／ratingAfter），SHALL NOT 以 id 回查目前名單——歷史被設計成自足快照，
 * 正是為了讓球員被刪除或改名後仍能完整呈現（design.md「與 M4 的介面對齊」）。
 *
 * 賽前／賽後分數欄的球員順序為「先第一隊全員、再第二隊全員」，與第 6／7 欄的球員順序
 * 一致，此約定同時記錄於 design.md Decision 12。
 */
const HISTORY_CSV_COLUMNS: ReadonlyArray<{
	header: string;
	getValue: (context: HistoryRowContext) => string;
}> = [
	{ header: "日期", getValue: ({ playedAtParts }) => playedAtParts.date },
	{ header: "時間", getValue: ({ playedAtParts }) => playedAtParts.time },
	{ header: "對戰方式", getValue: ({ entry }) => FORMAT_LABEL[entry.format] },
	{ header: "雙打組成", getValue: ({ entry }) => doublesCompositionLabel(entry) },
	{ header: "場地", getValue: ({ entry }) => String(entry.courtNumber) },
	{
		header: "第一隊球員",
		getValue: ({ entry }) =>
			entry.teamA.players.map((player) => player.name).join(MULTI_VALUE_SEPARATOR),
	},
	{
		header: "第二隊球員",
		getValue: ({ entry }) =>
			entry.teamB.players.map((player) => player.name).join(MULTI_VALUE_SEPARATOR),
	},
	{
		header: "比分",
		getValue: ({ entry }) => `${entry.scoreA}${SCORE_SEPARATOR}${entry.scoreB}`,
	},
	{
		header: "勝方",
		getValue: ({ entry }) => (entry.winner === "teamA" ? TEAM_LABELS[0] : TEAM_LABELS[1]),
	},
	{
		// 賽前／賽後分數的球員順序 MUST 與「第一隊球員」「第二隊球員」欄一致
		// （先 teamA 全員、後 teamB 全員），欄位對應錯位是最容易發生也最難目視發現的錯。
		header: "賽前分數",
		getValue: ({ entry }) =>
			[...entry.teamA.players, ...entry.teamB.players]
				.map((player) => player.ratingBefore.toFixed(RATING_DECIMAL_PLACES))
				.join(MULTI_VALUE_SEPARATOR),
	},
	{
		header: "賽後分數",
		getValue: ({ entry }) =>
			[...entry.teamA.players, ...entry.teamB.players]
				.map((player) => player.ratingAfter.toFixed(RATING_DECIMAL_PLACES))
				.join(MULTI_VALUE_SEPARATOR),
	},
];

/** 9.3.1 要求的 11 個欄位標題，順序固定；由 HISTORY_CSV_COLUMNS 衍生，非獨立維護。 */
export const HISTORY_CSV_HEADERS: readonly string[] = HISTORY_CSV_COLUMNS.map(
	(column) => column.header,
);

export interface HistoryToCsvOptions {
	/**
	 * 日期／時間欄換算用的時區（IANA 名稱，例如 "Asia/Taipei"）。預設取
	 * `Intl.DateTimeFormat().resolvedOptions().timeZone`（執行裝置的本地時區），
	 * 與 HistoryRecordCard.tsx 的畫面顯示對齊（design.md Decision 12）。
	 */
	timeZone?: string;
}

/**
 * 把歷史賽果轉為 CSV 文字。標題列固定在前；歷史為空時仍輸出只有標題列的 CSV
 * （spec「歷史為空時仍輸出標題列」）。序列化（BOM、跳脫、換行）一律委派 csv.ts 的
 * toCsv，本函式只負責欄位對應。
 */
export function historyToCsv(
	entries: readonly MatchHistoryEntry[],
	options?: HistoryToCsvOptions,
): string {
	const timeZone = options?.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
	const formatter = createPlayedAtFormatter(timeZone);
	const rows: string[][] = [
		[...HISTORY_CSV_HEADERS],
		...entries.map((entry) => {
			const context: HistoryRowContext = {
				entry,
				playedAtParts: formatPlayedAt(entry.playedAt, formatter),
			};
			return HISTORY_CSV_COLUMNS.map((column) => column.getValue(context));
		}),
	];
	return toCsv(rows);
}
