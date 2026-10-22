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
