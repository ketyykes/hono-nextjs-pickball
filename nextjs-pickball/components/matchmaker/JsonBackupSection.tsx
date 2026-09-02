// components/matchmaker/JsonBackupSection.tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { FileTextPicker } from "@/components/matchmaker/FileTextPicker";
import { backupFileName, buildBackup, parseBackup } from "@/lib/matchmaker/backup";
import { readSnapshot, writeBackup } from "@/lib/matchmaker/transfer-storage";

// JSON 完整備份區塊（M8 §8.4／§8.9）：涵蓋匯出（Blob + <a download>）與匯入
// （選檔 → File.text() → parseBackup → writeBackup → location.reload()，
// 「選檔 → 讀文字」的樣板抽到共用元件 FileTextPicker）。
// Blob／<a download>／File.text() 等瀏覽器 I/O 只出現在元件層（design Decision 7），
// lib/matchmaker/backup.ts 與 transfer-storage.ts 只回傳純資料或可判讀的結果物件。
//
// exportedAt MUST 直接來自 new Date().toISOString()（spec「JSON 完整備份的匯出內容」），
// SHALL NOT 由使用者輸入或其他來源取得。
//
// parseBackup／writeBackup 的失敗分支只有 message，沒有機器可讀的 code（M8 §3 Stage 2
// review m4 的交棒記錄）：語法／版本／結構三種失敗一律原樣顯示 message，不做分類、
// 不用字串比對 message 內容判斷類別。
export function JsonBackupSection() {
	const [message, setMessage] = useState<string | null>(null);

	function handleExport() {
		const exportedAt = new Date().toISOString();
		const backup = buildBackup(readSnapshot(), { exportedAt });
		const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
		const url = URL.createObjectURL(blob);
		const anchor = document.createElement("a");
		anchor.href = url;
		anchor.download = backupFileName(exportedAt);
		document.body.appendChild(anchor);
		anchor.click();
		document.body.removeChild(anchor);
		URL.revokeObjectURL(url);
	}

	function handleImportText(text: string) {
		const parsed = parseBackup(text);
		if (!parsed.ok) {
			setMessage(parsed.message);
			return;
		}

		const written = writeBackup(parsed.backup);
		if (!written.ok) {
			// 寫入失敗（LocalStorage 不可用／配額超出）只顯示訊息，不 reload
			// （spec「匯入匯出的錯誤處理與 LocalStorage 邊界」）。
			setMessage(written.message);
			return;
		}

		location.reload();
	}

	return (
		<Card>
			<CardHeader>
				<h2 className="text-lg leading-none font-semibold">JSON 完整備份</h2>
				<p className="text-sm text-muted-foreground">
					含參賽者、目前回合、歷史與重複配對簽章，可完整還原本機資料。
				</p>
			</CardHeader>
			<CardContent className="flex flex-wrap items-start gap-2">
				<Button onClick={handleExport}>匯出 JSON</Button>
				<FileTextPicker
					label="選擇備份檔…"
					accept="application/json"
					testId="json-backup-import-input"
					onFileText={handleImportText}
				/>
				{message !== null && (
					<p role="alert" className="w-full text-sm text-destructive">
						{message}
					</p>
				)}
			</CardContent>
		</Card>
	);
}
