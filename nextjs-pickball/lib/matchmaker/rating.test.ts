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
import { roundRating } from "./rating-math";
import { PlayerSchema } from "./types";
import type { Player } from "./types";

// 測試資料 fixture helper
function makeRatingPlayer(
	id: string,
	rating: number,
	gamesPlayed: number
): RatingPlayerInput {
	return { id, rating, gamesPlayed };
}

// 單打隊伍配置：各隊各一人。ratingA 與 ratingB 為兩隊各自的評分（單打時隊伍平均等於該員 rating）。
// gamesPlayed 為兩人的出場次數（預設都是 0）。
function makeSinglesTeams(
	ratingA: number,
	ratingB: number,
	gamesPlayed: number = 0
): readonly [Side, Side] {
	return [
		[makeRatingPlayer("A1", ratingA, gamesPlayed)],
		[makeRatingPlayer("B1", ratingB, gamesPlayed)],
	];
}

// 雙打測試用的不勻均隊伍配置（隊一平均 5.00、隊二平均 4.00）
function makeUnevenDoublesTeams(): readonly [Side, Side] {
	return [
		[makeRatingPlayer("A1", 6.0, 0), makeRatingPlayer("A2", 4.0, 0)],
		[makeRatingPlayer("B1", 4.5, 0), makeRatingPlayer("B2", 3.5, 0)],
	];
}

// PlayerSchema 驗證用的完整球員物件建構器，預設值皆為合法值，呼叫端可用 overrides 覆寫個別欄位。
function makeRosterPlayer(overrides: Partial<Player> = {}): Player {
	return {
		id: "default-id",
		name: "預設球員",
		gender: "male",
		colorFrom: "#000000",
		colorTo: "#ffffff",
		rating: 4,
		gamesPlayed: 0,
		restCount: 0,
		isActive: true,
		createdAt: new Date(0).toISOString(),
		...overrides,
	};
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
		const teams = makeSinglesTeams(4.0, 4.0);

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
		const teamsCase1 = makeSinglesTeams(3.0, 6.0, 20);

		const resultCase1 = updateRatings({
			format: "singles",
			teams: teamsCase1,
			winnerIndex: 0,
		});

		const lowScorerGain = resultCase1.changes[0].delta;

		// 高分方獲勝
		const teamsCase2 = makeSinglesTeams(6.0, 3.0, 20);

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
		const teams = makeSinglesTeams(4.0, 4.0);

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
		const teams = makeSinglesTeams(5.0, 4.0);

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

	it("觸界時 clamp 優先於零和，總分不守恆", () => {
		const teams = makeSinglesTeams(8.0, 8.0);

		const result = updateRatings({
			format: "singles",
			teams,
			winnerIndex: 1,
		});

		const beforeSum = 8.0 + 8.0;
		const afterSum = result.changes[0].after + result.changes[1].after;

		// 敗方（A1）照常降為 7.85
		expect(result.changes[0].after).toBe(7.85);
		expect(result.changes[0].delta).toBe(-0.15);

		// 勝方（B1）被夾在 8.00
		expect(result.changes[1].after).toBe(8.0);
		expect(result.changes[1].delta).toBe(0);

		// 總和由 16.00 變為 15.85
		expect(afterSum).toBe(15.85);
		expect(afterSum).not.toBe(beforeSum);
	});
});

describe("邊界 clamp 與觸界標示", () => {
	it("更新後超過 8.00 時夾為 8.00 並標示已達上限", () => {
		const teams = makeSinglesTeams(7.95, 7.95);

		const result = updateRatings({
			format: "singles",
			teams,
			winnerIndex: 0,
		});

		// 勝方
		expect(result.changes[0].after).toBe(8.0);
		expect(result.changes[0].delta).toBe(0.05);
		expect(result.changes[0].atUpperBound).toBe(true);
		expect(result.changes[0].clamped).toBe(true);

		// 敗方
		expect(result.changes[1].after).toBe(7.8);
		expect(result.changes[1].atUpperBound).toBe(false);
		expect(result.changes[1].atLowerBound).toBe(false);
		expect(result.changes[1].clamped).toBe(false);
	});

	it("更新後低於 1.00 時夾為 1.00 並標示已達下限", () => {
		const teams = makeSinglesTeams(1.05, 1.05);

		const result = updateRatings({
			format: "singles",
			teams,
			winnerIndex: 1,
		});

		// 敗方（A1）
		expect(result.changes[0].after).toBe(1.0);
		expect(result.changes[0].delta).toBe(-0.05);
		expect(result.changes[0].atLowerBound).toBe(true);
		expect(result.changes[0].clamped).toBe(true);
	});

	it("未觸界時上下限與夾值旗標皆為 false", () => {
		const teams = makeSinglesTeams(4.0, 4.0);

		const result = updateRatings({
			format: "singles",
			teams,
			winnerIndex: 0,
		});

		// 兩筆結果的三個旗標皆為 false
		for (const change of result.changes) {
			expect(change.atUpperBound).toBe(false);
			expect(change.atLowerBound).toBe(false);
			expect(change.clamped).toBe(false);
		}
	});

	it("已達上限者落敗時分數照常下降且不再標示已達上限", () => {
		const teams = makeSinglesTeams(8.0, 8.0);

		const result = updateRatings({
			format: "singles",
			teams,
			winnerIndex: 1,
		});

		// 敗方（A1）
		expect(result.changes[0].after).toBe(7.85);
		expect(result.changes[0].delta).toBe(-0.15);
		expect(result.changes[0].atUpperBound).toBe(false);
		expect(result.changes[0].clamped).toBe(false);
	});

	it("賽後分數為兩位小數且可通過 PlayerSchema 的 rating 驗證", () => {
		const teams = makeSinglesTeams(6.0, 3.0, 20);

		const result = updateRatings({
			format: "singles",
			teams,
			winnerIndex: 0,
		});

		// 驗證每筆賽後分數為兩位小數
		for (const change of result.changes) {
			expect(roundRating(change.after)).toBe(change.after);
			expect(change.after).toBeGreaterThanOrEqual(RATING_MIN);
			expect(change.after).toBeLessThanOrEqual(RATING_MAX);
		}

		// 以賽後分數組成的 Player 物件應通過 PlayerSchema 驗證
		const winnerAfter = result.changes[0].after;
		const loserAfter = result.changes[1].after;

		const winner = makeRosterPlayer({ id: "A1", name: "Winner", rating: winnerAfter, gamesPlayed: 20 });
		const loser = makeRosterPlayer({ id: "B1", name: "Loser", rating: loserAfter, gamesPlayed: 20 });

		const winnerResult = PlayerSchema.safeParse(winner);
		const loserResult = PlayerSchema.safeParse(loser);

		expect(winnerResult.success).toBe(true);
		expect(loserResult.success).toBe(true);
	});
});

describe("雙打評分更新", () => {
	it("雙打以兩隊平均分數計算預測勝率，而非以總和", () => {
		// 隊一平均 5.00（總和 10.00）、隊二平均 4.00（總和 8.00），用平均差 1.00 算預測勝率
		// E_A = 0.683，用平均時結果與用總和時不同（總和會得到 0.823）
		const teams = makeUnevenDoublesTeams();

		const result = updateRatings({
			format: "doubles",
			teams,
			winnerIndex: 0,
		});

		// 隊一勝方每人 +0.10，隊二敗方每人 -0.10
		expect(result.expectedScores[0]).toBeCloseTo(0.683, 2);
		expect(result.changes[0].delta).toBe(0.1); // A1
		expect(result.changes[1].delta).toBe(0.1); // A2
		expect(result.changes[0].after).toBe(6.1);
		expect(result.changes[1].after).toBe(4.1);
		expect(result.changes[2].after).toBe(4.4); // B1
		expect(result.changes[3].after).toBe(3.4); // B2
		expect(result.changes[2].delta).toBe(-0.1);
		expect(result.changes[3].delta).toBe(-0.1);
	});

	it("雙打同隊兩人出場次數相同時加減同一數值", () => {
		// 同隊兩人 gamesPlayed 皆 0，即使分數不同（6.00 vs 4.00），也應加減同一數值
		// 因為 (S - E) 來自隊伍層級的預測落差，與個人分數無關
		const teams = makeUnevenDoublesTeams();

		const result = updateRatings({
			format: "doubles",
			teams,
			winnerIndex: 0,
		});

		// 隊一兩人變動值完全相等（都是 +0.10）
		expect(result.changes[0].delta).toBe(result.changes[1].delta);
		expect(result.changes[0].delta).toBe(0.1);
		// 隊二兩人變動值完全相等（都是 -0.10）
		expect(result.changes[2].delta).toBe(result.changes[3].delta);
		expect(result.changes[2].delta).toBe(-0.1);
	});

	it("雙打同隊兩人出場次數不同時各自套用自己的 K_eff", () => {
		// 四人皆 4.00，隊一為 0 場與 60 場各一人，隊二亦然
		// 隊一勝時，0 場者變 +0.15，60 場者變 +0.09；變動方向相同但幅度不同
		const teams: readonly [Side, Side] = [
			[makeRatingPlayer("A1", 4.0, 0), makeRatingPlayer("A2", 4.0, 60)],
			[makeRatingPlayer("B1", 4.0, 0), makeRatingPlayer("B2", 4.0, 60)],
		];

		const result = updateRatings({
			format: "doubles",
			teams,
			winnerIndex: 0,
		});

		// 隊一勝方
		expect(result.changes[0].delta).toBe(0.15); // A1（0場）
		expect(result.changes[1].delta).toBe(0.09); // A2（60場）
		// 隊二敗方
		expect(result.changes[2].delta).toBe(-0.15); // B1（0場）
		expect(result.changes[3].delta).toBe(-0.09); // B2（60場）

		// 驗證同隊方向相同
		expect(Math.sign(result.changes[0].delta)).toBe(Math.sign(result.changes[1].delta));
		expect(Math.sign(result.changes[2].delta)).toBe(Math.sign(result.changes[3].delta));
	});
});

describe("輸入驗證", () => {
	it("隊伍人數與對戰方式不符時拒絕輸入", () => {
		// 單打但隊 A 為 2 人
		const singlesCall = () =>
			updateRatings({
				format: "singles",
				teams: [
					[makeRatingPlayer("A1", 4.0, 0), makeRatingPlayer("A2", 4.0, 0)],
					[makeRatingPlayer("B1", 4.0, 0)],
				],
				winnerIndex: 0,
			});
		expect(singlesCall).toThrow(/隊伍人數需為 1 人/);
		expect(singlesCall).toThrow(/目前輸入：2 人/);

		// 雙打但隊 A 為 1 人
		const doublesCall = () =>
			updateRatings({
				format: "doubles",
				teams: [
					[makeRatingPlayer("A1", 4.0, 0)],
					[makeRatingPlayer("B1", 4.0, 0), makeRatingPlayer("B2", 4.0, 0)],
				],
				winnerIndex: 0,
			});
		expect(doublesCall).toThrow(/隊伍人數需為 2 人/);
		expect(doublesCall).toThrow(/目前輸入：1 人/);
	});

	it("rating 超出 1.00～8.00 時拒絕輸入而非靜默夾值", () => {
		// rating 為 0.99
		expect(() =>
			updateRatings({
				format: "singles",
				teams: [
					[makeRatingPlayer("A1", 0.99, 0)],
					[makeRatingPlayer("B1", 4.0, 0)],
				],
				winnerIndex: 0,
			})
		).toThrow(/rating/);

		// rating 為 8.01
		expect(() =>
			updateRatings({
				format: "singles",
				teams: [
					[makeRatingPlayer("A1", 8.01, 0)],
					[makeRatingPlayer("B1", 4.0, 0)],
				],
				winnerIndex: 0,
			})
		).toThrow(/rating/);

		// rating 為 1.0 應正常
		const result1 = updateRatings({
			format: "singles",
			teams: makeSinglesTeams(1.0, 4.0),
			winnerIndex: 0,
		});
		expect(result1.changes).toBeDefined();

		// rating 為 8.0 應正常
		const result2 = updateRatings({
			format: "singles",
			teams: makeSinglesTeams(8.0, 4.0),
			winnerIndex: 0,
		});
		expect(result2.changes).toBeDefined();
	});

	it("gamesPlayed 為負數或非整數時拒絕輸入", () => {
		// gamesPlayed 為 -1
		expect(() =>
			updateRatings({
				format: "singles",
				teams: [
					[makeRatingPlayer("A1", 4.0, -1)],
					[makeRatingPlayer("B1", 4.0, 0)],
				],
				winnerIndex: 0,
			})
		).toThrow(/gamesPlayed/);

		// gamesPlayed 為 1.5
		expect(() =>
			updateRatings({
				format: "singles",
				teams: [
					[makeRatingPlayer("A1", 4.0, 1.5)],
					[makeRatingPlayer("B1", 4.0, 0)],
				],
				winnerIndex: 0,
			})
		).toThrow(/gamesPlayed/);

		// gamesPlayed 為 0 應正常
		const result = updateRatings({
			format: "singles",
			teams: makeSinglesTeams(4.0, 4.0, 0),
			winnerIndex: 0,
		});
		expect(result.changes).toBeDefined();
	});

	it("同一場出現重複的 player id 時拒絕輸入", () => {
		// 同一 id 同時在兩隊
		expect(() =>
			updateRatings({
				format: "singles",
				teams: [
					[makeRatingPlayer("A1", 4.0, 0)],
					[makeRatingPlayer("A1", 4.0, 0)],
				],
				winnerIndex: 0,
			})
		).toThrow(/player id|重複/);

		// 同一 id 同時在同一隊兩個位置
		expect(() =>
			updateRatings({
				format: "doubles",
				teams: [
					[makeRatingPlayer("A1", 4.0, 0), makeRatingPlayer("A1", 4.0, 0)],
					[makeRatingPlayer("B1", 4.0, 0), makeRatingPlayer("B2", 4.0, 0)],
				],
				winnerIndex: 0,
			})
		).toThrow(/player id|重複/);
	});
});
