// components/matchmaker/local-import-view.ts
// 「匯入本機資料到雲端」與「雲端 JSON 匯入」共用的畫面文案與結果轉換。
// 兩個入口的結果文案必須逐字相同（data-transfer delta spec），集中在這一處才不會各寫一份而漂移；
// 比照 TRANSFER_MESSAGES／REMOTE_TRANSFER_MESSAGES 以具名常數管理。
import type { LocalImportOutcome, LocalImportSummary } from "@/lib/sync/local-import";
import { REMOTE_TRANSFER_MESSAGES } from "@/lib/matchmaker/remote-transfer";
import { MATCHMAKER_ROUTE } from "@/lib/matchmaker/section-nav";

export const LOCAL_IMPORT_MESSAGES = {
	empty: "本機沒有可匯入的資料",
	oversize: "本機資料量超過單次匯入上限，請先匯出 JSON 備份後聯絡管理者",
	hint: "只有在雲端沒有任何對戰分配機資料時才能匯入；匯入後本機資料會保留",
	cloudNotEmpty: "雲端已有對戰分配機資料，無法匯入。若要以本機資料取代，請先在參賽者頁重置名單。",
	failed: "匯入失敗，請稍後再試",
	scoreboardSkipped: "雲端已有進行中的獨立計分板，未匯入該場",
	// 雲端 JSON 匯入的說明：與本機覆寫式還原的差異（拒絕規則、不寫入本機）要在選檔前讓使用者看到
	jsonCloudImportHint:
		"登入時選擇的備份檔會匯入到雲端，只有雲端沒有任何對戰分配機資料時才會寫入；不會覆寫或合併雲端資料，也不會寫入本機",
} as const;

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
	const base =
		`本機資料：${summary.players} 位參賽者、${summary.history} 筆歷史、` +
		`${summary.round ? 1 : 0} 個回合、${summary.slots} 個場次計分板、` +
		`${summary.scoreboardCurrent ? 1 : 0} 場獨立計分板`;
	if (summary.duplicateHistorySkipped > 0) {
		return `${base}（另有 ${summary.duplicateHistorySkipped} 筆重複歷史將略過）`;
	}
	return base;
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
	return { tone: "error", text: LOCAL_IMPORT_MESSAGES.failed };
}
