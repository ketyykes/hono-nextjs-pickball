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
import { readRoster } from "./storage";
import { readRound, readHistory } from "./round-storage";
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

		// 監看 setItem 從此刻起是否被呼叫過——讓「驗證失敗時沒有寫入路徑可走」這件事
		// 從「型別系統保證但測試沒觀察到」變成可被斷言觀察到的事實（M8 §7 兩階段
		// 審查 Blocker B1：原本 `if (parsed.ok)` 恆為 false，`writeBackup` 從未被
		// 呼叫，卻沒有任何斷言明確指出這件事）。
		const setItemSpy = vi.spyOn(window.localStorage, "setItem");

		const parsed = parseBackup("{ 不是合法 JSON");
		// 明確斷言驗證失敗——這個分支不再是「靜默略過」，而是本測試的核心錨點。
		expect(parsed.ok).toBe(false);
		// 型別上就無法對驗證失敗的結果呼叫 writeBackup（design Decision 1「原子性由
		// 型別強制」）：parsed.ok 為 false 時 parsed 沒有 backup 欄位，下面這段
		// 不會執行，三個 key 因此原封不動。
		if (parsed.ok) {
			writeBackup(parsed.backup);
		}

		// 明確斷言「沒有寫入路徑可走」：整段流程中 setItem 一次都沒被呼叫過。
		expect(setItemSpy).not.toHaveBeenCalled();
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
		const setItemSpy = vi.spyOn(window.localStorage, "setItem").mockImplementation(() => {
			throw new DOMException("超出配額", "QuotaExceededError");
		});

		expect(() => writeBackup(makeBackup())).not.toThrow();
		expect(writeBackup(makeBackup())).toEqual({
			ok: false,
			message: TRANSFER_MESSAGES.quotaExceeded,
		});

		// 明確 mockRestore：實測發現 happy-dom 環境下對 window.localStorage 實例方法的
		// spy，afterEach 的 vi.restoreAllMocks() 無法可靠還原（會殘留到下一條 it），
		// 只還原 window 的 "localStorage" getter 本身不受影響。此處明確還原以避免污染
		// 後續 it（見本輪新增的 readSnapshot／writeBackup happy-path it）。
		setItemSpy.mockRestore();
	});

	it("readSnapshot 在 localStorage 可用時回傳名單／回合／歷史的真實內容", () => {
		// M8 §7 兩階段審查 Blocker B2：readSnapshot 的 happy path（storage 可用時真正
		// 讀出資料）先前完全零覆蓋，guard 條件反轉、拿掉任一來源函式、entries→history
		// 欄位改名錯置皆不會被發現。本測試以真實 localStorage 內容（非 mock）逐欄位鎖住。
		const player = makePlayer();
		const round = makeRound();
		const entryA = makeHistoryEntry();
		const entryB = makeHistoryEntry({ matchId: "match-2" });

		localStorage.setItem(ROSTER_STORAGE_KEY, JSON.stringify({ version: 1, players: [player] }));
		localStorage.setItem(ROUND_STORAGE_KEY, JSON.stringify({ version: 1, round }));
		localStorage.setItem(
			HISTORY_STORAGE_KEY,
			JSON.stringify({ version: 1, entries: [entryA, entryB] }),
		);

		const snapshot = readSnapshot();

		expect(snapshot.players).toEqual([player]);
		expect(snapshot.currentRound).toEqual(round);
		// 特別鎖住「entries → history」的欄位改名對應，且用兩筆非空資料排除
		// 「巧合地都是空陣列」的情況。
		expect(snapshot.history).toHaveLength(2);
		expect(snapshot.history).toEqual([entryA, entryB]);
	});

	it("writeBackup 成功寫入後可用既有讀取函式還原名單／回合／歷史（round-trip）", () => {
		// M8 §7 兩階段審查 Blocker B3：writeBackup 的 happy path 先前完全零覆蓋，
		// 移除任一 setItem、容器 version／欄位名改壞皆不會被發現（寫入端與
		// readRoster／readRound／readHistory 的讀取端 schema 是否對齊，只有透過
		// round-trip 才能同時鎖住兩端）。
		const backup = makeBackup();

		const result = writeBackup(backup);

		expect(result).toEqual({ ok: true });
		expect(readRoster().players).toEqual(backup.players);
		expect(readRound()).toEqual(backup.currentRound);
		expect(readHistory().entries).toEqual(backup.history);
	});
});
