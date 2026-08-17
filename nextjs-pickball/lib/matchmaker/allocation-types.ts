// 分配引擎的型別與常數骨架。純型別與 as const 常數，無執行期邏輯，
// 依 openspec/config.yaml 的 TDD 例外不建立對應測試檔（design Decision 2）。
// 常數的對外可觀察值改在 candidates.test.ts 斷言，因為該檔是這些常數的消費端。

import type { Player } from "./types";

/** 對戰方式：單打或雙打。系統 SHALL NOT 提供以性別篩選出場人選的模式，候選池只有一個。 */
export type MatchFormat = "singles" | "doubles";

/** 雙打組成的事後標示，純顯示用途，不參與選人或配對決策。 */
export type DoublesComposition = "mens" | "womens" | "mixed" | "general";

/** 一支隊伍：單打 1 人、雙打 2 人，rating 為隊內成員 rating 的總和（單打即為該員 rating）。 */
export interface Team {
	readonly players: readonly Player[];
	readonly rating: number;
}

/** 一場對戰：場地編號、兩支隊伍、對戰方式；doublesComposition 僅雙打場次帶有。 */
export interface Match {
	readonly courtNumber: number;
	readonly teams: readonly [Team, Team];
	readonly format: MatchFormat;
	readonly doublesComposition?: DoublesComposition;
}

/** 一輪分配的結果：本輪產生的所有對戰，以及未被選中出場的休息名單。 */
export interface RoundAllocation {
	readonly matches: readonly Match[];
	readonly resting: readonly Player[];
}

/**
 * 重複配對簽章索引：隊友組合、交叉對手組合、完整比賽組合三類，
 * 皆為排序後 player id 字串組成的陣列（見 duplication.ts 的 teammateKeys／opponentKeys／fullMatchKey）。
 * 選用陣列而非 Set，是為了確保 AllocationInput 全欄位皆可直接序列化（無 class 實例）。
 */
export interface SignatureIndex {
	readonly teammateKeys: readonly string[];
	readonly opponentKeys: readonly string[];
	readonly fullMatchKeys: readonly string[];
}

/** allocateRound() 的輸入。全部欄位皆可序列化（無函式、無 class 實例）。 */
export interface AllocationInput {
	readonly players: readonly Player[];
	readonly format: MatchFormat;
	readonly courtCount: number;
	readonly seenSignatures: SignatureIndex;
}

/** 預設對戰方式：單打（prd.md 15）。 */
export const DEFAULT_FORMAT: MatchFormat = "singles";

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
