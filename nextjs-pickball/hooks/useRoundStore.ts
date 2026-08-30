// hooks/useRoundStore.ts
"use client";

import { useEffect, useReducer, useRef } from "react";
import {
	createRound,
	resetIncompleteMatches as resetIncompleteMatchesPure,
	submitScore as submitScorePure,
	setTargetScore as setTargetScorePure,
	SUBMIT_SCORE_FAILURE_CODE,
	SET_TARGET_SCORE_FAILURE_CODE,
} from "@/lib/matchmaker/round";
import { clearDiscardedMatchSlots } from "@/lib/matchmaker/scoreboard-binding";
import type {
	CreateRoundInput,
	CreateRoundResult,
	ResetIncompleteMatchesResult,
	SubmitScoreResult,
	SetTargetScoreResult,
} from "@/lib/matchmaker/round";
import { readRound, writeRound, readHistory, writeHistory } from "@/lib/matchmaker/round-storage";
import type { UpdatePlayerPatch } from "@/lib/matchmaker/roster";
import type { MatchHistoryEntry } from "@/lib/matchmaker/history";
import type { Round, RoundTargetScore } from "@/lib/matchmaker/round-types";
import type { Player } from "@/lib/matchmaker/types";

// 回合 store 的 state 形狀。history 由兩條路徑寫入：mount 時 hydrate 既有歷史，
// 送出比分時（submitScore）把新完成的一場附加進來。droppedCount 只由 hydrate
// 路徑寫入，對外暴露讀取持久化資料時被丟棄的損壞筆數——比照 useRosterStore 已
// 匯出 droppedCount 的既有做法。現況：本 change（對戰頁）尚未在畫面上消費這個值，
// 是已知缺口，留給後續處理歷史頁面的 change。
interface RoundStoreState {
	round: Round | null;
	history: MatchHistoryEntry[];
	droppedCount: number;
}

// HYDRATE：mount 後把 localStorage 讀到的回合與歷史灌入 state（沿用 useRosterStore
// 的 SSR/CSR 一致性理由）。GENERATE_ROUND／RESET_INCOMPLETE_MATCHES：只取代 round，
// 對應的名單／休息次數 patch 不經過本 reducer——那些 patch 屬於名單（roster port），
// 本 store 不擁有名單狀態（design Decision 7）。SUBMIT_SCORE：取代 round 並把新完成
// 的一場附加進 history；playerPatches 同樣不經過本 reducer，套用方式見下方 submitScore。
type RoundStoreAction =
	| { type: "HYDRATE"; round: Round | null; history: MatchHistoryEntry[]; droppedCount: number }
	| { type: "GENERATE_ROUND"; round: Round }
	| { type: "RESET_INCOMPLETE_MATCHES"; round: Round }
	| { type: "SUBMIT_SCORE"; round: Round; historyEntry: MatchHistoryEntry }
	| { type: "SET_TARGET_SCORE"; round: Round };

function createInitialState(): RoundStoreState {
	return { round: null, history: [], droppedCount: 0 };
}

function roundStoreReducer(state: RoundStoreState, action: RoundStoreAction): RoundStoreState {
	switch (action.type) {
		case "HYDRATE":
			return { round: action.round, history: action.history, droppedCount: action.droppedCount };
		case "GENERATE_ROUND":
			return { ...state, round: action.round };
		case "RESET_INCOMPLETE_MATCHES":
			return { ...state, round: action.round };
		case "SUBMIT_SCORE":
			return { ...state, round: action.round, history: [...state.history, action.historyEntry] };
		case "SET_TARGET_SCORE":
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
 * `now`／`newMatchId` 由本 hook 注入——`round.ts` 的 `createRound` 是純函式，其註解載明
 * 「時間與場次 id 一律由呼叫端注入」，而本 hook 就是那個呼叫端。呼叫端因此不需要
 * 自己產生時間戳記或場次 id。 */
export type GenerateRoundInput = Omit<CreateRoundInput, "players" | "previousRound" | "now" | "newMatchId">;

export interface UseRoundStoreResult {
	round: Round | null;
	history: MatchHistoryEntry[];
	/** 讀取持久化歷史時被丟棄的損壞筆數，> 0 時 UI 需提示使用者。 */
	droppedCount: number;
	/** 產生新一輪：失敗時（`ok: false`）不套用任何變動，回傳值即失敗結果供 UI 顯示訊息。 */
	generateRound: (input: GenerateRoundInput) => CreateRoundResult;
	/** 重排本輪尚未比賽的人：委派 round.ts 的 resetIncompleteMatches，失敗
	 * （`ok: false`）時不套用任何變動。 */
	resetIncompleteMatches: () => ResetIncompleteMatchesResult;
	/** 送出一場比分：委派 round.ts 的 submitScore，成功時依序完成三件事——套用
	 * 新回合、把 historyEntry 併入歷史、把每筆 playerPatches 交給 roster port 的
	 * updatePlayer；失敗（`ok: false`）時三者皆不觸碰，不會出現部分更新。 */
	submitScore: (matchId: string, rawScoreA: string, rawScoreB: string) => SubmitScoreResult;
	/** 更改本輪目標分數：委派 round.ts 的 setTargetScore（該輪所有場次皆為 pending
	 * 時才允許），失敗（`ok: false`）時不套用任何變動（match-stage 的 MODIFIED
	 * 「目標分數選擇器」——8.6 起才有非測試呼叫端接上這個原本懸空的純函式）。 */
	setTargetScore: (targetScore: RoundTargetScore) => SetTargetScoreResult;
}

// 「找不到目前回合」與 round.ts 私有的 MATCH_NOT_FOUND_MESSAGE（「找不到指定的場次」）
// 是不同情境：後者是「回合存在但 matchId 過期」，前者是「整個回合都不存在」——本頁面
// 的 submitScore 只會在 CourtCard 渲染時才被呼叫（CourtCard 只存在於 round !== null
// 的畫面裡），這個分支在目前的 UI 接線下不可達，純為型別安全而設的防線。
const NO_ROUND_TO_SUBMIT_MESSAGE = "目前沒有進行中的回合，請重新整理頁面後再試一次。";

// setTargetScore 只會在 RoundControls 已經拿到非 null 的 round 時才被呼叫（該元件
// 自己判斷「回合是否存在」以決定要呼叫 onSettingsChange 還是本函式，見 RoundControls.tsx），
// 這裡的 null 檢查與 submitScore 的 NO_ROUND_TO_SUBMIT_MESSAGE 同樣是不可達的型別安全
// 防線，並非真的會被觸發的分支。SetTargetScoreFailureCode 目前只有 SCORING_STARTED
// 一個成員，沿用它純粹是型別上沒有更貼切的選項，不代表本情境真的是「已開始計分」。
const NO_ROUND_TO_SET_TARGET_SCORE_MESSAGE = "目前沒有進行中的回合，請重新整理頁面後再試一次。";

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

	// 歷史的寫入 effect，結構比照上面的回合寫入 effect：只在 hydrate 完成後才寫回，
	// 避免 mount 時以初始（空）history 覆蓋 localStorage 既有資料。submitScore 因此
	// 不需要自己呼叫 writeHistory——dispatch 後 state.history 變動，本 effect 自動接手。
	useEffect(() => {
		if (!hasHydratedRef.current) return;
		writeHistory(state.history);
	}, [state.history]);

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

	// 已知限制（留給接上按鈕的 milestone）：本函式在 render scope 讀 state.round，
	// 同一次 render 內連呼兩次會共用同一份舊值，第二次的 previousRound 仍是上上輪，
	// 結果是輪次編號少前進一次。休息結算本身不受影響——restSettlements 帶的是
	// 「原值 + 1」的絕對值 patch 而非差值，重複套用同一份結果相同。不改用「把
	// state.round 的讀取搬進 reducer」來根治：那會迫使 reducer 呼叫 crypto.randomUUID()
	// 與 new Date() 而不再是純函式，也讓本函式無法同步回傳 CreateRoundResult 供 UI
	// 判斷 ok。UI 端 MUST 確保一次互動只呼叫一次。resetIncompleteMatches／submitScore
	// 同樣讀 render scope 的 state.round，適用同一條限制。
	//
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

	// 重排本輪尚未比賽的人（design Open Questions 2d）：resetIncompleteMatches 回傳值
	// 刻意不含 restCount patch（重排不是本輪結束，見 round.ts 該函式的註解），本函式因此
	// 只需 dispatch 新回合，不需要像 generateRound 那樣額外套用休息結算。
	//
	// 先保留 dispatch 前的 state.round（重排前回合）：resetIncompleteMatchesPure 成功時
	// 保證呼叫當下 state.round 不為 null（否則會回傳 NO_ROUND 失敗），但型別上
	// 仍是 Round | null，故在此以區域變數收斂——清槽（round-lifecycle 的清槽
	// Requirement）需要「重排前」與「重排後」兩份回合比對出被丟棄的場次 id，
	// 清除範圍的判斷只在 clearDiscardedMatchSlots 一處定義，本函式只負責接線。
	//
	// `previousRound !== null` 這個型別收斂目前是不可達分支（純函式契約保證 ok 時
	// previousRound 必不為 null），只用來滿足 clearDiscardedMatchSlots 的參數型別，
	// 因此判斷範圍只包住清槽這一條語句：dispatch 只依賴 result.ok，不受此收斂牽連。
	// 這樣一來，若日後純函式契約改變而真的出現「ok 為 true 但 previousRound 為 null」
	// 的情況，頂多是清槽被跳過，成功的重排仍會照常 dispatch、回合仍會更新——不會因為
	// 一個本來只為型別安全而設的判斷，把整次成功的重排連同 dispatch 一起靜默吞掉。
	function resetIncompleteMatches(): ResetIncompleteMatchesResult {
		const previousRound = state.round;
		const result = resetIncompleteMatchesPure(previousRound, players, {
			newMatchId: () => crypto.randomUUID(),
		});

		if (result.ok) {
			dispatch({ type: "RESET_INCOMPLETE_MATCHES", round: result.round });
			if (previousRound !== null) {
				clearDiscardedMatchSlots(previousRound, result.round);
			}
		}

		return result;
	}

	// 原子性由「失敗時不套用任何變動」保證（round.ts submitScore 把 validateScoreInput
	// 放在最前面完成，失敗時回傳值裡沒有 historyEntry／playerPatches 可用）：本函式只在
	// result.ok 為 true 時才 dispatch 並呼叫 updatePlayer，失敗時 round／history／名單
	// 三者皆不觸碰。round／history 的持久化寫入交給上方兩個 write effect 各自對應
	// state.round／state.history 的變動自動處理，本函式不重複呼叫 writeRound／writeHistory
	// （比照 generateRound／resetIncompleteMatches 已建立的模式）。
	function submitScore(matchId: string, rawScoreA: string, rawScoreB: string): SubmitScoreResult {
		if (state.round === null) {
			return { ok: false, code: SUBMIT_SCORE_FAILURE_CODE.MATCH_NOT_FOUND, message: NO_ROUND_TO_SUBMIT_MESSAGE };
		}

		const result = submitScorePure({
			round: state.round,
			players,
			matchId,
			rawScoreA,
			rawScoreB,
			now: new Date().toISOString(),
		});

		if (result.ok) {
			dispatch({ type: "SUBMIT_SCORE", round: result.round, historyEntry: result.historyEntry });
			for (const patch of result.playerPatches) {
				updatePlayer(patch.id, { rating: patch.rating, gamesPlayed: patch.gamesPlayed });
			}
		}

		return result;
	}

	// 更改本輪目標分數（match-stage 的 MODIFIED「目標分數選擇器」）：委派 round.ts 的
	// 純函式，成功時 dispatch 新回合；失敗（該輪已有場次非 pending）時不套用任何變動，
	// 形態比照 resetIncompleteMatches 的「呼叫純函式 → 判 ok → dispatch」。
	function setTargetScore(targetScore: RoundTargetScore): SetTargetScoreResult {
		if (state.round === null) {
			return {
				ok: false,
				code: SET_TARGET_SCORE_FAILURE_CODE.SCORING_STARTED,
				message: NO_ROUND_TO_SET_TARGET_SCORE_MESSAGE,
			};
		}

		const result = setTargetScorePure(state.round, targetScore);
		if (result.ok) {
			dispatch({ type: "SET_TARGET_SCORE", round: result.round });
		}

		return result;
	}

	return {
		round: state.round,
		history: state.history,
		droppedCount: state.droppedCount,
		generateRound,
		resetIncompleteMatches,
		submitScore,
		setTargetScore,
	};
}
