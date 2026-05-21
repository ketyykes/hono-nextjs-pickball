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
			{/*
				main 用 inline style 處理 height / margin-top 而非 Tailwind arbitrary value：
				Tailwind v4 + Next.js dev/build pipeline 上 `h-[calc(100vh-var(--site-nav-h))]` 與
				`mt-[var(--site-nav-h)]` 的搭配實測沒生效（main 沒被推到 SiteNavbar 下方，stage 標題
				被白色 solid navbar 覆蓋），改用 style 直接寫 CSS 確保 var 取值與 calc 都被正確輸出。
				`100dvh` 取代 `100vh` 順帶處理行動瀏覽器位址列收合造成的高度跳動。
			*/}
			<main
				ref={mainRef}
				style={{
					height: "calc(100dvh - var(--site-nav-h))",
					marginTop: "var(--site-nav-h)",
				}}
				className="relative snap-y snap-mandatory overflow-y-scroll bg-slate-900 text-white"
			>
				{children}
			</main>
		</ScrollTimelineProvider>
	);
}
