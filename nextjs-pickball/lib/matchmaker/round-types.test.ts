import { describe, it, expect } from "vitest";
import {
	RoundSchema,
	MatchStatusSchema,
	TARGET_SCORE_OPTIONS,
	RoundTimerDurationMinutesSchema,
} from "./round-types";
import type { Round, RoundMatch } from "./round-types";
import { TargetScoreSchema } from "../scoreboard/types";

/** 建立一份合法的測試用 RoundMatch，可透過 overrides 覆寫特定欄位。 */
function makeRoundMatch(overrides: Partial<RoundMatch> = {}): RoundMatch {
	return {
		id: "match-1",
		courtNumber: 1,
		format: "singles",
		teams: [
			{ playerIds: ["p1"], rating: 5 },
			{ playerIds: ["p2"], rating: 6 },
		],
		status: "pending",
		scores: null,
		winner: null,
		completedAt: null,
		playerRatings: [
			{ playerId: "p1", before: 5, after: null },
			{ playerId: "p2", before: 6, after: null },
		],
		...overrides,
	};
}

/** 建立一份合法的測試用 Round，可透過 overrides 覆寫特定欄位。 */
function makeRound(overrides: Partial<Round> = {}): Round {
	return {
		roundNumber: 1,
		createdAt: "2026-08-16T00:00:00.000Z",
		format: "singles",
		courtCount: 1,
		targetScore: 11,
		matches: [],
		restingPlayerIds: [],
		seenSignatures: {
			teammateKeys: [],
			opponentKeys: [],
			fullMatchKeys: [],
		},
		timer: null,
		...overrides,
	};
}

describe("RoundSchema", () => {
	it("合法回合通過驗證，roundNumber 非正整數時失敗", () => {
		const validResult = RoundSchema.safeParse(makeRound());
		expect(validResult.success).toBe(true);

		const invalidZero = RoundSchema.safeParse(makeRound({ roundNumber: 0 }));
		expect(invalidZero.success).toBe(false);

		const invalidNegative = RoundSchema.safeParse(makeRound({ roundNumber: -1 }));
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
		// 三段 completed 案例共用同一份合法 playerRatings（賽後分數皆已填入），
		// 只有各自被拿掉的那個欄位不同。
		const completedPlayerRatings = [
			{ playerId: "p1", before: 5, after: 6 },
			{ playerId: "p2", before: 6, after: 5 },
		];

		// pending 且 scores／winner／completedAt 皆為 null 應通過
		const pendingResult = RoundSchema.safeParse(
			makeRound({ matches: [makeRoundMatch()] }),
		);
		expect(pendingResult.success).toBe(true);

		// completed 且缺少 scores 應失敗
		const noScoresResult = RoundSchema.safeParse(
			makeRound({
				matches: [
					makeRoundMatch({
						status: "completed",
						scores: null,
						winner: "teamA",
						completedAt: "2026-08-16T01:00:00.000Z",
						playerRatings: completedPlayerRatings,
					}),
				],
			}),
		);
		expect(noScoresResult.success).toBe(false);

		// completed 且缺少 winner 應失敗
		const noWinnerResult = RoundSchema.safeParse(
			makeRound({
				matches: [
					makeRoundMatch({
						status: "completed",
						scores: { teamA: 11, teamB: 9 },
						winner: null,
						completedAt: "2026-08-16T01:00:00.000Z",
						playerRatings: completedPlayerRatings,
					}),
				],
			}),
		);
		expect(noWinnerResult.success).toBe(false);

		// completed 且缺少 completedAt 應失敗
		const noCompletedAtResult = RoundSchema.safeParse(
			makeRound({
				matches: [
					makeRoundMatch({
						status: "completed",
						scores: { teamA: 11, teamB: 9 },
						winner: "teamA",
						completedAt: null,
						playerRatings: completedPlayerRatings,
					}),
				],
			}),
		);
		expect(noCompletedAtResult.success).toBe(false);
	});

	it("targetScore 僅接受 11、15、21 且不帶預設值", () => {
		// 三個合法值應通過
		const valid11 = RoundSchema.safeParse(makeRound({ targetScore: 11 }));
		const valid15 = RoundSchema.safeParse(makeRound({ targetScore: 15 }));
		const valid21 = RoundSchema.safeParse(makeRound({ targetScore: 21 }));
		expect(valid11.success).toBe(true);
		expect(valid15.success).toBe(true);
		expect(valid21.success).toBe(true);

		// 非法值應失敗（safeParse 參數型別為 unknown，故意帶入非法字面量不需要 cast）
		const invalid9 = RoundSchema.safeParse({ ...makeRound(), targetScore: 9 });
		const invalid13 = RoundSchema.safeParse({ ...makeRound(), targetScore: 13 });
		expect(invalid9.success).toBe(false);
		expect(invalid13.success).toBe(false);

		// 未提供 targetScore 應失敗（不帶預設值）。用淺拷貝後 delete 該欄位，
		// 而不是解構省略——後者會留下一個宣告但未使用的變數，觸發 no-unused-vars warning。
		const roundWithoutTargetScore: Record<string, unknown> = { ...makeRound() };
		delete roundWithoutTargetScore.targetScore;
		const invalidUndefined = RoundSchema.safeParse(roundWithoutTargetScore);
		expect(invalidUndefined.success).toBe(false);
	});

	it("目標分數選項與 scoreboard 的 TargetScoreSchema 值域一致", () => {
		const roundOptions = new Set(TARGET_SCORE_OPTIONS);

		// 值域必須自 TargetScoreSchema 本身讀出，而非硬編字面量。
		// 若計分板日後改變可接受的分數，這個測試才會轉紅，防止跨 capability 的靜默漂移。
		// .unwrap() 用來去掉向後相容所加的 .default(11) 包裝，才能存取底層 union 的選項。
		const scoreboardOptions = new Set(
			TargetScoreSchema.unwrap().options.map((literal) => literal.value),
		);

		expect(roundOptions).toEqual(scoreboardOptions);
	});

	it("回合資料缺少 timer 欄位時以 null 通過驗證，向後相容既有資料", () => {
		// 模擬 M14 之前寫入的既有 matchmaker:round:v1 資料：不含 timer 欄位。
		const roundWithoutTimer: Record<string, unknown> = { ...makeRound() };
		delete roundWithoutTimer.timer;

		const result = RoundSchema.safeParse(roundWithoutTimer);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.timer).toBeNull();
		}

		// 除了「完全缺少欄位」，M14 之後由本 capability 寫入、明確帶 timer: null
		// 的「不計時」資料也必須通過驗證——這一段語意由 .nullable() 負責，
		// 與「完全缺少欄位」時由 .default(null) 補值是兩件不同的事。
		const explicitNullResult = RoundSchema.safeParse(
			makeRound({ timer: null }),
		);
		expect(explicitNullResult.success).toBe(true);
		if (explicitNullResult.success) {
			expect(explicitNullResult.data.timer).toBeNull();
		}
	});

	it("timer 為物件時 startedAt 未開始為 null、開始後為 ISO 字串", () => {
		// Stage 2 mutation 補洞：上面兩個 it 只建構過 timer 為 null 或完全缺欄位的回合，
		// RoundTimerObjectSchema 的兩個欄位因此零覆蓋——把 startedAt 的 .nullable()
		// 拿掉、或把 RoundSchema 的 timer 換成別的 schema，測試都不會轉紅。
		const notStarted = RoundSchema.safeParse(
			makeRound({ timer: { durationMinutes: 15, startedAt: null } }),
		);
		expect(notStarted.success).toBe(true);
		if (notStarted.success) {
			expect(notStarted.data.timer).toEqual({
				durationMinutes: 15,
				startedAt: null,
			});
		}

		const started = RoundSchema.safeParse(
			makeRound({
				timer: { durationMinutes: 20, startedAt: "2026-08-16T00:10:00.000Z" },
			}),
		);
		expect(started.success).toBe(true);
		if (started.success) {
			expect(started.data.timer).toEqual({
				durationMinutes: 20,
				startedAt: "2026-08-16T00:10:00.000Z",
			});
		}

		// 非法的 durationMinutes 在 Round 這一層也要被擋下，而非只有單獨 parse
		// RoundTimerDurationMinutesSchema 時才擋（safeParse 參數型別為 unknown，
		// 故意帶入非法字面量不需要 cast）。
		const invalidDuration = RoundSchema.safeParse({
			...makeRound(),
			timer: { durationMinutes: 25, startedAt: null },
		});
		expect(invalidDuration.success).toBe(false);
	});

	it("計時長度僅接受 10、15、20 分鐘", () => {
		const valid10 = RoundTimerDurationMinutesSchema.safeParse(10);
		const valid15 = RoundTimerDurationMinutesSchema.safeParse(15);
		const valid20 = RoundTimerDurationMinutesSchema.safeParse(20);
		expect(valid10.success).toBe(true);
		expect(valid15.success).toBe(true);
		expect(valid20.success).toBe(true);

		const invalid5 = RoundTimerDurationMinutesSchema.safeParse(5);
		const invalid30 = RoundTimerDurationMinutesSchema.safeParse(30);
		const invalid0 = RoundTimerDurationMinutesSchema.safeParse(0);
		expect(invalid5.success).toBe(false);
		expect(invalid30.success).toBe(false);
		expect(invalid0.success).toBe(false);
	});
});
