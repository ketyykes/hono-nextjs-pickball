import { useSyncExternalStore } from "react";

const QUERY = "(orientation: landscape)";

// subscribe 註冊 matchMedia change listener；callback 觸發後 React 會重新拉 snapshot。
function subscribe(callback: () => void): () => void {
	if (typeof window === "undefined") return () => {};
	const mql = window.matchMedia(QUERY);
	mql.addEventListener("change", callback);
	return () => mql.removeEventListener("change", callback);
}

function getClientSnapshot(): "landscape" | "portrait" {
	return window.matchMedia(QUERY).matches ? "landscape" : "portrait";
}

// server 端永遠回 portrait（行動裝置常見預設），與 client first render 對齊避免 hydration mismatch；
// hydration 完成後 React 才會切換到 getClientSnapshot 的真實值。
function getServerSnapshot(): "portrait" {
	return "portrait";
}

// 偵測 viewport orientation；切換時自動 re-render。
// 沿用 useReducedMotion 的 useSyncExternalStore 模式以確保 SSR 安全。
export function useOrientation(): "landscape" | "portrait" {
	return useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot);
}
