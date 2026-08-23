import { describe, it, expect } from "vitest";

import {
	RATING_D,
	RATING_K_BASE,
	RATING_MIN,
	RATING_MAX,
	K_DECAY_GAMES,
	type RatingPlayerInput,
	type Side,
} from "./rating-types";
import { expectedScore, effectiveK, updateRatings } from "./rating";

// 測試資料 fixture helper
function makeRatingPlayer(
	id: string,
	rating: number,
	gamesPlayed: number
): RatingPlayerInput {
	return { id, rating, gamesPlayed };
}

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
			const scoreA = expectedScore(a, b);
			const scoreB = expectedScore(b, a);
			expect(scoreA + scoreB).toBeCloseTo(1, 10);
			expect(scoreB).toBeCloseTo(1 - scoreA, 15);
		}
	});
});

describe("有效 K 值", () => {
	it("K_eff 在 0 場為 K_base 的 2 倍、20 場為 1.5 倍、60 場為 1.25 倍", () => {
		expect(effectiveK(0)).toBeCloseTo(0.30, 10);
		expect(effectiveK(20)).toBeCloseTo(0.225, 10);
		expect(effectiveK(60)).toBeCloseTo(0.1875, 10);
	});

	it("K_eff 隨出場次數單調遞減且恆大於 K_base", () => {
		const gamesPlayedSequence = [0, 1, 5, 20, 50, 200, 1000];
		const kEffValues = gamesPlayedSequence.map((games) => effectiveK(games));

		// 驗證嚴格遞減
		for (let i = 0; i < kEffValues.length - 1; i++) {
			expect(kEffValues[i]).toBeGreaterThan(kEffValues[i + 1]);
		}

		// 驗證每項都大於 K_base
		for (const kEff of kEffValues) {
			expect(kEff).toBeGreaterThan(RATING_K_BASE);
		}
	});

	it("出場次數少者的評分變動幅度大於出場次數多者", () => {
		const teams: readonly [Side, Side] = [
			[makeRatingPlayer("A1", 4.0, 0)],
			[makeRatingPlayer("B1", 4.0, 60)],
		];

		const result = updateRatings({
			format: "singles",
			teams,
			winnerIndex: 0,
		});

		const noviceDelta = result.changes[0].delta;
		const veteranDelta = result.changes[1].delta;

		expect(noviceDelta).toBe(0.15);
		expect(veteranDelta).toBe(-0.09);
		expect(Math.abs(noviceDelta)).toBeGreaterThan(Math.abs(veteranDelta));
	});
});

describe("單打評分更新", () => {
	it("單打勢均力敵時勝方與敗方各變動 K_eff 的一半", () => {
		const teams: readonly [Side, Side] = [
			[makeRatingPlayer("A1", 4.0, 0)],
			[makeRatingPlayer("B1", 4.0, 0)],
		];

		const result = updateRatings({
			format: "singles",
			teams,
			winnerIndex: 0,
		});

		expect(result.changes[0].after).toBe(4.15);
		expect(result.changes[0].delta).toBe(0.15);
		expect(result.changes[1].after).toBe(3.85);
		expect(result.changes[1].delta).toBe(-0.15);
	});

	it("爆冷獲勝的加分明顯大於預期內獲勝的加分", () => {
		// 低分方獲勝
		const teamsCase1: readonly [Side, Side] = [
			[makeRatingPlayer("A1", 3.0, 20)],
			[makeRatingPlayer("B1", 6.0, 20)],
		];

		const resultCase1 = updateRatings({
			format: "singles",
			teams: teamsCase1,
			winnerIndex: 0,
		});

		const lowScorerGain = resultCase1.changes[0].delta;

		// 高分方獲勝
		const teamsCase2: readonly [Side, Side] = [
			[makeRatingPlayer("A1", 6.0, 20)],
			[makeRatingPlayer("B1", 3.0, 20)],
		];

		const resultCase2 = updateRatings({
			format: "singles",
			teams: teamsCase2,
			winnerIndex: 0,
		});

		const highScorerGain = resultCase2.changes[0].delta;

		expect(resultCase1.changes[0].after).toBe(3.2);
		expect(lowScorerGain).toBe(0.2);
		expect(resultCase2.changes[0].after).toBe(6.02);
		expect(highScorerGain).toBe(0.02);
		expect(lowScorerGain).toBeGreaterThan(highScorerGain);
	});

	it("輸出依隊伍順序攤平，每筆含 id、賽前分數、賽後分數與變動值", () => {
		const teams: readonly [Side, Side] = [
			[makeRatingPlayer("A1", 4.0, 0)],
			[makeRatingPlayer("B1", 4.0, 0)],
		];

		const result = updateRatings({
			format: "singles",
			teams,
			winnerIndex: 0,
		});

		expect(result.changes).toHaveLength(2);
		expect(result.changes[0].id).toBe("A1");
		expect(result.changes[1].id).toBe("B1");

		// 檢查迴圈內每筆都有六個欄位（id 已在迴圈外單獨斷言）
		for (const change of result.changes) {
			expect(change).toHaveProperty("before");
			expect(change).toHaveProperty("after");
			expect(change).toHaveProperty("delta");
			expect(change).toHaveProperty("atUpperBound", false);
			expect(change).toHaveProperty("atLowerBound", false);
			expect(change).toHaveProperty("clamped", false);
		}

		// 檢查 expectedScores
		expect(result.expectedScores).toHaveLength(2);
	});
});

describe("零和的成立條件", () => {
	it("雙方 K_eff 相同且未觸界時總分守恆", () => {
		const teams: readonly [Side, Side] = [
			[makeRatingPlayer("A1", 5.0, 0)],
			[makeRatingPlayer("B1", 4.0, 0)],
		];

		const result = updateRatings({
			format: "singles",
			teams,
			winnerIndex: 0,
		});

		const beforeSum = result.changes[0].before + result.changes[1].before;
		const afterSum = result.changes[0].after + result.changes[1].after;

		expect(result.changes[0].after).toBe(5.1);
		expect(result.changes[1].after).toBe(3.9);
		expect(afterSum).toBe(beforeSum);
	});

	it("雙方 K_eff 不同時總分不守恆且不做事後補償", () => {
		const teams: readonly [Side, Side] = [
			[makeRatingPlayer("A1", 4.0, 0)],
			[makeRatingPlayer("B1", 4.0, 60)],
		];

		const result = updateRatings({
			format: "singles",
			teams,
			winnerIndex: 0,
		});

		const beforeSum = 4.0 + 4.0;
		const afterSum = result.changes[0].after + result.changes[1].after;

		expect(result.changes[0].after).toBe(4.15);
		expect(result.changes[1].after).toBe(3.91);
		expect(afterSum).toBe(8.06);
		expect(afterSum).not.toBe(beforeSum);
		expect(result.changes[0].delta).toBe(0.15);
	});
});
