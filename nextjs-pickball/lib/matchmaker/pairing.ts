// 單打配對與雙打組隊。純函式、不觸碰休息名單——本模組的簽章只接受「已決定的出場人員陣列」，
// 型別上就拿不到休息名單，確保強度配對不會意外更動出場／休息名單（PRD 5.3、design Decision 1）。
// 不 import candidates.ts，避免耦合到選人邏輯。

import type { DoublesComposition, Match, Team } from "./allocation-types";
import type { Player } from "./types";

// 依 rating 由高到低排序候選人員的複本，不修改輸入（輸入 MUST 被視為唯讀）。
function sortByRatingDesc(players: readonly Player[]): Player[] {
	return players.slice().sort((a, b) => b.rating - a.rating);
}

// 建立一支隊伍：隊伍分數為隊內成員 rating 的總和（單打即為該員 rating）。
// 單打／雙打共用同一份邏輯（tasks 3.3 refactor）。
function buildTeam(players: readonly Player[]): Team {
	return {
		players,
		rating: players.reduce((sum, p) => sum + p.rating, 0),
	};
}

/**
 * 單打配對：依 rating 排序後相鄰兩兩配對，使對戰雙方分數差距盡量接近（PRD 5.4）。
 * 每場兩隊、每隊 1 人，隊伍分數即該員 rating。
 */
export function pairSingles(playing: readonly Player[]): Match[] {
	const sorted = sortByRatingDesc(playing);
	const matches: Match[] = [];

	for (let i = 0; i + 2 <= sorted.length; i += 2) {
		matches.push({
			courtNumber: matches.length + 1,
			teams: [buildTeam([sorted[i]]), buildTeam([sorted[i + 1]])],
			format: "singles",
		});
	}

	return matches;
}

/**
 * 判定 4 人整場的雙打組成，純顯示用途，不參與選人或配對決策（PRD 5.5、13.3、15）。
 * 含任一 other 一律回傳 general；全為單一性別回傳對應男雙／女雙；男女皆有且無 other 回傳混雙。
 */
export function labelDoublesComposition(fourPlayers: readonly Player[]): DoublesComposition {
	if (fourPlayers.some((p) => p.gender === "other")) {
		return "general";
	}

	const hasMale = fourPlayers.some((p) => p.gender === "male");
	const hasFemale = fourPlayers.some((p) => p.gender === "female");

	if (hasMale && hasFemale) {
		return "mixed";
	}

	return hasMale ? "mens" : "womens";
}

/**
 * 雙打組隊：依 rating 由高到低排序後每 4 人一組，組內「最高＋最低」為第一隊、
 * 「第 2 高＋第 3 高」為第二隊，使兩隊總和分數盡量平衡（PRD 5.5）。
 * 每組事後以 labelDoublesComposition 標示組成（純顯示用途，不流回本函式的分組邏輯）。
 * 人數已於選人階段（§2）保證為 4 的倍數，但此處仍以 `i + 4 <= length` 防呆——
 * 剩餘不足 4 人的殘組會被略過，不產生殘缺隊伍，函式本身不因非預期長度而崩潰（tasks 4.3）。
 */
export function pairDoubles(playing: readonly Player[]): Match[] {
	const sorted = sortByRatingDesc(playing);
	const matches: Match[] = [];

	for (let i = 0; i + 4 <= sorted.length; i += 4) {
		const group = sorted.slice(i, i + 4);
		const [highest, second, third, lowest] = group;

		matches.push({
			courtNumber: matches.length + 1,
			teams: [buildTeam([highest, lowest]), buildTeam([second, third])],
			format: "doubles",
			doublesComposition: labelDoublesComposition(group),
		});
	}

	return matches;
}
