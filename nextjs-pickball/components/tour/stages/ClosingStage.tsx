"use client";

import { useRef } from "react";
import { motion, useMotionValue, useTransform } from "motion/react";
import { useRouter } from "next/navigation";
import { TourStage } from "@/components/tour/TourStage";
import { useStageProgress } from "@/components/tour/shared/ScrollTimelineProvider";
import { Button } from "@/components/ui/button";

// stage 6：收束 CTA。球員 SVG 由揮拍姿勢「收拍敬禮」（球拍從低到舉至胸前），
// 標題與按鈕浮現。按鈕點擊以 nav-back transition type 觸發 view transition 反向過場並回到 /。
export function ClosingStage() {
	const ref = useRef<HTMLElement>(null);
	const progress = useStageProgress(ref);
	const router = useRouter();

	// fallback 設動畫終點 (1)：reduced-motion 直接看到球員敬禮姿勢 + 標題 + CTA
	// （否則 progress=null 時 source=0、CTA opacity=0，使用者完全看不到「回到完整指南」按鈕）
	const fallback = useMotionValue(1);
	const source = progress ?? fallback;

	// 球拍角度：揮拍中段（向下偏前 60°）→ 中段 30° → 收拍敬禮（拍頭朝上 -30°）
	const paddleRotate = useTransform(source, [0, 0.5, 1], [60, 30, -30]);
	// 標題與按鈕在球員收拍後浮現
	const ctaOpacity = useTransform(source, [0.5, 1], [0, 1]);
	const ctaY = useTransform(source, [0.5, 1], [30, 0]);

	const onBack = () => {
		router.push("/", { transitionTypes: ["nav-back"] });
	};

	return (
		<TourStage id="closing" ariaLabel="準備好開始了嗎？" stageRef={ref}>
			<div className="flex h-full w-full items-center justify-center bg-slate-900 text-white">
				<div className="flex flex-col items-center gap-8">
					{/* 球員側視 SVG（簡化線條人 + 球拍） */}
					<svg
						viewBox="0 0 200 220"
						className="h-[180px] w-[180px] max-md:h-[140px] max-md:w-[140px]"
					>
						{/* 頭 */}
						<circle cx="100" cy="48" r="14" fill="#a3e635" />
						{/* 身體 */}
						<rect
							x="92"
							y="62"
							width="16"
							height="50"
							rx="4"
							fill="#a3e635"
						/>
						{/* 左腿 */}
						<line
							x1="100"
							y1="112"
							x2="88"
							y2="170"
							stroke="#a3e635"
							strokeWidth="6"
							strokeLinecap="round"
						/>
						{/* 右腿 */}
						<line
							x1="100"
							y1="112"
							x2="112"
							y2="170"
							stroke="#a3e635"
							strokeWidth="6"
							strokeLinecap="round"
						/>
						{/* 揮拍手臂 + 球拍：以肩膀 (108, 70) 為原點旋轉，從 60° 收到 -30° */}
						<g transform="translate(108 70)">
							<motion.g style={{ rotate: paddleRotate }}>
								{/* 手臂 */}
								<line
									x1="0"
									y1="0"
									x2="28"
									y2="32"
									stroke="#a3e635"
									strokeWidth="6"
									strokeLinecap="round"
								/>
								{/* 球拍頭 */}
								<ellipse
									cx="36"
									cy="42"
									rx="14"
									ry="20"
									fill="none"
									stroke="#fb923c"
									strokeWidth="3"
								/>
								{/* 球拍把手 */}
								<line
									x1="28"
									y1="32"
									x2="34"
									y2="38"
									stroke="#fb923c"
									strokeWidth="3"
								/>
							</motion.g>
						</g>
					</svg>

					{/* 標題與按鈕 */}
					<motion.div
						style={{ opacity: ctaOpacity, y: ctaY }}
						className="flex flex-col items-center gap-6"
					>
						<h2 className="text-center text-[clamp(2rem,5vw,4rem)] font-black">
							準備好<span className="text-lime-400">開始了嗎？</span>
						</h2>
						<Button
							onClick={onBack}
							className="bg-lime-400 text-slate-900 hover:bg-lime-300"
						>
							回到完整指南
						</Button>
					</motion.div>
				</div>
			</div>
		</TourStage>
	);
}
