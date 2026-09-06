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

// 比照上方 SinglesOverrides 的樣板另建一份雙打版本，同樣排除 format 避免呼叫端
// 誤把雙打分支覆寫成單打（或反之）卻讓 discriminated union 判斷失準（§4 需要雙打
// fixture 來驗證最常搭檔邏輯，§2／§3 皆未建過這份樣板）。
type DoublesOverrides = Partial<Omit<Extract<MatchHistoryEntry, { format: "doubles" }>, "format">>;

/** 建立一筆合法的雙打測試用歷史紀錄，可透過 overrides 覆寫特定欄位。 */
function makeDoublesEntry(overrides: DoublesOverrides = {}): MatchHistoryEntry {
	return {
		format: "doubles",
		matchId: "match-d1",
		courtNumber: 1,
		playedAt: "2026-08-16T01:00:00.000Z",
		doublesComposition: "general",
		teamA: makeTeam({
			players: [makeHistoryPlayer({ id: "p1", name: "Alice" }), makeHistoryPlayer({ id: "p2", name: "Bob" })],
		}),
		teamB: makeTeam({
			players: [makeHistoryPlayer({ id: "p3", name: "Carol" }), makeHistoryPlayer({ id: "p4", name: "Dave" })],
		}),
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
		// spec「強度淨變化的計算」明載「出場數為 0 時淨變化 MUST 為 0」，但 Scenario 只列了
		// golden path；這條 MUST 子句沒有其他測試守住，故在同一個「零出場」情境內一併斷言。
		expect(alice?.ratingDelta).toBe(0);
	});

	it("名單內球員的目前強度取自名單目前的 rating", () => {
		// rating（6）刻意與該球員任一歷史 ratingAfter（3）、預設 ratingBefore（5）
		// 都不同，避免巧合相等讓斷言失去區辨力。
		const players = [makePlayer({ id: "p1", name: "Alice", rating: 6 })];
		const history = [
			makeEntry({
				teamA: makeTeam({ players: [makeHistoryPlayer({ id: "p1", name: "Alice", ratingAfter: 3 })] }),
				teamB: makeTeam({ players: [makeHistoryPlayer({ id: "p2", name: "Bob" })] }),
			}),
		];

		const result = computePlayerStats(history, players);

		const alice = result.find((stat) => stat.id === "p1");
		expect(alice?.currentRating).toBe(6);
		expect(alice?.onRoster).toBe(true);
	});

	it("已離開名單的球員取歷史最近一筆的 ratingAfter 並標示已不在名單", () => {
		// 陣列順序刻意把「較晚」那筆放在前面：若實作誤用「陣列迭代順序取最後一筆」
		// 會得到較早那筆的 4，只有真的依 playedAt 比較才會得到較晚那筆的 7。
		// Bob 放在 teamB 且兩筆的 ratingAfter 不同：少了對他的斷言，實作只掃 teamA
		// 也會全綠（teamB 的球員仍會經另一條聯集路徑被收進結果，只是強度落回 0）。
		const history = [
			makeEntry({
				matchId: "m-later",
				playedAt: "2026-08-20T00:00:00.000Z",
				teamA: makeTeam({ players: [makeHistoryPlayer({ id: "p-gone", name: "Gone", ratingAfter: 7 })] }),
				teamB: makeTeam({ players: [makeHistoryPlayer({ id: "p2", name: "Bob", ratingAfter: 9 })] }),
			}),
			makeEntry({
				matchId: "m-earlier",
				playedAt: "2026-08-10T00:00:00.000Z",
				teamA: makeTeam({ players: [makeHistoryPlayer({ id: "p-gone", name: "Gone", ratingAfter: 4 })] }),
				teamB: makeTeam({ players: [makeHistoryPlayer({ id: "p2", name: "Bob", ratingAfter: 2 })] }),
			}),
		];

		const result = computePlayerStats(history, []);

		const gone = result.find((stat) => stat.id === "p-gone");
		expect(gone?.currentRating).toBe(7);
		expect(gone?.onRoster).toBe(false);
		const bob = result.find((stat) => stat.id === "p2");
		expect(bob?.currentRating).toBe(9);
		expect(bob?.onRoster).toBe(false);
	});

	it("強度淨變化為所有出場紀錄賽前賽後分數差的加總", () => {
		const players = [makePlayer({ id: "p1", name: "Alice" })];
		// Bob 全程在 teamB，且兩筆的分數差刻意與 Alice 不同：少了對他的斷言，
		// 累加迴圈只掃 teamA 也會全綠。
		const history = [
			makeEntry({
				matchId: "m1",
				teamA: makeTeam({
					players: [makeHistoryPlayer({ id: "p1", name: "Alice", ratingBefore: 5, ratingAfter: 5.12 })],
				}),
				teamB: makeTeam({
					players: [makeHistoryPlayer({ id: "p2", name: "Bob", ratingBefore: 5, ratingAfter: 4.9 })],
				}),
			}),
			makeEntry({
				matchId: "m2",
				teamA: makeTeam({
					players: [makeHistoryPlayer({ id: "p1", name: "Alice", ratingBefore: 5.12, ratingAfter: 5.07 })],
				}),
				teamB: makeTeam({
					players: [makeHistoryPlayer({ id: "p2", name: "Bob", ratingBefore: 4.9, ratingAfter: 4.94 })],
				}),
			}),
		];

		const result = computePlayerStats(history, players);

		const alice = result.find((stat) => stat.id === "p1");
		expect(alice?.ratingDelta).toBeCloseTo(0.07);
		const bob = result.find((stat) => stat.id === "p2");
		expect(bob?.ratingDelta).toBeCloseTo(-0.06);
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

	it("最常搭檔為雙打隊友中出現次數最多者", () => {
		// p1 在 d1 於 teamA 與甲搭檔、在 d2 於 teamB 與甲搭檔（交棒事項 3：受測球員需同時
		// 出現在 teamA／teamB，否則「只掃 teamA」這類漏半邊的變異測不出來）、在 d3 於
		// teamA 與乙搭檔一次——甲共 2 次、乙共 1 次，甲應為最常搭檔。
		const history = [
			makeDoublesEntry({
				matchId: "d1",
				teamA: makeTeam({
					players: [makeHistoryPlayer({ id: "p1", name: "P1" }), makeHistoryPlayer({ id: "p-jia", name: "甲" })],
				}),
				teamB: makeTeam({
					players: [makeHistoryPlayer({ id: "p-x", name: "X" }), makeHistoryPlayer({ id: "p-y", name: "Y" })],
				}),
			}),
			makeDoublesEntry({
				matchId: "d2",
				teamA: makeTeam({
					players: [makeHistoryPlayer({ id: "p-x", name: "X" }), makeHistoryPlayer({ id: "p-y", name: "Y" })],
				}),
				teamB: makeTeam({
					players: [makeHistoryPlayer({ id: "p1", name: "P1" }), makeHistoryPlayer({ id: "p-jia", name: "甲" })],
				}),
			}),
			makeDoublesEntry({
				matchId: "d3",
				teamA: makeTeam({
					players: [makeHistoryPlayer({ id: "p1", name: "P1" }), makeHistoryPlayer({ id: "p-yi", name: "乙" })],
				}),
				teamB: makeTeam({
					players: [makeHistoryPlayer({ id: "p-x", name: "X" }), makeHistoryPlayer({ id: "p-y", name: "Y" })],
				}),
			}),
		];

		const result = computePlayerStats(history, []);

		const p1 = result.find((stat) => stat.id === "p1");
		expect(p1?.mostFrequentPartner).toBe("甲");
	});

	it("從未打過雙打時最常搭檔為 null", () => {
		const players = [makePlayer({ id: "p1", name: "Alice" })];
		const history = [
			makeEntry({
				teamA: makeTeam({ players: [makeHistoryPlayer({ id: "p1", name: "Alice" })] }),
				teamB: makeTeam({ players: [makeHistoryPlayer({ id: "p2", name: "Bob" })] }),
			}),
		];

		const result = computePlayerStats(history, players);

		const alice = result.find((stat) => stat.id === "p1");
		expect(alice?.mostFrequentPartner).toBeNull();
	});

});
