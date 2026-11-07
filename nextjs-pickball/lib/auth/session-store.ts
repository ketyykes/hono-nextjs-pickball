// 全頁共用的 session 外部 store，供 useSyncExternalStore 使用。
// 請求在「第一次被訂閱」時才發出，模組載入時不得發請求，
// 否則 SSR 與測試環境都會多出無謂的 fetch。
import { fetchSession, type SessionState } from "./session-client";

export type SessionSnapshot =
	| { status: "loading" }
	| ({ status: "ready" } & SessionState);

const LOADING: SessionSnapshot = { status: "loading" };

let snapshot: SessionSnapshot = LOADING;
let started = false;
// 遞增的請求編號：只有最新一次請求的回應能更新快照
let requestId = 0;
const listeners = new Set<() => void>();

function notify(): void {
	for (const listener of listeners) {
		listener();
	}
}

function load(): Promise<void> {
	// 不共用進行中的請求：初始請求在途時登入再 refresh，共用會拿到登入前的舊結果。
	// 重複請求由 started 旗標擋下，不需要靠共用。
	requestId += 1;
	const id = requestId;
	return fetchSession().then((state) => {
		// 已有更新的請求，丟棄這份過時的回應（可能亂序到達）
		if (id !== requestId) return;
		snapshot = { status: "ready", ...state };
		notify();
	});
}

export function subscribe(listener: () => void): () => void {
	listeners.add(listener);
	if (!started) {
		started = true;
		void load();
	}
	return () => {
		listeners.delete(listener);
	};
}

// 未變更時必須回傳同一個參考，否則 useSyncExternalStore 會無限 re-render
export function getSnapshot(): SessionSnapshot {
	return snapshot;
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
	snapshot = LOADING;
	started = false;
	requestId = 0;
	listeners.clear();
}
