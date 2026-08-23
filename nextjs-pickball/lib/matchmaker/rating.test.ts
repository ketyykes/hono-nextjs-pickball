import { describe, it, expect } from "vitest";
import {
	RATING_D,
	RATING_K_BASE,
	RATING_MIN,
	RATING_MAX,
	K_DECAY_GAMES,
} from "./rating-types";

describe("匹克球評分模組", () => {
	it("評分常數以具名常數匯出，D 為 3.0、K_base 為 0.15", () => {
		expect(RATING_D).toBe(3.0);
		expect(RATING_K_BASE).toBe(0.15);
		expect(RATING_MIN).toBe(1);
		expect(RATING_MAX).toBe(8);
		expect(K_DECAY_GAMES).toBe(20);
	});
});
