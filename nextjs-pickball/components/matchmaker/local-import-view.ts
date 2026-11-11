// components/matchmaker/local-import-view.ts
// 「匯入本機資料到雲端」與「雲端 JSON 匯入」共用的畫面文案與結果轉換。
// 兩個入口的結果文案必須逐字相同（data-transfer delta spec），集中在這一處才不會各寫一份而漂移；
// 比照 TRANSFER_MESSAGES／REMOTE_TRANSFER_MESSAGES 以具名常數管理。
import type { AppendImportOutcome, LocalImportOutcome, LocalImportSummary } from "@/lib/sync/local-import";
import { REMOTE_TRANSFER_MESSAGES } from "@/lib/matchmaker/remote-transfer";
import { MATCHMAKER_ROUTE } from "@/lib/matchmaker/section-nav";

export const LOCAL_IMPORT_MESSAGES = {
	empty: "本機沒有可匯入的資料",
	oversize: "本機資料量超過單次匯入上限，請先匯出 JSON 備份後聯絡管理者",
	hint: "只有在雲端沒有任何對戰分配機資料時才能匯入；匯入後本機資料會保留",
	cloudNotEmpty: "雲端已有對戰分配機資料，無法匯入。若要以本機資料取代，請先在參賽者頁重置名單。",
	failed: "匯入失敗，請稍後再試",
	tooLarge: "資料量超過單次匯入上限，本次沒有匯入任何資料。請聯絡管理者協助匯入。",
	scoreboardSkipped: "雲端已有進行中的獨立計分板，未匯入該場",
	// 雲端 JSON 匯入的說明：與本機覆寫式還原的差異（不寫入本機、已有資料時改為附加）要在選檔前讓使用者看到
	jsonCloudImportHint:
		"登入時選擇的備份檔會匯入到雲端，不會寫入本機；雲端已有對戰分配機資料時，可確認後把備份中的參賽者與歷史附加到雲端，不會覆寫雲端既有的資料",
	appendNothing: "雲端已有對戰分配機資料，這份備份沒有可附加的參賽者或歷史，未匯入任何資料。",
	appendNoNewPlayers: "沒有會新增到雲端的參賽者。",
	appendPreviewFailed: "無法取得雲端的參賽者名單，未匯入任何資料。請確認網路連線後再試一次。",
} as const;

export const APPEND_ACTION_LABEL = "附加到雲端";
export const APPEND_CANCEL_LABEL = "取消";
export const APPEND_NAME_CHECK_HINT =
	"名字要完全相同才算同一人。若會新增的名單中有其實已在雲端、只是名字寫法不同的參賽者，請先取消，在本機把名字改成與雲端相同後重新匯出備份，再匯入一次；目前無法在雲端合併重複的參賽者。";
export const APPEND_RULES: readonly string[] = [
	"與雲端名稱完全相同或已在雲端的參賽者視為同一人，不會重複新增，也不會覆寫雲端的資料；附加的歷史會算在雲端那位參賽者身上；名稱前後的空白不計，大小寫、全形半形或中間的空白不同都視為不同人",
	"雲端已有的同一場歷史不會重複新增",
	"備份中尚未完成的回合不會帶過去；請先在本機結束回合再匯出備份",
	"雲端參賽者的強度分數維持不變，附加的歷史不會反映在分數上，需要時請在參賽者頁手動調整",
];

/** 資料頁匯入區塊的錨點；參賽者頁的提示連結以它定位。 */
export const LOCAL_IMPORT_ANCHOR_ID = "local-import";
export const LOCAL_IMPORT_HREF = `${MATCHMAKER_ROUTE}/data#${LOCAL_IMPORT_ANCHOR_ID}`;

export interface ImportResultView {
	readonly tone: "success" | "error";
	readonly text: string;
	/** 成功但有部分未匯入時的補充說明（例如雲端已有獨立計分板）。 */
	readonly note?: string;
}

/** 本機資料的筆數摘要，匯入前顯示給使用者確認。 */
export function describeLocalSummary(summary: LocalImportSummary): string {
	return (
		`本機資料：${summary.players} 位參賽者、${summary.history} 筆歷史、` +
		`${summary.round ? 1 : 0} 個回合、${summary.slots} 個場次計分板、` +
		`${summary.scoreboardCurrent ? 1 : 0} 場獨立計分板`
	);
}

/** 把匯入結果轉成畫面文案；是否刷新 session 由呼叫端依 outcome.kind 決定，這裡不碰。 */
export function describeImportOutcome(outcome: LocalImportOutcome): ImportResultView {
	if (outcome.kind === "imported") {
		const { players, round, slots, history, scoreboardCurrent } = outcome.imported;
		const importedCurrent = scoreboardCurrent === "imported" ? "、1 場獨立計分板" : "";
		const text =
			`已匯入 ${players} 位參賽者、${history} 筆歷史、` +
			`${round ? 1 : 0} 個回合、${slots} 個場次計分板${importedCurrent}。`;
		if (scoreboardCurrent === "skipped") {
			return { tone: "success", text, note: LOCAL_IMPORT_MESSAGES.scoreboardSkipped };
		}
		return { tone: "success", text };
	}
	if (outcome.kind === "cloud-not-empty") {
		return { tone: "error", text: LOCAL_IMPORT_MESSAGES.cloudNotEmpty };
	}
	if (outcome.kind === "unauthorized") {
		return { tone: "error", text: REMOTE_TRANSFER_MESSAGES.unauthorized };
	}
	if (outcome.kind === "too-large") {
		return { tone: "error", text: LOCAL_IMPORT_MESSAGES.tooLarge };
	}
	return { tone: "error", text: LOCAL_IMPORT_MESSAGES.failed };
}

/** 附加確認開頭：N、M 是備份的筆數（去重前），不是實際會新增的數量。 */
export function describeAppendPreview(players: number, history: number): string {
	return `雲端已有對戰分配機資料。可以把這份備份的 ${players} 位參賽者、${history} 筆歷史附加到雲端：`;
}

export function describeAppendNewPlayers(count: number): string {
	return `會新增到雲端的參賽者（${count} 位）：`;
}

export function describeAppendMatchedPlayers(count: number): string {
	return `已在雲端、會視為同一人而不新增的參賽者（${count} 位）：`;
}

/** 把附加結果轉成畫面文案；是否刷新 session 由呼叫端依 outcome.kind 決定。 */
export function describeAppendOutcome(outcome: AppendImportOutcome): ImportResultView {
	if (outcome.kind === "appended") {
		const { players, history } = outcome.appended;
		const text = `已新增 ${players.added} 位參賽者、${history.added} 筆歷史。`;
		const skippedParts: string[] = [];
		if (players.skipped > 0) {
			skippedParts.push(`略過同名或已在雲端的參賽者 ${players.skipped} 位`);
		}
		if (history.skipped > 0) {
			skippedParts.push(`略過已在雲端的歷史 ${history.skipped} 筆`);
		}
		if (skippedParts.length === 0) {
			return { tone: "success", text };
		}
		return { tone: "success", text, note: `${skippedParts.join("、")}。` };
	}
	if (outcome.kind === "unauthorized") {
		return { tone: "error", text: REMOTE_TRANSFER_MESSAGES.unauthorized };
	}
	if (outcome.kind === "too-large") {
		return { tone: "error", text: LOCAL_IMPORT_MESSAGES.tooLarge };
	}
	return { tone: "error", text: LOCAL_IMPORT_MESSAGES.failed };
}
