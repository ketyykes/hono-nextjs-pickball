import type { SessionSnapshot } from "@/lib/auth/session-store";

/** pending：儲存模式未定，使用端不得交出本機資料也不得啟用雲端。 */
export type StorageMode = "local" | "remote" | "pending";

/**
 * 前端「存本機還是存雲端」的唯一判斷。
 * session 載入中且無上次登入提示、也已 hydration 時視為本機，
 * 訪客在 hydration 之後的時序才不會因等待 /api/session 而改變。
 * 載入中但帶提示（可能是已登入者，含無法確認）或尚未 hydration（伺服器端無從得知提示）則為 pending。
 * 本機備援（使用者在無法確認時選擇先用這台裝置的資料）一律為本機，且判斷在最前面。
 * hydrated 未提供時視同 true。
 */
export function resolveStorageMode(
	snapshot: SessionSnapshot & { readonly hydrated?: boolean },
): StorageMode {
	if (snapshot.status === "loading") {
		if (snapshot.localFallback === true) return "local";
		if (snapshot.signedInHint === true) return "pending";
		if (snapshot.hydrated === false) return "pending";
		return "local";
	}
	if (!snapshot.authEnabled) return "local";
	if (snapshot.user === null) return "local";
	return "remote";
}

/**
 * 儲存模式為 pending 時要呈現的顯示狀態：無法確認登入狀態時為 unavailable（需顯示失敗提示與按鈕），
 * 其餘為 pending。使用端只問這裡，不自行讀快照的 unavailable 欄位。
 */
export function pendingDataStatus(
	snapshot: SessionSnapshot,
): "pending" | "unavailable" {
	if (snapshot.status === "loading" && snapshot.unavailable === true) {
		return "unavailable";
	}
	return "pending";
}
