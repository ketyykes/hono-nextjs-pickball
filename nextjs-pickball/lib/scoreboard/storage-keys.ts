/**
 * scoreboard 兩個 LocalStorage key 與 hasLocalStorage() 的單一來源。
 *
 * 獨立成檔而非放在 storage.ts：§3 讓 storage.ts 需要 import match-slots.ts
 * 的 writeMatchSlot（分派入口）。若 hasLocalStorage() 留在 storage.ts、
 * match-slots.ts 反過來 import 它，會形成 storage.ts → match-slots.ts →
 * storage.ts 的循環匯入。抽出這個無專案內部相依的葉節點模組後，storage.ts
 * 與 match-slots.ts 改為單向依賴 storage-keys.ts，不再互相匯入
 * （比照 lib/matchmaker/storage-keys.ts 的既有做法）。
 */

export const STORAGE_KEY = "scoreboard:current:v1";
export const MATCH_SLOTS_KEY = "scoreboard:matches:v1";

/** 確認 localStorage 可用（SSR / 私密模式下可能不存在）。由 storage.ts 原樣搬移，行為不變。 */
export function hasLocalStorage(): boolean {
	try {
		return typeof window !== "undefined" && !!window.localStorage;
	} catch {
		return false;
	}
}
