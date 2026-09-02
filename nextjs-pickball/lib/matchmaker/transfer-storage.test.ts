import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { CLEAR_ALL_KEYS, clearAllLocalData, readSnapshot, writeBackup } from "./transfer-storage";
import { ROSTER_STORAGE_KEY, ROUND_STORAGE_KEY, HISTORY_STORAGE_KEY } from "./storage-keys";
// 取 scoreboard 實際匯出的 key 而非硬編碼字面值——比照 storage.test.ts 既有慣例
// （見 player-roster delta 的「單一來源」條款：日後 scoreboard 改 key 名，硬編碼的測試
// 會繼續綠燈但保護的是不存在的 key；跨模組 import 則會編譯失敗、強迫同步更新）。
import { STORAGE_KEY as SCOREBOARD_STORAGE_KEY } from "../scoreboard/storage";
import { MATCH_SLOTS_KEY } from "../scoreboard/match-slots";
import { TRANSFER_MESSAGES } from "./transfer-types";
import type { Backup } from "./transfer-types";
import { parseBackup } from "./backup";
import type { Player } from "./types";
import type { Round } from "./round-types";
import type { MatchHistoryEntry, HistoryTeam } from "./history";

/** 建立一份合法的測試用 Player，可透過 overrides 覆寫特定欄位（沿用 backup.test.ts 的樣板）。 */
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

/** 建立一份合法的測試用 Round，可透過 overrides 覆寫特定欄位（沿用 backup.test.ts 的樣板）。 */
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

/** 建立一支隊伍快照，可透過 overrides 覆寫特定欄位（沿用 backup.test.ts 的樣板）。 */
function makeTeam(overrides: Partial<HistoryTeam> = {}): HistoryTeam {
	return {
		rating: 5,
		players: [{ id: "p1", name: "Alice", ratingBefore: 5, ratingAfter: 5.2 }],
		...overrides,
	};
}

type HistoryEntryOverrides = Partial<Omit<Extract<MatchHistoryEntry, { format: "singles" }>, "format">>;

/** 建立一筆合法的單打測試用歷史紀錄，可透過 overrides 覆寫特定欄位（沿用 backup.test.ts 的樣板）。 */
function makeHistoryEntry(overrides: HistoryEntryOverrides = {}): MatchHistoryEntry {
	return {
		format: "singles",
		matchId: "match-1",
		courtNumber: 1,
		playedAt: "2026-08-16T01:00:00.000Z",
		teamA: makeTeam(),
		teamB: makeTeam({
			rating: 4,
			players: [{ id: "p2", name: "Bob", ratingBefore: 4, ratingAfter: 3.8 }],
		}),
		scoreA: 11,
		scoreB: 7,
		winner: "teamA",
		...overrides,
	};
}

/** 建立一份合法的測試用 Backup，可透過 overrides 覆寫特定欄位。 */
function makeBackup(overrides: Partial<Backup> = {}): Backup {
	return {
		version: 1,
		players: [makePlayer()],
		currentRound: makeRound(),
		history: [makeHistoryEntry()],
		...overrides,
	};
}

describe("transfer-storage", () => {
	beforeEach(() => {
		localStorage.clear();
	});

	afterEach(() => {
		// vi.spyOn(window, "localStorage" / "setItem", ...) 用過就必須還原，
		// 否則會污染同檔後續測試（見 M8 §7 派工的硬性要求）。
		vi.restoreAllMocks();
		localStorage.clear();
	});

	it("clearAllLocalData 移除本 app 寫入的全部 LocalStorage key", () => {
		// expectedKeys 由來源模組 import 組成，SHALL NOT 在測試內抄字面值
		// （§0.5／0.6 對照表列出的全部 5 個 key）。
		const expectedKeys = [
			ROSTER_STORAGE_KEY,
			ROUND_STORAGE_KEY,
			HISTORY_STORAGE_KEY,
			SCOREBOARD_STORAGE_KEY,
			MATCH_SLOTS_KEY,
		];

		for (const key of expectedKeys) {
			localStorage.setItem(key, "有內容");
		}

		clearAllLocalData();

		for (const key of expectedKeys) {
			expect(localStorage.getItem(key)).toBeNull();
		}
		// 集合相等，SHALL NOT 斷言固定筆數——寫死筆數會讓日後新增資料域卻漏列
		// 的情況仍然是綠燈。
		expect(new Set(CLEAR_ALL_KEYS)).toEqual(new Set(expectedKeys));
	});

	it("clearAllLocalData 不呼叫 clear，列舉範圍外的 key 完全不受影響", () => {
		const outOfScopeKey = "some-other-app:unrelated:v1";
		localStorage.setItem(outOfScopeKey, "維持不變");

		clearAllLocalData();

		expect(localStorage.getItem(outOfScopeKey)).toBe("維持不變");
	});

	it("匯入驗證失敗時三個 key 的內容完全不變", () => {
		localStorage.setItem(ROSTER_STORAGE_KEY, JSON.stringify({ version: 1, players: [makePlayer()] }));
		localStorage.setItem(ROUND_STORAGE_KEY, JSON.stringify({ version: 1, round: makeRound() }));
		localStorage.setItem(
			HISTORY_STORAGE_KEY,
			JSON.stringify({ version: 1, entries: [makeHistoryEntry()] }),
		);

		const rosterBefore = localStorage.getItem(ROSTER_STORAGE_KEY);
		const roundBefore = localStorage.getItem(ROUND_STORAGE_KEY);
		const historyBefore = localStorage.getItem(HISTORY_STORAGE_KEY);

		const parsed = parseBackup("{ 不是合法 JSON");
		expect(parsed.ok).toBe(false);
		// 型別上就無法對驗證失敗的結果呼叫 writeBackup（design Decision 1「原子性由
		// 型別強制」）：parsed.ok 為 false 時 parsed 沒有 backup 欄位，下面這段
		// 不會執行，三個 key 因此原封不動。
		if (parsed.ok) {
			writeBackup(parsed.backup);
		}

		expect(localStorage.getItem(ROSTER_STORAGE_KEY)).toBe(rosterBefore);
		expect(localStorage.getItem(ROUND_STORAGE_KEY)).toBe(roundBefore);
		expect(localStorage.getItem(HISTORY_STORAGE_KEY)).toBe(historyBefore);
	});

	it("localStorage 不可用時讀寫皆不拋出例外並回報可判讀結果", () => {
		vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
			throw new Error("localStorage 不可用（例如私密模式）");
		});

		expect(() => readSnapshot()).not.toThrow();
		expect(readSnapshot()).toEqual({ players: [], currentRound: null, history: [] });

		expect(() => writeBackup(makeBackup())).not.toThrow();
		expect(writeBackup(makeBackup())).toEqual({
			ok: false,
			message: TRANSFER_MESSAGES.localStorageUnavailable,
		});
	});

	it("寫入超出配額時回報失敗並提供繁體中文的修正建議", () => {
		vi.spyOn(window.localStorage, "setItem").mockImplementation(() => {
			throw new DOMException("超出配額", "QuotaExceededError");
		});

		expect(() => writeBackup(makeBackup())).not.toThrow();
		expect(writeBackup(makeBackup())).toEqual({
			ok: false,
			message: TRANSFER_MESSAGES.quotaExceeded,
		});
	});
});
