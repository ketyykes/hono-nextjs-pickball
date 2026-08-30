import { ScoreboardStateSchema } from "./types";
import type { ScoreboardState } from "./types";
import { readMatchSlot, writeMatchSlot, clearMatchSlots } from "./match-slots";
import { STORAGE_KEY, hasLocalStorage } from "./storage-keys";

// re-export（非改名）：既有匯入點（storage.test.ts、useScoreboardStore.test.tsx 等）
// 都是 import { STORAGE_KEY } from "./storage"，key 本體已搬到 storage-keys.ts
// 單一來源（見 storage-keys.ts 頁首註解），保留這行 re-export 讓既有匯入點不必改動。
export { STORAGE_KEY };

// 空字串視為未綁定（等同 null）：`/scoreboard?match=` 這種空 query param 會產生 ""，
// 而非 null，若不正規化，reducer 現行的 SET_TARGET_SCORE guard 會誤判為「已綁定」
// （見 design 8-D 的裁決：正規化交給邊界，不回頭改 reducer）。
function isStandaloneMatchId(matchId: string | null): boolean {
	return matchId === null || matchId === "";
}

/**
 * 從 localStorage 讀取記分板狀態，依 matchId 分派至獨立槽或對應場次的分槽。
 *
 * - matchId 為 null／空字串 → 讀獨立槽 scoreboard:current:v1
 * - matchId 為其他字串 → 讀 scoreboard:matches:v1 內對應條目，不存在則回 null
 *
 * 獨立槽路徑維持原行為：
 * - 無資料 → null
 * - JSON 解析失敗 → 清除損壞資料並回 null
 * - zod schema 驗證失敗 → 清除損壞資料並回 null
 */
export function readScoreboard(matchId: string | null = null): ScoreboardState | null {
	if (!isStandaloneMatchId(matchId)) {
		return readMatchSlot(matchId as string);
	}

	if (!hasLocalStorage()) return null;

	const raw = localStorage.getItem(STORAGE_KEY);
	if (raw === null) return null;

	try {
		const parsed = JSON.parse(raw);
		const result = ScoreboardStateSchema.safeParse(parsed);
		if (!result.success) {
			console.warn("[scoreboard] localStorage schema 不合法，清除", result.error);
			localStorage.removeItem(STORAGE_KEY);
			return null;
		}
		return result.data;
	} catch (err) {
		console.warn("[scoreboard] localStorage JSON 解析失敗，清除", err);
		localStorage.removeItem(STORAGE_KEY);
		return null;
	}
}

/**
 * 將記分板狀態序列化後寫入 localStorage。
 *
 * 寫入槽位由 state.matchId 推導，SHALL NOT 接受呼叫端另傳槽位參數——
 * 兩個真實來源會讓「寫錯槽」成為可能的靜默失效模式（見 spec）。
 * 若 localStorage 不可用或寫入失敗則靜默忽略。
 */
export function writeScoreboard(state: ScoreboardState): void {
	if (!isStandaloneMatchId(state.matchId)) {
		// matchId 已由 isStandaloneMatchId 排除 null／空字串，此處縮限為 string，
		// 交給 writeMatchSlot 從 state.matchId 推導槽位（見該函式的簽章收斂說明）。
		writeMatchSlot(state as ScoreboardState & { matchId: string });
		return;
	}

	if (!hasLocalStorage()) return;
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
	} catch (err) {
		console.warn("[scoreboard] localStorage 寫入失敗", err);
	}
}

/**
 * 移除 localStorage 中的記分板狀態，依 matchId 分派。
 */
export function clearScoreboard(matchId: string | null = null): void {
	if (!isStandaloneMatchId(matchId)) {
		clearMatchSlots([matchId as string]);
		return;
	}

	if (!hasLocalStorage()) return;
	try {
		localStorage.removeItem(STORAGE_KEY);
	} catch {
		// 靜默忽略
	}
}
