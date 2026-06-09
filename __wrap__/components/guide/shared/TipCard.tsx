"use client";

import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface TipCardProps {
	label: string;
	children: ReactNode;
	variant?: "default" | "warn";
	className?: string;
}

// 對應原型 .tip-card：白底卡片 + 左 4px 色邊框（綠 / 警示橘）。
export function TipCard({
	label,
	children,
	variant = "default",
	className,
}: TipCardProps) {
	const accent =
		variant === "warn"
			? "border-l-orange-500"
			: "border-l-lime-400";
	const labelColor =
		variant === "warn" ? "text-orange-500" : "text-emerald-700";

	return (
		<Card
			className={cn(
				"my-8 gap-2 rounded-l-none rounded-r-xl border-l-4 px-8 py-6 shadow-sm",
				accent,
				className,
			)}
		>
			<div
				className={cn(
					"font-outfit text-xs font-bold uppercase tracking-[2px]",
					labelColor,
				)}
			>
				{label}
			</div>
			<div className="text-[0.95rem] leading-relaxed text-foreground/80">
				{children}
			</div>
		</Card>
	);
}
