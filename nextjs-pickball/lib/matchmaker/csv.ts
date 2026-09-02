// CSV 的底層序列化與解析（跳脫、BOM、換行）。
// 本模組只認識字串與二維陣列，完全不 import 任何網域型別，
// 因此不可能在解析層偷偷做網域驗證（design.md Decision 1）。

/** UTF-8 BOM（U+FEFF），Excel 需要它才能正確辨識 UTF-8 中文，不會被系統預設編碼誤判為亂碼。 */
export const UTF8_BOM = "﻿";

/** 欄位分隔符。 */
const DELIMITER = ",";

/** 換行用的 CR、LF 字元；解析時分開判斷，序列化時合併使用。 */
const CARRIAGE_RETURN = "\r";
const LINE_FEED = "\n";

/** 換行符（輸出一律用這組，Excel 相容）。 */
const LINE_BREAK = CARRIAGE_RETURN + LINE_FEED;

/** 跳脫用的引號字元。 */
const QUOTE = '"';

/** 判斷欄位值是否需要以引號包住：含分隔符、引號或任何換行皆須跳脫（RFC 4180）。 */
function needsQuoting(field: string): boolean {
	return (
		field.includes(DELIMITER) ||
		field.includes(QUOTE) ||
		field.includes(LINE_FEED) ||
		field.includes(CARRIAGE_RETURN)
	);
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
 *
 * 刻意不在最後一列後面補一個 `LINE_BREAK`：Excel／Google Sheets 開啟「無尾端換行」與
 * 「有尾端換行」的 CSV 結果相同，但若本函式輸出尾端換行，`parseCsv` 讀回時就會多解析出
 * 一列空列（即下方 Stage 2 review 抓到的幻影空列問題）——保持「不輸出」可以讓
 * `parseCsv(toCsv(rows))` 這條 round-trip 不必額外處理自己製造出來的邊界。
 */
export function toCsv(rows: readonly (readonly string[])[]): string {
	const lines = rows.map((row) => row.map(escapeField).join(DELIMITER));
	return UTF8_BOM + lines.join(LINE_BREAK);
}

/**
 * 把 CSV 文字解析回二維陣列。以引號狀態機處理：引號內的分隔符與換行不視為分隔，
 * 連續兩個引號還原為一個引號內容。開頭的 BOM 會被去除，`\n` 與 `\r\n` 皆可作為換行。
 *
 * 設計取捨（刻意維持寬鬆、不拋錯）：若引號未閉合，狀態機會把後續所有內容
 * （含換行與分隔符）併入同一欄位，直到字串結束，並不會產生第二列。
 * 這是有意的取捨——要偵測「引號未閉合」就必須把回傳型別從 `string[][]`
 * 改成可攜帶錯誤的型別，牽動所有呼叫端；而下游（§5／§6）本來就會核對
 * 「欄位數是否等於標題數」，未閉合引號造成的列數／欄位數異常會被那一層攔下，
 * 不需要本模組額外報錯。
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
		} else if (char === CARRIAGE_RETURN) {
			// `\r\n` 由後續的 LINE_FEED 分支結束該列；單獨的 CR 不在支援範圍內（見 design.md Non-Goals），
			// 引號外的單獨 CR 會被靜默丟棄（不進 currentField）——若欄位值本身含 CR，
			// 呼叫端須透過 toCsv 跳脫（needsQuoting 已涵蓋 CR），CR 才會被引號保護、原樣讀回。
			continue;
		} else if (char === LINE_FEED) {
			currentRow.push(currentField);
			rows.push(currentRow);
			currentRow = [];
			currentField = "";
		} else {
			currentField += char;
		}
	}

	// 迴圈結束時若剛好停在列邊界（上一個字元是換行，已經把該列 push 過），
	// currentField 與 currentRow 皆會是空的初始狀態——此時不可再推入一列，
	// 否則以換行結尾的檔案（Google Sheets／Excel 另存的常態）會多吐出幻影空列 [""]。
	// 檔案「中間」的空列語意不同、必須保留，本條件只作用在字串結尾，不影響中間空列。
	if (currentField !== "" || currentRow.length !== 0) {
		currentRow.push(currentField);
		rows.push(currentRow);
	}

	return rows;
}
