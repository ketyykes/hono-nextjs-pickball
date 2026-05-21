"use client";

import { useRef, type ReactNode } from "react";
import { ScrollTimelineProvider } from "@/components/tour/shared/ScrollTimelineProvider";
import { TourProgressRail } from "@/components/tour/TourProgressRail";
import { TourSkipButton } from "@/components/tour/TourSkipButton";

interface TourShellProps {
	children: ReactNode;
}

// /tour 的 client shell：持有 main scroll container 的 ref，傳給 Provider 後
// stage 內 useStageProgress 才能正確讀取「main 內部捲動」的進度。
// page.tsx 維持 server component 以匯出 metadata。
export function TourShell({ children }: TourShellProps) {
	const mainRef = useRef<HTMLElement>(null);

	return (
		<ScrollTimelineProvider containerRef={mainRef}>
			<TourProgressRail />
			<TourSkipButton />
			<main
				ref={mainRef}
				className="relative h-[calc(100vh-var(--site-nav-h))] mt-[var(--site-nav-h)] snap-y snap-mandatory overflow-y-scroll bg-slate-900 text-white"
			>
				{children}
			</main>
		</ScrollTimelineProvider>
	);
}
