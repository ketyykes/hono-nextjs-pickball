import { describe, it, expect, vi } from "vitest";
import { computeRangeCutoffs, rangeOfTime, filterHistoryByRange, HISTORY_RANGES } from "./history-range";
import type { HistoryRange } from "./history-range";
import type { MatchHistoryEntry } from "./history";

/**
 * 建立最小合法的單打歷史紀錄 fixture，只有 `playedAt`／`matchId` 因測試需要而變動，
 * 其餘欄位固定為任意合法值（本組測試只關心排序與純函式語意，不關心欄位內容本身）。
 */
function makeHistoryEntry(playedAt: string, matchId: string): MatchHistoryEntry {
	return {
		matchId,
		courtNumber: 1,
		playedAt,
		format: "singles",
		teamA: { players: [{ id: "p1", name: "球員一", ratingBefore: 1000, ratingAfter: 1010 }], rating: 1000 },
		teamB: { players: [{ id: "p2", name: "球員二", ratingBefore: 1000, ratingAfter: 990 }], rating: 1000 },
		scoreA: 11,
		scoreB: 9,
		winner: "teamA",
	};
}

describe("history-range", () => {
	it("一般情形下四個切點依序為今天、本週一、當月 1 日與上月 1 日", () => {
		const now = new Date(2026, 7, 15); // 2026-08-15（週六）

		const { c0, c1, c2, c3 } = computeRangeCutoffs(now);

		expect(c0).toBe(new Date(2026, 7, 15).getTime());
		expect(c1).toBe(new Date(2026, 7, 10).getTime());
		expect(c2).toBe(new Date(2026, 7, 1).getTime());
		expect(c3).toBe(new Date(2026, 6, 1).getTime());
	});

	it("跨月週時當月切點取本週一而非當月 1 日", () => {
		const now = new Date(2026, 7, 1); // 2026-08-01（週六，本週一落在 7/27）

		const { c1, c2, c3 } = computeRangeCutoffs(now);

		expect(c1).toBe(new Date(2026, 6, 27).getTime());
		expect(c2).toBe(new Date(2026, 6, 27).getTime());
		expect(c3).toBe(new Date(2026, 6, 1).getTime());
	});

	it("四個切點單調不遞增", () => {
		const samples = [
			new Date(2026, 7, 1), // 月初（週六）
			new Date(2026, 7, 15), // 月中（週六）
			new Date(2026, 7, 17), // 週一
			new Date(2026, 7, 16), // 週日
			new Date(2027, 0, 5), // 跨年
		];

		for (const now of samples) {
			const { c0, c1, c2, c3 } = computeRangeCutoffs(now);
			expect(c3).toBeLessThanOrEqual(c2);
			expect(c2).toBeLessThanOrEqual(c1);
			expect(c1).toBeLessThanOrEqual(c0);
		}
	});

	it("週起始為週一，週日的本週一為六天前", () => {
		const now = new Date(2026, 7, 16); // 2026-08-16（週日）

		const { c1 } = computeRangeCutoffs(now);

		expect(c1).toBe(new Date(2026, 7, 10).getTime());
	});

	it("切點為當地時區 00:00 而非 UTC 00:00", () => {
		const now = new Date(2026, 7, 15, 23, 30); // 當地 2026-08-15 23:30

		const { c0 } = computeRangeCutoffs(now);
		const c0Date = new Date(c0);

		expect(c0Date.getHours()).toBe(0);
		expect(c0Date.getMinutes()).toBe(0);
		expect(c0Date.getSeconds()).toBe(0);
		expect(c0Date.getMilliseconds()).toBe(0);
		expect(c0).toBe(new Date(2026, 7, 15).getTime());

		// 跨年當天的凌晨與深夜是「年份誤讀成 UTC」唯一會露餡的時刻：上面 8 月的取樣
		// 無論用 getFullYear() 或 getUTCFullYear() 都得到 2026，攔不下這種混讀。
		// 兩個方向各取一點，UTC+ 與 UTC- 時區皆可攔下。
		expect(computeRangeCutoffs(new Date(2027, 0, 1, 3, 30)).c0).toBe(
			new Date(2027, 0, 1).getTime(),
		);
		expect(computeRangeCutoffs(new Date(2026, 11, 31, 23, 30)).c0).toBe(
			new Date(2026, 11, 31).getTime(),
		);
	});

	it("一月時上月切點落在去年 12 月 1 日", () => {
		const now = new Date(2027, 0, 5); // 2027-01-05

		const { c3 } = computeRangeCutoffs(now);

		expect(c3).toBe(new Date(2026, 11, 1).getTime());
	});

	it("切點依注入的 now 計算，與系統時鐘無關", () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date(2030, 2, 3));

		const now = new Date(2026, 7, 15); // 仍傳入 2026-08-15，與系統時鐘的 2030-03-03 無關
		const result = computeRangeCutoffs(now);

		vi.useRealTimers();

		expect(result).toEqual({
			c0: new Date(2026, 7, 15).getTime(),
			c1: new Date(2026, 7, 10).getTime(),
			c2: new Date(2026, 7, 1).getTime(),
			c3: new Date(2026, 6, 1).getTime(),
		});
	});

	it("任一時間點恰好落入五個區間中的一個", () => {
		const now = new Date(2026, 7, 15); // 2026-08-15
		const { c0, c1, c2, c3 } = computeRangeCutoffs(now);

		// 橫跨五個區間並含兩個極端值的取樣時間點。
		const samples = [
			new Date(1970, 0, 1).getTime(), // 遠早於 c3，落入更早
			c3 - 1, // 剛好落不進上月，落入更早
			c3, // 上月左端點
			c2 - 1, // 上月最後一毫秒
			c2, // 本月左端點（此 now 下與 c1 相同，本月為空，見另一 it）
			c1, // 本週左端點
			c0 - 1, // 本週最後一毫秒
			c0, // 今日左端點
			c0 + 1000, // 今日內
			new Date(2100, 0, 1).getTime(), // 遠晚於 c0，落入今日
		];

		for (const t of samples) {
			// 獨立於 rangeOfTime 本身，直接依 spec 的半開區間定義寫出五個區間 predicate。
			const predicates: Record<HistoryRange, boolean> = {
				today: t >= c0,
				thisWeek: t >= c1 && t < c0,
				thisMonth: t >= c2 && t < c1,
				lastMonth: t >= c3 && t < c2,
				earlier: t < c3,
			};

			const matched = HISTORY_RANGES.filter((range) => predicates[range]);

			expect(matched).toHaveLength(1);
			expect(rangeOfTime(t, now)).toBe(matched[0]);
		}
	});

	it("時間點恰為切點時歸入較新的區間", () => {
		const now = new Date(2026, 7, 15); // 2026-08-15
		const { c0, c1, c2, c3 } = computeRangeCutoffs(now);

		expect(rangeOfTime(c0, now)).toBe("today");
		expect(rangeOfTime(c1, now)).toBe("thisWeek");
		expect(rangeOfTime(c2, now)).toBe("thisMonth");
		expect(rangeOfTime(c3, now)).toBe("lastMonth");
		expect(rangeOfTime(c3 - 1, now)).toBe("earlier");
	});

	it("晚於現在的時間點仍歸入今日而非落空", () => {
		const now = new Date(2026, 7, 15, 20, 0); // 2026-08-15 20:00
		const t = new Date(2026, 7, 15, 23, 59).getTime(); // 晚於「現在」

		expect(() => rangeOfTime(t, now)).not.toThrow();
		expect(rangeOfTime(t, now)).toBe("today");
	});

	it("跨月週時沒有任何時間點落入本月", () => {
		const now = new Date(2026, 7, 1); // 2026-08-01（週六，本週一落在 7/27）

		for (let day = 1; day <= 31; day++) {
			const t = new Date(2026, 6, day, 12, 0).getTime(); // 7/1～7/31，取中午避開跨日誤差
			const range = rangeOfTime(t, now);

			expect(range).not.toBe("thisMonth");
			if (day >= 27) {
				expect(range).toBe("thisWeek");
			} else {
				expect(range).toBe("lastMonth");
			}
		}
	});

	it("篩選結果依對戰時間由新到舊排序", () => {
		const now = new Date(2026, 7, 15, 20, 0); // 2026-08-15 20:00
		const oldest = makeHistoryEntry(new Date(2026, 7, 15, 8, 0).toISOString(), "match-oldest");
		const middle = makeHistoryEntry(new Date(2026, 7, 15, 12, 0).toISOString(), "match-middle");
		const newest = makeHistoryEntry(new Date(2026, 7, 15, 18, 0).toISOString(), "match-newest");
		// 落在「更早」區間的紀錄，用來確認回傳結果確實經過篩選而非原樣回傳全部
		const notToday = makeHistoryEntry(new Date(2026, 6, 1, 8, 0).toISOString(), "match-not-today");

		// 亂序傳入，斷言回傳順序為對戰時間遞減，且不含區間外的紀錄
		const result = filterHistoryByRange([middle, newest, oldest, notToday], "today", now);

		expect(result.map((entry) => entry.matchId)).toEqual([
			"match-newest",
			"match-middle",
			"match-oldest",
		]);
	});

	it("篩選不修改輸入的紀錄陣列", () => {
		const now = new Date(2026, 7, 15, 20, 0); // 2026-08-15 20:00
		const oldest = makeHistoryEntry(new Date(2026, 7, 15, 8, 0).toISOString(), "match-oldest");
		const middle = makeHistoryEntry(new Date(2026, 7, 15, 12, 0).toISOString(), "match-middle");
		const newest = makeHistoryEntry(new Date(2026, 7, 15, 18, 0).toISOString(), "match-newest");
		const input = [middle, newest, oldest];
		const inputSnapshot = structuredClone(input);

		const result = filterHistoryByRange(input, "today", now);

		// 呼叫前後輸入陣列的長度、元素順序與各紀錄內容皆相同
		expect(input).toEqual(inputSnapshot);
		// 回傳值與輸入不是同一參照
		expect(result).not.toBe(input);
	});

	// regression guard（寫下當下即綠）：補 Stage 2 獨立 mutation 找到的三個零覆蓋。
	// 既有兩個 it 只用過 "today" 一個區間、且輸入筆數不足以區分「篩選」與「截斷」，
	// 導致三種壞法全部存活：① 忽略 range 參數寫死 "today" ② slice(0, 3) ③ slice(0, -1)。
	// 本 it 以「同一組輸入分別查兩個區間」堵住 ①，以「五筆輸入中今日佔四筆」堵住 ②③。
	it("依傳入的區間篩選，且不因截斷而遺漏區間內的紀錄", () => {
		const now = new Date(2026, 7, 15, 20, 0); // 2026-08-15 20:00
		const t1 = makeHistoryEntry(new Date(2026, 7, 15, 6, 0).toISOString(), "today-1");
		const t2 = makeHistoryEntry(new Date(2026, 7, 15, 9, 0).toISOString(), "today-2");
		const t3 = makeHistoryEntry(new Date(2026, 7, 15, 12, 0).toISOString(), "today-3");
		const t4 = makeHistoryEntry(new Date(2026, 7, 15, 15, 0).toISOString(), "today-4");
		// 2026-07-10 落在上月（上月切點為 2026-07-01、當月切點為 2026-08-01）
		const lastMonth = makeHistoryEntry(new Date(2026, 6, 10, 8, 0).toISOString(), "last-month");
		// 上月那筆刻意放在中間，使「丟掉首筆或末筆」無法與「正確篩選」得到相同結果
		const entries = [t1, lastMonth, t2, t3, t4];

		// 同一組輸入換一個 range 就必須得到不同結果——range 參數不得被忽略
		expect(filterHistoryByRange(entries, "today", now).map((entry) => entry.matchId)).toEqual([
			"today-4",
			"today-3",
			"today-2",
			"today-1",
		]);
		expect(filterHistoryByRange(entries, "lastMonth", now).map((entry) => entry.matchId)).toEqual([
			"last-month",
		]);
	});
});
