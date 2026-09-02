// components/matchmaker/JsonBackupSection.tsx
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

// JSON 完整備份區塊骨架（M8 §8.2）：涵蓋匯出（Blob + <a download>）與匯入
// （File.text() → parseBackup → writeBackup）的視覺入口。實際接線由 §8.3～8.4
// 補上，本組只提供標題、說明文字與尚未接線的按鈕（design Decision 7：Blob／
// <a download>／FileReader 等瀏覽器 I/O 只出現在本層，故先以 disabled 標示
// 尚未接線，避免使用者誤以為現在就能操作）。
export function JsonBackupSection() {
	return (
		<Card>
			<CardHeader>
				<h2 className="text-lg leading-none font-semibold">JSON 完整備份</h2>
				<p className="text-sm text-muted-foreground">
					含參賽者、目前回合、歷史與重複配對簽章，可完整還原本機資料。
				</p>
			</CardHeader>
			<CardContent className="flex flex-wrap gap-2">
				<Button disabled>匯出 JSON</Button>
				<Button variant="outline" disabled>
					選擇備份檔…
				</Button>
			</CardContent>
		</Card>
	);
}
