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

// overrides 的型別排除 format，避免呼叫端誤把單打分支覆寫成雙打（或反之）卻讓
// discriminated union 的分支判斷失準——沿用 history.test.ts／transfer-storage.test.ts
// 的既有樣板；有了這層收窄就不需要 `as MatchHistoryEntry` 斷言去壓掉型別錯誤。
type SinglesOverrides = Partial<Omit<Extract<MatchHistoryEntry, { format: "singles" }>, "format">>;

/** 建立一筆合法的單打測試用歷史紀錄，可透過 overrides 覆寫特定欄位。 */
function makeEntry(overrides: SinglesOverrides = {}): MatchHistoryEntry {
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
	};
}

describe("computePlayerStats", () => {
	it("名單成員即使無出場紀錄仍列入統計結果", () => {
		const players = [makePlayer({ id: "p1", name: "Alice", colorFrom: "#111111", colorTo: "#222222" })];

		const result = computePlayerStats([], players);

		const alice = result.find((stat) => stat.id === "p1");
		expect(alice).toBeDefined();
		expect(alice?.gamesPlayed).toBe(0);
		// 「列入統計結果」不只是出現在陣列裡：這一筆必須真的是她——姓名與色塊取自名單
		// （tasks 2.2），且被標成名單成員，否則呈現層會把她誤標成「已不在名單」。
		expect(alice?.onRoster).toBe(true);
		expect(alice?.name).toBe("Alice");
		expect(alice?.colorFrom).toBe("#111111");
		expect(alice?.colorTo).toBe("#222222");
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
		// 這位球員只存在於歷史快照，姓名必須取自快照且 onRoster 為 false——
		// 少了這兩項斷言，把歷史分支寫成 onRoster: true 或姓名寫死都不會被測出來。
		expect(gone?.onRoster).toBe(false);
		expect(gone?.name).toBe("Gone");
	});

	it("出場數、勝場與敗場依歷史紀錄正確加總", () => {
		const players = [makePlayer({ id: "p1", name: "Alice" })];
		const history = [
			makeEntry({
				matchId: "m1",
				teamA: makeTeam({ players: [makeHistoryPlayer({ id: "p1", name: "Alice" })] }),
				teamB: makeTeam({ players: [makeHistoryPlayer({ id: "p2", name: "Bob" })] }),
				winner: "teamA",
			}),
			makeEntry({
				matchId: "m2",
				teamA: makeTeam({ players: [makeHistoryPlayer({ id: "p1", name: "Alice" })] }),
				teamB: makeTeam({ players: [makeHistoryPlayer({ id: "p2", name: "Bob" })] }),
				winner: "teamA",
			}),
			makeEntry({
				matchId: "m3",
				teamA: makeTeam({ players: [makeHistoryPlayer({ id: "p2", name: "Bob" })] }),
				teamB: makeTeam({ players: [makeHistoryPlayer({ id: "p1", name: "Alice" })] }),
				winner: "teamA",
			}),
		];

		const result = computePlayerStats(history, players);

		const alice = result.find((stat) => stat.id === "p1");
		expect(alice?.gamesPlayed).toBe(3);
		expect(alice?.wins).toBe(2);
		expect(alice?.losses).toBe(1);
		expect(alice?.winRate).toBeCloseTo(2 / 3);
		// Alice 同時存在於名單與歷史：聯集必須以 id 去重、名單那筆勝出，
		// 否則歷史分支會把她覆寫成「已不在名單」而只有這裡看得出來。
		expect(alice?.onRoster).toBe(true);
	});

	it("出場數為零時勝率為零而非 NaN", () => {
		const players = [makePlayer({ id: "p1", name: "Alice" })];

		const result = computePlayerStats([], players);

		const alice = result.find((stat) => stat.id === "p1");
		expect(alice?.winRate).toBe(0);
	});

	it("計算過程不修改輸入的歷史與名單", () => {
		const players = [makePlayer({ id: "p1", name: "Alice" })];
		const history = [
			makeEntry({
				teamA: makeTeam({ players: [makeHistoryPlayer({ id: "p1", name: "Alice" })] }),
				teamB: makeTeam({ players: [makeHistoryPlayer({ id: "p2", name: "Bob" })] }),
			}),
		];
		const playersSnapshot = structuredClone(players);
		const historySnapshot = structuredClone(history);

		computePlayerStats(history, players);

		expect(players).toStrictEqual(playersSnapshot);
		expect(history).toStrictEqual(historySnapshot);
	});
});
