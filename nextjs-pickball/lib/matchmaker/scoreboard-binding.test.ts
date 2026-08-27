import { describe, it, expect, beforeEach } from "vitest";
import type { Round, RoundMatch } from "./round-types";
import { buildMatchSlotSeed } from "./scoreboard-binding";

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
});
