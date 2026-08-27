import type { Action, Mode, MatchSettings, ScoreboardState, Team, TargetScore } from "./types";
import { applyRallyResult, isGameWon } from "./rules";

/**
 * 建立記分板的初始狀態（immutable factory）。
 *
 * 雙打規則：先發球隊的第一位發球員從「2 號伺服員」開始，
 * 且 isFirstServiceOfGame=true 代表本局第一次換邊發球時不換人。
 * 單打規則：直接從 1 號發球員開始，無特殊規則。
 */
export function createInitialState(
	overrides: Partial<MatchSettings> = {},
): ScoreboardState {
	const mode: Mode = overrides.mode ?? "doubles";
	const firstServer: Team = overrides.firstServer ?? "us";
	const targetScore: TargetScore = overrides.targetScore ?? 11;
	const isDoubles = mode === "doubles";

	return {
		mode,
		scores: { us: 0, them: 0 },
		servingTeam: firstServer,
		// 雙打：2 號伺服員起手；單打：1 號伺服員起手
		serverNumber: isDoubles ? 2 : 1,
		// 雙打才有「本局第一發」的特殊規則
		isFirstServiceOfGame: isDoubles,
		history: [],
		status: "setup",
		winner: null,
		firstServer,
		targetScore,
	};
}

// 從 state 取出三項賽前設定，供重建初始狀態時原樣帶入
function settingsOf(state: ScoreboardState): MatchSettings {
	return {
		mode: state.mode,
		firstServer: state.firstServer,
		targetScore: state.targetScore,
	};
}

/**
 * 記分板 reducer：處理 setup toggle、rally 計分、undo、reset、hydrate。
 */
export function scoreboardReducer(
	state: ScoreboardState,
	action: Action,
): ScoreboardState {
	switch (action.type) {
		case "SET_MODE": {
			// playing/finished 階段不允許變更設定
			if (state.status !== "setup") return state;
			// 重新建立初始狀態，保留現有的先發球隊與目標分數設定
			return createInitialState({ ...settingsOf(state), mode: action.mode });
		}
		case "SET_FIRST_SERVER": {
			// playing/finished 階段不允許變更設定
			if (state.status !== "setup") return state;
			// 重新建立初始狀態，保留現有的模式與目標分數設定
			return createInitialState({ ...settingsOf(state), firstServer: action.team });
		}
		case "SET_TARGET_SCORE": {
			// playing/finished 階段、或已綁定對戰場次時皆不允許變更目標分數
			// （綁定場次的目標分數由該輪統一決定，setup 階段也不可調整）
			if (state.status !== "setup" || state.matchId !== null) return state;
			// 重新建立初始狀態，保留現有的模式與先發球隊設定
			return createInitialState({ ...settingsOf(state), targetScore: action.targetScore });
		}
		case "RALLY_WON": {
			if (state.status === "finished") return state;
			const afterRally = applyRallyResult(state, action.winner);
			// history 直接 push action 物件——action 已具備 ScoreEvent 形狀且為 immutable
			const newHistory = [...state.history, action];
			const { won, winner } = isGameWon(afterRally.scores, afterRally.targetScore);
			return {
				...afterRally,
				history: newHistory,
				// finished 已在開頭 guard return；此處只可能從 setup 或 playing 進入。
				// 未結束且原本為 setup → 轉 playing；其他情況維持原 status。
				status: won ? "finished" : state.status === "setup" ? "playing" : state.status,
				winner: won ? winner : null,
			};
		}
		case "UNDO": {
			// history 為空時不做任何事
			if (state.history.length === 0) return state;
			// 移除最後一筆 event，從初始狀態 replay 重建
			const newHistory = state.history.slice(0, -1);
			let rebuilt = createInitialState(settingsOf(state));
			for (const event of newHistory) {
				rebuilt = scoreboardReducer(rebuilt, event);
			}
			return rebuilt;
		}
		case "RESET": {
			return createInitialState(settingsOf(state));
		}
		case "HYDRATE": {
			return action.state;
		}
		default:
			return state;
	}
}
