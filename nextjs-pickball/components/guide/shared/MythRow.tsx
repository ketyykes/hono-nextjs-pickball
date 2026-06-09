"use client";

import { Card } from "@/components/ui/card";

interface MythRowProps {
	myth: string;
	fact: string;
}

// 對應原型 .myth-row：兩格佈局，左 myth 紅、右 fact 綠。
export function MythRow({ myth, fact }: MythRowProps) {
	return (
		<Card className="grid grid-cols-1 gap-0 overflow-hidden rounded-xl border-0 p-0 shadow-sm md:grid-cols-2">
			<div className="border-l-4 border-l-orange-500 bg-orange-50 px-6 py-5 text-[0.9rem] leading-relaxed text-foreground/85">
				<div className="mb-1 font-outfit text-[0.65rem] font-bold uppercase tracking-[2px] text-orange-500">
					常見迷思 ✕
				</div>
				{myth}
			</div>
			<div className="border-l-4 border-l-emerald-700 bg-emerald-50 px-6 py-5 text-[0.9rem] leading-relaxed text-foreground/85">
				<div className="mb-1 font-outfit text-[0.65rem] font-bold uppercase tracking-[2px] text-emerald-700">
					正確規則 ✓
				</div>
				{fact}
			</div>
		</Card>
	);
}
