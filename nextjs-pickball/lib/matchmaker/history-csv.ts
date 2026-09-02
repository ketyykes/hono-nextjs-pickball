// 歷史賽果 → CSV 列（9.3.1 的欄位對應）。序列化（BOM、跳脫、換行）一律委派 csv.ts 的
// toCsv，本模組完全不知道那些規則的存在（design.md Decision 1）。

import { toCsv } from "./csv";
import type { MatchHistoryEntry } from "./history";

/** 9.3.1 要求的 11 個欄位標題，順序固定。 */
export const HISTORY_CSV_HEADERS: readonly string[] = [
	"日期",
	"時間",
	"對戰方式",
	"雙打組成",
	"場地",
	"第一隊球員",
	"第二隊球員",
	"比分",
	"勝方",
	"賽前分數",
	"賽後分數",
];

/**
 * 把歷史賽果轉為 CSV 文字。目前只輸出標題列——逐筆歷史的欄位對應留待後續 task 補上。
 */
export function historyToCsv(entries: readonly MatchHistoryEntry[]): string {
	const rows: string[][] = [[...HISTORY_CSV_HEADERS]];
	if (entries.length > 0) {
		// 逐筆欄位對應待後續 task 實作。
	}
	return toCsv(rows);
}
