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

// stage 5：球拍材質。三張卡片並列展示，依 progress 區間依序 fadeUp 進場。
// 不採水平 pin 推移：在 snap-mandatory layout 下推移看不出層次，並列比較反而更直觀。
const cards = [
	{ id: "fiberglass", name: "玻纖", color: "#a3e635", desc: "便宜、耐打、力道大" },
	{ id: "carbon", name: "碳纖", color: "#fb923c", desc: "靈敏、控球佳、價位中高" },
	{ id: "kevlar", name: "凱夫拉", color: "#facc15", desc: "強度極高、進階首選" },
] as const;

interface CardItemProps {
	card: (typeof cards)[number];
	source: MotionValue<number>;
	index: number;
}

function CardItem({ card, source, index }: CardItemProps) {
	// stagger 進場：第 1 張 [0, 0.45]、第 2 張 [0.2, 0.65]、第 3 張 [0.4, 0.85]
	const start = index * 0.2;
	const end = start + 0.45;
	const opacity = useTransform(source, [start, end], [0, 1]);
	const y = useTransform(source, [start, end], [40, 0]);

	return (
		<motion.div
			style={{ opacity, y, borderColor: card.color }}
			className="flex h-[280px] flex-col items-center justify-center gap-4 rounded-2xl border-2 bg-slate-800 p-8 max-md:h-[120px] max-md:gap-2 max-md:p-4"
		>
			<div
				className="font-bebas text-5xl max-md:text-3xl"
				style={{ color: card.color }}
			>
				{card.name}
			</div>
			<div className="text-center text-sm text-white/70 max-md:text-xs">
				{card.desc}
			</div>
		</motion.div>
	);
}

export function MaterialsSpectrumStage() {
	const ref = useRef<HTMLElement>(null);
	const progress = useStageProgress(ref);

	// fallback 設動畫終點 (1)：reduced-motion 直接看到三張卡片完整呈現
	const fallback = useMotionValue(1);
	const source = progress ?? fallback;

	return (
		<TourStage id="materials-spectrum" ariaLabel="球拍材質光譜" stageRef={ref}>
			<div className="flex h-full w-full flex-col items-center justify-center gap-12 bg-slate-900 px-8 text-white max-md:gap-6">
				<h2 className="text-center text-[clamp(2rem,5vw,4rem)] font-black">
					球拍<span className="text-lime-400">材質光譜</span>
				</h2>

				<div className="grid w-full max-w-[1100px] grid-cols-3 gap-6 max-md:grid-cols-1 max-md:gap-3">
					{cards.map((card, i) => (
						<CardItem key={card.id} card={card} source={source} index={i} />
					))}
				</div>
			</div>
		</TourStage>
	);
}
