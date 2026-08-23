// 產生本輪對戰與休息結算。唯一對外入口 createRound()：把 M2 allocateRound() 的
// in-memory 輸出（Match 內嵌完整 Player）投影成可持久化的 Round／RoundMatch，
// 並推導出下一輪要用的重複比對基準與休息次數 patch。本檔 SHALL NOT 重新實作
// allocateRound 已負責的排序、配對或重複迴避（design Decision 1、tasks 4.7）。

import { allocateRound } from "./allocation";
import { EMPTY_SIGNATURE_INDEX, PLAYERS_PER_MATCH } from "./allocation-types";
import { buildSignatureIndex } from "./duplication";
import type { Match, MatchFormat, RoundAllocation, SignatureIndex, Team } from "./allocation-types";
import type { Player } from "./types";
import type { PlayerRating, Round, RoundMatch, RoundTeam, SeenSignatures } from "./round-types";
import { DEFAULT_TARGET_SCORE } from "./round-types";

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

function toRoundMatch(match: Match, id: string): RoundMatch {
	const teams: [RoundTeam, RoundTeam] = [toRoundTeam(match.teams[0]), toRoundTeam(match.teams[1])];

	return {
		id,
		courtNumber: match.courtNumber,
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
// 東西」的本輪欄位再併入*下一輪*的避讓基準，如此遞迴下去，兩輪前、三輪前的簽章會透過
// 這條路徑無限傳遞，等同真的在累積全部歷史，違反 design Decision 2「基準只取上一輪，
// 不累積更早的回合」。讓「保存」與「避讓基準」在這一點上分岔，才能讓累積鏈長度恆為 1。
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
	const { players, format, courtCount, previousRound, now, newMatchId } = input;

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

	const matches = allocation.matches.map((match) => toRoundMatch(match, newMatchId()));

	const round: Round = {
		roundNumber: previousRound === null ? 1 : previousRound.roundNumber + 1,
		createdAt: now,
		format,
		courtCount,
		targetScore: DEFAULT_TARGET_SCORE,
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
