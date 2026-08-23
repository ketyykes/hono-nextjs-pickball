import { describe, it, expect } from "vitest";

import { createRound } from "./round";
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
		expect(result.round).not.toBe(previousRound);
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
});
