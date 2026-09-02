import { describe, it, expect } from "vitest";
import { jpgExportFileName } from "./export-filename";

describe("jpgExportFileName", () => {
	it("JPG 檔名依回合編號與注入日期組成", () => {
		expect(
			jpgExportFileName({ roundNumber: 3, exportedAt: "2026-08-23T01:02:03.000Z" }),
		).toBe("matchmaker-round-3-2026-08-23.jpg");
	});

	// 以下為補充測試（非 spec 錨點），用來把 §8 列出的各種 mutant 逐一釘死。

	it("不同 roundNumber 得到不同檔名，且回合編號原樣出現而未被補零或改寫", () => {
		expect(
			jpgExportFileName({ roundNumber: 1, exportedAt: "2026-08-23T01:02:03.000Z" }),
		).toBe("matchmaker-round-1-2026-08-23.jpg");
		expect(
			jpgExportFileName({ roundNumber: 12, exportedAt: "2026-08-23T01:02:03.000Z" }),
		).toBe("matchmaker-round-12-2026-08-23.jpg");
	});

	it("同一天不同時刻得到相同日期段，證明時間部分確實被截掉", () => {
		const early = jpgExportFileName({ roundNumber: 3, exportedAt: "2026-08-23T00:00:00.000Z" });
		const late = jpgExportFileName({ roundNumber: 3, exportedAt: "2026-08-23T23:59:59.999Z" });
		expect(early).toBe("matchmaker-round-3-2026-08-23.jpg");
		expect(late).toBe("matchmaker-round-3-2026-08-23.jpg");
	});

	it("跨日的兩個時間戳得到不同日期段", () => {
		const day1 = jpgExportFileName({ roundNumber: 3, exportedAt: "2026-08-23T23:59:59.999Z" });
		const day2 = jpgExportFileName({ roundNumber: 3, exportedAt: "2026-08-24T00:00:00.000Z" });
		expect(day1).not.toBe(day2);
	});

	it("檔名整體符合 matchmaker-round-<回合編號>-<YYYY-MM-DD>.jpg 的格式", () => {
		const fileName = jpgExportFileName({ roundNumber: 7, exportedAt: "2026-08-23T01:02:03.000Z" });
		expect(fileName).toMatch(/^matchmaker-round-\d+-\d{4}-\d{2}-\d{2}\.jpg$/);
	});

	it("UTC 語意：台灣當地時間已跨日，仍以 UTC 日期為準（design Decision 6 的已知取捨）", () => {
		// 2026-08-23T23:00:00.000Z 換算台灣時間（UTC+8）為 2026-08-24 07:00，
		// 但本函式刻意只取 ISO 前 10 碼（UTC 日期），故仍回傳 2026-08-23。
		expect(
			jpgExportFileName({ roundNumber: 3, exportedAt: "2026-08-23T23:00:00.000Z" }),
		).toBe("matchmaker-round-3-2026-08-23.jpg");
	});
});
