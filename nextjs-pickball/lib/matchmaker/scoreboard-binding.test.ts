import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Round, RoundMatch } from "./round-types";
import {
	buildMatchSlotSeed,
	ensureMatchSlot,
	mapTeamScores,
	collectFinishedSubmissions,
	toSubmitScoreInput,
	isTargetScoreLocked,
	clearDiscardedMatchSlots,
} from "./scoreboard-binding";
import { writeMatchSlot, readMatchSlot } from "../scoreboard/match-slots";
import type { MatchSlots } from "../scoreboard/match-slots";
import { createInitialState } from "../scoreboard/reducer";
import { submitScore } from "./round";
import { resetMatchmakerData } from "./storage";
import { STORAGE_KEY as SCOREBOARD_STORAGE_KEY } from "../scoreboard/storage";
import type { Player } from "./types";

// 測試專用的最小合法 Round／RoundMatch 建構——逐欄手寫，不放寬型別（不使用 as any）。
function makeRound(overrides: Partial<Round> = {}): Round {
	return {
		roundNumber: 1,
		createdAt: "2026-08-27T00:00:00.000Z",
		format: "doubles",
		courtCount: 2,
		targetScore: 15,
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

function makeMatch(overrides: Partial<RoundMatch> = {}): RoundMatch {
	return {
		id: "match-1",
		courtNumber: 2,
		format: "doubles",
		doublesComposition: "general",
		teams: [
			{ playerIds: ["p1", "p2"], rating: 1000 },
			{ playerIds: ["p3", "p4"], rating: 1000 },
		],
		status: "pending",
		scores: null,
		winner: null,
		completedAt: null,
		playerRatings: [],
		...overrides,
	};
}

describe("scoreboard-binding", () => {
	beforeEach(() => {
		localStorage.clear();
	});

	it("seed 帶入該輪的 targetScore 與對戰方式且分數自 0-0 起手", () => {
		// 刻意讓 round.format 與 match.format 取相異值：兩個欄位都存在，值相同時
		// 誤取 match.format 的實作不會被任何斷言抓到（mutation 實測會全綠）。
		// targetScore 同理取 15 而非預設的 11。
		const round = makeRound({ targetScore: 15, format: "doubles" });
		const match = makeMatch({ id: "match-1", format: "singles", status: "pending" });

		const seed = buildMatchSlotSeed(round, match);

		expect(seed.targetScore).toBe(15);
		expect(seed.mode).toBe("doubles");
		expect(seed.matchId).toBe("match-1");
		expect(seed.scores).toEqual({ us: 0, them: 0 });
		expect(seed.status).toBe("setup");
		// 整體比對：除上述三個來源欄位外，其餘（firstServer 的預設值、servingTeam、
		// serverNumber、空 history、courtNumber…）一律等同 createInitialState。逐欄斷言
		// 漏掉的欄位被 seed 偷偷覆寫時不會紅，整體比對才擋得住。
		expect(seed).toEqual(
			createInitialState({
				mode: "doubles",
				targetScore: 15,
				matchId: "match-1",
				courtNumber: match.courtNumber,
			}),
		);
	});

	it("seed 帶入該場次的場地編號", () => {
		// M37：計分板不得反查 matchmaker:round:v1，場地標示必須在 seed 建立時一併帶入
		const round = makeRound();
		const match = makeMatch({ id: "match-1", courtNumber: 3 });

		const seed = buildMatchSlotSeed(round, match);

		expect(seed.courtNumber).toBe(3);
	});

	it("已有進度的場次再次進入時保留既有進度不覆蓋", () => {
		const existing = {
			...createInitialState({ targetScore: 15, mode: "doubles", matchId: "match-1" }),
			scores: { us: 8, them: 5 },
			status: "playing" as const,
			history: [{ type: "RALLY_WON" as const, winner: "us" as const }],
			matchId: "match-1",
		};
		writeMatchSlot(existing);

		const round = makeRound({ targetScore: 11, format: "singles" });
		const match = makeMatch({ id: "match-1", format: "singles" });
		const seed = buildMatchSlotSeed(round, match);

		const result = ensureMatchSlot(seed);

		expect(result.scores).toEqual({ us: 8, them: 5 });
		expect(result.history).toEqual(existing.history);
		expect(result.targetScore).toBe(15);
		// 「原樣保留」是整份 state 的保留，不只這三欄——只斷言三欄時，
		// 竄改 mode／matchId 的實作不會紅。
		expect(result).toEqual(existing);
		expect(readMatchSlot("match-1")?.scores).toEqual({ us: 8, them: 5 });
	});

	// 額外補（不在 test-plan 內）：ensureMatchSlot 的「無條目 → 寫入 seed」分支
	// 在既有兩個 it 裡都沒被執行到——4.1 未呼叫 ensureMatchSlot，4.3 一律先寫入既有進度
	// 再呼叫，只會走「已有條目」分支。缺這個 it 會讓寫入分支零覆蓋。
	it("尚無條目時 ensureMatchSlot 寫入 seed 並回傳 seed", () => {
		const round = makeRound({ targetScore: 21, format: "singles" });
		const match = makeMatch({ id: "match-2", format: "singles" });
		const seed = buildMatchSlotSeed(round, match);

		const result = ensureMatchSlot(seed);

		expect(seed.mode).toBe("singles");
		expect(seed.targetScore).toBe(21);
		expect(result).toEqual(seed);
		expect(readMatchSlot("match-2")).toEqual(seed);
	});

	// 額外補（不在 test-plan 內）：Stage 2 的零覆蓋盤點發現，readMatchSlot 與
	// writeMatchSlot 各自的 SSR 降級雖已在 §1 測過，但兩者「組合起來」在本模組零覆蓋。
	// ensureMatchSlot 在 SSR 下會讀到 null 而走寫入路徑，寫入又是 no-op——必須回傳 seed
	// 且不 throw，否則 §8 的入口在 server render 期間會直接炸掉。寫法比照
	// lib/scoreboard/match-slots.test.ts 的同性質 SSR 情境。
	it("SSR（無 window）時 ensureMatchSlot 不寫入也不 throw，仍回傳 seed", () => {
		const seed = buildMatchSlotSeed(makeRound(), makeMatch({ id: "match-3" }));

		vi.stubGlobal("window", undefined);
		try {
			// 自證：確認 stub 真的讓 hasLocalStorage() 的 typeof window 分支為 false
			expect(typeof window).toBe("undefined");
			expect(ensureMatchSlot(seed)).toEqual(seed);
		} finally {
			vi.unstubAllGlobals();
		}

		// guard 生效 → 寫入在碰 localStorage 之前就 return，槽內仍無該場條目
		expect(readMatchSlot("match-3")).toBeNull();
	});

	it("第一隊對應 us、第二隊對應 them，來回轉換不顛倒", () => {
		const original = { first: 11, second: 7 };

		const toScoreboard = mapTeamScores(original, "scoreboard");
		expect(toScoreboard).toEqual({ us: 11, them: 7 });

		const backToRound = mapTeamScores(toScoreboard, "round");
		expect(backToRound).toEqual(original);
	});

	// makeSlot：只在測試檔內組裝計分板槽的寫實資料，狀態欄位由呼叫端逐一指定，
	// 不使用 as any——與檔頭 makeRound／makeMatch 的原則一致。
	function makeSlot(overrides: Partial<ReturnType<typeof createInitialState>> = {}) {
		return {
			...createInitialState({ matchId: "placeholder" }),
			...overrides,
		};
	}

	it("只有 finished 的槽才進入待送出清單", () => {
		const round = makeRound({
			matches: [
				makeMatch({ id: "m1" }),
				makeMatch({ id: "m2" }),
				makeMatch({ id: "m3" }),
			],
		});
		const slots: MatchSlots = {
			m1: makeSlot({ matchId: "m1", status: "finished", scores: { us: 11, them: 7 } }),
			m2: makeSlot({ matchId: "m2", status: "playing", scores: { us: 5, them: 3 } }),
			// m3：刻意無槽
		};

		const result = collectFinishedSubmissions(round, slots);

		expect(result).toEqual([{ matchId: "m1", scores: { first: 11, second: 7 } }]);
	});

	it("已完成的場次不重複送出且連續呼叫為冪等", () => {
		const round = makeRound({
			matches: [
				makeMatch({
					id: "m1",
					status: "completed",
					scores: { teamA: 11, teamB: 7 },
					winner: "teamA",
					completedAt: "2026-08-27T00:00:00.000Z",
				}),
			],
		});
		const slots: MatchSlots = {
			m1: makeSlot({ matchId: "m1", status: "finished", scores: { us: 11, them: 7 } }),
		};

		const first = collectFinishedSubmissions(round, slots);
		const second = collectFinishedSubmissions(round, slots);

		expect(first).toEqual([]);
		expect(second).toEqual([]);
	});

	it("槽對應的場次已不在回合中時略過且不拋錯", () => {
		const round = makeRound({ matches: [makeMatch({ id: "m1" })] });
		const slots: MatchSlots = {
			m1: makeSlot({ matchId: "m1", status: "finished", scores: { us: 11, them: 7 } }),
			gone: makeSlot({ matchId: "gone", status: "finished", scores: { us: 9, them: 4 } }),
		};

		let result: ReturnType<typeof collectFinishedSubmissions> = [];
		expect(() => {
			result = collectFinishedSubmissions(round, slots);
		}).not.toThrow();

		expect(result).toEqual([{ matchId: "m1", scores: { first: 11, second: 7 } }]);
	});

	// 額外補（不在 test-plan 內）：Stage 2 的 mutation 盤點發現「迴圈提早 break」「回傳前重新
	// 排序」「只回傳第一筆」三種竄改全數存活——既有三個 it 的預期結果都只有 0 或 1 筆，
	// 無從分辨。此 it 釘住「一次回傳全部符合者」與「維持槽的走訪順序」。
	it("多個符合條件的槽一次全數回傳且維持走訪順序", () => {
		const round = makeRound({
			matches: [makeMatch({ id: "m1" }), makeMatch({ id: "m2" }), makeMatch({ id: "m3" })],
		});
		const slots: MatchSlots = {
			m1: makeSlot({ matchId: "m1", status: "finished", scores: { us: 11, them: 7 } }),
			m2: makeSlot({ matchId: "m2", status: "finished", scores: { us: 6, them: 11 } }),
			m3: makeSlot({ matchId: "m3", status: "playing", scores: { us: 3, them: 2 } }),
		};

		expect(collectFinishedSubmissions(round, slots)).toEqual([
			{ matchId: "m1", scores: { first: 11, second: 7 } },
			{ matchId: "m2", scores: { first: 6, second: 11 } },
		]);
	});

	// 額外補（不在 test-plan 內）：槽的鍵與槽內容自帶的 matchId 是兩個來源，既有測試中
	// 兩者恆等，因此「改用 slot.matchId」的竄改存活。鍵才是槽位的真實來源
	// （writeMatchSlot 以 seed.matchId 為鍵寫入），舊資料內容若不同步不應污染送出對象。
	it("待送出清單的 matchId 取自槽的鍵而非槽內容", () => {
		const round = makeRound({ matches: [makeMatch({ id: "m1" })] });
		const slots: MatchSlots = {
			m1: makeSlot({ matchId: "stale-id", status: "finished", scores: { us: 11, them: 9 } }),
		};

		expect(collectFinishedSubmissions(round, slots)).toEqual([
			{ matchId: "m1", scores: { first: 11, second: 9 } },
		]);
	});

	// 額外補（不在 test-plan 內）：spec 的三個回填條件不含任何比分條件，但既有測試的
	// finished 槽比分恆為一勝一負，因此「誤加平手排除」這類第四條件會存活。同時補上
	// slots 為空物件的路徑（迴圈零次），既有 it 均未涵蓋。
	it("槽為 0-0 卻已 finished 仍列入，slots 為空時回傳空清單", () => {
		const round = makeRound({ matches: [makeMatch({ id: "m1" })] });
		const tiedSlots: MatchSlots = {
			m1: makeSlot({ matchId: "m1", status: "finished", scores: { us: 0, them: 0 } }),
		};

		expect(collectFinishedSubmissions(round, tiedSlots)).toEqual([
			{ matchId: "m1", scores: { first: 0, second: 0 } },
		]);
		expect(collectFinishedSubmissions(round, {})).toEqual([]);
	});

	// 額外補（不在 test-plan 內）：條件三是「尚未完成」，不是「必須為 pending」。既有測試
	// 只有 pending 與 completed 兩種場次，把條件三收緊成 `!== "pending"` 會存活——那會讓
	// scoring 場次（MatchStatus 的第三個合法值）永遠回填不了。
	it("場次為 scoring 尚未完成時仍列入待送出清單", () => {
		const round = makeRound({ matches: [makeMatch({ id: "m1", status: "scoring" })] });
		const slots: MatchSlots = {
			m1: makeSlot({ matchId: "m1", status: "finished", scores: { us: 11, them: 4 } }),
		};

		expect(collectFinishedSubmissions(round, slots)).toEqual([
			{ matchId: "m1", scores: { first: 11, second: 4 } },
		]);
	});

	// makePlayer：submitScore 需要真實 players 才能算評分，逐欄手寫、不使用 as any。
	// 兩隊 rating 刻意取不同值（1000 分制不適用——這裡沿用 PlayerSchema 的 1~8 分制），
	// 讓評分變動的 mutation（例如隊伍對應顛倒）會造成可觀察差異。
	function makePlayer(overrides: Partial<Player> = {}): Player {
		return {
			id: "p1",
			name: "player",
			gender: "other",
			colorFrom: "#000000",
			colorTo: "#ffffff",
			rating: 4,
			restCount: 0,
			gamesPlayed: 0,
			isActive: true,
			createdAt: "2026-08-27T00:00:00.000Z",
			...overrides,
		};
	}

	it("回填與手動輸入的送出結果逐欄相同", () => {
		const players: Player[] = [
			makePlayer({ id: "p1", rating: 5 }),
			makePlayer({ id: "p2", rating: 6 }),
			makePlayer({ id: "p3", rating: 2 }),
			makePlayer({ id: "p4", rating: 3 }),
		];
		const match = makeMatch({
			id: "m1",
			teams: [
				{ playerIds: ["p1", "p2"], rating: 5.5 },
				{ playerIds: ["p3", "p4"], rating: 2.5 },
			],
		});
		const round = makeRound({ matches: [match] });

		// 手動輸入路徑：直接以字串呼叫 submitScore。
		const manualResult = submitScore({
			round,
			players,
			matchId: "m1",
			rawScoreA: "11",
			rawScoreB: "7",
			now: "2026-08-27T01:00:00.000Z",
		});

		// 回填路徑：先由 collectFinishedSubmissions 從 finished 槽算出待送出清單，
		// 再經橋接函式餵給同一個 submitScore——不得自己手工組出 submitScore 的輸入，
		// 否則會失去「兩條路徑真的共用同一入口」這件事的偵測力。
		const slots: MatchSlots = {
			m1: { ...createInitialState({ matchId: "m1" }), status: "finished", scores: { us: 11, them: 7 } },
		};
		const submissions = collectFinishedSubmissions(round, slots);
		expect(submissions).toEqual([{ matchId: "m1", scores: { first: 11, second: 7 } }]);

		const backfillInput = toSubmitScoreInput(submissions[0], {
			round,
			players,
			now: "2026-08-27T02:00:00.000Z",
		});
		const backfillResult = submitScore(backfillInput);

		if (!manualResult.ok || !backfillResult.ok) {
			throw new Error("兩條路徑皆預期成功，測試資料設計有誤");
		}

		// 完成時間必然相異（分別注入的 now）：先各自挑出比對，再從整份物件排除後比對其餘全部，
		// 避免只挑幾欄漏掉某個沒被挑到的欄位分岔。
		expect(manualResult.round.matches[0].completedAt).toBe("2026-08-27T01:00:00.000Z");
		expect(backfillResult.round.matches[0].completedAt).toBe("2026-08-27T02:00:00.000Z");
		expect(manualResult.historyEntry.playedAt).toBe("2026-08-27T01:00:00.000Z");
		expect(backfillResult.historyEntry.playedAt).toBe("2026-08-27T02:00:00.000Z");

		const stripCompletedAt = (r: typeof manualResult.round) => ({
			...r,
			matches: r.matches.map((m) => ({ ...m, completedAt: null })),
		});
		expect(stripCompletedAt(backfillResult.round)).toEqual(stripCompletedAt(manualResult.round));

		const stripPlayedAt = (h: typeof manualResult.historyEntry) => ({ ...h, playedAt: null });
		expect(stripPlayedAt(backfillResult.historyEntry)).toEqual(stripPlayedAt(manualResult.historyEntry));

		expect(backfillResult.playerPatches).toEqual(manualResult.playerPatches);
		expect(backfillResult.boundaryHits).toEqual(manualResult.boundaryHits);

		// 最重要的偵測點：11-7 讓第一隊（teamA）勝，橋接寫反時 winner 會變 teamB。
		expect(manualResult.round.matches[0].winner).toBe("teamA");
		expect(backfillResult.round.matches[0].winner).toBe("teamA");
	});

	// 額外補（不在 test-plan 內）：上一個 it 只透過 submitScore 的結果間接觀察橋接，
	// round 只有一場時「matchId 改取 round.matches[0].id」的竄改會存活。此 it 直接比對
	// toSubmitScoreInput 的完整輸出，六個欄位各自被釘住。
	it("toSubmitScoreInput 的六個欄位分別取自 submission 與 context", () => {
		const players: Player[] = [makePlayer({ id: "p1" }), makePlayer({ id: "p2", rating: 6 })];
		// round 刻意含兩場且目標場次不是第一場，讓「取第一場」的實作被抓到。
		const round = makeRound({
			matches: [makeMatch({ id: "other" }), makeMatch({ id: "m2" })],
		});

		const input = toSubmitScoreInput(
			{ matchId: "m2", scores: { first: 11, second: 8 } },
			{ round, players, now: "2026-08-27T03:00:00.000Z" },
		);

		expect(input).toEqual({
			round,
			players,
			matchId: "m2",
			rawScoreA: "11",
			rawScoreB: "8",
			now: "2026-08-27T03:00:00.000Z",
		});
		// 同一參考而非僅內容相同：本函式只做轉交，SHALL NOT 複製或改寫 round／players。
		expect(input.round).toBe(round);
		expect(input.players).toBe(players);
	});

	it("無任何場次完成且無計分板槽時目標分數未鎖定", () => {
		const round = makeRound({ matches: [makeMatch({ id: "m1", status: "pending" })] });
		const slots: MatchSlots = {};

		const result = isTargetScoreLocked(round, slots);

		expect(result.locked).toBe(false);
		expect(result.reason).toBeNull();
	});

	it("任一場次的計分板槽非 setup 時目標分數鎖定", () => {
		const round = makeRound({
			matches: [makeMatch({ id: "m1", status: "pending" }), makeMatch({ id: "m2", status: "pending" })],
		});
		const slots: MatchSlots = {
			m1: { ...createInitialState({ matchId: "m1" }), status: "playing" },
		};

		const result = isTargetScoreLocked(round, slots);

		expect(result.locked).toBe(true);
		expect(result.reason).toBe("本輪已開始計分，目標分數不可更改。");
	});

	it("槽存在但仍為 setup 時不視為已開始計分", () => {
		const round = makeRound({ matches: [makeMatch({ id: "m1", status: "pending" })] });
		const slots: MatchSlots = {
			m1: { ...createInitialState({ matchId: "m1" }), status: "setup", scores: { us: 0, them: 0 } },
		};

		const result = isTargetScoreLocked(round, slots);

		expect(result.locked).toBe(false);
		expect(result.reason).toBeNull();
	});

	it("已有場次完成時目標分數鎖定，不論比分來源", () => {
		const round = makeRound({
			matches: [
				makeMatch({
					id: "m1",
					status: "completed",
					scores: { teamA: 11, teamB: 7 },
					winner: "teamA",
					completedAt: "2026-08-27T00:00:00.000Z",
				}),
			],
		});
		const slots: MatchSlots = {};

		const result = isTargetScoreLocked(round, slots);

		expect(result.locked).toBe(true);
		expect(result.reason).toBe("本輪已開始計分，目標分數不可更改。");
	});

	// 額外補（不在 test-plan 內）：既有四個 lock 的 it 都只有一場或一個槽，因此
	// 「只檢查第一場」「只檢查第一個槽」的竄改全數存活。兩個 some() 都必須掃完全部。
	it("鎖定判定掃描全部場次與全部槽而非只看第一筆", () => {
		const laterCompleted = makeRound({
			matches: [
				makeMatch({ id: "m1", status: "pending" }),
				makeMatch({
					id: "m2",
					status: "completed",
					scores: { teamA: 11, teamB: 7 },
					winner: "teamA",
					completedAt: "2026-08-27T00:00:00.000Z",
				}),
			],
		});
		expect(isTargetScoreLocked(laterCompleted, {}).locked).toBe(true);

		const allPending = makeRound({
			matches: [makeMatch({ id: "m1" }), makeMatch({ id: "m2" })],
		});
		const laterStarted: MatchSlots = {
			m1: makeSlot({ matchId: "m1", status: "setup" }),
			m2: makeSlot({ matchId: "m2", status: "playing" }),
		};
		expect(isTargetScoreLocked(allPending, laterStarted).locked).toBe(true);

		// 條件是「非 setup」而非「等於 playing」：finished 槽（Status 的第三個值）同樣要鎖。
		const finishedSlot: MatchSlots = {
			m1: makeSlot({ matchId: "m1", status: "finished", scores: { us: 11, them: 5 } }),
		};
		expect(isTargetScoreLocked(allPending, finishedSlot).locked).toBe(true);
	});

	// 額外補（不在 test-plan 內）：collectFinishedSubmissions 會略過「已不在回合中」的孤兒槽，
	// isTargetScoreLocked 則刻意不做這道檢查——鎖定判定的錯誤方向是不對稱的：誤鎖只是使用者
	// 改不了分制，誤放行則讓同輪各場地打不同分制。此 it 釘住這個 fail-closed 的取捨，
	// 日後若有人「順手補上一致性」會被抓到，需先回到 spec 討論。
	it("槽已不在回合中但非 setup 時仍判定為鎖定", () => {
		const round = makeRound({ matches: [makeMatch({ id: "m1", status: "pending" })] });
		const slots: MatchSlots = {
			gone: makeSlot({ matchId: "gone", status: "playing", scores: { us: 4, them: 2 } }),
		};

		const result = isTargetScoreLocked(round, slots);

		expect(result.locked).toBe(true);
		expect(result.reason).toBe("本輪已開始計分，目標分數不可更改。");
	});

	// M36（Stage 2 升級、leader 已核可）：isTargetScoreLocked 的第一條與 setTargetScore
	// 的拒絕條件（round.ts 的 `status !== "pending"`）方向必須一致，差集精確等於
	// `status === "scoring"`。此 it 釘住 scoring 場次也視為已開始計分。
	it("場次為 scoring 時目標分數鎖定", () => {
		const round = makeRound({ matches: [makeMatch({ id: "m1", status: "scoring" })] });
		const slots: MatchSlots = {};

		const result = isTargetScoreLocked(round, slots);

		expect(result.locked).toBe(true);
		expect(result.reason).toBe("本輪已開始計分，目標分數不可更改。");
	});

	it("重設本輪只清除未完成場次的槽且不動獨立槽", () => {
		const m1 = makeMatch({
			id: "m1",
			status: "completed",
			scores: { teamA: 11, teamB: 7 },
			winner: "teamA",
			completedAt: "2026-08-27T00:00:00.000Z",
			playerRatings: [{ playerId: "p1", before: 3, after: 3.2 }],
		});
		const m2 = makeMatch({ id: "m2", status: "pending" });
		// previousRound：重排前的回合，m1 已完成、m2 未完成。
		const previousRound = makeRound({ matches: [m1, m2] });
		// nextRound：重排後的回合——m2（pending）被丟棄，m1（completed）原封不動保留。
		const nextRound = makeRound({ matches: [m1] });

		const m1Slot = { ...createInitialState({ matchId: "m1" }), status: "finished" as const, scores: { us: 11, them: 7 }, matchId: "m1" };
		const m2Slot = { ...createInitialState({ matchId: "m2" }), status: "playing" as const, scores: { us: 3, them: 1 }, matchId: "m2" };
		writeMatchSlot(m1Slot);
		writeMatchSlot(m2Slot);
		localStorage.setItem(SCOREBOARD_STORAGE_KEY, JSON.stringify({ untouched: true }));

		// 先取「呼叫前」的深拷貝：nextRound.matches[0] 與 m1 是同一個物件參考，
		// 直接 expect(nextRound.matches[0]).toEqual(m1) 是恆真斷言、零偵測力。
		const m1Before = structuredClone(m1);

		clearDiscardedMatchSlots(previousRound, nextRound);

		expect(readMatchSlot("m2")).toBeNull();
		expect(readMatchSlot("m1")).toEqual(m1Slot);
		// m1 的比分／評分／歷史（存於 match 物件本身）不受清槽影響——與呼叫前的深拷貝比對，
		// 才擋得住「就地竄改 match 物件」的實作。
		expect(nextRound.matches[0]).toEqual(m1Before);
		expect(localStorage.getItem(SCOREBOARD_STORAGE_KEY)).toBe(JSON.stringify({ untouched: true }));
	});

	// regression guard（6.5）：6.4 已讓 resetMatchmakerData() 把整個 MATCH_SLOTS_KEY
	// 移除，此 it 寫下當下即綠——偵測力以 mutation 驗證（見 tasks.md 6.5 的記錄），
	// 不在此另寫一次清空呼叫（清除範圍只能有一處定義，見 spec SHALL NOT 條款）。
	it("重置名單清除全部場次槽但保留獨立槽", () => {
		const m1Slot = { ...createInitialState({ matchId: "m1" }), status: "finished" as const, scores: { us: 11, them: 7 }, matchId: "m1" };
		const m2Slot = { ...createInitialState({ matchId: "m2" }), status: "playing" as const, scores: { us: 3, them: 1 }, matchId: "m2" };
		writeMatchSlot(m1Slot);
		writeMatchSlot(m2Slot);
		localStorage.setItem(SCOREBOARD_STORAGE_KEY, JSON.stringify({ untouched: true }));

		resetMatchmakerData();

		expect(readMatchSlot("m1")).toBeNull();
		expect(readMatchSlot("m2")).toBeNull();
		expect(localStorage.getItem(SCOREBOARD_STORAGE_KEY)).toBe(JSON.stringify({ untouched: true }));
	});

	// Stage 2 補（不在 test-plan 內）：既有 it 只有「一場」被丟棄（m2），
	// 「只處理第一筆」「只處理最後一筆」兩類變異因此完全偵測不到。
	// 本 it 讓三場同時被丟棄，殺 clearMatchSlots(discardedMatchIds.slice(0, 1))
	// 與 .slice(-1) 的變異。
	it("同時丟棄多場時每一場的槽都被清除", () => {
		const kept = makeMatch({
			id: "kept",
			status: "completed",
			scores: { teamA: 11, teamB: 7 },
			winner: "teamA",
			completedAt: "2026-08-27T00:00:00.000Z",
		});
		const dropA = makeMatch({ id: "drop-a", status: "pending" });
		const dropB = makeMatch({ id: "drop-b", status: "pending" });
		const dropC = makeMatch({ id: "drop-c", status: "pending" });
		const previousRound = makeRound({ matches: [kept, dropA, dropB, dropC] });
		// 重排後：保留場次原封不動，另補一場全新 id 的場次（round.ts 以 newMatchId 產生）。
		const nextRound = makeRound({ matches: [kept, makeMatch({ id: "fresh", status: "pending" })] });

		const keptSlot = { ...createInitialState({ matchId: "kept" }), status: "finished" as const, matchId: "kept" };
		writeMatchSlot(keptSlot);
		for (const matchId of ["drop-a", "drop-b", "drop-c"]) {
			writeMatchSlot({ ...createInitialState({ matchId }), status: "playing" as const, matchId });
		}

		clearDiscardedMatchSlots(previousRound, nextRound);

		expect(readMatchSlot("drop-a")).toBeNull();
		expect(readMatchSlot("drop-b")).toBeNull();
		expect(readMatchSlot("drop-c")).toBeNull();
		expect(readMatchSlot("kept")).toEqual(keptSlot);
	});

	// Stage 2 補（不在 test-plan 內）：清除範圍的定義是「兩份回合比對出消失的 matchId」，
	// SHALL NOT 在本函式再依 match.status 判定一次（那會變成第二個「決定清哪些槽」的地方）。
	// 本 it 讓被丟棄的場次為 scoring 而非 pending，殺
	// 「.filter((match) => match.status === "pending")」這類補上多餘 guard 的變異。
	it("被丟棄的場次不是 pending 時同樣清除其槽", () => {
		const kept = makeMatch({ id: "kept", status: "pending" });
		const goneScoring = makeMatch({ id: "gone-scoring", status: "scoring" });
		const previousRound = makeRound({ matches: [kept, goneScoring] });
		const nextRound = makeRound({ matches: [kept] });

		writeMatchSlot({ ...createInitialState({ matchId: "gone-scoring" }), status: "playing" as const, matchId: "gone-scoring" });
		const keptSlot = { ...createInitialState({ matchId: "kept" }), status: "setup" as const, matchId: "kept" };
		writeMatchSlot(keptSlot);

		clearDiscardedMatchSlots(previousRound, nextRound);

		expect(readMatchSlot("gone-scoring")).toBeNull();
		expect(readMatchSlot("kept")).toEqual(keptSlot);
	});

	// Stage 2 補（不在 test-plan 內）：邊界——沒有任何場次消失時不得清掉任何槽，
	// 殺 filter 恆真（.filter(() => true)）與「來源取反」的變異。
	it("沒有場次被丟棄時不清除任何槽", () => {
		const m1 = makeMatch({ id: "m1", status: "pending" });
		const m2 = makeMatch({ id: "m2", status: "scoring" });
		const round = makeRound({ matches: [m1, m2] });

		const m1Slot = { ...createInitialState({ matchId: "m1" }), status: "setup" as const, matchId: "m1" };
		const m2Slot = { ...createInitialState({ matchId: "m2" }), status: "playing" as const, matchId: "m2" };
		writeMatchSlot(m1Slot);
		writeMatchSlot(m2Slot);
		localStorage.setItem(SCOREBOARD_STORAGE_KEY, JSON.stringify({ untouched: true }));

		clearDiscardedMatchSlots(round, round);

		expect(readMatchSlot("m1")).toEqual(m1Slot);
		expect(readMatchSlot("m2")).toEqual(m2Slot);
		expect(localStorage.getItem(SCOREBOARD_STORAGE_KEY)).toBe(JSON.stringify({ untouched: true }));
	});

});
