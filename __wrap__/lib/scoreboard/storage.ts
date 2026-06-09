import { ScoreboardStateSchema } from "./types";
import type { ScoreboardState } from "./types";

export const STORAGE_KEY = "scoreboard:current:v1";

/** 確認 localStorage 可用（SSR / 私密模式下可能不存在） */
function hasLocalStorage(): boolean {
	try {
		return typeof window !== "undefined" && !!window.localStorage;
	} catch {
		return false;
	}
}

/**
 * 從 localStorage 讀取記分板狀態。
 *
 * - 無資料 → null
 * - JSON 解析失敗 → 清除損壞資料並回 null
 * - zod schema 驗證失敗 → 清除損壞資料並回 null
 */
export function readScoreboard(): ScoreboardState | null {
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
 * 若 localStorage 不可用或寫入失敗則靜默忽略。
 */
export function writeScoreboard(state: ScoreboardState): void {
	if (!hasLocalStorage()) return;
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
	} catch (err) {
		console.warn("[scoreboard] localStorage 寫入失敗", err);
	}
}

/**
 * 移除 localStorage 中的記分板狀態。
 */
export function clearScoreboard(): void {
	if (!hasLocalStorage()) return;
	try {
		localStorage.removeItem(STORAGE_KEY);
	} catch {
		// 靜默忽略
	}
}
