// 評分更新函式。預測勝率、有效 K 值、批次更新都在此，純函式、無狀態、不涉及選手持久化。
// 不 import candidates.ts 或 roster.ts 模組，避免評分邏輯被消費端選人決策耦合。

import { RATING_D, RATING_K_BASE, K_DECAY_GAMES, type RatingUpdateInput, type RatingUpdateResult, type RatingChange } from "./rating-types";
import { roundRating } from "./rating-math";

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

// 更新評分：輸入一場對戰的雙方與結果，回傳各球員的分數變動與預測勝率。
// 單打路徑：逐人計算 K_eff，共用同一個預測勝率 E，變動方向必定相反（零和的結構保證）。
// 雙打路徑：取隊伍平均 rating 計算 E，但逐人套用自己的 K_eff（design Decision 3）。
export function updateRatings(input: RatingUpdateInput): RatingUpdateResult {
	const { teams, winnerIndex } = input;
	const [teamA, teamB] = teams;

	// 計算兩隊平均評分
	const avgRatingA = teamA.reduce((sum, p) => sum + p.rating, 0) / teamA.length;
	const avgRatingB = teamB.reduce((sum, p) => sum + p.rating, 0) / teamB.length;

	// 計算預測勝率：teamA 的 E
	const expectedScoreA = expectedScore(avgRatingA, avgRatingB);
	const expectedScoreB = 1 - expectedScoreA;

	// 構造 changes 清單（依隊伍順序攤平）
	const changes: RatingChange[] = [];

	for (let teamIndex = 0; teamIndex < 2; teamIndex++) {
		const team = teamIndex === 0 ? teamA : teamB;
		const e = teamIndex === 0 ? expectedScoreA : expectedScoreB;
		const s = winnerIndex === teamIndex ? 1 : 0;

		for (const player of team) {
			const kEff = effectiveK(player.gamesPlayed);
			const before = player.rating;
			const after = roundRating(before + kEff * (s - e));
			const delta = roundRating(after - before);

			changes.push({
				id: player.id,
				before,
				after,
				delta,
				atUpperBound: false,
				atLowerBound: false,
				clamped: false,
			});
		}
	}

	return {
		changes,
		expectedScores: [expectedScoreA, expectedScoreB],
	};
}
