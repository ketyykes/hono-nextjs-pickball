import { describe, it, expect } from "vitest";
import { RATING_MIN, RATING_MAX } from "./rating-types";
import { ratingBoundState } from "./rating-bounds";

describe("ratingBoundState", () => {
	it("rating 為上限時判定為已達上限", () => {
		expect(ratingBoundState(RATING_MAX)).toBe("at-upper-bound");
	});

	it("rating 為下限時判定為已達下限", () => {
		expect(ratingBoundState(RATING_MIN)).toBe("at-lower-bound");
	});

	// 近界值（上下限各一分之內）：能抓到 `>=`／`>` 寫錯或方向對調。
	it("rating 介於上下限之間時不判定為觸界", () => {
		expect(ratingBoundState(RATING_MIN + 0.01)).toBe("within-bounds");
		expect(ratingBoundState(4.5)).toBe("within-bounds");
		expect(ratingBoundState(RATING_MAX - 0.01)).toBe("within-bounds");
	});
});
