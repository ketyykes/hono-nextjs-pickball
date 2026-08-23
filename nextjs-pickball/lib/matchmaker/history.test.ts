import { describe, it, expect } from "vitest";
import { MatchHistoryEntrySchema } from "./history";
import type { MatchHistoryEntry, HistoryTeam, HistoryPlayer } from "./history";
import type { Player } from "./types";

/** 建立一份合法的測試用 Player 資料，可透過 overrides 覆寫特定欄位（沿用 storage.test.ts 的樣板）。 */
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
function makePlayerSnapshot(overrides: Partial<HistoryPlayer> = {}): HistoryPlayer {
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
		rating: 11,
		players: [
			makePlayerSnapshot(),
			makePlayerSnapshot({ id: "p2", name: "Bob", ratingBefore: 6, ratingAfter: 6.1 }),
		],
		...overrides,
	};
}

// overrides 的型別排除 format，避免呼叫端誤把雙打分支覆寫成單打（反之亦然）
// 卻讓 discriminated union 的分支判斷失準——format 由各自的 make 函式固定。
type DoublesOverrides = Partial<Omit<Extract<MatchHistoryEntry, { format: "doubles" }>, "format">>;
type SinglesOverrides = Partial<Omit<Extract<MatchHistoryEntry, { format: "singles" }>, "format">>;

/** 建立一筆合法的雙打測試用歷史紀錄，可透過 overrides 覆寫特定欄位。 */
function makeDoublesEntry(overrides: DoublesOverrides = {}): MatchHistoryEntry {
	return {
		format: "doubles",
		doublesComposition: "mixed",
		matchId: "match-1",
		courtNumber: 1,
		playedAt: "2026-08-16T01:00:00.000Z",
		teamA: makeTeam(),
		teamB: makeTeam({
			rating: 9,
			players: [
				makePlayerSnapshot({ id: "p3", name: "Carol", ratingBefore: 4, ratingAfter: 3.8 }),
				makePlayerSnapshot({ id: "p4", name: "Dave", ratingBefore: 5, ratingAfter: 4.9 }),
			],
		}),
		scoreA: 11,
		scoreB: 9,
		winner: "teamA",
		...overrides,
	};
}

/** 建立一筆合法的單打測試用歷史紀錄，可透過 overrides 覆寫特定欄位。 */
function makeSinglesEntry(overrides: SinglesOverrides = {}): MatchHistoryEntry {
	return {
		format: "singles",
		matchId: "match-2",
		courtNumber: 2,
		playedAt: "2026-08-16T01:05:00.000Z",
		teamA: makeTeam({ rating: 5, players: [makePlayerSnapshot()] }),
		teamB: makeTeam({
			rating: 4,
			players: [makePlayerSnapshot({ id: "p3", name: "Carol", ratingBefore: 4, ratingAfter: 3.8 })],
		}),
		scoreA: 11,
		scoreB: 7,
		winner: "teamA",
		...overrides,
	};
}

describe("MatchHistoryEntrySchema", () => {
	it("合法歷史紀錄通過驗證", () => {
		const result = MatchHistoryEntrySchema.safeParse(makeDoublesEntry());

		expect(result.success).toBe(true);
	});

	it("缺少必要欄位或欄位格式不合法時驗證失敗", () => {
		const withoutWinner: Record<string, unknown> = { ...makeDoublesEntry() };
		delete withoutWinner.winner;
		expect(MatchHistoryEntrySchema.safeParse(withoutWinner).success).toBe(false);

		const withoutPlayedAt: Record<string, unknown> = { ...makeDoublesEntry() };
		delete withoutPlayedAt.playedAt;
		expect(MatchHistoryEntrySchema.safeParse(withoutPlayedAt).success).toBe(false);

		const withoutScoreA: Record<string, unknown> = { ...makeDoublesEntry() };
		delete withoutScoreA.scoreA;
		expect(MatchHistoryEntrySchema.safeParse(withoutScoreA).success).toBe(false);

		expect(
			MatchHistoryEntrySchema.safeParse(makeDoublesEntry({ playedAt: "2026/08/16" })).success,
		).toBe(false);

		expect(MatchHistoryEntrySchema.safeParse(makeDoublesEntry({ scoreA: -1 })).success).toBe(
			false,
		);
	});

	it("歷史紀錄的每位球員各帶賽前與賽後分數", () => {
		const doublesEntry = makeDoublesEntry();
		expect(MatchHistoryEntrySchema.safeParse(doublesEntry).success).toBe(true);
		const doublesPlayers = [...doublesEntry.teamA.players, ...doublesEntry.teamB.players];
		expect(doublesPlayers).toHaveLength(4);
		for (const player of doublesPlayers) {
			expect(typeof player.ratingBefore).toBe("number");
			expect(typeof player.ratingAfter).toBe("number");
		}

		const singlesEntry = makeSinglesEntry();
		expect(MatchHistoryEntrySchema.safeParse(singlesEntry).success).toBe(true);
		const singlesPlayers = [...singlesEntry.teamA.players, ...singlesEntry.teamB.players];
		expect(singlesPlayers).toHaveLength(2);
		for (const player of singlesPlayers) {
			expect(typeof player.ratingBefore).toBe("number");
			expect(typeof player.ratingAfter).toBe("number");
		}
	});

	it("單打不得帶雙打組成標示，雙打必須帶", () => {
		// 單打帶了 doublesComposition 應失敗
		const singlesWithComposition: Record<string, unknown> = {
			...makeSinglesEntry(),
			doublesComposition: "mixed",
		};
		expect(MatchHistoryEntrySchema.safeParse(singlesWithComposition).success).toBe(false);

		// 雙打未帶 doublesComposition 應失敗
		const doublesWithoutComposition: Record<string, unknown> = { ...makeDoublesEntry() };
		delete doublesWithoutComposition.doublesComposition;
		expect(MatchHistoryEntrySchema.safeParse(doublesWithoutComposition).success).toBe(false);
	});

	it("球員自名單刪除後歷史紀錄的姓名與分數仍完整", () => {
		const players: Player[] = [
			makePlayer({ id: "p1", name: "Alice" }),
			makePlayer({ id: "p2", name: "Bob" }),
		];
		const rawEntry = makeSinglesEntry({
			teamA: {
				rating: 5,
				players: [{ id: "p1", name: "Alice", ratingBefore: 5, ratingAfter: 5.2 }],
			},
			teamB: {
				rating: 4,
				players: [{ id: "p2", name: "Bob", ratingBefore: 4, ratingAfter: 3.8 }],
			},
			scoreA: 11,
			scoreB: 7,
		});

		// 特意先經過 safeParse 再斷言——直接斷言建構用的原始物件測不出「schema 是否真的
		// 保存了 name」，parse 後的輸出才是歷史實際會持久化、日後讀回顯示的資料形狀。
		const result = MatchHistoryEntrySchema.safeParse(rawEntry);
		expect(result.success).toBe(true);
		if (!result.success) return;
		const entry = result.data;

		// 名單本身的異動（p1 被移除）不應波及已寫入的歷史紀錄——兩者是各自獨立的資料。
		const remainingPlayers = players.filter((p) => p.id !== "p1");

		expect(remainingPlayers.find((p) => p.id === "p1")).toBeUndefined();
		expect(entry.teamA.players[0].name).toBe("Alice");
		expect(entry.scoreA).toBe(11);
		expect(entry.teamA.players[0].ratingBefore).toBe(5);
		expect(entry.teamA.players[0].ratingAfter).toBe(5.2);
	});
});
