// components/matchmaker/FileTextPicker.tsx
"use client";

import { useRef } from "react";
import type { ChangeEvent } from "react";
import { Button } from "@/components/ui/button";

interface FileTextPickerProps {
	/** 觸發選檔的按鈕文字。 */
	label: string;
	/** `<input type="file">` 的 accept 屬性。 */
	accept: string;
	/** 隱藏的 `<input type="file">` 元素的 data-testid，供 E2E 以 setInputFiles 選檔。 */
	testId: string;
	/** 選檔後讀出的檔案文字內容；由呼叫端決定如何解析與呈現錯誤。 */
	onFileText: (text: string) => void | Promise<void>;
}

// 四個資料頁區塊中，JSON 完整備份與參賽者名單 CSV 匯入皆需要「選檔 → File.text()
// 讀出文字 → 交給呼叫端解析」這段共同樣板（M8 §8.9 REFACTOR）。本元件只負責選檔與
// 讀出文字，不知道 parseBackup／parseRosterCsv 等任何網域邏輯，解析結果的顯示
// （預覽、錯誤訊息）留在各自呼叫端——沿用 design Decision 7：Blob／File.text() 等
// 瀏覽器 I/O 只出現在元件層，lib/ 的純函式維持不變。
export function FileTextPicker({ label, accept, testId, onFileText }: FileTextPickerProps) {
	const fileInputRef = useRef<HTMLInputElement>(null);

	async function handleChange(event: ChangeEvent<HTMLInputElement>) {
		const file = event.target.files?.[0];
		// 允許重複選同一個檔案也能再次觸發 onChange。
		event.target.value = "";
		if (!file) return;

		const text = await file.text();
		await onFileText(text);
	}

	return (
		<>
			<input
				ref={fileInputRef}
				type="file"
				accept={accept}
				className="hidden"
				data-testid={testId}
				onChange={handleChange}
			/>
			<Button variant="outline" onClick={() => fileInputRef.current?.click()}>
				{label}
			</Button>
		</>
	);
}
