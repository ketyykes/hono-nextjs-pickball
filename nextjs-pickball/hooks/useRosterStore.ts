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
import type { Player } from "@pickball/core/matchmaker/types";
import { useSession } from "@/hooks/useSession";
import { useRemoteRosterStore } from "@/hooks/useRemoteRosterStore";
import { resolveStorageMode } from "@/lib/sync/storage-mode";
import { localDataStatus, type DataStatus, type SyncStatus } from "@/lib/sync/sync-status";

// 名單 store 的 state 形狀。
// droppedCount：讀取持久化資料時被逐筆降級丟棄的筆數，
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
// 避免 SSR/CSR 首次輸出不一致（沿用 useScoreboardStore 的模式）。
// ADD_PLAYER：委派給 lib/matchmaker/roster.ts 的純函式，id／now 由本層注入。
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

// 泛型參數是 syncStatus 的值域：雲端 hook 只會回報 SyncStatus（預設值），
// 只有選擇器會多回報 pending，所以選擇器才宣告 UseRosterStoreResult<DataStatus>。
export interface UseRosterStoreResult<Status extends DataStatus = SyncStatus> {
	players: Player[];
	/** 讀取持久化資料時被丟棄的損壞筆數，> 0 時 UI 需提示使用者。 */
	droppedCount: number;
	addPlayer: (input: AddPlayerInput) => void;
	updatePlayer: (id: string, patch: UpdatePlayerPatch) => void;
	removePlayer: (id: string) => void;
	togglePlayerActive: (id: string) => void;
	resetRoster: () => void;
	/** 本機模式在名單讀入前為 pending、讀入後恆為 local；儲存模式未定時為 pending；
	 * 雲端模式反映載入與儲存狀態。 */
	syncStatus: Status;
	/** 以後端已寫入的參賽者取代畫面上的同 id 資料；不送請求。本機模式為不做事的函式。 */
	applyRemotePlayers: (items: { data: Player; version: number }[]) => void;
	/** 停止所有佇列並重新載入雲端名單。本機模式為不做事的函式。 */
	reloadRemotePlayers: () => void;
}

// 本機實作不知道同步狀態，由選擇器補上；hydrated 是本機名單是否已讀入，供選擇器決定
// syncStatus 要回 pending 還是 local。
type LocalRosterStoreResult = Omit<
	UseRosterStoreResult<DataStatus>,
	"syncStatus" | "applyRemotePlayers" | "reloadRemotePlayers"
> & { hydrated: boolean };

function doNothing(): void {}

// 整合 reducer 與 localStorage，比照 useScoreboardStore 的 write/read effect 順序與
// hasHydratedRef 守門模式：write effect 放前面（mount 時 ref=false 故跳過）、
// read/hydrate effect 放後面（讀取後視情況 dispatch HYDRATE，最後把 ref 設 true）。
// 避免 read 前就被 write effect 用初始（空）state 覆蓋 localStorage 的競態。
export function useLocalRosterStore(): LocalRosterStoreResult {
	const [state, dispatch] = useReducer(
		rosterReducer,
		undefined,
		(_arg: undefined) => createInitialState(),
	);
	const hasHydratedRef = useRef(false);
	// 讀入旗標是獨立 state，不放進 reducer：無資料時不 dispatch HYDRATE 是為了不產生新的
	// state 參考（否則 write effect 會把初始值寫回 localStorage），旗標則不影響 state 參考。
	// 用 useReducer 而非 useState：react-hooks/set-state-in-effect 不適用於 dispatch。
	const [hydrated, markHydrated] = useReducer(() => true, false);

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
		// 無論有沒有本機資料都標記，讀入後選擇器才會從 pending 轉為 local
		markHydrated();
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
	// rounds 與 history 加進該清單後，本函式不需改動。
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
		hydrated,
	};
}

// 儲存模式選擇器：本機 hook 在其他模式下仍會 mount（hooks 規則不允許條件呼叫），
// 它只會讀取並把同一份本機名單寫回，使用者動作一律走雲端 hook 或等待中結果，不會改到本機名單。
// 等待中（儲存模式未定）沿用未啟用的雲端 hook 結果：它在第一次取得 session 之前從未啟用過，
// 內部必為初始狀態（空名單、操作因沒有 controller 而直接返回）。
export function useRosterStore(): UseRosterStoreResult<DataStatus> {
	const session = useSession();
	const local = useLocalRosterStore();
	const mode = resolveStorageMode(session);
	// 雲端 store 以這個帳號為世代界線；loading 或訪客時為 null（此時也不會啟用雲端）
	const userId = session.status === "ready" ? (session.user?.id ?? null) : null;
	const remote = useRemoteRosterStore({
		enabled: mode === "remote",
		userId,
		onUnauthorized: session.refresh,
	});

	if (mode === "remote") {
		return remote;
	}
	if (mode === "pending") {
		return { ...remote, syncStatus: "pending" };
	}
	const { hydrated, ...localStore } = local;
	return {
		...localStore,
		syncStatus: localDataStatus(hydrated),
		applyRemotePlayers: doNothing,
		reloadRemotePlayers: doNothing,
	};
}
