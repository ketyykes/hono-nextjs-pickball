// 全頁共用的 session 外部 store，供 useSyncExternalStore 使用。
// 請求失敗（fetchSession 回 null）時：有上次登入提示 → 無法確認；沒有 → auth 停用的 ready。
// 請求在「第一次被訂閱」時才發出，模組載入時不得發請求，
// 否則 SSR 與測試環境都會多出無謂的 fetch。
import { fetchSession, type SessionState } from "./session-client";
import { clearSignedInHint, readSignedInHint, writeSignedInHint } from "./session-hint";

// loading 有三種：一般載入中、無法確認（必帶提示）、本機備援（使用者在無法確認時選擇先用本機資料）。
// 以 ?: never 補齊各變體的欄位，讓 lib/sync/storage-mode.ts 可直接讀 snapshot.unavailable／localFallback 而不需 in 判斷；
// 其他使用端讀 unavailable 一律經 pendingDataStatus；localFallback 只有 resolveStorageMode 與 LocalFallbackBanner 讀取。
export type SessionSnapshot =
	| {
			status: "loading";
			signedInHint?: true;
			unavailable?: never;
			localFallback?: never;
	  }
	| {
			status: "loading";
			signedInHint: true;
			unavailable: true;
			localFallback?: never;
	  }
	| {
			status: "loading";
			localFallback: true;
			signedInHint?: never;
			unavailable?: never;
	  }
	| ({ status: "ready" } & SessionState);

/** 帶提示等待 session 的上限；請求若永不結束，不能讓畫面永遠停在等待中。 */
export const SIGNED_IN_HINT_WAIT_MS = 10_000;

const LOADING: SessionSnapshot = { status: "loading" };
const LOADING_WITH_HINT: SessionSnapshot = { status: "loading", signedInHint: true };
// 兩個固定參考：getSnapshot 未變更時必須回傳同一個參考
const LOADING_UNAVAILABLE: SessionSnapshot = {
	status: "loading",
	signedInHint: true,
	unavailable: true,
};
const LOADING_LOCAL_FALLBACK: SessionSnapshot = {
	status: "loading",
	localFallback: true,
};

// 提示在 client 第一次讀快照時才讀一次；模組載入時（含 SSR）不碰 localStorage
let snapshot: SessionSnapshot | null = null;
let hintTimer: ReturnType<typeof setTimeout> | null = null;
let started = false;
// 遞增的請求編號：只有最新一次請求的回應能更新快照
let requestId = 0;
const listeners = new Set<() => void>();

function notify(): void {
	for (const listener of listeners) {
		listener();
	}
}

function clearHintTimer(): void {
	if (hintTimer !== null) {
		clearTimeout(hintTimer);
		hintTimer = null;
	}
}

function startHintTimer(): void {
	// 第一次訂閱可能早於任何一次 render 讀快照，這裡要先初始化快取（讀提示），才能判斷是否帶提示
	if (getSnapshot() !== LOADING_WITH_HINT) return;
	hintTimer = setTimeout(() => {
		hintTimer = null;
		// 已採用任何回應（ready）就不再動快照
		if (snapshot !== LOADING_WITH_HINT) return;
		// 逾時只代表等太久：不取消請求（晚到的回應照常採用），也不退回本機，
		// 否則已登入者會在不知情時改看、改寫本機資料。
		snapshot = LOADING_UNAVAILABLE;
		notify();
	}, SIGNED_IN_HINT_WAIT_MS);
}

function load(): Promise<void> {
	// 不共用進行中的請求：初始請求在途時登入再 refresh，共用會拿到登入前的舊結果。
	// 重複請求由 started 旗標擋下，不需要靠共用。
	requestId += 1;
	const id = requestId;
	return fetchSession().then((state) => {
		// 已有更新的請求，丟棄這份過時的回應（可能亂序到達）
		if (id !== requestId) return;
		clearHintTimer();
		if (state === null) {
			// 請求失敗：讀 localStorage 而非快照，才涵蓋已登入使用中 refresh 失敗（此時快照是 ready）。
			// 有提示時只是這次無法確認，不寫入也不清除提示；沒有提示時 fail-closed 為 auth 停用。
			if (readSignedInHint()) {
				snapshot = LOADING_UNAVAILABLE;
			} else {
				snapshot = { status: "ready", authEnabled: false, user: null };
			}
			// 已是無法確認時又採用到 null，快照參考不變，仍照常 notify：useSyncExternalStore 會略過，無害，刻意不特判。
			notify();
			return;
		}
		if (state.authEnabled && state.user !== null) {
			writeSignedInHint();
		} else {
			clearSignedInHint();
		}
		snapshot = { status: "ready", ...state };
		notify();
	});
}

export function subscribe(listener: () => void): () => void {
	listeners.add(listener);
	if (!started) {
		started = true;
		startHintTimer();
		void load();
	}
	return () => {
		listeners.delete(listener);
	};
}

// 未變更時必須回傳同一個參考，否則 useSyncExternalStore 會無限 re-render
export function getSnapshot(): SessionSnapshot {
	if (snapshot === null) {
		snapshot = readSignedInHint() ? LOADING_WITH_HINT : LOADING;
	}
	return snapshot;
}

/**
 * 使用者在「無法確認」時選擇先用這台裝置的資料。只在無法確認時有效；
 * 遞增請求編號使進行中請求的結果被丟棄，本次頁面期間不會被晚到的回應切走。不碰提示。
 */
export function chooseLocalFallback(): void {
	if (snapshot !== LOADING_UNAVAILABLE) return;
	requestId += 1;
	clearHintTimer();
	snapshot = LOADING_LOCAL_FALLBACK;
	notify();
}

// 固定為 loading，讓伺服器端與 hydration 的第一次 render 一致
export function getServerSnapshot(): SessionSnapshot {
	return LOADING;
}

// 回傳的 promise 在「這次」請求完成時 resolve；若期間又有更新的請求，
// 快照以最新那次為準，因此 await 之後讀到的未必是這次的結果
export function refresh(): Promise<void> {
	return load();
}

/** 僅供測試：還原為模組剛載入時的狀態。 */
export function resetSessionStoreForTests(): void {
	clearHintTimer();
	snapshot = null;
	started = false;
	requestId = 0;
	listeners.clear();
}
