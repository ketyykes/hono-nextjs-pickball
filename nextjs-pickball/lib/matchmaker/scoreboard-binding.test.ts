import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Round, RoundMatch } from "./round-types";
import { buildMatchSlotSeed, ensureMatchSlot, mapTeamScores } from "./scoreboard-binding";
import { writeMatchSlot, readMatchSlot } from "../scoreboard/match-slots";
import { createInitialState } from "../scoreboard/reducer";

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
});
