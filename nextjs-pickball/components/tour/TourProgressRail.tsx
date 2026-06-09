"use client";

import { useEffect, useState } from "react";
import { useTourScrollContainer } from "@/components/tour/shared/ScrollTimelineProvider";

const STAGE_IDS = [
	"court-size",
	"player-growth",
	"two-bounce",
	"kitchen-violation",
	"materials-spectrum",
	"closing",
] as const;

// 左側 fixed 直條，6 格依當前 stage 高亮。以 IntersectionObserver 偵測哪一個 stage
// 占視窗中央較多；observer root 對齊 main scroll container（與 useStageProgress 一致）
// 而非預設 viewport，避免日後 layout 改動讓 main 不再滿 viewport 時偵測失準。
export function TourProgressRail() {
	const containerRef = useTourScrollContainer();
	const [activeIndex, setActiveIndex] = useState(0);

	useEffect(() => {
		const root = containerRef?.current ?? null;
		const observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (!entry.isIntersecting || entry.intersectionRatio <= 0.5) continue;
					const id = entry.target.getAttribute("data-stage-id");
					const idx = STAGE_IDS.indexOf(
						id as (typeof STAGE_IDS)[number],
					);
					if (idx !== -1) setActiveIndex(idx);
				}
			},
			{ root, threshold: [0.5] },
		);

		for (const id of STAGE_IDS) {
			const el = document.querySelector<HTMLElement>(`[data-stage-id="${id}"]`);
			if (el) observer.observe(el);
		}

		return () => observer.disconnect();
	}, [containerRef]);

	return (
		<div
			role="progressbar"
			aria-valuemin={1}
			aria-valuemax={STAGE_IDS.length}
			aria-valuenow={activeIndex + 1}
			aria-label="導覽進度"
			className="fixed top-1/2 left-6 z-50 flex -translate-y-1/2 flex-col gap-2"
		>
			{STAGE_IDS.map((id, idx) => (
				<span
					key={id}
					data-active={idx === activeIndex}
					className="block h-8 w-1 rounded-full bg-white/20 transition-colors data-[active=true]:bg-lime-400"
				/>
			))}
		</div>
	);
}
