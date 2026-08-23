// 產生本輪對戰與休息結算。本段的對外入口為 createRound()：把 M2 allocateRound() 的
// in-memory 輸出（Match 內嵌完整 Player）投影成可持久化的 Round／RoundMatch，
// 並推導出下一輪要用的重複比對基準與休息次數 patch。本檔 SHALL NOT 重新實作
// allocateRound 已負責的排序、配對或重複迴避（matchmaker-allocation-engine design
// Decision 1、tasks 4.7）。

import { allocateRound } from "./allocation";
import { EMPTY_SIGNATURE_INDEX, MIN_COURT_COUNT, PLAYERS_PER_MATCH } from "./allocation-types";
import { buildSignatureIndex } from "./duplication";
import { DEFAULT_TARGET_SCORE } from "./round-types";
import type { Match, MatchFormat, RoundAllocation, SignatureIndex, Team } from "./allocation-types";
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

// 上一輪自身的 completed／scoring 場次建出的索引——這就是新回合要保存的 seenSignatures
// （scenario「上一輪已完成與進行中的場次納入重複比對基準」）。pending 場次一律略過：
// 那些對戰從未發生，當成已配過會無謂限制新一輪的配對空間（design Decision 2）。
function previousRoundOwnSignatures(previousRound: Round | null): SignatureIndex {
	if (previousRound === null) {
		return EMPTY_SIGNATURE_INDEX;
	}

	const considered = previousRound.matches.filter((m) => m.status === "completed" || m.status === "scoring");

	return buildSignatureIndex(considered.map(toSignatureMatch));
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
	// 直接沿用 createRound 的同一個代碼與訊息，不另立一個新字面值：對使用者而言成因與
	// 修正方式完全相同（場地數設定不合法），沒有理由要求 UI 分兩種分支處理同一件事。
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

	for (let candidate = MIN_COURT_COUNT; numbers.length < count; candidate++) {
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
	if (keptMatches.length === round.matches.length) {
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

	// 一場佔一個場地，所以直接扣場次數，而不是「相異 courtNumber 的個數」——後者在編號重複的
	// 損壞資料上會少扣，排出比實際空場地更多的場次。
	const availableCourtCount = round.courtCount - keptMatches.length;

	let allocation: RoundAllocation;
	try {
		allocation = allocateRound({
			players: candidates,
			format: round.format,
			courtCount: availableCourtCount,
			seenSignatures: EMPTY_SIGNATURE_INDEX,
		});
	} catch {
		// 在「matches.length <= courtCount」的不變式下 availableCourtCount 至少為 1（前置條件
		// 已保證至少有一個 pending 場次，保留場次因此最多 courtCount - 1 場），但 Round 會從
		// LocalStorage 回讀，而 RoundSchema 並不檢查這個跨欄位不變式。損壞資料仍 MUST 得到
		// 可判讀的失敗結果而非讓例外穿透到 UI，理由與作法同 createRound。
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
	const matches = [...keptMatches, ...reallocated].sort((a, b) => a.courtNumber - b.courtNumber);

	return {
		ok: true,
		round: {
			...round,
			matches,
			restingPlayerIds: allocation.resting.map((player) => player.id),
		},
	};
}
