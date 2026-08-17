// 匹克球對戰分配機的賽後評分引擎。全部為純函式：不讀寫 LocalStorage、不含 React、
// 不管理回合狀態、不累加 gamesPlayed、不寫入 Player（spec Purpose；design Non-Goals）。
// 只回答一個問題——「這場比完之後，每個人的分數該變成多少」。
//
// 零和成立的三個條件（design Decision 2，delta spec Requirement「零和的適用範圍」）：
//   1. 參與者的 K_eff 全部相同（即 gamesPlayed 全部相同）
//   2. 無人撞上下限
//   3. 忽略四捨五入至兩位小數造成的殘差
// 任一條件不滿足時守恆即被破壞，這是 prd.md 6.4.3／6.4.5／6.4.6 彼此衝突的必然結果，非實作缺陷。
//
// 本批次（第 1 批）只實作預測勝率、K 遞減、單打賽後更新。雙打路徑（§5）、clamp 與撞邊界
// 標記（§6）、零和觀測（§7）、無狀態驗證（§8）留待後續批次；`clamped` 欄位在本批次恆為
// `"none"`，由 §6 補上真正的判定邏輯。

import { roundRating } from "./rating-math";
import type { Player } from "./types";

/**
 * 預測勝率公式的分差校準常數（`prd.md` 6.4.2）。
 * 標準 Elo 用 400，是為西洋棋 1500 分級距設計；套在本產品 1～8 的尺度上會使預測勝率
 * 退化為約 51%（毫無鑑別度），故重新校準為 3.0。SHALL NOT 改用標準 Elo 的 400。
 */
export const RATING_D = 3.0;

/** 基礎 K 值：出場次數趨近無限大時，單場變動幅度的漸近下界（`prd.md` 6.4.1／6.4.3）。 */
export const K_BASE = 0.15;

/**
 * K 遞減公式的分母常數：`K_eff = K_base × (1 + K_DECAY_GAMES / (K_DECAY_GAMES + gamesPlayed))`
 * （`prd.md` 6.4.3）。
 */
export const K_DECAY_GAMES = 20;

/** 分數下限（含）。 */
export const MIN_RATING = 1.0;

/** 分數上限（含）。 */
export const MAX_RATING = 8.0;

/**
 * 撞邊界標記：本批次恆為 `"none"`，clamp 與真正的判定邏輯由 §6 補上
 * （design Decision 4：只回 `after` 不足以讓 UI 判讀「撞到邊界」與「結果剛好為零」的差異）。
 */
export type ClampFlag = "none" | "at-max" | "at-min";

/** 單一球員的一筆評分變動（design Decision 4）。 */
export interface RatingChange {
	/** 該員的 id，供歷史紀錄直接取用（`prd.md` 8.2）。 */
	readonly playerId: string;
	/** 賽前分數。 */
	readonly before: number;
	/** 賽後分數，已經 `roundRating` 取兩位小數，且本批次尚未 clamp（§6 補上）。 */
	readonly after: number;
	/** 實際生效的變動（`after − before`，在 round **之後**計算，design Decision 5）。 */
	readonly delta: number;
	/** clamp 前的理論變動量，保留完整精度（design Decision 4／5）。 */
	readonly rawDelta: number;
	/** 撞邊界標記，本批次恆為 `"none"`（§6 補上）。 */
	readonly clamped: ClampFlag;
}

/**
 * `updateRatings()` 的輸入：勝方與敗方球員陣列，而非 `match-allocation` 的 `Match`
 * 加勝方索引（design Decision 3）——評分與分配是兩個獨立 capability，比分可能來自
 * `/scoreboard`、手動輸入，甚至臨時換人代打的場次，不應強迫這些路徑先偽造一個 `Match`。
 */
export interface RatingUpdateInput {
	readonly winners: readonly Player[];
	readonly losers: readonly Player[];
}

/**
 * 計算 `ratingA` 相對於 `ratingB` 的預測勝率（`prd.md` 6.4.2）。
 * 中間結果不四捨五入（design Decision 5）——取整會讓誤差在公式內逐級放大。
 */
export function expectedScore(ratingA: number, ratingB: number): number {
	return 1 / (1 + 10 ** (-(ratingA - ratingB) / RATING_D));
}

/**
 * 計算單一球員的有效 K 值，依其自身 `gamesPlayed` 遞減（`prd.md` 6.4.3）。
 * MUST 取該員自己的 `gamesPlayed`，SHALL NOT 取隊伍平均或全場平均——
 * 取平均會讓新加入者在雙打中被老手拖慢收斂，設計目的即失效（design Decision 1）。
 * `gamesPlayed = 0` 時分母為 `K_DECAY_GAMES + 0 = K_DECAY_GAMES`，不會除以零。
 */
export function effectiveK(gamesPlayed: number): number {
	return K_BASE * (1 + K_DECAY_GAMES / (K_DECAY_GAMES + gamesPlayed));
}

/**
 * 計算單一球員的一筆評分變動：`rawDelta = K_eff(該員自己的 gamesPlayed) × sMinusE`。
 * `sMinusE` 是呼叫端算好的 `S − E`（勝方傳 `1 − E`、敗方傳 `0 − E`），讓單打與雙打
 * （§5，同隊兩人共用同一個 `S − E` 但各自套用自己的 `K_eff`）共用同一段計算（tasks 4.5）。
 * `clamped` 本批次恆為 `"none"`，clamp 由 §6 補上。
 */
function computePlayerChange(player: Player, sMinusE: number): RatingChange {
	const kEff = effectiveK(player.gamesPlayed);
	const rawDelta = kEff * sMinusE;
	const after = roundRating(player.rating + rawDelta);
	return {
		playerId: player.id,
		before: player.rating,
		after,
		delta: after - player.rating,
		rawDelta,
		clamped: "none", // clamp 與撞邊界標記由 §6 補上
	};
}

/**
 * 單打賽後更新（`prd.md` 6.4.1）：`Ra' = Ra + K_eff × (S - E)`。
 * 本批次僅實作單打路徑——只取 `winners`／`losers` 的第一位；雙打路徑（§5）留待後續批次。
 * `after` 經 `roundRating` 取兩位小數，`delta` 在 round **之後**計算，`rawDelta` 保留完整精度
 * （design Decision 5）。
 */
export function updateRatings(input: RatingUpdateInput): readonly RatingChange[] {
	const [winner] = input.winners;
	const [loser] = input.losers;

	const winnerExpected = expectedScore(winner.rating, loser.rating);

	return [computePlayerChange(winner, 1 - winnerExpected), computePlayerChange(loser, winnerExpected - 1)];
}
