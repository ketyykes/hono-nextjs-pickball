"use client";

import { useRef } from "react";
import { motion, useMotionValue, useTransform } from "motion/react";
import { TourStage } from "@/components/tour/TourStage";
import { useStageProgress } from "@/components/tour/shared/ScrollTimelineProvider";

// stage 3：兩跳規則。球軌跡 SVG 由發球到截擊，pathLength 隨進度補；球的 cx/cy motion 補間。
export function TwoBounceStage() {
	const ref = useRef<HTMLElement>(null);
	const progress = useStageProgress(ref);

	// fallback 設動畫終點 (1)：reduced-motion 直接看到球軌跡虛線與球的最終位置
	const fallback = useMotionValue(1);
	const source = progress ?? fallback;

	const ballX = useTransform(source, [0, 0.25, 0.5, 0.75, 1], [60, 200, 340, 480, 540]);
	const ballY = useTransform(source, [0, 0.25, 0.5, 0.75, 1], [200, 260, 200, 260, 200]);
	// 軌跡虛線淡入：motion pathLength 會覆蓋 strokeDasharray，改用 opacity fade-in 保留虛線視覺
	const trailOpacity = useTransform(source, [0.05, 0.4], [0, 1]);

	return (
		<TourStage id="two-bounce" ariaLabel="兩跳規則，最關鍵的一條" stageRef={ref}>
			<div className="flex h-full w-full items-center justify-center bg-slate-900 text-white">
				<div className="flex flex-col items-center gap-12">
					<h2 className="text-center text-[clamp(2rem,5vw,4rem)] font-black">
						兩跳規則，<span className="text-lime-400">最關鍵的一條</span>
					</h2>

					<svg viewBox="0 0 600 300" className="h-[300px] w-[600px] max-md:h-[200px] max-md:w-[360px]">
						<line x1="0" y1="280" x2="600" y2="280" stroke="#475569" strokeWidth="2" />
						<motion.path
							d="M 60 200 Q 130 80 200 260 Q 270 80 340 200 Q 410 80 480 260 Q 510 200 540 200"
							fill="none"
							stroke="#fb923c"
							strokeWidth="2"
							strokeDasharray="6 6"
							style={{ opacity: trailOpacity }}
						/>
						<motion.circle
							r="10"
							fill="#a3e635"
							cx={progress ? ballX : 540}
							cy={progress ? ballY : 200}
						/>
					</svg>
				</div>
			</div>
		</TourStage>
	);
}
