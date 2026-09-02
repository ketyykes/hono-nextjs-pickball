// 參賽者名單 CSV 的解析與逐列驗證。序列化的底層規則（BOM、跳脫、換行）一律委派 csv.ts
// 的 parseCsv，本模組只負責「欄位對應」與「逐列驗證」（design.md Decision 1）。
//
// 顏色與 rating 的寫入邏輯（round、自動配色）刻意不在此模組實作，一律交由 roster.ts 的
// addPlayer 處理（design.md Decision 9）；本模組只負責「篩出可餵給 addPlayer 的輸入」。

import { parseCsv } from "./csv";
import { addPlayer } from "./roster";
import type { AddPlayerInput } from "./roster";
import type { Gender, Player } from "./types";
import { RATING_MIN, RATING_MAX } from "./rating-types";
import { TRANSFER_MESSAGES } from "./transfer-types";

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

/**
 * 依標題名稱找出各欄位在資料列中的索引；找不到則為 -1。
 * 標題列若有重複欄名（例如兩個「名稱」），`indexOf` 只會取第一個，第二欄的值
 * 靜默丟棄——這是刻意的取捨（Stage 2 review Minor m4）：重複標題本身已是使用者
 * 誤填，本模組不額外偵測，行為與「多一個未知欄位」一致（忽略而非報錯）。
 */
function findHeaderIndex(headerRow: readonly string[], headerName: string): number {
	return headerRow.indexOf(headerName);
}

/** Hex 色碼格式，與 types.ts 的 HexColorSchema 相同規則。 */
const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

/** 必填標題欄，顏色兩欄選填不在此列——缺漏才需整份拒絕（design「必填標題欄缺漏」）。 */
const REQUIRED_HEADERS: readonly string[] = [
	ROSTER_CSV_HEADERS.name,
	ROSTER_CSV_HEADERS.gender,
	ROSTER_CSV_HEADERS.rating,
];

/**
 * 單一欄位驗證的統一形狀：合法時帶正規化後的值，不合法時帶繁體中文原因。
 * 五個欄位各自的驗證函式皆回傳這個形狀，讓呼叫端（collectField）用同一套
 * 邏輯組裝 RosterCsvRowError，不必五段各寫各的錯誤組裝（task 5.13）。
 */
type FieldValidation<T> =
	| { readonly valid: true; readonly value: T }
	| { readonly valid: false; readonly reason: string };

/** 名稱：trim 後不可為空白。 */
function validateName(raw: string): FieldValidation<string> {
	const value = raw.trim();
	if (value === "") {
		return { valid: false, reason: "名稱不可為空白" };
	}
	return { valid: true, value };
}

/** 性別：trim + toLowerCase 後查 GENDER_LOOKUP，查無對應值視為錯誤而非回退為 other。 */
function validateGender(raw: string): FieldValidation<Gender> {
	const normalized = raw.trim().toLowerCase();
	const gender = GENDER_LOOKUP[normalized];
	if (gender === undefined) {
		return {
			valid: false,
			reason: "性別無法辨識，請填入常見寫法（男／女／其他等）",
		};
	}
	return { valid: true, value: gender };
}

/**
 * 強度分數：1.00～8.00 的數字；非數字與超出範圍是兩種不同的錯誤原因。
 *
 * `.trim()` 不是為了讓 `Number()` 正確解析（`Number()` 本就忽略前後空白），
 * 而是為了讓純空白輸入（如 `"   "`）命中下面的 `trimmed === ""` 分支、回報
 * 「需為數字」，而非讓 `Number("   ")` 的值 0 落入下面的範圍檢查、誤報成
 * 「需介於…之間」（Stage 2 review Minor m1）。
 *
 * 另外 `Number()` 的寬鬆語法會一併接受 `"0x5"`／`"+5"`／`"5."` 等非十進位或
 * 非常規寫法（皆會被轉為落在合法範圍內的數字），與「強度分數需為數字」的
 * 使用者心智模型有落差，但因結果仍落在合法範圍內故無實害，故不額外收緊
 * （Simplicity First；Stage 2 review Minor m6）。
 */
function validateRating(raw: string): FieldValidation<number> {
	const trimmed = raw.trim();
	const value = Number(trimmed);
	if (trimmed === "" || Number.isNaN(value)) {
		return { valid: false, reason: "強度分數需為數字" };
	}
	if (value < RATING_MIN || value > RATING_MAX) {
		return {
			valid: false,
			reason: `強度分數需介於 ${RATING_MIN}.00 至 ${RATING_MAX}.00 之間`,
		};
	}
	return { valid: true, value };
}

/**
 * 顏色欄（起點／終點共用）：選填，空字串視為「未提供」而非錯誤——
 * 是否要因為「只給一端」而整組回退為未指定，由呼叫端依 design Decision 9 判斷，
 * 本函式只負責「有填時格式是否合法」。
 */
function validateOptionalHexColor(raw: string, invalidReason: string): FieldValidation<string> {
	const value = raw.trim();
	if (value === "") {
		return { valid: true, value: "" };
	}
	if (!HEX_COLOR_PATTERN.test(value)) {
		return { valid: false, reason: invalidReason };
	}
	return { valid: true, value };
}

/**
 * 依驗證結果組裝該列的錯誤（不合法時推入 rowErrors）並回傳正規化後的值；
 * 五個欄位共用同一組裝邏輯，避免各自重複「合法取值、不合法推錯誤」的樣板。
 */
function collectField<T>(
	rowErrors: RosterCsvRowError[],
	row: number,
	column: string,
	validation: FieldValidation<T>,
): T | undefined {
	if (validation.valid) {
		return validation.value;
	}
	rowErrors.push({ row, column, reason: validation.reason });
	return undefined;
}

export function parseRosterCsv(text: string): ParseRosterCsvResult {
	const table = parseCsv(text);
	// 標題名稱與五個儲存格值一樣一律 trim：使用者複製貼上或試算表匯出時，標題欄
	// 前後帶空白是常態，不 trim 會讓 indexOf 精確比對全部落空，回傳「整份缺欄位」
	// 這種與畫面所見矛盾的訊息（Stage 2 review Major M1）。
	const headerRow = (table[0] ?? []).map((header) => header.trim());

	// 必填標題欄檢查 MUST 在逐列解析之前執行：缺欄位時直接整份拒絕，
	// 不進入逐列迴圈——否則每一列都會各自產生同一個「找不到欄位」的錯誤，
	// 刷出上百則重複訊息（design.md 對應風險）。
	const missingHeaders = REQUIRED_HEADERS.filter(
		(header) => !headerRow.includes(header),
	);
	if (missingHeaders.length > 0) {
		return {
			ok: false,
			message: TRANSFER_MESSAGES.missingRosterCsvHeaders(missingHeaders),
		};
	}

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

		// 空白資料列（Google Sheets／Excel 框選範圍匯出時夾帶的常態）直接跳過，
		// 不計入 rows 也不計入 errors（design.md Decision 13）：若計為錯誤，
		// §6「任一列有錯即整份不匯入」會讓夾帶空白列的正常檔案完全無法匯入。
		// 判定方式為「五個已對應到的欄位 trim 後皆為空字串」，涵蓋 parseCsv 的兩種
		// 空白列形狀——純空行（`[""]`）與 Sheets 風格全空列（`,,,,`，欄位數正確但全空）。
		// dataIndex 不受跳過影響，後續列的 spreadsheetRow 依然是 `資料索引 + 2`，不會漂移。
		const isBlankRow = [nameIndex, genderIndex, ratingIndex, colorFromIndex, colorToIndex].every(
			(index) => (dataRow[index] ?? "").trim() === "",
		);
		if (isBlankRow) {
			return;
		}

		const rowErrors: RosterCsvRowError[] = [];

		const name = collectField(
			rowErrors,
			spreadsheetRow,
			ROSTER_CSV_HEADERS.name,
			validateName(dataRow[nameIndex] ?? ""),
		);
		const gender = collectField(
			rowErrors,
			spreadsheetRow,
			ROSTER_CSV_HEADERS.gender,
			validateGender(dataRow[genderIndex] ?? ""),
		);
		const rating = collectField(
			rowErrors,
			spreadsheetRow,
			ROSTER_CSV_HEADERS.rating,
			validateRating(dataRow[ratingIndex] ?? ""),
		);
		const colorFrom = collectField(
			rowErrors,
			spreadsheetRow,
			ROSTER_CSV_HEADERS.colorFrom,
			validateOptionalHexColor(dataRow[colorFromIndex] ?? "", "顏色起點格式錯誤，須為 #RRGGBB"),
		);
		const colorTo = collectField(
			rowErrors,
			spreadsheetRow,
			ROSTER_CSV_HEADERS.colorTo,
			validateOptionalHexColor(dataRow[colorToIndex] ?? "", "顏色終點格式錯誤，須為 #RRGGBB"),
		);

		if (rowErrors.length > 0) {
			errors.push(...rowErrors);
			return;
		}

		// 走到這裡代表本列所有欄位皆合法，collectField 必已回傳定義值
		// （rowErrors 為空代表五個欄位皆未觸發 undefined 分支）。
		const row: RosterCsvRow = {
			name: name as string,
			gender: gender as Gender,
			rating: rating as number,
		};
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

/** applyRosterImport 所需的注入值：id 陣列與統一的建立時間，皆由呼叫端（未來的 useRosterStore）提供。 */
export interface ApplyRosterImportContext {
	/** 依序對應 parsed.rows 每一列的 id，長度須與 parsed.rows 相等（design Decision 9）。 */
	readonly ids: readonly string[];
	readonly now: string;
}

/**
 * 將 CSV 解析結果套用到既有名單，寫入採**附加**模式（design Decision 9；prd.md 9.3.2）。
 *
 * 第二個參數直接複用 `parseRosterCsv` 的成功回傳形狀（`{ rows, errors }`），
 * SHALL NOT 為此函式另立第二種只服務本函式的型別（task 6.2／6.4）。
 *
 * 任一列驗證失敗（`parsed.errors` 非空）時直接回傳原名單，不進入逐列迴圈——
 * 「整份不匯入」不是「跳過失敗列後匯入其餘合法列」。
 *
 * 逐列以 `reduce` 呼叫 `roster.ts` 的 `addPlayer`，且**累積值為成長中的名單**
 * （每次呼叫都看到前一列寫入後的結果）：rating 的兩位小數 round、顏色兩端同進同出
 * 判定、自動配色的「最小未使用 palette index」皆委派 `addPlayer` 處理，本函式
 * SHALL NOT 自行組裝 `Player` 物件。也因為是逐列疊加而非固定名單，同一次匯入內
 * 多列未提供顏色時會各自取得互不相同的預設漸層（design Decision 9）。
 *
 * `id`／`now` 由呼叫端注入（design Decision 4／9），本函式不呼叫
 * `crypto.randomUUID()` 或 `new Date()`。`context.ids.length` 與 `parsed.rows.length`
 * 不符視為呼叫端錯誤，直接 throw 可判讀的訊息。
 */
export function applyRosterImport(
	roster: readonly Player[],
	parsed: Extract<ParseRosterCsvResult, { ok: true }>,
	context: ApplyRosterImportContext,
): Player[] {
	if (parsed.errors.length > 0) {
		return [...roster];
	}

	if (context.ids.length !== parsed.rows.length) {
		throw new Error(
			`applyRosterImport：id 數量（${context.ids.length}）與可新增列數量（${parsed.rows.length}）不符`,
		);
	}

	return parsed.rows.reduce<Player[]>(
		(accumulatedRoster, row, index) =>
			addPlayer(accumulatedRoster, row, { id: context.ids[index], now: context.now }),
		[...roster],
	);
}
