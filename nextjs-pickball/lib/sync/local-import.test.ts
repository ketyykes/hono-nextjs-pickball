import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EXPECTED_USER_ID_HEADER } from "@pickball/core/api/headers";
import { LocalImportRequestSchema } from "@pickball/core/api/import";
import { createInitialState } from "@pickball/core/scoreboard/reducer";
import { BackupSchema } from "@pickball/core/matchmaker/transfer-types";
import type { Player } from "@pickball/core/matchmaker/types";
import type { Round, RoundMatch } from "@pickball/core/matchmaker/round-types";
import type { MatchHistoryEntry } from "@pickball/core/matchmaker/history";
import type { ScoreboardState } from "@pickball/core/scoreboard/types";
import { HISTORY_STORAGE_KEY, ROSTER_STORAGE_KEY, ROUND_STORAGE_KEY } from "../matchmaker/storage-keys";
import { MATCH_SLOTS_KEY, STORAGE_KEY as SCOREBOARD_CURRENT_KEY } from "../scoreboard/storage-keys";
import {
	backupToImportRequest,
	buildLocalImportPayload,
	hasImportableLocalData,
	importLocalData,
} from "./local-import";

const ALL_KEYS = [
	ROSTER_STORAGE_KEY,
	ROUND_STORAGE_KEY,
	HISTORY_STORAGE_KEY,
	MATCH_SLOTS_KEY,
	SCOREBOARD_CURRENT_KEY,
] as const;

const LIMIT_BYTES = 1_900_000;

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

function makeRoundMatch(overrides: Partial<RoundMatch> = {}): RoundMatch {
	return {
		id: "m1",
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

function makeCompletedMatch(id: string, courtNumber: number): RoundMatch {
	return makeRoundMatch({
		id,
		courtNumber,
		status: "completed",
		scores: { teamA: 11, teamB: 7 },
		winner: "teamA",
		completedAt: "2026-08-16T01:00:00.000Z",
		playerRatings: [
			{ playerId: "p1", before: 5, after: 5.2 },
			{ playerId: "p2", before: 6, after: 5.8 },
		],
	});
}

function makeRound(matches: RoundMatch[]): Round {
	return {
		roundNumber: 1,
		createdAt: "2026-08-16T00:00:00.000Z",
		format: "singles",
		courtCount: matches.length,
		targetScore: 11,
		matches,
		restingPlayerIds: [],
		seenSignatures: { teammateKeys: [], opponentKeys: [], fullMatchKeys: [] },
		timer: null,
	};
}

function makeHistoryEntry(matchId: string, scoreA = 11, name = "Alice"): MatchHistoryEntry {
	return {
		format: "singles",
		matchId,
		courtNumber: 1,
		playedAt: "2026-08-16T01:00:00.000Z",
		teamA: { rating: 5, players: [{ id: "p1", name, ratingBefore: 5, ratingAfter: 5.2 }] },
		teamB: { rating: 4, players: [{ id: "p2", name: "Bob", ratingBefore: 4, ratingAfter: 3.8 }] },
		scoreA,
		scoreB: 7,
		winner: "teamA",
	};
}

/** 分槽的 state；scores 各場不同，讓「讀錯槽」在比對時看得出來。 */
function makeSlot(matchId: string | null, usScore: number): ScoreboardState {
	const base = createInitialState({ targetScore: 15 });
	return { ...base, matchId, scores: { us: usScore, them: 1 } };
}

function seedRoster(players: Player[]) {
	localStorage.setItem(ROSTER_STORAGE_KEY, JSON.stringify({ version: 1, players }));
}
function seedRound(round: Round | null) {
	localStorage.setItem(ROUND_STORAGE_KEY, JSON.stringify({ version: 1, round }));
}
function seedHistory(entries: MatchHistoryEntry[]) {
	localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify({ version: 1, entries }));
}
function seedSlots(slots: Record<string, ScoreboardState>) {
	localStorage.setItem(MATCH_SLOTS_KEY, JSON.stringify(slots));
}
function seedCurrent(state: ScoreboardState) {
	localStorage.setItem(SCOREBOARD_CURRENT_KEY, JSON.stringify(state));
}

function snapshotKeys(): Record<string, string | null> {
	return Object.fromEntries(ALL_KEYS.map((key) => [key, localStorage.getItem(key)]));
}

/** 五個 key 都有、且無損毀資料的完整 seed（回合含一個進行中場次，分槽才會被讀取）。 */
function seedFullLocalData() {
	seedRoster([makePlayer(), makePlayer({ id: "p2", name: "Bob" })]);
	seedRound(makeRound([makeRoundMatch()]));
	seedHistory([makeHistoryEntry("h1")]);
	seedSlots({ m1: makeSlot("m1", 3) });
	seedCurrent(makeSlot(null, 5));
}

const utf8Length = (value: unknown): number => new TextEncoder().encode(JSON.stringify(value)).length;

beforeEach(() => {
	localStorage.clear();
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe("local-import", () => {
	it("buildLocalImportPayload 讀取本機五個 key 並略過孤兒分槽與重複歷史", () => {
		const players = [makePlayer(), makePlayer({ id: "p2", name: "Bob" }), makePlayer({ id: "p3", name: "Cara" })];
		const round = makeRound([makeRoundMatch({ id: "m1" }), makeCompletedMatch("m2", 2)]);
		// 第三筆與第一筆 matchId 相同但比分不同：保留第一筆、略過後者
		const firstH1 = makeHistoryEntry("h1", 11);
		const secondH2 = makeHistoryEntry("h2", 9);
		const duplicateH1 = makeHistoryEntry("h1", 4);
		const m1Slot = makeSlot("m1", 3);
		const current = makeSlot(null, 5);
		seedRoster(players);
		seedRound(round);
		seedHistory([firstH1, secondH2, duplicateH1]);
		seedSlots({ m1: m1Slot, m2: makeSlot("m2", 8), m9: makeSlot("m9", 9) });
		seedCurrent(current);
		const before = snapshotKeys();

		const result = buildLocalImportPayload();

		expect(result.payload.version).toBe(1);
		expect(result.payload.players).toEqual(players);
		expect(result.payload.currentRound).toEqual(round);
		expect(result.payload.history).toEqual([firstH1, secondH2]);
		expect(result.payload.scoreboard.matches).toEqual([m1Slot]);
		expect(result.payload.scoreboard.current).toEqual(current);
		expect(result.summary).toEqual({
			players: 3,
			round: true,
			slots: 1,
			history: 2,
			scoreboardCurrent: true,
			duplicateHistorySkipped: 1,
		});
		expect(result.isEmpty).toBe(false);
		expect(result.oversize).toBe(false);
		// 呼叫前後逐字相同（seed 不含損毀資料）
		expect(snapshotKeys()).toEqual(before);
		expect(LocalImportRequestSchema.safeParse(result.payload).success).toBe(true);

		// 進行中（scoring）也算未完成；分槽的 matchId 以場次 id 為準，不信任 state 內的值
		seedRound(makeRound([makeRoundMatch({ id: "m1" }), makeRoundMatch({ id: "m3", status: "scoring" }), makeCompletedMatch("m2", 2)]));
		seedSlots({ m1: makeSlot(null, 3), m2: makeSlot("m2", 8), m3: makeSlot("m3", 6), m9: makeSlot("m9", 9) });

		const second = buildLocalImportPayload();

		expect(second.payload.scoreboard.matches.map((slot) => slot.matchId)).toEqual(["m1", "m3"]);
		expect(second.payload.scoreboard.matches.map((slot) => slot.scores.us)).toEqual([3, 6]);
		expect(second.summary.slots).toBe(2);
	});

	it("本機沒有資料時回報 isEmpty，任一段超過上限時回報 oversize", () => {
		const empty = buildLocalImportPayload();
		expect(empty.isEmpty).toBe(true);
		expect(empty.oversize).toBe(false);
		expect(empty.summary).toEqual({
			players: 0,
			round: false,
			slots: 0,
			history: 0,
			scoreboardCurrent: false,
			duplicateHistorySkipped: 0,
		});

		// 只有空容器的 key（元件掛載時 write effect 會寫出）不算有資料
		seedRoster([]);
		seedHistory([]);
		seedRound(null);
		expect(buildLocalImportPayload().isEmpty).toBe(true);

		// 孤兒分槽（沒有回合）不會被讀取，因此不算有資料
		localStorage.clear();
		seedSlots({ m9: makeSlot("m9", 9) });
		expect(buildLocalImportPayload().isEmpty).toBe(true);

		// 五段中任一段有資料即非空
		const nonEmptySeeds: Array<[string, () => void]> = [
			["名單", () => seedRoster([makePlayer()])],
			["回合", () => seedRound(makeRound([makeCompletedMatch("m2", 1)]))],
			["歷史", () => seedHistory([makeHistoryEntry("h1")])],
			["獨立計分板", () => seedCurrent(makeSlot(null, 2))],
		];
		for (const [label, seed] of nonEmptySeeds) {
			localStorage.clear();
			seed();
			expect(buildLocalImportPayload().isEmpty, `只有${label}`).toBe(false);
		}
		localStorage.clear();
		seedRound(makeRound([makeRoundMatch()]));
		seedSlots({ m1: makeSlot("m1", 3) });
		expect(buildLocalImportPayload().isEmpty).toBe(false);

		// 三段各自以 UTF-8 位元組判定：恰為上限不算超過，多一位元組才算
		type Segment = "players" | "history" | "slots";
		const segmentSeeds: Record<Segment, (pad: string) => void> = {
			players: (pad) => seedRoster([makePlayer({ name: pad })]),
			history: (pad) => seedHistory([makeHistoryEntry("h1", 11, pad)]),
			slots: (pad) => {
				seedRound(makeRound([makeRoundMatch()]));
				const slot = makeSlot("m1", 3);
				seedSlots({
					m1: { ...slot, teamPlayers: { us: [{ name: pad, colorFrom: "#fff", colorTo: "#000", foreground: "#111" }], them: [{ name: "B", colorFrom: "#fff", colorTo: "#000", foreground: "#111" }] } },
				});
			},
		};
		const measureSegment = (segment: Segment): number => {
			const { payload } = buildLocalImportPayload();
			if (segment === "players") return utf8Length(payload.players);
			if (segment === "history") return utf8Length(payload.history);
			return utf8Length(payload.scoreboard.matches);
		};
		for (const segment of Object.keys(segmentSeeds) as Segment[]) {
			localStorage.clear();
			segmentSeeds[segment]("x");
			const baseBytes = measureSegment(segment);

			localStorage.clear();
			segmentSeeds[segment]("x".repeat(1 + LIMIT_BYTES - baseBytes));
			const atLimit = buildLocalImportPayload();
			expect(measureSegment(segment), `${segment} 恰為上限`).toBe(LIMIT_BYTES);
			expect(atLimit.oversize, `${segment} 恰為上限`).toBe(false);

			localStorage.clear();
			segmentSeeds[segment]("x".repeat(2 + LIMIT_BYTES - baseBytes));
			expect(buildLocalImportPayload().oversize, `${segment} 超過上限一位元組`).toBe(true);

			// 多位元組字元：字元數遠低於上限，但 UTF-8 位元組數超過
			localStorage.clear();
			segmentSeeds[segment]("中".repeat(700_000));
			expect(buildLocalImportPayload().oversize, `${segment} 多位元組字元`).toBe(true);
		}

		// 單段都沒超過時，各段加總超過也不算 oversize（D1 上限是每個參數各自計算）
		localStorage.clear();
		segmentSeeds.players("x".repeat(1_200_000));
		segmentSeeds.history("x".repeat(1_200_000));
		const combined = buildLocalImportPayload();
		expect(combined.oversize).toBe(false);
	});

	it("importLocalData 依回應分類為已匯入、雲端已有資料、未授權或失敗且不改動本機", async () => {
		seedFullLocalData();
		const { payload } = buildLocalImportPayload();
		const before = snapshotKeys();
		const importedBody = {
			imported: { players: 2, round: true, slots: 1, history: 1, scoreboardCurrent: "imported" },
		};
		const fetchMock = vi.fn<typeof fetch>();
		vi.stubGlobal("fetch", fetchMock);

		const respond = (response: Response) => fetchMock.mockResolvedValueOnce(response);
		const json = (status: number, body: unknown) =>
			new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

		respond(json(200, importedBody));
		expect(await importLocalData("user-a", payload)).toEqual({
			kind: "imported",
			imported: importedBody.imported,
		});

		respond(json(409, { error: "VERSION_CONFLICT" }));
		expect(await importLocalData("user-a", payload)).toEqual({ kind: "cloud-not-empty" });

		respond(json(401, { error: "ACCOUNT_MISMATCH" }));
		expect(await importLocalData("user-a", payload)).toEqual({ kind: "unauthorized" });

		respond(json(500, { error: "INTERNAL" }));
		expect(await importLocalData("user-a", payload)).toEqual({ kind: "failed" });

		// 其他 4xx（rejected）、不符 schema 的 200、無內容的 204、網路錯誤一律視為失敗
		respond(json(400, { error: "INVALID_BODY" }));
		expect(await importLocalData("user-a", payload)).toEqual({ kind: "failed" });
		respond(json(200, { imported: { players: "many" } }));
		expect(await importLocalData("user-a", payload)).toEqual({ kind: "failed" });
		respond(new Response(null, { status: 204 }));
		expect(await importLocalData("user-a", payload)).toEqual({ kind: "failed" });
		fetchMock.mockRejectedValueOnce(new TypeError("network"));
		expect(await importLocalData("user-a", payload)).toEqual({ kind: "failed" });

		// 每次呼叫恰好一個請求（不自動重試）
		expect(fetchMock).toHaveBeenCalledTimes(8);
		for (const call of fetchMock.mock.calls) {
			const [path, init] = call;
			expect(path).toBe("/api/import");
			expect(init?.method).toBe("POST");
			const headers = init?.headers as Record<string, string>;
			expect(headers[EXPECTED_USER_ID_HEADER]).toBe("user-a");
			expect(JSON.parse(init?.body as string)).toEqual(JSON.parse(JSON.stringify(payload)));
		}

		// 預期帳號只來自第一參數，不是固定值
		respond(json(200, importedBody));
		await importLocalData("user-b", payload);
		const lastHeaders = fetchMock.mock.calls[8][1]?.headers as Record<string, string>;
		expect(lastHeaders[EXPECTED_USER_ID_HEADER]).toBe("user-b");

		// 使用者定案：任何結果都保留本機資料，五個 key 逐字不變
		expect(snapshotKeys()).toEqual(before);
	});

	it("JSON 備份轉為匯入請求時計分板為空", () => {
		const backup = BackupSchema.parse({
			version: 1,
			players: [makePlayer(), makePlayer({ id: "p2", name: "Bob" })],
			currentRound: makeRound([makeRoundMatch()]),
			history: [makeHistoryEntry("h1"), makeHistoryEntry("h2")],
		});

		const request = backupToImportRequest(backup);

		expect(request.version).toBe(1);
		expect(request.players).toEqual(backup.players);
		expect(request.currentRound).toEqual(backup.currentRound);
		expect(request.history).toEqual(backup.history);
		expect(request.scoreboard).toEqual({ current: null, matches: [] });
		expect(LocalImportRequestSchema.safeParse(request).success).toBe(true);
	});

	it("hasImportableLocalData 只在任一 key 有資料時為 true", () => {
		expect(hasImportableLocalData()).toBe(false);

		// 只有空容器的 key（訪客開過頁面就會有）不算有可匯入的資料
		seedRoster([]);
		seedHistory([]);
		expect(hasImportableLocalData()).toBe(false);

		localStorage.clear();
		seedCurrent(makeSlot(null, 2));
		expect(hasImportableLocalData()).toBe(true);

		localStorage.clear();
		seedHistory([makeHistoryEntry("h1")]);
		expect(hasImportableLocalData()).toBe(true);

		localStorage.clear();
		seedRoster([makePlayer()]);
		expect(hasImportableLocalData()).toBe(true);

		localStorage.clear();
		seedRound(makeRound([makeRoundMatch()]));
		expect(hasImportableLocalData()).toBe(true);
	});
});
