// components/matchmaker/HistoryCsvSection.tsx
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

// 歷史賽果 CSV 匯出區塊骨架（M8 §8.2）：匯出全部歷史賽果為 UTF-8 BOM、11 欄位的
// CSV（`lib/matchmaker/history-csv.ts`），可直接以 Excel／Google Sheets 開啟。
// 只匯出，不提供匯入——CSV 匯出入不對稱（頁面頂部的說明已標示），本區塊
// SHALL NOT 另外提供「匯入歷史 CSV」入口。實際接線由 §8.3～8.4 補上。
export function HistoryCsvSection() {
	return (
		<Card>
			<CardHeader>
				<h2 className="text-lg leading-none font-semibold">歷史賽果 CSV 匯出</h2>
				<p className="text-sm text-muted-foreground">
					匯出全部歷史賽果，可直接以 Excel／Google Sheets 開啟。
				</p>
			</CardHeader>
			<CardContent>
				<Button disabled>匯出 CSV</Button>
			</CardContent>
		</Card>
	);
}
