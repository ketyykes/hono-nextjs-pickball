"use client";

import { useCallback, useSyncExternalStore } from "react";

interface UseFullscreenResult {
	isSupported: boolean;
	isFullscreen: boolean;
	toggle: () => Promise<void>;
}

// 監聽 fullscreenchange；snapshot 由 React 之後再拉。subscribe 同時供
// isSupported 與 isFullscreen 兩個 useSyncExternalStore call（fullscreenEnabled
// 雖然不會在頁面期間變動，共用 subscribe 也無副作用）。
function subscribe(callback: () => void): () => void {
	if (typeof document === "undefined") return () => {};
	document.addEventListener("fullscreenchange", callback);
	return () => document.removeEventListener("fullscreenchange", callback);
}

function getSupportedSnapshot(): boolean {
	return !!document.fullscreenEnabled;
}

function getFullscreenSnapshot(): boolean {
	return !!document.fullscreenElement;
}

// server 端與 client first render 都回 false，避免 SSR/CSR hydration mismatch。
// hydration 完成後 React 會切到真實 snapshot。
function getServerSnapshot(): boolean {
	return false;
}

// 封裝 Fullscreen API；iOS Safari 與舊瀏覽器不支援時 isSupported=false。
export function useFullscreen(): UseFullscreenResult {
	const isSupported = useSyncExternalStore(
		subscribe,
		getSupportedSnapshot,
		getServerSnapshot,
	);
	const isFullscreen = useSyncExternalStore(
		subscribe,
		getFullscreenSnapshot,
		getServerSnapshot,
	);

	const toggle = useCallback(async () => {
		if (!isSupported) return;
		if (document.fullscreenElement) {
			await document.exitFullscreen();
		} else {
			await document.documentElement.requestFullscreen();
		}
	}, [isSupported]);

	return { isSupported, isFullscreen, toggle };
}
