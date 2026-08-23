import { z } from "zod";
import type { DoublesComposition, MatchFormat } from "./allocation-types";

// 對戰方式：沿用 allocation-types.ts 的 DoublesComposition。與 round-types.ts 的
// RoundDoublesCompositionSchema 同一寫法：z.ZodType<T> 標注，直接當欄位 schema 用，
// 不需要具體型別，故可安心抹除。
const HistoryDoublesCompositionSchema: z.ZodType<DoublesComposition> = z.enum([
	"mens",
	"womens",
	"mixed",
	"general",
]);

// 歷史必須比名單活得久（design Decision 3）：id 只留供日後比對，name 才是顯示用的
// 姓名快照。球員被刪除或改名後，這筆快照仍要能完整還原當時的姓名——
// SHALL NOT 只存 id 再回查名單，那樣一次刪除就會讓過去所有賽果跟著消失或變成空白。
export const HistoryPlayerSchema = z.object({
	id: z.string(),
	name: z.string(),
	ratingBefore: z.number(),
	ratingAfter: z.number(),
});

export const HistoryTeamSchema = z.object({
	players: z.array(HistoryPlayerSchema),
	rating: z.number(),
});

const HistoryEntryBaseSchema = z.object({
	matchId: z.string(),
	courtNumber: z.number().int().positive(),
	playedAt: z.iso.datetime(),
	teamA: HistoryTeamSchema,
	teamB: HistoryTeamSchema,
	scoreA: z.number().int().nonnegative(),
	scoreB: z.number().int().nonnegative(),
	winner: z.enum(["teamA", "teamB"]),
});

// 以 discriminated union 表達 doublesComposition 的有無，而非 optional 欄位——
// 與 round-types.ts 的 RoundMatchSchema 刻意相反（該檔理由見其註解：損壞降級要可
// 診斷、消費端是就地更新）。這裡改用 DU 是因為本 capability 有明確 Scenario／測試
// 要求「單打 MUST NOT 帶、雙打 MUST 帶」，DU 才能表達成編譯期與執行期一致的約束。
//
// 兩個分支皆呼叫 .strict()：z.object 對物件字面量以外的多餘欄位預設是 strip
// （悄悄剝除）而非 reject，若不加 .strict()，單打分支帶了 doublesComposition
// 會被直接濾掉、驗證照樣通過，讓「單打不得帶」這條斷言測不出來。
//
// 兩個分支的字面量各自用 satisfies MatchFormat 綁定，而非把 z.enum(["singles",
// "doubles"]) 包成 z.ZodType<MatchFormat> 再用 .options 拆解——試過那條路：zod4
// 的 ZodEnum.options 型別是 T[]（一般陣列），不是逐位置字面量的 tuple，解構出來的
// 兩個變數都會被寬化成整個 MatchFormat 聯集，z.literal() 吃到聯集會退化成 never，
// discriminatedUnion 因此在型別層失去分辨力（實測會讓下游所有依賴 format 判斷分支
// 的型別退化為 undefined／never）。satisfies 逐一綁定沒有這個陷阱，仍能在字面量
// 拼錯或 MatchFormat 增減字面量時擋下編譯。
export const MatchHistoryEntrySchema = z.discriminatedUnion("format", [
	HistoryEntryBaseSchema
		.extend({
			format: z.literal("singles" satisfies MatchFormat),
		})
		.strict(),
	HistoryEntryBaseSchema
		.extend({
			format: z.literal("doubles" satisfies MatchFormat),
			doublesComposition: HistoryDoublesCompositionSchema,
		})
		.strict(),
]);

// 外層容器：version 為字面量 1；entries 以追加順序保存（見 appendHistoryEntry），
// 不在 schema 層排序或去重。
export const HistorySchema = z.object({
	version: z.literal(1),
	entries: z.array(MatchHistoryEntrySchema),
});

export type HistoryPlayer = z.infer<typeof HistoryPlayerSchema>;
export type HistoryTeam = z.infer<typeof HistoryTeamSchema>;
export type MatchHistoryEntry = z.infer<typeof MatchHistoryEntrySchema>;
export type History = z.infer<typeof HistorySchema>;

/**
 * 追加一筆歷史紀錄，回傳新陣列。SHALL NOT push 到傳入的陣列——呼叫端（round.ts）
 * 在原子的送出流程中可能仍持有舊陣列參考，就地修改會讓「送出失敗時歷史不變」
 * 這條保證失守。SHALL NOT 排序或去重：排序、時間區間篩選屬後續 milestone，
 * 在此先排序會讓同秒完成的兩場順序不穩定，也讓後續失去唯一可靠的並列基準。
 */
export function appendHistoryEntry(
	history: readonly MatchHistoryEntry[],
	entry: MatchHistoryEntry,
): MatchHistoryEntry[] {
	return [...history, entry];
}
