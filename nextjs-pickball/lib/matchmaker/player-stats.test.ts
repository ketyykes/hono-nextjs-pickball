import { describe, it, expect } from "vitest";
import { computePlayerStats } from "./player-stats";
import type { MatchHistoryEntry, HistoryPlayer, HistoryTeam } from "./history";
import type { Player } from "./types";

/** 建立一份合法的測試用 Player 資料，可透過 overrides 覆寫特定欄位（沿用 history.test.ts 的樣板）。 */
function makePlayer(overrides: Partial<Player> = {}): Player {
	return {
		id: "p1",
		name: "Alice",
		gender: "female",
		colorFrom: "#ff0000",
		colorTo: "#00ff00",
		rating: 3,
		restCount: 0,
		gamesPlayed: 0,
		isActive: true,
		createdAt: "2026-08-15T00:00:00.000Z",
		...overrides,
	};
}

/** 建立一份球員快照，可透過 overrides 覆寫特定欄位。 */
function makeHistoryPlayer(overrides: Partial<HistoryPlayer> = {}): HistoryPlayer {
	return {
		id: "p1",
		name: "Alice",
		ratingBefore: 5,
		ratingAfter: 5.2,
		...overrides,
	};
}

/** 建立一支隊伍快照，可透過 overrides 覆寫特定欄位。 */
function makeTeam(overrides: Partial<HistoryTeam> = {}): HistoryTeam {
	return {
		rating: 5,
		players: [makeHistoryPlayer()],
		...overrides,
	};
}

/** 建立一筆合法的單打測試用歷史紀錄，可透過 overrides 覆寫特定欄位。 */
function makeEntry(overrides: Partial<MatchHistoryEntry> = {}): MatchHistoryEntry {
	return {
		format: "singles",
		matchId: "match-1",
		courtNumber: 1,
		playedAt: "2026-08-16T01:00:00.000Z",
		teamA: makeTeam({ players: [makeHistoryPlayer({ id: "p1", name: "Alice" })] }),
		teamB: makeTeam({ players: [makeHistoryPlayer({ id: "p2", name: "Bob" })] }),
		scoreA: 11,
		scoreB: 5,
		winner: "teamA",
		...overrides,
	} as MatchHistoryEntry;
}

describe("computePlayerStats", () => {
	it("名單成員即使無出場紀錄仍列入統計結果", () => {
		const players = [makePlayer({ id: "p1", name: "Alice" })];

		const result = computePlayerStats([], players);

		const alice = result.find((stat) => stat.id === "p1");
		expect(alice).toBeDefined();
		expect(alice?.gamesPlayed).toBe(0);
	});

	it("已離開名單但曾出現於歷史的球員仍列入統計結果", () => {
		const history = [
			makeEntry({
				teamA: makeTeam({ players: [makeHistoryPlayer({ id: "p-gone", name: "Gone" })] }),
			}),
		];

		const result = computePlayerStats(history, []);

		const gone = result.find((stat) => stat.id === "p-gone");
		expect(gone).toBeDefined();
	});
});
