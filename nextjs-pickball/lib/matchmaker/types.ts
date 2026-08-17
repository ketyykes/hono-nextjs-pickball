import { z } from "zod";

export const GenderSchema = z.enum(["male", "female", "other"]);

// Hex 色碼格式，colorFrom／colorTo 共用同一規則，避免 regex 重複。
const HexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const PlayerSchema = z.object({
	id: z.string(),
	// trim() 是刻意的正規化，不在 spec「SHALL NOT 靜默夾值或改寫」的約束範圍內——
	// 該約束僅針對 rating 與 Hex 色碼，trim 則是 tasks 1.6 明文指示的行為。
	name: z.string().trim().min(1),
	gender: GenderSchema,
	colorFrom: HexColorSchema,
	colorTo: HexColorSchema,
	rating: z.number().min(1).max(8),
	// 本 capability 只初始化不累加，先納入是為避免後續破壞性遷移。
	restCount: z.number().int().nonnegative().default(0),
	gamesPlayed: z.number().int().nonnegative().default(0),
	isActive: z.boolean(),
	createdAt: z.iso.datetime(),
});

export const RosterSchema = z.object({
	version: z.literal(1),
	players: z.array(PlayerSchema),
});

export type Gender = z.infer<typeof GenderSchema>;
export type Player = z.infer<typeof PlayerSchema>;
export type Roster = z.infer<typeof RosterSchema>;
