import { createInitialState } from "../scoreboard/reducer";
import { readMatchSlot, writeMatchSlot, clearMatchSlots } from "../scoreboard/match-slots";
import type { MatchSlots } from "../scoreboard/match-slots";
import type { PlayerBadge, ScoreboardState, TeamPlayers } from "../scoreboard/types";
import type { Round, RoundMatch } from "./round-types";
import type { SubmitScoreInput } from "./round";
import { pickTextColor } from "./colors";
import type { Player } from "./types";

// 名單中找不到該球員時的替代文字（design Decision 3：呈現替代文字，不跳過、不拋錯）。
// 與 export-scene.ts「名單中找不到球員時以替代文字呈現」的既有判斷同構，但兩個
// capability 各自獨立實作、不跨檔 import——export-scene.ts 的常數為 module-private，
// 這裡重新宣告同一組字面量（沿用其措辭與色碼慣例，見 spec「隊伍球員顯示資訊」）。
const MISSING_PLAYER_NAME = "已離開名單";

// 替代文字球員的中性色（灰階），與真實球員的漸層調色盤區隔，一眼可辨識該格是佔位。
const PLACEHOLDER_COLOR_FROM = "#9CA3AF";
const PLACEHOLDER_COLOR_TO = "#4B5563";

/**
 * 把單一隊伍的 playerIds 解析為球員顯示資訊陣列（design Decision 1／3）：查得到時取該員
 * name／colorFrom／colorTo，查不到時（該員已被移除）以固定替代文字與中性色呈現——
 * SHALL NOT 跳過該筆，跳過會讓雙打面板變成一人一格（見 spec）。foreground 一律由
 * pickTextColor 依 colorFrom／colorTo 算好存入，scoreboard 端只讀不算，藉此維持
 * lib/scoreboard/ 不 import lib/matchmaker/ 的單向相依（design Decision 1）。
 *
 * ⚠️ 與 components/matchmaker/CourtCard.tsx、lib/matchmaker/round.ts 內同名的
 * `resolveTeamPlayers`（兩者皆「查無此人就跳過」）行為相反，這是 design Decision 3
 * 明文接受的不一致：對戰頁色塊的 row／column 是離散格位，缺一格比多一格佔位更貼近
 * 版面推導的資料形狀；計分板面板沒有這層版面約束，少一筆反而會讓雙打看起來像單打。
 * 複製那兩個函式的假設到這裡會直接違反 spec，反之亦然。
 */
function resolvePlayerBadges(
	playerIds: readonly string[],
	players: readonly Player[],
): PlayerBadge[] {
	return playerIds.map((playerId) => {
		const player = players.find((candidate) => candidate.id === playerId);
		const colorFrom = player?.colorFrom ?? PLACEHOLDER_COLOR_FROM;
		const colorTo = player?.colorTo ?? PLACEHOLDER_COLOR_TO;
		return {
			name: player?.name ?? MISSING_PLAYER_NAME,
			colorFrom,
			colorTo,
			foreground: pickTextColor(colorFrom, colorTo),
		};
	});
}

/**
 * 把該場的兩隊 playerIds 組成 teamPlayers：第一隊 ↔ us、第二隊 ↔ them，
 * 與 mapTeamScores 的隊伍對應同構，SHALL NOT 在兩處各自寫一份。
 *
 * 命名刻意不叫 `resolveTeamPlayers`：`round.ts` 與 `CourtCard.tsx` 已各有一個同名私有
 * 函式，其契約是 `(playerIds, players) => Player[]`（且查無此人就跳過）；本函式吃的是
 * 整個 `match`、產出的是 us／them 兩側的 PlayerBadge 結構，與那個契約不同，沿用同名會讓
 * 讀者把「跳過」的假設一併帶進來。`build` 前綴同 buildMatchSlotSeed／buildCourtTiles。
 */
function buildTeamPlayers(match: RoundMatch, players: readonly Player[]): TeamPlayers {
	const [teamA, teamB] = match.teams;
	return {
		us: resolvePlayerBadges(teamA.playerIds, players),
		them: resolvePlayerBadges(teamB.playerIds, players),
	};
}

/**
 * 建立場地區塊「進入計分板」入口所需的 seed：帶入該輪的目標分數與對戰方式，
 * 分數與 history 一律自 0-0、空白起手（見 spec「場地區塊的計分板入口」）。
 *
 * courtNumber 取自 match.courtNumber（唯一決定處）：計分板 SHALL NOT 反查
 * matchmaker:round:v1 來取得場地標示，seed 建立當下就是它唯一的資料來源。
 *
 * players 為必填（design Decision 4）：唯一的生產呼叫點（CourtCard.tsx）本來就已經
 * 持有 players prop，沒有合法情境需要省略——optional 只會讓「忘記傳」從編譯期錯誤
 * 退化成執行期的靜默降級。round 僅保存球員 id，姓名與雙色漸層須由此參數解析。
 */
export function buildMatchSlotSeed(
	round: Round,
	match: RoundMatch,
	players: readonly Player[],
): ScoreboardState & { matchId: string } {
	return {
		...createInitialState({
			mode: round.format,
			targetScore: round.targetScore,
			teamPlayers: buildTeamPlayers(match, players),
		}),
		// matchId 只在這裡決定一次：createInitialState 的 matchId 型別為 string | null，
		// 在此覆寫同時完成型別窄化，故不再重複傳進 overrides——兩處寫同一件事會分歧。
		matchId: match.id,
		courtNumber: match.courtNumber,
	};
}

/**
 * 確保該場次的計分板槽存在：已有條目時原樣回傳、SHALL NOT 覆蓋既有進度
 * （覆蓋會讓「未完成的計分進度可離開後再進入接續」靜默失效，見 spec 的 SHALL NOT 條款）。
 *
 * 只收 seed 一個參數、槽位由 seed.matchId 推導：另傳一個 matchId 參數會讓
 * matchId !== seed.matchId 成為可能的靜默失效（讀甲場的槽卻寫入乙場的 seed），
 * 與 match-slots.ts 對 writeMatchSlot 的收斂同一理由。
 */
export function ensureMatchSlot(
	seed: ScoreboardState & { matchId: string },
): ScoreboardState & { matchId: string } {
	const existing = readMatchSlot(seed.matchId);
	if (existing !== null) {
		// 重申 matchId 而非用型別斷言：ScoreboardState.matchId 型別為 string | null，
		// 斷言會讓「槽內容的 matchId 為 null 或屬於別場」的舊資料靜默通過；
		// 槽位既以 seed.matchId 為 key 讀出，這裡重寫回該值才是結構上的保證。
		return { ...existing, matchId: seed.matchId };
	}

	writeMatchSlot(seed);
	return seed;
}

/** 該場的第一隊／第二隊分數（回合側的比分形狀） */
export interface RoundTeamScores {
	first: number;
	second: number;
}

/** 計分板側的比分形狀（`us` 為我方、`them` 為對方） */
export interface ScoreboardTeamScores {
	us: number;
	them: number;
}

/**
 * 隊伍對應的唯一實作：第一隊 ↔ `us`、第二隊 ↔ `them`。入口建立 seed 與回填
 * 都呼叫同一個函式的兩個方向，SHALL NOT 在兩處各自硬編碼一份——兩處若不一致，
 * 回填的比分會左右顛倒，而比分本身仍是合法數字，任何驗證都攔不下來（見 spec）。
 */
export function mapTeamScores(
	scores: RoundTeamScores,
	toward: "scoreboard",
): ScoreboardTeamScores;
export function mapTeamScores(
	scores: ScoreboardTeamScores,
	toward: "round",
): RoundTeamScores;
export function mapTeamScores(
	scores: RoundTeamScores | ScoreboardTeamScores,
	toward: "scoreboard" | "round",
): ScoreboardTeamScores | RoundTeamScores {
	if (toward === "scoreboard") {
		const { first, second } = scores as RoundTeamScores;
		return { us: first, them: second };
	}
	const { us, them } = scores as ScoreboardTeamScores;
	return { first: us, second: them };
}

/** 待送出清單的單一項目：`matchId` 與轉換為回合側形狀（`first`／`second`）的兩隊比分。 */
export interface FinishedSubmission {
	readonly matchId: string;
	readonly scores: RoundTeamScores;
}

/**
 * 回填條件的具名 predicate（refactor 5.11）：spec「回填條件」的三者需同時成立才列入，
 * 抽成具名函式讓三個條件各自可讀，也讓日後補測試時能單獨鎖定這個判斷，而不必重新
 * 展開整個 collectFinishedSubmissions 的迴圈。`match is RoundMatch` 收斂型別，
 * 呼叫端不需要再對 `match` 做一次非空檢查。
 */
function isEligibleForBackfill(
	match: RoundMatch | undefined,
	slot: ScoreboardState,
): match is RoundMatch {
	// 條件一：槽已判定勝負。
	if (slot.status !== "finished") return false;

	// 條件二：場次仍在回合中。槽對應的場次可能因重排等原因已從回合消失（prd.md §11），
	// 此時該槽是孤兒資料，SHALL NOT 拋錯——略過即可，等 §6 的清槽流程收尾。
	if (match === undefined) return false;

	// 條件三（冪等的第二道防線，design Decision 5）：清槽是主要機制，此條件是清槽失敗
	// （例如 LocalStorage 寫入被配額擋下）時的最後防線，避免評分被重複雙倍更新。
	if (match.status === "completed") return false;

	return true;
}

/**
 * 計算目前回合中「應回填」的待送出清單：純函式，輸入為目前回合與計分板槽集合，
 * 不觸碰 localStorage（spec「回填條件」）。
 */
export function collectFinishedSubmissions(round: Round, slots: MatchSlots): FinishedSubmission[] {
	const result: FinishedSubmission[] = [];
	for (const [matchId, slot] of Object.entries(slots)) {
		const match = round.matches.find((m) => m.id === matchId);
		if (!isEligibleForBackfill(match, slot)) continue;

		result.push({ matchId, scores: mapTeamScores(slot.scores, "round") });
	}
	return result;
}

/** toSubmitScoreInput 的外部脈絡：呼叫端持有回合、名單與時間，本函式不推導這三者。 */
export interface SubmitScoreContext {
	readonly round: Round;
	readonly players: readonly Player[];
	readonly now: string;
}

/**
 * 唯一的橋接：把 collectFinishedSubmissions 的輸出（回合側形狀 `{first, second}`）轉為
 * submitScore 的輸入（`rawScoreA`／`rawScoreB` 字串）。`first ↔ teamA/rawScoreA` 的對應
 * 全 repo 只在此處定義一次——回填與手動輸入因此走同一個 submitScore 入口
 * （spec「計分板結果的自動回填共用送出 pipeline」），SHALL NOT 在呼叫點就地展開。
 */
export function toSubmitScoreInput(
	submission: FinishedSubmission,
	context: SubmitScoreContext,
): SubmitScoreInput {
	return {
		round: context.round,
		players: context.players,
		matchId: submission.matchId,
		rawScoreA: String(submission.scores.first),
		rawScoreB: String(submission.scores.second),
		now: context.now,
	};
}

/** isTargetScoreLocked 的輸出：布林值與繁體中文鎖定原因（未鎖定時為 null）。 */
export interface TargetScoreLockResult {
	readonly locked: boolean;
	readonly reason: string | null;
}

const TARGET_SCORE_LOCKED_REASON = "本輪已開始計分，目標分數不可更改。";

/**
 * 判定本輪目標分數是否已鎖定（spec「開始計分後鎖定本輪目標分數」）：
 * 任一場次已開始（非 `pending`）、或任一計分板槽存在且非 `"setup"`，兩者為 OR、
 * 任一成立即鎖定。
 *
 * 第一條與 `setTargetScore`（round.ts）的拒絕條件方向 MUST 一致：該入口以
 * `status !== "pending"` 判定是否拒絕變更，因此本判定同樣採 `!== "pending"`，
 * 而非只認 `"completed"`——spec 明文禁止「該入口拒絕但本判定未鎖」的相反方向，
 * 兩者的差集精確等於 `status === "scoring"`，故 `scoring` 場次同樣視為已開始。
 */
export function isTargetScoreLocked(round: Round, slots: MatchSlots): TargetScoreLockResult {
	const anyMatchStarted = round.matches.some((match) => match.status !== "pending");
	const anySlotStarted = Object.values(slots).some((slot) => slot.status !== "setup");

	const locked = anyMatchStarted || anySlotStarted;
	return { locked, reason: locked ? TARGET_SCORE_LOCKED_REASON : null };
}

/**
 * 重設本輪時清除被丟棄場次的計分板槽（round-lifecycle 的「重排本輪或重置名單時
 * 清除對應計分板進度」Requirement）：以「重排前」與「重排後」兩份回合比對出消失的
 * matchId，即被丟棄的未完成場次——`resetIncompleteMatches`（round.ts）只丟棄
 * `pending` 場次、保留其餘場次原封不動，保留場次的 id 因此仍存在於 nextRound 中，
 * 不會被本函式誤清。清除範圍只透過 clearMatchSlots 委派，SHALL NOT 觸碰
 * scoreboard:current:v1（獨立計分板與回合無關）。
 */
export function clearDiscardedMatchSlots(previousRound: Round, nextRound: Round): void {
	const keptMatchIds = new Set(nextRound.matches.map((match) => match.id));
	const discardedMatchIds = previousRound.matches
		.map((match) => match.id)
		.filter((matchId) => !keptMatchIds.has(matchId));

	clearMatchSlots(discardedMatchIds);
}
