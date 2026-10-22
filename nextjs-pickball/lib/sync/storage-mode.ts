import type { SessionSnapshot } from "@/lib/auth/session-store";

export type StorageMode = "local" | "remote";

/**
 * 前端「存本機還是存雲端」的唯一判斷。
 * session 載入中一律視為本機，訪客的首屏時序才不會因等待 /api/session 而改變。
 */
export function resolveStorageMode(snapshot: SessionSnapshot): StorageMode {
	if (snapshot.status !== "ready") return "local";
	if (!snapshot.authEnabled) return "local";
	if (snapshot.user === null) return "local";
	return "remote";
}
