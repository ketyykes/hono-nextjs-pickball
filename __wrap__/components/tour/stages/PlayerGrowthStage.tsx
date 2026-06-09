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
import { playerGrowth } from "@/data/tour/playerGrowth";

// 14 個小人組成的人群圖示，每個對應 1 萬人 = 14 萬。
// 每個小人在不同 progress 區間 fade in，依序堆出人數規模感。
const PERSON_COUNT = 14;
const ROWS = 2;
const COLS = PERSON_COUNT / ROWS;

interface PersonProps {
	source: MotionValue<number>;
	// 進場順序索引 0..PERSON_COUNT-1，同時用於計算 progress 區間
	order: number;
	x: number;
	y: number;
}

function Person({ source, order, x, y }: PersonProps) {
	// 小人在 [0.15, 0.95] 區間依 order 順序出場，每個間隔 ~5%
	const start = 0.15 + (order / PERSON_COUNT) * 0.7;
	const end = start + 0.08;
	const opacity = useTransform(source, [start, end], [0, 1]);

	return (
		<motion.g style={{ opacity }} transform={`translate(${x} ${y})`}>
			<circle cx="0" cy="-7" r="3.5" fill="#a3e635" />
			<rect x="-4" y="-3" width="8" height="11" rx="1.5" fill="#a3e635" />
		</motion.g>
	);
}

// stage 2：年度成長折線圖 + 右側人形圖示堆疊。
// 折線顯示 2020-2025 成長趨勢；右側 14 個小人代表 14 萬人，依序淡入給予規模感。
export function PlayerGrowthStage() {
	const ref = useRef<HTMLElement>(null);
	const progress = useStageProgress(ref);

	// fallback 設動畫終點 (1)：reduced-motion 直接看到完整折線與 14 個小人
	const fallback = useMotionValue(1);
	const source = progress ?? fallback;

	const maxPlayers = playerGrowth.at(-1)?.players ?? 1;
	const points = playerGrowth
		.map((d, i) => {
			const x = (i / (playerGrowth.length - 1)) * 520 + 20;
			const y = 280 - (d.players / maxPlayers) * 240;
			return `${x},${y}`;
		})
		.join(" ");

	const lineOpacity = useTransform(source, [0.05, 0.45], [0, 1]);

	return (
		<TourStage id="player-growth" ariaLabel="14 萬人正在打" stageRef={ref}>
			<div className="flex h-full w-full items-center justify-center bg-slate-900 text-white">
				<div className="flex flex-col items-center gap-10">
					<h2 className="text-center text-[clamp(2rem,5vw,4rem)] font-black">
						<span className="text-lime-400">14 萬</span>人正在打
					</h2>

					<svg
						viewBox="0 0 800 300"
						className="h-[300px] w-[800px] max-md:h-[200px] max-md:w-[360px]"
					>
						{/* 折線（左 0~560） */}
						<motion.polyline
							points={points}
							fill="none"
							stroke="#a3e635"
							strokeWidth="3"
							style={{ opacity: lineOpacity }}
						/>
						{playerGrowth.map((d, i) => {
							const x = (i / (playerGrowth.length - 1)) * 520 + 20;
							const y = 280 - (d.players / maxPlayers) * 240;
							return (
								<circle key={d.year} cx={x} cy={y} r="5" fill="#a3e635" />
							);
						})}

						{/* 右側 14 個小人組成的人群（每個 = 1 萬人） */}
						{Array.from({ length: PERSON_COUNT }, (_, i) => {
							const col = i % COLS;
							const row = Math.floor(i / COLS);
							const px = 590 + col * 28;
							const py = 90 + row * 100;
							return (
								<Person key={i} source={source} order={i} x={px} y={py} />
							);
						})}
						<text
							x="700"
							y="270"
							fill="#a3e635"
							fontSize="14"
							fontWeight="bold"
							textAnchor="middle"
							fontFamily="sans-serif"
						>
							每人 = 1 萬
						</text>
					</svg>

					<div className="grid grid-cols-6 gap-4 font-bebas text-2xl text-white/70">
						{playerGrowth.map((d) => (
							<div key={d.year} className="text-center">
								<div>{d.year}</div>
								<div className="text-xs text-white/40">
									{(d.players / 1000).toFixed(0)}k
								</div>
							</div>
						))}
					</div>
				</div>
			</div>
		</TourStage>
	);
}
