import { useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

// subscribe 註冊 matchMedia change listener；callback 觸發後 React 會重新拉 snapshot。
function subscribe(callback: () => void): () => void {
	if (typeof window === "undefined") return () => {};
	const mql = window.matchMedia(QUERY);
	mql.addEventListener("change", callback);
	return () => mql.removeEventListener("change", callback);
}

function getClientSnapshot(): boolean {
	return window.matchMedia(QUERY).matches;
}

// server 端永遠回 false，與 client first render 對齊以避免 hydration mismatch；
// hydration 完成後 React 才會切換到 getClientSnapshot 的真實值。
function getServerSnapshot(): boolean {
	return false;
}

// 監聽 prefers-reduced-motion: reduce，回傳目前狀態。
// 改用 useSyncExternalStore 而非 useState lazy initializer：避免「server false / client 立即讀真實值」造成的
// hydration mismatch，並讓行為與 ScrollTimelineProvider 對稱。
export function useReducedMotion(): boolean {
	return useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot);
}
