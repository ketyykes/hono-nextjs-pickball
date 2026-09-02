// components/matchmaker/HistoryCsvSection.tsx
"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { historyToCsv } from "@/lib/matchmaker/history-csv";
import { readSnapshot } from "@/lib/matchmaker/transfer-storage";

// 歷史賽果 CSV 匯出區塊（M8 §8.4 附加：tasks.md 8.3～8.9 未列出本區塊專屬任務，
// 但 §8.2 骨架與資料頁頂部說明皆稱其為四個功能區塊之一，故隨 JSON 備份一併接線，
// 避免永久停留在 disabled 狀態）。只匯出，不提供匯入——CSV 匯出入不對稱
// （頁面頂部的說明已標示），本區塊 SHALL NOT 另外提供「匯入歷史 CSV」入口。
//
// 時區改用瀏覽器本地時區（`Intl.DateTimeFormat().resolvedOptions().timeZone`），
// SHALL NOT 傳 UTC（design Decision 12）。Blob／<a download> 等瀏覽器 I/O
// 只出現在本層，historyToCsv／readSnapshot 皆為純函式或回傳純資料。
export function HistoryCsvSection() {
	function handleExport() {
		const { history } = readSnapshot();
		const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
		const csv = historyToCsv(history, { timeZone });
		const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
		const url = URL.createObjectURL(blob);
		const anchor = document.createElement("a");
		anchor.href = url;
		anchor.download = `matchmaker-history-${new Date().toISOString().slice(0, 10)}.csv`;
		document.body.appendChild(anchor);
		anchor.click();
		document.body.removeChild(anchor);
		URL.revokeObjectURL(url);
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
