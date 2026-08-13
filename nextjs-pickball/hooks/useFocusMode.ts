"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface UseFocusModeOptions {
	isFullscreen: boolean;
}

interface UseFocusModeResult {
	focusMode: boolean;
	toggleFocusMode: () => void;
}

// 專注模式狀態：切換 focusMode 並把 sb-focus class 同步到 documentElement，
// SiteNavbar 以 CSS variant（[.sb-focus_&]:hidden）回應，不需知道 scoreboard 狀態。
// 接收 isFullscreen 參數而非自行呼叫 useFullscreen，happy-dom 下以 rerender 即可測。
export function useFocusMode({
	isFullscreen,
}: UseFocusModeOptions): UseFocusModeResult {
	const [focusMode, setFocusMode] = useState(false);
	const prevFullscreenRef = useRef(isFullscreen);

	// Esc／系統手勢退出 fullscreen（true→false）時同步退出專注模式。
	// 必須以「前值為 true」為條件：isFullscreen 恆為 false 的裝置
	// （如 iPhone Safari 不支援 Fullscreen API）不得誤退。
	useEffect(() => {
		if (prevFullscreenRef.current && !isFullscreen) {
			setFocusMode(false);
		}
		prevFullscreenRef.current = isFullscreen;
	}, [isFullscreen]);

	// sb-focus 是全域副作用，unmount（導航離開 /scoreboard）必須清除，
	// 否則會污染其他路由的 navbar 顯示。
	useEffect(() => {
		document.documentElement.classList.toggle("sb-focus", focusMode);
		return () => {
			document.documentElement.classList.remove("sb-focus");
		};
	}, [focusMode]);

	const toggleFocusMode = useCallback(() => {
		setFocusMode((prev) => !prev);
	}, []);

	return { focusMode, toggleFocusMode };
}
