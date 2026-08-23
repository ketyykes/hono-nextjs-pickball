// 產生本輪對戰與休息結算。本段的對外入口為 createRound()：把 M2 allocateRound() 的
// in-memory 輸出（Match 內嵌完整 Player）投影成可持久化的 Round／RoundMatch，
// 並推導出下一輪要用的重複比對基準與休息次數 patch。本檔 SHALL NOT 重新實作
// allocateRound 已負責的排序、配對或重複迴避（matchmaker-allocation-engine design
// Decision 1、tasks 4.7）。

import { allocateRound } from "./allocation";
import { EMPTY_SIGNATURE_INDEX, PLAYERS_PER_MATCH } from "./allocation-types";
import { buildSignatureIndex } from "./duplication";
import { updateRatings } from "./rating";
import { DEFAULT_TARGET_SCORE } from "./round-types";
import type { Match, MatchFormat, RoundAllocation, SignatureIndex, Team } from "./allocation-types";
import type { MatchHistoryEntry } from "./history";
import type { RatingPlayerInput, RatingUpdateResult } from "./rating-types";
import type { Player } from "./types";
import type { PlayerRating, Round, RoundMatch, RoundTargetScore, RoundTeam, SeenSignatures } from "./round-types";

/**
 * 失敗代碼，具名常數（tasks 4.10）：三種空狀態（名單為空／人數不足／全員暫停）與場地數
 * 不合法各自獨立，訊息與修正方式互不相同（spec「無參賽者與人數不足時的邊界行為」）。
 */
export const ROUND_FAILURE_CODE = {
	EMPTY_ROSTER: "empty-roster",
	ALL_PAUSED: "all-paused",
	INSUFFICIENT_PLAYERS: "insufficient-players",
	INVALID_COURT_COUNT: "invalid-court-count",
} as const;

export type RoundFailureCode = (typeof ROUND_FAILURE_CODE)[keyof typeof ROUND_FAILURE_CODE];

const FORMAT_LABEL: Record<MatchFormat, string> = { singles: "單打", doubles: "雙打" };

// 「全員暫停」與「名單為空」的修正方式完全不同（前者要恢復出場、後者要新增參賽者），
// 訊息 MUST 不同，否則使用者會對著滿滿一頁參賽者被告知「請先新增參賽者」（spec 明文）。
const EMPTY_ROSTER_MESSAGE = "目前名單尚無任何參賽者，請先新增參賽者後再產生本輪對戰。";
const ALL_PAUSED_MESSAGE = "目前所有參賽者皆為暫停出場狀態，請先恢復至少一位的出場狀態後再產生本輪對戰。";
const INVALID_COURT_COUNT_MESSAGE = "場地數設定不合法，請調整為 1 到 8 之間的整數後再試一次。";

// 所需人數直接讀 PLAYERS_PER_MATCH（唯一人數來源），不得另行寫死 2／4。
function insufficientPlayersMessage(format: MatchFormat): string {
	const required = PLAYERS_PER_MATCH[format];
	return `目前可出場人數不足以組成任何一場${FORMAT_LABEL[format]}對戰（至少需要 ${required} 人），請新增參賽者或恢復暫停者的出場狀態後再試一次。`;
}

/** createRound 的輸入。純函式——時間與場次 id 一律由呼叫端注入，本函式不呼叫
 * Date.now() 或 crypto.randomUUID()（design：本輪不修改 Player、也不碰任何外部世界狀態）。
 * newMatchId 用產生器而非固定長度陣列：呼叫前無法預知本輪會產生幾場（取決於出場人數
 * 與場地數），固定陣列不是配額不足就是配額過剩。 */
export interface CreateRoundInput {
	readonly players: readonly Player[];
	readonly format: MatchFormat;
	readonly courtCount: number;
	/** 目前回合，首輪為 null。 */
	readonly previousRound: Round | null;
	readonly now: string;
	readonly newMatchId: () => string;
	/** 本輪的目標分數，省略時採 DEFAULT_TARGET_SCORE。預設值落在本層而非 schema 層：
	 * RoundSchema 刻意不帶 .default()，否則一份 targetScore 損壞的回合資料會被靜默補成 11
	 * 而不是被判為損壞（design Decision 4）。 */
	readonly targetScore?: RoundTargetScore;
}

/** 休息次數結算 patch，形狀可直接餵給 roster.ts 的 updatePlayer(id, { restCount })。 */
export interface RestSettlement {
	readonly id: string;
	readonly restCount: number;
}

export interface CreateRoundSuccess {
	readonly ok: true;
	readonly round: Round;
	readonly restSettlements: readonly RestSettlement[];
}

export interface CreateRoundFailure {
	readonly ok: false;
	readonly code: RoundFailureCode;
	readonly message: string;
}

export type CreateRoundResult = CreateRoundSuccess | CreateRoundFailure;

// ---- Match（in-memory，內嵌完整 Player）→ RoundMatch（persisted，只帶 playerIds） ----

function toRoundTeam(team: Team): RoundTeam {
	return { playerIds: team.players.map((p) => p.id), rating: team.rating };
}

// playerRatings[].before 於建立回合時就填入（prd.md 6.1「每輪需保存……賽前分數」），
// after 固定為 null——本函式不判定勝負也不呼叫評分模組，該欄位要等 §6 送出比分時才填入
// （design Decision 3）。
function toPlayerRatings(match: Match): PlayerRating[] {
	return match.teams.flatMap((team) => team.players.map((p) => ({ playerId: p.id, before: p.rating, after: null })));
}

// courtNumber 由呼叫端指定而非直接取 match.courtNumber：createRound 沿用 allocateRound
// 指派的 1 起算連續編號，重排則必須避開保留場次已佔用的編號（見 takeFreeCourtNumbers）。
// 兩處共用同一份投影，SHALL NOT 各寫一份（tasks 5.7）。
function toRoundMatch(match: Match, id: string, courtNumber: number): RoundMatch {
	const teams: [RoundTeam, RoundTeam] = [toRoundTeam(match.teams[0]), toRoundTeam(match.teams[1])];

	return {
		id,
		courtNumber,
		format: match.format,
		...(match.format === "doubles" ? { doublesComposition: match.doublesComposition } : {}),
		teams,
		status: "pending",
		scores: null,
		winner: null,
		completedAt: null,
		playerRatings: toPlayerRatings(match),
	};
}

// ---- 重複比對基準：SignatureIndex（Set，query 用）↔ SeenSignatures（陣列，persist 用） ----

function toSets(seen: SeenSignatures): SignatureIndex {
	return {
		teammateKeys: new Set(seen.teammateKeys),
		opponentKeys: new Set(seen.opponentKeys),
		fullMatchKeys: new Set(seen.fullMatchKeys),
	};
}

function toArrays(index: SignatureIndex): SeenSignatures {
	return {
		teammateKeys: [...index.teammateKeys],
		opponentKeys: [...index.opponentKeys],
		fullMatchKeys: [...index.fullMatchKeys],
	};
}

function mergeSignatureIndexes(a: SignatureIndex, b: SignatureIndex): SignatureIndex {
	return {
		teammateKeys: new Set([...a.teammateKeys, ...b.teammateKeys]),
		opponentKeys: new Set([...a.opponentKeys, ...b.opponentKeys]),
		fullMatchKeys: new Set([...a.fullMatchKeys, ...b.fullMatchKeys]),
	};
}

// duplication.ts 的 teammateKeys／opponentKeys／fullMatchKey／buildSignatureIndex 只讀取
// Match.teams 裡每支隊伍的 player id 與人數（見該檔實作：teamRawSignature 只取
// team.players.map(p => p.id)，teammateKeys 只看 team.players.length），完全不讀取
// format、courtNumber、doublesComposition。因此不需要反查名單取得完整 Player 物件——
// 即使該球員已被移除也不影響簽章正確性（不必查詢 players 陣列、不會因查無此人而漏算）。
// 這裡建立的 stand-in Player 只有 id 是真實的，其餘欄位是滿足型別而填入的佔位值，
// SHALL NOT 被用於簽章計算以外的用途；format 固定填 "singles" 也是同樣理由——
// 簽章函式完全不讀取這個欄位，沒有必要為了滿足 discriminated union 去猜測或還原
// RoundMatch 上可能遺失的 doublesComposition。
const SIGNATURE_PLACEHOLDER_CREATED_AT = "1970-01-01T00:00:00.000Z";

function toSignaturePlayer(id: string): Player {
	return {
		id,
		name: "",
		gender: "other",
		colorFrom: "#000000",
		colorTo: "#000000",
		rating: 0,
		restCount: 0,
		gamesPlayed: 0,
		isActive: true,
		createdAt: SIGNATURE_PLACEHOLDER_CREATED_AT,
	};
}

function toSignatureTeam(team: RoundTeam): Team {
	return { players: team.playerIds.map(toSignaturePlayer), rating: team.rating };
}

function toSignatureMatch(match: RoundMatch): Match {
	return {
		courtNumber: match.courtNumber,
		format: "singles",
		teams: [toSignatureTeam(match.teams[0]), toSignatureTeam(match.teams[1])],
	};
}

// 一組 RoundMatch 的簽章索引：先投影成簽章專用的 stand-in Match，再交給 duplication.ts。
// createRound（上一輪自身簽章）與 resetIncompleteMatches（被丟棄的原始組合）共用這一份，
// 兩處 SHALL NOT 各寫一遍 map(toSignatureMatch)（tasks 5.7）。
function signatureIndexOf(matches: readonly RoundMatch[]): SignatureIndex {
	return buildSignatureIndex(matches.map(toSignatureMatch));
}

// 上一輪自身的 completed／scoring 場次建出的索引——這就是新回合要保存的 seenSignatures
// （scenario「上一輪已完成與進行中的場次納入重複比對基準」）。pending 場次一律略過：
// 那些對戰從未發生，當成已配過會無謂限制新一輪的配對空間（design Decision 2）。
function previousRoundOwnSignatures(previousRound: Round | null): SignatureIndex {
	if (previousRound === null) {
		return EMPTY_SIGNATURE_INDEX;
	}

	const considered = previousRound.matches.filter((m) => m.status === "completed" || m.status === "scoring");

	return signatureIndexOf(considered);
}

// 餵給 allocateRound() 的暫時性避讓基準：上一輪自身的場次簽章（ownSignatures，即將成為
// 本輪要保存的 seenSignatures），再併入上一輪回合自身攜帶的 seenSignatures（tasks 4.4）。
// 這個併入刻意只影響「本次呼叫 allocateRound 用來避開重複的候選集合」，不進入本輪要保存
// 的 seenSignatures 欄位——若把它也存進本輪的欄位，下一輪建立時又會把「已經包含上上輪
// 東西」的本輪欄位再併入*下一輪*的避讓基準，如此遞迴下去，三輪前（以上）的簽章會透過
// 這條路徑無限傳遞，等同真的在累積全部歷史，違反 design Decision 2「基準只取上一輪，
// 不累積更早的回合」。
// 這個分岔讓兩種東西的深度不同，且兩者都是刻意的：本函式回傳的「避讓基準」依 spec 正文
// 「併入上一輪回合物件本身攜帶的 seenSignatures」刻意橫跨兩輪（上一輪自身 ownSignatures
// ∪ 上一輪攜帶的 seenSignatures，也就是上上輪自身），深度有界為 2；呼叫端最終寫回
// round.seenSignatures 的「保存欄位」則只用 ownSignatures 本身（見 createRound 內
// `toArrays(ownSignatures)`），深度恆為一輪。保存欄位的深度不會因為避讓基準是 2 就跟著
// 累加——正是因為兩者在這裡分岔，保存欄位才不會像上面段落描述的那樣無界成長。
// 呼叫端一併取得 ownSignatures，避免同一個 previousRound 被 buildSignatureIndex 算兩次。
function avoidanceBasis(previousRound: Round | null, ownSignatures: SignatureIndex): SignatureIndex {
	if (previousRound === null) {
		return EMPTY_SIGNATURE_INDEX;
	}

	return mergeSignatureIndexes(ownSignatures, toSets(previousRound.seenSignatures));
}

// ---- 休息次數結算（design Decision 1：本輪結束＝產生新一輪的那一刻） ----

// 只讀上一輪的 restingPlayerIds，不重新推導「誰該休息」——那是 candidates.ts 的職責，
// 這裡只負責把「已經決定要休息的人」各自的目前 restCount 讀出來 +1。暫停出場者
// SHALL NOT 出現在 restingPlayerIds 中（candidates.ts 的 selectPlaying 已保證：
// isActive === false 者完全排除於候選池，既不出場也不列入休息名單），因此不需要
// 在本函式重複過濾一次 isActive——那會是對已有保證的重複實作。
function computeRestSettlements(players: readonly Player[], previousRound: Round | null): RestSettlement[] {
	if (previousRound === null) {
		return [];
	}

	return previousRound.restingPlayerIds.flatMap((id) => {
		const player = players.find((p) => p.id === id);
		// 找不到代表該球員已被移除（roster.ts 的 removePlayer）。沒有目前 restCount
		// 可加，略過此筆 patch——updatePlayer 對不存在的 id 本來就是無害地略過，
		// 這裡提前濾除只是避免產生一筆永遠是 no-op 的空 patch。
		if (player === undefined) {
			return [];
		}
		return [{ id, restCount: player.restCount + 1 }];
	});
}

/**
 * 產生本輪對戰：呼叫 allocateRound() 並把結果投影成可持久化的 Round，同時回傳上一輪
 * 休息名單的 restCount 結算 patch。「本輪結束」＝呼叫本函式的那一刻（design Decision 1）：
 * 結算與取代目前回合須在 useRoundStore 的同一次 reducer action 內一併套用，本函式
 * 只負責一次算出兩者，不負責套用。
 */
export function createRound(input: CreateRoundInput): CreateRoundResult {
	const { players, format, courtCount, previousRound, now, newMatchId, targetScore = DEFAULT_TARGET_SCORE } = input;

	// 邊界檢查集中於此一處（tasks 4.10）：allocateRound 對名單相關的邊界不拋錯而是自然
	// 回傳空 matches（M2 的既有行為，見 allocation.ts 頂端註解），本函式是唯一呼叫端，
	// 必須自己判斷、拒絕建立一個沒有任何場次的空回合。三種空狀態的判斷順序刻意由窄到寬：
	// 先分辨「完全沒有名單」與「名單非空但全員暫停」（兩者的可用人數同為 0，但修正方式不同、
	// 訊息 MUST 不同），最後才是「可用人數非 0 但不足以組成任何一場」。
	if (players.length === 0) {
		return { ok: false, code: ROUND_FAILURE_CODE.EMPTY_ROSTER, message: EMPTY_ROSTER_MESSAGE };
	}

	const activePlayers = players.filter((p) => p.isActive);
	if (activePlayers.length === 0) {
		return { ok: false, code: ROUND_FAILURE_CODE.ALL_PAUSED, message: ALL_PAUSED_MESSAGE };
	}

	if (activePlayers.length < PLAYERS_PER_MATCH[format]) {
		return {
			ok: false,
			code: ROUND_FAILURE_CODE.INSUFFICIENT_PLAYERS,
			message: insufficientPlayersMessage(format),
		};
	}

	const ownSignatures = previousRoundOwnSignatures(previousRound);

	let allocation: RoundAllocation;
	try {
		allocation = allocateRound({
			players,
			format,
			courtCount,
			seenSignatures: avoidanceBasis(previousRound, ownSignatures),
		});
	} catch {
		// 名單相關的邊界已在上方擋下，執行到這裡時 allocateRound 唯一可能拋出的原因是
		// 場地數不合法（M2 的 assertValidCourtCount）。本函式是唯一呼叫端，MUST 接住這個
		// Error 轉為同一種可判讀的失敗結果，SHALL NOT 讓例外穿透到 UI 層（tasks 4.9）。
		return { ok: false, code: ROUND_FAILURE_CODE.INVALID_COURT_COUNT, message: INVALID_COURT_COUNT_MESSAGE };
	}

	const matches = allocation.matches.map((match) => toRoundMatch(match, newMatchId(), match.courtNumber));

	const round: Round = {
		roundNumber: previousRound === null ? 1 : previousRound.roundNumber + 1,
		createdAt: now,
		format,
		courtCount,
		targetScore,
		matches,
		restingPlayerIds: allocation.resting.map((p) => p.id),
		seenSignatures: toArrays(ownSignatures),
	};

	return {
		ok: true,
		round,
		restSettlements: computeRestSettlements(players, previousRound),
	};
}

// ---- 目標分數：每輪設定，開始計分後鎖定（prd.md 6.3.1） ----

/**
 * setTargetScore 的失敗代碼。不併入 ROUND_FAILURE_CODE：那個列舉是 CreateRoundFailure.code
 * 的型別來源，混進本代碼等於宣稱 createRound 可能回傳一個它永遠不會回傳的失敗，呼叫端的
 * 分支處理會多出一個不存在的分支。目前只有一種失敗原因仍以具名代碼回傳，理由同 createRound：
 * UI 需要能在不比對訊息字串的情況下分辨失敗種類，訊息文案本來就會被改寫。
 */
export const SET_TARGET_SCORE_FAILURE_CODE = {
	SCORING_STARTED: "scoring-started",
} as const;

export type SetTargetScoreFailureCode = (typeof SET_TARGET_SCORE_FAILURE_CODE)[keyof typeof SET_TARGET_SCORE_FAILURE_CODE];

const SCORING_STARTED_MESSAGE = "本輪已有場次開始計分，目標分數不可再更改；如需改用其他分制，請於產生新一輪時設定。";

export interface SetTargetScoreSuccess {
	readonly ok: true;
	readonly round: Round;
}

export interface SetTargetScoreFailure {
	readonly ok: false;
	readonly code: SetTargetScoreFailureCode;
	readonly message: string;
}

export type SetTargetScoreResult = SetTargetScoreSuccess | SetTargetScoreFailure;

/**
 * 更改該輪的目標分數：僅在該輪所有場次皆為 pending 時允許，否則回傳失敗結果且原回合
 * SHALL NOT 被修改（純函式，回傳新回合由呼叫端套用）。
 *
 * 鎖定條件寫成「有任一場次不是 pending」而非「有 scoring 或 completed」：spec 明訂本
 * capability 只以「是否仍全為 pending」為鎖定條件，用否定式表達，日後 MatchStatus 若再擴值
 * 也不會悄悄變成「新狀態可以改分制」。
 */
export function setTargetScore(round: Round, targetScore: RoundTargetScore): SetTargetScoreResult {
	if (round.matches.some((match) => match.status !== "pending")) {
		return { ok: false, code: SET_TARGET_SCORE_FAILURE_CODE.SCORING_STARTED, message: SCORING_STARTED_MESSAGE };
	}

	return { ok: true, round: { ...round, targetScore } };
}

// ---- 重設與重排未完成場次（prd.md 6.2、design Decision 5） ----

/**
 * resetIncompleteMatches 的失敗代碼。兩種前置條件不成立的情境分開表達：UI 對「還沒產生
 * 本輪」與「本輪已全部打完」要給的下一步不同（前者按「產生本輪」、後者按「產生新一輪」）。
 */
export const RESET_INCOMPLETE_MATCHES_FAILURE_CODE = {
	NO_ROUND: "no-round",
	NO_PENDING_MATCH: "no-pending-match",
	// 沿用 createRound 的同一個代碼與訊息，不另立一個新字面值——但兩者的成因並不相同：
	// 這條路徑只在「matches.length > courtCount」這種跨欄位損壞資料下才會被觸發（見下方
	// 的 catch 區塊），courtCount 本身仍是合法值，訊息「請調整為 1 到 8 之間的整數」對這
	// 條路徑而言其實不可行動（使用者沒有欄位可以調）。沿用同一個 code／訊息單純是因為
	// 兩者對使用者而言的下一步做法剛好相同（重新產生／重排一次），不是因為觸發原因相同，
	// 也沒有理由要求 UI 為同一種下一步分兩個分支處理。
	INVALID_COURT_COUNT: ROUND_FAILURE_CODE.INVALID_COURT_COUNT,
} as const;

export type ResetIncompleteMatchesFailureCode =
	(typeof RESET_INCOMPLETE_MATCHES_FAILURE_CODE)[keyof typeof RESET_INCOMPLETE_MATCHES_FAILURE_CODE];

const NO_ROUND_MESSAGE = "目前沒有進行中的回合可以重排，請先產生本輪對戰。";
const NO_PENDING_MATCH_MESSAGE = "本輪已經沒有尚未開始的場次可以重排，如要換一批對戰組合請產生新一輪。";

/**
 * 新場次的 id 來源。命名沿用 tasks 5.4 的 `ids`，內容與 CreateRoundInput.newMatchId 同一種
 * 注入方式（純函式，本檔不呼叫 crypto.randomUUID()）。包成具名物件而非裸函式參數：
 * 第三個位置放一個匿名 () => string 在呼叫端讀起來只是個不明所以的引數，
 * `{ newMatchId }` 則自我說明。
 */
export interface ResetIncompleteMatchesIds {
	readonly newMatchId: () => string;
}

export interface ResetIncompleteMatchesSuccess {
	readonly ok: true;
	readonly round: Round;
}

export interface ResetIncompleteMatchesFailure {
	readonly ok: false;
	readonly code: ResetIncompleteMatchesFailureCode;
	readonly message: string;
}

export type ResetIncompleteMatchesResult = ResetIncompleteMatchesSuccess | ResetIncompleteMatchesFailure;

// 依序取出 count 個「未被保留場次佔用」的場地編號。allocateRound 一律把場地編號從 1 起算
// 重新指派（allocation.ts 步驟 4），但保留下來的 completed／scoring 場次已經佔著自己的編號，
// 直接沿用會出現兩張場地卡片同時寫著「1 號場」。spec 沒有規定重排後的編號規則，這裡讓新場次
// 避開既有編號、取剩下最小的可用值：保留場次的編號是既定事實——使用者此刻就站在那個場地上，
// 已完成場次的比分也是以那個號碼記錄下來的，能讓的只有新場次。
// 迴圈以 numbers.length 而非上界為終止條件，故不需要「可用編號是否足夠」的前置假設。
function takeFreeCourtNumbers(count: number, occupied: ReadonlySet<number>): number[] {
	const numbers: number[] = [];

	// 這裡要的是「第一個場地編號」，不是「場地數合法範圍下限」——兩者現在剛好同為 1，
	// 但語意不同：MIN_COURT_COUNT（allocation-types.ts）文件明訂為後者，若哪天下限改為
	// 2，沿用它會讓場地編號跟著從 2 起算。直接用字面量 1，寫法同 allocation.ts 步驟 4
	// 的既有先例（`courtNumber: index + 1`）。
	for (let candidate = 1; numbers.length < count; candidate++) {
		if (!occupied.has(candidate)) {
			numbers.push(candidate);
		}
	}

	return numbers;
}

/**
 * 重排本輪尚未比賽的人：保留 completed 與 scoring 場次原封不動，把 pending 場次全部丟棄，
 * 以「本輪尚未比賽者」重新跑一次完整的分配優先序（design Decision 5）。純函式——回傳新回合，
 * 原回合與 players 皆 SHALL NOT 被就地修改。
 *
 * 回傳值刻意不含任何 restCount patch：休息次數只在「產生新一輪」時結算，重排不是本輪結束
 * （design Decision 1）。這也是採用該方案的直接好處——重排會換掉休息名單成員，若本輪已經
 * 先加過一次，這裡就得反過來撤銷。
 *
 * round 收 `Round | null` 而非要求呼叫端先自行判斷：「目前沒有回合」是 spec 明列的前置條件
 * 之一，判斷放在這裡才能保證每個呼叫端拿到的都是同一句訊息。
 */
export function resetIncompleteMatches(
	round: Round | null,
	players: readonly Player[],
	ids: ResetIncompleteMatchesIds,
): ResetIncompleteMatchesResult {
	if (round === null) {
		return { ok: false, code: RESET_INCOMPLETE_MATCHES_FAILURE_CODE.NO_ROUND, message: NO_ROUND_MESSAGE };
	}

	// 保留 pending 以外的全部場次：completed 是已發生的事實，scoring 則是「已經開始計分」，
	// 依 spec 同樣不屬於「尚未比賽」。用否定式表達，MatchStatus 日後若擴值也不會有新狀態
	// 被默默當成可重排。沒有任何場次可丟棄（含整個回合連一場都沒有）即前置條件不成立。
	const keptMatches = round.matches.filter((match) => match.status !== "pending");
	const discardedMatches = round.matches.filter((match) => match.status === "pending");
	if (discardedMatches.length === 0) {
		return {
			ok: false,
			code: RESET_INCOMPLETE_MATCHES_FAILURE_CODE.NO_PENDING_MATCH,
			message: NO_PENDING_MATCH_MESSAGE,
		};
	}

	// 候選池＝目前名單中不在保留場次裡的人。spec 把它寫成「pending 場次的球員 ∪ 本輪休息
	// 名單成員」，在名單未變動時兩者是同一個集合；名單變動時取補集才是「本輪尚未比賽者」的
	// 正確讀法——剛加入或剛恢復出場的人不可能出現在本輪的 pending 場次或 restingPlayerIds 裡，
	// 而那正是主持人按下重排最常見的兩個動機（design Decision 5），照字面取聯集會讓重排
	// 對這兩種情境完全無效。取補集另有兩個附帶好處：pending 場次只存 playerIds，要拿回
	// Player 物件本來就得回名單查；補集連查表都省了，也不會因為某人已被刪除而查無此人。
	// 暫停出場者不需要在這裡過濾，selectPlaying 已保證 isActive === false 者不進候選池。
	const occupiedPlayerIds = new Set(keptMatches.flatMap((match) => match.teams.flatMap((team) => team.playerIds)));
	const candidates = players.filter((player) => !occupiedPlayerIds.has(player.id));

	// 已知行為（記錄用，不改動）：若 candidates 為空或人數不足以組成任何一場，下方
	// allocateRound 依其既有邊界行為（M2）回傳空的 matches 陣列，本函式不會因此判定失敗——
	// 結果是 pending 場次被靜默丟棄且不補回，回合可能因此變成 0 場次、或只剩保留下來的
	// completed／scoring 場次。這不是本函式的邊界檢查職責：spec「SHALL NOT 建立沒有場次的
	// 空回合」那兩條 MUST 屬於「無參賽者與人數不足」Requirement，作用對象是 createRound
	// 的建立回合路徑，不是這裡的重排路徑；本組 spec 未規範重排時候選池不足的行為，故非違規。
	// 是否要在按鈕層擋下（例如禁用重排按鈕）留給後續 milestone 決定。

	// 一場佔一個場地，所以直接扣場次數，而不是「相異 courtNumber 的個數」——後者在編號重複的
	// 損壞資料上會少扣，排出比實際空場地更多的場次。
	const availableCourtCount = round.courtCount - keptMatches.length;

	// 重排的避讓基準＝原回合已攜帶的基準（createRound 存進去的上一輪自身簽章）∪ 本次被丟棄的
	// 原始 pending 組合。少了後者，輸入完全沒變時 allocateRound 會原封不動排出同一組人
	// （prd.md 5.6 明列「重設前的原始對戰組合」為需記錄的項目，design Decision 5）。
	// 保留場次的簽章不必併入：那些人已被排除於候選池之外，新場次根本組不出含他們的組合。
	const basis = mergeSignatureIndexes(toSets(round.seenSignatures), signatureIndexOf(discardedMatches));

	let allocation: RoundAllocation;
	try {
		allocation = allocateRound({
			players: candidates,
			format: round.format,
			courtCount: availableCourtCount,
			seenSignatures: basis,
		});
	} catch {
		// 在「matches.length <= courtCount」的不變式下 availableCourtCount 至少為 1（前置條件
		// 已保證至少有一個 pending 場次，保留場次因此最多 courtCount - 1 場），但 Round 會從
		// LocalStorage 回讀，而 RoundSchema 並不檢查這個跨欄位不變式。損壞資料仍 MUST 得到
		// 可判讀的失敗結果而非讓例外穿透到 UI，理由與作法同 createRound；下面沿用的
		// INVALID_COURT_COUNT_MESSAGE 是 createRound 訊息文案的沿用，不是針對這條「資料已損壞」
		// 的路徑精準撰寫（見上方 RESET_INCOMPLETE_MATCHES_FAILURE_CODE 的說明）。
		return {
			ok: false,
			code: RESET_INCOMPLETE_MATCHES_FAILURE_CODE.INVALID_COURT_COUNT,
			message: INVALID_COURT_COUNT_MESSAGE,
		};
	}

	const freeCourtNumbers = takeFreeCourtNumbers(
		allocation.matches.length,
		new Set(keptMatches.map((match) => match.courtNumber)),
	);
	const reallocated = allocation.matches.map((match, index) => toRoundMatch(match, ids.newMatchId(), freeCourtNumbers[index]));

	// 依場地編號排序而非「保留的在前、新排的在後」：畫面是一排場地卡片，順序就該是場地順序，
	// 否則重排後 2 號場會跑到 1 號場前面。這裡排的是新建的陣列，不動 round.matches。
	// 這個 .sort( 是純粹的顯示排序（依 courtNumber 排卡片順序），不是候選或配對排序——
	// 候選排序、配對與重複迴避一律是 allocation.ts／candidates.ts 的職責，本檔頂端註解
	// SHALL NOT 重新實作，此處未越界。
	const matches = [...keptMatches, ...reallocated].sort((a, b) => a.courtNumber - b.courtNumber);

	// 保存欄位直接沿用同一份 basis：重排後 round.seenSignatures = 原有值 ∪ 被丟棄組合的簽章。
	// 這不會讓保存欄位無界成長——下一次 createRound 會以「上一輪自身 completed／scoring 的
	// 簽章」整份覆寫它（見 createRound 的 toArrays(ownSignatures)），被丟棄的組合影響過下一輪的
	// 避讓基準之後就自然退場，鏈的深度仍有界。
	// roundNumber／createdAt／format／courtCount／targetScore 全部以 ...round 原樣沿用：
	// 重排的是這一輪，不是換一輪。
	return {
		ok: true,
		round: {
			...round,
			matches,
			restingPlayerIds: allocation.resting.map((player) => player.id),
			seenSignatures: toArrays(basis),
		},
	};
}

// ---- 比分驗證與送出（prd.md 6.3、6.4、6.5、8.2） ----

/**
 * validateScoreInput 的失敗代碼。五種拒絕原因（欄位空白／非數字／負數／平局／場次已完成）
 * 的修正方式互不相同，各自具名而非共用單一「輸入不合法」代碼，理由同 ROUND_FAILURE_CODE。
 */
export const VALIDATE_SCORE_FAILURE_CODE = {
	EMPTY_FIELD: "empty-field",
	INVALID_NUMBER: "invalid-number",
	NEGATIVE_SCORE: "negative-score",
	TIE: "tie",
	ALREADY_COMPLETED: "already-completed",
} as const;

export type ValidateScoreFailureCode = (typeof VALIDATE_SCORE_FAILURE_CODE)[keyof typeof VALIDATE_SCORE_FAILURE_CODE];

const EMPTY_FIELD_MESSAGE = "兩隊比分皆須填寫，請輸入完整比分後再試一次。";
const INVALID_NUMBER_MESSAGE = "比分須為有效的整數，請重新輸入。";
const NEGATIVE_SCORE_MESSAGE = "比分不可為負數，請輸入 0 或以上的整數。";
const TIE_MESSAGE = "兩隊比分相同時無法判定勝方，請確認比分後再試一次。";
const ALREADY_COMPLETED_MESSAGE = "此場次已完成，無法再次送出比分。";

export interface ValidateScoreSuccess {
	readonly ok: true;
	readonly scoreA: number;
	readonly scoreB: number;
}

export interface ValidateScoreFailure {
	readonly ok: false;
	readonly code: ValidateScoreFailureCode;
	readonly message: string;
}

export type ValidateScoreResult = ValidateScoreSuccess | ValidateScoreFailure;

// 比分欄位只接受「（可選負號）＋一或多個 ASCII 數字」，前後空白先 trim 再比對格式
// （要點 1 的邊界決定）：
// - 接受前後空白（" 11 "）：使用者打字最常見的失手（誤觸空白鍵、觸控鍵盤誤觸），
//   trim 後仍是合法整數格式時不該被當成錯誤輸入。
// - 不接受小數（"1.5"）或科學記號（"1e3"）：RoundMatchSchema 的 scores 是
//   z.number().int().nonnegative()，接受這兩種格式會在寫回 Round 時才被 schema 拒絕，
//   等於把「輸入驗證」的責任推給 schema 事後爆炸，而不是在使用者送出當下就擋下並說明。
// - 不接受全形數字（"１１"）：行動裝置的數字鍵盤不會產生全形字元，接受它需要額外的
//   locale-aware 正規化邏輯，超出「使用者打字失手」這個要處理的範圍。
// SHALL NOT 單獨用 Number() 或 parseInt() 判斷（tasks 6.2）：Number("") 為 0、
// Number("   ") 為 0、parseInt("1a") 為 1、Number("NaN") 為 NaN，四者都會被其中一個
// 函式單獨使用時靜默放行。這裡先用正規表示式判斷格式是否合法，Number() 只在格式已確定
// 合法之後才用來取值，不構成「單獨判斷」。
const SCORE_INPUT_PATTERN = /^-?\d+$/;

// 回傳值刻意設計成「三個字面量狀態 + number」的聯合型別而非另外包一層 { ok, ... } 物件：
// validateScoreInput 需要同時檢視兩個欄位（A、B）才能決定要回報哪一種失敗，用字面量
// 讓呼叫端能以 === 比對個別欄位的判定結果，同時在依序排除三種失敗字面量後，TS 能將
// 剩餘型別收斂為 number，不需要 as 斷言或非空判斷符號 !。
type ScoreFieldParseResult = "empty" | "invalid" | "negative" | number;

function parseScoreField(raw: string): ScoreFieldParseResult {
	const trimmed = raw.trim();
	if (trimmed === "") {
		return "empty";
	}
	if (!SCORE_INPUT_PATTERN.test(trimmed)) {
		return "invalid";
	}

	const value = Number(trimmed);
	if (value < 0) {
		return "negative";
	}
	return value;
}

/**
 * 驗證一場比分的輸入是否可以送出：欄位空白、非數字、負數、平局、場次已完成五種情況皆
 * MUST 拒絕（spec「比分驗證」），拒絕時回傳可判讀的失敗結果而非拋出例外或只回布林值。
 * 純函式，不修改傳入的 match。
 */
export function validateScoreInput(match: RoundMatch, rawScoreA: string, rawScoreB: string): ValidateScoreResult {
	// 場次已完成是最優先的門檻：一旦成立，比分欄位本身合不合法已經無關緊要——已完成的
	// 場次不該再被任何欄位內容說服而重新計分。
	if (match.status === "completed") {
		return { ok: false, code: VALIDATE_SCORE_FAILURE_CODE.ALREADY_COMPLETED, message: ALREADY_COMPLETED_MESSAGE };
	}

	const scoreA = parseScoreField(rawScoreA);
	const scoreB = parseScoreField(rawScoreB);

	if (scoreA === "empty" || scoreB === "empty") {
		return { ok: false, code: VALIDATE_SCORE_FAILURE_CODE.EMPTY_FIELD, message: EMPTY_FIELD_MESSAGE };
	}
	if (scoreA === "invalid" || scoreB === "invalid") {
		return { ok: false, code: VALIDATE_SCORE_FAILURE_CODE.INVALID_NUMBER, message: INVALID_NUMBER_MESSAGE };
	}
	if (scoreA === "negative" || scoreB === "negative") {
		return { ok: false, code: VALIDATE_SCORE_FAILURE_CODE.NEGATIVE_SCORE, message: NEGATIVE_SCORE_MESSAGE };
	}

	// 至此 scoreA、scoreB 皆已排除 "empty"／"invalid"／"negative" 三種字面量，TS 將
	// ScoreFieldParseResult 收斂為 number，不需要斷言。
	if (scoreA === scoreB) {
		return { ok: false, code: VALIDATE_SCORE_FAILURE_CODE.TIE, message: TIE_MESSAGE };
	}

	return { ok: true, scoreA, scoreB };
}

/**
 * submitScore 的失敗代碼：驗證失敗直接沿用 validateScoreInput 的代碼（同一組原因、
 * 同一句訊息），另兩者是本函式獨有——MATCH_NOT_FOUND 代表呼叫端持有過期的 matchId
 * （例如場次已被重排移除），與比分欄位是否合法無關；SCORING_FAILED 是 6.6 的
 * defence-in-depth：評分 API 呼叫失敗時的統一回報代碼，spec 無對應 Scenario。
 */
export const SUBMIT_SCORE_FAILURE_CODE = {
	MATCH_NOT_FOUND: "match-not-found",
	SCORING_FAILED: "scoring-failed",
} as const;

export type SubmitScoreFailureCode = ValidateScoreFailureCode | (typeof SUBMIT_SCORE_FAILURE_CODE)[keyof typeof SUBMIT_SCORE_FAILURE_CODE];

const MATCH_NOT_FOUND_MESSAGE = "找不到指定的場次，畫面可能已過期，請重新整理頁面後再試一次。";
// defence-in-depth（tasks 6.6，spec 無對應 Scenario）：M3 的 updateRatings 對四類不合法
// 輸入會 throw（隊伍人數不符、rating 超出 1～8、gamesPlayed 非非負整數、同場重複 id）。
// 送進 updateRatings 的資料已由上面的 validateScoreInput（§6.2）與 resolveTeamPlayers
// 的球員存在性間接把關過，正常路徑不會觸發這四類例外；但這裡仍以 try/catch 接住，
// 轉為同一種失敗結果而非讓例外穿透到 UI，是防禦措施而非本函式預期的正常分支。
const SCORING_FAILED_MESSAGE = "評分計算發生非預期錯誤，請重新整理頁面後再試一次。";

/** submitScore 的輸入。純函式——時間一律由呼叫端注入（design：不呼叫 Date.now()）。 */
export interface SubmitScoreInput {
	readonly round: Round;
	readonly players: readonly Player[];
	readonly matchId: string;
	readonly rawScoreA: string;
	readonly rawScoreB: string;
	readonly now: string;
}

/** 名單 patch，形狀可直接餵給 roster.ts 的 updatePlayer(id, patch)（design Decision 6）。 */
export interface ScorePlayerPatch {
	readonly id: string;
	readonly rating: number;
	readonly gamesPlayed: number;
}

/** 本次送出的一次性觸界訊息，不進回合物件、不持久化（design Decision 6）。 */
export interface ScoreBoundaryHit {
	readonly playerId: string;
	readonly atUpperBound: boolean;
	readonly atLowerBound: boolean;
}

export interface SubmitScoreSuccess {
	readonly ok: true;
	readonly round: Round;
	readonly historyEntry: MatchHistoryEntry;
	readonly playerPatches: readonly ScorePlayerPatch[];
	readonly boundaryHits: readonly ScoreBoundaryHit[];
}

export interface SubmitScoreFailure {
	readonly ok: false;
	readonly code: SubmitScoreFailureCode;
	readonly message: string;
}

export type SubmitScoreResult = SubmitScoreSuccess | SubmitScoreFailure;

// 送出當下該員在名單中的資料（rating／gamesPlayed／name），依 playerIds 的順序取出。
// 用 filter 而非逐一 find＋在此拋錯：找不到的球員（已被移除，roster.ts 的 removePlayer
// 不禁止移除仍在進行中場次裡的人）直接被排除在外，讓結果陣列長度變少而非在這裡處理
// 「查無此人」的例外情境。這不是靜默放行——人數不足會在下方餵給 updateRatings 時被
// M3 自己的 assertValidInput 擋下（「隊伍人數需為 N 人」），與 6.6 的防禦性 try/catch
// 是同一條路徑，不需要在這裡重新實作一次「球員是否存在」的檢查。
function resolveTeamPlayers(playerIds: readonly string[], players: readonly Player[]): Player[] {
	return players.filter((player) => playerIds.includes(player.id));
}

// RoundMatch → MatchHistoryEntry 的唯一投影實作（tasks 6.7）。
// teamA／teamB 的 rating 直接沿用 match.teams[i].rating——那是 createRound 建立本場次時
// 寫入的隊伍分數快照（toRoundTeam，見本檔上方），語意正是 HistoryTeam.rating 定義的
// 「賽前隊伍分數」：從建立回合到送出比分之間，除了這次 submitScore 呼叫本身，沒有其他
// 事件能改動這些球員的 rating，因此兩個時間點的隊伍分數必然相同，可以直接沿用而不必
// 重新加總。
//
// changes 與 matchPlayers 的順序保證一致（見下方 submitScore：兩者皆源自同一次
// 「teamAPlayers 在前、teamBPlayers 在後」的攤平），故以陣列索引配對即可，
// 不需要另外以 id 建 Map 查表。
function toHistoryEntry(
	match: RoundMatch,
	scoreA: number,
	scoreB: number,
	winner: "teamA" | "teamB",
	completedAt: string,
	changes: readonly { readonly id: string; readonly before: number; readonly after: number }[],
	matchPlayers: readonly Player[],
): MatchHistoryEntry {
	const teamASize = match.teams[0].playerIds.length;

	const toHistoryTeam = (
		teamChanges: readonly { readonly id: string; readonly before: number; readonly after: number }[],
		teamPlayers: readonly Player[],
		teamRating: number,
	) => ({
		rating: teamRating,
		players: teamChanges.map((change, index) => ({
			id: change.id,
			name: teamPlayers[index].name,
			ratingBefore: change.before,
			ratingAfter: change.after,
		})),
	});

	const base = {
		matchId: match.id,
		courtNumber: match.courtNumber,
		playedAt: completedAt,
		teamA: toHistoryTeam(changes.slice(0, teamASize), matchPlayers.slice(0, teamASize), match.teams[0].rating),
		teamB: toHistoryTeam(changes.slice(teamASize), matchPlayers.slice(teamASize), match.teams[1].rating),
		scoreA,
		scoreB,
		winner,
	};

	// 單打／雙打分屬 MatchHistoryEntrySchema 的兩個 .strict() 分支（history.ts）：單打分支
	// 不得帶 doublesComposition、雙打分支必須帶。用 match.format 分岔物件字面量而非事後
	// spread 補欄位，讓 TS 在編譯期就能檢查兩分支各自的欄位集合是否正確，spread 則要到
	// zod parse 才會發現漏欄位或多欄位。
	//
	// match.doublesComposition 型別上是 optional（round-types.ts 刻意不用 discriminated
	// union，理由見該檔 RoundMatchSchema 註解），但雙打場次在唯一的建構路徑
	// createRound／resetIncompleteMatches 一定會寫入這個欄位（toRoundMatch 的
	// ...(format === "doubles" ? { doublesComposition } : {})）。這裡退回 "general"
	// 純粹是為了在型別上收斂（DoublesComposition 沒有「未知」這個合法值可用），不代表
	// 本函式認為缺值是正常情況——若真的發生，代表回合資料已經損壞，而本函式不是資料
	// 完整性的把關點（那是 round-storage.ts 的 §7 職責）。
	if (match.format === "doubles") {
		const doublesComposition = match.doublesComposition ?? "general";
		return { ...base, format: "doubles", doublesComposition };
	}
	return { ...base, format: "singles" };
}

/**
 * 送出一場比分：驗證 → 呼叫評分 API → 標記完成 → 建立歷史紀錄 → 結算 gamesPlayed，
 * 依固定順序完成一場對戰（spec「比分送出的完成流程」）。純函式，回傳新回合與待套用的
 * 歷史／名單 patch，不直接操作任何 store（design Decision 6：三份資料的更新若各自散在
 * side effect 裡，任一個丟例外就會留下部分更新且無法自我修復）。
 *
 * 原子性由「失敗時不回傳任何可寫入的東西」保證：validateScoreInput 在最前面、任何計算
 * 之前完成，失敗時直接回傳該失敗結果，呼叫端拿到的物件裡沒有 historyEntry／
 * playerPatches／boundaryHits 可用，無從產生部分更新。
 */
export function submitScore(input: SubmitScoreInput): SubmitScoreResult {
	const { round, players, matchId, rawScoreA, rawScoreB, now } = input;

	const match = round.matches.find((m) => m.id === matchId);
	if (match === undefined) {
		return { ok: false, code: SUBMIT_SCORE_FAILURE_CODE.MATCH_NOT_FOUND, message: MATCH_NOT_FOUND_MESSAGE };
	}

	const validated = validateScoreInput(match, rawScoreA, rawScoreB);
	if (!validated.ok) {
		return validated;
	}
	const { scoreA, scoreB } = validated;

	// 勝方判定的唯一實作位置（tasks 6.7）：上面已擋下平局，此處 scoreA、scoreB 必不相等。
	const winner: "teamA" | "teamB" = scoreA > scoreB ? "teamA" : "teamB";

	const teamAPlayers = resolveTeamPlayers(match.teams[0].playerIds, players);
	const teamBPlayers = resolveTeamPlayers(match.teams[1].playerIds, players);
	const matchPlayers = [...teamAPlayers, ...teamBPlayers];

	const toRatingInput = (player: Player): RatingPlayerInput => ({
		id: player.id,
		rating: player.rating,
		gamesPlayed: player.gamesPlayed,
	});

	let ratingResult: RatingUpdateResult;
	try {
		// 見上方 SCORING_FAILED_MESSAGE 的註解：本 try/catch 是防禦性的
		// defence-in-depth（tasks 6.6），正常路徑（§6.2 已驗證的合法輸入、球員確實存在
		// 於名單）不會讓 updateRatings 拋出例外。
		ratingResult = updateRatings({
			format: match.format,
			teams: [teamAPlayers.map(toRatingInput), teamBPlayers.map(toRatingInput)],
			winnerIndex: winner === "teamA" ? 0 : 1,
		});
	} catch {
		return { ok: false, code: SUBMIT_SCORE_FAILURE_CODE.SCORING_FAILED, message: SCORING_FAILED_MESSAGE };
	}

	// changes 的順序是「隊伍 A 全員 → 隊伍 B 全員」（rating-types.ts），與上面 matchPlayers
	// 的建構順序（teamAPlayers 在前、teamBPlayers 在後）一致，可直接以陣列索引配對。
	const playerRatings: PlayerRating[] = ratingResult.changes.map((change) => ({
		playerId: change.id,
		before: change.before,
		after: change.after,
	}));

	// 回報「已達上限／下限」用的是 atUpperBound／atLowerBound（停在界上即 true），
	// 不是 clamped（本場理論值是否真的被截斷而少拿分）——語意分歧見 rating-types.ts
	// 的 RatingChange 註解：理論值 8.0049 四捨五入後恰為 8.00 者，atUpperBound 為 true
	// 但 clamped 為 false，使用者一分未少拿，仍該被告知「已達上限」（prd.md 6.4.6）。
	const boundaryHits: ScoreBoundaryHit[] = ratingResult.changes
		.filter((change) => change.atUpperBound || change.atLowerBound)
		.map((change) => ({ playerId: change.id, atUpperBound: change.atUpperBound, atLowerBound: change.atLowerBound }));

	const playerPatches: ScorePlayerPatch[] = ratingResult.changes.map((change, index) => ({
		id: change.id,
		rating: change.after,
		// gamesPlayed 的 patch 值須為「目前值 + 1」（絕對值），不是差值——updatePlayer 是
		// 覆寫語意（roster.ts UpdatePlayerPatch 註解對此有明文警告），傳差值會直接蓋掉
		// 既有累計值。matchPlayers[index] 與 change 同序（見上方註解），故可直接索引取值。
		gamesPlayed: matchPlayers[index].gamesPlayed + 1,
	}));

	const completedMatch: RoundMatch = {
		...match,
		status: "completed",
		scores: { teamA: scoreA, teamB: scoreB },
		winner,
		completedAt: now,
		playerRatings,
	};

	const updatedRound: Round = {
		...round,
		matches: round.matches.map((m) => (m.id === matchId ? completedMatch : m)),
	};

	const historyEntry = toHistoryEntry(match, scoreA, scoreB, winner, now, ratingResult.changes, matchPlayers);

	return {
		ok: true,
		round: updatedRound,
		historyEntry,
		playerPatches,
		boundaryHits,
	};
}
