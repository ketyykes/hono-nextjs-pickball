// hooks/useRoundStore.ts
"use client";

import { useEffect, useReducer, useRef } from "react";
import { createRound } from "@/lib/matchmaker/round";
import type { CreateRoundInput, CreateRoundResult } from "@/lib/matchmaker/round";
import { readRound, writeRound, readHistory } from "@/lib/matchmaker/round-storage";
import type { UpdatePlayerPatch } from "@/lib/matchmaker/roster";
import type { MatchHistoryEntry } from "@/lib/matchmaker/history";
import type { Round } from "@/lib/matchmaker/round-types";
import type { Player } from "@/lib/matchmaker/types";

// 回合 store 的 state 形狀。history／droppedCount 目前只由 hydrate 路徑寫入——
// 本 hook 尚未接上送出比分（round.ts 的 submitScore 尚未在此接線，見 round-lifecycle
// delta「比分送出的完成流程」Requirement 的「實作位於」只列 round.ts，未列本檔），
// 兩欄位先在此暴露供 UI 讀取歷史與損壞筆數提示（design：readHistory() 的 droppedCount
// MUST 能被 hook 消費端看見，比照 useRosterStore 已匯出 droppedCount 的既有做法）。
interface RoundStoreState {
	round: Round | null;
	history: MatchHistoryEntry[];
	droppedCount: number;
}

// HYDRATE：mount 後把 localStorage 讀到的回合與歷史灌入 state（沿用 useRosterStore
// 的 SSR/CSR 一致性理由）。GENERATE_ROUND：只取代 round，restSettlements 的套用
// 不經過本 reducer——那些 patch 屬於名單（roster port），本 store 不擁有名單狀態
// （design Decision 7）。
type RoundStoreAction =
	| { type: "HYDRATE"; round: Round | null; history: MatchHistoryEntry[]; droppedCount: number }
	| { type: "GENERATE_ROUND"; round: Round };

function createInitialState(): RoundStoreState {
	return { round: null, history: [], droppedCount: 0 };
}

function roundStoreReducer(state: RoundStoreState, action: RoundStoreAction): RoundStoreState {
	switch (action.type) {
		case "HYDRATE":
			return { round: action.round, history: action.history, droppedCount: action.droppedCount };
		case "GENERATE_ROUND":
			return { ...state, round: action.round };
		default:
			return state;
	}
}

/** useRoundStore 的注入埠（design Decision 7）：本 store 不擁有名單，`updatePlayer`
 * 的簽章與 `useRosterStore` 匯出的同名函式逐字相同，頁面層直接把後者的回傳值傳入即可。
 * SHALL NOT 在本 hook 內部呼叫 `useRosterStore()`——那會產生第二個名單 reducer 實例，
 * 兩個實例各自寫回同一個 LocalStorage key，最後寫的會贏，是典型的靜默資料遺失。 */
export interface UseRoundStoreOptions {
	readonly players: readonly Player[];
	readonly updatePlayer: (id: string, patch: UpdatePlayerPatch) => void;
}

/** generateRound 對外的輸入：`players`／`previousRound` 取自 hook 目前握有的狀態，
 * `now`／`newMatchId` 由本 hook 注入（round.ts 明文「呼叫端（也就是你的 hook）注入」），
 * 呼叫端因此不需要自己產生時間戳記或場次 id。 */
export type GenerateRoundInput = Omit<CreateRoundInput, "players" | "previousRound" | "now" | "newMatchId">;

export interface UseRoundStoreResult {
	round: Round | null;
	history: MatchHistoryEntry[];
	/** 讀取持久化歷史時被丟棄的損壞筆數，> 0 時 UI 需提示使用者。 */
	droppedCount: number;
	/** 產生新一輪：失敗時（`ok: false`）不套用任何變動，回傳值即失敗結果供 UI 顯示訊息。 */
	generateRound: (input: GenerateRoundInput) => CreateRoundResult;
}

// 整合 reducer 與 localStorage，結構比照 useRosterStore.ts：write effect 放前面
// （mount 時 ref=false 故跳過）、read/hydrate effect 放後面，避免 read 前就被
// write effect 用初始（空）state 覆蓋 localStorage 的競態。
export function useRoundStore(options: UseRoundStoreOptions): UseRoundStoreResult {
	const { players, updatePlayer } = options;

	// 惰性初始化用 createInitialState 本身（不取參數），不用 `(_arg) => createInitialState()`
	// 包一層——後者會多出一個未使用的形參，觸發 no-unused-vars（useRosterStore.ts 已有此
	// 既存 warning，本檔沿用同一慣例但改以無參數函式直接滿足 useReducer 的惰性初始化簽章，
	// 不重蹈同一個 warning）。
	const [state, dispatch] = useReducer(roundStoreReducer, undefined, createInitialState);
	const hasHydratedRef = useRef(false);

	useEffect(() => {
		if (!hasHydratedRef.current) return;
		writeRound(state.round);
	}, [state.round]);

	useEffect(() => {
		const round = readRound();
		const { entries, droppedCount } = readHistory();
		// 沒有任何持久化資料時不 dispatch，避免無意義的 state 參考變動
		// （呼應 useRosterStore 的 `if (players.length > 0 || droppedCount > 0)` 寫法）。
		if (round !== null || entries.length > 0 || droppedCount > 0) {
			dispatch({ type: "HYDRATE", round, history: entries, droppedCount });
		}
		hasHydratedRef.current = true;
		return () => {
			// React Strict Mode 下 dev 會 unmount 再重新 mount，重置 ref 使下一次 mount
			// 的 write effect 不會以初始（空）state 覆蓋 localStorage。
			hasHydratedRef.current = false;
		};
	}, []);

	// 「本輪結束」＝產生新一輪的那一刻（design Decision 1）：createRound() 一次算出
	// 新回合與 restSettlements，本函式在同一次同步呼叫內依序 dispatch 新回合、
	// 並把每筆 restSettlement 交給 roster port 的 updatePlayer——失敗（result.ok
	// 為 false）時兩者皆不觸碰，不會出現「休息次數已加但回合沒換」的中途狀態。
	function generateRound(input: GenerateRoundInput): CreateRoundResult {
		const result = createRound({
			...input,
			players,
			previousRound: state.round,
			now: new Date().toISOString(),
			newMatchId: () => crypto.randomUUID(),
		});

		if (result.ok) {
			dispatch({ type: "GENERATE_ROUND", round: result.round });
			for (const settlement of result.restSettlements) {
				updatePlayer(settlement.id, { restCount: settlement.restCount });
			}
		}

		return result;
	}

	return {
		round: state.round,
		history: state.history,
		droppedCount: state.droppedCount,
		generateRound,
	};
}
