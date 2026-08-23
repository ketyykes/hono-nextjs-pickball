import { describe, it, expect } from "vitest";

import {
	RATING_D,
	RATING_K_BASE,
	RATING_MIN,
	RATING_MAX,
	K_DECAY_GAMES,
} from "./rating-types";
import { expectedScore } from "./rating";

describe("評分常數", () => {
	it("評分常數以具名常數匯出，D 為 3.0、K_base 為 0.15", () => {
		expect(RATING_D).toBe(3.0);
		expect(RATING_K_BASE).toBe(0.15);
		expect(RATING_MIN).toBe(1);
		expect(RATING_MAX).toBe(8);
		expect(K_DECAY_GAMES).toBe(20);
	});
});

describe("預測勝率", () => {
	it("分差對應的預測勝率符合 D=3.0 的級距", () => {
		expect(expectedScore(4, 4)).toBeCloseTo(0.5, 3);
		expect(expectedScore(4.5, 4)).toBeCloseTo(0.5948, 3);
		expect(expectedScore(5, 4)).toBeCloseTo(0.6830, 3);
		expect(expectedScore(6, 4)).toBeCloseTo(0.8228, 3);
		expect(expectedScore(7, 4)).toBeCloseTo(0.9091, 3);
	});

	it("同一場雙方的預測勝率相加為 1", () => {
		const testCases: readonly (readonly [number, number])[] = [
			[4, 4],
			[4.5, 4],
			[5, 4],
			[6, 4],
			[7, 4],
			[3.5, 5.5],
			[1.2, 7.8],
		];

		for (const [a, b] of testCases) {
			expect(expectedScore(a, b) + expectedScore(b, a)).toBeCloseTo(1, 10);
		}
	});
});
