// hooks/useRemoteRoundStore.ts
"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import {
	createRound,
	resetIncompleteMatches as resetIncompleteMatchesPure,
	setTargetScore as setTargetScorePure,
	setTimerDuration as setTimerDurationPure,
	startTimer as startTimerPure,
	submitScore as submitScorePure,
	swapMatchPlayer as swapMatchPlayerPure,
	ROUND_FAILURE_CODE,
	SUBMIT_SCORE_FAILURE_CODE,
	SET_TARGET_SCORE_FAILURE_CODE,
	SET_TIMER_DURATION_FAILURE_CODE,
	START_TIMER_FAILURE_CODE,
	SWAP_MATCH_PLAYER_FAILURE_CODE,
	RESET_INCOMPLETE_MATCHES_FAILURE_CODE,
} from "@pickball/core/matchmaker/round";
import type {
	CreateRoundResult,
	ResetIncompleteMatchesResult,
	SetTargetScoreResult,
	SetTimerDurationResult,
	StartTimerResult,
	SubmitScoreResult,
	SwapMatchPlayerResult,
} from "@pickball/core/matchmaker/round";
import type { MatchHistoryEntry } from "@pickball/core/matchmaker/history";
import type {
	Round,
	RoundTargetScore,
	RoundTimerDurationMinutes,
} from "@pickball/core/matchmaker/round-types";
import type { Player } from "@pickball/core/matchmaker/types";
import type { ScoreboardState } from "@pickball/core/scoreboard/types";
import type { SubmitScoreResponse } from "@pickball/core/api/round";
import { fetchRemoteRound, fetchRemoteSlots, putRemoteRound, submitRemoteScore } from "@/lib/sync/round-api";
import {
	createRoundCommandQueue,
	type RoundCommand,
	type RoundCommandQueue,
	type RoundTransformResult,
} from "@/lib/sync/round-command-queue";
import type { SaverEvent } from "@/lib/sync/latest-wins-saver";
import type { SyncStatus } from "@/lib/sync/sync-status";
import type { UpdatePlayerPatch } from "@/lib/matchmaker/roster";
import type { GenerateRoundInput, UseRoundStoreResult } from "@/hooks/useRoundStore";

export interface UseRemoteRoundStoreOptions {
	/** false 時不發任何請求，且對外狀態恆為 local。 */
	enabled: boolean;
	readonly players: readonly Player[];
	updatePlayer: (id: string, patch: UpdatePlayerPatch) => void;
	applyRemotePlayers: (items: { data: Player; version: number }[]) => void;
	reloadRemotePlayers: () => void;
	/** GET／寫入收到 401 時呼叫；選擇器傳入 session 的 refresh。 */
	onUnauthorized: () => void;
	/**
	 * 名單的同步狀態。名單載入中或載入失敗時，送出比分的預先驗證會以空名單或過期名單計算，
	 * 因此此時 submitScore SHALL NOT 執行。省略視為就緒（名單為本機或呼叫端自行保證）。
	 */
	rosterSyncStatus?: SyncStatus;
}

export type UseRemoteRoundStoreResult = UseRoundStoreResult;

type LoadPhase = "loading" | "load-failed" | "ready";
type SlotRecord = Record<string, ScoreboardState>;

interface RemoteState {
	round: Round | null;
	slots: SlotRecord;
	status: SyncStatus;
}

type RemoteAction =
	| { type: "LOAD_START" }
	| { type: "LOADED"; round: Round | null; slots: SlotRecord; afterConflict: boolean }
	| { type: "LOAD_FAILED" }
	| { type: "SET_ROUND"; round: Round | null }
	| { type: "SET_SLOTS"; slots: SlotRecord }
	| { type: "SAVER"; event: SaverEvent };

const INITIAL_STATE: RemoteState = { round: null, slots: {}, status: "loading" };
const EMPTY_HISTORY: MatchHistoryEntry[] = [];

// saver 事件到 SyncStatus 的映射。重送時的 saving 不覆蓋 retrying、conflict、rejected：
// 避免重試提示閃爍，也讓衝突文案維持到下一次儲存成功（synced）為止。
// conflict 要等重新載入完成才設為 conflict；unauthorized 交給 onUnauthorized，狀態不動。
function remoteReducer(state: RemoteState, action: RemoteAction): RemoteState {
	switch (action.type) {
		case "LOAD_START":
			return INITIAL_STATE;
		case "LOADED":
			return {
				round: action.round,
				slots: action.slots,
				status: action.afterConflict ? "conflict" : "synced",
			};
		case "LOAD_FAILED":
			return { ...state, status: "load-failed" };
		case "SET_ROUND":
			return { ...state, round: action.round };
		case "SET_SLOTS":
			return { ...state, slots: action.slots };
		case "SAVER":
			switch (action.event) {
				case "saving":
					if (
						state.status === "retrying" ||
						state.status === "conflict" ||
						state.status === "rejected"
					) {
						return state;
					}
					return { ...state, status: "saving" };
				case "saved":
					return { ...state, status: "synced" };
				case "retrying":
					return { ...state, status: "retrying" };
				case "rejected":
					return { ...state, status: "rejected" };
				default:
					return state;
			}
		default:
			return state;
	}
}

// 雲端尚未就緒（載入中、載入失敗、衝突重載中、已收到 401、停用）時所有操作共用的失敗訊息
const NOT_READY_MESSAGE = "雲端資料尚未載入完成，請稍後再試。";
const ROSTER_NOT_READY_MESSAGE = "雲端名單尚未載入完成，請稍後再送出比分。";
const DUPLICATE_SUBMIT_MESSAGE = "此場次的比分正在送出，請稍候。";
const NO_ROUND_MESSAGE = "目前沒有進行中的回合，請重新整理頁面後再試一次。";

/**
 * 產生「第 n 次取得的 id 固定」的來源。命令佇列在每次送出與重試都會重新呼叫 apply，
 * 若每次都重新產生隨機 id，重試送出的回合就會與畫面上顯示的不同。
 */
function createStableIdSource(): () => () => string {
	const ids: string[] = [];
	return () => {
		let index = 0;
		return () => {
			if (ids[index] === undefined) ids[index] = crypto.randomUUID();
			const id = ids[index];
			index += 1;
			return id;
		};
	};
}

function isRosterReady(status: SyncStatus | undefined): boolean {
	return status !== "loading" && status !== "load-failed";
}

// 以伺服器規則清理分槽：只保留屬於「未完成場次」的分槽
function pruneSlots(slots: SlotRecord, round: Round): SlotRecord {
	const alive = new Set(
		round.matches.filter((match) => match.status !== "completed").map((match) => match.id),
	);
	const kept = Object.entries(slots).filter(([matchId]) => alive.has(matchId));
	if (kept.length === Object.keys(slots).length) return slots;
	return Object.fromEntries(kept);
}

interface Controller {
	enqueue: (command: RoundCommand) => void;
	hasPendingSubmit: (matchId: string) => boolean;
}

/**
 * 登入時對戰回合的雲端實作（design Decision 6、7、8）：載入回合與分槽、以命令佇列送出、
 * 版本衝突時整份重新載入。畫面上的回合 = 已確認回合依序套用佇列中的命令，因此操作同步回傳。
 */
export function useRemoteRoundStore({
	enabled,
	players,
	updatePlayer,
	applyRemotePlayers,
	reloadRemotePlayers,
	onUnauthorized,
	rosterSyncStatus,
}: UseRemoteRoundStoreOptions): UseRemoteRoundStoreResult {
	const [state, dispatch] = useReducer(remoteReducer, INITIAL_STATE);

	// 操作要用「目前」的回合與名單同步算出結果，不能等 render 之後才讀到 state
	const roundRef = useRef<Round | null>(null);
	const playersRef = useRef<readonly Player[]>(players);
	// false 代表尚未取得雲端版本（載入中、載入失敗、衝突重載中、已收到 401）：
	// 此時使用者動作 SHALL NOT 送出，否則只會得到 409 或覆蓋未知資料
	const readyRef = useRef(false);
	const rosterReadyRef = useRef(isRosterReady(rosterSyncStatus));
	const controllerRef = useRef<Controller | null>(null);
	const callbacksRef = useRef({ updatePlayer, applyRemotePlayers, reloadRemotePlayers, onUnauthorized });

	useEffect(() => {
		playersRef.current = players;
	}, [players]);
	useEffect(() => {
		rosterReadyRef.current = isRosterReady(rosterSyncStatus);
	}, [rosterSyncStatus]);
	useEffect(() => {
		callbacksRef.current = { updatePlayer, applyRemotePlayers, reloadRemotePlayers, onUnauthorized };
	}, [updatePlayer, applyRemotePlayers, reloadRemotePlayers, onUnauthorized]);

	const showRound = useCallback((next: Round | null) => {
		roundRef.current = next;
		dispatch({ type: "SET_ROUND", round: next });
	}, []);

	useEffect(() => {
		if (!enabled) return;
		// StrictMode 與 enabled 切換都會重跑本 effect：舊一輪在途的 GET 以 cancelled 忽略，
		// 舊一輪的佇列於 cleanup 釋放
		let cancelled = false;
		let stopped = false;
		let reloading = false;
		let phase: LoadPhase = "loading";
		// 任何請求成功後已確認回合就變了，下一次佇列閒置或開始送出時要重算畫面
		let confirmedDirty = false;
		let slots: SlotRecord = {};
		let queue: RoundCommandQueue | null = null;

		readyRef.current = false;
		roundRef.current = null;
		dispatch({ type: "LOAD_START" });

		function updateReady(): void {
			readyRef.current = phase === "ready" && !stopped && !reloading;
		}

		function setSlots(next: SlotRecord): void {
			if (next === slots) return;
			slots = next;
			dispatch({ type: "SET_SLOTS", slots: next });
		}

		function handleUnauthorized(): void {
			if (stopped) return;
			stopped = true;
			updateReady();
			callbacksRef.current.onUnauthorized();
		}

		// 畫面 = 已確認回合依序套用佇列中的命令；套用失敗的命令（例：換人對象已不在休息名單）略過
		function recompute(): void {
			if (queue === null) return;
			let round = queue.getConfirmed().round;
			for (const command of queue.getPending()) {
				if (command.kind === "transform") {
					const applied = command.apply(round, playersRef.current);
					if (applied !== null) round = applied.round;
					continue;
				}
				if (round === null) continue;
				const predicted = submitScorePure({
					round,
					players: playersRef.current,
					matchId: command.matchId,
					rawScoreA: command.scoreA,
					rawScoreB: command.scoreB,
					now: new Date().toISOString(),
				});
				if (predicted.ok) round = predicted.round;
			}
			showRound(round);
		}

		function handleEvent(event: SaverEvent): void {
			if (cancelled || stopped) return;
			if (event === "conflict") {
				reloading = true;
				updateReady();
				void load(true);
				return;
			}
			if (event === "unauthorized") {
				handleUnauthorized();
				return;
			}
			if (event === "saved" || (event === "saving" && confirmedDirty)) {
				confirmedDirty = false;
				recompute();
			}
			dispatch({ type: "SAVER", event });
		}

		function handleConfirmed(round: Round): void {
			confirmedDirty = true;
			// 回合 PUT 與送出比分成功後，伺服器都會清掉不屬於未完成場次的分槽
			setSlots(pruneSlots(slots, round));
		}

		function handleSubmitted(response: SubmitScoreResponse): void {
			callbacksRef.current.applyRemotePlayers(response.players);
			// 後續命令（例：換人）要以含新評分的名單重新套用，不能等 React 重新 render
			playersRef.current = playersRef.current.map(
				(player) => response.players.find((item) => item.data.id === player.id)?.data ?? player,
			);
		}

		async function load(afterConflict: boolean): Promise<void> {
			const [roundResult, slotsResult] = await Promise.all([fetchRemoteRound(), fetchRemoteSlots()]);
			if (cancelled) return;
			if (roundResult.kind === "unauthorized" || slotsResult.kind === "unauthorized") {
				handleUnauthorized();
				return;
			}
			if (
				roundResult.kind !== "ok" ||
				roundResult.value === undefined ||
				slotsResult.kind !== "ok" ||
				slotsResult.value === undefined
			) {
				phase = "load-failed";
				reloading = false;
				queue?.dispose();
				queue = null;
				controllerRef.current = null;
				updateReady();
				dispatch({ type: "LOAD_FAILED" });
				return;
			}

			queue?.dispose();
			const loadedRound = roundResult.value.data;
			queue = createRoundCommandQueue({
				initial: { round: loadedRound, version: roundResult.value.version },
				getPlayers: () => playersRef.current,
				putRound: putRemoteRound,
				submitScore: submitRemoteScore,
				onEvent: handleEvent,
				onConfirmed: handleConfirmed,
				onSubmitted: handleSubmitted,
			});
			const activeQueue = queue;
			controllerRef.current = {
				enqueue: (command) => activeQueue.enqueue(command),
				hasPendingSubmit: (matchId) =>
					activeQueue
						.getPending()
						.some((command) => command.kind === "submit" && command.matchId === matchId),
			};
			confirmedDirty = false;
			slots = Object.fromEntries(slotsResult.value.items.map((item) => [item.data.matchId, item.data]));
			roundRef.current = loadedRound;
			phase = "ready";
			reloading = false;
			updateReady();
			dispatch({ type: "LOADED", round: loadedRound, slots, afterConflict });
			// 另一裝置送出比分時評分也已改變；放在載入成功之後，401 時不會誤呼叫
			if (afterConflict) callbacksRef.current.reloadRemotePlayers();
		}

		void load(false);
		return () => {
			cancelled = true;
			readyRef.current = false;
			queue?.dispose();
			controllerRef.current = null;
		};
	}, [enabled, showRound]);

	function notReady(): boolean {
		return controllerRef.current === null || !readyRef.current;
	}

	// 回合變更操作的共同尾段：樂觀更新畫面，並把「對回合套用此操作」的命令排入佇列
	function commit(optimistic: Round, apply: (round: Round | null, roster: readonly Player[]) => RoundTransformResult | null): void {
		const controller = controllerRef.current;
		if (controller === null) return;
		showRound(optimistic);
		controller.enqueue({ kind: "transform", apply });
	}

	function generateRound(input: GenerateRoundInput): CreateRoundResult {
		if (notReady()) {
			return { ok: false, code: ROUND_FAILURE_CODE.EMPTY_ROSTER, message: NOT_READY_MESSAGE };
		}
		const result = createRound({
			...input,
			players: playersRef.current,
			previousRound: roundRef.current,
			now: new Date().toISOString(),
			newMatchId: () => crypto.randomUUID(),
		});
		if (result.ok) {
			// 隨機的場次 id 與休息結算在排入前就決定好；apply 每次送出與重試都會重跑，必須可重入
			commit(result.round, () => ({
				round: result.round,
				afterCommit: () => {
					for (const settlement of result.restSettlements) {
						callbacksRef.current.updatePlayer(settlement.id, { restCount: settlement.restCount });
					}
				},
			}));
		}
		return result;
	}

	function resetIncompleteMatches(): ResetIncompleteMatchesResult {
		if (notReady()) {
			return {
				ok: false,
				code: RESET_INCOMPLETE_MATCHES_FAILURE_CODE.NO_ROUND,
				message: NOT_READY_MESSAGE,
			};
		}
		const idSource = createStableIdSource();
		const compute = (round: Round | null, roster: readonly Player[]) =>
			resetIncompleteMatchesPure(round, roster, { newMatchId: idSource() });
		const result = compute(roundRef.current, playersRef.current);
		if (result.ok) {
			commit(result.round, (round, roster) => {
				const applied = compute(round, roster);
				return applied.ok ? { round: applied.round } : null;
			});
		}
		return result;
	}

	function submitScore(matchId: string, rawScoreA: string, rawScoreB: string): SubmitScoreResult {
		const controller = controllerRef.current;
		if (controller === null || !readyRef.current) {
			return { ok: false, code: SUBMIT_SCORE_FAILURE_CODE.SCORING_FAILED, message: NOT_READY_MESSAGE };
		}
		// 名單未就緒時以空名單預測會回 scoring-failed 並擋下送出（design Open Questions 第 7 點）
		if (!rosterReadyRef.current) {
			return { ok: false, code: SUBMIT_SCORE_FAILURE_CODE.SCORING_FAILED, message: ROSTER_NOT_READY_MESSAGE };
		}
		if (controller.hasPendingSubmit(matchId)) {
			return { ok: false, code: SUBMIT_SCORE_FAILURE_CODE.SCORING_FAILED, message: DUPLICATE_SUBMIT_MESSAGE };
		}
		const current = roundRef.current;
		if (current === null) {
			return { ok: false, code: SUBMIT_SCORE_FAILURE_CODE.MATCH_NOT_FOUND, message: NO_ROUND_MESSAGE };
		}
		const result = submitScorePure({
			round: current,
			players: playersRef.current,
			matchId,
			rawScoreA,
			rawScoreB,
			now: new Date().toISOString(),
		});
		if (result.ok) {
			showRound(result.round);
			controller.enqueue({ kind: "submit", matchId, scoreA: rawScoreA, scoreB: rawScoreB });
		}
		return result;
	}

	function setTargetScore(targetScore: RoundTargetScore): SetTargetScoreResult {
		const current = roundRef.current;
		if (notReady() || current === null) {
			return {
				ok: false,
				code: SET_TARGET_SCORE_FAILURE_CODE.SCORING_STARTED,
				message: current === null && !notReady() ? NO_ROUND_MESSAGE : NOT_READY_MESSAGE,
			};
		}
		const result = setTargetScorePure(current, targetScore);
		if (result.ok) {
			commit(result.round, (round) => {
				if (round === null) return null;
				const applied = setTargetScorePure(round, targetScore);
				return applied.ok ? { round: applied.round } : null;
			});
		}
		return result;
	}

	function setTimerDuration(durationMinutes: RoundTimerDurationMinutes): SetTimerDurationResult {
		const current = roundRef.current;
		if (notReady() || current === null) {
			return {
				ok: false,
				code: SET_TIMER_DURATION_FAILURE_CODE.SCORING_STARTED,
				message: current === null && !notReady() ? NO_ROUND_MESSAGE : NOT_READY_MESSAGE,
			};
		}
		const result = setTimerDurationPure(current, durationMinutes);
		if (result.ok) {
			commit(result.round, (round) => {
				if (round === null) return null;
				const applied = setTimerDurationPure(round, durationMinutes);
				return applied.ok ? { round: applied.round } : null;
			});
		}
		return result;
	}

	function startTimer(): StartTimerResult {
		const current = roundRef.current;
		if (notReady() || current === null) {
			return {
				ok: false,
				code: START_TIMER_FAILURE_CODE.NOT_CONFIGURED,
				message: current === null && !notReady() ? NO_ROUND_MESSAGE : NOT_READY_MESSAGE,
			};
		}
		// 開始時間固定在操作當下，重新套用時沿用同一個值
		const now = new Date().toISOString();
		const result = startTimerPure(current, now);
		if (result.ok) {
			commit(result.round, (round) => {
				if (round === null) return null;
				const applied = startTimerPure(round, now);
				return applied.ok ? { round: applied.round } : null;
			});
		}
		return result;
	}

	function swapMatchPlayer(matchId: string, outPlayerId: string, inPlayerId: string): SwapMatchPlayerResult {
		const current = roundRef.current;
		if (notReady() || current === null) {
			return {
				ok: false,
				code: SWAP_MATCH_PLAYER_FAILURE_CODE.MATCH_NOT_FOUND,
				message: current === null && !notReady() ? NO_ROUND_MESSAGE : NOT_READY_MESSAGE,
			};
		}
		const result = swapMatchPlayerPure(current, matchId, outPlayerId, inPlayerId, playersRef.current);
		if (result.ok) {
			commit(result.round, (round, roster) => {
				if (round === null) return null;
				const applied = swapMatchPlayerPure(round, matchId, outPlayerId, inPlayerId, roster);
				return applied.ok ? { round: applied.round } : null;
			});
		}
		return result;
	}

	return {
		round: enabled ? state.round : null,
		history: EMPTY_HISTORY,
		droppedCount: 0,
		generateRound,
		resetIncompleteMatches,
		submitScore,
		setTargetScore,
		setTimerDuration,
		startTimer,
		swapMatchPlayer,
		syncStatus: enabled ? state.status : "local",
		remoteMatchSlots: enabled ? state.slots : null,
	};
}
