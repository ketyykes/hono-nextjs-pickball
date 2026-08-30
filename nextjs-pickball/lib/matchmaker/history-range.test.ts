import { describe, it, expect, vi } from "vitest";
import { computeRangeCutoffs, rangeOfTime, HISTORY_RANGES } from "./history-range";
import type { HistoryRange } from "./history-range";

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
});
