// components/matchmaker/RosterCsvImportSection.tsx
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

// 參賽者名單 CSV 匯入區塊骨架（M8 §8.2）：選檔 → 解析（`parseRosterCsv`）→
// 預覽（可新增人數／問題列）→ 確認後附加寫入（`applyRosterImport`）。本組只做
// 標題、欄位說明與尚未接線的按鈕；預覽狀態、確認鈕的 disabled 邏輯由 §8.5～8.6
// 補上（「確認匯入」在此先固定 disabled，避免未選檔即可誤觸）。
export function RosterCsvImportSection() {
	return (
		<Card>
			<CardHeader>
				<h2 className="text-lg leading-none font-semibold">參賽者名單 CSV 匯入</h2>
				<p className="text-sm text-muted-foreground">
					欄位：名稱／性別／強度分數／顏色起點／顏色終點。匯入採附加模式，不覆蓋既有參賽者。
				</p>
			</CardHeader>
			<CardContent className="flex flex-wrap gap-2">
				<Button variant="outline" disabled>
					選擇 CSV 檔…
				</Button>
				<Button disabled>確認匯入</Button>
			</CardContent>
		</Card>
	);
}
