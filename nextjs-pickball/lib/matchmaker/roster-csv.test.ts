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
});
