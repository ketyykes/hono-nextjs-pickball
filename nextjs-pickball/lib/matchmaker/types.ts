import { z } from "zod";

export const GenderSchema = z.enum(["male", "female", "other"]);

// Hex 色碼格式，colorFrom／colorTo 共用同一規則，避免 regex 重複。
const HexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const PlayerSchema = z.object({
	id: z.string(),
	name: z.string().trim().min(1),
	gender: GenderSchema,
	colorFrom: HexColorSchema,
	colorTo: HexColorSchema,
	rating: z.number().min(1).max(8),
	// 本 capability 只初始化不累加，先納入是為避免後續破壞性遷移。
	restCount: z.number().int().nonnegative().default(0),
	gamesPlayed: z.number().int().nonnegative().default(0),
	isActive: z.boolean(),
	createdAt: z.string(),
});

export const RosterSchema = z.object({
	version: z.number(),
	players: z.array(PlayerSchema),
});

export type Gender = z.infer<typeof GenderSchema>;
export type Player = z.infer<typeof PlayerSchema>;
export type Roster = z.infer<typeof RosterSchema>;
