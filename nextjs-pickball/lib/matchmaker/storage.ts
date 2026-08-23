import { z } from "zod";
import { PlayerSchema } from "./types";
import { ROSTER_STORAGE_KEY, ROUND_STORAGE_KEY, HISTORY_STORAGE_KEY, hasLocalStorage } from "./storage-keys";
import type { Player } from "./types";

// re-export（非改名）：M1 既有的匯入點（hooks/useRosterStore.ts 等）與既有測試
// 都是 import { STORAGE_KEY } from "./storage"，key 本體已搬到 storage-keys.ts
// 單一來源（見 design Decision 8），保留這行 re-export 讓那些既有匯入點不必改動。
export const STORAGE_KEY = ROSTER_STORAGE_KEY;

/**
 * 容器（外層）schema：只驗證 version 與 players 是否為陣列，
 * 陣列元素刻意用 z.unknown() 不驗——逐筆驗證交給 readRoster() 內部處理。
 *
 * 這是刻意與 RosterSchema（完整驗證，寫入時使用）分開的兩段式設計：
 * 名單是使用者逐筆手建的資料，單筆壞掉不該連累整份被清空（見 Decision 3）。
 * version 不符則視為結構層級損壞，走「無筆可救」路徑（見 Decision 9）。
 */
const RosterContainerSchema = z.object({
	version: z.literal(1),
	players: z.array(z.unknown()),
});

/** readRoster() 的回傳形狀：合法名單，以及本次讀取時被丟棄的損壞筆數。 */
export interface ReadRosterResult {
	players: Player[];
	droppedCount: number;
}

/**
 * 從 localStorage 讀取名單。
 *
 * - 無資料 → 空名單
 * - JSON 解析失敗 → 清除損壞資料並回空名單（無筆可救）
 * - 外層結構不合法（含 version 不符）→ 清除損壞資料並回空名單（無筆可救）
 * - 外層合法但個別 player 不合法 → 保留合法者、捨棄不合法者，回報 droppedCount，
 *   key 不移除（逐筆降級，見 Decision 3）
 */
export function readRoster(): ReadRosterResult {
	if (!hasLocalStorage()) return { players: [], droppedCount: 0 };

	const raw = localStorage.getItem(STORAGE_KEY);
	if (raw === null) return { players: [], droppedCount: 0 };

	try {
		const parsed = JSON.parse(raw);
		const containerResult = RosterContainerSchema.safeParse(parsed);
		if (!containerResult.success) {
			console.warn("[matchmaker] localStorage 外層結構不合法，清除", containerResult.error);
			clearRoster();
			return { players: [], droppedCount: 0 };
		}

		// 外層（含 version）合法，逐筆驗證 player：壞掉的筆數捨棄，其餘保留。
		const players: Player[] = [];
		let droppedCount = 0;
		for (const rawPlayer of containerResult.data.players) {
			const playerResult = PlayerSchema.safeParse(rawPlayer);
			if (playerResult.success) {
				players.push(playerResult.data);
			} else {
				droppedCount++;
			}
		}

		if (droppedCount > 0) {
			console.warn(
				`[matchmaker] localStorage 中有 ${droppedCount} 筆資料不合法，已捨棄並回寫清理後的名單`,
			);
			writeRoster(players);
		}

		return { players, droppedCount };
	} catch (err) {
		console.warn("[matchmaker] localStorage JSON 解析失敗，清除", err);
		clearRoster();
		return { players: [], droppedCount: 0 };
	}
}

/**
 * 將名單序列化後寫入 localStorage。
 * 若 localStorage 不可用或寫入失敗則靜默忽略。
 */
export function writeRoster(players: Player[]): void {
	if (!hasLocalStorage()) return;
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, players }));
	} catch (err) {
		console.warn("[matchmaker] localStorage 寫入失敗", err);
	}
}

/**
 * 移除 localStorage 中的名單。
 */
export function clearRoster(): void {
	if (!hasLocalStorage()) return;
	try {
		localStorage.removeItem(STORAGE_KEY);
	} catch {
		// 靜默忽略
	}
}

/**
 * 重置範圍刻意採「明確列舉」而非「前綴掃描」（例如清除所有 matchmaker: 開頭的 key）：
 * 掃描式清除會誤刪未來加入、不該被重置的使用者偏好資料，改用列舉可強制在新增
 * 資料域時主動決定是否納入重置範圍。
 */
const RESET_KEYS = [ROSTER_STORAGE_KEY, ROUND_STORAGE_KEY, HISTORY_STORAGE_KEY] as const;

/**
 * 重置 matchmaker 相關的 localStorage 資料。只移除 RESET_KEYS 列舉的 key，
 * 不影響其他 capability（如 scoreboard）的資料。
 */
export function resetMatchmakerData(): void {
	if (!hasLocalStorage()) return;
	try {
		for (const key of RESET_KEYS) {
			localStorage.removeItem(key);
		}
	} catch {
		// 靜默忽略
	}
}
