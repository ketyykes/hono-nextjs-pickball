// 雲端 hook 對外回報的同步狀態與固定文案；文案是 E2E 與使用者的共同契約，不可隨意改字。

export type SyncStatus =
	| "local"
	| "loading"
	| "synced"
	| "saving"
	| "retrying"
	| "conflict"
	| "load-failed"
	| "rejected";

/**
 * 畫面上的資料狀態：SyncStatus 加上 pending（資料來源尚未確定：儲存模式未定，或本機資料尚未讀入）。
 * 此處的 pending 只描述顯示狀態，與儲存模式、計分板綁定狀態的 pending 型別各自獨立。
 */
export type DataStatus = SyncStatus | "pending";

/** 等待中的文案：不指涉本機或雲端，因為伺服器輸出對訪客與登入者相同。 */
export const DATA_PENDING_MESSAGE = "正在載入資料…";

/** 只有需要使用者注意的狀態才有文案；null 表示不顯示提示。 */
const MESSAGES: Record<SyncStatus, string | null> = {
	local: null,
	synced: null,
	saving: null,
	loading: "正在載入雲端資料…",
	retrying: "尚未儲存到雲端，將自動重試",
	conflict: "資料已在其他裝置更新，已重新載入最新資料",
	"load-failed": "無法載入雲端資料，請重新整理頁面",
	rejected: "雲端拒絕儲存，請重新整理頁面",
};

export function syncStatusMessage(status: SyncStatus): string | null {
	return MESSAGES[status];
}

/** pending、loading、load-failed 時沒有可信的資料，頁面以提示取代主要內容。 */
export function isContentBlocked(status: DataStatus): boolean {
	return status === "pending" || status === "loading" || status === "load-failed";
}

/** 本機模式的顯示狀態：本機資料讀入前為 pending，讀入後為 local。 */
export function localDataStatus(hydrated: boolean): DataStatus {
	if (!hydrated) {
		return "pending";
	}
	return "local";
}
