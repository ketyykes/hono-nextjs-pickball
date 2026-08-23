// 評分模組的型別與常數骨架。純型別與常數，無執行期邏輯、無函式。
// 常數的對外可觀察值在 rating.test.ts 斷言。

import type { MatchFormat } from "./allocation-types";

/** 級距常數 D：分差與預測勝率的轉換係數（prd.md 6.4.2）。 */
export const RATING_D = 3.0;

/** 基礎幅度常數 K_base：評分變動的基準倍率（prd.md 6.4.2）。 */
export const RATING_K_BASE = 0.15;

/** 評分下限（prd.md 6.4.6）。 */
export const RATING_MIN = 1;

/** 評分上限（prd.md 6.4.6）。 */
export const RATING_MAX = 8;

/** K 遞減錨點：此場數後開始套用遞減係數（prd.md 6.4.3）。 */
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

/** 一支隊伍：隊內選手清單（1 人或 2 人，由對戰方式決定）。 */
export type Side = readonly RatingPlayerInput[];

/**
 * 評分更新的單場輸入。
 *
 * @property format 對戰方式（單打或雙打）
 * @property teams 兩支隊伍各自的選手清單，第 0 支為隊伍 A、第 1 支為隊伍 B
 * @property winnerIndex 勝隊索引：0 表隊伍 A 勝、1 表隊伍 B 勝
 */
export interface RatingUpdateInput {
	readonly format: MatchFormat;
	readonly teams: readonly [Side, Side];
	readonly winnerIndex: 0 | 1;
}

/**
 * 單名選手的賽後評分變動紀錄。
 *
 * @property id 選手 ID
 * @property before 賽前評分
 * @property after 賽後評分（已四捨五入）
 * @property delta 評分變動（後減前，已四捨五入；負值表扣分）
 * @property atUpperBound 賽後分數等於上限（8.00）
 * @property atLowerBound 賽後分數等於下限（1.00）
 * @property clamped 理論值被截斷（超出 [RATING_MIN, RATING_MAX] 範圍而被夾擠）
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
 *
 * @property changes 各選手的賽後評分與變動
 * @property expectedScores 雙方的預測勝率，長度恆為 2（索引 0 = 隊伍 A、索引 1 = 隊伍 B）
 */
export interface RatingUpdateResult {
	readonly changes: readonly RatingChange[];
	readonly expectedScores: readonly [number, number];
}
