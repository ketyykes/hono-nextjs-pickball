"use client";

import { motion } from "motion/react";

interface PartDividerProps {
	num: string;
	title: string;
}

// 對應原型 .part-divider：大數字 + 標題 + lime 短橫，含 scroll fade-in。
export function PartDivider({ num, title }: PartDividerProps) {
	return (
		<motion.div
			initial={{ opacity: 0, y: 24 }}
			whileInView={{ opacity: 1, y: 0 }}
			viewport={{ once: true, amount: 0.1, margin: "0px 0px -40px 0px" }}
			transition={{ duration: 0.7, ease: "easeOut" }}
			className="relative px-8 py-20 text-center"
		>
			<div className="relative font-bebas text-[clamp(5rem,12vw,10rem)] leading-[0.9] text-border">
				{num}
			</div>
			<h2 className="relative -mt-6 text-[clamp(1.6rem,3.5vw,2.4rem)] font-black text-slate-900">
				{title}
			</h2>
			<div className="mx-auto mt-6 h-1 w-16 rounded-sm bg-lime-400" />
		</motion.div>
	);
}
