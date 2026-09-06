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

/**
 * 累加階段用的可變狀態，累加完成後才轉成對外的 `PlayerStat`。不含
 * `mostFrequentPartner`／`mostFrequentOpponent`——這兩欄不是逐筆累加值，而是
 * `computePlayerStats` 最後從獨立的配對計數（`tallyPairs`）另行解析後併入。
 */
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
	ratingDelta: number;
}

/**
 * 從一組帶有 `playedAt` 的候選中，取出 `playedAt` 最晚者所對應的值。比較採
 * ISO 8601 字串字典序（design Decision 4），SHALL NOT 用 `new Date()` 解析。
 * 完整掃描全部候選而非只看陣列最後一個元素，結果因此不依賴呼叫端傳入的排列
 * 順序——供本檔目前強度計算與 §4 的最常搭檔／最常對手姓名解析共用同一份邏輯。
 *
 * `playedAt` 完全相同的兩筆候選視為不可區分、取先遇者（陣列中在前者）——
 * 這是已知且可接受的行為，不另加同 `playedAt` 的 tie-break：實務上同一位球員
 * 不會在完全相同的時間戳同時出現在兩筆不同紀錄中，加一層 tie-break 換來的
 * 確定性在此不具實質意義（§3→§4 交棒事項 2，擇一採此文件化方案）。
 */
function pickValueAtLatestPlayedAt<T>(candidates: readonly { playedAt: string; value: T }[]): T | undefined {
	let latest: { playedAt: string; value: T } | undefined;
	for (const candidate of candidates) {
		if (!latest || candidate.playedAt > latest.playedAt) {
			latest = candidate;
		}
	}
	return latest?.value;
}

/**
 * 依歷史紀錄逐筆收集每位球員的候選值，供 `pickValueAtLatestPlayedAt` 取最近一筆。
 * `latestRatingAfterByPlayer`（取 `ratingAfter`）與 `latestNameByPlayer`（取姓名
 * 快照）共用同一套「先建 `Map<id, candidates[]>` 再逐一取值」骨架，避免抄第三份
 * 幾乎相同的收集迴圈（§3→§4 交棒事項 1）。
 */
function collectCandidatesByPlayer<T>(
	history: readonly MatchHistoryEntry[],
	valueOf: (historyPlayer: MatchHistoryEntry["teamA"]["players"][number]) => T,
): Map<string, { playedAt: string; value: T }[]> {
	const result = new Map<string, { playedAt: string; value: T }[]>();
	for (const entry of history) {
		for (const team of [entry.teamA, entry.teamB]) {
			for (const historyPlayer of team.players) {
				const candidates = result.get(historyPlayer.id) ?? [];
				candidates.push({ playedAt: entry.playedAt, value: valueOf(historyPlayer) });
				result.set(historyPlayer.id, candidates);
			}
		}
	}
	return result;
}

/**
 * 已離開名單球員的目前強度：其在 `history` 中依 `playedAt` 最近一筆的
 * `ratingAfter`（spec「目前強度與已離開名單球員的標示」）。名單內球員的目前強度
 * 一律直接取自 `players` 的 `rating`，不經過本函式。
 */
function latestRatingAfterByPlayer(history: readonly MatchHistoryEntry[]): Map<string, number> {
	const candidatesByPlayer = collectCandidatesByPlayer(history, (historyPlayer) => historyPlayer.ratingAfter);

	const result = new Map<string, number>();
	for (const [id, candidates] of candidatesByPlayer) {
		const latest = pickValueAtLatestPlayedAt(candidates);
		if (latest !== undefined) {
			result.set(id, latest);
		}
	}
	return result;
}

/**
 * 依歷史紀錄逐筆解析每位球員最近一次出現的姓名快照，供最常搭檔／最常對手的顯示
 * 姓名解析共用（design Decision 4：以 `playedAt` 明確比較，不依賴輸入陣列排列順序，
 * 沿用 `pickValueAtLatestPlayedAt` 同一份比較邏輯，§3.5 交棒事項 1）。
 */
function latestNameByPlayer(history: readonly MatchHistoryEntry[]): Map<string, string> {
	const candidatesByPlayer = collectCandidatesByPlayer(history, (historyPlayer) => historyPlayer.name);

	const result = new Map<string, string>();
	for (const [id, candidates] of candidatesByPlayer) {
		const latest = pickValueAtLatestPlayedAt(candidates);
		if (latest !== undefined) {
			result.set(id, latest);
		}
	}
	return result;
}

/**
 * 依歷史紀錄逐筆計數「自己 id → 對象 id」的配對次數，建立
 * `Map<selfId, Map<counterpartId, count>>`。最常搭檔（同隊隊友）與最常對手
 * （對方隊伍球員）共用同一套計數骨架，差異只在 `extractPairs` 如何從一筆歷史紀錄
 * 產生配對——SHALL NOT 為兩者各寫一份幾乎相同的迴圈（tasks 4.4）。
 */
function tallyPairs(
	history: readonly MatchHistoryEntry[],
	extractPairs: (entry: MatchHistoryEntry) => readonly (readonly [selfId: string, counterpartId: string])[],
): Map<string, Map<string, number>> {
	const result = new Map<string, Map<string, number>>();
	for (const entry of history) {
		for (const [selfId, counterpartId] of extractPairs(entry)) {
			const counts = result.get(selfId) ?? new Map<string, number>();
			counts.set(counterpartId, (counts.get(counterpartId) ?? 0) + 1);
			result.set(selfId, counts);
		}
	}
	return result;
}

/**
 * 從一筆歷史紀錄取出「搭檔」配對：僅雙打紀錄計入（spec：最常搭檔 MUST 由雙打歷史
 * 紀錄計數），同隊除自己外的每位隊友各自成對一次，單打隊伍（人數 < 2）自然不會
 * 產生任何配對。
 */
function extractPartnerPairs(entry: MatchHistoryEntry): readonly (readonly [string, string])[] {
	if (entry.format !== "doubles") {
		return [];
	}
	const pairs: [string, string][] = [];
	for (const team of [entry.teamA, entry.teamB]) {
		for (const player of team.players) {
			for (const teammate of team.players) {
				if (teammate.id === player.id) {
					continue;
				}
				pairs.push([player.id, teammate.id]);
			}
		}
	}
	return pairs;
}

/**
 * 從一筆歷史紀錄取出「對手」配對：單打與雙打皆計入（spec：最常對手 MUST 涵蓋
 * 單打與雙打兩種來源）。雙向各自產生配對——己方隊伍每位球員對上對方隊伍每位球員，
 * 兩隊都要輪流當「自己」，否則只從其中一隊的視角計數會漏掉另一隊球員的對手紀錄。
 */
function extractOpponentPairs(entry: MatchHistoryEntry): readonly (readonly [string, string])[] {
	const pairs: [string, string][] = [];
	const sides = [
		{ self: entry.teamA, opponent: entry.teamB },
		{ self: entry.teamB, opponent: entry.teamA },
	];
	for (const { self, opponent } of sides) {
		for (const player of self.players) {
			for (const opponentPlayer of opponent.players) {
				pairs.push([player.id, opponentPlayer.id]);
			}
		}
	}
	return pairs;
}

/**
 * 從「對象 id → 出現次數」的計數中取出次數最多者的姓名；次數相同時依姓名 UTF-16
 * code unit 排序取序位在前者（design Decision 5，SHALL NOT 用 `localeCompare`），
 * SHALL NOT 依 `Map` 迭代順序決定。找不到任何對象時回傳 `null`——不是空字串
 * （design Decision 2）。`nameById` 找不到對應姓名的 id 視為資料不一致並略過：
 * 在合法輸入下不會發生，因為 `counts` 的 key 必然來自同一份 `history`。
 */
function pickMostFrequentName(counts: ReadonlyMap<string, number>, nameById: ReadonlyMap<string, string>): string | null {
	let bestId: string | undefined;
	let bestCount = -Infinity;
	let bestName = "";

	for (const [id, count] of counts) {
		const name = nameById.get(id);
		if (name === undefined) {
			continue;
		}
		if (count > bestCount || (count === bestCount && name < bestName)) {
			bestId = id;
			bestCount = count;
			bestName = name;
		}
	}

	return bestId === undefined ? null : bestName;
}

/**
 * 建立「目前名單」與「歷史紀錄中出現過的球員」的聯集初始項目，以 id 為鍵
 * （spec：SHALL NOT 以姓名為鍵）。名單內球員的姓名、色塊、目前強度取自 `players`；
 * 只出現在歷史的球員以其快照姓名暫代、色塊為上方的中性灰，目前強度取
 * `latestRatingAfterByPlayer` 算出的最近一筆 `ratingAfter`，並標示 `onRoster: false`。
 * 整段聯集只在這裡建構一次，供後續累加沿用，不在 §4 重新掃描 history／players
 * （tasks 2.7）。
 */
function buildRosterUnion(
	history: readonly MatchHistoryEntry[],
	players: readonly Player[],
): Map<string, MutableStat> {
	const union = new Map<string, MutableStat>();
	const offRosterCurrentRatings = latestRatingAfterByPlayer(history);

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
			ratingDelta: 0,
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
					currentRating: offRosterCurrentRatings.get(historyPlayer.id) ?? 0,
					gamesPlayed: 0,
					wins: 0,
					losses: 0,
					ratingDelta: 0,
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
 * 依歷史紀錄逐筆加總每位球員的強度淨變化（Σ(ratingAfter − ratingBefore)），
 * 出場數為 0 者不會進入這個迴圈、維持 `MutableStat` 初始的 0（spec）。與
 * `tallyGamesAndResults` 分開累加：兩者語意獨立，淨變化不受勝負影響。
 */
function tallyRatingDelta(stats: ReadonlyMap<string, MutableStat>, history: readonly MatchHistoryEntry[]): void {
	for (const entry of history) {
		for (const team of [entry.teamA, entry.teamB]) {
			for (const historyPlayer of team.players) {
				const stat = stats.get(historyPlayer.id);
				if (!stat) {
					continue;
				}
				stat.ratingDelta += historyPlayer.ratingAfter - historyPlayer.ratingBefore;
			}
		}
	}
}

/**
 * 排行榜排序比較器：目前強度 desc → 勝率 desc → 出場數 desc → 姓名（UTF-16
 * code unit）asc（spec「排行榜排序規則」）。集中成單一具名函式，避免排序邏輯
 * 散落在 `.sort()` 呼叫內、不易獨立對每一層的比較方向各自測試（tasks 4.7）。
 */
function comparePlayerStatsForRanking(a: PlayerStat, b: PlayerStat): number {
	if (a.currentRating !== b.currentRating) {
		return b.currentRating - a.currentRating;
	}
	if (a.winRate !== b.winRate) {
		return b.winRate - a.winRate;
	}
	if (a.gamesPlayed !== b.gamesPlayed) {
		return b.gamesPlayed - a.gamesPlayed;
	}
	if (a.name < b.name) {
		return -1;
	}
	if (a.name > b.name) {
		return 1;
	}
	return 0;
}

/**
 * 計算每位球員的統計，範圍為「目前名單」與「歷史紀錄中出現過的球員」的聯集。
 * 純函式：SHALL NOT 修改輸入的 `history` 或 `players`。回傳結果已依排行榜排序規則
 * 排序（目前強度 → 勝率 → 出場數 → 姓名），呼叫端不需再另行排序。
 */
export function computePlayerStats(
	history: readonly MatchHistoryEntry[],
	players: readonly Player[],
): PlayerStat[] {
	const union = buildRosterUnion(history, players);
	tallyGamesAndResults(union, history);
	tallyRatingDelta(union, history);

	const nameById = latestNameByPlayer(history);
	const partnerTally = tallyPairs(history, extractPartnerPairs);
	const opponentTally = tallyPairs(history, extractOpponentPairs);

	const result = Array.from(union.values()).map((stat) => ({
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
		ratingDelta: stat.ratingDelta,
		mostFrequentPartner: pickMostFrequentName(partnerTally.get(stat.id) ?? new Map(), nameById),
		mostFrequentOpponent: pickMostFrequentName(opponentTally.get(stat.id) ?? new Map(), nameById),
	}));

	return result.sort(comparePlayerStatsForRanking);
}
