"use client";

import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface HighlightBoxProps {
	title: string;
	children: ReactNode;
	className?: string;
}

// 對應原型 .highlight-box：深藍漸層底 + lime 標題。
export function HighlightBox({ title, children, className }: HighlightBoxProps) {
	return (
		<Card
			className={cn(
				"relative my-8 gap-3 overflow-hidden rounded-2xl border-0 bg-gradient-to-br from-slate-900 to-slate-800 px-10 py-8 text-white shadow-md",
				className,
			)}
		>
			<div className="pointer-events-none absolute -top-5 -right-5 h-24 w-24 rounded-full bg-lime-400/15" />
			<h4 className="text-lg font-bold text-lime-400">{title}</h4>
			<div className="space-y-2 text-[0.95rem] leading-relaxed text-white/90">
				{children}
			</div>
		</Card>
	);
}
