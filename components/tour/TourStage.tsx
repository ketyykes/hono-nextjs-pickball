"use client";

import type { ReactNode, Ref } from "react";

export type StageId =
	| "court-size"
	| "player-growth"
	| "two-bounce"
	| "kitchen-violation"
	| "materials-spectrum"
	| "closing";

interface TourStageProps {
	id: StageId;
	ariaLabel: string;
	children: ReactNode;
	stageRef?: Ref<HTMLElement>;
}

// /tour 之 stage 共用容器：100vh 高度、scroll-snap-align、a11y label、data-stage-id 供 E2E 取用。
// 視覺與動畫由 children 自行決定；本元件只負責版面與語意。
export function TourStage({ id, ariaLabel, children, stageRef }: TourStageProps) {
	return (
		<section
			ref={stageRef}
			data-stage-id={id}
			aria-label={ariaLabel}
			className="relative h-full w-full snap-start overflow-hidden"
		>
			{children}
		</section>
	);
}
