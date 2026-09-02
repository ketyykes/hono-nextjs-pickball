import { describe, it, expect } from "vitest";
import { toCsv } from "./csv";

describe("csv", () => {
	it("CSV 文字以 UTF-8 BOM 開頭", () => {
		const rows = [
			["日期", "時間"],
			["2026-09-02", "19:00"],
		];

		const csvText = toCsv(rows);

		expect(csvText.charAt(0)).toBe("﻿");
	});
});
