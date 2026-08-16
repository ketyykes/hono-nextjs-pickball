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
	return { players: [], droppedCount: 0 };
}

function rosterReducer(state: RosterState, action: RosterAction): RosterState {
	switch (action.type) {
		case "HYDRATE":
			return { ...state, players: action.players, droppedCount: action.droppedCount };
		case "ADD_PLAYER":
			return {
				...state,
				players: addPlayerToRoster(state.players, action.input, {
					id: action.id,
					now: action.now,
				}),
			};
		case "UPDATE_PLAYER":
			return {
				...state,
				players: updatePlayerInRoster(state.players, action.id, action.patch),
			};
		case "REMOVE_PLAYER":
			return { ...state, players: removePlayerFromRoster(state.players, action.id) };
		case "TOGGLE_ACTIVE":
			return { ...state, players: togglePlayerActiveInRoster(state.players, action.id) };
		case "RESET":
			return createInitialState();
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
	// 重置後 state.players 會變成新的空陣列，觸發 write effect 把 `{version:1,players:[]}`
	// 寫回去——那會讓剛被 resetMatchmakerData() 移除的 key 立刻復活，違反 spec
	// 「確認重置後該 key 已從 LocalStorage 移除」。故重置時標記跳過下一次寫入。
	const skipNextWriteRef = useRef(false);

	useEffect(() => {
		if (!hasHydratedRef.current) return;
		if (skipNextWriteRef.current) {
			skipNextWriteRef.current = false;
			return;
		}
		writeRoster(state.players);
	}, [state.players]);

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
		skipNextWriteRef.current = true;
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
