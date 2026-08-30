// components/matchmaker/EmptyHistory.tsx
"use client";

import type { HistoryRange } from "@/lib/matchmaker/history-range";

// 各區間各自的空狀態文案（spec「空區間的友善空狀態」）：跨月週使「本月」成為空
// 區間時，MUST 被視為正常結果而非錯誤，故五個區間各自有獨立、友善的措辭。
const RANGE_EMPTY_LABEL: Record<HistoryRange, string> = {
	today: "今日目前沒有任何對戰紀錄。",
	thisWeek: "本週目前沒有任何對戰紀錄。",
	thisMonth: "本月目前沒有任何對戰紀錄。",
	lastMonth: "上月沒有任何對戰紀錄。",
	earlier: "沒有更早的對戰紀錄。",
};

export interface EmptyHistoryProps {
	// null：`matchmaker:history:v1` 完全沒有資料，顯示引導型空狀態；
	// 指定區間：整份歷史並非空，只是該區間內沒有紀錄，顯示該區間各自的空狀態文案
	// （兩者 SHALL NOT 共用同一段文字——區分「從沒打過」與「這段時間沒打」）。
	range: HistoryRange | null;
}

export function EmptyHistory({ range }: EmptyHistoryProps) {
	if (range === null) {
		return (
			<div
				data-testid="empty-history"
				className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border px-6 py-16 text-center"
			>
				<p className="text-lg font-semibold">還沒有任何對戰紀錄</p>
				<p className="text-sm text-muted-foreground">
					完成對戰後才會有紀錄，請先前往對戰頁安排比賽。
				</p>
			</div>
		);
	}

	return (
		<div
			data-testid="empty-history-range"
			className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border px-6 py-16 text-center"
		>
			<p className="text-sm text-muted-foreground">{RANGE_EMPTY_LABEL[range]}</p>
		</div>
	);
}
