import { z } from "zod";
import type { MatchFormat } from "./allocation-types";
import { MIN_COURT_COUNT, MAX_COURT_COUNT } from "./allocation-types";

// 場次狀態：pending（已排定但未開始）、scoring（進行中）、completed（已完成）。
export const MatchStatusSchema = z.enum(["pending", "scoring", "completed"]);

// 對戰方式：沿用 allocation-types.ts 的 MatchFormat。
const RoundFormatSchema: z.ZodType<MatchFormat> = z.enum([
	"singles",
	"doubles",
]);

// 一支隊伍的回合資訊：球員 id 清單與隊伍分數。
export const RoundTeamSchema = z.object({
	playerIds: z.array(z.string()),
	rating: z.number(),
});

// 單一球員的賽前賽後分數快照。
export const PlayerRatingSchema = z.object({
	playerId: z.string(),
	before: z.number(),
	after: z.number().nullable(),
});

// 一場對戰在本輪的詳細資訊。
export const RoundMatchSchema = z
	.object({
		id: z.string(),
		courtNumber: z.number().int().positive(),
		format: RoundFormatSchema,
		doublesComposition: z.enum(["mens", "womens", "mixed", "general"]).optional(),
		teams: z.tuple([RoundTeamSchema, RoundTeamSchema]),
		status: MatchStatusSchema,
		scores: z
			.object({
				teamA: z.number().int().nonnegative(),
				teamB: z.number().int().nonnegative(),
			})
			.nullable(),
		winner: z.enum(["teamA", "teamB"]).nullable(),
		completedAt: z.iso.datetime().nullable(),
		playerRatings: z.array(PlayerRatingSchema),
	})
	.superRefine((data, ctx) => {
		// completed 場次必須帶齊 scores、winner、completedAt，且所有 playerRatings[].after 必須為數字。
		if (data.status === "completed") {
			if (data.scores === null) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: "completed 場次必須帶有 scores",
					path: ["scores"],
				});
			}
			if (data.winner === null) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: "completed 場次必須帶有 winner",
					path: ["winner"],
				});
			}
			if (data.completedAt === null) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: "completed 場次必須帶有 completedAt",
					path: ["completedAt"],
				});
			}
			// 檢查所有 playerRatings 的 after 都必須為數字（not null）
			for (const rating of data.playerRatings) {
				if (rating.after === null) {
					ctx.addIssue({
						code: z.ZodIssueCode.custom,
						message: "completed 場次的 playerRatings[].after 必須為數字",
						path: ["playerRatings"],
					});
					break;
				}
			}
		}
	});

// 重複比對簽章：三個字串陣列。
export const SeenSignaturesSchema = z.object({
	teammateKeys: z.array(z.string()),
	opponentKeys: z.array(z.string()),
	fullMatchKeys: z.array(z.string()),
});

// 目標分數的三個合法值：11、15、21（不帶預設值）。
export const RoundTargetScoreSchema = z.union([
	z.literal(11),
	z.literal(15),
	z.literal(21),
]);

// 目標分數選項常數清單。
export const TARGET_SCORE_OPTIONS = [11, 15, 21] as const;

// 預設目標分數（由本 capability 匯出，不由 UI 各自寫死）。
export const DEFAULT_TARGET_SCORE = 11;

// 一輪對戰的完整資訊。
export const RoundSchema = z.object({
	roundNumber: z.number().int().positive(),
	createdAt: z.iso.datetime(),
	format: RoundFormatSchema,
	courtCount: z.number().int().min(MIN_COURT_COUNT).max(MAX_COURT_COUNT),
	targetScore: RoundTargetScoreSchema,
	matches: z.array(RoundMatchSchema),
	restingPlayerIds: z.array(z.string()),
	seenSignatures: SeenSignaturesSchema,
});

// 型別匯出，供後續群組使用。
export type MatchStatus = z.infer<typeof MatchStatusSchema>;
export type RoundTeam = z.infer<typeof RoundTeamSchema>;
export type PlayerRating = z.infer<typeof PlayerRatingSchema>;
export type RoundMatch = z.infer<typeof RoundMatchSchema>;
export type Round = z.infer<typeof RoundSchema>;
export type SeenSignatures = z.infer<typeof SeenSignaturesSchema>;
