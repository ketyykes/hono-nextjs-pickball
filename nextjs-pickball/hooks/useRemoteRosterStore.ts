// hooks/useRemoteRosterStore.ts
"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import {
	addPlayer as addPlayerToRoster,
	updatePlayer as updatePlayerInRoster,
	removePlayer as removePlayerFromRoster,
	togglePlayerActive as togglePlayerActiveInRoster,
} from "@/lib/matchmaker/roster";
import type { AddPlayerInput, UpdatePlayerPatch } from "@/lib/matchmaker/roster";
import { resetLocalMatchProgress } from "@/lib/matchmaker/storage";
import {
	deleteRemotePlayer,
	fetchRemotePlayers,
	putRemotePlayer,
	resetRemoteMatchmaker,
} from "@/lib/sync/roster-api";
import {
	createLatestWinsSaver,
	type LatestWinsSaver,
	type SaveOutcome,
	type SaverEvent,
} from "@/lib/sync/latest-wins-saver";
import type { SyncStatus } from "@/lib/sync/sync-status";
import type { Player } from "@pickball/core/matchmaker/types";
import type { UseRosterStoreResult } from "@/hooks/useRosterStore";

export interface UseRemoteRosterStoreOptions {
	/** false 時不發任何請求，且對外狀態恆為 local。 */
	enabled: boolean;
	/**
	 * 目前登入的帳號。換帳號即結束舊世代並重新載入；為 null 時視同停用，
	 * 避免以不明帳號送出請求。
	 */
	userId: string | null;
	/** GET／寫入收到 401 時呼叫；選擇器傳入 session 的 refresh。 */
	onUnauthorized: () => void;
}

type Payload = { op: "put"; player: Player } | { op: "delete" };
type LoadPhase = "loading" | "load-failed" | "ready";
type StickyStatus = "conflict" | "rejected" | null;
type RemotePlayerItem = Parameters<UseRosterStoreResult["applyRemotePlayers"]>[0][number];

interface Controller {
	enqueue: (id: string, payload: Payload) => void;
	reset: () => void;
	apply: (items: RemotePlayerItem[]) => void;
	reload: () => void;
}

// 彙總順序：retrying 優先（使用者最需要知道網路有問題），其次是黏著的
// conflict／rejected（要維持到下一次儲存成功，避免提示被重送時的 saving 洗掉），
// 再來才是 saving，全部閒置才是 synced。
function deriveStatus(
	phase: LoadPhase,
	busy: Map<string, "saving" | "retrying">,
	sticky: StickyStatus,
): SyncStatus {
	if (phase !== "ready") return phase;
	const states = [...busy.values()];
	if (states.includes("retrying")) return "retrying";
	if (sticky !== null) return sticky;
	if (states.includes("saving")) return "saving";
	return "synced";
}

const NO_PLAYERS: Player[] = [];

export function useRemoteRosterStore({
	enabled,
	userId,
	onUnauthorized,
}: UseRemoteRosterStoreOptions): UseRosterStoreResult {
	// 同 status：effect 開頭要清空前一個世代的名單，用 reducer 避開 react-hooks/set-state-in-effect
	const [players, setPlayers] = useReducer(
		(_current: Player[], next: Player[]): Player[] => next,
		[],
	);
	// 用 reducer 取代 useState：effect 開頭要把狀態重設為 loading，dispatch 不會觸發
	// react-hooks/set-state-in-effect（沿用 useRemoteScoreboardStore 的寫法）
	const [status, setStatus] = useReducer(
		(_current: SyncStatus, next: SyncStatus): SyncStatus => next,
		"loading",
	);
	// 目前名單屬於哪個帳號：render 時與 userId 不同代表 effect 還沒換世代，
	// 此時不能把前一帳號的名單交給畫面，操作也一律不送出（design Decision 7）
	const [owner, setOwner] = useReducer(
		(_current: string | null, next: string | null): string | null => next,
		null,
	);
	const active = enabled && userId !== null;
	const mismatched = active && owner !== userId;
	// 變更操作要用「目前」名單算出新值並同步送進佇列，不能等 render 之後才讀到 state
	const playersRef = useRef<Player[]>([]);
	// false 代表尚未取得雲端版本（載入中、載入失敗、衝突重載中、重置進行中、已收到 401）：
	// 此時使用者動作 SHALL NOT 送出，否則只會得到 409 或覆蓋未知資料
	const readyRef = useRef(false);
	const controllerRef = useRef<Controller | null>(null);
	const onUnauthorizedRef = useRef(onUnauthorized);
	useEffect(() => {
		onUnauthorizedRef.current = onUnauthorized;
	}, [onUnauthorized]);

	const replacePlayers = useCallback((next: Player[]) => {
		playersRef.current = next;
		setPlayers(next);
	}, []);

	useEffect(() => {
		if (!enabled || userId === null) return;
		// 世代內的每個請求（載入、儲存、重試、重置、衝突重載）都用這個帳號，不在送出當下改讀其他來源：
		// 否則舊世代的待送值可能帶著新帳號的標頭通過伺服器守衛
		const expectedUserId = userId;
		// StrictMode、enabled 與 userId 切換都會重跑本 effect：舊一輪在途的 GET 以 cancelled 忽略，
		// 舊一輪的 saver 由 disposeAll 釋放
		let cancelled = false;
		let stopped = false;
		// 重置與衝突重載可能同時進行：可寫入只在兩者都結束、且已載入、未收到 401 時成立，
		// 不能由任一邊的結束單獨重開，否則另一邊還在途時使用者動作會漏出去
		let resetting = false;
		let reloading = false;
		let phase: LoadPhase = "loading";
		let sticky: StickyStatus = null;
		// 每次 disposeAll 加一：舊世代的在途 PUT 回來時不得把過期版本寫回新載入的 Map
		let epoch = 0;
		const versions = new Map<string, number>();
		const busy = new Map<string, "saving" | "retrying">();
		const savers = new Map<string, LatestWinsSaver<Payload>>();

		readyRef.current = false;
		// 不殘留前一個世代的名單
		replacePlayers([]);
		setOwner(expectedUserId);
		setStatus("loading");

		function updateReady(): void {
			readyRef.current = phase === "ready" && !stopped && !resetting && !reloading;
		}

		function publish(): void {
			if (cancelled) return;
			setStatus(deriveStatus(phase, busy, sticky));
		}

		function disposeAll(): void {
			epoch += 1;
			for (const saver of savers.values()) saver.dispose();
			savers.clear();
			busy.clear();
			versions.clear();
		}

		function handleUnauthorized(): void {
			if (stopped) return;
			stopped = true;
			updateReady();
			disposeAll();
			onUnauthorizedRef.current();
		}

		async function load(afterConflict: boolean): Promise<void> {
			const result = await fetchRemotePlayers(expectedUserId);
			if (cancelled) return;
			if (result.kind === "unauthorized") {
				handleUnauthorized();
				return;
			}
			if (result.kind !== "ok" || result.value === undefined) {
				phase = "load-failed";
				reloading = false;
				updateReady();
				publish();
				return;
			}
			versions.clear();
			for (const item of result.value.items) versions.set(item.data.id, item.version);
			// 空清單也要取代：同一個 mount 內 enabled 切換（換帳號）後不能殘留前一輪的名單。
			// 載入結果不是使用者變更，不會進入佇列，因此不會寫回雲端。
			replacePlayers(result.value.items.map((item) => item.data));
			phase = "ready";
			sticky = afterConflict ? "conflict" : null;
			reloading = false;
			updateReady();
			publish();
		}

		function reloadPlayers(afterConflict: boolean): void {
			// 先關閉寫入並釋放所有佇列，重載期間的動作與其他筆的待送變更都不再送出
			reloading = true;
			updateReady();
			disposeAll();
			void load(afterConflict);
		}

		// 後端已把評分寫進雲端，這裡只更新畫面與版本，不送任何請求
		function apply(items: RemotePlayerItem[]): void {
			// 有待送或在途變更的參賽者：那些 PUT 會帶舊 version 得到 409，或覆蓋剛寫入的評分，
			// 提前整份重載比等它失敗清楚
			if (items.some((item) => busy.has(item.data.id))) {
				reloadPlayers(true);
				return;
			}
			const current = playersRef.current;
			const known = items.filter((item) => current.some((player) => player.id === item.data.id));
			for (const item of known) versions.set(item.data.id, item.version);
			replacePlayers(
				current.map((player) => known.find((item) => item.data.id === player.id)?.data ?? player),
			);
		}

		// 重置送出前的 disposeAll 會讓 saver 忽略舊世代的結果，但此時在途請求回來的 401 與 409
		// 仍要照常處理（session 已失效、或雲端版本已變），否則重置失敗後會以過期的版本繼續儲存
		function handleStaleOutcome(sentEpoch: number, kind: SaveOutcome): void {
			if (sentEpoch === epoch || !resetting || cancelled || stopped) return;
			if (kind === "unauthorized") handleUnauthorized();
			if (kind === "conflict") reloadPlayers(true);
		}

		async function send(id: string, payload: Payload): Promise<SaveOutcome> {
			const sentEpoch = epoch;
			if (payload.op === "delete") {
				const result = await deleteRemotePlayer(expectedUserId, id);
				if (result.kind !== "ok") {
					handleStaleOutcome(sentEpoch, result.kind);
					return result.kind;
				}
				if (sentEpoch === epoch) versions.delete(id);
				return "ok";
			}
			// 在這裡才讀版本：同一人排隊的第二次 PUT 要帶第一次成功後的新版本
			const result = await putRemotePlayer(expectedUserId, payload.player, versions.get(id) ?? 0);
			if (result.kind !== "ok") {
				handleStaleOutcome(sentEpoch, result.kind);
				return result.kind;
			}
			if (result.value === undefined) return "failed";
			if (sentEpoch === epoch) versions.set(id, result.value.version);
			return "ok";
		}

		function handleEvent(id: string, event: SaverEvent): void {
			if (cancelled || stopped) return;
			switch (event) {
				case "saving":
					// 重送時的 saving 不蓋掉該筆的 retrying，避免重試提示閃爍
					if (busy.get(id) !== "retrying") busy.set(id, "saving");
					break;
				case "retrying":
					busy.set(id, "retrying");
					break;
				case "saved":
					busy.delete(id);
					if (busy.size === 0) sticky = null;
					break;
				case "rejected":
					busy.delete(id);
					sticky = "rejected";
					break;
				case "conflict":
					reloadPlayers(true);
					return;
				case "unauthorized":
					handleUnauthorized();
					return;
			}
			publish();
		}

		function enqueue(id: string, payload: Payload): void {
			let saver = savers.get(id);
			if (saver === undefined) {
				saver = createLatestWinsSaver<Payload>({
					send: (next) => send(id, next),
					onResult: (event) => handleEvent(id, event),
				});
				savers.set(id, saver);
			}
			saver.save(payload);
		}

		async function reset(): Promise<void> {
			// 重置不可逆：不做樂觀更新，也不重試；進行中不接受其他動作
			resetting = true;
			updateReady();
			// 送出前就停止所有佇列：POST 在途期間退避計時器仍會到期，重試的 PUT 會讓已被重置的參賽者復活
			disposeAll();
			const result = await resetRemoteMatchmaker(expectedUserId);
			// 重置在途時可能已收到 401（stopped）：此時不得再重開，也不再發布狀態
			if (cancelled || stopped) return;
			resetting = false;
			if (result.kind === "ok") {
				disposeAll();
				replacePlayers([]);
				sticky = null;
				updateReady();
				publish();
				// 只清本次活動的本機進度，本機名單是訪客時期的資料，不能動
				resetLocalMatchProgress();
				return;
			}
			if (result.kind === "unauthorized") {
				handleUnauthorized();
				return;
			}
			updateReady();
			sticky = "rejected";
			publish();
		}

		controllerRef.current = {
			enqueue,
			reset: () => void reset(),
			apply,
			reload: () => reloadPlayers(false),
		};
		void load(false);
		return () => {
			cancelled = true;
			readyRef.current = false;
			disposeAll();
			controllerRef.current = null;
		};
	}, [enabled, userId, replacePlayers]);

	function addPlayer(input: AddPlayerInput): void {
		const controller = controllerRef.current;
		if (mismatched || controller === null || !readyRef.current) return;
		const id = crypto.randomUUID();
		const next = addPlayerToRoster(playersRef.current, input, {
			id,
			now: new Date().toISOString(),
		});
		const created = next.find((player) => player.id === id);
		if (created === undefined) return;
		replacePlayers(next);
		controller.enqueue(id, { op: "put", player: created });
	}

	function applyChange(id: string, compute: (roster: Player[]) => Player[]): void {
		const controller = controllerRef.current;
		if (mismatched || controller === null || !readyRef.current) return;
		if (!playersRef.current.some((player) => player.id === id)) return;
		const next = compute(playersRef.current);
		const changed = next.find((player) => player.id === id);
		if (changed === undefined) return;
		replacePlayers(next);
		controller.enqueue(id, { op: "put", player: changed });
	}

	function updatePlayer(id: string, patch: UpdatePlayerPatch): void {
		applyChange(id, (roster) => updatePlayerInRoster(roster, id, patch));
	}

	function togglePlayerActive(id: string): void {
		applyChange(id, (roster) => togglePlayerActiveInRoster(roster, id));
	}

	function removePlayer(id: string): void {
		const controller = controllerRef.current;
		if (mismatched || controller === null || !readyRef.current) return;
		if (!playersRef.current.some((player) => player.id === id)) return;
		replacePlayers(removePlayerFromRoster(playersRef.current, id));
		controller.enqueue(id, { op: "delete" });
	}

	function resetRoster(): void {
		const controller = controllerRef.current;
		if (mismatched || controller === null || !readyRef.current) return;
		controller.reset();
	}

	function applyRemotePlayers(items: RemotePlayerItem[]): void {
		const controller = controllerRef.current;
		if (mismatched || controller === null || !readyRef.current) return;
		controller.apply(items);
	}

	function reloadRemotePlayers(): void {
		const controller = controllerRef.current;
		if (mismatched || controller === null) return;
		controller.reload();
	}

	let syncStatus: SyncStatus = status;
	if (!active) {
		syncStatus = "local";
	} else if (mismatched) {
		syncStatus = "loading";
	}

	return {
		players: mismatched ? NO_PLAYERS : players,
		droppedCount: 0,
		addPlayer,
		updatePlayer,
		removePlayer,
		togglePlayerActive,
		resetRoster,
		applyRemotePlayers,
		reloadRemotePlayers,
		syncStatus,
	};
}
