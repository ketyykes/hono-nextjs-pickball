"use client";

import {
	createContext,
	useContext,
	type ReactNode,
	type RefObject,
} from "react";
import type { MotionValue } from "motion/react";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useEnterAnimationProgress } from "@/hooks/useEnterAnimationProgress";

// 提供 /tour 內部 scroll container 之 ref 給子元件——stage 進場 IntersectionObserver
// 與 progress rail 都需要這個 ref 作為 observer root，否則會以 viewport 為 root，
// 偵測 main 內部捲動失敗（最後一個 stage 永遠不觸發 enter 等）。
interface TourScrollContextValue {
	readonly containerRef: RefObject<HTMLElement | null> | undefined;
}

const defaultContext: TourScrollContextValue = {
	containerRef: undefined,
};

const TourScrollContext =
	createContext<TourScrollContextValue>(defaultContext);

interface ScrollTimelineProviderProps {
	children: ReactNode;
	// /tour 的 main h-screen overflow-y-scroll 容器之 ref。
	containerRef?: RefObject<HTMLElement | null>;
}

export function ScrollTimelineProvider({
	children,
	containerRef,
}: ScrollTimelineProviderProps) {
	return (
		<TourScrollContext.Provider value={{ containerRef }}>
			{children}
		</TourScrollContext.Provider>
	);
}

// 取得 /tour 內部 scroll container 之 ref，供 IntersectionObserver 之 root 使用。
export function useTourScrollContainer():
	| RefObject<HTMLElement | null>
	| undefined {
	return useContext(TourScrollContext).containerRef;
}

// 統一抽象：stage 進入 viewport 時觸發一次性 0→1 motion 動畫，作為 stage 內部
// useTransform 的進度來源。reduced-motion 時回 null，stage 元件以 fallback motion value
// (= 1) 配 useTransform 直接顯示動畫終點狀態。
// 採用「進場觸發」而非 scroll-driven 是因為 /tour 用 snap-mandatory，沒有「捲動進度」
// 的中間態可看；進場一次性動畫直觀且每 stage snap 進入時都會播放完整動畫。
export function useStageProgress(
	target: RefObject<HTMLElement | null>,
): MotionValue<number> | null {
	const containerRef = useTourScrollContainer();
	const reduced = useReducedMotion();
	const progress = useEnterAnimationProgress(target, { root: containerRef });

	if (reduced) return null;
	return progress;
}
