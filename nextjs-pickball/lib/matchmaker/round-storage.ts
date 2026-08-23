import { z } from "zod";
import { RoundSchema } from "./round-types";
import { makeHistoryContainerSchema, MatchHistoryEntrySchema } from "./history";
import { ROUND_STORAGE_KEY, HISTORY_STORAGE_KEY, hasLocalStorage } from "./storage-keys";
import type { Round } from "./round-types";
import type { MatchHistoryEntry } from "./history";

/**
 * 讀 key → JSON.parse → 外層 schema 驗證的共用骨架。回合與歷史的降級策略在外層
 * 驗證失敗（JSON 解析失敗或結構／version 不符）時完全相同——清除該 key、回報
 * 「沒有可用資料」，差異只在外層驗證通過之後：回合直接可用，歷史仍要逐筆
 * safeParse 降級。故骨架只做到「拿到合法外層資料」或「因故清除並回報失敗」，
 * 逐筆降級留給呼叫端（readHistory）處理，SHALL NOT 在這裡預設任何一方的降級策略。
 */
function readContainer<Data>(
	key: string,
	schema: z.ZodType<Data>,
): { success: true; data: Data } | { success: false } {
	if (!hasLocalStorage()) return { success: false };

	const raw = localStorage.getItem(key);
	if (raw === null) return { success: false };

	try {
		const parsed = JSON.parse(raw);
		const result = schema.safeParse(parsed);
		if (!result.success) {
			console.warn(`[matchmaker] localStorage 外層結構不合法（key: ${key}），清除`, result.error);
			clearKey(key);
			return { success: false };
		}
		return { success: true, data: result.data };
	} catch (err) {
		console.warn(`[matchmaker] localStorage JSON 解析失敗（key: ${key}），清除`, err);
		clearKey(key);
		return { success: false };
	}
}

/**
 * 序列化後寫入 localStorage 的共用骨架。若 localStorage 不可用或寫入失敗
 * （如超出配額）則靜默忽略，SHALL NOT 拋出例外中斷呼叫端。
 */
function writeJSON(key: string, value: unknown): void {
	if (!hasLocalStorage()) return;
	try {
		localStorage.setItem(key, JSON.stringify(value));
	} catch (err) {
		console.warn(`[matchmaker] localStorage 寫入失敗（key: ${key}）`, err);
	}
}

/** 移除 localStorage 指定 key 的共用骨架。 */
function clearKey(key: string): void {
	if (!hasLocalStorage()) return;
	try {
		localStorage.removeItem(key);
	} catch {
		// 靜默忽略
	}
}

/**
 * 外層容器：回合是單一物件，任一層驗證失敗都無筆可救（見 spec「回合與歷史的
 * 持久化與損壞降級」）。與 storage.ts 的 RosterContainerSchema 不同的是這裡不需要
 * 逐筆降級的寬鬆內層——round 欄位直接套用完整的 RoundSchema。
 */
const RoundContainerSchema = z.object({
	version: z.literal(1),
	round: RoundSchema.nullable(),
});

/**
 * 從 localStorage 讀取目前回合。
 *
 * - 無資料 → 無目前回合（null）
 * - JSON 解析失敗、外層結構不合法或 version 不符 → 清除損壞資料並回無目前回合
 *   （回合是單一物件，無筆可救，見 spec「回合與歷史的持久化與損壞降級」）
 */
export function readRound(): Round | null {
	const result = readContainer(ROUND_STORAGE_KEY, RoundContainerSchema);
	if (!result.success) return null;
	return result.data.round;
}

/**
 * 將目前回合序列化後寫入 localStorage。
 * 若 localStorage 不可用或寫入失敗（如超出配額）則靜默忽略，SHALL NOT 拋出例外中斷呼叫端。
 */
export function writeRound(round: Round | null): void {
	writeJSON(ROUND_STORAGE_KEY, { version: 1, round });
}

/**
 * 移除 localStorage 中的目前回合。
 */
export function clearRound(): void {
	clearKey(ROUND_STORAGE_KEY);
}

/**
 * 讀取路徑用的寬鬆外層容器：entries 以 z.array(z.unknown()) 承接，逐筆驗證交給
 * readHistory() 處理（比照 storage.ts 的 RosterContainerSchema）。與 history.ts
 * 寫入用的嚴格版 HistorySchema 同出 makeHistoryContainerSchema 這個工廠，
 * version 字面量與 entries 欄位名不會出現兩份互不相干的手打定義（見 history.ts
 * 對應註解）。
 */
const HistoryReadContainerSchema = makeHistoryContainerSchema(z.array(z.unknown()));

/** readHistory() 的回傳形狀：合法歷史紀錄，以及本次讀取時被丟棄的損壞筆數。 */
export interface ReadHistoryResult {
	entries: MatchHistoryEntry[];
	droppedCount: number;
}

/**
 * 從 localStorage 讀取歷史賽果。
 *
 * - 無資料 → 空歷史
 * - JSON 解析失敗、外層結構不合法或 version 不符 → 清除損壞資料並回空歷史，
 *   不走逐筆降級（結構層級損壞，即使每筆都合法也不得保留）
 * - 外層合法但個別紀錄不合法 → 保留合法者、捨棄不合法者，回報 droppedCount，
 *   key 不移除（逐筆降級，見 spec「回合與歷史的持久化與損壞降級」——歷史是活動
 *   累積的資料，因單筆損壞而清空整份的損失不成比例）
 */
export function readHistory(): ReadHistoryResult {
	const result = readContainer(HISTORY_STORAGE_KEY, HistoryReadContainerSchema);
	if (!result.success) return { entries: [], droppedCount: 0 };

	// 外層（含 version）合法，逐筆驗證：壞掉的筆數捨棄，其餘保留。
	const entries: MatchHistoryEntry[] = [];
	let droppedCount = 0;
	for (const rawEntry of result.data.entries) {
		const entryResult = MatchHistoryEntrySchema.safeParse(rawEntry);
		if (entryResult.success) {
			entries.push(entryResult.data);
		} else {
			droppedCount++;
		}
	}

	if (droppedCount > 0) {
		console.warn(
			`[matchmaker] 歷史資料中有 ${droppedCount} 筆紀錄不合法，已捨棄並回寫清理後的歷史`,
		);
		writeHistory(entries);
	}

	return { entries, droppedCount };
}

/**
 * 將歷史賽果序列化後寫入 localStorage。
 * 若 localStorage 不可用或寫入失敗（如超出配額）則靜默忽略，SHALL NOT 拋出例外中斷呼叫端。
 */
export function writeHistory(entries: readonly MatchHistoryEntry[]): void {
	writeJSON(HISTORY_STORAGE_KEY, { version: 1, entries });
}

/**
 * 移除 localStorage 中的歷史賽果。
 */
export function clearHistory(): void {
	clearKey(HISTORY_STORAGE_KEY);
}
