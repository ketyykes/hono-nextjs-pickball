// components/matchmaker/local-import-view.test.ts
import { describe, it, expect } from "vitest";
import type { LocalImportSummary } from "@/lib/sync/local-import";
import { REMOTE_TRANSFER_MESSAGES } from "@/lib/matchmaker/remote-transfer";
import {
	APPEND_ACTION_LABEL,
	APPEND_CANCEL_LABEL,
	APPEND_NAME_CHECK_HINT,
	APPEND_RULES,
	LOCAL_IMPORT_MESSAGES,
	describeAppendMatchedPlayers,
	describeAppendNewPlayers,
	describeAppendOutcome,
	describeAppendPreview,
	describeImportOutcome,
	describeLocalSummary,
} from "./local-import-view";

// regression guard：以下斷言寫入當下即綠（行為已存在），目的是補上 mutation 發現的鑑別力缺口。
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

	it("資料過大的匯入結果對應到超過上限的錯誤文案", () => {
		expect(describeImportOutcome({ kind: "too-large" })).toEqual({
			tone: "error",
			text: LOCAL_IMPORT_MESSAGES.tooLarge,
		});
		// 固定文案：使用者看到的是這一句，不只是與常數相等
		expect(LOCAL_IMPORT_MESSAGES.tooLarge).toBe(
			"資料量超過單次匯入上限，本次沒有匯入任何資料。請聯絡管理者協助匯入。",
		);
		// 與其他錯誤文案不同，使用者才看得出是資料量問題
		expect(LOCAL_IMPORT_MESSAGES.tooLarge).not.toBe(LOCAL_IMPORT_MESSAGES.failed);
		expect(LOCAL_IMPORT_MESSAGES.tooLarge).not.toBe(LOCAL_IMPORT_MESSAGES.cloudNotEmpty);
		expect(LOCAL_IMPORT_MESSAGES.tooLarge).not.toBe(REMOTE_TRANSFER_MESSAGES.unauthorized);
	});
});

describe("附加到雲端的文案", () => {
	it("附加結果依略過筆數組成新增與略過的文案", () => {
		const counts = (playersSkipped: number, historySkipped: number) => ({
			kind: "appended" as const,
			appended: {
				players: { added: 3, skipped: playersSkipped },
				history: { added: 4, skipped: historySkipped },
			},
		});

		expect(describeAppendOutcome(counts(2, 1))).toEqual({
			tone: "success",
			text: "已新增 3 位參賽者、4 筆歷史。",
			note: "略過同名或已在雲端的參賽者 2 位、略過已在雲端的歷史 1 筆。",
		});
		expect(describeAppendOutcome(counts(2, 0))).toEqual({
			tone: "success",
			text: "已新增 3 位參賽者、4 筆歷史。",
			note: "略過同名或已在雲端的參賽者 2 位。",
		});
		expect(describeAppendOutcome(counts(0, 1))).toEqual({
			tone: "success",
			text: "已新增 3 位參賽者、4 筆歷史。",
			note: "略過已在雲端的歷史 1 筆。",
		});
		const noSkip = describeAppendOutcome(counts(0, 0));
		expect(noSkip.text).toBe("已新增 3 位參賽者、4 筆歷史。");
		expect(noSkip.note).toBeUndefined();

		expect(describeAppendOutcome({ kind: "unauthorized" })).toEqual({
			tone: "error",
			text: REMOTE_TRANSFER_MESSAGES.unauthorized,
		});
		expect(describeAppendOutcome({ kind: "too-large" })).toEqual({
			tone: "error",
			text: LOCAL_IMPORT_MESSAGES.tooLarge,
		});
		expect(describeAppendOutcome({ kind: "failed" })).toEqual({
			tone: "error",
			text: LOCAL_IMPORT_MESSAGES.failed,
		});
	});

	it("附加確認的說明、預覽名單標題與提醒、四條說明與按鈕文字為固定值", () => {
		expect(describeAppendPreview(2, 1)).toBe("雲端已有對戰分配機資料。可以把這份備份的 2 位參賽者、1 筆歷史附加到雲端：");
		expect(describeAppendNewPlayers(3)).toBe("會新增到雲端的參賽者（3 位）：");
		expect(describeAppendMatchedPlayers(2)).toBe("已在雲端、會視為同一人而不新增的參賽者（2 位）：");
		expect(APPEND_NAME_CHECK_HINT).toBe(
			"名字要完全相同才算同一人。若會新增的名單中有其實已在雲端、只是名字寫法不同的參賽者，請先取消，在本機把名字改成與雲端相同後重新匯出備份，再匯入一次；目前無法在雲端合併重複的參賽者。",
		);
		expect(APPEND_RULES).toEqual([
			"與雲端名稱完全相同或已在雲端的參賽者視為同一人，不會重複新增，也不會覆寫雲端的資料；附加的歷史會算在雲端那位參賽者身上；名稱前後的空白不計，大小寫、全形半形或中間的空白不同都視為不同人",
			"雲端已有的同一場歷史不會重複新增",
			"備份中尚未完成的回合不會帶過去；請先在本機結束回合再匯出備份",
			"雲端參賽者的強度分數維持不變，附加的歷史不會反映在分數上，需要時請在參賽者頁手動調整",
		]);
		expect(APPEND_ACTION_LABEL).toBe("附加到雲端");
		expect(APPEND_CANCEL_LABEL).toBe("取消");
		expect(LOCAL_IMPORT_MESSAGES.appendNothing).toBe(
			"雲端已有對戰分配機資料，這份備份沒有可附加的參賽者或歷史，未匯入任何資料。",
		);
		expect(LOCAL_IMPORT_MESSAGES.appendNoNewPlayers).toBe("沒有會新增到雲端的參賽者。");
		expect(LOCAL_IMPORT_MESSAGES.appendPreviewFailed).toBe(
			"無法取得雲端的參賽者名單，未匯入任何資料。請確認網路連線後再試一次。",
		);
		expect(LOCAL_IMPORT_MESSAGES.jsonCloudImportHint).toBe(
			"登入時選擇的備份檔會匯入到雲端，不會寫入本機；雲端已有對戰分配機資料時，可確認後把備份中的參賽者與歷史附加到雲端，不會覆寫雲端既有的資料",
		);
		expect(LOCAL_IMPORT_MESSAGES.cloudNotEmpty).toBe(
			"雲端已有對戰分配機資料，無法匯入。若要以本機資料取代，請先在參賽者頁重置名單。",
		);
	});
});
