// CSV 的底層序列化與解析（跳脫、BOM、換行）。
// 本模組只認識字串與二維陣列，完全不 import 任何網域型別，
// 因此不可能在解析層偷偷做網域驗證（design.md Decision 1）。

/** UTF-8 BOM（U+FEFF），Excel 需要它才能正確辨識 UTF-8 中文，不會被系統預設編碼誤判為亂碼。 */
export const UTF8_BOM = "﻿";

/**
 * 把二維陣列轉為 CSV 文字，以 UTF-8 BOM 起頭、逗號分隔、`\r\n` 換行（Excel 相容）。
 * 對空 `rows` 回傳只有 BOM 的字串，不拋錯——空歷史仍需輸出可用的 CSV（見 spec）。
 */
export function toCsv(rows: readonly (readonly string[])[]): string {
	const lines = rows.map((row) => row.join(","));
	return UTF8_BOM + lines.join("\r\n");
}
