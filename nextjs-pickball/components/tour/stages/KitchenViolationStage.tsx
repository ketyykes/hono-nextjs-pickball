"use client";

import { useRef } from "react";
import { motion, useMotionValue, useTransform } from "motion/react";
import { TourStage } from "@/components/tour/TourStage";
import { useStageProgress } from "@/components/tour/shared/ScrollTimelineProvider";

// 俯視腳掌（橢圓主體 + 腳趾排列），用以辨識「站在廚房內」的人位置
function Foot({ x, y }: { x: number; y: number }) {
	return (
		<g transform={`translate(${x} ${y})`}>
			<ellipse cx="0" cy="0" rx="8" ry="14" fill="white" />
			<circle cx="-5" cy="-14" r="2.4" fill="white" />
			<circle cx="-1.5" cy="-17" r="2.8" fill="white" />
			<circle cx="2.5" cy="-17" r="2.6" fill="white" />
			<circle cx="5.5" cy="-15" r="2.2" fill="white" />
		</g>
	);
}

// stage 4：廚房違規。俯視匹克球場，敘事為「站在廚房內 → 球飛入 → 截擊瞬間 = 犯規」。
// 重點：進入廚房本身合法；違規條件是「在廚房內凌空截擊（球未落地就回擊）」。
export function KitchenViolationStage() {
	const ref = useRef<HTMLElement>(null);
	const progress = useStageProgress(ref);

	// fallback 設動畫終點 (1)：reduced-motion 直接看到紅區+腳印+球+紅閃+✕ 警示終點狀態
	const fallback = useMotionValue(1);
	const source = progress ?? fallback;

	const kitchenOpacity = useTransform(source, [0, 0.35], [0, 0.85]);
	const feetOpacity = useTransform(source, [0.35, 0.55], [0, 1]);
	const ballOpacity = useTransform(source, [0.5, 0.6], [0, 1]);
	const ballCy = useTransform(source, [0.5, 0.85], [60, 215]);
	const flashOpacity = useTransform(source, [0.85, 1], [0, 0.55]);
	const xOpacity = useTransform(source, [0.85, 1], [0, 1]);

	return (
		<TourStage
			id="kitchen-violation"
			ariaLabel="廚房：站在裡面絕對不能截擊"
			stageRef={ref}
		>
			<div className="flex h-full w-full items-center justify-center bg-slate-900 text-white">
				<div className="flex flex-col items-center gap-8">
					<h2 className="text-center text-[clamp(2rem,5vw,4rem)] font-black">
						廚房：<span className="text-orange-500">絕對不能截擊</span>
					</h2>

					<svg
						viewBox="0 0 280 440"
						className="h-[420px] w-[280px] max-md:h-[320px] max-md:w-[210px]"
					>
						{/* 場地外框 */}
						<rect
							x="20"
							y="20"
							width="240"
							height="400"
							fill="none"
							stroke="#a3e635"
							strokeWidth="3"
						/>

						{/* 廚房紅區（球網兩側 80 高、總高 160） */}
						<motion.rect
							x="20"
							y="160"
							width="240"
							height="160"
							fill="#fb923c"
							style={{ opacity: kitchenOpacity }}
						/>

						{/* 廚房邊界線（橙虛線） */}
						<line
							x1="20"
							y1="160"
							x2="260"
							y2="160"
							stroke="#fb923c"
							strokeWidth="2"
							strokeDasharray="6 4"
							opacity="0.9"
						/>
						<line
							x1="20"
							y1="320"
							x2="260"
							y2="320"
							stroke="#fb923c"
							strokeWidth="2"
							strokeDasharray="6 4"
							opacity="0.9"
						/>

						{/* 球網（橫向白虛線） */}
						<line
							x1="20"
							y1="240"
							x2="260"
							y2="240"
							stroke="white"
							strokeWidth="3"
							strokeDasharray="2 3"
						/>

						{/* 中線（廚房外的後場上下兩段） */}
						<line
							x1="140"
							y1="20"
							x2="140"
							y2="160"
							stroke="#a3e635"
							strokeWidth="2"
						/>
						<line
							x1="140"
							y1="320"
							x2="140"
							y2="420"
							stroke="#a3e635"
							strokeWidth="2"
						/>

						{/* 標示 */}
						<text
							x="180"
							y="200"
							fill="white"
							fontSize="13"
							fontWeight="bold"
							fontFamily="sans-serif"
						>
							廚房 NVZ
						</text>
						<text
							x="265"
							y="244"
							fill="white"
							fontSize="11"
							fontFamily="sans-serif"
						>
							網
						</text>

						{/* 球從球網對面（上方）飛入（lime 綠色） */}
						<motion.circle
							cx="140"
							r="6"
							fill="#a3e635"
							style={{ opacity: ballOpacity, cy: ballCy }}
						/>

						{/* 腳印（兩個腳掌站在廚房內、球網下方） */}
						<motion.g style={{ opacity: feetOpacity }}>
							<Foot x={130} y={245} />
							<Foot x={150} y={245} />
						</motion.g>

						{/* 紅閃覆蓋整個廚房 */}
						<motion.rect
							x="20"
							y="160"
							width="240"
							height="160"
							fill="#dc2626"
							style={{ opacity: flashOpacity }}
						/>

						{/* 截擊瞬間的 ✕ 警示符號（位於球落下處） */}
						<motion.g style={{ opacity: xOpacity }}>
							<line
								x1="125"
								y1="200"
								x2="155"
								y2="230"
								stroke="white"
								strokeWidth="4"
								strokeLinecap="round"
							/>
							<line
								x1="155"
								y1="200"
								x2="125"
								y2="230"
								stroke="white"
								strokeWidth="4"
								strokeLinecap="round"
							/>
						</motion.g>
					</svg>

					<p className="max-w-md text-center text-sm text-white/60">
						隨時都能進入廚房，但站在裡面（包括踩線）
						<span className="text-orange-400">絕對不能截擊</span>
						<br />
						<span className="text-white/40">
							截擊 = 球落地前直接凌空回擊
						</span>
					</p>
				</div>
			</div>
		</TourStage>
	);
}
