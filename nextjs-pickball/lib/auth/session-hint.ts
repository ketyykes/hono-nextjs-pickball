// 「瀏覽器上次確認為已登入」的提示，只存固定值，不含任何使用者資訊。
// 三個函式絕不 throw：SSR、私密模式或配額滿時，讀取回 false、寫入與清除靜默略過。
import { hasLocalStorage } from "@/lib/matchmaker/storage-keys";

export const SIGNED_IN_HINT_STORAGE_KEY = "auth:signed-in-hint:v1";

const HINT_VALUE = "1";

export function readSignedInHint(): boolean {
	if (!hasLocalStorage()) return false;
	try {
		return localStorage.getItem(SIGNED_IN_HINT_STORAGE_KEY) === HINT_VALUE;
	} catch {
		return false;
	}
}

export function writeSignedInHint(): void {
	if (!hasLocalStorage()) return;
	try {
		localStorage.setItem(SIGNED_IN_HINT_STORAGE_KEY, HINT_VALUE);
	} catch {
		// 靜默忽略：提示只是體驗優化，寫不進去不影響功能
	}
}

export function clearSignedInHint(): void {
	if (!hasLocalStorage()) return;
	try {
		localStorage.removeItem(SIGNED_IN_HINT_STORAGE_KEY);
	} catch {
		// 靜默忽略，理由同 writeSignedInHint
	}
}
