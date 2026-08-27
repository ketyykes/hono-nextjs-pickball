import { describe, it, expect, beforeEach } from "vitest";
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
		const round = makeRound({ targetScore: 15, format: "doubles" });
		const match = makeMatch({ id: "match-1", format: "doubles", status: "pending" });

		const seed = buildMatchSlotSeed(round, match);

		expect(seed.targetScore).toBe(15);
		expect(seed.mode).toBe("doubles");
		expect(seed.matchId).toBe("match-1");
		expect(seed.scores).toEqual({ us: 0, them: 0 });
		expect(seed.status).toBe("setup");
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

		const result = ensureMatchSlot("match-1", seed);

		expect(result.scores).toEqual({ us: 8, them: 5 });
		expect(result.history).toEqual(existing.history);
		expect(result.targetScore).toBe(15);
		expect(readMatchSlot("match-1")?.scores).toEqual({ us: 8, them: 5 });
	});

	// 額外補（不在 test-plan 內）：ensureMatchSlot 的「無條目 → 寫入 seed」分支
	// 在既有兩個 it 裡都沒被執行到——4.1 未呼叫 ensureMatchSlot，4.3 一律先寫入既有進度
	// 再呼叫，只會走「已有條目」分支。缺這個 it 會讓寫入分支零覆蓋。
	it("尚無條目時 ensureMatchSlot 寫入 seed 並回傳 seed", () => {
		const round = makeRound({ targetScore: 21, format: "singles" });
		const match = makeMatch({ id: "match-2", format: "singles" });
		const seed = buildMatchSlotSeed(round, match);

		const result = ensureMatchSlot("match-2", seed);

		expect(seed.mode).toBe("singles");
		expect(seed.targetScore).toBe(21);
		expect(result).toEqual(seed);
		expect(readMatchSlot("match-2")).toEqual(seed);
	});

	it("第一隊對應 us、第二隊對應 them，來回轉換不顛倒", () => {
		const original = { first: 11, second: 7 };

		const toScoreboard = mapTeamScores(original, "scoreboard");
		expect(toScoreboard).toEqual({ us: 11, them: 7 });

		const backToRound = mapTeamScores(toScoreboard, "round");
		expect(backToRound).toEqual(original);
	});
});
