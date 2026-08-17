// 單打配對與雙打組隊。純函式、不觸碰休息名單——本模組的簽章只接受「已決定的出場人員陣列」，
// 型別上就拿不到休息名單，確保強度配對不會意外更動出場／休息名單（PRD 5.3、design Decision 1）。
// 不 import candidates.ts，避免耦合到選人邏輯。

import { PLAYERS_PER_MATCH } from "./allocation-types";
import type { DoublesComposition, Match, Team } from "./allocation-types";
import type { Player } from "./types";

// 依 rating 由高到低排序候選人員的複本，不修改輸入（輸入 MUST 被視為唯讀）。
function sortByRatingDesc(players: readonly Player[]): Player[] {
	return players.slice().sort((a, b) => b.rating - a.rating);
}

// 建立一支隊伍：隊伍分數為隊內成員 rating 的總和（單打即為該員 rating）。
// 單打／雙打共用同一份邏輯（tasks 3.3 refactor）。
function buildTeam(players: readonly Player[]): Team {
	const sum = players.reduce((total, p) => total + p.rating, 0);

	return {
		players,
		// 浮點加總在十進位小數上會有誤差（如 2.02 + 1.01 與 2.01 + 1.01 兩者數學上都是 3.03，
		// 但直接 reduce 可能得到 3.0299999999999994 之類的值），故就近四捨五入至小數第 2 位，
		// 與 roster.ts 的 roundRating 慣例一致。這裡不能省略：Match 會被第 3 段持久化進
		// LocalStorage，且 design Decision 5 的 ratingSpread(調整後) <= ratingSpread(調整前)
		// 比較若混入浮點噪音，會讓數學上相等的比較被誤判為 >，等同悄悄退化成 < 的行為。
		rating: Math.round(sum * 100) / 100,
	};
}

/**
 * 單打配對：依 rating 排序後相鄰兩兩配對，使對戰雙方分數差距盡量接近（PRD 5.4）。
 * 每場兩隊、每隊 1 人，隊伍分數即該員 rating。
 * courtNumber 僅為初值（依配對順序 1 起算），allocateRound 會在重複迴避完成後覆寫
 * 為最終的場地編號，本函式的編號不是最終結果（tasks 8.2）。
 */
export function pairSingles(playing: readonly Player[]): Match[] {
	const sorted = sortByRatingDesc(playing);
	const matches: Match[] = [];
	const perMatch = PLAYERS_PER_MATCH.singles;

	for (let i = 0; i + perMatch <= sorted.length; i += perMatch) {
		matches.push({
			courtNumber: i / perMatch + 1,
			teams: [buildTeam([sorted[i]]), buildTeam([sorted[i + 1]])],
			format: "singles",
		});
	}

	return matches;
}

/**
 * 判定 4 人整場的雙打組成，純顯示用途，不參與選人或配對決策（PRD 5.5、13.3、15）。
 * 含任一 other 一律回傳 general；全為單一性別回傳對應男雙／女雙；男女皆有且無 other 回傳混雙。
 * 簽章刻意收緊為固定 4 元素 tuple（而非 readonly Player[]）：此函式判定的對象是整場 4 人，
 * 不是單一隊伍（2 人），型別上就擋掉誤傳單一 Team.players 或空陣列這類「看起來合理但錯誤」
 * 的呼叫（design Decision 1 的哲學——規格約束凡是型別做得到的就該用型別做）。
 */
export function labelDoublesComposition(fourPlayers: readonly [Player, Player, Player, Player]): DoublesComposition {
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
 * 人數已於選人階段（§2）保證為 4 的倍數，但此處仍以 `i + perMatch <= length` 防呆——
 * 剩餘不足 4 人的殘組會被略過，不產生殘缺隊伍，函式本身不因非預期長度而崩潰（tasks 4.3）。
 * courtNumber 僅為初值，allocateRound 會在重複迴避完成後覆寫（tasks 8.2，同 pairSingles）。
 */
export function pairDoubles(playing: readonly Player[]): Match[] {
	const sorted = sortByRatingDesc(playing);
	const matches: Match[] = [];
	const perMatch = PLAYERS_PER_MATCH.doubles;

	for (let i = 0; i + perMatch <= sorted.length; i += perMatch) {
		// 解構後以字面陣列重組成 tuple 傳給 labelDoublesComposition：sorted.slice() 的回傳型別是
		// Player[]（長度不受型別約束），但迴圈條件已保證此處恰為 4 人，直接傳字面陣列讓 TS
		// 依呼叫端的 tuple 參數型別做 contextual typing，不需另外斷言。
		const [highest, second, third, lowest] = sorted.slice(i, i + perMatch);

		matches.push({
			courtNumber: i / perMatch + 1,
			teams: [buildTeam([highest, lowest]), buildTeam([second, third])],
			format: "doubles",
			doublesComposition: labelDoublesComposition([highest, second, third, lowest]),
		});
	}

	return matches;
}
