import { describe, it, expect } from "vitest";

import { createRound, resetIncompleteMatches, setTargetScore, RESET_INCOMPLETE_MATCHES_FAILURE_CODE, ROUND_FAILURE_CODE } from "./round";
import { fullMatchKey, opponentKeys, teammateKeys } from "./duplication";
import { updatePlayer } from "./roster";
import { DEFAULT_TARGET_SCORE } from "./round-types";
import { PLAYERS_PER_MATCH } from "./allocation-types";
import type { Match, Team } from "./allocation-types";
import type { Player } from "./types";
import type { Round, RoundMatch } from "./round-types";

// 測試用的完整參賽者建構器，與 allocation.test.ts／duplication.test.ts 同構，
// 刻意不共用——round.test.ts 保持獨立、不依賴其他測試檔。
function makePlayer(overrides: Partial<Player> = {}): Player {
	return {
		id: "p1",
		name: "小明",
		gender: "male",
		colorFrom: "#0E6B63",
		colorTo: "#134E4A",
		rating: 3,
		restCount: 0,
		gamesPlayed: 0,
		isActive: true,
		createdAt: "2026-08-15T00:00:00.000Z",
		...overrides,
	};
}

/** 建立一份合法的測試用 RoundMatch，可透過 overrides 覆寫特定欄位（沿用 round-types.test.ts 的樣板）。 */
function makeRoundMatch(overrides: Partial<RoundMatch> = {}): RoundMatch {
	return {
		id: "match-1",
		courtNumber: 1,
		format: "singles",
		teams: [
			{ playerIds: ["p1"], rating: 5 },
			{ playerIds: ["p2"], rating: 6 },
		],
		status: "pending",
		scores: null,
		winner: null,
		completedAt: null,
		playerRatings: [
			{ playerId: "p1", before: 5, after: null },
			{ playerId: "p2", before: 6, after: null },
		],
		...overrides,
	};
}

/**
 * 已完成場次的樣板：makeRoundMatch 的預設狀態是 pending，而 completed 場次還須帶齊比分、
 * 勝方、完成時間與賽後分數（round-types.ts 的 superRefine 對這四者有跨欄位要求）。
 * 覆寫 teams 時 MUST 一併覆寫 playerRatings，兩者的球員必須對得上。
 */
function makeCompletedRoundMatch(overrides: Partial<RoundMatch> = {}): RoundMatch {
	return makeRoundMatch({
		status: "completed",
		scores: { teamA: 11, teamB: 7 },
		winner: "teamA",
		completedAt: "2026-08-22T00:00:00.000Z",
		playerRatings: [
			{ playerId: "p1", before: 5, after: 5.1 },
			{ playerId: "p2", before: 6, after: 5.9 },
		],
		...overrides,
	});
}

/** 建立一份合法的測試用 Round，可透過 overrides 覆寫特定欄位。 */
function makeRound(overrides: Partial<Round> = {}): Round {
	return {
		roundNumber: 1,
		createdAt: "2026-08-16T00:00:00.000Z",
		format: "singles",
		courtCount: 1,
		targetScore: 11,
		matches: [],
		restingPlayerIds: [],
		seenSignatures: {
			teammateKeys: [],
			opponentKeys: [],
			fullMatchKeys: [],
		},
		...overrides,
	};
}

// createRound 為純函式，時間與場次 id 一律由呼叫端注入（不得呼叫 Date.now()／
// crypto.randomUUID()，理由同 roster.ts 的 AddPlayerContext）。場次數量在呼叫前無法
// 預知（取決於出場人數與場地數），故用產生器而非固定長度陣列——固定陣列不是配額不足
// 就是配額過剩，產生器兩者皆不會發生。
const FIXED_NOW = "2026-08-23T00:00:00.000Z";
function makeIdGenerator(prefix: string): () => string {
	let counter = 0;
	return () => `${prefix}-${++counter}`;
}

// 用來算「期望簽章字串」的最小 Match fixture——直接呼叫 duplication.ts 的真實
// teammateKeys／opponentKeys／fullMatchKey，不在本檔重新拼出分隔符與排序邏輯
// （避免重複實作既有邏輯）。吃 id 陣列而非單一 id：單打隊伍傳 1 個 id、雙打隊伍傳 2 個，
// 由呼叫端決定人數（reviewer B1：既有版本恆為單打，teammateKeys 恆為 []）。
function makeSignatureTeam(ids: readonly string[]): Team {
	return { players: ids.map((id) => makePlayer({ id })), rating: 0 };
}

// format 固定回傳 "singles" 變體，即使餵入雙打陣容（每隊 2 個 id）：teammateKeys／
// opponentKeys／fullMatchKey 三個簽章函式只讀 team.players 的 id 與人數（見 duplication.ts
// 頂端註解），完全不讀取 Match.format 或 doublesComposition，回傳哪個 discriminated union
// 分支都不影響任何期望簽章字串的計算結果；固定用 "singles" 可讓本函式免於為了滿足型別
// 而猜測或還原 doublesComposition 標示。
function makeSignatureMatch(teamAIds: readonly string[], teamBIds: readonly string[]): Match {
	return { courtNumber: 1, format: "singles", teams: [makeSignatureTeam(teamAIds), makeSignatureTeam(teamBIds)] };
}

describe("createRound", () => {
	it("首輪回合編號為 1，基準為空且所有場次為 pending", () => {
		const players = [makePlayer({ id: "p1" }), makePlayer({ id: "p2" })];

		const result = createRound({
			players,
			format: "singles",
			courtCount: 1,
			previousRound: null,
			now: FIXED_NOW,
			newMatchId: makeIdGenerator("m"),
		});

		expect(result.ok).toBe(true);
		if (!result.ok) return;

		expect(result.round.roundNumber).toBe(1);
		expect(result.round.seenSignatures).toEqual({
			teammateKeys: [],
			opponentKeys: [],
			fullMatchKeys: [],
		});
		expect(result.round.matches.length).toBeGreaterThan(0);
		for (const match of result.round.matches) {
			expect(match.status).toBe("pending");
			expect(match.scores).toBeNull();
			expect(match.winner).toBeNull();
			expect(match.completedAt).toBeNull();
		}
	});

	it("產生新一輪時回合編號加 1 並取代目前回合", () => {
		const players = [makePlayer({ id: "p1" }), makePlayer({ id: "p2" })];
		const previousRound = makeRound({ roundNumber: 3 });

		const result = createRound({
			players,
			format: "singles",
			courtCount: 1,
			previousRound,
			now: FIXED_NOW,
			newMatchId: makeIdGenerator("m"),
		});

		expect(result.ok).toBe(true);
		if (!result.ok) return;

		expect(result.round.roundNumber).toBe(4);
		// not.toBe(previousRound) 近似恆真——createRound 永遠回傳新物件字面量，這個斷言
		// 幾乎不可能轉紅。改為能實際證明「取代」的斷言：createdAt 等於本次注入的時間、
		// 且所有場次皆為 pending，只有「真的用新輸入重新產生」才會同時成立（reviewer N3）。
		expect(result.round.createdAt).toBe(FIXED_NOW);
		expect(result.round.matches.every((m) => m.status === "pending")).toBe(true);
	});

	it("產生本輪時決定目標分數，未指定時採預設 11", () => {
		const players = [makePlayer({ id: "p1" }), makePlayer({ id: "p2" })];

		const explicit = createRound({
			players,
			format: "singles",
			courtCount: 1,
			previousRound: null,
			now: FIXED_NOW,
			newMatchId: makeIdGenerator("m"),
			targetScore: 15,
		});
		const omitted = createRound({
			players,
			format: "singles",
			courtCount: 1,
			previousRound: null,
			now: FIXED_NOW,
			newMatchId: makeIdGenerator("m"),
		});

		expect(explicit.ok).toBe(true);
		expect(omitted.ok).toBe(true);
		if (!explicit.ok || !omitted.ok) return;

		expect(explicit.round.targetScore).toBe(15);
		// 「該輪所有場次共用此值」是結構上的保證，不需逐場斷言：RoundMatch 根本沒有
		// targetScore 欄位（round-types.ts），目標分數只存在於回合層級這一個位置。
		expect(omitted.round.targetScore).toBe(DEFAULT_TARGET_SCORE);
		// 上一條只證明 createRound 採用了那個常數，不證明常數本身是 11；而本 it 名稱與
		// spec 都明訂預設值 MUST 為 11，套件中又沒有其他測試釘住這個字面值（round-types.test.ts
		// 只釘住 11／15／21 這個值域，不含「預設是哪一個」），故在此補釘。
		expect(DEFAULT_TARGET_SCORE).toBe(11);
	});

	it("簽章基準以字串陣列保存，呼叫 allocateRound 前轉為 Set", () => {
		const players = [makePlayer({ id: "p1" }), makePlayer({ id: "p2" })];
		// 上一輪已有一場完成的對戰，確保本次計算出的基準非空——若 round.ts 忘記把
		// SeenSignatures 的字串陣列轉成 Set 才餵給 allocateRound，duplication.ts 內部
		// 呼叫的 seen.teammateKeys.has(...) 會直接拋出 TypeError（陣列沒有 .has 方法），
		// 讓 result.ok 落回 false，而非本測試預期的 true。
		const previousRound = makeRound({
			roundNumber: 1,
			matches: [
				makeRoundMatch({
					id: "prev-1",
					status: "completed",
					teams: [
						{ playerIds: ["p1"], rating: 3 },
						{ playerIds: ["p2"], rating: 3 },
					],
					scores: { teamA: 11, teamB: 5 },
					winner: "teamA",
					completedAt: "2026-08-22T00:00:00.000Z",
					playerRatings: [
						{ playerId: "p1", before: 3, after: 3.1 },
						{ playerId: "p2", before: 3, after: 2.9 },
					],
				}),
			],
		});

		const result = createRound({
			players,
			format: "singles",
			courtCount: 1,
			previousRound,
			now: FIXED_NOW,
			newMatchId: makeIdGenerator("m"),
		});

		expect(result.ok).toBe(true);
		if (!result.ok) return;

		const { seenSignatures } = result.round;
		expect(Array.isArray(seenSignatures.teammateKeys)).toBe(true);
		expect(Array.isArray(seenSignatures.opponentKeys)).toBe(true);
		expect(Array.isArray(seenSignatures.fullMatchKeys)).toBe(true);
		// JSON 往返不變是陣列（而非 Set）的直接證據：Set 直接 JSON.stringify 會變成 "{}"。
		expect(JSON.parse(JSON.stringify(seenSignatures))).toEqual(seenSignatures);
		expect(seenSignatures.opponentKeys.length).toBeGreaterThan(0);
		expect(seenSignatures.fullMatchKeys.length).toBeGreaterThan(0);
	});

	it("上一輪已完成與進行中的場次納入重複比對基準", () => {
		// 8 人雙打、courtCount: 2：兩場都是雙打（2 人一隊），讓 teammateKeys 非空。若沿用
		// 單打 fixture，teammateKeys 恆為 []，spec 明寫的「隊友」子句會空洞成立、零斷言
		// （reviewer B1）。這同時是套件內唯一一次讓 createRound 成功走過 format: "doubles"
		// 的測試，一併覆蓋 toRoundMatch 的 doublesComposition 分支，以及簽章 shim
		// （toSignaturePlayer／toSignatureTeam／toSignatureMatch）處理 2-id 隊伍的路徑。
		const players = [
			makePlayer({ id: "p1" }),
			makePlayer({ id: "p2" }),
			makePlayer({ id: "p3" }),
			makePlayer({ id: "p4" }),
			makePlayer({ id: "p5" }),
			makePlayer({ id: "p6" }),
			makePlayer({ id: "p7" }),
			makePlayer({ id: "p8" }),
		];
		const previousRound = makeRound({
			roundNumber: 1,
			format: "doubles",
			courtCount: 2,
			matches: [
				makeRoundMatch({
					id: "prev-1",
					courtNumber: 1,
					format: "doubles",
					doublesComposition: "general",
					status: "completed",
					teams: [
						{ playerIds: ["p1", "p2"], rating: 6 },
						{ playerIds: ["p3", "p4"], rating: 6 },
					],
					scores: { teamA: 11, teamB: 5 },
					winner: "teamA",
					completedAt: "2026-08-22T00:00:00.000Z",
					playerRatings: [
						{ playerId: "p1", before: 3, after: 3.1 },
						{ playerId: "p2", before: 3, after: 3.1 },
						{ playerId: "p3", before: 3, after: 2.9 },
						{ playerId: "p4", before: 3, after: 2.9 },
					],
				}),
				makeRoundMatch({
					id: "prev-2",
					courtNumber: 2,
					format: "doubles",
					doublesComposition: "general",
					status: "scoring",
					teams: [
						{ playerIds: ["p5", "p6"], rating: 6 },
						{ playerIds: ["p7", "p8"], rating: 6 },
					],
					playerRatings: [
						{ playerId: "p5", before: 3, after: null },
						{ playerId: "p6", before: 3, after: null },
						{ playerId: "p7", before: 3, after: null },
						{ playerId: "p8", before: 3, after: null },
					],
				}),
			],
		});

		const result = createRound({
			players,
			format: "doubles",
			courtCount: 2,
			previousRound,
			now: FIXED_NOW,
			newMatchId: makeIdGenerator("m"),
		});

		expect(result.ok).toBe(true);
		if (!result.ok) return;

		const completedMatch = makeSignatureMatch(["p1", "p2"], ["p3", "p4"]);
		const scoringMatch = makeSignatureMatch(["p5", "p6"], ["p7", "p8"]);
		const { seenSignatures } = result.round;

		for (const key of teammateKeys(completedMatch)) {
			expect(seenSignatures.teammateKeys).toContain(key);
		}
		for (const key of opponentKeys(completedMatch)) {
			expect(seenSignatures.opponentKeys).toContain(key);
		}
		expect(seenSignatures.fullMatchKeys).toContain(fullMatchKey(completedMatch));
		for (const key of teammateKeys(scoringMatch)) {
			expect(seenSignatures.teammateKeys).toContain(key);
		}
		for (const key of opponentKeys(scoringMatch)) {
			expect(seenSignatures.opponentKeys).toContain(key);
		}
		expect(seenSignatures.fullMatchKeys).toContain(fullMatchKey(scoringMatch));
	});

	it("上一輪未開始的場次不納入基準也不寫入歷史", () => {
		const players = [makePlayer({ id: "p1" }), makePlayer({ id: "p2" })];
		const previousRound = makeRound({
			roundNumber: 1,
			matches: [
				makeRoundMatch({
					id: "prev-1",
					status: "pending",
					teams: [
						{ playerIds: ["p1"], rating: 3 },
						{ playerIds: ["p2"], rating: 3 },
					],
				}),
			],
		});

		const result = createRound({
			players,
			format: "singles",
			courtCount: 1,
			previousRound,
			now: FIXED_NOW,
			newMatchId: makeIdGenerator("m"),
		});

		expect(result.ok).toBe(true);
		if (!result.ok) return;

		const pendingMatch = makeSignatureMatch(["p1"], ["p2"]);
		const { seenSignatures } = result.round;

		expect(seenSignatures.fullMatchKeys).not.toContain(fullMatchKey(pendingMatch));
		for (const key of opponentKeys(pendingMatch)) {
			expect(seenSignatures.opponentKeys).not.toContain(key);
		}
		// createRound 不具備寫入歷史的能力（那是 §6 submitScore 的職責，本函式完全不
		// import history.ts、不碰 localStorage）——回傳形狀本身就是這個保證的證據：
		// 成功結果只有 { ok, round, restSettlements } 三個欄位，不含任何歷史相關欄位。
		// 用單一結構斷言取代兩個各別的 not.toHaveProperty：後者只證明「這個特定名稱不存在」，
		// 對任何未列出的屬性名稱都恆真；直接比對完整鍵集合才是真的把「只有這三個欄位」
		// 斷言出來，等價於原本兩條再加上「沒有其他意料外欄位」（reviewer N7）。
		expect(Object.keys(result).sort()).toEqual(["ok", "restSettlements", "round"]);
	});

	it("重複比對基準只取上一輪，不累積更早的回合", () => {
		const players = [makePlayer({ id: "p1" }), makePlayer({ id: "p2" })];
		const newMatchId = makeIdGenerator("m");

		const round1Result = createRound({
			players,
			format: "singles",
			courtCount: 1,
			previousRound: null,
			now: FIXED_NOW,
			newMatchId,
		});
		expect(round1Result.ok).toBe(true);
		if (!round1Result.ok) return;

		// 手動把第一輪唯一一場標記為已完成，模擬「第一輪有一場已完成」的既有條件，
		// 不透過 §6 尚未實作的 submitScore（不在本組範圍）。
		const round1Completed: Round = {
			...round1Result.round,
			matches: round1Result.round.matches.map((match) => ({
				...match,
				status: "completed",
				scores: { teamA: 11, teamB: 5 },
				winner: "teamA",
				completedAt: "2026-08-22T00:00:00.000Z",
				playerRatings: match.playerRatings.map((r) => ({ ...r, after: r.before })),
			})),
		};

		const round2Result = createRound({
			players,
			format: "singles",
			courtCount: 1,
			previousRound: round1Completed,
			now: FIXED_NOW,
			newMatchId,
		});
		expect(round2Result.ok).toBe(true);
		if (!round2Result.ok) return;

		// 第二輪原樣（未完成任何場次）作為第三輪的上一輪。
		const round3Result = createRound({
			players,
			format: "singles",
			courtCount: 1,
			previousRound: round2Result.round,
			now: FIXED_NOW,
			newMatchId,
		});
		expect(round3Result.ok).toBe(true);
		if (!round3Result.ok) return;

		const round1Match = makeSignatureMatch(["p1"], ["p2"]);
		const { seenSignatures } = round3Result.round;

		expect(seenSignatures.fullMatchKeys).not.toContain(fullMatchKey(round1Match));
		for (const key of opponentKeys(round1Match)) {
			expect(seenSignatures.opponentKeys).not.toContain(key);
		}
	});

	it("產生新一輪時上一輪休息者的 restCount 加 1，出場者不變", () => {
		const players = [
			makePlayer({ id: "a", restCount: 0 }),
			makePlayer({ id: "b", restCount: 0 }),
			makePlayer({ id: "c", restCount: 2 }),
			makePlayer({ id: "d", restCount: 2 }),
		];
		// 上一輪的休息名單直接以 fixture 指定 c、d，不透過 selectPlaying 實際跑一輪去湊出
		// 這個名單——本測試只關心 createRound 如何消費 restingPlayerIds，不關心「誰該休息」
		// 這個排序決策（那是 candidates.ts 的職責，見 4.7 的職責邊界）。
		const previousRound = makeRound({ roundNumber: 1, restingPlayerIds: ["c", "d"] });
		// tasks 4.6／design Decision 1 的核心約束：createRound SHALL NOT 修改任何 Player
		// 物件（休息次數的結算只回傳 patch，套用是呼叫端的職責）。這一點先前沒有測試守門，
		// 這裡補上 regression guard，同時對應 spec Scenario 的「上一輪出場者的 restCount
		// 不變」（reviewer N4）。
		const playersSnapshot = structuredClone(players);

		const result = createRound({
			players,
			format: "singles",
			courtCount: 1,
			previousRound,
			now: FIXED_NOW,
			newMatchId: makeIdGenerator("m"),
		});

		expect(result.ok).toBe(true);
		if (!result.ok) return;

		expect(players).toEqual(playersSnapshot);
		expect(result.restSettlements).toEqual(
			expect.arrayContaining([
				{ id: "c", restCount: 3 },
				{ id: "d", restCount: 3 },
			]),
		);
		expect(result.restSettlements).toHaveLength(2);
		expect(result.restSettlements.some((s) => s.id === "a" || s.id === "b")).toBe(false);
	});

	it("產生首輪時不結算任何人的 restCount", () => {
		const players = [makePlayer({ id: "p1" }), makePlayer({ id: "p2" })];

		const result = createRound({
			players,
			format: "singles",
			courtCount: 1,
			previousRound: null,
			now: FIXED_NOW,
			newMatchId: makeIdGenerator("m"),
		});

		expect(result.ok).toBe(true);
		if (!result.ok) return;

		expect(result.restSettlements).toEqual([]);
	});

	it("連續產生多輪時同一輪的休息名單只被結算一次", () => {
		const initialPlayers = [
			makePlayer({ id: "a", restCount: 0 }),
			makePlayer({ id: "b", restCount: 0 }),
			makePlayer({ id: "c", restCount: 0 }),
			makePlayer({ id: "d", restCount: 0 }),
		];
		// 第 1 輪的休息者為 C：以 fixture 直接指定，理由同上一個 it。
		const round1 = makeRound({ roundNumber: 1, restingPlayerIds: ["c"] });

		const round2Result = createRound({
			players: initialPlayers,
			format: "singles",
			courtCount: 1,
			previousRound: round1,
			now: FIXED_NOW,
			newMatchId: makeIdGenerator("m"),
		});
		expect(round2Result.ok).toBe(true);
		if (!round2Result.ok) return;
		expect(round2Result.restSettlements).toEqual([{ id: "c", restCount: 1 }]);

		// 套用第 1 輪的結算（C 現在 restCount = 1），並把「第 2 輪的休息名單」改為 D
		// （模擬 C 這次有出場，只有 D 休息）——藉此把「第 2 輪自身的休息事件」與
		// 「第 1 輪已經結算過的休息事件」區分開來。
		const playersAfterRound2 = updatePlayer(initialPlayers, "c", { restCount: 1 });
		const round2WithDResting: Round = { ...round2Result.round, restingPlayerIds: ["d"] };

		const round3Result = createRound({
			players: playersAfterRound2,
			format: "singles",
			courtCount: 1,
			previousRound: round2WithDResting,
			now: FIXED_NOW,
			newMatchId: makeIdGenerator("m"),
		});
		expect(round3Result.ok).toBe(true);
		if (!round3Result.ok) return;

		// C 因第 1 輪而增加的次數恰為 1：第 3 輪的結算只看第 2 輪（此處已被覆寫為 D）
		// 的休息名單，不會讓 C 因為第 1 輪的事件被再次結算。
		expect(round3Result.restSettlements.some((s) => s.id === "c")).toBe(false);
		expect(round3Result.restSettlements).toEqual([{ id: "d", restCount: 1 }]);
	});

	it("暫停出場者不因本輪休息而累加 restCount", () => {
		// C 暫停出場（isActive: false）。上一輪由真正的 createRound 產生（而非手寫
		// fixture），藉此走過 candidates.ts 的真實過濾邏輯：暫停者完全不進入
		// resting／playing 候選池，本 it 驗證這個保證會正確傳遞到 restSettlements，
		// round.ts 不需要（也不應該）自行重複這層 isActive 過濾。
		const players = [
			makePlayer({ id: "a", isActive: true, restCount: 0 }),
			makePlayer({ id: "b", isActive: true, restCount: 0 }),
			makePlayer({ id: "c", isActive: false, restCount: 0 }),
			makePlayer({ id: "d", isActive: true, restCount: 0 }),
		];

		const round1Result = createRound({
			players,
			format: "singles",
			courtCount: 1,
			previousRound: null,
			now: FIXED_NOW,
			newMatchId: makeIdGenerator("m"),
		});
		expect(round1Result.ok).toBe(true);
		if (!round1Result.ok) return;
		// 前提：C 不在上一輪的休息名單中（它從未進入候選池）。
		expect(round1Result.round.restingPlayerIds).not.toContain("c");

		const round2Result = createRound({
			players,
			format: "singles",
			courtCount: 1,
			previousRound: round1Result.round,
			now: FIXED_NOW,
			newMatchId: makeIdGenerator("m"),
		});
		expect(round2Result.ok).toBe(true);
		if (!round2Result.ok) return;

		expect(round2Result.restSettlements.some((s) => s.id === "c")).toBe(false);
	});

	it("名單為空時不建立回合並提示新增參賽者", () => {
		const result = createRound({
			players: [],
			format: "singles",
			courtCount: 1,
			previousRound: null,
			now: FIXED_NOW,
			newMatchId: makeIdGenerator("m"),
		});

		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.code).toBe(ROUND_FAILURE_CODE.EMPTY_ROSTER);
		expect(result.message).toContain("新增參賽者");
	});

	it("單打不足 2 人或雙打不足 4 人時不建立回合", () => {
		// 所需人數比 PLAYERS_PER_MATCH 少 1（唯一人數來源，測試檔也適用——不得另行寫死
		// 2／4 反推的字面量陣列，reviewer N2）。
		const singlesResult = createRound({
			players: Array.from({ length: PLAYERS_PER_MATCH.singles - 1 }, (_, i) => makePlayer({ id: `p${i + 1}` })),
			format: "singles",
			courtCount: 1,
			previousRound: null,
			now: FIXED_NOW,
			newMatchId: makeIdGenerator("m"),
		});
		expect(singlesResult.ok).toBe(false);
		if (!singlesResult.ok) {
			expect(singlesResult.code).toBe(ROUND_FAILURE_CODE.INSUFFICIENT_PLAYERS);
		}

		const doublesResult = createRound({
			players: Array.from({ length: PLAYERS_PER_MATCH.doubles - 1 }, (_, i) => makePlayer({ id: `p${i + 1}` })),
			format: "doubles",
			courtCount: 1,
			previousRound: null,
			now: FIXED_NOW,
			newMatchId: makeIdGenerator("m"),
		});
		expect(doublesResult.ok).toBe(false);
		if (!doublesResult.ok) {
			expect(doublesResult.code).toBe(ROUND_FAILURE_CODE.INSUFFICIENT_PLAYERS);
		}
	});

	it("全員暫停出場時的訊息與名單為空時不同", () => {
		const players = Array.from({ length: 6 }, (_, i) => makePlayer({ id: `p${i + 1}`, isActive: false }));

		const allPausedResult = createRound({
			players,
			format: "singles",
			courtCount: 1,
			previousRound: null,
			now: FIXED_NOW,
			newMatchId: makeIdGenerator("m"),
		});
		const emptyResult = createRound({
			players: [],
			format: "singles",
			courtCount: 1,
			previousRound: null,
			now: FIXED_NOW,
			newMatchId: makeIdGenerator("m"),
		});

		expect(allPausedResult.ok).toBe(false);
		expect(emptyResult.ok).toBe(false);
		if (allPausedResult.ok || emptyResult.ok) return;
		expect(allPausedResult.code).toBe(ROUND_FAILURE_CODE.ALL_PAUSED);
		expect(allPausedResult.message).not.toBe(emptyResult.message);
	});

	it("產生失敗時既有回合與 restCount 皆不受影響", () => {
		const previousRound = makeRound({ roundNumber: 2 });
		// 深拷貝快照沿用 codebase 既有慣例（見 allocation.test.ts、rating.test.ts）：
		// structuredClone 不像 JSON 往返需要型別斷言（JSON.parse 回傳 any），reviewer N1。
		const previousRoundSnapshot = structuredClone(previousRound);
		// 全員暫停：確保會走到失敗路徑。
		const players = [makePlayer({ id: "p1", isActive: false }), makePlayer({ id: "p2", isActive: false })];

		const result = createRound({
			players,
			format: "singles",
			courtCount: 1,
			previousRound,
			now: FIXED_NOW,
			newMatchId: makeIdGenerator("m"),
		});

		expect(result.ok).toBe(false);
		// 既有回合原封不動：createRound 對失敗輸入不做任何就地修改。
		expect(previousRound).toEqual(previousRoundSnapshot);
		// 失敗結果的形狀裡沒有 restSettlements 這個欄位——沒有任何休息次數被結算。
		expect("restSettlements" in result).toBe(false);
	});

	it("場地數不合法時接住例外並轉為失敗結果", () => {
		const players = [makePlayer({ id: "p1" }), makePlayer({ id: "p2" })];

		for (const courtCount of [0, 9, 1.5]) {
			let result: ReturnType<typeof createRound> | undefined;

			expect(() => {
				result = createRound({
					players,
					format: "singles",
					courtCount,
					previousRound: null,
					now: FIXED_NOW,
					newMatchId: makeIdGenerator("m"),
				});
			}).not.toThrow();

			expect(result?.ok).toBe(false);
			if (result !== undefined && !result.ok) {
				expect(result.code).toBe(ROUND_FAILURE_CODE.INVALID_COURT_COUNT);
			}
		}
	});
});

describe("setTargetScore", () => {
	it("所有場次皆為 pending 時可改目標分數，已有場次離開 pending 時拒絕", () => {
		const pendingRound = makeRound({
			matches: [makeRoundMatch({ id: "m-1" }), makeRoundMatch({ id: "m-2", courtNumber: 2 })],
		});
		const pendingRoundSnapshot = structuredClone(pendingRound);

		const changed = setTargetScore(pendingRound, 21);

		expect(changed.ok).toBe(true);
		if (!changed.ok) return;
		expect(changed.round.targetScore).toBe(21);
		// 「其餘欄位不變」：把 targetScore 改回原值後應與原回合完全相等。單一結構比對取代
		// 逐欄斷言——逐欄只證明「列出來的那幾個欄位沒變」，日後新增欄位不會有任何提醒。
		expect({ ...changed.round, targetScore: pendingRound.targetScore }).toEqual(pendingRound);
		expect(pendingRound).toEqual(pendingRoundSnapshot);

		// scoring 與 completed 都算「已離開 pending」，兩者分別驗證：只測其中一個時，
		// 把判定寫成單一狀態比對（例如僅檢查 completed）的實作仍會全綠。
		const lockedMatches: RoundMatch[] = [
			makeRoundMatch({ id: "m-2", courtNumber: 2, status: "scoring" }),
			makeCompletedRoundMatch({ id: "m-2", courtNumber: 2 }),
		];

		for (const lockedMatch of lockedMatches) {
			const lockedRound = makeRound({ matches: [makeRoundMatch({ id: "m-1" }), lockedMatch] });
			const lockedRoundSnapshot = structuredClone(lockedRound);

			const rejected = setTargetScore(lockedRound, 21);

			expect(rejected.ok).toBe(false);
			if (rejected.ok) continue;
			expect(rejected.message).toContain("目標分數");
			expect(lockedRound).toEqual(lockedRoundSnapshot);
		}
	});
});

// 取出一組場次裡的所有球員 id，供「誰有出場」類斷言使用。
function playerIdsOf(matches: readonly RoundMatch[]): string[] {
	return matches.flatMap((match) => match.teams.flatMap((team) => team.playerIds));
}

describe("resetIncompleteMatches", () => {
	it("沒有回合或沒有 pending 場次時重排被拒絕", () => {
		const players = [makePlayer({ id: "p1" }), makePlayer({ id: "p2" })];
		// 沒有回合以 null 表達（與 CreateRoundInput.previousRound 同一種表達方式），
		// 呼叫端不必先自行判斷有沒有回合才敢呼叫。
		const allCompletedRound = makeRound({ matches: [makeCompletedRoundMatch({ id: "done" })] });
		const allCompletedSnapshot = structuredClone(allCompletedRound);

		let noRound: ReturnType<typeof resetIncompleteMatches> | undefined;
		let noPending: ReturnType<typeof resetIncompleteMatches> | undefined;

		// 兩者皆 SHALL NOT 拋出例外——UI 靠回傳值決定按鈕是否顯示，拋例外會讓整個畫面掛掉。
		expect(() => {
			noRound = resetIncompleteMatches(null, players, { newMatchId: makeIdGenerator("r") });
		}).not.toThrow();
		expect(() => {
			noPending = resetIncompleteMatches(allCompletedRound, players, { newMatchId: makeIdGenerator("r") });
		}).not.toThrow();

		expect(noRound?.ok).toBe(false);
		if (noRound !== undefined && !noRound.ok) {
			expect(noRound.code).toBe(RESET_INCOMPLETE_MATCHES_FAILURE_CODE.NO_ROUND);
			expect(noRound.message).toContain("回合");
		}

		expect(noPending?.ok).toBe(false);
		if (noPending !== undefined && !noPending.ok) {
			expect(noPending.code).toBe(RESET_INCOMPLETE_MATCHES_FAILURE_CODE.NO_PENDING_MATCH);
			expect(noPending.message).toContain("尚未開始");
		}

		// 兩種失敗原因的修正方式不同（一個要先產生本輪、一個要直接產生新一輪），訊息 MUST 不同。
		if (noRound !== undefined && !noRound.ok && noPending !== undefined && !noPending.ok) {
			expect(noRound.message).not.toBe(noPending.message);
		}
		// SHALL NOT 產生新回合，既有回合也不被就地修改。
		expect(allCompletedRound).toEqual(allCompletedSnapshot);
	});

	it("重排保留已完成場次的比分、勝方與賽前賽後分數", () => {
		const players = [makePlayer({ id: "p1" }), makePlayer({ id: "p2" }), makePlayer({ id: "p3" }), makePlayer({ id: "p4" })];
		const completedMatch = makeCompletedRoundMatch({
			id: "done",
			courtNumber: 1,
			teams: [
				{ playerIds: ["p1"], rating: 3 },
				{ playerIds: ["p2"], rating: 3 },
			],
			playerRatings: [
				{ playerId: "p1", before: 3, after: 3.1 },
				{ playerId: "p2", before: 3, after: 2.9 },
			],
		});
		const round = makeRound({
			courtCount: 2,
			matches: [
				completedMatch,
				makeRoundMatch({
					id: "todo",
					courtNumber: 2,
					teams: [
						{ playerIds: ["p3"], rating: 3 },
						{ playerIds: ["p4"], rating: 3 },
					],
					playerRatings: [
						{ playerId: "p3", before: 3, after: null },
						{ playerId: "p4", before: 3, after: null },
					],
				}),
			],
		});
		const completedSnapshot = structuredClone(completedMatch);

		const result = resetIncompleteMatches(round, players, { newMatchId: makeIdGenerator("r") });

		expect(result.ok).toBe(true);
		if (!result.ok) return;

		// 整場相等一次涵蓋 scores／winner／completedAt／playerRatings 四項，並且連 id、
		// 場地編號、狀態都不能被動到——重排「保留」的意思就是原封不動。
		expect(result.round.matches.find((match) => match.id === "done")).toEqual(completedSnapshot);
		// 對照組：原本的 pending 場次確實被換掉了。少了這一條，一個什麼都不做、原樣回傳
		// 整個回合的實作也會讓上面的斷言成立。
		expect(result.round.matches.some((match) => match.id === "todo")).toBe(false);
		expect(result.round.matches).toHaveLength(2);
	});

	it("重排的候選池含休息名單成員，已比賽者不再納入", () => {
		// A、B、G、H 的 restCount 刻意設為全場最高：若實作忘了把已比賽者排除於候選池之外，
		// 他們會是「休息次數多者優先」下最先被選中的人，本 it 才會真的轉紅。A、B 掛在
		// completed 場次、G、H 掛在 scoring 場次，兩種「已比賽」狀態各驗一次。F 的
		// restCount 刻意介於 C、D 之間，把候選池撐到 4 人——這是關鍵：courtCount 3 扣掉
		// 2 場保留場次後可用場地只剩 1（單打 2 人名額），若候選池只有 3 人會被「人數」
		// 卡住而非「場地數」卡住，就驗不出場地扣除是否正確。其餘人 rating 全部相同，
		// 出場人選只由 restCount 決定，不靠強度排序的巧合。
		const players = [
			makePlayer({ id: "a", restCount: 9 }),
			makePlayer({ id: "b", restCount: 9 }),
			makePlayer({ id: "c", restCount: 1 }),
			makePlayer({ id: "d", restCount: 0 }),
			makePlayer({ id: "e", restCount: 5 }),
			makePlayer({ id: "f", restCount: 3 }),
			makePlayer({ id: "g", restCount: 9 }),
			makePlayer({ id: "h", restCount: 9 }),
		];
		const scoringMatch = makeRoundMatch({
			id: "live",
			courtNumber: 2,
			status: "scoring",
			teams: [
				{ playerIds: ["g"], rating: 3 },
				{ playerIds: ["h"], rating: 3 },
			],
			playerRatings: [
				{ playerId: "g", before: 3, after: null },
				{ playerId: "h", before: 3, after: null },
			],
		});
		// 重排「保留 scoring 場次」的斷言要靠整場相等來驗證，先在傳入 resetIncompleteMatches
		// 之前存一份快照，理由同上一個 it 對 completed 場次的做法。
		const scoringSnapshot = structuredClone(scoringMatch);
		const round = makeRound({
			courtCount: 3,
			matches: [
				makeCompletedRoundMatch({
					id: "done",
					courtNumber: 1,
					teams: [
						{ playerIds: ["a"], rating: 3 },
						{ playerIds: ["b"], rating: 3 },
					],
					playerRatings: [
						{ playerId: "a", before: 3, after: 3.1 },
						{ playerId: "b", before: 3, after: 2.9 },
					],
				}),
				scoringMatch,
				makeRoundMatch({
					id: "todo",
					courtNumber: 3,
					teams: [
						{ playerIds: ["c"], rating: 3 },
						{ playerIds: ["d"], rating: 3 },
					],
					playerRatings: [
						{ playerId: "c", before: 3, after: null },
						{ playerId: "d", before: 3, after: null },
					],
				}),
			],
			restingPlayerIds: ["e"],
		});

		const result = resetIncompleteMatches(round, players, { newMatchId: makeIdGenerator("r") });

		expect(result.ok).toBe(true);
		if (!result.ok) return;

		const reallocatedIds = playerIdsOf(result.round.matches.filter((match) => match.status === "pending"));
		expect(reallocatedIds).not.toContain("a");
		expect(reallocatedIds).not.toContain("b");
		expect(reallocatedIds).not.toContain("g");
		expect(reallocatedIds).not.toContain("h");
		expect(reallocatedIds).toContain("e");
		// 可用場地只剩 1（court 1 被 completed 場次佔著、court 2 被 scoring 場次佔著，
		// courtCount 3 扣掉這 2 場保留場次後只剩 1），單打 1 場即 2 人名額：E（休息 5 次）
		// 與 F（3 次）依序入選，C（1 次）、D（0 次）落到休息名單——已比賽的 A、B、G、H
		// 都不該混進休息名單。
		expect(reallocatedIds).toHaveLength(PLAYERS_PER_MATCH.singles);
		expect(result.round.restingPlayerIds).toEqual(["c", "d"]);
		// scoring 場次 MUST 原封不動被保留：整場相等一次涵蓋 id、courtNumber、teams、
		// playerRatings 等全部欄位，不是只驗證其中球員未被排入新場次。
		expect(result.round.matches.find((match) => match.id === "live")).toEqual(scoringSnapshot);
	});

	it("重排沿用原回合與前一輪的重複比對基準", () => {
		// 四人強度與休息次數全部相同，出場名單與配對次序因此完全由穩定排序決定：
		// 候選池順序即 p1、p2、p3、p4，未受任何基準影響時 allocateRound 必定排出
		// 「p1 對 p2」「p3 對 p4」——這正是前一輪剛打過的兩組，測試才能分辨基準有沒有被沿用。
		const players = [makePlayer({ id: "p1" }), makePlayer({ id: "p2" }), makePlayer({ id: "p3" }), makePlayer({ id: "p4" })];
		const previousRoundMatches = [makeSignatureMatch(["p1"], ["p2"]), makeSignatureMatch(["p3"], ["p4"])];
		const previousOpponentKeys = previousRoundMatches.flatMap(opponentKeys);
		const round = makeRound({
			courtCount: 2,
			// 本輪的 pending 組合刻意與前一輪不同（p1 對 p3、p2 對 p4）：若兩者相同，
			// 只把「被丟棄的原始組合」併入基準也能讓本 it 轉綠，就分辨不出前一輪的基準
			// 到底有沒有被沿用了。
			matches: [
				makeRoundMatch({
					id: "todo-1",
					courtNumber: 1,
					teams: [
						{ playerIds: ["p1"], rating: 3 },
						{ playerIds: ["p3"], rating: 3 },
					],
					playerRatings: [
						{ playerId: "p1", before: 3, after: null },
						{ playerId: "p3", before: 3, after: null },
					],
				}),
				makeRoundMatch({
					id: "todo-2",
					courtNumber: 2,
					teams: [
						{ playerIds: ["p2"], rating: 3 },
						{ playerIds: ["p4"], rating: 3 },
					],
					playerRatings: [
						{ playerId: "p2", before: 3, after: null },
						{ playerId: "p4", before: 3, after: null },
					],
				}),
			],
			seenSignatures: {
				teammateKeys: previousRoundMatches.flatMap(teammateKeys),
				opponentKeys: previousOpponentKeys,
				fullMatchKeys: previousRoundMatches.map(fullMatchKey),
			},
		});

		const result = resetIncompleteMatches(round, players, { newMatchId: makeIdGenerator("r") });

		expect(result.ok).toBe(true);
		if (!result.ok) return;

		// 從空基準重排會把上一輪剛打過的組合原樣再排一次；重排後的對手組合完全避開那些簽章，
		// 才證明基準真的被餵進了 allocateRound（不是只留在回合欄位上好看）。
		const resultingOpponentKeys = result.round.matches.flatMap((match) =>
			opponentKeys(makeSignatureMatch(match.teams[0].playerIds, match.teams[1].playerIds)),
		);
		for (const key of previousOpponentKeys) {
			expect(resultingOpponentKeys).not.toContain(key);
			expect(result.round.seenSignatures.opponentKeys).toContain(key);
		}
	});

	it("重排把被丟棄的原始組合併入本回合基準", () => {
		const players = [makePlayer({ id: "p1" }), makePlayer({ id: "p2" })];
		const round = makeRound({
			matches: [
				makeRoundMatch({
					id: "todo",
					teams: [
						{ playerIds: ["p1"], rating: 3 },
						{ playerIds: ["p2"], rating: 3 },
					],
					playerRatings: [
						{ playerId: "p1", before: 3, after: null },
						{ playerId: "p2", before: 3, after: null },
					],
				}),
			],
		});
		const discardedMatch = makeSignatureMatch(["p1"], ["p2"]);

		const result = resetIncompleteMatches(round, players, { newMatchId: makeIdGenerator("r") });

		expect(result.ok).toBe(true);
		if (!result.ok) return;

		// 少了這一步，輸入完全沒變時重排會產生一模一樣的結果，使用者按下去看到畫面沒動，
		// 會判定功能壞掉（prd.md 5.6 明列「重設前的原始對戰組合」為需記錄的項目）。
		for (const key of opponentKeys(discardedMatch)) {
			expect(result.round.seenSignatures.opponentKeys).toContain(key);
		}
		expect(result.round.seenSignatures.fullMatchKeys).toContain(fullMatchKey(discardedMatch));
	});

	it("重排不改變回合編號、建立時間、對戰方式與目標分數", () => {
		const players = [makePlayer({ id: "p1" }), makePlayer({ id: "p2" }), makePlayer({ id: "p3" }), makePlayer({ id: "p4" })];
		const round = makeRound({
			roundNumber: 2,
			format: "doubles",
			targetScore: 15,
			matches: [
				makeRoundMatch({
					id: "todo",
					format: "doubles",
					doublesComposition: "general",
					teams: [
						{ playerIds: ["p1", "p2"], rating: 6 },
						{ playerIds: ["p3", "p4"], rating: 6 },
					],
					playerRatings: [
						{ playerId: "p1", before: 3, after: null },
						{ playerId: "p2", before: 3, after: null },
						{ playerId: "p3", before: 3, after: null },
						{ playerId: "p4", before: 3, after: null },
					],
				}),
			],
		});

		const result = resetIncompleteMatches(round, players, { newMatchId: makeIdGenerator("r") });

		expect(result.ok).toBe(true);
		if (!result.ok) return;

		// 重排若走「建立新回合」的同一條路徑，這四個欄位會被一起重設（編號 +1、時間換成
		// 呼叫當下、對戰方式與目標分數退回目前設定），而使用者只是想重排這一輪。
		expect(result.round.roundNumber).toBe(round.roundNumber);
		expect(result.round.createdAt).toBe(round.createdAt);
		expect(result.round.format).toBe(round.format);
		expect(result.round.targetScore).toBe(round.targetScore);
	});

	it("重排未完成場次不觸發休息結算", () => {
		const players = [
			makePlayer({ id: "c", restCount: 1 }),
			makePlayer({ id: "d", restCount: 0 }),
			makePlayer({ id: "e", restCount: 5 }),
		];
		const playersSnapshot = structuredClone(players);
		const round = makeRound({
			matches: [
				makeRoundMatch({
					id: "todo",
					teams: [
						{ playerIds: ["c"], rating: 3 },
						{ playerIds: ["d"], rating: 3 },
					],
					playerRatings: [
						{ playerId: "c", before: 3, after: null },
						{ playerId: "d", before: 3, after: null },
					],
				}),
			],
			restingPlayerIds: ["e"],
		});

		const result = resetIncompleteMatches(round, players, { newMatchId: makeIdGenerator("r") });

		expect(result.ok).toBe(true);
		if (!result.ok) return;

		// 「本輪結束」＝產生新一輪的那一刻（design Decision 1）；重排不是本輪結束，
		// 因此回傳形狀裡根本沒有可以攜帶 restCount patch 的位置——比對完整鍵集合即為證據
		// （單獨的 not.toHaveProperty 對任何未列出的欄位名稱都恆真）。
		expect(Object.keys(result).sort()).toEqual(["ok", "round"]);
		// 也沒有任何 Player 被就地改動：本函式是純函式，restCount 的唯一結算點在 createRound。
		expect(players).toEqual(playersSnapshot);
	});
});
