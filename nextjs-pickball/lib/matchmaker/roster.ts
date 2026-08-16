// 名單 CRUD 純函式。所有函式皆為不可變操作，回傳新陣列，不就地修改傳入的 roster。
// id 與 createdAt 一律由呼叫端注入（design Decision 4），本模組不呼叫
// crypto.randomUUID() 或 new Date()，確保回傳值可被確定性斷言。

import { defaultGradient } from "./colors";
import type { Gender, Player } from "./types";

/** 新增參賽者所需的輸入欄位。id／createdAt 由呼叫端另外注入，restCount／gamesPlayed 固定從 0 起算。 */
export interface AddPlayerInput {
	name: string;
	gender: Gender;
	rating: number;
	// 選填：未提供時依目前名單長度自動配色。
	colorFrom?: string;
	colorTo?: string;
}

/** addPlayer 所需的注入值：id 與建立時間，皆由呼叫端（未來的 useRosterStore）產生。 */
export interface AddPlayerContext {
	id: string;
	now: string;
}

/** 依指定 id 更新參賽者的部分欄位；id／createdAt 不可透過 patch 變更。 */
export type UpdatePlayerPatch = Partial<Omit<Player, "id" | "createdAt">>;

// rating 的唯一寫入前 round 點（design Decision 7）：強度分數存 number，
// 寫入前一律 round 至兩位小數，避免浮點數誤差累積或顯示過多小數位。
function roundRating(rating: number): number {
	return Math.round(rating * 100) / 100;
}

// updatePlayer／togglePlayerActive 共用的「依 id 找到 index 後以新物件取代」邏輯：
// 找不到 id 時回傳內容相等的新陣列（不改動、不新增）；找到時以 transform 產生取代後的物件，
// 並以不可變方式（slice + spread）組回新陣列，原陣列與其餘成員皆不被就地修改。
function replaceById(roster: readonly Player[], id: string, transform: (player: Player) => Player): Player[] {
	const index = roster.findIndex((p) => p.id === id);
	if (index === -1) {
		return [...roster];
	}

	const updated = transform(roster[index]);

	return [...roster.slice(0, index), updated, ...roster.slice(index + 1)];
}

/** 新增一位參賽者，回傳新陣列，原陣列不受影響。 */
export function addPlayer(roster: readonly Player[], input: AddPlayerInput, context: AddPlayerContext): Player[] {
	const gradient =
		input.colorFrom !== undefined && input.colorTo !== undefined
			? { colorFrom: input.colorFrom, colorTo: input.colorTo }
			: defaultGradient(roster.length);

	const player: Player = {
		id: context.id,
		name: input.name,
		gender: input.gender,
		colorFrom: gradient.colorFrom,
		colorTo: gradient.colorTo,
		rating: roundRating(input.rating),
		restCount: 0,
		gamesPlayed: 0,
		isActive: true,
		createdAt: context.now,
	};

	return [...roster, player];
}

/** 依 id 更新參賽者的指定欄位；找不到 id 時原樣回傳（不新增也不改動）。 */
export function updatePlayer(roster: readonly Player[], id: string, patch: UpdatePlayerPatch): Player[] {
	return replaceById(roster, id, (player) => {
		const updated: Player = { ...player, ...patch };
		if (patch.rating !== undefined) {
			updated.rating = roundRating(patch.rating);
		}
		return updated;
	});
}

/** 依 id 移除參賽者，保持其餘成員的原有順序。 */
export function removePlayer(roster: readonly Player[], id: string): Player[] {
	return roster.filter((p) => p.id !== id);
}

/** 切換參賽者的出場狀態，不影響 restCount。 */
export function togglePlayerActive(roster: readonly Player[], id: string): Player[] {
	return replaceById(roster, id, (player) => ({ ...player, isActive: !player.isActive }));
}
