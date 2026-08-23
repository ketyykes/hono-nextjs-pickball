// 評分更新函式。預測勝率、有效 K 值、批次更新都在此，純函式、無狀態、不涉及選手持久化。
// 不 import candidates.ts 或 roster.ts 模組，避免評分邏輯被消費端選人決策耦合。

import { RATING_D, RATING_K_BASE, K_DECAY_GAMES } from "./rating-types";
import { PLAYERS_PER_MATCH } from "./allocation-types";
import { roundRating } from "./rating-math";
import type { RatingChange, RatingPlayerInput, RatingUpdateInput, RatingUpdateResult } from "./rating-types";

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

// 計算單一球員的評分變動。逐人套用自己的 K_eff（design Decision 3），
// 允許同隊兩人若出場次數不同時有不同變動幅度。
// s = 該隊是否獲勝（1 或 0），e = 該隊的預測勝率（由隊伍層級計算、於此處套用在個人身上）。
// 回傳該球員的變動紀錄；旗標在本階段全部回傳 false，後續 task（§6）在此處加入 clamp 邏輯。
function applyDelta(player: RatingPlayerInput, s: number, e: number): RatingChange {
	const kEff = effectiveK(player.gamesPlayed);
	const before = player.rating;
	const after = roundRating(before + kEff * (s - e));
	const delta = roundRating(after - before);

	return {
		id: player.id,
		before,
		after,
		delta,
		atUpperBound: false,
		atLowerBound: false,
		clamped: false,
	};
}

// 更新評分：輸入一場對戰的雙方與結果，回傳各球員的分數變動與預測勝率。
// 單打與雙打共用同一條路徑：單打即每隊 1 人的特例，此時隊伍平均等於該員 rating。
// 每隊人數由 format 推導自 PLAYERS_PER_MATCH（design Decision 9）——不得另行寫死 1 或 2。
// 逐人計算 K_eff（design Decision 3），共用隊伍層級的預測勝率 E，變動方向必定相反（零和結構保證）。
export function updateRatings(input: RatingUpdateInput): RatingUpdateResult {
	const { format, teams, winnerIndex } = input;

	const playersPerTeam = PLAYERS_PER_MATCH[format] / 2;

	// 計算兩隊平均評分而非加總：rating-types.ts 的 Side 與 allocation-types.ts 的 Team 不可互換。
	// Team.rating 是隊內各選手 rating 的加總，但預測勝率 E 需要隊伍的平均評分（design Decision 2）。
	// 用加總計算 E 會把級距分差悄悄放大成兩倍——不會拋錯、也不會越界，只會靜默失真，用平均來規避。
	const avgRatingA = teams[0].reduce((sum, p) => sum + p.rating, 0) / playersPerTeam;
	const avgRatingB = teams[1].reduce((sum, p) => sum + p.rating, 0) / playersPerTeam;

	// 預測勝率用 1 - E 而非 expectedScore(B, A)：同場對賽的雙方共用同一個 E 是零和結構保證
	// （design Decision 4）的必要條件。浮點誤差下 expectedScore(3,6) ≠ 1 - expectedScore(6,3)
	// （IEEE754 下分別為 0.09090909090909091 與 0.09090909090909094），用 1 - E_A 能保持完全對稱。
	// 這一行最容易被順手改成 expectedScore(avgRatingB, avgRatingA) 形式而破壞零和特性——註解在此預防。
	const expectedScoreA = expectedScore(avgRatingA, avgRatingB);
	const expectedScores: readonly [number, number] = [expectedScoreA, 1 - expectedScoreA];

	// 依隊伍順序遍歷每位球員並計算評分變動。changes 清單維持「第一隊的球員在前」的順序
	// （spec Requirement: 單打評分更新 / Scenario: 輸出形狀與順序）——後續 task 的持久化與顯示會依序用到。
	const changes: RatingChange[] = [];

	for (const teamIndex of [0, 1] as const) {
		const team = teams[teamIndex];
		const e = expectedScores[teamIndex];
		const s = winnerIndex === teamIndex ? 1 : 0;

		for (const player of team) {
			changes.push(applyDelta(player, s, e));
		}
	}

	return {
		changes,
		expectedScores,
	};
}
