// hooks/useRosterStore.ts
"use client";

import { useEffect, useReducer, useRef } from "react";
import {
	addPlayer as addPlayerToRoster,
	updatePlayer as updatePlayerInRoster,
	removePlayer as removePlayerFromRoster,
	togglePlayerActive as togglePlayerActiveInRoster,
} from "@/lib/matchmaker/roster";
import type { AddPlayerInput, UpdatePlayerPatch } from "@/lib/matchmaker/roster";
import { readRoster, writeRoster, resetMatchmakerData } from "@/lib/matchmaker/storage";
import type { Player } from "@/lib/matchmaker/types";

// 名單 store 的 state 形狀。
// droppedCount：讀取持久化資料時被逐筆降級丟棄的筆數（見 storage 的 Decision 3），
// 供 UI 提示「有 N 筆資料損毀已略過」，SHALL NOT 靜默處理。
interface RosterState {
	players: Player[];
	droppedCount: number;
	// 本次 state 是否應跳過持久化。只有 RESET 會設 true——重置剛把 key 移除，
	// 若讓 write effect 把空名單寫回去，那個 key 會立刻復活。
	//
	// 這個意圖刻意放在 reducer state 而非 ref 旗標：React automatic batching 下，
	// 同一個 handler 內連續呼叫 resetRoster() 與 addPlayer() 會合併成單次 render，
	// 一次性旗標會被 RESET 設下卻不被後續 action 復位，導致該次寫入被整批跳過
	// （記憶體有資料、localStorage 是空的，此刻重整即靜默丟失）。
	// 折進 state 後，批次內的多個 action 會被依序 reduce，最後一個 action 的決定
	// 自然覆蓋前面的，不需要另外處理批次合併。
	skipPersist: boolean;
}

// HYDRATE：mount 後把 localStorage 讀到的名單灌入 state，
// 避免 SSR/CSR 首次輸出不一致（見 design Decision 8，沿用 useScoreboardStore 的模式）。
// ADD_PLAYER：委派給 lib/matchmaker/roster.ts 的純函式，id／now 由本層注入（design Decision 4）。
type RosterAction =
	| { type: "HYDRATE"; players: Player[]; droppedCount: number }
	| { type: "ADD_PLAYER"; input: AddPlayerInput; id: string; now: string }
	| { type: "UPDATE_PLAYER"; id: string; patch: UpdatePlayerPatch }
	| { type: "REMOVE_PLAYER"; id: string }
	| { type: "TOGGLE_ACTIVE"; id: string }
	| { type: "RESET" };

function createInitialState(): RosterState {
	return { players: [], droppedCount: 0, skipPersist: false };
}

// 每個 case 都明確設定 skipPersist：只有 RESET 為 true，其餘一律 false。
// 「其餘一律 false」是這個設計的關鍵——它讓批次合併時後續 action 能覆蓋 RESET 的決定。
function rosterReducer(state: RosterState, action: RosterAction): RosterState {
	switch (action.type) {
		case "HYDRATE":
			return {
				...state,
				players: action.players,
				droppedCount: action.droppedCount,
				skipPersist: false,
			};
		case "ADD_PLAYER":
			return {
				...state,
				players: addPlayerToRoster(state.players, action.input, {
					id: action.id,
					now: action.now,
				}),
				skipPersist: false,
			};
		case "UPDATE_PLAYER":
			return {
				...state,
				players: updatePlayerInRoster(state.players, action.id, action.patch),
				skipPersist: false,
			};
		case "REMOVE_PLAYER":
			return {
				...state,
				players: removePlayerFromRoster(state.players, action.id),
				skipPersist: false,
			};
		case "TOGGLE_ACTIVE":
			return {
				...state,
				players: togglePlayerActiveInRoster(state.players, action.id),
				skipPersist: false,
			};
		case "RESET":
			return { ...createInitialState(), skipPersist: true };
		default:
			return state;
	}
}

export interface UseRosterStoreResult {
	players: Player[];
	/** 讀取持久化資料時被丟棄的損壞筆數，> 0 時 UI 需提示使用者。 */
	droppedCount: number;
	addPlayer: (input: AddPlayerInput) => void;
	updatePlayer: (id: string, patch: UpdatePlayerPatch) => void;
	removePlayer: (id: string) => void;
	togglePlayerActive: (id: string) => void;
	resetRoster: () => void;
}

// 整合 reducer 與 localStorage，比照 useScoreboardStore 的 write/read effect 順序與
// hasHydratedRef 守門模式：write effect 放前面（mount 時 ref=false 故跳過）、
// read/hydrate effect 放後面（讀取後視情況 dispatch HYDRATE，最後把 ref 設 true）。
// 避免 read 前就被 write effect 用初始（空）state 覆蓋 localStorage 的競態。
export function useRosterStore(): UseRosterStoreResult {
	const [state, dispatch] = useReducer(
		rosterReducer,
		undefined,
		(_arg: undefined) => createInitialState(),
	);
	const hasHydratedRef = useRef(false);

	useEffect(() => {
		if (!hasHydratedRef.current) return;
		// 重置剛把 key 移除，此時不可把空名單寫回去讓它復活（見 RosterState.skipPersist）。
		if (state.skipPersist) return;
		writeRoster(state.players);
	}, [state.players, state.skipPersist]);

	useEffect(() => {
		const { players, droppedCount } = readRoster();
		// 沒有持久化資料時不 dispatch，避免無意義的 state 參考變動
		// （呼應 useScoreboardStore 的 `if (loaded) dispatch(...)` 寫法）。
		// droppedCount > 0 也要 dispatch——即使所有筆數都損壞（players 為空），
		// UI 仍需知道「有資料被丟棄」才能提示使用者。
		if (players.length > 0 || droppedCount > 0) {
			dispatch({ type: "HYDRATE", players, droppedCount });
		}
		hasHydratedRef.current = true;
		return () => {
			// React Strict Mode 下 dev 會 unmount 再重新 mount，重置 ref 使下一次 mount
			// 的 write effect 不會以初始（空）state 覆蓋 localStorage。
			hasHydratedRef.current = false;
		};
	}, []);

	function addPlayer(input: AddPlayerInput): void {
		dispatch({
			type: "ADD_PLAYER",
			input,
			id: crypto.randomUUID(),
			now: new Date().toISOString(),
		});
	}

	function updatePlayer(id: string, patch: UpdatePlayerPatch): void {
		dispatch({ type: "UPDATE_PLAYER", id, patch });
	}

	function removePlayer(id: string): void {
		dispatch({ type: "REMOVE_PLAYER", id });
	}

	function togglePlayerActive(id: string): void {
		dispatch({ type: "TOGGLE_ACTIVE", id });
	}

	// 委派 resetMatchmakerData() 而非 clearRoster()：前者清除 RESET_KEYS 列舉的所有 key，
	// M2／M6 把 rounds 與 history 加進該清單後，本函式不需改動（見 storage 的 Decision 6）。
	function resetRoster(): void {
		resetMatchmakerData();
		dispatch({ type: "RESET" });
	}

	return {
		players: state.players,
		droppedCount: state.droppedCount,
		addPlayer,
		updatePlayer,
		removePlayer,
		togglePlayerActive,
		resetRoster,
	};
}
