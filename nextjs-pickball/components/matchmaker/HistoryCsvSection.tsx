// components/matchmaker/HistoryCsvSection.tsx
"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { downloadTextFile } from "@/components/matchmaker/downloadTextFile";
import { historyCsvFileName, historyToCsv } from "@/lib/matchmaker/history-csv";
import { readSnapshot } from "@/lib/matchmaker/transfer-storage";

// 歷史賽果 CSV 匯出區塊（M8 §8.4 附加：tasks.md 8.3～8.9 未列出本區塊專屬任務，
// 但 §8.2 骨架與資料頁頂部說明皆稱其為四個功能區塊之一，故隨 JSON 備份一併接線，
// 避免永久停留在 disabled 狀態）。只匯出，不提供匯入——CSV 匯出入不對稱
// （頁面頂部的說明已標示），本區塊 SHALL NOT 另外提供「匯入歷史 CSV」入口。
//
// 時區改用瀏覽器本地時區，SHALL NOT 傳 UTC（design Decision 12）。刻意不在本層
// 重算 `Intl.DateTimeFormat().resolvedOptions().timeZone` 再顯式傳入——historyToCsv
// 本身已內建同樣的預設值（見 history-csv.ts 的 HistoryToCsvOptions 文件註解），
// 兩處各算一次是純粹的冗餘（Final Review m9），故本層直接省略 options 交由該預設值決定。
// 檔名衍生已下沉至 historyCsvFileName（比照 backup.ts 的 backupFileName，Final Review M3），
// 下載樣板改用共用函式 downloadTextFile（與 JsonBackupSection 共用，Final Review m2）。
// Blob／<a download> 等瀏覽器 I/O 只出現在本層，historyToCsv／readSnapshot 皆為純函式或回傳純資料。
export function HistoryCsvSection() {
	function handleExport() {
		const { history } = readSnapshot();
		const exportedAt = new Date().toISOString();
		const csv = historyToCsv(history);
		downloadTextFile(csv, historyCsvFileName(exportedAt), "text/csv;charset=utf-8");
	}

	return (
		<Card>
			<CardHeader>
				<h2 className="text-lg leading-none font-semibold">歷史賽果 CSV 匯出</h2>
				<p className="text-sm text-muted-foreground">
					匯出全部歷史賽果，可直接以 Excel／Google Sheets 開啟。
				</p>
			</CardHeader>
			<CardContent>
				<Button onClick={handleExport}>匯出 CSV</Button>
			</CardContent>
		</Card>
	);
}
