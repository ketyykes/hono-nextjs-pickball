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
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();

function notify(): void {
	for (const listener of listeners) {
		listener();
	}
}

function load(): Promise<void> {
	// 進行中的請求共用，避免 navbar 與登入頁同時掛載時重複請求
	if (inflight) return inflight;
	inflight = fetchSession().then((state) => {
		snapshot = { status: "ready", authEnabled: state.authEnabled, user: state.user };
		inflight = null;
		notify();
	});
	return inflight;
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

export function refresh(): Promise<void> {
	return load();
}

/** 僅供測試：還原為模組剛載入時的狀態。 */
export function resetSessionStoreForTests(): void {
	snapshot = LOADING;
	started = false;
	inflight = null;
	listeners.clear();
}
