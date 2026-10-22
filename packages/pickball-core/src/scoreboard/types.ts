import { z } from "zod";

export const ModeSchema = z.enum(["singles", "doubles"]);
export const TeamSchema = z.enum(["us", "them"]);
export const StatusSchema = z.enum(["setup", "playing", "finished"]);
export const ServerNumberSchema = z.union([z.literal(1), z.literal(2)]);
export const ServeSideSchema = z.enum(["right", "left"]);

// 目標分數：2026 USA Pickleball 官方的三種分制（11／15／21），皆為 win by 2 且不設分數上限。
// .default(11) 是向後相容的關鍵——本欄位加入前寫入的 localStorage 資料不含 targetScore，
// 若被判為驗證失敗，storage.ts 會清除該 key，使用者進行中的比賽會在重整後靜默歸零。
export const TargetScoreSchema = z
	.union([z.literal(11), z.literal(15), z.literal(21)])
	.default(11);

export const ScoreEventSchema = z.object({
	type: z.literal("RALLY_WON"),
	winner: TeamSchema,
});

// 球員姓名色塊：色碼欄位刻意維持 z.string()、不加 hex regex 驗證——
// lib/scoreboard/ 不依賴 lib/matchmaker/ 的任何 schema（單向相依），
// 格式正確性由寫入端（buildMatchSlotSeed，唯一生產者）負責（design Decision 6）。
export const PlayerBadgeSchema = z.object({
	name: z.string(),
	colorFrom: z.string(),
	colorTo: z.string(),
	foreground: z.string(),
});

// us／them 兩個 key 沿用 scoreboard-binding 既有的 ScoreboardTeamScores 命名慣例；
// 單打每隊 1 筆、雙打每隊 2 筆，故長度界於 1～2（design Decision 6）。
export const TeamPlayersSchema = z.object({
	us: z.array(PlayerBadgeSchema).min(1).max(2),
	them: z.array(PlayerBadgeSchema).min(1).max(2),
});

export const ScoreboardStateSchema = z.object({
	mode: ModeSchema,
	scores: z.object({
		us: z.number().int().nonnegative(),
		them: z.number().int().nonnegative(),
	}),
	servingTeam: TeamSchema,
	serverNumber: ServerNumberSchema,
	isFirstServiceOfGame: z.boolean(),
	history: z.array(ScoreEventSchema),
	status: StatusSchema,
	winner: TeamSchema.nullable(),
	firstServer: TeamSchema,
	targetScore: TargetScoreSchema,
	// 對戰場次綁定：null 為獨立計分板。.default(null) 是向後相容的關鍵——本欄位加入前
	// 寫入 scoreboard:current:v1 的資料不含 matchId，若判為驗證失敗會被清除，
	// 使用者進行中的比賽會在重整後靜默歸零（與 targetScore 的向後相容理由同構）。
	matchId: z.string().nullable().default(null),
	// 場地標示（如「場地 3」）的資料來源：與 matchId 同構的向後相容理由——
	// .default(null) 使本欄位加入前寫入的資料被補為 null，而非判為損壞。
	courtNumber: z.number().int().positive().nullable().default(null),
	// 球員姓名色塊：與 matchId／courtNumber 同構的向後相容理由——
	// .default(null) 使本欄位加入前寫入的資料被補為 null（維持我方／對方純文字呈現），
	// 而非判為損壞。
	teamPlayers: TeamPlayersSchema.nullable().default(null),
});

export type Mode = z.infer<typeof ModeSchema>;
export type Team = z.infer<typeof TeamSchema>;
export type Status = z.infer<typeof StatusSchema>;
export type ServerNumber = z.infer<typeof ServerNumberSchema>;
export type ServeSide = z.infer<typeof ServeSideSchema>;
export type ScoreEvent = z.infer<typeof ScoreEventSchema>;
export type ScoreboardState = z.infer<typeof ScoreboardStateSchema>;
export type TargetScore = z.infer<typeof TargetScoreSchema>;
export type PlayerBadge = z.infer<typeof PlayerBadgeSchema>;
export type TeamPlayers = z.infer<typeof TeamPlayersSchema>;

// 賽前設定：status === "setup" 期間可調整、且在 UNDO replay 與 RESET 後必須被保留的欄位。
// 收斂為單一型別，使新增設定值時只需改這裡與 settingsOf()，不必巡視每個 createInitialState 呼叫點。
export interface MatchSettings {
	mode: Mode;
	firstServer: Team;
	targetScore: TargetScore;
	matchId: string | null;
	courtNumber: number | null;
	teamPlayers: TeamPlayers | null;
}

// Action 為純記憶體型別，不會落 localStorage，無需 zod 驗證
export type Action =
	| { type: "SET_MODE"; mode: Mode }
	| { type: "SET_FIRST_SERVER"; team: Team }
	| { type: "SET_TARGET_SCORE"; targetScore: TargetScore }
	| { type: "RALLY_WON"; winner: Team }
	| { type: "UNDO" }
	| { type: "RESET" }
	| { type: "HYDRATE"; state: ScoreboardState };
