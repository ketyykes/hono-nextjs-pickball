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
// 兩個變數都會被寬化成整個 MatchFormat 聯集。z.literal(聯集值) 推導出來的型別是
// 整個聯集本身，不會退化成 never；真正退化成 never 的是下游依賴 format 判斷分支時
// 的 Extract<MatchHistoryEntry, { format: "..." }> 收窄結果——discriminatedUnion
// 在型別層失去分辨力後，下游所有靠 format 縮小型別的地方都拿不到正確的分支型別。
// satisfies 逐一綁定能避開這個陷阱，但保護是不對稱的：字面量拼錯，或
// MatchFormat 移除／改名某個值時，會是 TS1360 編譯錯誤；但 MatchFormat
// **新增**一個字面量時，這裡完全不會有任何編譯錯誤（兩個分支照樣通過，只是
// 少涵蓋新值）。這個「擋得住減、擋不住增」的缺口與 round-types.ts 的
// z.ZodType<T> 綁定寫法（RoundFormatSchema／RoundDoublesCompositionSchema）
// 及本檔 HistoryDoublesCompositionSchema 完全相同——皆非本寫法獨有，故不視為
// 退步。下方 AssertFormatCovered 型別斷言補上「新增」這一側的防護。
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

// satisfies 只擋得住字面量拼錯與 MatchFormat 移除／改名，擋不住新增字面量
// （見上方註解）。這行把「DU 兩分支 format 的值域」與「MatchFormat 的值域」
// 互相收斂比對：MatchFormat 新增一個分支未涵蓋的字面量時，其中一側 extends
// 會不成立，此型別退化為 never，在需要它是 true 的地方轉紅，補上「新增」這
// 一側原本擋不住的缺口。以 export 而非底線前綴命名，避免僅供型別層驗證用途
// 卻被 @typescript-eslint/no-unused-vars 判定未使用。
export type AssertFormatCovered =
	[MatchHistoryEntry["format"]] extends [MatchFormat]
		? [MatchFormat] extends [MatchHistoryEntry["format"]] ? true : never
		: never;

// 外層容器：entries 以追加順序保存，不在 schema 層排序或去重。
//
// 這份是寫入用的嚴格版（entries: z.array(MatchHistoryEntrySchema)，單筆壞掉就整體
// safeParse 失敗）。讀取路徑若要做到「單筆壞不拖垮整份」的兩段式降級，需要的是
// entries: z.array(z.unknown()) 這種寬鬆外層容器再逐筆 safeParse——與這裡嚴格版
// 無法互換。兩者的關係留待建立 round-storage.ts 時一併決定，不要讓外層容器演化成
// 兩份互不相干的定義（design 文件的 Goals 已定調 Round／MatchHistoryEntry 這兩份
// schema 要一次定案、避免後續各自擴充造成破壞性遷移，外層容器不應例外）。
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
