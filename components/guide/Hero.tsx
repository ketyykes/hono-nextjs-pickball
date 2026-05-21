"use client";

import { ChevronDown } from "lucide-react";
import { motion, type Variants } from "motion/react";
import { HeroTourCta } from "@/components/guide/HeroTourCta";

interface HeroStat {
	num: string;
	label: string;
}

const heroStats: readonly HeroStat[] = [
	{ num: "14萬+", label: "台灣活躍玩家" },
	{ num: "¼", label: "僅網球場 1/4 大" },
	{ num: "11", label: "分即可拿下一局" },
] as const;

// 父層 stagger：整體於 0.6s 內依序帶出 5 個 items（badge / 主標題 / 副標 / 統計 / CTA）。
const heroContainerVariants: Variants = {
	hidden: {},
	show: {
		transition: { staggerChildren: 0.08, delayChildren: 0.05 },
	},
};

// 子層 fadeUp：縮短 duration 至 0.4s 並降低 translateY 距離以維持輕快觀感。
const heroItemVariants: Variants = {
	hidden: { opacity: 0, y: 20 },
	show: {
		opacity: 1,
		y: 0,
		transition: { duration: 0.4, ease: "easeOut" },
	},
};

// Hero：以 staggerChildren 在頁面載入後一次帶出全部內容（含 CTA）。
// 取消 scroll-driven 控制 opacity 的設計——scroll 進入區間和 CTA 在視窗中的時機難以匹配，
// 改成 CTA 永遠可見、捲動只走自然版面流動。
export function Hero() {
	return (
		<section className="relative min-h-screen overflow-hidden bg-slate-900">
			{/* 背景光暈：鋪滿整個 section（含 nav 區），不受偏移層影響 */}
			<div
				aria-hidden
				className="absolute inset-0 bg-[radial-gradient(ellipse_at_20%_80%,rgba(163,230,53,0.15)_0%,transparent_50%),radial-gradient(ellipse_at_80%_20%,rgba(249,115,22,0.1)_0%,transparent_50%)]"
			/>

			{/* 透視場地：絕對置中於整個 section（包含 nav 區），是設計感的一部分，不搬入偏移層 */}
			<div
				aria-hidden
				className="absolute top-1/2 left-1/2 h-[700px] w-[340px] border-[3px] border-white/12 opacity-30 [transform:translate(-50%,-50%)_perspective(800px)_rotateX(55deg)_rotateZ(-5deg)] max-md:h-[500px] max-md:w-[240px]"
			>
				<div className="absolute top-0 right-0 left-0 h-[35%] border-b-[3px] border-white/12" />
				<div className="absolute top-[35%] left-1/2 h-[65%] w-0 border-l-[3px] border-white/12" />
			</div>

			{/* nav 偏移層：浮球與主內容掛在這層，padding-top 讓可用區從 nav 底部開始 */}
			<div className="relative flex min-h-screen flex-col items-center justify-center pt-[calc(var(--site-nav-h)+var(--toc-bar-h))]">
				{/* 浮球：top-[15%] / right-[12%] 現在相對偏移層 */}
				<div
					aria-hidden
					className="absolute top-[15%] right-[12%] h-[60px] w-[60px] animate-float-ball rounded-full bg-lime-400 shadow-[0_0_60px_rgba(163,230,53,0.4)] max-md:top-[10%] max-md:right-[8%] max-md:h-10 max-md:w-10"
				>
					<div className="absolute inset-2 rounded-full border-2 border-dashed border-black/15" />
				</div>

				{/* 主內容 */}
				<motion.div
					className="relative z-[2] max-w-[900px] px-8 text-center"
					variants={heroContainerVariants}
					initial="hidden"
					animate="show"
				>
					<motion.div
						variants={heroItemVariants}
						className="mb-8 inline-block rounded-full bg-lime-400 px-6 py-2 font-outfit text-xs font-bold uppercase tracking-[3px] text-slate-900"
					>
						2025 完全入門指南
					</motion.div>

					<motion.h1
						variants={heroItemVariants}
						className="mb-6 text-[clamp(2.4rem,6vw,4.5rem)] font-black leading-[1.2] text-white"
					>
						匹克球<span className="text-lime-400">新手</span>完全入門
					</motion.h1>

					<motion.p
						variants={heroItemVariants}
						className="mx-auto mb-10 max-w-[600px] text-[1.15rem] font-light text-white/70"
					>
						從規則到球拍選購，零基礎也能一次看懂的匹克球百科
					</motion.p>

					<motion.div
						className="mb-10 flex flex-wrap justify-center gap-12 max-md:gap-6"
						variants={heroItemVariants}
					>
						{heroStats.map((stat) => (
							<div key={stat.label} className="text-center">
								<div className="font-bebas text-5xl leading-none text-lime-400 max-md:text-[2.2rem]">
									{stat.num}
								</div>
								<div className="text-xs tracking-wide text-white/50">
									{stat.label}
								</div>
							</div>
						))}
					</motion.div>

					<motion.div variants={heroItemVariants}>
						<HeroTourCta />
					</motion.div>
				</motion.div>
			</div>

			{/* scroll indicator：維持在 section 層級，bottom-8 相對 section */}
			<div
				aria-hidden
				className="absolute bottom-8 left-1/2 z-[2] -translate-x-1/2 animate-bounce-down"
			>
				<ChevronDown className="h-7 w-7 stroke-white/30" strokeWidth={2} />
			</div>
		</section>
	);
}
