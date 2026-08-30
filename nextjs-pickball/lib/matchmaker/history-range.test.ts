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
});
