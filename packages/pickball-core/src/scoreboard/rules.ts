import type { ScoreboardState, ServeSide, Team, TargetScore } from "./types";

// 發球位置：發球方當局分數偶數 → 右場，奇數 → 左場
export function getServeSide(servingTeamScore: number): ServeSide {
	return servingTeamScore % 2 === 0 ? "right" : "left";
}

// 勝利判定：任一方達目標分數且差距 ≥ 2（延長賽持續到差距 ≥ 2，不設分數上限）。
// targetScore 為必填參數且刻意不給預設值——給了預設值會讓漏傳的呼叫點靜默退回 11 分制，
// 且既有測試會直接通過而失去 TDD 紅燈（見 design.md Decision 3）。
export function isGameWon(
	scores: { us: number; them: number },
	targetScore: TargetScore,
): {
	won: boolean;
	winner: Team | null;
} {
	const { us, them } = scores;
	const max = Math.max(us, them);
	if (max < targetScore) return { won: false, winner: null };
	const diff = Math.abs(us - them);
	if (diff < 2) return { won: false, winner: null };
	return { won: true, winner: us > them ? "us" : "them" };
}

// 套用一次 rally 結果，回傳更新後 state（不變更傳入物件）
export function applyRallyResult(
	state: ScoreboardState,
	rallyWinner: Team,
): ScoreboardState {
	// 發球方贏 → 該方 +1
	if (rallyWinner === state.servingTeam) {
		return {
			...state,
			scores: { ...state.scores, [rallyWinner]: state.scores[rallyWinner] + 1 },
			isFirstServiceOfGame: false,
		};
	}
	// 接發方贏
	// 雙打 + 非開賽起手 + 目前是 #1 → 同隊 #2 接手
	if (
		state.mode === "doubles" &&
		!state.isFirstServiceOfGame &&
		state.serverNumber === 1
	) {
		return {
			...state,
			serverNumber: 2,
			isFirstServiceOfGame: false,
		};
	}
	// 其餘情況 → side-out
	return {
		...state,
		servingTeam: rallyWinner,
		serverNumber: 1,
		isFirstServiceOfGame: false,
	};
}
