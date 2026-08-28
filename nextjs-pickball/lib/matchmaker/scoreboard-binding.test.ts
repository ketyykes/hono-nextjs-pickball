import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Round, RoundMatch } from "./round-types";
import {
	buildMatchSlotSeed,
	ensureMatchSlot,
	mapTeamScores,
	collectFinishedSubmissions,
	toSubmitScoreInput,
} from "./scoreboard-binding";
import { writeMatchSlot, readMatchSlot } from "../scoreboard/match-slots";
import type { MatchSlots } from "../scoreboard/match-slots";
import { createInitialState } from "../scoreboard/reducer";
import { submitScore } from "./round";
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
		// serverNumber、空 history…）一律等同 createInitialState。逐欄斷言漏掉的欄位
		// 被 seed 偷偷覆寫時不會紅，整體比對才擋得住。
		expect(seed).toEqual(
			createInitialState({ mode: "doubles", targetScore: 15, matchId: "match-1" }),
		);
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
});
