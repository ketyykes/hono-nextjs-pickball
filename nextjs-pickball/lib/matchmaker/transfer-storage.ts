// 快照的讀取／寫入／清除（design Decision 1／2；tasks §7）。
//
// 本檔 SHALL NOT 編輯 storage.ts／storage-keys.ts／lib/scoreboard/**，只 import
// 既有匯出後在此組出自己的 CLEAR_ALL_KEYS 與 writeBackup（design Decision 2：
// storage.ts 的 RESET_KEYS 是 M4 並行擴充的對象，兩邊同時編輯同一段常數必然衝突）。

import { ROSTER_STORAGE_KEY, ROUND_STORAGE_KEY, HISTORY_STORAGE_KEY, hasLocalStorage } from "./storage-keys";
// scoreboard 的兩個 key 常數取自各自的具名匯出模組（storage.ts 的獨立槽 key、
// match-slots.ts 的分槽 key），不直接連到 lib/scoreboard/storage-keys.ts——
// 比照既有 lib/matchmaker/storage.ts 與其測試檔的做法，跨 capability 只透過
// 對外契約取用，不觸碰對方的內部宣告點。
import { STORAGE_KEY as SCOREBOARD_STORAGE_KEY } from "../scoreboard/storage";
import { MATCH_SLOTS_KEY } from "../scoreboard/match-slots";
import { readRoster } from "./storage";
import { readRound, readHistory } from "./round-storage";
import { TRANSFER_MESSAGES } from "./transfer-types";
import type { Backup } from "./transfer-types";
import type { BackupSnapshot } from "./backup";

/**
 * 「清除本機資料」涵蓋的全部 LocalStorage key（design Decision 2／5；tasks §0.6 對照表，
 * 共 5 個）。每一個成員皆 import 自其宣告模組，SHALL NOT 在本檔硬編字面值——
 * 「涵蓋本 app 全部 key」才是承諾，日後新增資料域忘了在此補列，會是「merge 全綠、
 * 測試全綠，但使用者清除後資料整批殘留」的無聲失敗。
 *
 * `scoreboard:hint-dismissed`（OrientationHint.tsx）用的是 sessionStorage，
 * 依 tasks §0.5 明文 SHALL NOT 列入。
 */
export const CLEAR_ALL_KEYS = [
	ROSTER_STORAGE_KEY,
	ROUND_STORAGE_KEY,
	HISTORY_STORAGE_KEY,
	SCOREBOARD_STORAGE_KEY,
	MATCH_SLOTS_KEY,
] as const;

/**
 * 清除本 app 寫入的全部 LocalStorage 資料（prd.md §10「清除本機資料」）。
 *
 * 刻意逐一呼叫 `removeItem`，而非呼叫 Web Storage 全域的整批清除方法：後者會一併刪除
 * 本 app 從未寫入的 key（同網域的其他來源、未來的純顯示偏好），使用者無從檢視被刪掉了什麼；
 * 列舉清單則強制在新增任何資料域時主動決定它是否屬於清除範圍（design Decision 2／5，
 * 比照 `storage.ts` 既有的 `resetMatchmakerData()`）。
 */
export function clearAllLocalData(): void {
	if (!hasLocalStorage()) return;
	for (const key of CLEAR_ALL_KEYS) {
		try {
			localStorage.removeItem(key);
		} catch {
			// 靜默忽略，比照 storage.ts resetMatchmakerData() 的既有慣例。
		}
	}
}

/**
 * 讀取匯出用的完整資料快照（`buildBackup` 的輸入）。localStorage 不可用時回傳空快照
 * 而非拋出例外——匯出路徑 MUST 不因此失敗到無法產生檔案（spec「匯入匯出的錯誤處理與
 * LocalStorage 邊界」：讀不到資料時匯出的是空備份，這仍比讓使用者卡在錯誤畫面好）。
 */
export function readSnapshot(): BackupSnapshot {
	if (!hasLocalStorage()) {
		return { players: [], currentRound: null, history: [] };
	}
	const { players } = readRoster();
	const currentRound = readRound();
	const { entries } = readHistory();
	return { players, currentRound, history: entries };
}

/** `writeBackup()` 的回傳結果：成功，或附繁體中文修正建議的失敗訊息。 */
export type WriteBackupResult = { readonly ok: true } | { readonly ok: false; readonly message: string };

/**
 * 將已驗證的備份寫入名單／回合／歷史三個 key。
 *
 * 參數型別只接受 `Backup`（`parseBackup` 成功後才產得出來的型別），驗證與寫入在型別上
 * 就無法對調順序（design Decision 1「原子性由型別強制」）——呼叫端不可能把未驗證的
 * `unknown` 傳進來。
 *
 * SHALL NOT 委派 `round-storage.ts` 的 `writeRound`／`writeHistory`：那兩個函式會
 * 靜默吞掉配額例外（見其文件註解「若 localStorage 不可用或寫入失敗則靜默忽略」），
 * 無法滿足「寫入超出配額時回報失敗」。本函式自行 `setItem` 並 try/catch。
 */
export function writeBackup(backup: Backup): WriteBackupResult {
	if (!hasLocalStorage()) {
		return { ok: false, message: TRANSFER_MESSAGES.localStorageUnavailable };
	}
	try {
		localStorage.setItem(ROSTER_STORAGE_KEY, JSON.stringify({ version: 1, players: backup.players }));
		localStorage.setItem(ROUND_STORAGE_KEY, JSON.stringify({ version: 1, round: backup.currentRound }));
		localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify({ version: 1, entries: backup.history }));
		return { ok: true };
	} catch {
		return { ok: false, message: TRANSFER_MESSAGES.quotaExceeded };
	}
}
