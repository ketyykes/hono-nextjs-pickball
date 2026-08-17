// 候選排序與出場名單決策。純函式、決定性、不修改輸入（design Decision 8）。
// 對應 prd.md 5.3：依「休息次數多者優先 → 強度分數高者優先 → 穩定排序」決定出場與休息名單。

import { PLAYERS_PER_MATCH } from "./allocation-types";
import type { MatchFormat } from "./allocation-types";
import type { Player } from "./types";

/** selectPlaying 的回傳形狀：本輪出場者與休息者。陣列本身亦唯讀，下游需先 slice() 才能排序。 */
export interface SelectPlayingResult {
	readonly playing: readonly Player[];
	readonly resting: readonly Player[];
}

// 候選排序的比較函式：restCount 遞減 → rating 遞減。
// 兩者皆相等時回傳 0，交由 Array.prototype.sort 的穩定性（ES2019 起保證）維持輸入相對次序，
// 不需額外攜帶原始 index（design Decision 8）。
function compareCandidates(a: Player, b: Player): number {
	if (a.restCount !== b.restCount) {
		return b.restCount - a.restCount;
	}
	return b.rating - a.rating;
}

/**
 * 依「休息次數多者優先 → 強度分數高者優先 → 穩定排序」排序候選人員。
 * 排序前先 slice() 複製，不得原地改動輸入（輸入的 Player 陣列 MUST 被視為唯讀）。
 */
export function sortCandidates(players: readonly Player[]): Player[] {
	return players.slice().sort(compareCandidates);
}

/**
 * 計算本輪出場人數：min(可用人數, 場地數 × 每場人數)，向下取整至每場人數的倍數。
 * PLAYERS_PER_MATCH 為每場人數的唯一來源。
 */
export function countPlaying(availableCount: number, format: MatchFormat, courtCount: number): number {
	const perMatch = PLAYERS_PER_MATCH[format];
	const capacity = courtCount * perMatch;
	const raw = Math.min(availableCount, capacity);
	// JS 的 % 保留被除數符號，raw 為負數時 raw % perMatch 不會把 raw 拉回 0，
	// 故顯式夾下限——負數出場人數的失敗模式是沉默的（見呼叫端 selectPlaying 的 slice 邊界）。
	return Math.max(0, raw - (raw % perMatch));
}

/**
 * 決定本輪出場與休息名單：先以 isActive 過濾候選池，排序後取前 N 名出場，其餘為休息名單。
 * 暫停出場（isActive === false）者完全排除於候選池之外，既不出場也不列入休息名單
 * （design Decision 3）。此函式不修改任何 Player 物件。
 */
export function selectPlaying(players: readonly Player[], format: MatchFormat, courtCount: number): SelectPlayingResult {
	const activeCandidates = players.filter((p) => p.isActive);
	const sorted = sortCandidates(activeCandidates);
	const playingCount = countPlaying(sorted.length, format, courtCount);

	return {
		playing: sorted.slice(0, playingCount),
		resting: sorted.slice(playingCount),
	};
}
