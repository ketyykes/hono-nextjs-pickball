// 評分更新函式。預測勝率、有效 K 值、批次更新都在此，純函式、無狀態、不涉及選手持久化。
// 不 import candidates.ts 或 roster.ts 模組，避免評分邏輯被消費端選人決策耦合。

import { RATING_D, RATING_K_BASE, K_DECAY_GAMES } from "./rating-types";

/**
 * 計算預測勝率：輸入雙方的平均評分（雙打為隊伍平均），回傳前者的預測勝率。
 * 按 Elo 級距公式 E = 1 / (1 + 10^(-(Ra - Rb) / D)) 計算，
 * D = 3.0 時分差 0.5 約 60%、1.0 約 68%、2.0 約 82%、3.0 約 91%（prd.md 6.4.2）。
 * 同場對賽的雙方共用同一個 E：一方為 E、另一方為 1 - E（design Decision 4）。
 */
export function expectedScore(ratingA: number, ratingB: number): number {
	return 1 / (1 + 10 ** (-(ratingA - ratingB) / RATING_D));
}

// 依出場次數計算有效 K 值：新手變動幅度大，老手變動幅度小，鼓勵新手盡快收斂。
// 公式為 K_eff = K_base × (1 + K_DECAY_GAMES / (K_DECAY_GAMES + gamesPlayed))，
// 逐人計算，使得同隊兩人若出場次數不同可有不同變動幅度（design Decision 3）。
export function effectiveK(gamesPlayed: number): number {
	return RATING_K_BASE * (1 + K_DECAY_GAMES / (K_DECAY_GAMES + gamesPlayed));
}
