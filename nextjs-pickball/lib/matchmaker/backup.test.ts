import { describe, it, expect } from "vitest";
import { buildBackup } from "./backup";
import type { BackupSnapshot } from "./backup";
import type { Player } from "./types";
import type { Round } from "./round-types";
import type { MatchHistoryEntry, HistoryTeam, HistoryPlayer } from "./history";

/** 建立一份合法的測試用 Player，可透過 overrides 覆寫特定欄位（沿用 round-storage.test.ts 的樣板慣例）。 */
function makePlayer(overrides: Partial<Player> = {}): Player {
	return {
		id: "p1",
		name: "Alice",
		gender: "female",
		colorFrom: "#ff0000",
		colorTo: "#00ff00",
		rating: 5,
		restCount: 0,
		gamesPlayed: 0,
		isActive: true,
		createdAt: "2026-08-16T00:00:00.000Z",
		...overrides,
	};
}

/** 建立一份合法的測試用 Round，可透過 overrides 覆寫特定欄位（沿用 round-storage.test.ts 的樣板）。 */
function makeRound(overrides: Partial<Round> = {}): Round {
	return {
		roundNumber: 1,
		createdAt: "2026-08-16T00:00:00.000Z",
		format: "singles",
		courtCount: 1,
		targetScore: 11,
		matches: [
			{
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
			},
		],
		restingPlayerIds: [],
		seenSignatures: {
			teammateKeys: [],
			opponentKeys: [],
			fullMatchKeys: [],
		},
		...overrides,
	};
}

/** 建立一份球員快照，可透過 overrides 覆寫特定欄位（沿用 round-storage.test.ts 的樣板）。 */
function makePlayerSnapshot(overrides: Partial<HistoryPlayer> = {}): HistoryPlayer {
	return {
		id: "p1",
		name: "Alice",
		ratingBefore: 5,
		ratingAfter: 5.2,
		...overrides,
	};
}

/** 建立一支隊伍快照，可透過 overrides 覆寫特定欄位（沿用 round-storage.test.ts 的樣板）。 */
function makeTeam(overrides: Partial<HistoryTeam> = {}): HistoryTeam {
	return {
		rating: 5,
		players: [makePlayerSnapshot()],
		...overrides,
	};
}

type HistoryEntryOverrides = Partial<Omit<Extract<MatchHistoryEntry, { format: "singles" }>, "format">>;

/** 建立一筆合法的單打測試用歷史紀錄，可透過 overrides 覆寫特定欄位（沿用 round-storage.test.ts 的樣板）。 */
function makeHistoryEntry(overrides: HistoryEntryOverrides = {}): MatchHistoryEntry {
	return {
		format: "singles",
		matchId: "match-1",
		courtNumber: 1,
		playedAt: "2026-08-16T01:00:00.000Z",
		teamA: makeTeam(),
		teamB: makeTeam({
			rating: 4,
			players: [makePlayerSnapshot({ id: "p2", name: "Bob", ratingBefore: 4, ratingAfter: 3.8 })],
		}),
		scoreA: 11,
		scoreB: 7,
		winner: "teamA",
		...overrides,
	};
}

/** 建立一份合法的 BackupSnapshot，可透過 overrides 覆寫特定欄位。 */
function makeSnapshot(overrides: Partial<BackupSnapshot> = {}): BackupSnapshot {
	return {
		players: [makePlayer(), makePlayer({ id: "p2", name: "Bob" })],
		currentRound: makeRound(),
		history: [
			makeHistoryEntry({ matchId: "match-1" }),
			makeHistoryEntry({ matchId: "match-2" }),
			makeHistoryEntry({ matchId: "match-3" }),
		],
		...overrides,
	};
}

describe("backup", () => {
	it("buildBackup 產生的備份含版本號、參賽者、目前回合、歷史與重複配對簽章", () => {
		const snapshot = makeSnapshot({
			currentRound: makeRound({
				seenSignatures: {
					teammateKeys: ["p1|p2"],
					opponentKeys: ["p1|p2", "p3|p4"],
					fullMatchKeys: [],
				},
			}),
		});

		const backup = buildBackup(snapshot, { exportedAt: "2026-08-23T01:02:03.000Z" });

		expect(backup.version).toBe(1);
		expect(backup.players).toEqual(snapshot.players);
		expect(backup.history).toEqual(snapshot.history);
		expect(backup.currentRound?.seenSignatures).toEqual({
			teammateKeys: ["p1|p2"],
			opponentKeys: ["p1|p2", "p3|p4"],
			fullMatchKeys: [],
		});
	});

	it("空資料時仍產生合法備份而非拒絕匯出", () => {
		const snapshot = makeSnapshot({
			players: [],
			currentRound: null,
			history: [],
		});

		expect(() => buildBackup(snapshot, { exportedAt: "2026-08-23T01:02:03.000Z" })).not.toThrow();

		const backup = buildBackup(snapshot, { exportedAt: "2026-08-23T01:02:03.000Z" });

		expect(backup.version).toBe(1);
		expect(backup.players).toEqual([]);
		expect(backup.currentRound).toBeNull();
		expect(backup.history).toEqual([]);
	});

	it("簽章以字串陣列寫入備份，JSON 往返後內容不變", () => {
		const round = makeRound();
		const snapshot: BackupSnapshot = {
			...makeSnapshot(),
			currentRound: {
				...round,
				seenSignatures: {
					teammateKeys: new Set(["p2|p1"]),
					opponentKeys: new Set(["p3|p4", "p1|p2"]),
					fullMatchKeys: new Set<string>(),
				},
			},
		};

		const backup = buildBackup(snapshot, { exportedAt: "2026-08-23T01:02:03.000Z" });

		expect(Array.isArray(backup.currentRound?.seenSignatures.teammateKeys)).toBe(true);
		expect(Array.isArray(backup.currentRound?.seenSignatures.opponentKeys)).toBe(true);
		expect(Array.isArray(backup.currentRound?.seenSignatures.fullMatchKeys)).toBe(true);

		const roundTripped = JSON.parse(JSON.stringify(backup));
		expect(roundTripped).toEqual(backup);
	});
});
