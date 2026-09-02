// components/matchmaker/downloadTextFile.ts
// 共用的「Blob → 建立暫時 <a download> → 觸發下載 → 清理」樣板（Final Review m2）。
// JsonBackupSection 與 HistoryCsvSection 原本各自內聯一份幾乎逐行相同的下載邏輯
// （匯入側的「選檔 → 讀文字」樣板已抽為 FileTextPicker，匯出側原本沒有一併抽），
// 此函式讓兩者共用同一份。屬瀏覽器 I/O（design Decision 7），本檔不含任何網域邏輯。
export function downloadTextFile(content: string, filename: string, mimeType: string): void {
	const blob = new Blob([content], { type: mimeType });
	const url = URL.createObjectURL(blob);
	const anchor = document.createElement("a");
	anchor.href = url;
	anchor.download = filename;
	document.body.appendChild(anchor);
	anchor.click();
	document.body.removeChild(anchor);
	URL.revokeObjectURL(url);
}
