// 色塊版面推導——由一場對戰算出每格屬於哪一隊、位於第幾列第幾欄的純函式，
// 不挾帶 React 節點（design Decision 2）。雙打採「上排第一隊、下排第二隊」而非對角，
// 理由見 design Decision 4：上下分排 + 中央比分區才有球場感，對角配置需要讀者先知道
// 「對角同色是一隊」這條額外規則，違反色彩不可作為唯一資訊來源的精神。

import type { MatchFormat } from "./allocation-types";
import type { Player } from "./types";

/** buildCourtTiles 單支隊伍所需的最小形狀，供 CourtTileSource 與 expandTeamToTiles 共用。 */
export interface CourtTileTeamSource {
	readonly players: readonly Player[];
}

/**
 * buildCourtTiles 的輸入型別，結構型別而非直接用 allocation-types 的 Match：
 * CourtCard 拿到的是 RoundMatch（teams[].playerIds），把它回填成完整 Match 需要偽造
 * doublesComposition（RoundMatch 為 optional、Match 的 doubles 分支為必填），是靜默補值。
 * 放寬為只要求 format 與 teams[].players，allocation-types 的 Match 可直接指派，
 * 呼叫端則傳入由 playerIds 解析後的隊伍（design Open Questions 2c）。
 */
export interface CourtTileSource {
	readonly format: MatchFormat;
	readonly teams: readonly [CourtTileTeamSource, CourtTileTeamSource];
}

/** 一個色塊：所屬球員、隊伍索引與版面座標。 */
export interface CourtTile {
	readonly player: Player;
	readonly teamIndex: 0 | 1;
	readonly row: number;
	readonly column: number;
}

// 由一支隊伍展開為 tile：單打與雙打共用，差異只在於呼叫端給的 row 與 columnOffset——
// 單打兩隊各一人、以 columnOffset 區分左右；雙打同隊兩人以 columnOffset 固定為 0、
// 靠隊內索引展開出 column 0／1。
function expandTeamToTiles(
	team: CourtTileTeamSource,
	teamIndex: 0 | 1,
	row: number,
	columnOffset: number,
): CourtTile[] {
	return team.players.map((player, index) => ({
		player,
		teamIndex,
		row,
		column: columnOffset + index,
	}));
}

export function buildCourtTiles(match: CourtTileSource): CourtTile[] {
	const [teamA, teamB] = match.teams;

	if (match.format === "singles") {
		return [
			...expandTeamToTiles(teamA, 0, 0, 0),
			...expandTeamToTiles(teamB, 1, 0, 1),
		];
	}

	return [
		...expandTeamToTiles(teamA, 0, 0, 0),
		...expandTeamToTiles(teamB, 1, 1, 0),
	];
}
