import { z } from "zod";

export const ModeSchema = z.enum(["singles", "doubles"]);
export const TeamSchema = z.enum(["us", "them"]);
export const StatusSchema = z.enum(["setup", "playing", "finished"]);
export const ServerNumberSchema = z.union([z.literal(1), z.literal(2)]);
export const ServeSideSchema = z.enum(["right", "left"]);

export const ScoreEventSchema = z.object({
	type: z.literal("RALLY_WON"),
	winner: TeamSchema,
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
});

export type Mode = z.infer<typeof ModeSchema>;
export type Team = z.infer<typeof TeamSchema>;
export type Status = z.infer<typeof StatusSchema>;
export type ServerNumber = z.infer<typeof ServerNumberSchema>;
export type ServeSide = z.infer<typeof ServeSideSchema>;
export type ScoreEvent = z.infer<typeof ScoreEventSchema>;
export type ScoreboardState = z.infer<typeof ScoreboardStateSchema>;

// Action 為純記憶體型別，不會落 localStorage，無需 zod 驗證
export type Action =
	| { type: "SET_MODE"; mode: Mode }
	| { type: "SET_FIRST_SERVER"; team: Team }
	| { type: "RALLY_WON"; winner: Team }
	| { type: "UNDO" }
	| { type: "RESET" }
	| { type: "HYDRATE"; state: ScoreboardState };
