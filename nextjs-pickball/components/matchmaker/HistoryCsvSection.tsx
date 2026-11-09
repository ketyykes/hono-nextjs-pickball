// components/matchmaker/HistoryCsvSection.tsx
"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { downloadTextFile } from "@/components/matchmaker/downloadTextFile";
import { SyncStatusNotice } from "@/components/sync/SyncStatusNotice";
import { useSession } from "@/hooks/useSession";
import { historyCsvFileName, historyToCsv } from "@/lib/matchmaker/history-csv";
import { REMOTE_TRANSFER_MESSAGES, buildRemoteHistoryCsv } from "@/lib/matchmaker/remote-transfer";
import { readSnapshot } from "@/lib/matchmaker/transfer-storage";
import { pendingDataStatus, resolveStorageMode } from "@/lib/sync/storage-mode";

// 歷史賽果 CSV 匯出區塊。只匯出，不提供匯入——CSV 匯出入不對稱
// （頁面頂部的說明已標示），本區塊 SHALL NOT 另外提供「匯入歷史 CSV」入口。
//
// 時區改用瀏覽器本地時區，SHALL NOT 傳 UTC。刻意不在本層
// 重算 `Intl.DateTimeFormat().resolvedOptions().timeZone` 再顯式傳入——historyToCsv
// 本身已內建同樣的預設值（見 history-csv.ts 的 HistoryToCsvOptions 文件註解），
// 兩處各算一次是純粹的冗餘，故本層直接省略 options 交由該預設值決定。
// 檔名衍生已下沉至 historyCsvFileName（比照 backup.ts 的 backupFileName），
// 下載樣板用共用函式 downloadTextFile（與 JsonBackupSection 共用）。
// Blob／<a download> 等瀏覽器 I/O 只出現在本層，historyToCsv／readSnapshot 皆為純函式或回傳純資料。
//
// 雲端模式：歷史改取自 GET /api/matchmaker/history?order=asc，CSV 仍由同一個 historyToCsv 產生；
// 本機分支維持原樣。比照 JsonBackupSection，以點擊當下 useSession() 的 user id 送出，未授權時刷新 session。
export function HistoryCsvSection() {
	const [message, setMessage] = useState<string | null>(null);
	const session = useSession();
	const mode = resolveStorageMode(session);
	const isRemote = mode === "remote";
	const userId = session.status === "ready" ? (session.user?.id ?? null) : null;

	async function handleRemoteExport() {
		if (userId === null) {
			setMessage(REMOTE_TRANSFER_MESSAGES.unauthorized);
			return;
		}
		const exportedAt = new Date().toISOString();
		const result = await buildRemoteHistoryCsv(userId);
		if (!result.ok) {
			setMessage(result.message);
			if (result.unauthorized) void session.refresh();
			return;
		}
		setMessage(null);
		downloadTextFile(result.csv, historyCsvFileName(exportedAt), "text/csv;charset=utf-8");
	}

	function handleExport() {
		if (isRemote) {
			void handleRemoteExport();
			return;
		}

		const { history } = readSnapshot();
		const exportedAt = new Date().toISOString();
		const csv = historyToCsv(history);
		downloadTextFile(csv, historyCsvFileName(exportedAt), "text/csv;charset=utf-8");
	}

	let content: ReactNode;
	if (mode === "pending") {
		// 儲存模式未定時不提供匯出：本機與雲端的歷史來源不同
		const pendingStatus = pendingDataStatus(session);
		content = (
			<CardContent data-sync-status={pendingStatus}>
				<SyncStatusNotice status={pendingStatus} />
			</CardContent>
		);
	} else {
		content = (
			<CardContent>
				<Button onClick={handleExport}>匯出 CSV</Button>
				{message !== null && (
					<p role="alert" className="mt-2 text-sm text-destructive">
						{message}
					</p>
				)}
			</CardContent>
		);
	}

	return (
		<Card>
			<CardHeader>
				<h2 className="text-lg leading-none font-semibold">歷史賽果 CSV 匯出</h2>
				<p className="text-sm text-muted-foreground">
					匯出全部歷史賽果，可直接以 Excel／Google Sheets 開啟。
				</p>
			</CardHeader>
			{content}
		</Card>
	);
}
