"use client";

import { Card } from "@/components/ui/card";
import type { BrandCardData } from "@/data/guide/brands";

interface BrandCardProps {
	brand: BrandCardData;
}

// 對應原型 .brand-card：白底、hover 微浮升 + shadow 加深。
export function BrandCard({ brand }: BrandCardProps) {
	return (
		<Card className="gap-2 rounded-2xl border border-border p-7 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-lg">
			<div className="font-outfit text-lg font-extrabold text-foreground">
				{brand.name}
			</div>
			<div className="text-xs text-muted-foreground">{brand.origin}</div>
			<p className="mt-2 text-sm leading-relaxed text-foreground/70">
				{brand.description}
			</p>
			<div className="mt-2 inline-block w-fit rounded-md bg-slate-900/[0.06] px-3 py-1 text-xs font-semibold text-slate-900">
				{brand.price}
			</div>
		</Card>
	);
}
