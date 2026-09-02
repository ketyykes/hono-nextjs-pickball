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
});
