import type { Player } from "@pickball/core/matchmaker/types";
import { fetchRemotePlayers, importRemotePlayers } from "../sync/roster-api";
import type { BackupSnapshot } from "./backup";
import { applyRosterImport } from "./roster-csv";
import type { ApplyRosterImportContext, ParseRosterCsvResult } from "./roster-csv";
import { readSnapshot } from "./transfer-storage";

/** 雲端分支的繁體中文訊息；風格比照 TRANSFER_MESSAGES：什麼失敗、資料有沒有動、建議怎麼做。 */
export const REMOTE_TRANSFER_MESSAGES = {
	fetchFailed: "無法取得雲端的參賽者名單，本次沒有匯入任何資料。請確認網路連線後再試一次。",
	importFailed: "雲端匯入失敗，雲端名單沒有任何變動。請稍後再試一次。",
	importConflict: "雲端名單已在其他裝置變更，本次沒有匯入任何資料。請重新整理頁面確認最新名單後再匯入。",
	unauthorized: "登入狀態已失效，本次沒有匯入或匯出任何資料。請重新登入後再試一次。",
	previewHasErrors: "預覽仍有錯誤的資料列，本次沒有匯入任何資料。請先修正 CSV 後重新選檔。",
	backupFetchFailed: "無法取得雲端的參賽者名單，未產生備份檔。請確認網路連線後再試一次。",
} as const;

export type RemoteImportResult = { readonly ok: true } | { readonly ok: false; readonly message: string };

export type RemoteBackupSnapshotResult =
	| { readonly ok: true; readonly snapshot: BackupSnapshot }
	| { readonly ok: false; readonly message: string };

/**
 * 雲端 CSV 匯入：以雲端現有名單計算附加結果，只把新增的參賽者一次 POST 出去。
 * 整份原子性由後端 batch 保證，所以不逐筆 PUT；ids／now 由呼叫端注入，與本機分支一致。
 */
export async function importRemoteRoster(
	preview: Extract<ParseRosterCsvResult, { ok: true }>,
	context: ApplyRosterImportContext,
): Promise<RemoteImportResult> {
	// 有錯誤列時 applyRosterImport 會原樣回傳名單，新增段為空，送出只會被後端 min(1) 拒絕；
	// 直接在前端擋下，錯誤訊息比後端的驗證失敗更好讀。
	if (preview.errors.length > 0) {
		return { ok: false, message: REMOTE_TRANSFER_MESSAGES.previewHasErrors };
	}

	const existing = await fetchRemotePlayers();
	if (existing.kind === "unauthorized") return { ok: false, message: REMOTE_TRANSFER_MESSAGES.unauthorized };
	if (existing.kind !== "ok" || existing.value === undefined) {
		return { ok: false, message: REMOTE_TRANSFER_MESSAGES.fetchFailed };
	}

	const cloudPlayers: Player[] = existing.value.items.map((item) => item.data);
	const appended = applyRosterImport(cloudPlayers, preview, context).slice(cloudPlayers.length);

	const imported = await importRemotePlayers(appended);
	if (imported.kind === "ok") return { ok: true };
	if (imported.kind === "unauthorized") return { ok: false, message: REMOTE_TRANSFER_MESSAGES.unauthorized };
	if (imported.kind === "conflict") return { ok: false, message: REMOTE_TRANSFER_MESSAGES.importConflict };
	return { ok: false, message: REMOTE_TRANSFER_MESSAGES.importFailed };
}

/**
 * 雲端備份快照：參賽者取自雲端，回合與歷史仍取自本機（回合與歷史尚未上雲）。
 * 取名單失敗時不回傳快照，避免使用者下載到缺名單的備份而誤以為完整。
 */
export async function buildRemoteBackupSnapshot(): Promise<RemoteBackupSnapshotResult> {
	const existing = await fetchRemotePlayers();
	if (existing.kind === "unauthorized") return { ok: false, message: REMOTE_TRANSFER_MESSAGES.unauthorized };
	if (existing.kind !== "ok" || existing.value === undefined) {
		return { ok: false, message: REMOTE_TRANSFER_MESSAGES.backupFetchFailed };
	}

	const local = readSnapshot();
	return {
		ok: true,
		snapshot: {
			players: existing.value.items.map((item) => item.data),
			currentRound: local.currentRound,
			history: local.history,
		},
	};
}
