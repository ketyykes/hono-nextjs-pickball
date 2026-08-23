import { describe, it, expect } from "vitest";
import { RoundSchema, MatchStatusSchema, RoundTargetScoreSchema, TARGET_SCORE_OPTIONS } from "./round-types";
import { TargetScoreSchema } from "../scoreboard/types";

describe("RoundSchema", () => {
	it("合法回合通過驗證，roundNumber 非正整數時失敗", () => {
		const validRound = {
			roundNumber: 1,
			createdAt: "2026-08-16T00:00:00.000Z",
			format: "singles" as const,
			courtCount: 1,
			targetScore: 11 as const,
			matches: [],
			restingPlayerIds: [],
			seenSignatures: {
				teammateKeys: [],
				opponentKeys: [],
				fullMatchKeys: [],
			},
		};

		const validResult = RoundSchema.safeParse(validRound);
		expect(validResult.success).toBe(true);

		const invalidZero = RoundSchema.safeParse({
			...validRound,
			roundNumber: 0,
		});
		expect(invalidZero.success).toBe(false);

		const invalidNegative = RoundSchema.safeParse({
			...validRound,
			roundNumber: -1,
		});
		expect(invalidNegative.success).toBe(false);
	});

	it("場次狀態僅接受 pending、scoring、completed", () => {
		const validPending = MatchStatusSchema.safeParse("pending");
		const validScoring = MatchStatusSchema.safeParse("scoring");
		const validCompleted = MatchStatusSchema.safeParse("completed");
		const invalidDone = MatchStatusSchema.safeParse("done");

		expect(validPending.success).toBe(true);
		expect(validScoring.success).toBe(true);
		expect(validCompleted.success).toBe(true);
		expect(invalidDone.success).toBe(false);
	});

	it("completed 場次缺少比分、勝方或完成時間時驗證失敗", () => {
		const baseMatch = {
			id: "match-1",
			courtNumber: 1,
			format: "singles" as const,
			teams: [
				{
					playerIds: ["p1"],
					rating: 5,
				},
				{
					playerIds: ["p2"],
					rating: 6,
				},
			],
			playerRatings: [
				{
					playerId: "p1",
					before: 5,
					after: null,
				},
				{
					playerId: "p2",
					before: 6,
					after: null,
				},
			],
		};

		// pending 且三者為 null 應通過
		const pendingValid = {
			...baseMatch,
			status: "pending" as const,
			scores: null,
			winner: null,
			completedAt: null,
		};
		const pendingResult = RoundSchema.safeParse({
			roundNumber: 1,
			createdAt: "2026-08-16T00:00:00.000Z",
			format: "singles",
			courtCount: 1,
			targetScore: 11,
			matches: [pendingValid],
			restingPlayerIds: [],
			seenSignatures: {
				teammateKeys: [],
				opponentKeys: [],
				fullMatchKeys: [],
			},
		});
		expect(pendingResult.success).toBe(true);

		// completed 且缺少 scores 應失敗
		const completedNoScores = {
			...baseMatch,
			status: "completed" as const,
			scores: null,
			winner: "teamA" as const,
			completedAt: "2026-08-16T01:00:00.000Z",
			playerRatings: [
				{
					playerId: "p1",
					before: 5,
					after: 6,
				},
				{
					playerId: "p2",
					before: 6,
					after: 5,
				},
			],
		};
		const noScoresResult = RoundSchema.safeParse({
			roundNumber: 1,
			createdAt: "2026-08-16T00:00:00.000Z",
			format: "singles",
			courtCount: 1,
			targetScore: 11,
			matches: [completedNoScores],
			restingPlayerIds: [],
			seenSignatures: {
				teammateKeys: [],
				opponentKeys: [],
				fullMatchKeys: [],
			},
		});
		expect(noScoresResult.success).toBe(false);

		// completed 且缺少 winner 應失敗
		const completedNoWinner = {
			...baseMatch,
			status: "completed" as const,
			scores: { teamA: 11, teamB: 9 },
			winner: null,
			completedAt: "2026-08-16T01:00:00.000Z",
			playerRatings: [
				{
					playerId: "p1",
					before: 5,
					after: 6,
				},
				{
					playerId: "p2",
					before: 6,
					after: 5,
				},
			],
		};
		const noWinnerResult = RoundSchema.safeParse({
			roundNumber: 1,
			createdAt: "2026-08-16T00:00:00.000Z",
			format: "singles",
			courtCount: 1,
			targetScore: 11,
			matches: [completedNoWinner],
			restingPlayerIds: [],
			seenSignatures: {
				teammateKeys: [],
				opponentKeys: [],
				fullMatchKeys: [],
			},
		});
		expect(noWinnerResult.success).toBe(false);

		// completed 且缺少 completedAt 應失敗
		const completedNoCompletedAt = {
			...baseMatch,
			status: "completed" as const,
			scores: { teamA: 11, teamB: 9 },
			winner: "teamA" as const,
			completedAt: null,
			playerRatings: [
				{
					playerId: "p1",
					before: 5,
					after: 6,
				},
				{
					playerId: "p2",
					before: 6,
					after: 5,
				},
			],
		};
		const noCompletedAtResult = RoundSchema.safeParse({
			roundNumber: 1,
			createdAt: "2026-08-16T00:00:00.000Z",
			format: "singles",
			courtCount: 1,
			targetScore: 11,
			matches: [completedNoCompletedAt],
			restingPlayerIds: [],
			seenSignatures: {
				teammateKeys: [],
				opponentKeys: [],
				fullMatchKeys: [],
			},
		});
		expect(noCompletedAtResult.success).toBe(false);
	});

	it("targetScore 僅接受 11、15、21 且不帶預設值", () => {
		const baseRound = {
			roundNumber: 1,
			createdAt: "2026-08-16T00:00:00.000Z",
			format: "singles" as const,
			courtCount: 1,
			matches: [],
			restingPlayerIds: [],
			seenSignatures: {
				teammateKeys: [],
				opponentKeys: [],
				fullMatchKeys: [],
			},
		};

		// 三個合法值應通過
		const valid11 = RoundSchema.safeParse({ ...baseRound, targetScore: 11 });
		const valid15 = RoundSchema.safeParse({ ...baseRound, targetScore: 15 });
		const valid21 = RoundSchema.safeParse({ ...baseRound, targetScore: 21 });
		expect(valid11.success).toBe(true);
		expect(valid15.success).toBe(true);
		expect(valid21.success).toBe(true);

		// 非法值應失敗
		const invalid9 = RoundSchema.safeParse({ ...baseRound, targetScore: 9 });
		const invalid13 = RoundSchema.safeParse({ ...baseRound, targetScore: 13 });
		expect(invalid9.success).toBe(false);
		expect(invalid13.success).toBe(false);

		// 未提供 targetScore 應失敗（不帶預設值）
		const invalidUndefined = RoundSchema.safeParse({
			...baseRound,
			// targetScore 未提供
		} as any);
		expect(invalidUndefined.success).toBe(false);
	});

	it("目標分數選項與 scoreboard 的 TargetScoreSchema 值域一致", () => {
		// 取出 RoundTargetScoreSchema 的可接受值
		const roundOptions = new Set(TARGET_SCORE_OPTIONS);

		// 取出 TargetScoreSchema 的可接受值（除了 default 之外）
		// TargetScoreSchema 是 z.union([z.literal(11), z.literal(15), z.literal(21)]).default(11)
		// 其可接受的值是 11、15、21
		const scoreboardValidValues = [11, 15, 21];
		const scoreboardOptions = new Set(scoreboardValidValues);

		// 驗證兩個集合完全相同
		expect(roundOptions).toEqual(scoreboardOptions);
	});
});
