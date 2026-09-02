import { describe, it, expect } from "vitest";
import type { MatchHistoryEntry } from "./history";
import { historyToCsv } from "./history-csv";

/** 9.3.1 要求的標題列，逐字比對，順序固定。 */
const HEADER_LINE =
	"日期,時間,對戰方式,雙打組成,場地,第一隊球員,第二隊球員,比分,勝方,賽前分數,賽後分數";

/** 去除輸出開頭的 UTF-8 BOM，方便逐列比對文字內容。 */
function stripBom(text: string): string {
	return text.replace(/^﻿/, "");
}

/** 建立一筆合法的單打歷史，供標題列測試使用。 */
function makeSinglesEntry(): MatchHistoryEntry {
	return {
		matchId: "match-1",
		courtNumber: 1,
		playedAt: "2026-08-23T01:02:03.000Z",
		format: "singles",
		teamA: {
			rating: 4.0,
			players: [{ id: "p1", name: "王小明", ratingBefore: 3.9, ratingAfter: 4.1 }],
		},
		teamB: {
			rating: 4.2,
			players: [{ id: "p2", name: "李四", ratingBefore: 4.1, ratingAfter: 4.0 }],
		},
		scoreA: 11,
		scoreB: 7,
		winner: "teamA",
	};
}

describe("history-csv", () => {
	it("標題列涵蓋 9.3.1 的 11 個欄位且順序固定", () => {
		const csvText = historyToCsv([makeSinglesEntry()]);
		const [headerLine] = stripBom(csvText).split("\r\n");

		expect(headerLine).toBe(HEADER_LINE);
	});
});
