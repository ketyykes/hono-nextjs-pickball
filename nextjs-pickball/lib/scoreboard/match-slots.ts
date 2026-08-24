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
 * 整份不是合法 JSON、或解析後不是物件 → 清除整個 key（無筆可救，
 * 只清 MATCH_SLOTS_KEY 一個 key，SHALL NOT 波及獨立槽 scoreboard:current:v1）。
 * 整份能解析為物件時逐筆 safeParse——刻意不整份丟給 MatchSlotsSchema，
 * 因為一筆壞資料就會讓 safeParse 整體失敗，與「單場損壞不得連坐清空
 * 其他場次」的需求牴觸（見 design Decision 4）。
 */
export function readMatchSlots(): ReadMatchSlotsResult {
	if (!hasLocalStorage()) return { slots: {}, droppedCount: 0 };

	const raw = localStorage.getItem(MATCH_SLOTS_KEY);
	if (raw === null) return { slots: {}, droppedCount: 0 };

	try {
		const parsed: unknown = JSON.parse(raw);
		if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
			console.warn("[scoreboard] 分槽資料不是物件，清除", parsed);
			clearAllMatchSlots();
			return { slots: {}, droppedCount: 0 };
		}

		const slots: MatchSlots = {};
		let droppedCount = 0;
		for (const [matchId, rawState] of Object.entries(parsed)) {
			const result = ScoreboardStateSchema.safeParse(rawState);
			if (result.success) {
				slots[matchId] = result.data;
			} else {
				droppedCount++;
			}
		}

		if (droppedCount > 0) {
			console.warn(`[scoreboard] 分槽資料中有 ${droppedCount} 筆不合法，已捨棄`);
		}

		return { slots, droppedCount };
	} catch (err) {
		console.warn("[scoreboard] 分槽資料 JSON 解析失敗，清除", err);
		clearAllMatchSlots();
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
 * 清除不存在的 matchId SHALL NOT 視為錯誤——呼叫端常會傳入已消失的 id。
 */
export function clearMatchSlots(matchIds: readonly string[]): void {
	if (!hasLocalStorage()) return;
	try {
		const { slots } = readMatchSlots();
		for (const matchId of matchIds) {
			delete slots[matchId];
		}
		localStorage.setItem(MATCH_SLOTS_KEY, JSON.stringify(slots));
	} catch (err) {
		console.warn("[scoreboard] 分槽資料批次清除失敗", err);
	}
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
