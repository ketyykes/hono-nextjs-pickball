import { afterEach, describe, expect, it, vi } from "vitest";
import { MAX_PLAYERS_PER_IMPORT } from "@pickball/core/api/players";
import type { Player } from "@pickball/core/matchmaker/types";
import type { Round } from "@pickball/core/matchmaker/round-types";
import type { MatchHistoryEntry } from "@pickball/core/matchmaker/history";
import { defaultGradient } from "./colors";
import { applyRosterImport, parseRosterCsv } from "./roster-csv";
import type { ParseRosterCsvResult } from "./roster-csv";
import { HISTORY_STORAGE_KEY, ROSTER_STORAGE_KEY, ROUND_STORAGE_KEY } from "./storage-keys";
import { historyToCsv } from "./history-csv";
import {
	REMOTE_TRANSFER_MESSAGES,
	buildRemoteBackupSnapshot,
	buildRemoteHistoryCsv,
	importRemoteRoster,
} from "./remote-transfer";

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

function makeHistoryEntry(matchId: string, overrides: Partial<MatchHistoryEntry> = {}): MatchHistoryEntry {
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
		...overrides,
	} as MatchHistoryEntry;
}

function historyResponse(entries: MatchHistoryEntry[]): Response {
	const items = entries.map((data) => ({ data, version: 1 }));
	return new Response(JSON.stringify({ items, total: entries.length, droppedCount: 0 }), { status: 200 });
}

const HISTORY_ASC_PATH = "/api/matchmaker/history?order=asc";
// 雲端兩筆：姓名與比分各不相同，順序反轉或改用本機歷史時 CSV 內容必然不同
const CLOUD_HISTORY = [
	makeHistoryEntry("c-1", {
		playedAt: "2026-08-16T01:00:00.000Z",
		teamA: { rating: 5, players: [{ id: "c1", name: "雲端甲", ratingBefore: 5, ratingAfter: 5.2 }] },
		teamB: { rating: 4, players: [{ id: "c2", name: "雲端乙", ratingBefore: 4, ratingAfter: 3.8 }] },
		scoreA: 11,
		scoreB: 7,
	}),
	makeHistoryEntry("c-2", {
		playedAt: "2026-08-16T02:00:00.000Z",
		teamA: { rating: 4, players: [{ id: "c2", name: "雲端乙", ratingBefore: 3.8, ratingAfter: 4.1 }] },
		teamB: { rating: 5, players: [{ id: "c1", name: "雲端甲", ratingBefore: 5.2, ratingAfter: 5.0 }] },
		scoreA: 11,
		scoreB: 9,
	}),
];

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
		const result = await importRemoteRoster("user-a", preview, CONTEXT);

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
		const r1 = await importRemoteRoster("user-a", preview, CONTEXT);
		expect(r1).toEqual({ ok: false, message: REMOTE_TRANSFER_MESSAGES.fetchFailed });
		expect(getFails).toHaveBeenCalledTimes(1);

		// GET 回 400（rejected）與 5xx 同樣視為取得名單失敗
		const getRejected = vi.fn().mockResolvedValue(new Response("bad", { status: 400 }));
		vi.stubGlobal("fetch", getRejected);
		expect(await importRemoteRoster("user-a", preview, CONTEXT)).toEqual({
			ok: false,
			message: REMOTE_TRANSFER_MESSAGES.fetchFailed,
		});
		expect(getRejected).toHaveBeenCalledTimes(1);

		// POST 回 409、500、400，皆不視為成功
		for (const [status, message] of [
			[409, REMOTE_TRANSFER_MESSAGES.importConflict],
			[500, REMOTE_TRANSFER_MESSAGES.importFailed],
			[400, REMOTE_TRANSFER_MESSAGES.importFailed],
		] as const) {
			const fetchMock = vi.fn().mockImplementation(async (_p: string, init: RequestInit) => {
				if (init.method === "GET") return listResponse(CLOUD_PLAYERS);
				return new Response("x", { status });
			});
			vi.stubGlobal("fetch", fetchMock);
			const result = await importRemoteRoster("user-a", preview, CONTEXT);
			expect(result).toEqual({ ok: false, message });
			expect(fetchMock).toHaveBeenCalledTimes(2);
		}
	});

	it("雲端 CSV 匯入遇到 413 時回傳超過上限的訊息且不視為成功", async () => {
		const preview = parseOk(CSV_THREE_ROWS);
		const fetchMock = vi.fn().mockImplementation(async (_p: string, init: RequestInit) => {
			if (init.method === "GET") return listResponse(CLOUD_PLAYERS);
			return new Response(JSON.stringify({ error: "PAYLOAD_TOO_LARGE" }), { status: 413 });
		});
		vi.stubGlobal("fetch", fetchMock);

		const result = await importRemoteRoster("user-a", preview, CONTEXT);

		expect(result).toEqual({ ok: false, message: REMOTE_TRANSFER_MESSAGES.importTooLarge });
		// 不是未授權：呼叫端不得因此刷新 session
		expect((result as { unauthorized?: true }).unauthorized).toBeUndefined();
		expect(fetchMock).toHaveBeenCalledTimes(2);
		// 只有 413 是資料過大：高於 413 的其他 4xx 仍為 importFailed，且不帶未授權標示
		for (const status of [422, 429]) {
			const otherFetch = vi.fn().mockImplementation(async (_p: string, init: RequestInit) => {
				if (init.method === "GET") return listResponse(CLOUD_PLAYERS);
				return new Response("x", { status });
			});
			vi.stubGlobal("fetch", otherFetch);
			const other = await importRemoteRoster("user-a", preview, CONTEXT);
			expect(other, `狀態碼 ${status}`).toEqual({ ok: false, message: REMOTE_TRANSFER_MESSAGES.importFailed });
			expect((other as { unauthorized?: true }).unauthorized, `狀態碼 ${status}`).toBeUndefined();
		}
		// 固定文案：人數取自核心常數，其餘文字與規格逐字相同
		expect(REMOTE_TRANSFER_MESSAGES.importTooLarge).toBe(
			`匯入的資料量超過單次上限（一次最多 ${MAX_PLAYERS_PER_IMPORT} 位參賽者），本次沒有匯入任何資料。請將 CSV 分成較小的檔案後再匯入。`,
		);
	});

	it("雲端 CSV 匯入遇到登入失效時回傳登入失效訊息", async () => {
		const preview = parseOk(CSV_THREE_ROWS);
		const fetchMock = vi.fn().mockImplementation(async (_p: string, init: RequestInit) => {
			if (init.method === "GET") return listResponse(CLOUD_PLAYERS);
			return new Response("x", { status: 401 });
		});
		vi.stubGlobal("fetch", fetchMock);
		expect(await importRemoteRoster("user-a", preview, CONTEXT)).toEqual({
			ok: false,
			message: REMOTE_TRANSFER_MESSAGES.unauthorized,
		});

		const getUnauthorized = vi.fn().mockResolvedValue(new Response("x", { status: 401 }));
		vi.stubGlobal("fetch", getUnauthorized);
		expect(await importRemoteRoster("user-a", preview, CONTEXT)).toEqual({
			ok: false,
			message: REMOTE_TRANSFER_MESSAGES.unauthorized,
		});
		expect(getUnauthorized).toHaveBeenCalledTimes(1);
	});

	it("預覽沒有可新增的列時不送出匯入並視為成功", async () => {
		// 只有標題列的 CSV 會解析出空的 rows；後端 min(1) 會拒絕空陣列，重試也永遠失敗，
		// 而本機分支遇到同一份檔案是無害的成功，雲端分支應一致。
		const fetchMock = vi.fn().mockImplementation(async (_p: string, init: RequestInit) => {
			if (init.method === "GET") return listResponse(CLOUD_PLAYERS);
			return new Response("x", { status: 400 });
		});
		vi.stubGlobal("fetch", fetchMock);
		const preview = parseOk("名稱,性別,強度分數");
		expect(preview.rows).toHaveLength(0);

		const result = await importRemoteRoster("user-a", preview, { ids: [], now: CONTEXT.now });

		expect(result).toEqual({ ok: true });
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(fetchMock.mock.calls[0][1].method).toBe("GET");
	});

	it("雲端名單 GET 回 204 沒有內容時視為取得失敗", async () => {
		// requestJson 對 204 回 ok 且 value 為 undefined；名單 API 不該有此情形，必須當失敗而非當空名單
		const preview = parseOk(CSV_THREE_ROWS);
		const fetchMock = vi.fn().mockImplementation(async () => new Response(null, { status: 204 }));
		vi.stubGlobal("fetch", fetchMock);

		expect(await importRemoteRoster("user-a", preview, CONTEXT)).toEqual({
			ok: false,
			message: REMOTE_TRANSFER_MESSAGES.fetchFailed,
		});
		expect(await buildRemoteBackupSnapshot("user-a")).toEqual({
			ok: false,
			message: REMOTE_TRANSFER_MESSAGES.backupFetchFailed,
		});
		expect(fetchMock.mock.calls.every(([, init]) => init.method === "GET")).toBe(true);
	});

	it("預覽含錯誤列時不送出任何請求並回傳錯誤", async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		const withErrors: OkPreview = {
			ok: true,
			rows: [],
			errors: [{ row: 2, column: "名稱", reason: "不可為空" }],
		};
		const result = await importRemoteRoster("user-a", withErrors, { ids: [], now: CONTEXT.now });
		expect(result).toEqual({ ok: false, message: REMOTE_TRANSFER_MESSAGES.previewHasErrors });
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("雲端備份快照的參賽者、回合與歷史皆取自雲端", async () => {
		const cloudRound = { ...makeRound(), roundNumber: 7 };
		const localRound = makeRound();
		const cloudHistory = [
			makeHistoryEntry("c-1"),
			makeHistoryEntry("c-2"),
			makeHistoryEntry("c-3"),
			makeHistoryEntry("c-4"),
		];
		// 依路徑回應；history 傳 undefined 代表沿用雲端四筆正常回應
		const routeFetch = (overrides: {
			players?: () => Response;
			round?: () => Response;
			history?: () => Response;
		}) =>
			vi.fn().mockImplementation(async (path: string) => {
				if (path === "/api/matchmaker/round") {
					return overrides.round?.() ?? new Response(JSON.stringify({ data: cloudRound, version: 3 }), { status: 200 });
				}
				if (path === HISTORY_ASC_PATH) return overrides.history?.() ?? historyResponse(cloudHistory);
				return overrides.players?.() ?? listResponse(CLOUD_PLAYERS);
			});
		const fetchMock = routeFetch({});
		vi.stubGlobal("fetch", fetchMock);
		const localHistory = [makeHistoryEntry("m-1"), makeHistoryEntry("m-2"), makeHistoryEntry("m-3")];
		localStorage.setItem(ROSTER_STORAGE_KEY, JSON.stringify({ version: 1, players: [makePlayer({ id: "guest" })] }));
		localStorage.setItem(ROUND_STORAGE_KEY, JSON.stringify({ version: 1, round: localRound }));
		localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify({ version: 1, entries: localHistory }));

		const result = await buildRemoteBackupSnapshot("user-a");

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.snapshot.players).toEqual(CLOUD_PLAYERS);
		expect(result.snapshot.currentRound).toEqual(cloudRound);
		expect(result.snapshot.currentRound).not.toEqual(localRound);
		expect(result.snapshot.history).toEqual(cloudHistory);
		expect(result.snapshot.history).not.toEqual(localHistory);
		expect(fetchMock).toHaveBeenCalledTimes(3);
		expect(fetchMock.mock.calls.every(([, init]) => init.method === "GET")).toBe(true);
		// history 以 order=asc 請求（完成順序）；不帶 order 或改 desc 都會拿到相反的順序
		expect(fetchMock.mock.calls.map(([path]) => path).sort()).toEqual([
			HISTORY_ASC_PATH,
			"/api/matchmaker/players",
			"/api/matchmaker/round",
		]);

		// 雲端沒有進行中的回合（data 為 null）時，currentRound 為 null，不可退回本機的回合
		vi.stubGlobal("fetch", routeFetch({ round: () => new Response(JSON.stringify({ data: null, version: 0 }), { status: 200 }) }));
		const noRound = await buildRemoteBackupSnapshot("user-a");
		expect(noRound.ok).toBe(true);
		if (noRound.ok) expect(noRound.snapshot.currentRound).toBeNull();

		// 雲端沒有歷史時 history 為空陣列，不可退回本機的歷史
		vi.stubGlobal("fetch", routeFetch({ history: () => historyResponse([]) }));
		const noHistory = await buildRemoteBackupSnapshot("user-a");
		expect(noHistory.ok).toBe(true);
		if (noHistory.ok) expect(noHistory.snapshot.history).toEqual([]);

		// 三條讀取各自失敗（5xx、204 無內容、400 被拒絕、回應結構不合法、401）時回傳錯誤、不回傳快照，
		// 即使另外兩條讀取成功（三條各自獨立判斷，不能互相掩護）
		const failures: Array<[string, () => Response, string]> = [
			["5xx", () => new Response("x", { status: 500 }), REMOTE_TRANSFER_MESSAGES.backupFetchFailed],
			["204", () => new Response(null, { status: 204 }), REMOTE_TRANSFER_MESSAGES.backupFetchFailed],
			["400", () => new Response("x", { status: 400 }), REMOTE_TRANSFER_MESSAGES.backupFetchFailed],
			["壞結構", () => new Response(JSON.stringify({ items: "x" }), { status: 200 }), REMOTE_TRANSFER_MESSAGES.backupFetchFailed],
			["401", () => new Response("x", { status: 401 }), REMOTE_TRANSFER_MESSAGES.unauthorized],
		];
		for (const [, response, expected] of failures) {
			for (const source of ["round", "players", "history"] as const) {
				vi.stubGlobal("fetch", routeFetch({ [source]: response }));
				expect(await buildRemoteBackupSnapshot("user-a")).toEqual({ ok: false, message: expected });
			}
		}
	});

	it("雲端歷史 CSV 以雲端歷史依完成順序產生", async () => {
		const fetchMock = vi.fn().mockImplementation(async () => historyResponse(CLOUD_HISTORY));
		vi.stubGlobal("fetch", fetchMock);
		const localHistory = [makeHistoryEntry("m-1"), makeHistoryEntry("m-2"), makeHistoryEntry("m-3")];
		localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify({ version: 1, entries: localHistory }));

		const result = await buildRemoteHistoryCsv("user-a");

		expect(result).toEqual({ ok: true, csv: historyToCsv(CLOUD_HISTORY) });
		// 對照組：順序反轉或改用本機歷史產生的 CSV 與期望值不同，斷言才有鑑別力
		expect(historyToCsv([...CLOUD_HISTORY].reverse())).not.toBe(historyToCsv(CLOUD_HISTORY));
		expect(historyToCsv(localHistory)).not.toBe(historyToCsv(CLOUD_HISTORY));
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(fetchMock.mock.calls[0][0]).toBe(HISTORY_ASC_PATH);
		expect(fetchMock.mock.calls[0][1].method).toBe("GET");

		// 雲端沒有歷史時仍是成功，CSV 只有標題列，不可退回本機歷史
		vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => historyResponse([])));
		expect(await buildRemoteHistoryCsv("user-a")).toEqual({ ok: true, csv: historyToCsv([]) });

		// 讀取失敗（5xx、204 無內容、400 被拒絕、回應結構不合法、連線失敗）時回傳錯誤、不產生 CSV
		const failureResponses: Array<() => Promise<Response>> = [
			async () => new Response("x", { status: 500 }),
			async () => new Response(null, { status: 204 }),
			async () => new Response("x", { status: 400 }),
			async () => new Response(JSON.stringify({ items: "x" }), { status: 200 }),
			async () => {
				throw new Error("network down");
			},
		];
		for (const respond of failureResponses) {
			vi.stubGlobal("fetch", vi.fn().mockImplementation(respond));
			const failed = await buildRemoteHistoryCsv("user-a");
			expect(failed).toEqual({ ok: false, message: REMOTE_TRANSFER_MESSAGES.historyCsvFetchFailed });
			expect(REMOTE_TRANSFER_MESSAGES.historyCsvFetchFailed).toBe(
				"無法取得雲端的歷史賽果，未產生 CSV 檔。請確認網路連線後再試一次。",
			);
		}
	});

	it("雲端歷史匯出的每個請求帶呼叫端給的帳號且 401 時標示未授權", async () => {
		function expectedUsers(fetchMock: ReturnType<typeof vi.fn>): Array<string | null> {
			return fetchMock.mock.calls.map(([, init]) =>
				new Headers((init as RequestInit).headers).get("X-Expected-User-Id"),
			);
		}
		const roundBody = () => new Response(JSON.stringify({ data: null, version: 0 }), { status: 200 });
		const routeFetch = (overrides: { players?: () => Response; round?: () => Response; history?: () => Response }) =>
			vi.fn().mockImplementation(async (path: string) => {
				if (path === "/api/matchmaker/round") return overrides.round?.() ?? roundBody();
				if (path === HISTORY_ASC_PATH) return overrides.history?.() ?? historyResponse(CLOUD_HISTORY);
				return overrides.players?.() ?? listResponse(CLOUD_PLAYERS);
			});

		// 備份的名單、回合、歷史三個 GET 與 CSV 的歷史 GET 皆帶呼叫端給的帳號
		const backupFetch = routeFetch({});
		vi.stubGlobal("fetch", backupFetch);
		await buildRemoteBackupSnapshot("user-a");
		expect(expectedUsers(backupFetch)).toEqual(["user-a", "user-a", "user-a"]);

		const csvFetch = routeFetch({});
		vi.stubGlobal("fetch", csvFetch);
		await buildRemoteHistoryCsv("user-a");
		expect(expectedUsers(csvFetch)).toEqual(["user-a"]);

		// 歷史 GET 回 401：兩者的失敗結果皆帶機器可讀的未授權標示
		const history401 = () => new Response("x", { status: 401 });
		vi.stubGlobal("fetch", routeFetch({ history: history401 }));
		const backup401 = await buildRemoteBackupSnapshot("user-a");
		expect(backup401.ok).toBe(false);
		if (!backup401.ok) {
			expect(backup401.unauthorized).toBe(true);
			expect(backup401.message).toBe(REMOTE_TRANSFER_MESSAGES.unauthorized);
		}
		const csv401 = await buildRemoteHistoryCsv("user-a");
		expect(csv401.ok).toBe(false);
		if (!csv401.ok) {
			expect(csv401.unauthorized).toBe(true);
			expect(csv401.message).toBe(REMOTE_TRANSFER_MESSAGES.unauthorized);
		}

		// 先判斷有無 401 再判斷其他失敗：名單或回合 500、歷史 401 時仍標示未授權
		for (const source of ["players", "round"] as const) {
			vi.stubGlobal("fetch", routeFetch({ [source]: () => new Response("x", { status: 500 }), history: history401 }));
			const mixed = await buildRemoteBackupSnapshot("user-a");
			expect(mixed.ok).toBe(false);
			if (!mixed.ok) {
				expect(mixed.unauthorized).toBe(true);
				expect(mixed.message).toBe(REMOTE_TRANSFER_MESSAGES.unauthorized);
			}
		}
		// 反向：歷史 500、名單 401 同樣標示未授權
		vi.stubGlobal(
			"fetch",
			routeFetch({ history: () => new Response("x", { status: 500 }), players: () => new Response("x", { status: 401 }) }),
		);
		const reversed = await buildRemoteBackupSnapshot("user-a");
		expect(reversed.ok).toBe(false);
		if (!reversed.ok) expect(reversed.unauthorized).toBe(true);

		// 歷史 GET 回 500：不帶未授權標示，訊息各用各的
		vi.stubGlobal("fetch", routeFetch({ history: () => new Response("x", { status: 500 }) }));
		const backup500 = await buildRemoteBackupSnapshot("user-a");
		expect(backup500.ok).toBe(false);
		if (!backup500.ok) {
			expect(backup500.unauthorized).toBeUndefined();
			expect(backup500.message).toBe(REMOTE_TRANSFER_MESSAGES.backupFetchFailed);
		}
		const csv500 = await buildRemoteHistoryCsv("user-a");
		expect(csv500.ok).toBe(false);
		if (!csv500.ok) {
			expect(csv500.unauthorized).toBeUndefined();
			expect(csv500.message).toBe(REMOTE_TRANSFER_MESSAGES.historyCsvFetchFailed);
		}
	});

	// 既有行為的 regression guard，加入即綠、非 RED：既有測試只涵蓋歷史與另兩個來源的交叉，
	// 名單與回合互相交叉時若 401 判斷晚於另一方的失敗判斷，會誤回一般失敗而非未授權
	it("regression guard：名單與回合交叉時 401 先於其他失敗判斷", async () => {
		const routeFetch = (overrides: { players?: () => Response; round?: () => Response }) =>
			vi.fn().mockImplementation(async (path: string) => {
				if (path === "/api/matchmaker/round") {
					return overrides.round?.() ?? new Response(JSON.stringify({ data: null, version: 0 }), { status: 200 });
				}
				if (path === HISTORY_ASC_PATH) return historyResponse(CLOUD_HISTORY);
				return overrides.players?.() ?? listResponse(CLOUD_PLAYERS);
			});
		const crossings = [
			{ unauthorizedSource: "players", failedSource: "round" },
			{ unauthorizedSource: "round", failedSource: "players" },
		] as const;

		for (const { unauthorizedSource, failedSource } of crossings) {
			vi.stubGlobal(
				"fetch",
				routeFetch({
					[unauthorizedSource]: () => new Response("x", { status: 401 }),
					[failedSource]: () => new Response("x", { status: 500 }),
				}),
			);

			const crossed = await buildRemoteBackupSnapshot("user-a");

			// 先擋掉成功分支，避免後續斷言被條件式跳過
			if (crossed.ok) throw new Error("來源失敗時不應回傳快照");
			expect(crossed.unauthorized).toBe(true);
			expect(crossed.message).toBe(REMOTE_TRANSFER_MESSAGES.unauthorized);
		}
	});

	it("雲端備份快照取得名單失敗時回傳錯誤、不產生快照", async () => {
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("x", { status: 500 })));
		const result = await buildRemoteBackupSnapshot("user-a");
		expect(result).toEqual({ ok: false, message: REMOTE_TRANSFER_MESSAGES.backupFetchFailed });

		vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("x", { status: 401 })));
		expect(await buildRemoteBackupSnapshot("user-a")).toEqual({ ok: false, message: REMOTE_TRANSFER_MESSAGES.unauthorized });
	});

	it("雲端匯入與備份的每個請求都帶呼叫端給的帳號", async () => {
		function expectedUsers(fetchMock: ReturnType<typeof vi.fn>): Array<string | null> {
			return fetchMock.mock.calls.map(([, init]) =>
				new Headers((init as RequestInit).headers).get("X-Expected-User-Id"),
			);
		}

		// 匯入：匯入前的 GET 與匯入的 POST 用同一個帳號
		const importFetch = vi.fn().mockImplementation(async (_path: string, init: RequestInit) => {
			if (init.method === "GET") return listResponse(CLOUD_PLAYERS);
			return listResponse([]);
		});
		vi.stubGlobal("fetch", importFetch);
		await importRemoteRoster("user-a", parseOk(CSV_THREE_ROWS), CONTEXT);
		expect(importFetch.mock.calls.map(([, init]) => init.method)).toEqual(["GET", "POST"]);
		expect(expectedUsers(importFetch)).toEqual(["user-a", "user-a"]);

		// 備份：名單、回合與歷史三個 GET 用同一個帳號
		const backupFetch = vi.fn().mockImplementation(async (path: string) => {
			if (path === "/api/matchmaker/round") {
				return new Response(JSON.stringify({ data: null, version: 0 }), { status: 200 });
			}
			if (path.startsWith("/api/matchmaker/history")) return historyResponse([]);
			return listResponse(CLOUD_PLAYERS);
		});
		vi.stubGlobal("fetch", backupFetch);
		await buildRemoteBackupSnapshot("user-a");
		expect(backupFetch).toHaveBeenCalledTimes(3);
		expect(expectedUsers(backupFetch)).toEqual(["user-a", "user-a", "user-a"]);
	});

	it("雲端匯入與備份遇到 401 時以機器可讀欄位標示未授權", async () => {
		const preview = parseOk(CSV_THREE_ROWS);
		const unauthorizedResponse = () => new Response("x", { status: 401 });

		// 匯入：GET 401
		vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => unauthorizedResponse()));
		const getUnauthorized = await importRemoteRoster("user-a", preview, CONTEXT);
		expect(getUnauthorized.ok).toBe(false);
		if (!getUnauthorized.ok) {
			expect(getUnauthorized.unauthorized).toBe(true);
			expect(getUnauthorized.message).toBe(REMOTE_TRANSFER_MESSAGES.unauthorized);
		}

		// 匯入：POST 401
		vi.stubGlobal(
			"fetch",
			vi.fn().mockImplementation(async (_p: string, init: RequestInit) => {
				if (init.method === "GET") return listResponse(CLOUD_PLAYERS);
				return unauthorizedResponse();
			}),
		);
		const postUnauthorized = await importRemoteRoster("user-a", preview, CONTEXT);
		expect(postUnauthorized.ok).toBe(false);
		if (!postUnauthorized.ok) {
			expect(postUnauthorized.unauthorized).toBe(true);
			expect(postUnauthorized.message).toBe(REMOTE_TRANSFER_MESSAGES.unauthorized);
		}

		// 備份：名單 GET 與回合 GET 各自 401
		for (const unauthorizedPath of ["/api/matchmaker/players", "/api/matchmaker/round"]) {
			vi.stubGlobal(
				"fetch",
				vi.fn().mockImplementation(async (path: string) => {
					if (path === unauthorizedPath) return unauthorizedResponse();
					if (path === "/api/matchmaker/round") {
						return new Response(JSON.stringify({ data: null, version: 0 }), { status: 200 });
					}
					return listResponse(CLOUD_PLAYERS);
				}),
			);
			const backup = await buildRemoteBackupSnapshot("user-a");
			expect(backup.ok).toBe(false);
			if (!backup.ok) {
				expect(backup.unauthorized).toBe(true);
				expect(backup.message).toBe(REMOTE_TRANSFER_MESSAGES.unauthorized);
			}
		}

		// 其他失敗（取得失敗、衝突、匯入失敗、備份取得失敗）不帶未授權欄位，訊息不變
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("x", { status: 500 })));
		const getFailed = await importRemoteRoster("user-a", preview, CONTEXT);
		expect(getFailed).toEqual({ ok: false, message: REMOTE_TRANSFER_MESSAGES.fetchFailed });
		if (!getFailed.ok) expect(getFailed.unauthorized).toBeUndefined();

		for (const [status, message] of [
			[409, REMOTE_TRANSFER_MESSAGES.importConflict],
			[500, REMOTE_TRANSFER_MESSAGES.importFailed],
		] as const) {
			vi.stubGlobal(
				"fetch",
				vi.fn().mockImplementation(async (_p: string, init: RequestInit) => {
					if (init.method === "GET") return listResponse(CLOUD_PLAYERS);
					return new Response("x", { status });
				}),
			);
			const failed = await importRemoteRoster("user-a", preview, CONTEXT);
			expect(failed.ok).toBe(false);
			if (!failed.ok) {
				expect(failed.unauthorized).toBeUndefined();
				expect(failed.message).toBe(message);
			}
		}

		vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("x", { status: 500 })));
		const backupFailed = await buildRemoteBackupSnapshot("user-a");
		expect(backupFailed.ok).toBe(false);
		if (!backupFailed.ok) {
			expect(backupFailed.unauthorized).toBeUndefined();
			expect(backupFailed.message).toBe(REMOTE_TRANSFER_MESSAGES.backupFetchFailed);
		}
	});
});
