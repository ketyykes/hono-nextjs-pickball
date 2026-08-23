// 評分模組的型別與常數骨架。純型別與常數，無執行期邏輯、無函式。
// openspec/config.yaml 的 TDD 例外清單只列 *.d.ts、next-env.d.ts、cloudflare-env.d.ts，不含本檔——
// 本檔免測的依據不是援引該清單，而是 config.yaml 主句「對……下所有具備行為邏輯的模組採通用 TDD」：
// 本檔無函式，本來就不在 TDD 適用範圍內（design Decision 1）。
// 常數的對外可觀察值改在 rating.test.ts 斷言，因為該檔是這些常數的消費端。

import type { MatchFormat } from "./allocation-types";

/** 級距常數 D：分差與預測勝率的轉換係數（prd.md 6.4.2）。 */
export const RATING_D = 3.0;

/** 基礎幅度常數 K_base：評分變動的基準倍率（prd.md 6.4.2）。 */
export const RATING_K_BASE = 0.15;

/** 評分下限（prd.md 6.4.6）。 */
export const RATING_MIN = 1;

/** 評分上限（prd.md 6.4.6）。 */
export const RATING_MAX = 8;

/**
 * K 遞減錨點常數（prd.md 6.4.3）：K_eff = K_base × (1 + K_DECAY_GAMES / (K_DECAY_GAMES + 累計出場次數))。
 * 在 0 場時 K 為 2 倍，20 場時降為 1.5 倍，長期趨近 1 倍。
 * 此常數同時出現在分子與分母，是遞減曲線的尺度錨點，而非「超過此場數才開始遞減」的門檻。
 */
export const K_DECAY_GAMES = 20;

/**
 * 單一選手的評分輸入：id、目前評分、出賽場數。
 * 選擇此最小集合而非整個 Player 物件，以避免測試案例雜訊、降低 schema 演進耦合、
 * 防止誤用 Team.rating（design Decision 2）。
 */
export interface RatingPlayerInput {
	readonly id: string;
	readonly rating: number;
	readonly gamesPlayed: number;
}

/**
 * 一支隊伍：隊內選手清單（由 PLAYERS_PER_MATCH[format] / 2 推導出的 1 人或 2 人）。
 * Side 與 allocation-types.ts 的 Team 不可互換：
 * Side 無 rating 加總欄位，帶 gamesPlayed；Team.rating 是隊內各選手 rating 的加總，
 * 而評分計算要用隊伍的平均評分（design Decision 2）。
 */
export type Side = readonly RatingPlayerInput[];

/**
 * 評分更新的單場輸入。
 * format 指定對戰方式（單打或雙打）。
 * teams 為兩支隊伍各自的選手清單，以 [隊伍 A, 隊伍 B] 的順序排列。
 * winnerIndex 表勝隊的索引：0 = 隊伍 A 勝、1 = 隊伍 B 勝，與 teams 的順序對應。
 */
export interface RatingUpdateInput {
	readonly format: MatchFormat;
	readonly teams: readonly [Side, Side];
	readonly winnerIndex: 0 | 1;
}

/**
 * 單名選手的賽後評分變動紀錄。
 * id 為選手識別碼。before 為賽前評分，after 為賽後評分（已四捨五入）。
 * delta 為評分變動（計算為 after 減 before，亦已四捨五入；負值表扣分）；
 * 是重算結果而非理論值（design Decision 6），過程亦涉及四捨五入。
 *
 * 旗標語意分歧需特別注意（design Decision 7）：
 * - atUpperBound：賽後分數等於 RATING_MAX（8.00），不論本場有無被夾，只要停在界上即為 true
 * - atLowerBound：賽後分數等於 RATING_MIN（1.00），不論本場有無被夾，只要停在界上即為 true
 * - clamped：本場的理論值超出 [RATING_MIN, RATING_MAX] 範圍而被截斷，代表本場少拿了分數
 * 例如理論值 8.0049 四捨五入後為 8.00 者，atUpperBound = true 但 clamped = false；
 * 理論值 8.15 被夾至 8.00 者，兩者皆 true。
 */
export interface RatingChange {
	readonly id: string;
	readonly before: number;
	readonly after: number;
	readonly delta: number;
	readonly atUpperBound: boolean;
	readonly atLowerBound: boolean;
	readonly clamped: boolean;
}

/**
 * 評分更新結果：所有參賽者的變動紀錄，以及雙方預測勝率。
 * changes 包含本場所有參賽者的評分變動紀錄陣列。
 * expectedScores 為該場對賽的雙方預測勝率，陣列長度恆為 2：
 * 索引 0 = 隊伍 A 的預測勝率、索引 1 = 隊伍 B 的預測勝率，對應輸入的 teams 順序。
 */
export interface RatingUpdateResult {
	readonly changes: readonly RatingChange[];
	readonly expectedScores: readonly [number, number];
}
