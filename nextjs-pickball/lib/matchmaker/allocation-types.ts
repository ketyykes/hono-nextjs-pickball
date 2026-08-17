// 分配引擎的型別與常數骨架。純型別與 as const 常數，無執行期邏輯、無函式。
// openspec/config.yaml 的 TDD 例外清單只列 *.d.ts、next-env.d.ts、cloudflare-env.d.ts，不含本檔——
// 本檔免測的依據不是援引該清單，而是 config.yaml 主句「對……下所有具備行為邏輯的模組採通用 TDD」：
// 本檔無函式，本來就不在 TDD 適用範圍內（design Decision 2）。
// 常數的對外可觀察值改在 candidates.test.ts 斷言，因為該檔是這些常數的消費端。

import type { Player } from "./types";

/**
 * 對戰方式：單打或雙打。系統 SHALL NOT 提供以性別篩選出場人選的模式，候選池只有一個。
 * codebase 另有 lib/scoreboard/types.ts 的 Mode（同為 "singles" | "doubles"），
 * 但分屬不同 capability、語意不同——scoreboard 的 Mode 影響發球規則，與人數無關，不要合併。
 */
export type MatchFormat = "singles" | "doubles";

/** 雙打組成的事後標示，純顯示用途，不參與選人或配對決策。 */
export type DoublesComposition = "mens" | "womens" | "mixed" | "general";

/** 一支隊伍：單打 1 人、雙打 2 人，rating 為隊內成員 rating 的總和（單打即為該員 rating）。 */
export interface Team {
	readonly players: readonly Player[];
	readonly rating: number;
}

interface MatchBase {
	readonly courtNumber: number;
	readonly teams: readonly [Team, Team];
}

/**
 * 一場對戰：場地編號、兩支隊伍、對戰方式；doublesComposition 僅雙打場次帶有。
 * 以 discriminated union 表達，而非 optional 欄位——單打場次 MUST 不帶此標示、
 * 雙打場次 MUST 帶有，兩者皆為編譯期保證，不靠執行期檢查（design Decision 1 的同一哲學）。
 */
export type Match =
	| (MatchBase & { readonly format: "singles"; readonly doublesComposition?: never })
	| (MatchBase & { readonly format: "doubles"; readonly doublesComposition: DoublesComposition });

/** 一輪分配的結果：本輪產生的所有對戰，以及未被選中出場的休息名單。 */
export interface RoundAllocation {
	readonly matches: readonly Match[];
	readonly resting: readonly Player[];
}

/**
 * 重複配對簽章索引：隊友組合、交叉對手組合、完整比賽組合三類。
 * 每個元素為排序後 player id 以分隔符串接成的字串（見 duplication.ts 的
 * teammateKeys／opponentKeys／fullMatchKeys，design Decision 4）。
 * 三個欄位型別為 ReadonlySet<string> 而非陣列：Set 天然去重（陣列允許重複條目，
 * 第 3 段逐輪 append 時會無界成長並被寫進 LocalStorage），且做 O(1) 比對。
 * 持久化時另以字串陣列表示，由第 3 段在讀取 LocalStorage 時轉換為 Set、寫回前轉換回陣列；
 * 序列化需求屬於第 3 段的持久化格式，不屬本介面（本介面用於 in-memory 查詢）。
 */
export interface SignatureIndex {
	readonly teammateKeys: ReadonlySet<string>;
	readonly opponentKeys: ReadonlySet<string>;
	readonly fullMatchKeys: ReadonlySet<string>;
}

/** 首輪無歷史紀錄時的具名錨點：三個欄位皆為空 Set。 */
export const EMPTY_SIGNATURE_INDEX: SignatureIndex = {
	teammateKeys: new Set(),
	opponentKeys: new Set(),
	fullMatchKeys: new Set(),
};

/** allocateRound() 的輸入，為函式引數而非持久化紀錄，不受「輸出須可序列化」的約束。 */
export interface AllocationInput {
	readonly players: readonly Player[];
	readonly format: MatchFormat;
	readonly courtCount: number;
	readonly seenSignatures: SignatureIndex;
}

/** 預設對戰方式：單打（prd.md 15）。 */
export const DEFAULT_FORMAT = "singles" satisfies MatchFormat;

/** 預設場地數：1。 */
export const DEFAULT_COURT_COUNT = 1;

/** 場地數合法範圍下限（含）。 */
export const MIN_COURT_COUNT = 1;

/** 場地數合法範圍上限（含）。 */
export const MAX_COURT_COUNT = 8;

/** 各對戰方式每場所需人數，唯一人數來源——其他模組不得另行寫死 2／4。 */
export const PLAYERS_PER_MATCH = {
	singles: 2,
	doubles: 4,
} as const satisfies Record<MatchFormat, number>;
