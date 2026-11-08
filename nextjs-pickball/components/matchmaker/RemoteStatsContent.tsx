// components/matchmaker/RemoteStatsContent.tsx
"use client";

import { useState, type ReactNode } from "react";
import type { HistoryRange } from "@pickball/core/matchmaker/history-range";
import { SyncStatusNotice } from "@/components/sync/SyncStatusNotice";
import { useRemoteHistory } from "@/hooks/useRemoteHistory";
import { useRosterStore } from "@/hooks/useRosterStore";
import { useSession } from "@/hooks/useSession";
import { computePlayerStats } from "@/lib/matchmaker/player-stats";
import type { DataStatus, SyncStatus } from "@/lib/sync/sync-status";
import { EmptyHistory } from "./EmptyHistory";
import { HistoryRangeFilter } from "./HistoryRangeFilter";
import { PlayerStatsTable } from "./PlayerStatsTable";

function isBlockingStatus(status: DataStatus): boolean {
	return status === "loading" || status === "load-failed";
}

// 雲端模式的統計頁內容：只掛名單與雲端歷史兩個 hook，
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

	// 名單載入中、失敗時沒有可信的名單；切換區間無法恢復名單，保留篩選器沒有意義，
	// 所以以提示取代整段內容。須排在所有 hook 之後，避免條件式呼叫 hook。
	if (isBlockingStatus(rosterSyncStatus)) {
		return (
			<div data-sync-status={rosterSyncStatus} className="flex flex-col gap-6">
				<SyncStatusNotice status={rosterSyncStatus} />
			</div>
		);
	}

	// 後端已依區間篩選，items 直接交給與本機相同的 computePlayerStats
	const stats = computePlayerStats(
		items.map((item) => item.data),
		players,
	);

	// 歷史載入中或失敗時沒有可信的排行榜；顯示空排行榜會誤導使用者，所以只把內容區塊換成提示。
	// 篩選器與它前後的槽位在各狀態下位置固定，React 才會沿用同一個 DOM 節點：
	// 每次換區間 hook 都會先回到 loading，篩選器若卸載重建，鍵盤使用者的焦點會掉回 body。
	// 載入失敗時篩選器仍可操作，改選其他區間即以新區間重新載入。
	const isHistoryBlocking = isBlockingStatus(historySyncStatus);
	// 阻斷時 hook 回傳的 total 恆為 0，所以條件不能只看 total，否則載入中與失敗時篩選器會被藏起來
	const showRangeFilter = isHistoryBlocking || total > 0;

	let content: ReactNode;
	if (isHistoryBlocking) {
		content = <SyncStatusNotice status={historySyncStatus} />;
	} else if (total === 0) {
		// 以 total 判定「完全沒有紀錄」而非 items：否則使用者在「上月」沒有紀錄時
		// 會被誤導成從未打過（player-stats 空狀態的呈現 Requirement）
		content = <EmptyHistory range={null} />;
	} else {
		content = <PlayerStatsTable stats={stats} />;
	}

	return (
		<div data-sync-status={historySyncStatus} className="flex flex-col gap-6">
			{/* 標題只在名單可信時顯示：名單阻斷時整段以提示取代，歷史阻斷時標題是靜態文字、保留可避免版面跳動 */}
			<div>
				<h1 className="text-2xl font-bold">球員統計</h1>
				<p className="text-sm text-muted-foreground">依區間排名每位球員的表現與強度消長。</p>
			</div>
			{showRangeFilter && <HistoryRangeFilter value={selectedRange} onChange={setSelectedRange} />}
			{content}
		</div>
	);
}
