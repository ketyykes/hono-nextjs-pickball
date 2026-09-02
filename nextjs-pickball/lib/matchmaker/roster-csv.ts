// 參賽者名單 CSV 的解析與逐列驗證。序列化的底層規則（BOM、跳脫、換行）一律委派 csv.ts
// 的 parseCsv，本模組只負責「欄位對應」與「逐列驗證」（design.md Decision 1）。
//
// 顏色與 rating 的寫入邏輯（round、自動配色）刻意不在此模組實作，一律交由 roster.ts 的
// addPlayer 處理（design.md Decision 9）；本模組只負責「篩出可餵給 addPlayer 的輸入」。

import { parseCsv } from "./csv";
import type { AddPlayerInput } from "./roster";
import type { Gender } from "./types";

/** CSV 的五個標題欄名稱（繁體中文），欄位對應依名稱而非位置。 */
export const ROSTER_CSV_HEADERS = {
	name: "名稱",
	gender: "性別",
	rating: "強度分數",
	colorFrom: "顏色起點",
	colorTo: "顏色終點",
} as const;

/** 一列可新增的資料：形狀可直接餵給 roster.ts 的 addPlayer。 */
export type RosterCsvRow = AddPlayerInput;

/** 一列的問題：列號為試算表行號（標題列為第 1 列，第一筆資料為第 2 列）。 */
export interface RosterCsvRowError {
	readonly row: number;
	readonly column: string;
	readonly reason: string;
}

export type ParseRosterCsvResult =
	| { readonly ok: true; readonly rows: RosterCsvRow[]; readonly errors: RosterCsvRowError[] }
	| { readonly ok: false; readonly message: string };

/** 性別正規化對照表：trim + toLowerCase 後查表。 */
const GENDER_LOOKUP: Record<string, Gender> = {
	男: "male",
	male: "male",
	m: "male",
	女: "female",
	female: "female",
	f: "female",
	其他: "other",
	不指定: "other",
	other: "other",
};

/** 依標題名稱找出各欄位在資料列中的索引；找不到則為 -1。 */
function findHeaderIndex(headerRow: readonly string[], headerName: string): number {
	return headerRow.indexOf(headerName);
}

/** rating 的合法範圍（含端點），對應 types.ts 的 PlayerSchema.rating。 */
const RATING_MIN = 1;
const RATING_MAX = 8;

/** Hex 色碼格式，與 types.ts 的 HexColorSchema 相同規則。 */
const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

export function parseRosterCsv(text: string): ParseRosterCsvResult {
	const table = parseCsv(text);
	const headerRow = table[0] ?? [];
	const dataRows = table.slice(1);

	const nameIndex = findHeaderIndex(headerRow, ROSTER_CSV_HEADERS.name);
	const genderIndex = findHeaderIndex(headerRow, ROSTER_CSV_HEADERS.gender);
	const ratingIndex = findHeaderIndex(headerRow, ROSTER_CSV_HEADERS.rating);
	const colorFromIndex = findHeaderIndex(headerRow, ROSTER_CSV_HEADERS.colorFrom);
	const colorToIndex = findHeaderIndex(headerRow, ROSTER_CSV_HEADERS.colorTo);

	const rows: RosterCsvRow[] = [];
	const errors: RosterCsvRowError[] = [];

	dataRows.forEach((dataRow, dataIndex) => {
		// 試算表行號：標題列固定為第 1 列，第一筆資料（dataIndex 0）為第 2 列。
		const spreadsheetRow = dataIndex + 2;
		const rowErrors: RosterCsvRowError[] = [];

		const name = (dataRow[nameIndex] ?? "").trim();
		if (name === "") {
			rowErrors.push({
				row: spreadsheetRow,
				column: ROSTER_CSV_HEADERS.name,
				reason: "名稱不可為空白",
			});
		}

		const genderRaw = (dataRow[genderIndex] ?? "").trim().toLowerCase();
		const gender = GENDER_LOOKUP[genderRaw];
		if (gender === undefined) {
			rowErrors.push({
				row: spreadsheetRow,
				column: ROSTER_CSV_HEADERS.gender,
				reason: "性別無法辨識，請填入常見寫法（男／女／其他等）",
			});
		}

		const ratingRaw = (dataRow[ratingIndex] ?? "").trim();
		const rating = Number(ratingRaw);
		if (ratingRaw === "" || Number.isNaN(rating)) {
			rowErrors.push({
				row: spreadsheetRow,
				column: ROSTER_CSV_HEADERS.rating,
				reason: "強度分數需為數字",
			});
		} else if (rating < RATING_MIN || rating > RATING_MAX) {
			rowErrors.push({
				row: spreadsheetRow,
				column: ROSTER_CSV_HEADERS.rating,
				reason: `強度分數需介於 ${RATING_MIN}.00 至 ${RATING_MAX}.00 之間`,
			});
		}

		const colorFrom = (dataRow[colorFromIndex] ?? "").trim();
		const colorTo = (dataRow[colorToIndex] ?? "").trim();
		if (colorFrom !== "" && !HEX_COLOR_PATTERN.test(colorFrom)) {
			rowErrors.push({
				row: spreadsheetRow,
				column: ROSTER_CSV_HEADERS.colorFrom,
				reason: "顏色起點格式錯誤，須為 #RRGGBB",
			});
		}
		if (colorTo !== "" && !HEX_COLOR_PATTERN.test(colorTo)) {
			rowErrors.push({
				row: spreadsheetRow,
				column: ROSTER_CSV_HEADERS.colorTo,
				reason: "顏色終點格式錯誤，須為 #RRGGBB",
			});
		}

		if (rowErrors.length > 0) {
			errors.push(...rowErrors);
			return;
		}

		// 走到這裡代表本列所有欄位皆合法，gender 必已在 GENDER_LOOKUP 中查得到。
		const row: RosterCsvRow = { name, gender: gender as Gender, rating };
		// 顏色兩端同進同出（design Decision 9）：只給一端時兩端皆不帶入，
		// 交由 addPlayer 走自動配色，不在本模組另寫顏色判定。
		if (colorFrom !== "" && colorTo !== "") {
			row.colorFrom = colorFrom;
			row.colorTo = colorTo;
		}
		rows.push(row);
	});

	return { ok: true, rows, errors };
}
