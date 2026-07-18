"use client";

import { useRef } from "react";
import {
	motion,
	useMotionValue,
	useTransform,
	type MotionValue,
} from "motion/react";
import { TourStage } from "@/components/tour/TourStage";
import { useStageProgress } from "@/components/tour/shared/ScrollTimelineProvider";

// stage 1：球場大小對比。捲動進度 0→1 期間，匹克球場輪廓淡入，
// 計數器從 260 跑到 81；計數器永遠走 motion（不依 CSS scroll-timeline path）。
export function CourtSizeStage() {
	const ref = useRef<HTMLElement>(null);
	const progress = useStageProgress(ref);

	// fallback 設為動畫終點 (1) 而非起點 (0)，讓 reduced-motion 使用者直接看到
	// 動畫終點狀態（counter=81、匹克球場 opacity=1）而非空白起點
	const fallback = useMotionValue(1);
	const source = progress ?? fallback;

	const counter = useTransform(source, [0, 1], [260, 81]);
	const pickleOpacity = useTransform(source, [0.3, 1], [0, 1]);

	return (
		<TourStage id="court-size" ariaLabel="比網球更小，但同樣激烈" stageRef={ref}>
			<div className="flex h-full w-full items-center justify-center bg-slate-900 text-white">
				<div className="flex flex-col items-center gap-10">
					<h2 className="text-center text-[clamp(2rem,5vw,4rem)] font-black">
						比網球更小，<span className="text-lime-400">但同樣激烈</span>
					</h2>

					<div className="relative h-[300px] w-[600px] max-md:h-[200px] max-md:w-[360px]">
						{/* 網球場（大，lime 綠） */}
						<svg
							viewBox="0 0 600 300"
							className="absolute inset-0"
						>
							<rect x="20" y="20" width="560" height="260" fill="none" stroke="#a3e635" strokeWidth="3" />
							<line x1="300" y1="20" x2="300" y2="280" stroke="#a3e635" strokeWidth="2" />
							<text x="50" y="55" fill="#a3e635" fontSize="22" fontWeight="bold" fontFamily="sans-serif">
								網球場
							</text>
							<text x="50" y="82" fill="#a3e635" fontSize="16" fontFamily="sans-serif">
								260 ㎡
							</text>
						</svg>

						{/* 匹克球場（小，橙色）：捲動才淡入 */}
						<motion.svg
							style={{ opacity: pickleOpacity }}
							viewBox="0 0 600 300"
							className="absolute inset-0"
						>
							<rect x="215" y="90" width="170" height="120" fill="none" stroke="#fb923c" strokeWidth="3" />
							<line x1="300" y1="90" x2="300" y2="210" stroke="#fb923c" strokeWidth="2" />
							<text x="225" y="122" fill="#fb923c" fontSize="18" fontWeight="bold" fontFamily="sans-serif">
								匹克球場
							</text>
						</motion.svg>
					</div>

					{/* 計數器永遠走 motion，顯示 260→81 的動態變化；mobile 折兩行避免擠擠到 Skip 按鈕 */}
					<div className="flex items-center gap-3 font-bebas text-4xl max-md:flex-col max-md:gap-1 max-md:text-3xl">
						<span className="flex items-baseline gap-2">
							<span className="text-white/50">網球場</span>
							<span className="text-2xl text-white/40 max-md:text-xl">
								260 ㎡
							</span>
						</span>
						<span className="text-white/40 max-md:rotate-90">→</span>
						<span className="flex items-baseline gap-2">
							<span className="text-white/50">匹克球場</span>
							<Counter value={counter} />
							<span className="text-base text-white/60">㎡</span>
						</span>
					</div>
				</div>
			</div>
		</TourStage>
	);
}

function Counter({ value }: { value: MotionValue<number> }) {
	const display = useTransform(value, (v) => Math.round(v).toString());
	return <motion.span className="text-lime-400">{display}</motion.span>;
}
