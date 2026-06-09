"use client";

import { motion } from "motion/react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface SectionProps {
	id: string;
	tag: string;
	title: string;
	children: ReactNode;
	className?: string;
}

// 共用 section 容器：scroll-triggered fade-in、錨點 id、tag + h3 標題。
export function Section({ id, tag, title, children, className }: SectionProps) {
	return (
		<motion.section
			id={id}
			initial={{ opacity: 0, y: 24 }}
			whileInView={{ opacity: 1, y: 0 }}
			viewport={{ once: true, amount: 0.1, margin: "0px 0px -40px 0px" }}
			transition={{ duration: 0.7, ease: "easeOut" }}
			className={cn("py-16 scroll-mt-[70px]", className)}
		>
			<div className="mb-8">
				<div className="mb-1 font-outfit text-[0.7rem] font-bold uppercase tracking-[3px] text-orange-500">
					{tag}
				</div>
				<h3 className="text-[clamp(1.3rem,2.5vw,1.7rem)] leading-snug font-black text-foreground">
					{title}
				</h3>
			</div>
			<div className="space-y-5 text-base leading-[1.9] text-foreground/80 [&_strong]:font-bold [&_strong]:text-foreground">
				{children}
			</div>
		</motion.section>
	);
}
