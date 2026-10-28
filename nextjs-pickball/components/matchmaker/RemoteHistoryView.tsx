// components/matchmaker/RemoteHistoryView.tsx
"use client";

import { useState } from "react";
import type { HistoryRange } from "@pickball/core/matchmaker/history-range";
import { SyncStatusNotice } from "@/components/sync/SyncStatusNotice";
import { useRemoteHistory } from "@/hooks/useRemoteHistory";
import { useSession } from "@/hooks/useSession";
import { EmptyHistory } from "./EmptyHistory";
import { HistoryRangeFilter } from "./HistoryRangeFilter";
import { HistoryRecordCard } from "./HistoryRecordCard";

// 雲端模式的歷史頁內容（design Decision 3）：與本機的 HistoryView 分開，
// 使訪客路徑的元件一行不動。區間篩選由後端依前端算好的界線完成，
// 所以這裡拿到的 items 已經是目前區間的紀錄，不再前端篩選。
export function RemoteHistoryView() {
	const session = useSession();
	// 載入中或訪客時為 null，此時 hook 不會發出請求
	const userId = session.status === "ready" ? (session.user?.id ?? null) : null;
	// 初次開啟預設選中今日，與本機歷史頁一致
	const [selectedRange, setSelectedRange] = useState<HistoryRange>("today");

	const { items, total, droppedCount, syncStatus } = useRemoteHistory({
		enabled: true,
		userId,
		range: selectedRange,
		onUnauthorized: session.refresh,
	});

	// 載入中或失敗時沒有可信的歷史；顯示空狀態會誤導使用者以為從未打過，
	// 所以以提示取代主要內容。
	if (syncStatus === "loading" || syncStatus === "load-failed") {
		return (
			<div data-sync-status={syncStatus} className="flex flex-col gap-4">
				<SyncStatusNotice status={syncStatus} />
			</div>
		);
	}

	return (
		<div data-sync-status={syncStatus} className="flex flex-col gap-4">
			{/* 樣式 class 與文案須與本機 HistoryView 的損毀提示逐字相同（match-history 損毀提示 Requirement）。
			    雲端不回寫清理，損毀列保留在後端，這裡只負責告知筆數。 */}
			{droppedCount > 0 && (
				<div
					role="alert"
					className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive"
				>
					有 {droppedCount} 筆損毀的歷史紀錄已略過，其餘歷史紀錄不受影響。
				</div>
			)}

			<HistoryRangeFilter value={selectedRange} onChange={setSelectedRange} />

			{total === 0 ? (
				// 以 total 判定「完全沒有紀錄」而非 items：篩選後為空不代表從未打過
				<EmptyHistory range={null} />
			) : items.length === 0 ? (
				<EmptyHistory range={selectedRange} />
			) : (
				<div className="flex flex-col gap-3">
					{items.map((item) => (
						<HistoryRecordCard key={item.data.matchId} entry={item.data} />
					))}
				</div>
			)}
		</div>
	);
}
