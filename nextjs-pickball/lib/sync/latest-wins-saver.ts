// 雲端儲存佇列：單一在途、最新優先、退避重試、不可重試時停止。
// 版本號由呼叫端在 send 內帶入；本模組不持久化待送值（重新整理即遺失，由同步提示告知）。

/** send 的結果；可直接使用 requestJson 結果的 kind。 */
export type SaveOutcome =
	| "ok"
	| "conflict"
	| "unauthorized"
	| "rejected"
	| "failed";

/** 佇列停止的結果種類，呼叫端決定後續（重新載入、回本機模式、提示）。 */
export type SaverStopReason = Exclude<SaveOutcome, "ok" | "failed">;

/** onResult 回報的狀態轉換；雲端 hook 由此推導 SyncStatus。 */
export type SaverEvent = "saving" | "saved" | "retrying" | SaverStopReason;

export interface LatestWinsSaverOptions<T> {
	send: (payload: T) => Promise<SaveOutcome>;
	onResult: (event: SaverEvent) => void;
}

export interface LatestWinsSaver<T> {
	save: (payload: T) => void;
	dispose: () => void;
}

/** 失敗後依序等待的重試間隔；用完後沿用最後一個，直到成功或被停止。 */
export const RETRY_DELAYS_MS = [1000, 2000, 4000, 8000] as const;

export function createLatestWinsSaver<T>({
	send,
	onResult,
}: LatestWinsSaverOptions<T>): LatestWinsSaver<T> {
	// 用包一層的物件表示「有待送值」，T 本身可以是 undefined 或 falsy
	let pending: { payload: T } | null = null;
	let inFlight = false;
	let retryTimer: ReturnType<typeof setTimeout> | null = null;
	let failureCount = 0;
	let disposed = false;

	function clearRetryTimer(): void {
		if (retryTimer === null) return;
		clearTimeout(retryTimer);
		retryTimer = null;
	}

	function stop(reason: SaverStopReason): void {
		clearRetryTimer();
		pending = null;
		failureCount = 0;
		onResult(reason);
	}

	function scheduleRetry(): void {
		const index = Math.min(failureCount, RETRY_DELAYS_MS.length - 1);
		failureCount += 1;
		onResult("retrying");
		retryTimer = setTimeout(() => {
			retryTimer = null;
			flush();
		}, RETRY_DELAYS_MS[index]);
	}

	function handleOutcome(outcome: SaveOutcome, sent: T): void {
		// 卸載後才到達的結果一律忽略，避免幽靈重試與 setState 警告
		if (disposed) return;
		inFlight = false;

		if (outcome === "ok") {
			failureCount = 0;
			if (pending !== null) {
				flush();
				return;
			}
			onResult("saved");
			return;
		}

		if (outcome === "failed") {
			// 在途期間沒有更新的資料時，重試的是剛失敗的這份
			if (pending === null) pending = { payload: sent };
			scheduleRetry();
			return;
		}

		stop(outcome);
	}

	function flush(): void {
		if (pending === null) return;
		const { payload } = pending;
		pending = null;
		inFlight = true;
		onResult("saving");
		send(payload).then(
			(outcome) => handleOutcome(outcome, payload),
			() => handleOutcome("failed", payload),
		);
	}

	return {
		save(payload) {
			if (disposed) return;
			pending = { payload };
			// 在途或等待重試時只更新待送值，不重置等待時間
			if (inFlight || retryTimer !== null) return;
			flush();
		},
		dispose() {
			disposed = true;
			clearRetryTimer();
			pending = null;
		},
	};
}
