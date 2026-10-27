// hooks/useRemoteHistory.ts
"use client";

import { useEffect, useReducer, useRef } from "react";
import type { HistoryListResponse } from "@pickball/core/api/history";
import { rangeBounds, type HistoryRange } from "@pickball/core/matchmaker/history-range";
import { fetchRemoteHistory, type FetchHistoryQuery } from "@/lib/sync/history-api";
import type { SyncStatus } from "@/lib/sync/sync-status";

export interface UseRemoteHistoryOptions {
	/** false 時不發任何請求，且對外同步狀態恆為 local。 */
	enabled: boolean;
	/**
	 * 目前登入的帳號。換帳號即結束舊世代並重新載入；為 null 時視同停用，
	 * 避免以不明帳號送出請求。
	 */
	userId: string | null;
	range: HistoryRange;
	/** GET 收到 401（含 ACCOUNT_MISMATCH）時呼叫；選擇器傳入 session 的 refresh。 */
	onUnauthorized: () => void;
}

export interface UseRemoteHistoryResult {
	items: HistoryListResponse["items"];
	total: number;
	droppedCount: number;
	syncStatus: SyncStatus;
}

interface HistoryState extends UseRemoteHistoryResult {
	/** 這份結果屬於哪個帳號；與 render 時的 userId 不同代表 effect 還沒換世代。 */
	owner: string | null;
}

type HistoryAction =
	| { type: "begin"; owner: string }
	| { type: "loaded"; response: HistoryListResponse }
	| { type: "failed" };

const INITIAL_STATE: HistoryState = {
	owner: null,
	items: [],
	total: 0,
	droppedCount: 0,
	syncStatus: "loading",
};

// 回傳穩定的常數，避免每次 render 都產生新陣列而讓使用端的 effect 依賴一直變動
const LOCAL_RESULT: UseRemoteHistoryResult = {
	items: [],
	total: 0,
	droppedCount: 0,
	syncStatus: "local",
};
const LOADING_RESULT: UseRemoteHistoryResult = {
	items: [],
	total: 0,
	droppedCount: 0,
	syncStatus: "loading",
};

function historyReducer(current: HistoryState, action: HistoryAction): HistoryState {
	switch (action.type) {
		case "begin":
			// 每次重新載入都清掉上一份結果，不讓前一個區間或帳號的資料在載入中殘留
			return { ...INITIAL_STATE, owner: action.owner };
		case "loaded":
			return {
				...current,
				items: action.response.items,
				total: action.response.total,
				droppedCount: action.response.droppedCount,
				syncStatus: "synced",
			};
		case "failed":
			return { ...current, syncStatus: "load-failed" };
	}
}

/**
 * 登入時的雲端歷史讀取。區間界線在前端以使用者裝置時區算好再交給後端
 * （Workers 為 UTC，由後端算「今天」會差一個時區）。
 */
export function useRemoteHistory({
	enabled,
	userId,
	range,
	onUnauthorized,
}: UseRemoteHistoryOptions): UseRemoteHistoryResult {
	const [state, dispatch] = useReducer(historyReducer, INITIAL_STATE);
	const active = enabled && userId !== null;

	// 請求序號：range 快速切換時只採用最後一次請求的結果
	const requestSeqRef = useRef(0);
	const onUnauthorizedRef = useRef(onUnauthorized);

	useEffect(() => {
		onUnauthorizedRef.current = onUnauthorized;
	}, [onUnauthorized]);

	useEffect(() => {
		if (!enabled || userId === null) return;
		// 世代內的請求都用這個帳號，不在送出當下改讀其他來源
		const expectedUserId = userId;
		const requestId = ++requestSeqRef.current;
		// 卸載、停用與換帳號時舊的在途結果以 cancelled 旗標忽略
		let cancelled = false;
		dispatch({ type: "begin", owner: expectedUserId });

		// 「現在」在 effect 內取一次：區間界線由這個時間點決定，render 期間不取系統時鐘
		const bounds = rangeBounds(range, new Date());
		const query: FetchHistoryQuery = {};
		if (bounds.from !== null) query.from = bounds.from;
		if (bounds.to !== null) query.to = bounds.to;

		async function load(): Promise<void> {
			const result = await fetchRemoteHistory(expectedUserId, query);
			if (cancelled || requestId !== requestSeqRef.current) return;
			if (result.kind === "unauthorized") {
				onUnauthorizedRef.current();
				return;
			}
			if (result.kind !== "ok" || result.value === undefined) {
				dispatch({ type: "failed" });
				return;
			}
			dispatch({ type: "loaded", response: result.value });
		}

		void load();

		return () => {
			cancelled = true;
		};
	}, [enabled, userId, range]);

	if (!active) return LOCAL_RESULT;
	if (state.owner !== userId) return LOADING_RESULT;
	return {
		items: state.items,
		total: state.total,
		droppedCount: state.droppedCount,
		syncStatus: state.syncStatus,
	};
}
