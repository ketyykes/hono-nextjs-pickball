// hooks/useRemoteScoreboardStore.ts
"use client";

import { useEffect, useReducer, useRef, type Dispatch } from "react";
import { createInitialState, scoreboardReducer } from "@pickball/core/scoreboard/reducer";
import { ScoreboardStateSchema } from "@pickball/core/scoreboard/types";
import type { Action, ScoreboardState } from "@pickball/core/scoreboard/types";
import { versionedEnvelopeSchema } from "@pickball/core/api/versioned";
import { requestJson } from "@/lib/sync/api-client";
import {
	createLatestWinsSaver,
	type SaveOutcome,
	type SaverEvent,
} from "@/lib/sync/latest-wins-saver";
import type { SyncStatus } from "@/lib/sync/sync-status";

const CURRENT_PATH = "/api/scoreboard/current";
const envelopeSchema = versionedEnvelopeSchema(ScoreboardStateSchema);

export interface UseRemoteScoreboardStoreOptions {
	/** false 時不發任何請求，且對外狀態恆為 local。 */
	enabled: boolean;
	/**
	 * 目前登入的帳號。換帳號即結束舊世代並重新載入；為 null 時視同停用，
	 * 避免以不明帳號送出請求。
	 */
	userId: string | null;
	/** GET／PUT 收到 401 時呼叫；選擇器傳入 session 的 refresh。 */
	onUnauthorized: () => void;
}

// dirty 標記「這次變更來自使用者動作」：HYDRATE（載入與衝突重載）不是使用者變更，
// 不能被寫回雲端。把標記放進 reducer 狀態而非 ref，是因為 reducer 回傳同一個狀態
// 時 effect 不會執行，ref 旗標會殘留到之後的 HYDRATE 而誤觸寫回。
interface TrackedState {
	state: ScoreboardState;
	dirty: boolean;
}

function trackedReducer(current: TrackedState, action: Action): TrackedState {
	const next = scoreboardReducer(current.state, action);
	return { state: next, dirty: action.type !== "HYDRATE" };
}

// 換帳號的那一幀、effect 還沒重設狀態前使用：呼叫端拿到的 dispatch 不得改到前一帳號的資料
const IGNORE_ACTION: Dispatch<Action> = () => {};
const INITIAL_SCOREBOARD_STATE = createInitialState();

type StatusAction =
	| { type: "set"; status: SyncStatus }
	| { type: "saver"; event: SaverEvent };

// saver 事件到 SyncStatus 的映射。重送時的 saving 不覆蓋 retrying、conflict、
// rejected：避免重試提示閃爍，也讓衝突文案維持到下一次儲存成功（synced）為止。
function statusReducer(current: SyncStatus, action: StatusAction): SyncStatus {
	if (action.type === "set") return action.status;
	switch (action.event) {
		case "saving":
			if (current === "retrying" || current === "conflict" || current === "rejected") {
				return current;
			}
			return "saving";
		case "saved":
			return "synced";
		case "retrying":
			return "retrying";
		case "rejected":
			return "rejected";
		// conflict 要等重新載入完成才設為 conflict；unauthorized 交給 onUnauthorized，
		// 狀態不動（選擇器會切回本機）
		default:
			return current;
	}
}

/**
 * 登入時獨立計分板的雲端實作：載入、最新優先儲存、版本衝突時以雲端為準。
 * 回傳 [state, dispatch, syncStatus]，其他雲端 hook 依此形態實作。
 */
export function useRemoteScoreboardStore({
	enabled,
	userId,
	onUnauthorized,
}: UseRemoteScoreboardStoreOptions): readonly [ScoreboardState, Dispatch<Action>, SyncStatus] {
	const [tracked, dispatch] = useReducer(
		trackedReducer,
		undefined,
		(): TrackedState => ({ state: createInitialState(), dirty: false }),
	);
	const [status, dispatchStatus] = useReducer(statusReducer, "loading");
	// 目前狀態屬於哪個帳號：render 時與 userId 不同代表 effect 還沒換世代，
	// 此時不能把前一帳號的資料交給畫面
	const [owner, setOwner] = useReducer(
		(_current: string | null, next: string | null): string | null => next,
		null,
	);
	const active = enabled && userId !== null;

	// null 代表尚未取得雲端版本（載入中、載入失敗、已收到 401）：此時 SHALL NOT 寫入
	const versionRef = useRef<number | null>(null);
	const saverRef = useRef<ReturnType<typeof createLatestWinsSaver<ScoreboardState>> | null>(
		null,
	);
	const onUnauthorizedRef = useRef(onUnauthorized);

	useEffect(() => {
		onUnauthorizedRef.current = onUnauthorized;
	}, [onUnauthorized]);

	useEffect(() => {
		if (!enabled || userId === null) return;
		// 世代內的每個請求都用這個帳號，不在送出當下改讀其他來源：
		// 否則舊世代的待送值可能帶著新帳號的標頭通過伺服器守衛
		const expectedUserId = userId;
		// StrictMode、enabled 與 userId 切換都會重跑本 effect：每次都重建 saver 並於 cleanup 釋放，
		// 舊的在途結果以 cancelled 旗標忽略
		let cancelled = false;
		versionRef.current = null;
		// 不殘留前一個世代的比分；HYDRATE 不標 dirty，不會寫回雲端
		dispatch({ type: "HYDRATE", state: createInitialState() });
		setOwner(expectedUserId);
		dispatchStatus({ type: "set", status: "loading" });

		async function loadCurrent(afterConflict: boolean): Promise<void> {
			const result = await requestJson("GET", CURRENT_PATH, {
				schema: envelopeSchema,
				expectedUserId,
			});
			if (cancelled) return;
			if (result.kind === "unauthorized") {
				versionRef.current = null;
				onUnauthorizedRef.current();
				return;
			}
			if (result.kind !== "ok" || result.value === undefined) {
				versionRef.current = null;
				dispatchStatusSafe("load-failed");
				return;
			}
			versionRef.current = result.value.version;
			// 無資料時也要 HYDRATE 初始狀態：同一個 mount 內 enabled 切換（換帳號）後，
			// 不能殘留前一輪的比分。HYDRATE 不標 dirty，不會寫回雲端。
			dispatch({ type: "HYDRATE", state: result.value.data ?? createInitialState() });
			dispatchStatusSafe(afterConflict ? "conflict" : "synced");
		}

		function dispatchStatusSafe(next: SyncStatus): void {
			if (!cancelled) dispatchStatus({ type: "set", status: next });
		}

		async function send(payload: ScoreboardState): Promise<SaveOutcome> {
			const result = await requestJson("PUT", CURRENT_PATH, {
				body: { data: payload, version: versionRef.current },
				schema: envelopeSchema,
				expectedUserId,
			});
			if (result.kind !== "ok") return result.kind;
			if (result.value === undefined) return "failed";
			versionRef.current = result.value.version;
			return "ok";
		}

		const saver = createLatestWinsSaver<ScoreboardState>({
			send,
			onResult(event) {
				if (cancelled) return;
				if (event === "unauthorized") {
					versionRef.current = null;
					onUnauthorizedRef.current();
					return;
				}
				if (event === "conflict") {
					void loadCurrent(true);
					return;
				}
				dispatchStatus({ type: "saver", event });
			},
		});
		saverRef.current = saver;
		void loadCurrent(false);

		return () => {
			cancelled = true;
			saver.dispose();
			saverRef.current = null;
		};
	}, [enabled, userId]);

	useEffect(() => {
		if (!tracked.dirty) return;
		// 尚未取得版本（載入中、載入失敗、401 之後）不寫入，否則只會得到 409 或覆蓋未知資料
		if (versionRef.current === null) return;
		saverRef.current?.save(tracked.state);
	}, [tracked]);

	if (!active) return [tracked.state, dispatch, "local"] as const;
	if (owner !== userId) return [INITIAL_SCOREBOARD_STATE, IGNORE_ACTION, "loading"] as const;
	return [tracked.state, dispatch, status] as const;
}
