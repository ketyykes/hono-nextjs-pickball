import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ROSTER_STORAGE_KEY, ROUND_STORAGE_KEY, HISTORY_STORAGE_KEY } from "./storage-keys";
import { readRound, writeRound, readHistory, writeHistory } from "./round-storage";
import type { Round, RoundMatch } from "./round-types";
import type { MatchHistoryEntry, HistoryTeam, HistoryPlayer } from "./history";

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

/** 建立一份合法的測試用 Round，可透過 overrides 覆寫特定欄位（沿用 round-types.test.ts 的樣板）。 */
function makeRound(overrides: Partial<Round> = {}): Round {
	return {
		roundNumber: 1,
		createdAt: "2026-08-16T00:00:00.000Z",
		format: "singles",
		courtCount: 1,
		targetScore: 11,
		matches: [makeRoundMatch()],
		restingPlayerIds: [],
		seenSignatures: {
			teammateKeys: [],
			opponentKeys: [],
			fullMatchKeys: [],
		},
		...overrides,
	};
}

/** 建立一份球員快照，可透過 overrides 覆寫特定欄位（沿用 history.test.ts 的樣板）。 */
function makePlayerSnapshot(overrides: Partial<HistoryPlayer> = {}): HistoryPlayer {
	return {
		id: "p1",
		name: "Alice",
		ratingBefore: 5,
		ratingAfter: 5.2,
		...overrides,
	};
}

/** 建立一支隊伍快照，可透過 overrides 覆寫特定欄位（沿用 history.test.ts 的樣板）。 */
function makeTeam(overrides: Partial<HistoryTeam> = {}): HistoryTeam {
	return {
		rating: 5,
		players: [makePlayerSnapshot()],
		...overrides,
	};
}

type HistoryEntryOverrides = Partial<Omit<Extract<MatchHistoryEntry, { format: "singles" }>, "format">>;

/** 建立一筆合法的單打測試用歷史紀錄，可透過 overrides 覆寫特定欄位（沿用 history.test.ts 的樣板）。 */
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

describe("round-storage", () => {
	beforeEach(() => {
		localStorage.clear();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	// 唯一允許出現 key 字面字串的地方——這裡就是在驗證 storage-keys.ts 是否真的
	// 匯出了 spec 要求的那三個值，其餘檔案一律改 import 這三個常數。
	it("三個 LocalStorage key 名稱由 storage-keys 單一來源匯出", () => {
		expect(ROSTER_STORAGE_KEY).toBe("matchmaker:roster:v1");
		expect(ROUND_STORAGE_KEY).toBe("matchmaker:round:v1");
		expect(HISTORY_STORAGE_KEY).toBe("matchmaker:history:v1");
	});

	it("回合 JSON 解析失敗時清除 key 並回傳無回合", () => {
		localStorage.setItem(ROUND_STORAGE_KEY, "{ 不是合法 JSON");

		const round = readRound();

		expect(round).toBeNull();
		expect(localStorage.getItem(ROUND_STORAGE_KEY)).toBeNull();
	});

	it("回合外層結構或 version 不符時整份清除", () => {
		localStorage.setItem(ROUND_STORAGE_KEY, JSON.stringify({ version: 2, round: makeRound() }));
		expect(readRound()).toBeNull();
		expect(localStorage.getItem(ROUND_STORAGE_KEY)).toBeNull();

		localStorage.setItem(ROUND_STORAGE_KEY, JSON.stringify([1, 2, 3]));
		expect(readRound()).toBeNull();
		expect(localStorage.getItem(ROUND_STORAGE_KEY)).toBeNull();
	});

	it("歷史單筆損壞時保留其餘 2 筆並回報 droppedCount 為 1", () => {
		const validEntry1 = makeHistoryEntry({ matchId: "match-1" });
		const invalidEntry: Record<string, unknown> = { ...makeHistoryEntry({ matchId: "match-2" }) };
		delete invalidEntry.winner;
		const validEntry2 = makeHistoryEntry({ matchId: "match-3" });

		localStorage.setItem(
			HISTORY_STORAGE_KEY,
			JSON.stringify({ version: 1, entries: [validEntry1, invalidEntry, validEntry2] }),
		);

		const result = readHistory();

		expect(result.entries).toHaveLength(2);
		expect(result.droppedCount).toBe(1);
		expect(localStorage.getItem(HISTORY_STORAGE_KEY)).not.toBeNull();

		// 回寫後再讀一次：只驗 droppedCount === 0 無法區分「回寫正確」與「回寫時把
		// 歷史整個寫丟」，必須同時鎖住筆數與內容。
		const secondResult = readHistory();
		expect(secondResult.droppedCount).toBe(0);
		expect(secondResult.entries).toHaveLength(2);
		expect(secondResult.entries.map((entry) => entry.matchId)).toEqual(["match-1", "match-3"]);
	});

	it("歷史 version 不符時整份清除，不走逐筆降級", () => {
		const entries = [
			makeHistoryEntry({ matchId: "match-1" }),
			makeHistoryEntry({ matchId: "match-2" }),
			makeHistoryEntry({ matchId: "match-3" }),
		];
		localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify({ version: 2, entries }));

		const result = readHistory();

		expect(result.entries).toEqual([]);
		expect(result.droppedCount).toBe(0);
		expect(localStorage.getItem(HISTORY_STORAGE_KEY)).toBeNull();
	});

	it("localStorage 不可用或寫入超出配額時不拋出例外", () => {
		// 情境一：localStorage 本身的存取就拋例外（例如私密模式），四個讀寫函式皆不拋出，
		// 讀取回空結果。
		vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
			throw new Error("localStorage 不可用（例如私密模式）");
		});

		expect(() => readRound()).not.toThrow();
		expect(readRound()).toBeNull();
		expect(() => writeRound(makeRound())).not.toThrow();
		expect(() => readHistory()).not.toThrow();
		expect(readHistory()).toEqual({ entries: [], droppedCount: 0 });
		expect(() => writeHistory([makeHistoryEntry()])).not.toThrow();

		vi.restoreAllMocks();

		// 情境二：localStorage 可正常存取，但 setItem 拋出 QuotaExceededError（寫入超出配額）。
		vi.spyOn(window.localStorage, "setItem").mockImplementation(() => {
			throw new DOMException("超出配額", "QuotaExceededError");
		});

		expect(() => writeRound(makeRound())).not.toThrow();
		expect(() => writeHistory([makeHistoryEntry()])).not.toThrow();
	});
});
