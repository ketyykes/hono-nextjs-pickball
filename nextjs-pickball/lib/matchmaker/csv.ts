// CSV 的底層序列化與解析（跳脫、BOM、換行）。
// 本模組只認識字串與二維陣列，完全不 import 任何網域型別，
// 因此不可能在解析層偷偷做網域驗證（design.md Decision 1）。

/** UTF-8 BOM（U+FEFF），Excel 需要它才能正確辨識 UTF-8 中文，不會被系統預設編碼誤判為亂碼。 */
export const UTF8_BOM = "﻿";

/** 欄位分隔符。 */
const DELIMITER = ",";

/** 換行符（輸出一律用這組，Excel 相容）。 */
const LINE_BREAK = "\r\n";

/** 跳脫用的引號字元。 */
const QUOTE = '"';

/** 判斷欄位值是否需要以引號包住：含分隔符、引號或任何換行皆須跳脫（RFC 4180）。 */
function needsQuoting(field: string): boolean {
	return field.includes(DELIMITER) || field.includes(QUOTE) || field.includes("\n") || field.includes("\r");
}

/** 依 RFC 4180 規則跳脫單一欄位值：需要時以引號包住，並將內部引號轉為兩個引號。 */
function escapeField(field: string): string {
	if (!needsQuoting(field)) {
		return field;
	}
	const escaped = field.split(QUOTE).join(QUOTE + QUOTE);
	return QUOTE + escaped + QUOTE;
}

/**
 * 把二維陣列轉為 CSV 文字，以 UTF-8 BOM 起頭、逗號分隔、`\r\n` 換行（Excel 相容）。
 * 對空 `rows` 回傳只有 BOM 的字串，不拋錯——空歷史仍需輸出可用的 CSV（見 spec）。
 */
export function toCsv(rows: readonly (readonly string[])[]): string {
	const lines = rows.map((row) => row.map(escapeField).join(DELIMITER));
	return UTF8_BOM + lines.join(LINE_BREAK);
}

/**
 * 把 CSV 文字解析回二維陣列。以引號狀態機處理：引號內的分隔符與換行不視為分隔，
 * 連續兩個引號還原為一個引號內容。開頭的 BOM 會被去除，`\n` 與 `\r\n` 皆可作為換行。
 */
export function parseCsv(text: string): string[][] {
	const withoutBom = text.startsWith(UTF8_BOM) ? text.slice(UTF8_BOM.length) : text;

	if (withoutBom.length === 0) {
		return [];
	}

	const rows: string[][] = [];
	let currentRow: string[] = [];
	let currentField = "";
	let insideQuotes = false;

	for (let i = 0; i < withoutBom.length; i += 1) {
		const char = withoutBom[i];

		if (insideQuotes) {
			if (char === QUOTE) {
				if (withoutBom[i + 1] === QUOTE) {
					// 連續兩個引號還原為一個引號內容。
					currentField += QUOTE;
					i += 1;
				} else {
					insideQuotes = false;
				}
			} else {
				currentField += char;
			}
			continue;
		}

		if (char === QUOTE) {
			insideQuotes = true;
		} else if (char === DELIMITER) {
			currentRow.push(currentField);
			currentField = "";
		} else if (char === "\r") {
			// `\r\n` 由後續的 `\n` 分支結束該列；單獨的 `\r` 不在支援範圍內（見 design.md Non-Goals）。
			continue;
		} else if (char === "\n") {
			currentRow.push(currentField);
			rows.push(currentRow);
			currentRow = [];
			currentField = "";
		} else {
			currentField += char;
		}
	}

	currentRow.push(currentField);
	rows.push(currentRow);

	return rows;
}
