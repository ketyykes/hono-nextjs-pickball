// components/matchmaker/HistoryRangeFilter.tsx
"use client";

import { Button } from "@/components/ui/button";
import { HISTORY_RANGES } from "@/lib/matchmaker/history-range";
import type { HistoryRange } from "@/lib/matchmaker/history-range";

// 區間篩選的顯示文案，依 HISTORY_RANGES 的順序（今日、本週、本月、上月、更早）排列。
const RANGE_LABEL: Record<HistoryRange, string> = {
	today: "今日",
	thisWeek: "本週",
	thisMonth: "本月",
	lastMonth: "上月",
	earlier: "更早",
};

export interface HistoryRangeFilterProps {
	value: HistoryRange;
	onChange: (range: HistoryRange) => void;
}

// 五個區間的 WAI-ARIA radio group（比照 RoundControls.tsx 對戰方式／目標分數既有寫法）。
// 選取狀態只存在父層元件 state（HistoryView），本元件不持有也不寫入 LocalStorage
// （spec「歷史紀錄依區間篩選與排序」：目前選取的區間屬於畫面狀態）。
export function HistoryRangeFilter({ value, onChange }: HistoryRangeFilterProps) {
	return (
		<div
			role="radiogroup"
			aria-label="歷史區間"
			className="flex flex-wrap gap-1 rounded-md border border-input p-1"
		>
			{HISTORY_RANGES.map((range) => (
				<Button
					key={range}
					type="button"
					role="radio"
					aria-checked={value === range}
					variant={value === range ? "default" : "ghost"}
					size="sm"
					onClick={() => onChange(range)}
				>
					{RANGE_LABEL[range]}
				</Button>
			))}
		</div>
	);
}
