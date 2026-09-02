import { describe, it, expect } from "vitest";
import { parseRosterCsv, ROSTER_CSV_HEADERS } from "./roster-csv";

/** 標題列文字，欄位順序依 ROSTER_CSV_HEADERS 的既定順序。 */
const HEADER_LINE = [
	ROSTER_CSV_HEADERS.name,
	ROSTER_CSV_HEADERS.gender,
	ROSTER_CSV_HEADERS.rating,
	ROSTER_CSV_HEADERS.colorFrom,
	ROSTER_CSV_HEADERS.colorTo,
].join(",");

describe("parseRosterCsv", () => {
	it("合法 CSV 解析出對應筆數且性別已正規化", () => {
		const csv = [
			HEADER_LINE,
			"王小明,male,5.5,#FF0000,#00FF00",
			"陳美麗,female,4.2,,",
			"林小華,other,6.0,,",
		].join("\r\n");

		const result = parseRosterCsv(csv);

		expect(result.ok).toBe(true);
		if (!result.ok) {
			throw new Error("unreachable");
		}
		expect(result.errors).toEqual([]);
		expect(result.rows).toEqual([
			{ name: "王小明", gender: "male", rating: 5.5, colorFrom: "#FF0000", colorTo: "#00FF00" },
			{ name: "陳美麗", gender: "female", rating: 4.2 },
			{ name: "林小華", gender: "other", rating: 6.0 },
		]);
	});

	it("性別欄接受中英文常見寫法並忽略大小寫與前後空白", () => {
		const csv = [
			HEADER_LINE,
			"甲,男,5.0,,",
			"乙,female,5.0,,",
			"丙, M ,5.0,,",
			"丁,不指定,5.0,,",
		].join("\r\n");

		const result = parseRosterCsv(csv);

		expect(result.ok).toBe(true);
		if (!result.ok) {
			throw new Error("unreachable");
		}
		expect(result.errors).toEqual([]);
		expect(result.rows.map((row) => row.gender)).toEqual(["male", "female", "male", "other"]);
	});

	/**
	 * 補充測試（非六條必要測試之一）：性別對照表的九種常見寫法逐一覆蓋，
	 * 避免只測其中三四個造成查表其餘分支零覆蓋（Stage 2 mutation 教訓）。
	 */
	it("性別對照表的每個常見寫法都能正確對應", () => {
		const cases: ReadonlyArray<{ input: string; expected: string }> = [
			{ input: "男", expected: "male" },
			{ input: "male", expected: "male" },
			{ input: "M", expected: "male" },
			{ input: "女", expected: "female" },
			{ input: "female", expected: "female" },
			{ input: "F", expected: "female" },
			{ input: "其他", expected: "other" },
			{ input: "不指定", expected: "other" },
			{ input: "other", expected: "other" },
		];
		const csv = [
			HEADER_LINE,
			...cases.map((c, index) => `第${index}人,${c.input},5.0,,`),
		].join("\r\n");

		const result = parseRosterCsv(csv);

		expect(result.ok).toBe(true);
		if (!result.ok) {
			throw new Error("unreachable");
		}
		expect(result.errors).toEqual([]);
		expect(result.rows.map((row) => row.gender)).toEqual(cases.map((c) => c.expected));
	});

	it("無法對應的性別記為該列錯誤而非靜默歸為 other", () => {
		const csv = [HEADER_LINE, "小貓,貓,5.0,,"].join("\r\n");

		const result = parseRosterCsv(csv);

		expect(result.ok).toBe(true);
		if (!result.ok) {
			throw new Error("unreachable");
		}
		expect(result.rows).toEqual([]);
		expect(result.errors).toEqual([
			{ row: 2, column: ROSTER_CSV_HEADERS.gender, reason: expect.stringMatching(/[一-龥]/) },
		]);
	});

	it("每筆錯誤指出試算表列號、欄位與繁體中文原因", () => {
		const csv = [
			HEADER_LINE,
			"甲,male,5.0,,", // 第 2 列，合法
			" ,female,5.0,,", // 第 3 列，名稱空白
			"丙,other,5.0,,", // 第 4 列，合法
			"丁,male,9,,", // 第 5 列，強度分數超出範圍
		].join("\r\n");

		const result = parseRosterCsv(csv);

		expect(result.ok).toBe(true);
		if (!result.ok) {
			throw new Error("unreachable");
		}
		expect(result.rows).toEqual([
			{ name: "甲", gender: "male", rating: 5.0 },
			{ name: "丙", gender: "other", rating: 5.0 },
		]);
		expect(result.errors).toEqual([
			{
				row: 3,
				column: ROSTER_CSV_HEADERS.name,
				reason: expect.stringMatching(/[一-龥]/),
			},
			{
				row: 5,
				column: ROSTER_CSV_HEADERS.rating,
				reason: expect.stringMatching(/[一-龥]/),
			},
		]);
	});

	/**
	 * 補充測試（非六條必要測試之一）：強度分數「非數字」與「超出範圍（低於下限）」
	 * 是兩種不同的錯誤原因，5.7 只覆蓋了「超出範圍（高於上限）」，此處補上另兩種，
	 * 避免 rating 分支的其餘兩條路徑零覆蓋（Stage 2 mutation 教訓）。
	 */
	it("強度分數非數字或低於下限時記為該列錯誤", () => {
		const csv = [HEADER_LINE, "甲,male,abc,,", "乙,male,0.5,,"].join("\r\n");

		const result = parseRosterCsv(csv);

		expect(result.ok).toBe(true);
		if (!result.ok) {
			throw new Error("unreachable");
		}
		expect(result.rows).toEqual([]);
		expect(result.errors).toEqual([
			{ row: 2, column: ROSTER_CSV_HEADERS.rating, reason: expect.stringMatching(/[一-龥]/) },
			{ row: 3, column: ROSTER_CSV_HEADERS.rating, reason: expect.stringMatching(/[一-龥]/) },
		]);
	});

	/**
	 * 補充測試（非六條必要測試之一）：顏色格式錯誤是 self-review checklist 明列的
	 * 錯誤原因之一，此處分別驗證「起點格式錯」與「終點格式錯」兩個欄位皆會被攔下。
	 */
	it("顏色格式不正確時記為該列錯誤", () => {
		const csv = [
			HEADER_LINE,
			"甲,male,5.0,red,#00FF00",
			"乙,male,5.0,#FF0000,blue",
		].join("\r\n");

		const result = parseRosterCsv(csv);

		expect(result.ok).toBe(true);
		if (!result.ok) {
			throw new Error("unreachable");
		}
		expect(result.rows).toEqual([]);
		expect(result.errors).toEqual([
			{ row: 2, column: ROSTER_CSV_HEADERS.colorFrom, reason: expect.stringMatching(/[一-龥]/) },
			{ row: 3, column: ROSTER_CSV_HEADERS.colorTo, reason: expect.stringMatching(/[一-龥]/) },
		]);
	});

	/**
	 * 補充測試（非六條必要測試之一）：同一列可能同時觸發多個欄位錯誤，
	 * 驗證所有錯誤皆會被回報而非只回報第一個就中止該列的驗證。
	 */
	it("單一列同時觸發多個欄位錯誤時全部回報", () => {
		const csv = [HEADER_LINE, " ,貓,abc,red,"].join("\r\n");

		const result = parseRosterCsv(csv);

		expect(result.ok).toBe(true);
		if (!result.ok) {
			throw new Error("unreachable");
		}
		expect(result.rows).toEqual([]);
		expect(result.errors).toEqual([
			{ row: 2, column: ROSTER_CSV_HEADERS.name, reason: expect.stringMatching(/[一-龥]/) },
			{ row: 2, column: ROSTER_CSV_HEADERS.gender, reason: expect.stringMatching(/[一-龥]/) },
			{ row: 2, column: ROSTER_CSV_HEADERS.rating, reason: expect.stringMatching(/[一-龥]/) },
			{ row: 2, column: ROSTER_CSV_HEADERS.colorFrom, reason: expect.stringMatching(/[一-龥]/) },
		]);
	});

	it("缺少必填標題欄時回傳結構性錯誤並指出欄位名稱", () => {
		// 標題列缺少「強度分數」。
		const csv = [
			"名稱,性別,顏色起點,顏色終點",
			"甲,male,,",
			"乙,female,,",
		].join("\r\n");

		const result = parseRosterCsv(csv);

		expect(result.ok).toBe(false);
		if (result.ok) {
			throw new Error("unreachable");
		}
		expect(result.message).toContain(ROSTER_CSV_HEADERS.rating);
	});

	/**
	 * Stage 2 review Major M1：標題名稱前後若帶有多餘空白（使用者複製貼上／試算表
	 * 匯出時常見），現行 `indexOf` 精確比對會全部找不到，回傳「三欄全缺」的
	 * 結構性錯誤——但使用者眼中的標題列明明白白寫著這三個欄位，訊息謊報缺欄位。
	 * 五個儲存格值都已 trim，標題名稱理應一致處理。
	 */
	it("標題欄名稱前後有多餘空白時仍可正確辨識並解析", () => {
		const csv = [
			" 名稱 , 性別 , 強度分數 , 顏色起點 , 顏色終點 ",
			"王小明,male,5.5,#FF0000,#00FF00",
		].join("\r\n");

		const result = parseRosterCsv(csv);

		expect(result.ok).toBe(true);
		if (!result.ok) {
			throw new Error("unreachable");
		}
		expect(result.errors).toEqual([]);
		expect(result.rows).toEqual([
			{ name: "王小明", gender: "male", rating: 5.5, colorFrom: "#FF0000", colorTo: "#00FF00" },
		]);
	});

	it("只提供顏色起點或終點其中一端時整組改走自動配色", () => {
		const csv = [
			HEADER_LINE,
			"甲,male,5.0,#FF0000,", // 只給起點
			"乙,male,5.0,,#00FF00", // 只給終點
		].join("\r\n");

		const result = parseRosterCsv(csv);

		expect(result.ok).toBe(true);
		if (!result.ok) {
			throw new Error("unreachable");
		}
		expect(result.errors).toEqual([]);
		expect(result.rows).toEqual([
			{ name: "甲", gender: "male", rating: 5.0 },
			{ name: "乙", gender: "male", rating: 5.0 },
		]);
	});

	/**
	 * 補充測試（非六條必要測試之一）：顏色欄的四種組合（只給起點／只給終點／
	 * 兩端都給／兩端都空）皆需覆蓋，5.11 只驗證了前兩種，此處補上「兩端都給」
	 * 與「兩端都空」，避免 addPlayer 一定會收到的 colorFrom／colorTo 賦值分支
	 * 零覆蓋（Stage 2 mutation 教訓）。
	 */
	it("顏色兩端都提供時整組帶入、兩端都空白時維持未指定", () => {
		const csv = [
			HEADER_LINE,
			"甲,male,5.0,#FF0000,#00FF00", // 兩端都給
			"乙,male,5.0,,", // 兩端都空
		].join("\r\n");

		const result = parseRosterCsv(csv);

		expect(result.ok).toBe(true);
		if (!result.ok) {
			throw new Error("unreachable");
		}
		expect(result.errors).toEqual([]);
		expect(result.rows).toEqual([
			{ name: "甲", gender: "male", rating: 5.0, colorFrom: "#FF0000", colorTo: "#00FF00" },
			{ name: "乙", gender: "male", rating: 5.0 },
		]);
	});

	/**
	 * Stage 2 review Blocker B1：檔案中間的空白資料列（Google Sheets／Excel 框選範圍
	 * 匯出的常態）MUST 直接跳過，不計入 rows 也不計入 errors——若計為錯誤，§6「任一列
	 * 有錯即整份不匯入」會讓夾帶空白列的正常檔案完全無法匯入（design Decision 13）。
	 * 同時餵 `parseCsv` 下兩種不同形狀的空白列：純空行（單一空欄位）與 Sheets 風格的
	 * `,,,,`（欄位數正確但全空），並確認空白列之後的合法／錯誤列列號不因跳過而漂移。
	 */
	it("檔案中間的空白資料列會被跳過，不計入可新增列或錯誤列，且不影響後續列號", () => {
		const csv = [
			HEADER_LINE,
			"甲,male,5.0,,", // 第 2 列，合法
			"", // 第 3 列，純空行（parseCsv 產出 [""]）
			",,,,", // 第 4 列，Sheets 風格全空列（欄位數正確但全空）
			"乙,female,4.0,,", // 第 5 列，合法——驗證列號未因空白列被跳過而漂移
			"丙,male,9,,", // 第 6 列，強度分數超出範圍——驗證錯誤列列號亦未漂移
		].join("\r\n");

		const result = parseRosterCsv(csv);

		expect(result.ok).toBe(true);
		if (!result.ok) {
			throw new Error("unreachable");
		}
		expect(result.rows).toEqual([
			{ name: "甲", gender: "male", rating: 5.0 },
			{ name: "乙", gender: "female", rating: 4.0 },
		]);
		expect(result.errors).toEqual([
			{ row: 6, column: ROSTER_CSV_HEADERS.rating, reason: expect.stringContaining("1.00") },
		]);
	});

	/**
	 * 自我複查要求的驗證：欄位對應依標題名稱而非位置，此處刻意打亂標題欄順序
	 * （顏色兩欄與強度分數對調），確認仍能正確對應——若實作改回依欄位位置
	 * 對應，本測試會轉紅。
	 */
	it("標題欄順序被打亂仍能依標題名稱正確對應", () => {
		const shuffledHeader = [
			ROSTER_CSV_HEADERS.colorTo,
			ROSTER_CSV_HEADERS.name,
			ROSTER_CSV_HEADERS.colorFrom,
			ROSTER_CSV_HEADERS.rating,
			ROSTER_CSV_HEADERS.gender,
		].join(",");
		const csv = [shuffledHeader, "#00FF00,王小明,#FF0000,5.5,male"].join("\r\n");

		const result = parseRosterCsv(csv);

		expect(result.ok).toBe(true);
		if (!result.ok) {
			throw new Error("unreachable");
		}
		expect(result.errors).toEqual([]);
		expect(result.rows).toEqual([
			{ name: "王小明", gender: "male", rating: 5.5, colorFrom: "#FF0000", colorTo: "#00FF00" },
		]);
	});
});
