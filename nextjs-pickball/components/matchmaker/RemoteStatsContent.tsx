// components/matchmaker/RemoteStatsContent.tsx
"use client";

import { useState } from "react";
import type { HistoryRange } from "@pickball/core/matchmaker/history-range";
import { SyncStatusNotice } from "@/components/sync/SyncStatusNotice";
import { useRemoteHistory } from "@/hooks/useRemoteHistory";
import { useRosterStore } from "@/hooks/useRosterStore";
import { useSession } from "@/hooks/useSession";
import { computePlayerStats } from "@/lib/matchmaker/player-stats";
import type { SyncStatus } from "@/lib/sync/sync-status";
import { EmptyHistory } from "./EmptyHistory";
import { HistoryRangeFilter } from "./HistoryRangeFilter";
import { PlayerStatsTable } from "./PlayerStatsTable";

function isBlockingStatus(status: SyncStatus): boolean {
	return status === "loading" || status === "load-failed";
}

// 名單與歷史任一邊尚無可信資料時，以該邊的狀態取代內容；兩邊都可用時回報歷史的狀態
function pickDisplayStatus(rosterStatus: SyncStatus, historyStatus: SyncStatus): SyncStatus {
	if (isBlockingStatus(rosterStatus)) return rosterStatus;
	return historyStatus;
}

// 雲端模式的統計頁內容（design Decision 3）：只掛名單與雲端歷史兩個 hook，
// 刻意不掛 useRoundStore——統計不需要回合，掛了會多出回合與分槽的讀取請求。
export function RemoteStatsContent() {
	const session = useSession();
	// 載入中或訪客時為 null，此時 hook 不會發出請求
	const userId = session.status === "ready" ? (session.user?.id ?? null) : null;
	const { players, syncStatus: rosterSyncStatus } = useRosterStore();
	// 初次開啟預設選中今日，與本機統計頁一致
	const [selectedRange, setSelectedRange] = useState<HistoryRange>("today");

	const { items, total, syncStatus: historySyncStatus } = useRemoteHistory({
		enabled: true,
		userId,
		range: selectedRange,
		onUnauthorized: session.refresh,
	});

	const displayStatus = pickDisplayStatus(rosterSyncStatus, historySyncStatus);

	// 名單或歷史載入中、失敗時沒有可信資料；顯示空名單或空排行榜會誤導使用者，
	// 所以以提示取代主要內容。須排在所有 hook 之後，避免條件式呼叫 hook。
	if (isBlockingStatus(displayStatus)) {
		return (
			<div data-sync-status={displayStatus} className="flex flex-col gap-6">
				<SyncStatusNotice status={displayStatus} />
			</div>
		);
	}

	// 後端已依區間篩選，items 直接交給與本機相同的 computePlayerStats
	const stats = computePlayerStats(
		items.map((item) => item.data),
		players,
	);

	return (
		<div data-sync-status={displayStatus} className="flex flex-col gap-6">
			{total === 0 ? (
				// 以 total 判定「完全沒有紀錄」而非 items：否則使用者在「上月」沒有紀錄時
				// 會被誤導成從未打過（player-stats 空狀態的呈現 Requirement）
				<EmptyHistory range={null} />
			) : (
				<>
					<HistoryRangeFilter value={selectedRange} onChange={setSelectedRange} />
					<PlayerStatsTable stats={stats} />
				</>
			)}
		</div>
	);
}
