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

/** 建立一筆合法的雙打歷史，各員賽前／賽後分數皆互不相同，用於偵測欄位錯位。 */
function makeDoublesEntry(): MatchHistoryEntry {
	return {
		matchId: "match-2",
		courtNumber: 3,
		playedAt: "2026-08-23T13:45:06.000Z",
		format: "doubles",
		doublesComposition: "mixed",
		teamA: {
			rating: 4.0,
			players: [
				{ id: "a1", name: "王大明", ratingBefore: 3.1, ratingAfter: 4.1 },
				{ id: "a2", name: "陳小美", ratingBefore: 3.2, ratingAfter: 4.2 },
			],
		},
		teamB: {
			rating: 4.0,
			players: [
				{ id: "b1", name: "林志豪", ratingBefore: 3.3, ratingAfter: 4.3 },
				{ id: "b2", name: "張美麗", ratingBefore: 3.4, ratingAfter: 4.4 },
			],
		},
		scoreA: 11,
		scoreB: 9,
		winner: "teamA",
	};
}

describe("history-csv", () => {
	it("標題列涵蓋 9.3.1 的 11 個欄位且順序固定", () => {
		const csvText = historyToCsv([makeSinglesEntry()]);
		const [headerLine] = stripBom(csvText).split("\r\n");

		expect(headerLine).toBe(HEADER_LINE);
	});

	it("雙打歷史輸出日期時間、雙方球員與各員賽前賽後分數", () => {
		const csvText = historyToCsv([makeDoublesEntry()]);
		const [, dataLine] = stripBom(csvText).split("\r\n");
		const fields = dataLine?.split(",") ?? [];

		expect(fields[0]).toBe("2026-08-23");
		expect(fields[1]).toBe("13:45:06");
		expect(fields[5]).toBe("王大明、陳小美");
		expect(fields[6]).toBe("林志豪、張美麗");
		expect(fields[9]).toBe("3.10、3.20、3.30、3.40");
		expect(fields[10]).toBe("4.10、4.20、4.30、4.40");
	});
});
