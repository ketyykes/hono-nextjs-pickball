import { describe, it, expect } from "vitest";
import { applyRosterImport, parseRosterCsv, ROSTER_CSV_HEADERS } from "./roster-csv";
import type { Player } from "./types";

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
			{ row: 2, column: ROSTER_CSV_HEADERS.gender, reason: expect.stringContaining("性別") },
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
				reason: expect.stringContaining("名稱"),
			},
			{
				row: 5,
				column: ROSTER_CSV_HEADERS.rating,
				reason: expect.stringMatching(/1\.00 至 8\.00/),
			},
		]);
	});

	/**
	 * 補充測試（非六條必要測試之一）：強度分數的四種錯誤路徑——非數字（`abc`）、
	 * 顯式空字串、只有空白（`"   "`）皆屬「需為數字」，超出下限則屬「需介於…」，
	 * 5.7 只覆蓋了「超出範圍（高於上限）」，此處補齊另外三種，避免 rating 分支
	 * 零覆蓋（Stage 2 mutation 教訓）。
	 *
	 * Stage 2 review Major M4／Minor N4／V5：原本所有 reason 斷言都只檢查
	 * 「含中文字」，等於沒斷言——把「顏色終點」的錯誤原因寫死成「顏色起點」都能
	 * 存活。此處改為斷言辨識性關鍵字：非數字類含「數字」，範圍類含「1.00」與
	 * 「8.00」，藉此同時區分兩種錯誤原因、也讓「空字串」「純空白」兩種輸入各自
	 * 命中正確分支（V5：移除 `trimmed === ""` 判定；N4：移除 rating 的 `.trim()`）。
	 */
	it("強度分數非數字或低於下限時記為該列錯誤", () => {
		const csv = [
			HEADER_LINE,
			"甲,male,abc,,", // 非數字
			"乙,male,,,", // 顯式空字串
			"丙,male,   ,,", // 只有空白
			"丁,male,0.5,,", // 低於下限
		].join("\r\n");

		const result = parseRosterCsv(csv);

		expect(result.ok).toBe(true);
		if (!result.ok) {
			throw new Error("unreachable");
		}
		expect(result.rows).toEqual([]);
		expect(result.errors).toEqual([
			{ row: 2, column: ROSTER_CSV_HEADERS.rating, reason: expect.stringContaining("數字") },
			{ row: 3, column: ROSTER_CSV_HEADERS.rating, reason: expect.stringContaining("數字") },
			{ row: 4, column: ROSTER_CSV_HEADERS.rating, reason: expect.stringContaining("數字") },
			{ row: 5, column: ROSTER_CSV_HEADERS.rating, reason: expect.stringMatching(/1\.00 至 8\.00/) },
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
			{ row: 2, column: ROSTER_CSV_HEADERS.colorFrom, reason: expect.stringContaining("顏色起點") },
			{ row: 3, column: ROSTER_CSV_HEADERS.colorTo, reason: expect.stringContaining("顏色終點") },
		]);
	});

	/**
	 * Stage 2 review Major M3：顏色 regex 原本只被「連 # 都沒有」的輸入守著
	 * （合法樣本清一色大寫、非法樣本只有 `red`／`blue`），縮寫、過長、只收大寫
	 * 等三種 regex 破壞方式全部零覆蓋。最要命的是「只收大寫」——`PlayerForm.tsx`
	 * 的 `<input type="color">` 依 HTML 規範一律回傳小寫 hex，使用者從既有名單
	 * 抄出來的顏色幾乎都是小寫，若 regex 被誤收緊只收大寫，整批小寫顏色會全部
	 * 報錯而測試仍全綠。同時併入 Minor m2：`.trim()` 是 load-bearing 卻零覆蓋，
	 * 此處以「前後帶空白」與「只有空白視為未填」兩案例一併驗證。
	 */
	it("顏色格式驗證涵蓋大小寫、長度邊界與前後空白", () => {
		const csv = [
			HEADER_LINE,
			"甲,male,5.0,#FF0000,#00FF00", // 大寫，兩端合法
			"乙,male,5.0,#abcdef,#012345", // 小寫，兩端合法
			"丙,male,5.0, #FF0000 ,#00FF00", // 起點前後帶空白，trim 後合法
			"丁,male,5.0,   ,#00FF00", // 起點只有空白，視為未填，非格式錯誤（同進同出→兩端皆不帶入）
			"戊,male,5.0,#ABC,#00FF00", // 起點過短
			"己,male,5.0,#ABCDEF0,#00FF00", // 起點過長
			"庚,male,5.0,ABCDEF,#00FF00", // 起點缺少 #
			"辛,male,5.0,#GGGGGG,#00FF00", // 起點含非 hex 字元
		].join("\r\n");

		const result = parseRosterCsv(csv);

		expect(result.ok).toBe(true);
		if (!result.ok) {
			throw new Error("unreachable");
		}
		expect(result.rows).toEqual([
			{ name: "甲", gender: "male", rating: 5.0, colorFrom: "#FF0000", colorTo: "#00FF00" },
			{ name: "乙", gender: "male", rating: 5.0, colorFrom: "#abcdef", colorTo: "#012345" },
			{ name: "丙", gender: "male", rating: 5.0, colorFrom: "#FF0000", colorTo: "#00FF00" },
			{ name: "丁", gender: "male", rating: 5.0 },
		]);
		expect(result.errors).toEqual([
			{ row: 6, column: ROSTER_CSV_HEADERS.colorFrom, reason: expect.stringContaining("顏色起點") },
			{ row: 7, column: ROSTER_CSV_HEADERS.colorFrom, reason: expect.stringContaining("顏色起點") },
			{ row: 8, column: ROSTER_CSV_HEADERS.colorFrom, reason: expect.stringContaining("顏色起點") },
			{ row: 9, column: ROSTER_CSV_HEADERS.colorFrom, reason: expect.stringContaining("顏色起點") },
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
			{ row: 2, column: ROSTER_CSV_HEADERS.name, reason: expect.stringContaining("名稱") },
			{ row: 2, column: ROSTER_CSV_HEADERS.gender, reason: expect.stringContaining("性別") },
			{ row: 2, column: ROSTER_CSV_HEADERS.rating, reason: expect.stringContaining("數字") },
			{ row: 2, column: ROSTER_CSV_HEADERS.colorFrom, reason: expect.stringContaining("顏色起點") },
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
	 * Stage 2 review Major M2：唯一的結構性錯誤測試只拿掉「強度分數」，
	 * 「名稱」「性別」是否同為必填欄從未被驗證過——若日後有人不慎把「名稱」
	 * 移出必填清單，缺名稱欄的 CSV 會退化成「每一列都報一次名稱不可為空白」
	 * （正是 5.10 早退設計要避免的刷屏），但測試不會轉紅。此處改為遍歷三個
	 * 必填欄，逐一拿掉一欄並斷言整份拒絕、訊息指出正確欄位名稱。
	 */
	it("缺少任一必填標題欄時皆整份拒絕並指出該欄位名稱", () => {
		const allHeaders = [
			ROSTER_CSV_HEADERS.name,
			ROSTER_CSV_HEADERS.gender,
			ROSTER_CSV_HEADERS.rating,
			ROSTER_CSV_HEADERS.colorFrom,
			ROSTER_CSV_HEADERS.colorTo,
		];
		const requiredHeaders = [ROSTER_CSV_HEADERS.name, ROSTER_CSV_HEADERS.gender, ROSTER_CSV_HEADERS.rating];

		requiredHeaders.forEach((missingHeader) => {
			const remainingHeaders = allHeaders.filter((header) => header !== missingHeader);
			const csv = [remainingHeaders.join(","), "甲,male,5.0,,"].join("\r\n");

			const result = parseRosterCsv(csv);

			expect(result.ok).toBe(false);
			if (result.ok) {
				throw new Error("unreachable");
			}
			expect(result.message).toContain(missingHeader);
		});
	});

	/**
	 * Stage 2 review Major M2：把「顏色起點」誤加進必填清單會讓「只有三個必填欄、
	 * 沒有顏色欄」的極簡 CSV 整份被拒——這條主流程從未被測過。此處補上正向測試，
	 * 確認顏色兩欄確實是選填。
	 */
	it("只有三個必填標題欄、沒有顏色欄時仍可正常解析", () => {
		const csv = [
			[ROSTER_CSV_HEADERS.name, ROSTER_CSV_HEADERS.gender, ROSTER_CSV_HEADERS.rating].join(","),
			"甲,male,5.0",
			"乙,female,6.0",
		].join("\r\n");

		const result = parseRosterCsv(csv);

		expect(result.ok).toBe(true);
		if (!result.ok) {
			throw new Error("unreachable");
		}
		expect(result.errors).toEqual([]);
		expect(result.rows).toEqual([
			{ name: "甲", gender: "male", rating: 5.0 },
			{ name: "乙", gender: "female", rating: 6.0 },
		]);
	});

	/**
	 * Stage 2 review Minor m3：資料列欄位數少於標題數時，缺席的欄位（非顯式空字串，
	 * 而是陣列索引超界）MUST 視為空白，不可帶入任何非空預設值——否則會靜默偽造
	 * 出使用者從未填寫的資料。用只有名稱一欄的資料列隔離出「性別」欄位缺席的情況。
	 */
	it("資料列欄位數少於標題數時，缺席的欄位視為空白而非其他預設值", () => {
		const csv = [HEADER_LINE, "甲"].join("\r\n"); // 只有名稱欄，其餘四欄整個缺席

		const result = parseRosterCsv(csv);

		expect(result.ok).toBe(true);
		if (!result.ok) {
			throw new Error("unreachable");
		}
		expect(result.rows).toEqual([]);
		expect(result.errors).toEqual([
			{ row: 2, column: ROSTER_CSV_HEADERS.gender, reason: expect.stringContaining("性別") },
			{ row: 2, column: ROSTER_CSV_HEADERS.rating, reason: expect.stringContaining("數字") },
		]);
	});

	/**
	 * Stage 2 review Minor m3（stage2 報告原文情境）：資料列只有三欄、尾端顏色兩欄
	 * 整個缺席（非顯式空字串）時，MUST 視為未填色而正常匯入，不可報錯。
	 */
	it("資料列只有三欄、尾端顏色欄被截斷時仍可正常匯入", () => {
		const csv = [HEADER_LINE, "甲,male,5.0"].join("\r\n");

		const result = parseRosterCsv(csv);

		expect(result.ok).toBe(true);
		if (!result.ok) {
			throw new Error("unreachable");
		}
		expect(result.errors).toEqual([]);
		expect(result.rows).toEqual([{ name: "甲", gender: "male", rating: 5.0 }]);
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

	/**
	 * §6 task 6.1：預覽所需的資訊即 `parseRosterCsv` 的回傳形狀本身——可新增人數為
	 * `rows.length`，問題列（含列號與原因）即 `errors`，SHALL NOT 為 UI 另立第二種
	 * 回傳型別（task 6.2）。5 筆資料中第 2 筆性別無法辨識、第 4 筆強度分數超出範圍。
	 */
	it("預覽回報可新增人數與問題列的列號與原因", () => {
		const csv = [
			HEADER_LINE,
			"甲,male,5.0,,", // 第 2 列，合法
			"乙,貓,5.0,,", // 第 3 列，性別無法辨識
			"丙,female,5.0,,", // 第 4 列，合法
			"丁,male,9,,", // 第 5 列，強度分數超出範圍
			"戊,other,5.0,,", // 第 6 列，合法
		].join("\r\n");

		const result = parseRosterCsv(csv);

		expect(result.ok).toBe(true);
		if (!result.ok) {
			throw new Error("unreachable");
		}
		expect(result.rows).toHaveLength(3);
		expect(result.errors).toEqual([
			{ row: 3, column: ROSTER_CSV_HEADERS.gender, reason: expect.stringContaining("性別") },
			{ row: 5, column: ROSTER_CSV_HEADERS.rating, reason: expect.stringContaining("1.00") },
		]);
	});
});

/** applyRosterImport 測試共用的既有參賽者固定資料，欄位皆為任意但合法的值。 */
const EXISTING_PLAYER: Player = {
	id: "existing-1",
	name: "既有球員",
	gender: "male",
	colorFrom: "#0E6B63",
	colorTo: "#134E4A",
	rating: 5.0,
	restCount: 0,
	gamesPlayed: 0,
	isActive: true,
	createdAt: "2025-01-01T00:00:00.000Z",
};

describe("applyRosterImport", () => {
	it("任一列驗證失敗時整份不匯入，名單完全不變", () => {
		// 4 筆中第 3 筆強度分數 12 超出範圍，其餘 3 筆皆合法。
		const csv = [
			HEADER_LINE,
			"甲,male,5.0,,",
			"乙,female,4.0,,",
			"丙,male,12,,",
			"丁,other,5.0,,",
		].join("\r\n");
		const parsed = parseRosterCsv(csv);
		expect(parsed.ok).toBe(true);
		if (!parsed.ok) {
			throw new Error("unreachable");
		}

		const existingRoster: Player[] = [EXISTING_PLAYER];
		const updatedRoster = applyRosterImport(existingRoster, parsed, {
			ids: parsed.rows.map((_, index) => `imported-${index}`),
			now: "2026-01-01T00:00:00.000Z",
		});

		expect(updatedRoster).toEqual(existingRoster);
	});

	it("匯入採附加模式，既有參賽者不被覆蓋且順序在前", () => {
		const csv = [
			HEADER_LINE,
			"甲,male,5.0,,",
			"乙,female,4.0,,",
			"丙,other,6.0,,",
		].join("\r\n");
		const parsed = parseRosterCsv(csv);
		expect(parsed.ok).toBe(true);
		if (!parsed.ok) {
			throw new Error("unreachable");
		}

		const secondExistingPlayer: Player = { ...EXISTING_PLAYER, id: "existing-2", name: "既有球員二" };
		const existingRoster: Player[] = [EXISTING_PLAYER, secondExistingPlayer];
		const updatedRoster = applyRosterImport(existingRoster, parsed, {
			ids: ["imported-1", "imported-2", "imported-3"],
			now: "2026-01-01T00:00:00.000Z",
		});

		expect(updatedRoster).toHaveLength(5);
		expect(updatedRoster[0]).toEqual(EXISTING_PLAYER);
		expect(updatedRoster[1]).toEqual(secondExistingPlayer);
		expect(updatedRoster.slice(2).map((player) => player.name)).toEqual(["甲", "乙", "丙"]);
	});

	it("同名參賽者各自獨立建立，不靜默合併", () => {
		const csv = [HEADER_LINE, "王小明,male,5.5,,"].join("\r\n");
		const parsed = parseRosterCsv(csv);
		expect(parsed.ok).toBe(true);
		if (!parsed.ok) {
			throw new Error("unreachable");
		}

		const existingRoster: Player[] = [{ ...EXISTING_PLAYER, id: "existing-1", name: "王小明" }];
		const updatedRoster = applyRosterImport(existingRoster, parsed, {
			ids: ["imported-1"],
			now: "2026-01-01T00:00:00.000Z",
		});

		const wangs = updatedRoster.filter((player) => player.name === "王小明");
		expect(wangs).toHaveLength(2);
		expect(wangs[0].id).not.toBe(wangs[1].id);
	});

	it("同一次匯入未提供顏色的多列取得互不相同的預設漸層", () => {
		const csv = [HEADER_LINE, "甲,male,5.0,,", "乙,female,5.0,,", "丙,other,5.0,,"].join("\r\n");
		const parsed = parseRosterCsv(csv);
		expect(parsed.ok).toBe(true);
		if (!parsed.ok) {
			throw new Error("unreachable");
		}

		const updatedRoster = applyRosterImport([], parsed, {
			ids: ["imported-1", "imported-2", "imported-3"],
			now: "2026-01-01T00:00:00.000Z",
		});

		const gradientKeys = updatedRoster.map((player) => `${player.colorFrom}/${player.colorTo}`);
		expect(new Set(gradientKeys).size).toBe(gradientKeys.length);
	});
});
