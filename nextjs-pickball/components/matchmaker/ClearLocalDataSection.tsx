// components/matchmaker/ClearLocalDataSection.tsx
"use client";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ClearLocalDataDialog } from "@/components/matchmaker/ClearLocalDataDialog";
import { clearAllLocalData } from "@/lib/matchmaker/transfer-storage";

// 清除本機資料區塊（M8 §8.8）：清除本 app 寫入的全部 LocalStorage key
// （`lib/matchmaker/transfer-storage.ts` 的 `CLEAR_ALL_KEYS`／`clearAllLocalData`）。
// 二次確認對話框（`ClearLocalDataDialog`）比照既有 `ResetRosterDialog` 的
// AlertDialog + destructive 模式，確認後才呼叫 clearAllLocalData()。
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
				<ClearLocalDataDialog onConfirm={clearAllLocalData} />
			</CardContent>
		</Card>
	);
}
