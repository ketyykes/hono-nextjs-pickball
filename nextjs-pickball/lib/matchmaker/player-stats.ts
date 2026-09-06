// 球員統計計算核心。純函式、決定性、不修改輸入（design Decision 2：只回傳資料，
// 不內嵌任何顯示文案；「已不在名單」等最終呈現文字交給 PlayerStatsTable.tsx）。

import type { MatchHistoryEntry } from "./history";
import type { Player } from "./types";

/**
 * 球員統計結果。`mostFrequentPartner`／`mostFrequentOpponent` 為找到搭檔／對手時的
 * 姓名字串，找不到時為 `null`——不是「尚無紀錄」之類的顯示文字，那由呈現層決定
 * （design Decision 2）。
 */
export interface PlayerStat {
	id: string;
	name: string;
	colorFrom: string;
	colorTo: string;
	onRoster: boolean;
	currentRating: number;
	gamesPlayed: number;
	wins: number;
	losses: number;
	winRate: number;
	ratingDelta: number;
	mostFrequentPartner: string | null;
	mostFrequentOpponent: string | null;
}

// 已離開名單的球員沒有名單色塊可用——HistoryPlayerSchema 只留 id／name／
// ratingBefore／ratingAfter，不含 colorFrom／colorTo（design Decision 3）。
// 這裡另訂一組中性灰，不共用 export-scene.ts 的 PLACEHOLDER_COLOR_FROM／TO：
// 那組是私有常數（未 export），語意是「匯出圖片時尚未指派顏色」；本檔語意是
// 「這位球員的顏色資訊已隨名單一起消失」，兩者恰好都是灰色只是巧合，不代表同一件事——
// 共用同一個常數會讓其中一邊改視覺語意時意外波及另一邊。
const OFF_ROSTER_COLOR_FROM = "#9CA3AF";
const OFF_ROSTER_COLOR_TO = "#6B7280";

/** 尚未套用 §3／§4 邏輯前的可變累加狀態，累加完成後才轉成對外的 PlayerStat。 */
interface MutableStat {
	id: string;
	name: string;
	colorFrom: string;
	colorTo: string;
	onRoster: boolean;
	currentRating: number;
	gamesPlayed: number;
	wins: number;
	losses: number;
}

/**
 * 建立「目前名單」與「歷史紀錄中出現過的球員」的聯集初始項目，以 id 為鍵
 * （spec：SHALL NOT 以姓名為鍵）。名單內球員的姓名、色塊、目前強度取自 `players`；
 * 只出現在歷史的球員先以其快照姓名暫代、色塊為上方的中性灰、目前強度暫定為 0——
 * §3.2 會改用該球員在歷史中最近一筆的 ratingAfter。整段聯集只在這裡建構一次，
 * 供後續累加沿用，不在 §3／§4 重新掃描 history／players（tasks 2.7）。
 */
function buildRosterUnion(
	history: readonly MatchHistoryEntry[],
	players: readonly Player[],
): Map<string, MutableStat> {
	const union = new Map<string, MutableStat>();

	for (const player of players) {
		union.set(player.id, {
			id: player.id,
			name: player.name,
			colorFrom: player.colorFrom,
			colorTo: player.colorTo,
			onRoster: true,
			currentRating: player.rating,
			gamesPlayed: 0,
			wins: 0,
			losses: 0,
		});
	}

	for (const entry of history) {
		for (const team of [entry.teamA, entry.teamB]) {
			for (const historyPlayer of team.players) {
				if (union.has(historyPlayer.id)) {
					continue;
				}
				union.set(historyPlayer.id, {
					id: historyPlayer.id,
					name: historyPlayer.name,
					colorFrom: OFF_ROSTER_COLOR_FROM,
					colorTo: OFF_ROSTER_COLOR_TO,
					onRoster: false,
					currentRating: 0,
					gamesPlayed: 0,
					wins: 0,
					losses: 0,
				});
			}
		}
	}

	return union;
}

/**
 * 依歷史紀錄逐筆加總出場數、勝場與敗場：該球員所屬隊伍與 `winner` 相同記勝場，
 * 不同記敗場（spec：SHALL NOT 出現第三種計數）。只累加到 `stats` 內另外配置的
 * MutableStat 物件，SHALL NOT 修改 `history` 本身或其中任何物件。
 */
function tallyGamesAndResults(
	stats: ReadonlyMap<string, MutableStat>,
	history: readonly MatchHistoryEntry[],
): void {
	for (const entry of history) {
		const sides = [
			{ winnerKey: "teamA" as const, team: entry.teamA },
			{ winnerKey: "teamB" as const, team: entry.teamB },
		];

		for (const { winnerKey, team } of sides) {
			for (const historyPlayer of team.players) {
				const stat = stats.get(historyPlayer.id);
				if (!stat) {
					continue;
				}
				stat.gamesPlayed += 1;
				if (entry.winner === winnerKey) {
					stat.wins += 1;
				} else {
					stat.losses += 1;
				}
			}
		}
	}
}

/** 出場數為 0 時勝率為 0，SHALL NOT 產生 NaN 或除以零的未定義結果（spec）。 */
function winRateOf(wins: number, gamesPlayed: number): number {
	if (gamesPlayed === 0) {
		return 0;
	}
	return wins / gamesPlayed;
}

/**
 * 計算每位球員的統計，範圍為「目前名單」與「歷史紀錄中出現過的球員」的聯集。
 * 純函式：SHALL NOT 修改輸入的 `history` 或 `players`。`ratingDelta`／
 * `mostFrequentPartner`／`mostFrequentOpponent` 為 §3／§4 補齊前的暫定值。
 */
export function computePlayerStats(
	history: readonly MatchHistoryEntry[],
	players: readonly Player[],
): PlayerStat[] {
	const union = buildRosterUnion(history, players);
	tallyGamesAndResults(union, history);

	return Array.from(union.values()).map((stat) => ({
		id: stat.id,
		name: stat.name,
		colorFrom: stat.colorFrom,
		colorTo: stat.colorTo,
		onRoster: stat.onRoster,
		currentRating: stat.currentRating,
		gamesPlayed: stat.gamesPlayed,
		wins: stat.wins,
		losses: stat.losses,
		winRate: winRateOf(stat.wins, stat.gamesPlayed),
		ratingDelta: 0,
		mostFrequentPartner: null,
		mostFrequentOpponent: null,
	}));
}
