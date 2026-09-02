// components/matchmaker/ClearLocalDataSection.tsx
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

// 清除本機資料區塊骨架（M8 §8.2）：清除本 app 寫入的全部 LocalStorage key
// （`lib/matchmaker/transfer-storage.ts` 的 `CLEAR_ALL_KEYS`／`clearAllLocalData`）。
// 二次確認對話框（`ClearLocalDataDialog`，比照既有 `ResetRosterDialog` 的
// AlertDialog + destructive 模式）由 §8.7～8.8 補上；本組先以 disabled 按鈕
// 佔位，避免尚未接上確認流程前就能誤觸清除。
export function ClearLocalDataSection() {
	return (
		<Card>
			<CardHeader>
				<h2 className="text-lg leading-none font-semibold">清除本機資料</h2>
				<p className="text-sm text-muted-foreground">
					會清除本機全部資料，且無法復原。建議先匯出 JSON 備份。
				</p>
			</CardHeader>
			<CardContent>
				<Button variant="destructive" disabled>
					清除本機資料
				</Button>
			</CardContent>
		</Card>
	);
}
