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
 * 由 playedAt（UTC ISO 字串，例如 "2026-08-23T01:02:03.000Z"）直接切出日期與時間文字。
 * 刻意不建立 Date 物件走本地時區 getter（HistoryRecordCard.tsx 的畫面顯示才需要本地時區）
 * ——CSV 匯出是純函式，輸出不該因執行環境的時區而改變。
 */
function splitPlayedAt(playedAt: string): { date: string; time: string } {
	const [datePart, rawTimePart] = playedAt.split("T");
	const withoutZone = (rawTimePart ?? "").replace(/Z$/, "");
	const [time] = withoutZone.split(".");
	return { date: datePart ?? "", time: time ?? "" };
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
 * 11 個欄位的單一定義來源（task 4.7）：標題列與資料列都從這份陣列衍生，
 * 避免兩處各自維護順序而漂移。陣列順序即 9.3.1 要求的欄位順序。
 *
 * 球員姓名與賽前／賽後分數一律取自歷史紀錄本身的快照欄位（players[].name／
 * ratingBefore／ratingAfter），SHALL NOT 以 id 回查目前名單——歷史被設計成自足快照，
 * 正是為了讓球員被刪除或改名後仍能完整呈現（design.md「與 M4 的介面對齊」）。
 */
const HISTORY_CSV_COLUMNS: ReadonlyArray<{
	header: string;
	getValue: (entry: MatchHistoryEntry) => string;
}> = [
	{ header: "日期", getValue: (entry) => splitPlayedAt(entry.playedAt).date },
	{ header: "時間", getValue: (entry) => splitPlayedAt(entry.playedAt).time },
	{ header: "對戰方式", getValue: (entry) => FORMAT_LABEL[entry.format] },
	{ header: "雙打組成", getValue: doublesCompositionLabel },
	{ header: "場地", getValue: (entry) => String(entry.courtNumber) },
	{
		header: "第一隊球員",
		getValue: (entry) =>
			entry.teamA.players.map((player) => player.name).join(MULTI_VALUE_SEPARATOR),
	},
	{
		header: "第二隊球員",
		getValue: (entry) =>
			entry.teamB.players.map((player) => player.name).join(MULTI_VALUE_SEPARATOR),
	},
	{ header: "比分", getValue: (entry) => `${entry.scoreA}:${entry.scoreB}` },
	{
		header: "勝方",
		getValue: (entry) => (entry.winner === "teamA" ? TEAM_LABELS[0] : TEAM_LABELS[1]),
	},
	{
		// 賽前／賽後分數的球員順序 MUST 與「第一隊球員」「第二隊球員」欄一致
		// （先 teamA 全員、後 teamB 全員），欄位對應錯位是最容易發生也最難目視發現的錯。
		header: "賽前分數",
		getValue: (entry) =>
			[...entry.teamA.players, ...entry.teamB.players]
				.map((player) => player.ratingBefore.toFixed(2))
				.join(MULTI_VALUE_SEPARATOR),
	},
	{
		header: "賽後分數",
		getValue: (entry) =>
			[...entry.teamA.players, ...entry.teamB.players]
				.map((player) => player.ratingAfter.toFixed(2))
				.join(MULTI_VALUE_SEPARATOR),
	},
];

/** 9.3.1 要求的 11 個欄位標題，順序固定；由 HISTORY_CSV_COLUMNS 衍生，非獨立維護。 */
export const HISTORY_CSV_HEADERS: readonly string[] = HISTORY_CSV_COLUMNS.map(
	(column) => column.header,
);

/**
 * 把歷史賽果轉為 CSV 文字。標題列固定在前；歷史為空時仍輸出只有標題列的 CSV
 * （spec「歷史為空時仍輸出標題列」）。序列化（BOM、跳脫、換行）一律委派 csv.ts 的
 * toCsv，本函式只負責欄位對應。
 */
export function historyToCsv(entries: readonly MatchHistoryEntry[]): string {
	const rows: string[][] = [
		[...HISTORY_CSV_HEADERS],
		...entries.map((entry) => HISTORY_CSV_COLUMNS.map((column) => column.getValue(entry))),
	];
	return toCsv(rows);
}
