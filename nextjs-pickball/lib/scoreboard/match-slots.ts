import { z } from "zod";
import { ScoreboardStateSchema } from "./types";
import type { ScoreboardState } from "./types";

export const MATCH_SLOTS_KEY = "scoreboard:matches:v1";

export type MatchSlots = Record<string, ScoreboardState>;

export const MatchSlotsSchema = z.record(z.string(), ScoreboardStateSchema);

export interface ReadMatchSlotsResult {
	slots: MatchSlots;
	droppedCount: number;
}

/** 確認 localStorage 可用（SSR / 私密模式下可能不存在），沿用 storage.ts 既有守門 */
function hasLocalStorage(): boolean {
	try {
		return typeof window !== "undefined" && !!window.localStorage;
	} catch {
		return false;
	}
}

/**
 * 從 localStorage 讀取所有場次的分槽資料。
 *
 * 目前為整份驗證（1.4 起改為逐筆降級，見該項）：JSON 解析失敗或 schema 驗證失敗
 * 皆回空集合，尚未清 key（清 key 的行為留給 1.6 實作）。
 */
export function readMatchSlots(): ReadMatchSlotsResult {
	if (!hasLocalStorage()) return { slots: {}, droppedCount: 0 };

	const raw = localStorage.getItem(MATCH_SLOTS_KEY);
	if (raw === null) return { slots: {}, droppedCount: 0 };

	try {
		const parsed: unknown = JSON.parse(raw);
		const result = MatchSlotsSchema.safeParse(parsed);
		if (!result.success) {
			console.warn("[scoreboard] 分槽資料驗證失敗", result.error);
			return { slots: {}, droppedCount: 0 };
		}
		return { slots: result.data, droppedCount: 0 };
	} catch (err) {
		console.warn("[scoreboard] 分槽資料 JSON 解析失敗", err);
		return { slots: {}, droppedCount: 0 };
	}
}

/** 讀取單一場次的分槽 state；不存在則回 null */
export function readMatchSlot(matchId: string): ScoreboardState | null {
	const { slots } = readMatchSlots();
	return slots[matchId] ?? null;
}

/**
 * 寫入單一場次的分槽 state。map 形態下任一次寫入都要重寫整份 map（design Decision 4），
 * 代價可忽略：場地數上限為 8（prd.md 4.3）。
 */
export function writeMatchSlot(matchId: string, state: ScoreboardState): void {
	if (!hasLocalStorage()) return;
	try {
		const { slots } = readMatchSlots();
		slots[matchId] = state;
		localStorage.setItem(MATCH_SLOTS_KEY, JSON.stringify(slots));
	} catch (err) {
		console.warn("[scoreboard] 分槽資料寫入失敗", err);
	}
}

/**
 * 批次清除指定場次的分槽（例：整輪重設時傳入該輪出現過的 matchId 清單）。
 * TODO(1.8)：目前為 no-op，實作與紅燈驗證見 1.7／1.8。
 */
export function clearMatchSlots(matchIds: readonly string[]): void {
	if (!hasLocalStorage()) return;
	void matchIds;
}

/** 清空所有分槽（整個 key 移除），SHALL NOT 影響獨立計分板的 scoreboard:current:v1 */
export function clearAllMatchSlots(): void {
	if (!hasLocalStorage()) return;
	try {
		localStorage.removeItem(MATCH_SLOTS_KEY);
	} catch {
		// 靜默忽略，比照 storage.ts clearScoreboard 的既有慣例
	}
}
