import { describe, it, expect } from "vitest";
import { buildBackup, backupFileName, parseBackup } from "./backup";
import { BackupSchema, TRANSFER_MESSAGES } from "./transfer-types";
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
		// 目前回合的整體內容（roundNumber／createdAt／format／courtCount／targetScore／
		// matches／restingPlayerIds）都必須與快照相等，不能只驗過簽章那一個子欄位。
		expect(backup.currentRound).toEqual(snapshot.currentRound);
		// 只做頂層淺拷貝：陣列本身是新的，但呼叫端 MUST 視 snapshot 為唯讀——
		// 這裡鎖住「確實有拷貝」這件事，避免展開語法被誤刪成直接參考傳遞。
		expect(backup.players).not.toBe(snapshot.players);
		expect(backup.history).not.toBe(snapshot.history);
		// 備份物件恰為 schema 宣告的四個欄位，不多不少——防止日後不小心多寫一個
		// schema 未宣告的欄位（例如把 exportedAt 也塞進輸出），那種欄位不會被
		// safeParse 偵測到（zod 物件預設 strip 多餘鍵而非 reject）。
		expect(Object.keys(backup).sort()).toEqual(["currentRound", "history", "players", "version"]);
		// 備份物件本身也必須通過自家的 BackupSchema，且驗證後的內容與輸出逐位元組
		// 相等——只斷言 success 不夠：若 schema 少宣告了某個欄位，safeParse 仍會
		// 回報成功，但驗證後的資料會悄悄少那個欄位。
		const parsed = BackupSchema.safeParse(backup);
		expect(parsed.success).toBe(true);
		if (parsed.success) {
			expect(parsed.data).toEqual(backup);
		}
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
		// currentRound 為 null 時仍須通過 BackupSchema——這是「空資料 SHALL NOT
		// 拒絕匯出」承諾在 schema 層的對應保證：schema 若漏了 .nullable()，
		// 使用者匯入自己剛匯出的空備份會被判為格式錯誤。
		const parsed = BackupSchema.safeParse(backup);
		expect(parsed.success).toBe(true);
		if (parsed.success) {
			expect(parsed.data).toEqual(backup);
		}
	});

	it("簽章以字串陣列寫入備份，JSON 往返後內容不變", () => {
		const round = makeRound();
		// 三個欄位皆給非空且插入順序與字母序不同的內容，才驗得出「有沒有真的排序」——
		// 若只餵本來就已排序的值，拿掉 .sort() 測試仍會全綠（M8 §2 Stage 2 實測發現）。
		const snapshot: BackupSnapshot = {
			...makeSnapshot(),
			currentRound: {
				...round,
				seenSignatures: {
					teammateKeys: new Set(["p2|p1", "p1|p2"]),
					opponentKeys: new Set(["p3|p4", "p1|p2"]),
					fullMatchKeys: new Set(["z|y", "a|b"]),
				},
			},
		};

		const backup = buildBackup(snapshot, { exportedAt: "2026-08-23T01:02:03.000Z" });

		expect(Array.isArray(backup.currentRound?.seenSignatures.teammateKeys)).toBe(true);
		expect(Array.isArray(backup.currentRound?.seenSignatures.opponentKeys)).toBe(true);
		expect(Array.isArray(backup.currentRound?.seenSignatures.fullMatchKeys)).toBe(true);
		// 三個欄位各自都要驗到「排序後的確切內容」，不是只驗類型。
		expect(backup.currentRound?.seenSignatures).toEqual({
			teammateKeys: ["p1|p2", "p2|p1"],
			opponentKeys: ["p1|p2", "p3|p4"],
			fullMatchKeys: ["a|b", "z|y"],
		});

		const roundTripped = JSON.parse(JSON.stringify(backup));
		expect(roundTripped).toEqual(backup);
	});

	it("簽章陣列輸入含重複值時原樣保留，buildBackup 不做去重", () => {
		const round = makeRound();
		const snapshot: BackupSnapshot = {
			...makeSnapshot(),
			currentRound: {
				...round,
				seenSignatures: {
					teammateKeys: ["p1|p2", "p1|p2", "p3|p4"],
					opponentKeys: [],
					fullMatchKeys: [],
				},
			},
		};

		const backup = buildBackup(snapshot, { exportedAt: "2026-08-23T01:02:03.000Z" });

		expect(backup.currentRound?.seenSignatures.teammateKeys).toEqual(["p1|p2", "p1|p2", "p3|p4"]);
	});

	it("BackupSchema 逐欄位鎖住合法型別，不因欄位放寬或遺漏而讓不合法資料通過", () => {
		const validBackup = buildBackup(makeSnapshot(), { exportedAt: "2026-08-23T01:02:03.000Z" });

		// version 必須恰為字面量 1，不可放寬為一般 number，也不可鎖死在其他字面量。
		expect(BackupSchema.safeParse({ ...validBackup, version: 2 }).success).toBe(false);

		// players 為必要欄位且逐筆驗證：整份缺少 players、或其中一筆格式不合法皆須拒絕。
		const withoutPlayers: Record<string, unknown> = { ...validBackup };
		delete withoutPlayers.players;
		expect(BackupSchema.safeParse(withoutPlayers).success).toBe(false);
		expect(
			BackupSchema.safeParse({
				...validBackup,
				players: [{ ...validBackup.players[0], rating: "not-a-number" }],
			}).success,
		).toBe(false);

		// currentRound 仍要求完整的 Round 結構，不可放寬為 z.unknown()。
		expect(
			BackupSchema.safeParse({
				...validBackup,
				currentRound: { ...validBackup.currentRound, roundNumber: "not-a-number" },
			}).success,
		).toBe(false);

		// history 逐筆驗證：其中一筆缺少必要欄位須整份拒絕，不走逐筆降級。
		const invalidHistoryEntry: Record<string, unknown> = { ...validBackup.history[0] };
		delete invalidHistoryEntry.winner;
		expect(
			BackupSchema.safeParse({ ...validBackup, history: [invalidHistoryEntry] }).success,
		).toBe(false);
	});

	it("backupFileName 依注入時間產生含日期的檔名", () => {
		expect(backupFileName("2026-08-23T01:02:03.000Z")).toBe("matchmaker-backup-2026-08-23.json");
	});

	it("buildBackup 的輸出經 JSON 往返後可被 parseBackup 還原為相同快照", () => {
		const snapshot = makeSnapshot();
		const backup = buildBackup(snapshot, { exportedAt: "2026-08-23T01:02:03.000Z" });

		// 往返走真正的 JSON 字串化／解析，不直接餵物件——parseBackup 的輸入契約是
		// 檔案內容字串，round-trip 要模擬使用者真正會走的路徑。
		const result = parseBackup(JSON.stringify(backup));

		expect(result.ok).toBe(true);
		if (result.ok) {
			// MUST 用 toEqual，SHALL NOT 比較 JSON 字串：MatchHistoryEntrySchema 是
			// discriminatedUnion，zod 重建物件後鍵序與輸入不同，字串比較會產生假紅燈
			// （M8 §2 Stage 2 交棒記錄）。
			expect(result.backup).toEqual(backup);
		}
	});

	it("JSON 語法錯誤時回傳繁體中文失敗訊息而非拋錯", () => {
		let result: ReturnType<typeof parseBackup> | undefined;

		// SHALL NOT 拋出例外——拋例外會讓整頁白畫面，是最糟的失敗模式（design Risks）。
		expect(() => {
			result = parseBackup("{ 不是合法 JSON");
		}).not.toThrow();

		expect(result?.ok).toBe(false);
		if (result && !result.ok) {
			expect(result.message).toMatch(/JSON/);
			expect(result.message).toMatch(/[一-鿿]/);
		}
	});

	it("version 不是 1 時整份拒絕並說明版本不支援", () => {
		const backup = buildBackup(makeSnapshot(), { exportedAt: "2026-08-23T01:02:03.000Z" });
		// 結構完整，僅 version 改為系統不支援的 2。
		const text = JSON.stringify({ ...backup, version: 2 });

		const result = parseBackup(text);

		expect(result.ok).toBe(false);
		if (!result.ok) {
			// 版本不符須有專屬訊息，不與「結構不合法」共用同一則（兩者的修正方式不同）。
			expect(result.message).toBe(TRANSFER_MESSAGES.unsupportedVersion);
			expect(result.message).not.toBe(TRANSFER_MESSAGES.invalidStructure);
		}
	});

	it("單筆參賽者不合法時整份拒絕，不走逐筆降級", () => {
		const snapshot = makeSnapshot({
			players: [
				makePlayer({ id: "p1", name: "Alice" }),
				// rating 99 超出 1.00～8.00，僅這一筆不合法。
				makePlayer({ id: "p2", name: "Bob", rating: 99 }),
				makePlayer({ id: "p3", name: "Cathy" }),
			],
		});
		const backup = buildBackup(snapshot, { exportedAt: "2026-08-23T01:02:03.000Z" });

		const result = parseBackup(JSON.stringify(backup));

		expect(result.ok).toBe(false);
		// 失敗分支的型別本就不帶任何資料欄位，「不保留另外兩位」由型別強制——
		// 此處只需確認整份被判定失敗，不需要（也無法）另外斷言「沒有 players 欄位」。
		if (!result.ok) {
			expect(result.message).toContain("參賽者");
		}
	});

	it("所有錯誤訊息為繁體中文且各自包含可採取的修正方式", () => {
		// 遍歷整張表而非手抄清單——§7 之後會再往 TRANSFER_MESSAGES 追加訊息，
		// 手抄清單會讓新訊息漏檢查也不會紅（design Decision 1）。
		const messages = Object.values(TRANSFER_MESSAGES);

		expect(messages.length).toBeGreaterThan(0);

		for (const message of messages) {
			// 不含未翻譯的 zod 原始 issue 字串（§11：不得只顯示技術錯誤碼）。
			expect(message).not.toMatch(/Invalid input|Expected|Required/i);
			// 含「請」字開頭的下一步指引。
			expect(message).toMatch(/請[^。]*[。]?/);
		}
	});
});
