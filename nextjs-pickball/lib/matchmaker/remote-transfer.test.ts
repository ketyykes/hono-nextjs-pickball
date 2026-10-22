import { afterEach, describe, expect, it, vi } from "vitest";
import type { Player } from "@pickball/core/matchmaker/types";
import type { Round } from "@pickball/core/matchmaker/round-types";
import type { MatchHistoryEntry } from "@pickball/core/matchmaker/history";
import { defaultGradient } from "./colors";
import { applyRosterImport, parseRosterCsv } from "./roster-csv";
import type { ParseRosterCsvResult } from "./roster-csv";
import { HISTORY_STORAGE_KEY, ROSTER_STORAGE_KEY, ROUND_STORAGE_KEY } from "./storage-keys";
import { REMOTE_TRANSFER_MESSAGES, buildRemoteBackupSnapshot, importRemoteRoster } from "./remote-transfer";

type OkPreview = Extract<ParseRosterCsvResult, { ok: true }>;

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

function makeRound(): Round {
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
		seenSignatures: { teammateKeys: [], opponentKeys: [], fullMatchKeys: [] },
		timer: null,
	};
}

function makeHistoryEntry(matchId: string): MatchHistoryEntry {
	return {
		format: "singles",
		matchId,
		courtNumber: 1,
		playedAt: "2026-08-16T01:00:00.000Z",
		teamA: { rating: 5, players: [{ id: "p1", name: "Alice", ratingBefore: 5, ratingAfter: 5.2 }] },
		teamB: { rating: 4, players: [{ id: "p2", name: "Bob", ratingBefore: 4, ratingAfter: 3.8 }] },
		scoreA: 11,
		scoreB: 7,
		winner: "teamA",
	};
}

function listResponse(players: Player[]): Response {
	const items = players.map((data) => ({ data, version: 1 }));
	return new Response(JSON.stringify({ items }), { status: 200 });
}

function parseOk(text: string): OkPreview {
	const parsed = parseRosterCsv(text);
	if (!parsed.ok) throw new Error("測試用 CSV 應可解析");
	return parsed;
}

const CSV_THREE_ROWS = "名稱,性別,強度分數\nCarol,女,4\nDave,男,5\nErin,女,6";
const CONTEXT = { ids: ["new-1", "new-2", "new-3"], now: "2026-09-01T00:00:00.000Z" };
// 雲端兩位佔用調色盤第 0、1 組：自動配色依雲端名單判斷時，新增者必須從第 2 組起，
// 若誤以空名單計算就會與雲端既有者撞色。
const CLOUD_PLAYERS = [
	makePlayer({ id: "c1", name: "Cloud1", ...defaultGradient(0) }),
	makePlayer({ id: "c2", name: "Cloud2", ...defaultGradient(1) }),
];

describe("remote-transfer", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		localStorage.clear();
	});

	it("雲端 CSV 匯入以雲端現有名單計算並只送出新增的參賽者", async () => {
		const fetchMock = vi.fn().mockImplementation(async (_path: string, init: RequestInit) => {
			if (init.method === "GET") return listResponse(CLOUD_PLAYERS);
			return listResponse([]);
		});
		vi.stubGlobal("fetch", fetchMock);
		// 本機訪客名單放一份不同的資料，確認匯入不碰它
		localStorage.setItem(ROSTER_STORAGE_KEY, JSON.stringify({ version: 1, players: [makePlayer({ id: "local" })] }));
		const localBefore = localStorage.getItem(ROSTER_STORAGE_KEY);

		const preview = parseOk(CSV_THREE_ROWS);
		const result = await importRemoteRoster(preview, CONTEXT);

		expect(result).toEqual({ ok: true });
		const calls = fetchMock.mock.calls;
		expect(calls).toHaveLength(2);
		expect([calls[0][1].method, calls[0][0]]).toEqual(["GET", "/api/matchmaker/players"]);
		expect([calls[1][1].method, calls[1][0]]).toEqual(["POST", "/api/matchmaker/players/import"]);

		const body = JSON.parse(calls[1][1].body as string) as { players: Player[] };
		expect(body.players).toHaveLength(3);
		expect(body.players.map((p) => p.id)).toEqual(CONTEXT.ids);
		// 配色依雲端名單判斷：期望值直接取 applyRosterImport 以雲端名單計算的新增段
		const expected = applyRosterImport(CLOUD_PLAYERS, preview, CONTEXT).slice(CLOUD_PLAYERS.length);
		expect(body.players).toEqual(expected);
		const cloudColors = CLOUD_PLAYERS.map((p) => `${p.colorFrom}|${p.colorTo}`);
		for (const added of body.players) {
			expect(cloudColors).not.toContain(`${added.colorFrom}|${added.colorTo}`);
		}
		expect(localStorage.getItem(ROSTER_STORAGE_KEY)).toBe(localBefore);
	});

	it("雲端 CSV 匯入失敗時回傳錯誤且不視為成功", async () => {
		const preview = parseOk(CSV_THREE_ROWS);

		// GET 失敗：不得繼續 POST
		const getFails = vi.fn().mockResolvedValue(new Response("boom", { status: 500 }));
		vi.stubGlobal("fetch", getFails);
		const r1 = await importRemoteRoster(preview, CONTEXT);
		expect(r1).toEqual({ ok: false, message: REMOTE_TRANSFER_MESSAGES.fetchFailed });
		expect(getFails).toHaveBeenCalledTimes(1);

		// POST 409
		for (const [status, message] of [
			[409, REMOTE_TRANSFER_MESSAGES.importConflict],
			[500, REMOTE_TRANSFER_MESSAGES.importFailed],
		] as const) {
			const fetchMock = vi.fn().mockImplementation(async (_p: string, init: RequestInit) => {
				if (init.method === "GET") return listResponse(CLOUD_PLAYERS);
				return new Response("x", { status });
			});
			vi.stubGlobal("fetch", fetchMock);
			const result = await importRemoteRoster(preview, CONTEXT);
			expect(result).toEqual({ ok: false, message });
			expect(fetchMock).toHaveBeenCalledTimes(2);
		}
	});

	it("雲端 CSV 匯入遇到登入失效時回傳登入失效訊息", async () => {
		const preview = parseOk(CSV_THREE_ROWS);
		const fetchMock = vi.fn().mockImplementation(async (_p: string, init: RequestInit) => {
			if (init.method === "GET") return listResponse(CLOUD_PLAYERS);
			return new Response("x", { status: 401 });
		});
		vi.stubGlobal("fetch", fetchMock);
		expect(await importRemoteRoster(preview, CONTEXT)).toEqual({
			ok: false,
			message: REMOTE_TRANSFER_MESSAGES.unauthorized,
		});

		const getUnauthorized = vi.fn().mockResolvedValue(new Response("x", { status: 401 }));
		vi.stubGlobal("fetch", getUnauthorized);
		expect(await importRemoteRoster(preview, CONTEXT)).toEqual({
			ok: false,
			message: REMOTE_TRANSFER_MESSAGES.unauthorized,
		});
		expect(getUnauthorized).toHaveBeenCalledTimes(1);
	});

	it("預覽含錯誤列時不送出任何請求並回傳錯誤", async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		const withErrors: OkPreview = {
			ok: true,
			rows: [],
			errors: [{ row: 2, column: "名稱", reason: "不可為空" }],
		};
		const result = await importRemoteRoster(withErrors, { ids: [], now: CONTEXT.now });
		expect(result).toEqual({ ok: false, message: REMOTE_TRANSFER_MESSAGES.previewHasErrors });
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("雲端備份快照的參賽者取自雲端、回合與歷史取自本機", async () => {
		const fetchMock = vi.fn().mockImplementation(async () => listResponse(CLOUD_PLAYERS));
		vi.stubGlobal("fetch", fetchMock);
		const round = makeRound();
		const history = [makeHistoryEntry("m-1"), makeHistoryEntry("m-2"), makeHistoryEntry("m-3")];
		localStorage.setItem(ROSTER_STORAGE_KEY, JSON.stringify({ version: 1, players: [makePlayer({ id: "guest" })] }));
		localStorage.setItem(ROUND_STORAGE_KEY, JSON.stringify({ version: 1, round }));
		localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify({ version: 1, entries: history }));

		const result = await buildRemoteBackupSnapshot();

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.snapshot.players).toEqual(CLOUD_PLAYERS);
		expect(result.snapshot.currentRound).toEqual(round);
		expect(result.snapshot.history).toEqual(history);
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(fetchMock.mock.calls[0][1].method).toBe("GET");
	});

	it("雲端備份快照取得名單失敗時回傳錯誤、不產生快照", async () => {
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("x", { status: 500 })));
		const result = await buildRemoteBackupSnapshot();
		expect(result).toEqual({ ok: false, message: REMOTE_TRANSFER_MESSAGES.backupFetchFailed });

		vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("x", { status: 401 })));
		expect(await buildRemoteBackupSnapshot()).toEqual({ ok: false, message: REMOTE_TRANSFER_MESSAGES.unauthorized });
	});
});
