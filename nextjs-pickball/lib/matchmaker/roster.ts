// 名單 CRUD 純函式。所有函式皆為不可變操作，回傳新陣列，不就地修改傳入的 roster。
// id 與 createdAt 一律由呼叫端注入（design Decision 4），本模組不呼叫
// crypto.randomUUID() 或 new Date()，確保回傳值可被確定性斷言。

import { defaultGradient, paletteIndexOf } from "./colors";
import type { GradientPreset } from "./colors";
import type { Gender, Player } from "./types";

/** 新增參賽者所需的輸入欄位。id／createdAt 由呼叫端另外注入，restCount／gamesPlayed 固定從 0 起算。 */
export interface AddPlayerInput {
	name: string;
	gender: Gender;
	rating: number;
	/**
	 * 選填、**同進同出**：兩者須同時提供才視為手動指定配色，否則整組（含只給一端的情況）
	 * 皆視為未指定並走自動配色——只給一端時，該端的使用者輸入會被靜默忽略。
	 * 目前唯一呼叫端（PlayerForm）的 `<input type="color">` 恆兩端同時有值，故此邊界
	 * 尚未被觸發；但這是匯出的公開純函式，未來若有非 UI 呼叫端（如批次匯入）只傳一端，
	 * 需注意輸入會被丟棄而非報錯。
	 */
	colorFrom?: string;
	/** 見 `colorFrom` 的 JSDoc：兩者同進同出。 */
	colorTo?: string;
}

/** addPlayer 所需的注入值：id 與建立時間，皆由呼叫端（未來的 useRosterStore）產生。 */
export interface AddPlayerContext {
	id: string;
	now: string;
}

/**
 * 依指定 id 更新參賽者的部分欄位；id／createdAt 不可透過 patch 變更。
 *
 * ⚠️ `updatePlayer` 是**覆寫**語意，不是累加語意：`patch.restCount`／`patch.gamesPlayed`
 * 等欄位會直接取代既有值，而非疊加。M2（分配演算法）／M4（評分更新）若要遞增這類
 * 累計欄位，呼叫端必須自行讀出既有值再算出新值（例如 `{ restCount: player.restCount + 1 }`），
 * 否則等於用常數蓋掉既有累計值。若這類遞增呼叫散落多處，屆時應改為新增專門的
 * increment 函式，而非讓每個呼叫端各自重算。
 */
export type UpdatePlayerPatch = Partial<Omit<Player, "id" | "createdAt">>;

// rating 的唯一寫入前 round 點（design Decision 7）：強度分數存 number，
// 寫入前一律 round 至兩位小數，避免浮點數誤差累積或顯示過多小數位。
function roundRating(rating: number): number {
	return Math.round(rating * 100) / 100;
}

// 調色盤的組數是有限值，但 colors.ts 依 3.17 的限制只能新增 paletteIndexOf，不能另外
// 匯出長度常數。改以偵測 defaultGradient(0…n) 何時循環回到第 0 組反推長度——
// DEFAULT_GRADIENTS 固定為 16 組，此迴圈只會跑 16 次，成本可忽略。
function paletteLength(): number {
	const first = defaultGradient(0);
	let length = 1;
	while (defaultGradient(length).colorFrom !== first.colorFrom || defaultGradient(length).colorTo !== first.colorTo) {
		length++;
	}
	return length;
}

// 新成員自動配色：掃描目前名單「已入座」的 palette index（透過 paletteIndexOf 反查各
// 成員現有顏色），取最小未使用值。改用此法而非 defaultGradient(roster.length)，
// 是因為刪除是 spec 明列的功能——刪除後 roster.length 會與「已用的最大 index + 1」脫鉤，
// 導致新增者與既有成員撞色（見 3.16 的紅燈）。
//
// 邊界：名單人數超過調色盤組數（16）時，所有 index 皆已被佔用，退回
// defaultGradient(roster.length) 循環取用——defaultGradient 內部已用 modulo 保護，
// 不會因 index 超界而拋錯或回傳空值（spec「雙色漸層與文字對比」的 MUST 要求）。
function nextAutoGradient(roster: readonly Player[]): GradientPreset {
	const length = paletteLength();
	const usedIndices = new Set(
		roster.map((p) => paletteIndexOf(p.colorFrom, p.colorTo)).filter((index) => index !== -1),
	);

	for (let index = 0; index < length; index++) {
		if (!usedIndices.has(index)) {
			return defaultGradient(index);
		}
	}

	return defaultGradient(roster.length);
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
			: nextAutoGradient(roster);

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
