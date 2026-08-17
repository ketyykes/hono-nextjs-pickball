// 重複配對簽章、重複偵測與受限交換。純函式、決定性、不修改輸入——
// avoidRepeats 只能重排既有球員在場地／隊伍間的位置，型別上與邏輯上都拿不到「新增或移除球員」
// 的能力，確保 5.6 的迴避不會意外違反「不得改變出場與休息名單成員」的約束
// （design Decision 1、PRD 5.1、5.6）。

import type { Match, SignatureIndex, Team } from "./allocation-types";
import type { Player } from "./types";

// 隊內（同隊隊友）與隊間（交叉對手／完整比賽）分隔符，皆非 crypto.randomUUID() 會產生的字元，
// 不會與 id 本身的字元混淆（design Decision 4）。
const TEAMMATE_SEPARATOR = "|";
const OPPONENT_SEPARATOR = "#";

// 將一組 player id 以字典序排序後用指定分隔符串接——三個簽章函式共用的正規化核心，
// 確保簽章與球員列出的先後順序無關（tasks 6.4）。用內建 .sort()（依 UTF-16 code unit 比較）
// 而非 localeCompare：id 只是不透明字串，不需要語系排序，且能避開 CLAUDE.md 記錄過的
// locale-aware 排序在中文環境下不穩定的地雷。
function sortedJoin(ids: readonly string[], separator: string): string {
	return ids.slice().sort().join(separator);
}

// 一支隊伍的原始簽章：不論人數皆回傳。fullMatchKey 需要它——即使單打隊伍只有 1 人，
// 仍代表「這一側是誰」，與是否有隊友無關。teamTeammateSignature 在人數足夠時直接沿用本函式，
// 三個匯出的簽章函式（teammateKeys／opponentKeys／fullMatchKey）因此共用同一套 id
// 正規化邏輯（sortedJoin + 本函式），不各自重算一次（tasks 6.4 refactor）。
function teamRawSignature(team: Team): string {
	return sortedJoin(
		team.players.map((p) => p.id),
		TEAMMATE_SEPARATOR,
	);
}

// 一支隊伍的「隊友」簽章：僅隊伍人數 >= 2 時才有隊友概念可言。單打隊伍只有 1 人，
// 回傳 undefined 而非該員自己的 id——否則同一位球員只要打過任何一場單打，
// 之後所有涉及他的單打場次都會被誤判為「隊友重複」，使單打的重複迴避形同虛設。
function teamTeammateSignature(team: Team): string | undefined {
	if (team.players.length < 2) {
		return undefined;
	}
	return teamRawSignature(team);
}

/**
 * 同隊隊友組合簽章：每支隊伍一筆，僅隊伍人數 >= 2（雙打）時產生，單打隊伍無隊友可言故略過。
 * 回傳陣列已排序，與兩隊列出的先後順序、隊內排列順序皆無關（design Decision 4）。
 */
export function teammateKeys(match: Match): string[] {
	return match.teams
		.map(teamTeammateSignature)
		.filter((key): key is string => key !== undefined)
		.sort();
}

/**
 * 交叉對手組合簽章：兩隊球員兩兩配對（單打 1 筆、雙打 4 筆），每筆為排序後的兩個 id 串接。
 * 回傳陣列已排序，與兩隊列出的先後順序、隊內排列順序皆無關。
 */
export function opponentKeys(match: Match): string[] {
	const [teamA, teamB] = match.teams;
	const keys: string[] = [];

	for (const playerA of teamA.players) {
		for (const playerB of teamB.players) {
			keys.push(sortedJoin([playerA.id, playerB.id], OPPONENT_SEPARATOR));
		}
	}

	return keys.sort();
}

/**
 * 完整比賽組合簽章：兩支隊伍的原始簽章排序後以隊間分隔符串接，代表「這整場對戰」。
 * 與兩隊列出的先後順序、隊內排列順序皆無關。
 */
export function fullMatchKey(match: Match): string {
	const [teamA, teamB] = match.teams;
	const [first, second] = [teamRawSignature(teamA), teamRawSignature(teamB)].sort();
	return `${first}${OPPONENT_SEPARATOR}${second}`;
}

/** 由一組對戰建立簽章索引，供 countRepeats／avoidRepeats 比對歷史紀錄使用（tasks 6.3）。 */
export function buildSignatureIndex(matches: readonly Match[]): SignatureIndex {
	const teammateKeySet = new Set<string>();
	const opponentKeySet = new Set<string>();
	const fullMatchKeySet = new Set<string>();

	for (const match of matches) {
		for (const key of teammateKeys(match)) {
			teammateKeySet.add(key);
		}
		for (const key of opponentKeys(match)) {
			opponentKeySet.add(key);
		}
		fullMatchKeySet.add(fullMatchKey(match));
	}

	return {
		teammateKeys: teammateKeySet,
		opponentKeys: opponentKeySet,
		fullMatchKeys: fullMatchKeySet,
	};
}

// 單場對戰是否命中既有簽章索引：隊友、交叉對手、完整比賽三類任一命中即算重複
// （spec Requirement「重複配對迴避」：與歷史有相同隊友組合或相同交叉對手組合即判定為重複）。
// 第三道 fullMatchKeys 檢查為 defence-in-depth：可證明 full match key 命中時，雙打必同時
// 命中 teammateKeys、單打必同時命中 opponentKeys（兩隊球員集合相同 ⟹ 隊友與對手組合皆相同），
// 偵測力已被前兩者涵蓋（第 3 批 code review 以 5000 組隨機搜尋驗證 0 個「只靠 full 命中」的
// 反例）。索引本身仍依 spec 要求收三類簽章，此處保留檢查只為防禦性完整，不承擔額外偵測力。
function matchHitsSeen(match: Match, seen: SignatureIndex): boolean {
	if (teammateKeys(match).some((key) => seen.teammateKeys.has(key))) {
		return true;
	}
	if (opponentKeys(match).some((key) => seen.opponentKeys.has(key))) {
		return true;
	}
	return seen.fullMatchKeys.has(fullMatchKey(match));
}

/**
 * 回傳 matches 中與 seen 有重複命中的**場次數**（tasks 7.2）——是「有命中的場次數」，
 * 不是「命中次數」：一場對戰即使同時命中隊友與對手兩類簽章，仍只計 1（見
 * duplication.test.ts「一場同時命中隊友與對手組合仍只算一次重複」）。
 *
 * 這個計數語意是 `avoidRepeats` 對「完全重複的雙打場次」束手無策的已知盲點（非 bug，design
 * 「不追求全域最優」的明文取捨）：單次交換通常只能拆掉一支隊伍，另一支隊伍的隊友簽章仍命中，
 * 「有命中的場次數」因而不變，`avoidRepeats` 的嚴格 `repeats < current.repeats` 判準會拒絕該
 * 交換——即使場上可能存在能讓 repeats／spread 同時歸零的其他重排方式，貪婪逐步改善法也不會
 * 找到（第 3 批 code review 已用 3000 組隨機情境實測反例，記錄於
 * `.claude/agent-memory/code-reviewer-readonly/project_matchmaker_allocation_engine.md`）。
 */
export function countRepeats(matches: readonly Match[], seen: SignatureIndex): number {
	return matches.filter((match) => matchHitsSeen(match, seen)).length;
}

// PRD 的 rating 為兩位小數（1.00～8.00），Team.rating 是隊內成員 rating 的 reduce 加總，
// 浮點加總可能產生極小誤差（例如 1.1 + 2.2 在 IEEE754 下得到 3.3000000000000003，
// 而非數學上相等的 1.0 + 2.3 = 3.3）。avoidRepeats 的採納條件是「調整後總和 <= 調整前總和」，
// 若直接比較原始浮點數，數學上相等的兩個總和可能因誤差落在浮點數的相鄰刻度而被誤判為
// 「變大」，導致本該接受的零成本交換被錯誤拒絕——且只在名單恰好湊出這類數字時才會出現，
// 整數 fixture 測不出來，上線後在特定名單上才會偶發冒出。
// 因此把每支隊伍的分數先四捨五入到「分」（rating 的百分位）再取整數差，
// 讓大小比較建立在整數運算上，徹底避開浮點雜訊（見 duplication.test.ts 的「ratingSpread 的浮點誤差防護」）。
const CENTS_PER_RATING_UNIT = 100;

function toRatingCents(rating: number): number {
	return Math.round(rating * CENTS_PER_RATING_UNIT);
}

/** 強度差距：單打為每場雙方 rating 差絕對值總和，雙打為每場兩隊總和差絕對值總和（design Decision 5）。 */
export function ratingSpread(matches: readonly Match[]): number {
	const totalCents = matches.reduce((sum, match) => {
		const [teamA, teamB] = match.teams;
		return sum + Math.abs(toRatingCents(teamA.rating) - toRatingCents(teamB.rating));
	}, 0);

	return totalCents / CENTS_PER_RATING_UNIT;
}

// ---- 受限交換（avoidRepeats，design Decision 6） ----

// 一名球員在對戰陣列中的位置：場次索引、隊伍索引（0 或 1）、隊內索引。
// 用位置而非球員參照，讓 swapPlayers 每次都從「當下」的 matches 讀取球員，
// 使多輪試探可以疊加（後一次交換看得到前一次交換的結果）。
interface Slot {
	readonly matchIndex: number;
	readonly teamIndex: 0 | 1;
	readonly playerIndex: number;
}

function playerAt(matches: readonly Match[], slot: Slot): Player {
	return matches[slot.matchIndex].teams[slot.teamIndex].players[slot.playerIndex];
}

// 重建單一場次：把 teamIndex／playerIndex 位置的球員換成 replacement，重新計算該隊分數。
// 注意：雙打場次的 doublesComposition 是純顯示標示，換人後可能不再符合新組成；
// 本函式維持原標示不變——依 design Decision 1 的職責邊界，duplication.ts 只負責「重排既有
// 球員」，不重新推導顯示用標示，該標示已由 allocation.ts 在串接 avoidRepeats 之後重算
// （見該檔 relabelDoublesComposition）。
function rebuildMatch(match: Match, teamIndex: 0 | 1, playerIndex: number, replacement: Player): Match {
	const players = match.teams[teamIndex].players.slice();
	players[playerIndex] = replacement;
	const sum = players.reduce((total, p) => total + p.rating, 0);
	// 與 pairing.ts 的 buildTeam 採同一四捨五入慣例（design Decision 5 的註解、tasks 回顧
	// 記錄）：PRD 的 rating 為兩位小數，浮點加總在十進位小數上會有誤差（如 2.01 + 1.01
	// 在 IEEE754 下得到 3.0199999999999996，而非數學上相等的 3.02）。若本函式不四捨五入，
	// 「被交換過的隊伍」會帶浮點雜訊、「未被交換的隊伍」乾淨，兩者一起被第 3 段寫進
	// LocalStorage 時表示法不一致（見 duplication.test.ts「交換後的隊伍分數與直接配對產生的
	// 隊伍分數表示一致」）。
	const rebuiltTeam: Team = { players, rating: Math.round(sum * 100) / 100 };
	const teams: [Team, Team] = teamIndex === 0 ? [rebuiltTeam, match.teams[1]] : [match.teams[0], rebuiltTeam];

	return { ...match, teams };
}

// 交換兩個位置上的球員，回傳新的 matches 陣列（不修改輸入）。slotA／slotB 可以同場次
// （隊內換隊友）或不同場次（跨場地換人）——rebuildMatch 兩次呼叫皆從「當下」陣列讀取，
// 故同場次時第二次呼叫會疊加在第一次的結果上，正確完成雙邊交換。
function swapPlayers(matches: readonly Match[], slotA: Slot, slotB: Slot): Match[] {
	const playerA = playerAt(matches, slotA);
	const playerB = playerAt(matches, slotB);

	const next = matches.slice();
	next[slotA.matchIndex] = rebuildMatch(next[slotA.matchIndex], slotA.teamIndex, slotA.playerIndex, playerB);
	next[slotB.matchIndex] = rebuildMatch(next[slotB.matchIndex], slotB.teamIndex, slotB.playerIndex, playerA);

	return next;
}

function slotsOfMatch(matches: readonly Match[], matchIndex: number): Slot[] {
	const slots: Slot[] = [];
	for (const teamIndex of [0, 1] as const) {
		const { players } = matches[matchIndex].teams[teamIndex];
		for (let playerIndex = 0; playerIndex < players.length; playerIndex++) {
			slots.push({ matchIndex, teamIndex, playerIndex });
		}
	}
	return slots;
}

// 階段①：跨場地換人。列舉所有相異場次配對（依場次索引遞增），各自的所有位置做笛卡兒積——
// 掃描順序固定，確保決定性（design Decision 6、tasks 7.7）。
function crossCourtSwapCandidates(matches: readonly Match[]): Array<readonly [Slot, Slot]> {
	const pairs: Array<readonly [Slot, Slot]> = [];

	for (let matchIndexA = 0; matchIndexA < matches.length; matchIndexA++) {
		for (let matchIndexB = matchIndexA + 1; matchIndexB < matches.length; matchIndexB++) {
			const slotsA = slotsOfMatch(matches, matchIndexA);
			const slotsB = slotsOfMatch(matches, matchIndexB);
			for (const slotA of slotsA) {
				for (const slotB of slotsB) {
					pairs.push([slotA, slotB]);
				}
			}
		}
	}

	return pairs;
}

// 階段②：交換隊伍內隊友。同一場次內，team0 與 team1 的球員兩兩配對——
// 單打每隊只有 1 人，交換等同互換隊伍標籤，簽章與分數皆不變，不會被採納（自然無害）。
function intraTeamSwapCandidates(matches: readonly Match[]): Array<readonly [Slot, Slot]> {
	const pairs: Array<readonly [Slot, Slot]> = [];

	matches.forEach((match, matchIndex) => {
		const team0Slots = match.teams[0].players.map((_, playerIndex) => ({ matchIndex, teamIndex: 0 as const, playerIndex }));
		const team1Slots = match.teams[1].players.map((_, playerIndex) => ({ matchIndex, teamIndex: 1 as const, playerIndex }));
		for (const slotA of team0Slots) {
			for (const slotB of team1Slots) {
				pairs.push([slotA, slotB]);
			}
		}
	});

	return pairs;
}

function compareSlot(a: Slot, b: Slot): number {
	return a.matchIndex - b.matchIndex || a.teamIndex - b.teamIndex || a.playerIndex - b.playerIndex;
}

// 階段③：相鄰強度重排。把所有位置依球員 rating 由低到高排序（同分時以位置排序做 tiebreaker
// 確保決定性），只嘗試在排序後「相鄰」的兩個位置間交換——強度越接近的兩人互換，
// 對強度差距總和的影響通常越小，用來補齊前兩階段沒試到、但成本可能很低的交換。
function adjacentStrengthSwapCandidates(matches: readonly Match[]): Array<readonly [Slot, Slot]> {
	const allSlots: Slot[] = [];
	matches.forEach((_, matchIndex) => {
		allSlots.push(...slotsOfMatch(matches, matchIndex));
	});

	const sorted = allSlots
		.map((slot) => ({ slot, rating: playerAt(matches, slot).rating }))
		.sort((x, y) => x.rating - y.rating || compareSlot(x.slot, y.slot));

	const pairs: Array<readonly [Slot, Slot]> = [];
	for (let i = 0; i + 1 < sorted.length; i++) {
		pairs.push([sorted[i].slot, sorted[i + 1].slot]);
	}

	return pairs;
}

interface TrialState {
	readonly matches: Match[];
	readonly repeats: number;
	readonly spread: number;
}

// 試探並回退的共用結構（tasks 7.7）：依序嘗試每個候選交換，只在「重複數下降且強度差距
// 總和未增加」時採納，否則捨棄該候選、狀態不變（design Decision 6）。三個階段共用本函式，
// 避免各自重寫一份試探迴圈。
function runStage(state: TrialState, seen: SignatureIndex, candidates: Array<readonly [Slot, Slot]>): TrialState {
	let current = state;

	for (const [slotA, slotB] of candidates) {
		const candidateMatches = swapPlayers(current.matches, slotA, slotB);
		const repeats = countRepeats(candidateMatches, seen);
		const spread = ratingSpread(candidateMatches);

		if (repeats < current.repeats && spread <= current.spread) {
			current = { matches: candidateMatches, repeats, spread };
		}
	}

	return current;
}

/**
 * 受限交換：依 5.6 三階段依序試探（跨場地換人 → 隊內換隊友 → 相鄰強度重排），
 * 只重排既有球員在場地／隊伍間的位置，無法新增或移除任何人——出場名單成員在調整前後
 * 完全相同（PRD 5.1 優先序的核心承諾）。人數過少或無交換可行時，三階段皆不產生任何
 * 可被採納的候選，回傳與輸入相同的對戰組合，照常接受重複（tasks 7.5、7.6）。
 */
export function avoidRepeats(matches: readonly Match[], seen: SignatureIndex): Match[] {
	let state: TrialState = {
		matches: matches.slice(),
		repeats: countRepeats(matches, seen),
		spread: ratingSpread(matches),
	};

	state = runStage(state, seen, crossCourtSwapCandidates(state.matches));
	state = runStage(state, seen, intraTeamSwapCandidates(state.matches));
	state = runStage(state, seen, adjacentStrengthSwapCandidates(state.matches));

	return state.matches;
}
