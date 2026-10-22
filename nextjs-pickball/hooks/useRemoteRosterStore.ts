// hooks/useRemoteRosterStore.ts
"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
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

export interface UseRemoteRosterStoreOptions {
	/** false 時不發任何請求，且對外狀態恆為 local。 */
	enabled: boolean;
	/** GET／寫入收到 401 時呼叫；選擇器傳入 session 的 refresh。 */
	onUnauthorized: () => void;
}

export interface UseRemoteRosterStoreResult {
	players: Player[];
	/** 雲端資料寫入前已由後端驗證，不會有被丟棄的損壞筆數，恆為 0。 */
	droppedCount: number;
	addPlayer: (input: AddPlayerInput) => void;
	updatePlayer: (id: string, patch: UpdatePlayerPatch) => void;
	removePlayer: (id: string) => void;
	togglePlayerActive: (id: string) => void;
	resetRoster: () => void;
	syncStatus: SyncStatus;
}

type Payload = { op: "put"; player: Player } | { op: "delete" };
type LoadPhase = "loading" | "load-failed" | "ready";
type StickyStatus = "conflict" | "rejected" | null;

interface Controller {
	enqueue: (id: string, payload: Payload) => void;
	reset: () => void;
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

export function useRemoteRosterStore({
	enabled,
	onUnauthorized,
}: UseRemoteRosterStoreOptions): UseRemoteRosterStoreResult {
	const [players, setPlayers] = useState<Player[]>([]);
	// 用 reducer 取代 useState：effect 開頭要把狀態重設為 loading，dispatch 不會觸發
	// react-hooks/set-state-in-effect（沿用 useRemoteScoreboardStore 的寫法）
	const [status, setStatus] = useReducer(
		(_current: SyncStatus, next: SyncStatus): SyncStatus => next,
		"loading",
	);
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
		if (!enabled) return;
		// StrictMode 與 enabled 切換都會重跑本 effect：舊一輪在途的 GET 以 cancelled 忽略，
		// 舊一輪的 saver 由 disposeAll 釋放
		let cancelled = false;
		let stopped = false;
		let phase: LoadPhase = "loading";
		let sticky: StickyStatus = null;
		// 每次 disposeAll 加一：舊世代的在途 PUT 回來時不得把過期版本寫回新載入的 Map
		let epoch = 0;
		const versions = new Map<string, number>();
		const busy = new Map<string, "saving" | "retrying">();
		const savers = new Map<string, LatestWinsSaver<Payload>>();

		readyRef.current = false;
		setStatus("loading");

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
			readyRef.current = false;
			disposeAll();
			onUnauthorizedRef.current();
		}

		async function load(afterConflict: boolean): Promise<void> {
			const result = await fetchRemotePlayers();
			if (cancelled) return;
			if (result.kind === "unauthorized") {
				handleUnauthorized();
				return;
			}
			if (result.kind !== "ok" || result.value === undefined) {
				phase = "load-failed";
				readyRef.current = false;
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
			readyRef.current = true;
			publish();
		}

		function reloadAfterConflict(): void {
			// 先關閉寫入並釋放所有佇列，重載期間的動作與其他筆的待送變更都不再送出
			readyRef.current = false;
			disposeAll();
			void load(true);
		}

		async function send(id: string, payload: Payload): Promise<SaveOutcome> {
			const sentEpoch = epoch;
			if (payload.op === "delete") {
				const result = await deleteRemotePlayer(id);
				if (result.kind !== "ok") return result.kind;
				if (sentEpoch === epoch) versions.delete(id);
				return "ok";
			}
			// 在這裡才讀版本：同一人排隊的第二次 PUT 要帶第一次成功後的新版本
			const result = await putRemotePlayer(payload.player, versions.get(id) ?? 0);
			if (result.kind !== "ok") return result.kind;
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
					reloadAfterConflict();
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
			readyRef.current = false;
			const result = await resetRemoteMatchmaker();
			if (cancelled) return;
			if (result.kind === "ok") {
				disposeAll();
				replacePlayers([]);
				sticky = null;
				readyRef.current = true;
				publish();
				// 只清本次活動的本機進度，本機名單是訪客時期的資料，不能動
				resetLocalMatchProgress();
				return;
			}
			if (result.kind === "unauthorized") {
				handleUnauthorized();
				return;
			}
			readyRef.current = true;
			sticky = "rejected";
			publish();
		}

		controllerRef.current = { enqueue, reset: () => void reset() };
		void load(false);
		return () => {
			cancelled = true;
			readyRef.current = false;
			disposeAll();
			controllerRef.current = null;
		};
	}, [enabled, replacePlayers]);

	function addPlayer(input: AddPlayerInput): void {
		const controller = controllerRef.current;
		if (controller === null || !readyRef.current) return;
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
		if (controller === null || !readyRef.current) return;
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
		if (controller === null || !readyRef.current) return;
		if (!playersRef.current.some((player) => player.id === id)) return;
		replacePlayers(removePlayerFromRoster(playersRef.current, id));
		controller.enqueue(id, { op: "delete" });
	}

	function resetRoster(): void {
		const controller = controllerRef.current;
		if (controller === null || !readyRef.current) return;
		controller.reset();
	}

	return {
		players,
		droppedCount: 0,
		addPlayer,
		updatePlayer,
		removePlayer,
		togglePlayerActive,
		resetRoster,
		syncStatus: enabled ? status : "local",
	};
}
