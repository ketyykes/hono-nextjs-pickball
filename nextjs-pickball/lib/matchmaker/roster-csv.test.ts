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
});
