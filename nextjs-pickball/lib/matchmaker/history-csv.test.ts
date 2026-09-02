import { describe, it, expect } from "vitest";
import type { MatchHistoryEntry } from "./history";
import type { DoublesComposition } from "./allocation-types";
import { parseCsv } from "./csv";
import { historyToCsv } from "./history-csv";

/** 9.3.1 要求的標題列，逐字比對，順序固定。 */
const HEADER_LINE =
	"日期,時間,對戰方式,雙打組成,場地,第一隊球員,第二隊球員,比分,勝方,賽前分數,賽後分數";

/**
 * 本組測試一律指定台北時區斷言，不依賴執行機器的預設時區
 * （Stage 2 review B1／design.md Decision 12）。
 */
const TAIPEI_TIME_ZONE = "Asia/Taipei";

/** 去除輸出開頭的 UTF-8 BOM，方便逐列比對文字內容。 */
function stripBom(text: string): string {
	return text.replace(/^﻿/, "");
}

/** 建立一筆合法的單打歷史，欄位可透過 overrides 覆寫。 */
function makeSinglesEntry(
	overrides: Partial<{
		matchId: string;
		courtNumber: number;
		playedAt: string;
		scoreA: number;
		scoreB: number;
		winner: "teamA" | "teamB";
	}> = {},
): MatchHistoryEntry {
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
		...overrides,
	};
}

/**
 * 建立一筆合法的雙打歷史，各員賽前／賽後分數皆互不相同（用於偵測欄位錯位），
 * 欄位可透過 overrides 覆寫。
 */
function makeDoublesEntry(
	overrides: Partial<{
		matchId: string;
		courtNumber: number;
		playedAt: string;
		doublesComposition: DoublesComposition;
		scoreA: number;
		scoreB: number;
		winner: "teamA" | "teamB";
	}> = {},
): MatchHistoryEntry {
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
		...overrides,
	};
}

describe("history-csv", () => {
	it("標題列涵蓋 9.3.1 的 11 個欄位且順序固定", () => {
		const csvText = historyToCsv([makeSinglesEntry()]);
		const [headerLine] = stripBom(csvText).split("\r\n");

		expect(headerLine).toBe(HEADER_LINE);
	});

	it("雙打歷史輸出日期時間、雙方球員與各員賽前賽後分數", () => {
		// UTC 16:30 對台北是隔天 00:30——刻意跨日，證明日期／時間確實換算為呼叫端
		// 指定的時區，而非直接切割 UTC 字串（Stage 2 review B1／design.md Decision 12）。
		// 改用 parseCsv 而非 naive split(",") 讀回資料列，並以 toEqual 一次斷言全部
		// 11 個欄位——naive split 對「跳脫是否生效」沒有驗證力，整列斷言才能同時
		// 補齊對戰方式／雙打組成／場地／比分／勝方這幾欄（Stage 2 review B2／J2）。
		const entry = makeDoublesEntry({ playedAt: "2026-08-23T16:30:00.000Z" });

		const csvText = historyToCsv([entry], { timeZone: TAIPEI_TIME_ZONE });
		const rows = parseCsv(csvText);

		expect(rows[1]).toEqual([
			"2026-08-24",
			"00:30:00",
			"雙打",
			"混雙",
			"3",
			"王大明、陳小美",
			"林志豪、張美麗",
			"11：9",
			"第一隊",
			"3.10、3.20、3.30、3.40",
			"4.10、4.20、4.30、4.40",
		]);
	});

	// regression guard：以下為 4.4 完成當下已正確、Stage 2 review 指出零斷言的分支／欄位，
	// 補上斷言讓這些欄位有測試保護（非新行為，因此不強求先看紅燈；已用 mutation
	// 驗證偵測力，見本次回報 impl-s4-fix.md 的 22 組複驗表）。

	it("單打歷史輸出完整欄位且雙打組成留空", () => {
		// 單打分支型別上根本沒有 doublesComposition，第 4 欄 MUST 為空字串
		// （spec 明文；Stage 2 review B3 指出這條約束原本零覆蓋）。
		const entry = makeSinglesEntry({ winner: "teamB" });

		const csvText = historyToCsv([entry], { timeZone: TAIPEI_TIME_ZONE });
		const rows = parseCsv(csvText);

		expect(rows[1]).toEqual([
			"2026-08-23",
			"09:02:03",
			"單打",
			"",
			"1",
			"王小明",
			"李四",
			"11：7",
			"第二隊",
			"3.90、4.10",
			"4.10、4.00",
		]);
	});

	it.each<[DoublesComposition, string]>([
		["mens", "男雙"],
		["womens", "女雙"],
		["mixed", "混雙"],
		["general", "一般雙打"],
	])("雙打組成 %s 顯示為「%s」", (doublesComposition, label) => {
		// Stage 2 review B3：mens／womens／general 三個值從未被建構過，M34／M35／M36 全綠。
		const entry = makeDoublesEntry({ doublesComposition });

		const csvText = historyToCsv([entry], { timeZone: TAIPEI_TIME_ZONE });
		const rows = parseCsv(csvText);

		expect(rows[1]?.[3]).toBe(label);
	});

	it.each<["teamA" | "teamB", string]>([
		["teamA", "第一隊"],
		["teamB", "第二隊"],
	])("勝方 %s 顯示為「%s」", (winner, label) => {
		// Stage 2 review B3：winner 只餵過 teamA，teamB 從未被建構過，M19（勝負反轉）綠。
		const entry = makeDoublesEntry({ winner });

		const csvText = historyToCsv([entry], { timeZone: TAIPEI_TIME_ZONE });
		const rows = parseCsv(csvText);

		expect(rows[1]?.[8]).toBe(label);
	});

	it("多筆歷史依原順序逐列輸出，且列數與筆數一致", () => {
		// Stage 2 review J1：3 條既有測試分別餵 1、1、0 筆，M47（只留第一筆）與
		// M48（列順序反轉）皆存活。這裡改餵 3 筆，以場地號作為可回查原輸入的唯一欄位。
		const entries = [
			makeSinglesEntry({ matchId: "m-1", courtNumber: 1 }),
			makeDoublesEntry({ matchId: "m-2", courtNumber: 2 }),
			makeSinglesEntry({ matchId: "m-3", courtNumber: 3, winner: "teamB" }),
		];

		const csvText = historyToCsv(entries, { timeZone: TAIPEI_TIME_ZONE });
		const rows = parseCsv(csvText);

		expect(rows).toHaveLength(entries.length + 1);
		expect(rows.slice(1).map((row) => row[4])).toEqual(["1", "2", "3"]);
	});

	it("球員姓名含逗號、雙引號或換行時，parseCsv 讀回值逐字相同", () => {
		// Stage 2 review J2：既有測試的 naive split(",") 對「跳脫是否生效」零保護；
		// 姓名含逗號時該切法會把資料列切成 12 個欄位、從第 6 欄起全部錯位。
		// 這裡改用 parseCsv（csv.ts 的公開介面），姓名刻意放入逗號、雙引號與換行。
		const entry = makeDoublesEntry();
		entry.teamA.players[0]!.name = "王小明, Jr.";
		entry.teamA.players[1]!.name = '他說"讚"';
		entry.teamB.players[0]!.name = "林\n志豪";

		const csvText = historyToCsv([entry], { timeZone: TAIPEI_TIME_ZONE });
		const rows = parseCsv(csvText);

		expect(rows[1]?.[5]).toBe('王小明, Jr.、他說"讚"');
		expect(rows[1]?.[6]).toBe("林\n志豪、張美麗");
	});

	it.each([
		["2026-08-23T01:02:03.000Z", "含毫秒"],
		["2026-08-23T01:02:03Z", "不含毫秒"],
	])("playedAt 為 %s（%s）時輸出的日期時間一致", (playedAt) => {
		// Stage 2 review J3：兩條非空測試皆用含毫秒的 ...000Z，不含毫秒的 Z 字串從未被餵過；
		// 但 history.ts 的 playedAt: z.iso.datetime() 接受不含毫秒的字串，備份匯入
		// （§2／§3）正是以這組 schema 驗證，使用者手改過的備份可能帶入這種輸入。
		const entry = makeDoublesEntry({ playedAt });

		const csvText = historyToCsv([entry], { timeZone: TAIPEI_TIME_ZONE });
		const rows = parseCsv(csvText);

		expect(rows[1]?.[0]).toBe("2026-08-23");
		expect(rows[1]?.[1]).toBe("09:02:03");
	});

	// regression guard：寫入當下即為綠燈（4.4 的實作本就無條件輸出標題列，
	// entries 為空時 map 結果自然是空陣列，不需要另外的空歷史分支）。已用「改壞
	// historyToCsv、令空歷史回傳空字串」的方式驗證偵測力：mutation 後本測試轉紅
	// （expected 0 to be greater than 0），還原後轉綠，證明本測試確實能攔住
	// 「空歷史回傳空字串」這種退化（M8 §4.5／4.6 回報）。
	it("歷史為空時仍輸出只有標題列的 CSV", () => {
		const csvText = historyToCsv([]);
		const lines = stripBom(csvText).split("\r\n");

		expect(csvText.length).toBeGreaterThan(0);
		expect(lines).toEqual([HEADER_LINE]);
	});
});
