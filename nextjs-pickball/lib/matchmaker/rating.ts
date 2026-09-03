// 評分更新函式。預測勝率、有效 K 值、批次更新都在此，純函式、無狀態、不涉及選手持久化。
// 不 import candidates.ts 或 roster.ts 模組，避免評分邏輯被消費端選人決策耦合。

import { RATING_D, RATING_K_BASE, K_DECAY_GAMES, RATING_MIN, RATING_MAX } from "./rating-types";
import { PLAYERS_PER_MATCH } from "./allocation-types";
import { roundRating } from "./rating-math";
import { FORMAT_LABEL } from "./labels";
import type { RatingChange, RatingPlayerInput, RatingUpdateInput, RatingUpdateResult, Side } from "./rating-types";
import type { MatchFormat } from "./allocation-types";

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
// 邊界處理順序為先四捨五入至兩位小數、再 clamp 於 RATING_MIN～RATING_MAX（design Decision 5）：
// 若先 clamp 再 round，理論值 8.0049 會被判定為「被夾值」——但它捨入後本來就是 8.00，
// 使用者一分都沒少拿，M5 卻會誤報「已被上限截斷」的提示；先 round 再 clamp 則只有真正損失分數的情況才標記。
// delta 由夾值後的 after 重算而非使用理論值（design Decision 6）：
// 8.0 - 7.95 在 IEEE754 下是 0.04999999999999982，直接用浮點差的結果不再是兩位小數的表示，
// 需再過一次 roundRating 正規化回兩位小數（rating 的表示契約）。
// 回傳該球員的變動紀錄，包含三個邊界旗標（語意分歧見 rating-types.ts 的 RatingChange 說明）。
function applyDelta(player: RatingPlayerInput, s: number, e: number): RatingChange {
	const kEff = effectiveK(player.gamesPlayed);
	const before = player.rating;
	const theoreticalAfter = before + kEff * (s - e);
	const roundedAfter = roundRating(theoreticalAfter);

	const clampedAfter = Math.max(RATING_MIN, Math.min(RATING_MAX, roundedAfter));

	const delta = roundRating(clampedAfter - before);

	const atUpperBound = clampedAfter === RATING_MAX;
	const atLowerBound = clampedAfter === RATING_MIN;
	const clamped = roundedAfter > RATING_MAX || roundedAfter < RATING_MIN;

	return {
		id: player.id,
		before,
		after: clampedAfter,
		delta,
		atUpperBound,
		atLowerBound,
		clamped,
	};
}

// 生成驗證錯誤訊息。人數、rating、gamesPlayed 三條訊息共用此句型，集中維護全形標點與固定句尾對齊 allocation.ts 格式；
// 重複 id 那條刻意繞過此 helper，因為它的對象不是使用者調整輸入，而是 M4 上游接線錯誤的警報，
// 句型改為「請檢查輸入」而非「請調整後再試」才能正確傳達語意。
function createValidationError(requirement: string, actual: string | number): Error {
	return new Error(`${requirement}，請調整後再試一次（目前輸入：${actual}）。`);
}

// 驗證輸入資料。四類檢查共用同一組走訪以確保只走一趟，避免分散成四個函式各走訪一遍。
function assertValidInput(format: MatchFormat, teams: readonly [Side, Side], playersPerTeam: number): void {
	const ids = new Set<string>();

	for (const team of teams) {
		// 人數錯了不擋，updateRatings 算隊伍平均分時用的 sum / playersPerTeam 中，
		// playersPerTeam 是從 format 推導出的固定常數，不會因為實際塞了幾人而跟著變動，
		// 分子分母對不上，隊伍平均就被悄悄算錯——不會拋錯、也不會出現 NaN，錯得無聲無息。
		if (team.length !== playersPerTeam) {
			throw createValidationError(
				`對戰方式為「${FORMAT_LABEL[format]}」時，隊伍人數需為 ${playersPerTeam} 人`,
				`${team.length} 人`
			);
		}

		for (const player of team) {
			// 8.01 這種越界值若不在此擋下，applyDelta 的 clamp 邏輯會把它當成一場比賽打到觸頂
			// 一樣處理，照樣夾回 8.00 並標記 clamped: true——這個旗標的本意是給 M5 顯示「已達上限」，
			// 但這裡的觸界其實是名單資料本來就壞了，不是這場對戰真的把分數推到邊界。
			if (player.rating < RATING_MIN || player.rating > RATING_MAX) {
				throw createValidationError(
					`rating 需為 ${RATING_MIN} 到 ${RATING_MAX} 之間的數值`,
					player.rating
				);
			}

			// 負值會讓 effectiveK 的 K_DECAY_GAMES / (K_DECAY_GAMES + gamesPlayed)
			// 在 gamesPlayed = -K_DECAY_GAMES 時除以零，K_eff 變成 Infinity；
			// 非整數會算出現實中不可能的中間 K_eff（沒有人打了 1.5 場）。
			if (!Number.isInteger(player.gamesPlayed) || player.gamesPlayed < 0) {
				throw createValidationError(
					"gamesPlayed 需為非負整數",
					player.gamesPlayed
				);
			}

			// 重複 id 不是使用者會自然打出的輸入，而是上游配對（M4）的接線錯誤：
			// 把同一人分進兩隊、或同一隊塞進同一位置兩次。若不擋，該員會在 changes 裡出現兩筆，
			// M4 依 id 寫回分數時後者會靜默覆蓋前者。
			if (ids.has(player.id)) {
				throw new Error(
					`同一場不得出現重複的 player id，請檢查輸入（重複 id：${player.id}）。`
				);
			}
			ids.add(player.id);
		}
	}
}

// 更新評分：輸入一場對戰的雙方與結果，回傳各球員的分數變動與預測勝率。
// 單打與雙打共用同一條路徑：單打即每隊 1 人的特例，此時隊伍平均等於該員 rating。
// 每隊人數由 format 推導自 PLAYERS_PER_MATCH（design Decision 9）——不得另行寫死 1 或 2。
// 逐人計算 K_eff（design Decision 3），共用隊伍層級的預測勝率 E，變動方向必定相反（零和結構保證）。
export function updateRatings(input: RatingUpdateInput): RatingUpdateResult {
	const { format, teams, winnerIndex } = input;

	const playersPerTeam = PLAYERS_PER_MATCH[format] / 2;

	// 驗證必須先於下方任何 reduce 與算術，否則越界或非整數輸入會先算出 NaN 或 Infinity，
	// 錯誤訊息會指向計算結果而不是真正的壞輸入。
	assertValidInput(format, teams, playersPerTeam);

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
