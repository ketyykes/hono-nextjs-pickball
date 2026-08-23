/**
 * matchmaker 三個 LocalStorage key 與 hasLocalStorage() 的單一來源（design Decision 8）。
 *
 * 獨立成檔而非放在 storage.ts：round-storage.ts 需要這三個 key 與 hasLocalStorage()，
 * 而 storage.ts 的 RESET_KEYS 也需要全部三個 key。若 key 名稱寫在 round-storage.ts、
 * 清單留在 storage.ts，會出現 storage.ts → round-storage.ts 的匯入；round-storage.ts
 * 又需要 storage.ts 的 hasLocalStorage()，形成循環匯入。抽出這個無專案內部相依的
 * 葉節點模組後，storage.ts 與 round-storage.ts 改為單向依賴 storage-keys.ts，不再互相匯入。
 */

export const ROSTER_STORAGE_KEY = "matchmaker:roster:v1";
export const ROUND_STORAGE_KEY = "matchmaker:round:v1";
export const HISTORY_STORAGE_KEY = "matchmaker:history:v1";

/** 確認 localStorage 可用（SSR / 私密模式下可能不存在）。由 storage.ts 原樣搬移，行為不變。 */
export function hasLocalStorage(): boolean {
	try {
		return typeof window !== "undefined" && !!window.localStorage;
	} catch {
		return false;
	}
}
