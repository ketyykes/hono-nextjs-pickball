import { describe, it, expect } from "vitest";
import { computeRangeCutoffs } from "./history-range";

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
});
