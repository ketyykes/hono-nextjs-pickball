import type { Player } from "@pickball/core/matchmaker/types";
import { fetchRemoteRound } from "../sync/round-api";
import { fetchRemotePlayers, importRemotePlayers } from "../sync/roster-api";
import type { BackupSnapshot } from "./backup";
import { applyRosterImport } from "./roster-csv";
import type { ApplyRosterImportContext, ParseRosterCsvResult } from "./roster-csv";
import { readSnapshot } from "./transfer-storage";

/** 雲端分支的繁體中文訊息；風格比照 TRANSFER_MESSAGES：什麼失敗、資料有沒有動、建議怎麼做。 */
export const REMOTE_TRANSFER_MESSAGES = {
	fetchFailed: "無法取得雲端的參賽者名單，本次沒有匯入任何資料。請確認網路連線後再試一次。",
	// 不斷言「沒有變動」：failed 也涵蓋後端已寫入、但回應在網路上遺失的情況。
	importFailed: "雲端匯入失敗，請重新整理頁面確認名單後再試一次。",
	importConflict: "雲端名單已在其他裝置變更，本次沒有匯入任何資料。請重新整理頁面確認最新名單後再匯入。",
	unauthorized: "登入狀態已失效，本次沒有匯入或匯出任何資料。請重新登入後再試一次。",
	previewHasErrors: "預覽仍有錯誤的資料列，本次沒有匯入任何資料。請先修正 CSV 後重新選檔。",
	backupFetchFailed: "無法取得雲端的參賽者名單，未產生備份檔。請確認網路連線後再試一次。",
} as const;

/**
 * 失敗結果。unauthorized 為 true 代表 401（含帳號不符）：呼叫端據此刷新 session，
 * 不得靠比對訊息字串判斷。
 */
export interface RemoteTransferFailure {
	readonly ok: false;
	readonly message: string;
	readonly unauthorized?: true;
}

export type RemoteImportResult = { readonly ok: true } | RemoteTransferFailure;

export type RemoteBackupSnapshotResult =
	| { readonly ok: true; readonly snapshot: BackupSnapshot }
	| RemoteTransferFailure;

// 以不可列舉屬性標示未授權：結果的列舉形狀（ok、message）維持原樣，
// 既有以整個結果物件做比對或序列化的呼叫端不受影響，讀取 result.unauthorized 仍為 true。
function unauthorizedFailure(): RemoteTransferFailure {
	const failure: { ok: false; message: string } = {
		ok: false,
		message: REMOTE_TRANSFER_MESSAGES.unauthorized,
	};
	return Object.defineProperty(failure, "unauthorized", { value: true, enumerable: false }) as RemoteTransferFailure;
}

/**
 * 雲端 CSV 匯入：以雲端現有名單計算附加結果，只把新增的參賽者一次 POST 出去。
 * 整份原子性由後端 batch 保證，所以不逐筆 PUT；ids／now 由呼叫端注入，與本機分支一致。
 */
export async function importRemoteRoster(
	expectedUserId: string,
	preview: Extract<ParseRosterCsvResult, { ok: true }>,
	context: ApplyRosterImportContext,
): Promise<RemoteImportResult> {
	// 有錯誤列時 applyRosterImport 會原樣回傳名單，新增段為空，送出只會被後端 min(1) 拒絕；
	// 直接在前端擋下，錯誤訊息比後端的驗證失敗更好讀。
	if (preview.errors.length > 0) {
		return { ok: false, message: REMOTE_TRANSFER_MESSAGES.previewHasErrors };
	}

	const existing = await fetchRemotePlayers(expectedUserId);
	if (existing.kind === "unauthorized") return unauthorizedFailure();
	if (existing.kind !== "ok" || existing.value === undefined) {
		return { ok: false, message: REMOTE_TRANSFER_MESSAGES.fetchFailed };
	}

	const cloudPlayers: Player[] = existing.value.items.map((item) => item.data);
	const appended = applyRosterImport(cloudPlayers, preview, context).slice(cloudPlayers.length);

	// 沒有可新增的列（例如只有標題列的 CSV）時不送出：後端 min(1) 會拒絕空陣列，
	// 使用者重試也永遠失敗；本機分支遇到同一份檔案是無害的成功，這裡保持一致。
	if (appended.length === 0) return { ok: true };

	const imported = await importRemotePlayers(expectedUserId, appended);
	if (imported.kind === "ok") return { ok: true };
	if (imported.kind === "unauthorized") return unauthorizedFailure();
	if (imported.kind === "conflict") return { ok: false, message: REMOTE_TRANSFER_MESSAGES.importConflict };
	return { ok: false, message: REMOTE_TRANSFER_MESSAGES.importFailed };
}

/**
 * 雲端備份快照：參賽者與回合取自雲端，歷史仍取自本機（歷史尚未上雲）。
 * 任一雲端讀取失敗時不回傳快照，避免使用者下載到缺名單或缺回合的備份而誤以為完整。
 */
export async function buildRemoteBackupSnapshot(expectedUserId: string): Promise<RemoteBackupSnapshotResult> {
	const [players, round] = await Promise.all([
		fetchRemotePlayers(expectedUserId),
		fetchRemoteRound(expectedUserId),
	]);
	if (players.kind === "unauthorized" || round.kind === "unauthorized") {
		return unauthorizedFailure();
	}
	// 204 沒有內容（value 為 undefined）不該出現，當失敗；雲端尚無回合時 data 為 null，那是合法的空值。
	if (players.kind !== "ok" || players.value === undefined || round.kind !== "ok" || round.value === undefined) {
		return { ok: false, message: REMOTE_TRANSFER_MESSAGES.backupFetchFailed };
	}

	return {
		ok: true,
		snapshot: {
			players: players.value.items.map((item) => item.data),
			currentRound: round.value.data,
			history: readSnapshot().history,
		},
	};
}
