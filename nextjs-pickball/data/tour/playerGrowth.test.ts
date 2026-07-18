import { describe, it, expect } from "vitest";
import { playerGrowth } from "./playerGrowth";

describe("playerGrowth", () => {
	it("提供至少 6 筆年度資料且年份與人數均遞增", () => {
		expect(Array.isArray(playerGrowth)).toBe(true);
		expect(playerGrowth.length).toBeGreaterThanOrEqual(6);

		const years = playerGrowth.map((d) => d.year);
		const players = playerGrowth.map((d) => d.players);

		// 年份從 2020 起
		expect(years[0]).toBe(2020);

		// 年份遞增不重複
		for (let i = 1; i < years.length; i++) {
			expect(years[i]).toBeGreaterThan(years[i - 1]);
		}

		// 人數遞增
		for (let i = 1; i < players.length; i++) {
			expect(players[i]).toBeGreaterThan(players[i - 1]);
		}
	});
});
