import { describe, it, expect } from "vitest";
import { toCsv, parseCsv } from "./csv";

describe("csv", () => {
	it("CSV 文字以 UTF-8 BOM 開頭", () => {
		const rows = [
			["日期", "時間"],
			["2026-09-02", "19:00"],
		];

		const csvText = toCsv(rows);

		expect(csvText.charAt(0)).toBe("﻿");
	});

	it("含逗號、雙引號或換行的欄位以 RFC 4180 規則跳脫並可原樣讀回", () => {
		const nameWithComma = "王小明, Jr.";
		const nameWithQuote = '他說"讚"';
		const nameWithNewline = "第一行\n第二行";
		const rows = [[nameWithComma, nameWithQuote, nameWithNewline]];

		const csvText = toCsv(rows);

		// 逗號、雙引號、換行皆須被雙引號包住；欄位內的雙引號成為兩個雙引號。
		expect(csvText).toContain('"王小明, Jr."');
		expect(csvText).toContain('"他說""讚"""');
		expect(csvText).toContain('"第一行\n第二行"');

		const parsed = parseCsv(csvText);

		expect(parsed[0]?.[0]).toBe(nameWithComma);
		expect(parsed[0]?.[1]).toBe(nameWithQuote);
		expect(parsed[0]?.[2]).toBe(nameWithNewline);
	});

	it("parseCsv 對檔尾換行不產生幻影空列，且保留檔案中間的空列", () => {
		// 使用者從 Google Sheets／Excel 另存的 CSV 檔案幾乎都以換行結尾，
		// 若無條件把「迴圈結束後累積的欄位」推成最後一列，會多吐出一列 [""]，
		// 讓下游（§5／§6）依列號回報的錯誤指向試算表上不存在的那一列。
		expect(parseCsv("a,b\nc,d\n")).toEqual([
			["a", "b"],
			["c", "d"],
		]);
		expect(parseCsv("a,b\r\n")).toEqual([["a", "b"]]);
		expect(parseCsv("\n")).toEqual([[""]]);
		// 檔案「中間」的空列語意不同，必須保留，不可被本次修正一併過濾掉。
		expect(parseCsv("a,b\n\nc,d")).toEqual([["a", "b"], [""], ["c", "d"]]);
	});

	// 以下為 regression guard：寫入當下即為綠燈（行為早已由既有實作涵蓋），
	// 補上是為了填補 Stage 2 mutation testing 找到的覆蓋缺口（parseCsv 的主流路徑、
	// 未閉合引號、單獨 CR、邊界輸入皆從未被真正餵過）。已用「改壞實作看紅、
	// 還原看綠」的方式驗證偵測力，見本次回報的存活 mutation 複驗表。

	it("無 BOM、LF 換行、未跳脫欄位的多列 CSV 可被完整解析（如 Google Sheets 匯出）", () => {
		// 既有兩條測試餵給 parseCsv 的輸入永遠帶 BOM、永遠只有一列、
		// 三個欄位又全部需要跳脫——「非引號欄位路徑」「多列解析」「無 BOM 輸入」
		// 從未被走過。這裡用完整陣列（toEqual）而非只挑 parsed[0][0] 釘住整段行為。
		const text = "姓名,分數\n王小明,7\n李四,8\n";

		expect(parseCsv(text)).toEqual([
			["姓名", "分數"],
			["王小明", "7"],
			["李四", "8"],
		]);
	});

	it("有 BOM、CRLF 換行、未跳脫欄位的多列 CSV 可被完整解析（如 Excel 匯出）", () => {
		const text = "﻿姓名,分數\r\n王小明,7\r\n李四,8\r\n";

		expect(parseCsv(text)).toEqual([
			["姓名", "分數"],
			["王小明", "7"],
			["李四", "8"],
		]);
	});

	it("toCsv 的完整輸出：BOM 開頭、CRLF 分隔列、不需跳脫的欄位不加引號、無尾端換行", () => {
		// 既有測試只用 toContain 驗片段，never 釘住「列與列之間用 \r\n」
		// 「不需跳脫的欄位不會被多餘加引號」「輸出結尾沒有多的換行」這三件事。
		const rows = [
			["姓名", "分數"],
			["王小明", "7"],
			["李四", "8"],
		];

		expect(toCsv(rows)).toBe("﻿姓名,分數\r\n王小明,7\r\n李四,8");
	});

	it("未閉合引號時採寬鬆解析：後續內容併入同一欄位，不拋錯（設計取捨，見 csv.ts 註解）", () => {
		// 一個誤打的引號會讓後續所有列被吞進同一欄位；本模組刻意不擴充回傳型別
		// 來回報這種情況（見 csv.ts parseCsv 的設計取捨註解），下游可用欄位數
		// 是否等於標題數偵測異常。此測試釘住「目前就是這樣」，避免日後有人
		// 無意間改動這個行為卻沒人發現。
		const text = '姓名,分數\n王"小明,7\n李四,8\n';

		expect(parseCsv(text)).toEqual([["姓名", "分數"], ['王小明,7\n李四,8\n']]);
	});

	it("欄位含未被引號跳脫保護以外的單獨 CR 時，經 toCsv 跳脫後可原樣讀回", () => {
		const nameWithCr = "a\rb";
		const rows = [[nameWithCr]];

		const parsed = parseCsv(toCsv(rows));

		expect(parsed[0]?.[0]).toBe(nameWithCr);
	});

	it("parseCsv 對空字串與只有 BOM 的字串皆回傳空陣列", () => {
		expect(parseCsv("")).toEqual([]);
		expect(parseCsv("﻿")).toEqual([]);
	});

	it("parseCsv 正確處理多欄位中的連續兩個引號跳脫", () => {
		// 既有 round-trip 測試的 fixture 只有單一欄位，"連續兩個引號還原為一個"
		// 這步（i += 1 跳過下一個引號）與「引號結束後接分隔符進入下一欄」
		// 兩件事的交互從未被獨立釘住。
		expect(parseCsv('"a""b",c')).toEqual([['a"b', "c"]]);
	});

	it("非引號欄位中出現的引號字元會被靜默移除（設計行為）", () => {
		// x"y"z 這種「引號不在欄位開頭」的畸形輸入，狀態機仍會把引號當成
		// 跳脫的起訖記號吃掉，只留下 xyz——不是本模組要支援的正規輸入，
		// 但既有行為得先被釘住，避免之後被無意間改掉又沒人發現。
		expect(parseCsv('x"y"z')).toEqual([["xyz"]]);
	});
});
