// 全頁共用的 session 外部 store，供 useSyncExternalStore 使用。
// 請求在「第一次被訂閱」時才發出，模組載入時不得發請求，
// 否則 SSR 與測試環境都會多出無謂的 fetch。
import { fetchSession, type SessionState } from "./session-client";
import { clearSignedInHint, readSignedInHint, writeSignedInHint } from "./session-hint";

export type SessionSnapshot =
	| { status: "loading"; signedInHint?: true }
	| ({ status: "ready" } & SessionState);

/** 帶提示等待 session 的上限；請求若永不結束，不能讓畫面永遠停在等待中。 */
export const SIGNED_IN_HINT_WAIT_MS = 10_000;

const LOADING: SessionSnapshot = { status: "loading" };
const LOADING_WITH_HINT: SessionSnapshot = { status: "loading", signedInHint: true };

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
		snapshot = LOADING;
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
		if (state.authEnabled && state.user !== null) {
			writeSignedInHint();
		} else {
			clearSignedInHint();
		}
		clearHintTimer();
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
