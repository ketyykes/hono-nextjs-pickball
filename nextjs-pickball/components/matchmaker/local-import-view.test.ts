// components/matchmaker/local-import-view.test.ts
import { describe, it, expect } from "vitest";
import type { LocalImportSummary } from "@/lib/sync/local-import";
import { REMOTE_TRANSFER_MESSAGES } from "@/lib/matchmaker/remote-transfer";
import { LOCAL_IMPORT_MESSAGES, describeImportOutcome, describeLocalSummary } from "./local-import-view";

// regression guard：以下斷言寫入當下即綠（行為在 5.2 已存在），目的是補上 Stage 2 mutation 發現的鑑別力缺口。
// 各欄位值刻意互不相同，欄位被換成別的欄位或常數時整句字串才會不同。

function buildSummary(overrides: Partial<LocalImportSummary> = {}): LocalImportSummary {
	return {
		players: 5,
		round: true,
		slots: 2,
		history: 7,
		scoreboardCurrent: false,
		duplicateHistorySkipped: 0,
		...overrides,
	};
}

describe("describeLocalSummary", () => {
	it("各欄位的筆數與有無各自對應到整句文案中的位置", () => {
		expect(describeLocalSummary(buildSummary())).toBe(
			"本機資料：5 位參賽者、7 筆歷史、1 個回合、2 個場次計分板、0 場獨立計分板",
		);
	});

	it("沒有回合但有獨立計分板時回合為 0、獨立計分板為 1", () => {
		expect(describeLocalSummary(buildSummary({ round: false, scoreboardCurrent: true }))).toBe(
			"本機資料：5 位參賽者、7 筆歷史、0 個回合、2 個場次計分板、1 場獨立計分板",
		);
	});

	it("回合與獨立計分板皆有時兩者皆為 1，皆無時兩者皆為 0", () => {
		expect(describeLocalSummary(buildSummary({ round: true, scoreboardCurrent: true }))).toBe(
			"本機資料：5 位參賽者、7 筆歷史、1 個回合、2 個場次計分板、1 場獨立計分板",
		);
		expect(describeLocalSummary(buildSummary({ round: false, scoreboardCurrent: false }))).toBe(
			"本機資料：5 位參賽者、7 筆歷史、0 個回合、2 個場次計分板、0 場獨立計分板",
		);
	});
});

describe("describeImportOutcome", () => {
	it("匯入成功時列出各段筆數，並依獨立計分板的結果決定是否附加補充說明", () => {
		const imported = { players: 5, round: true, slots: 2, history: 7 } as const;

		expect(describeImportOutcome({ kind: "imported", imported: { ...imported, scoreboardCurrent: "imported" } })).toEqual({
			tone: "success",
			text: "已匯入 5 位參賽者、7 筆歷史、1 個回合、2 個場次計分板、1 場獨立計分板。",
		});
		expect(describeImportOutcome({ kind: "imported", imported: { ...imported, scoreboardCurrent: "none" } })).toEqual({
			tone: "success",
			text: "已匯入 5 位參賽者、7 筆歷史、1 個回合、2 個場次計分板。",
		});
		expect(
			describeImportOutcome({
				kind: "imported",
				imported: { ...imported, round: false, scoreboardCurrent: "skipped" },
			}),
		).toEqual({
			tone: "success",
			text: "已匯入 5 位參賽者、7 筆歷史、0 個回合、2 個場次計分板。",
			note: LOCAL_IMPORT_MESSAGES.scoreboardSkipped,
		});
	});

	it("雲端已有資料、未授權與失敗各自對應到不同的錯誤文案", () => {
		expect(describeImportOutcome({ kind: "cloud-not-empty" })).toEqual({
			tone: "error",
			text: LOCAL_IMPORT_MESSAGES.cloudNotEmpty,
		});
		expect(describeImportOutcome({ kind: "unauthorized" })).toEqual({
			tone: "error",
			text: REMOTE_TRANSFER_MESSAGES.unauthorized,
		});
		expect(describeImportOutcome({ kind: "failed" })).toEqual({
			tone: "error",
			text: LOCAL_IMPORT_MESSAGES.failed,
		});
	});
});
