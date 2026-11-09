// components/matchmaker/HistoryModeSwitch.tsx
"use client";

import { useSession } from "@/hooks/useSession";
import { SyncStatusNotice } from "@/components/sync/SyncStatusNotice";
import { pendingDataStatus, resolveStorageMode } from "@/lib/sync/storage-mode";
import { HistoryView } from "./HistoryView";
import { RemoteHistoryView } from "./RemoteHistoryView";

// 歷史頁的模式分支：讓 app/matchmaker/history/page.tsx 維持 server component，
// client 邊界只放在這個小元件。雲端元件只在 remote 時掛載——RemoteHistoryView 在
// userId 為 null 時會顯示引導型空狀態，不該在 session 載入中或訪客時出現。
// 儲存模式未定時兩邊都不掛載，只顯示等待中提示（session 無法確認時改為失敗提示與按鈕）。
export function HistoryModeSwitch() {
	const session = useSession();
	const mode = resolveStorageMode(session);
	if (mode === "pending") {
		const pendingStatus = pendingDataStatus(session);
		return (
			<div data-sync-status={pendingStatus} className="flex flex-col gap-4">
				<SyncStatusNotice status={pendingStatus} />
			</div>
		);
	}
	return mode === "remote" ? <RemoteHistoryView /> : <HistoryView />;
}
