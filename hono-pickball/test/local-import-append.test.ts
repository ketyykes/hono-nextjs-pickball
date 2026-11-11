import "../src/index";
import { env, exports } from "cloudflare:workers";
import { API_ERROR_CODES } from "@pickball/core/api/errors";
import { EXPECTED_USER_ID_HEADER } from "@pickball/core/api/headers";
import {
	type AppendImportRequest,
	type AppendImportResponse,
	IMPORT_BODY_LIMIT_BYTES,
	IMPORT_SEGMENT_LIMIT_BYTES,
	serializeAppendSegments,
	utf8ByteLength,
} from "@pickball/core/api/import";
import { MAX_PLAYERS_PER_IMPORT } from "@pickball/core/api/players";
import { USER_DATA_TABLES } from "@pickball/core/api/user-data-tables";
import type { MatchHistoryEntry } from "@pickball/core/matchmaker/history";
import type { Player } from "@pickball/core/matchmaker/types";
import { describe, expect, it, vi } from "vitest";
import app from "../src/index";
import {
	appRequestInit,
	makeHistoryEntry,
	makeMatch,
	makeRound,
	makeSlot,
	origin,
	request,
	rowsOf,
	seedAndSignIn,
	seedHistory,
	seedRound,
	seedSlot,
} from "./helpers/matchmaker-fixtures";
import { expectedUserHeader, userIdOf } from "./helpers/session";

const APPEND_URL = `${origin}/api/import/append`;

// T2 晚於 T1：用來證明附加的歷史依備份順序接在後面，且 played_at 取自 playedAt
const T1 = "2026-01-01T00:10:00.000Z";
const T2 = "2026-01-01T00:20:00.000Z";

function makePlayer(id: string, overrides: Partial<Player> = {}): Player {
	return {
		id,
		name: `球友 ${id}`,
		gender: "male",
		colorFrom: "#112233",
		colorTo: "#445566",
		rating: 4,
		restCount: 0,
		gamesPlayed: 0,
		isActive: true,
		createdAt: "2026-01-01T00:00:00.000Z",
		...overrides,
	};
}

function historyAt(matchId: string, playedAt: string): MatchHistoryEntry {
	return { ...makeHistoryEntry(matchId), playedAt };
}

function postAppend(cookie: string | undefined, body: unknown): Promise<Response> {
	return exports.default.fetch(new Request(APPEND_URL, appRequestInit(cookie, { method: "POST", body })));
}

/** 不經 helper 補標頭：用來送出缺少、空白或他人帳號的 X-Expected-User-Id。 */
function postAppendWithHeaders(headers: Record<string, string>, body: unknown): Promise<Response> {
	return exports.default.fetch(
		new Request(APPEND_URL, {
			method: "POST",
			headers: { Origin: origin, "Content-Type": "application/json", ...headers },
			body: JSON.stringify(body),
		}),
	);
}

async function postAppendWithDb(cookie: string, body: unknown, db: D1Database): Promise<Response> {
	return app.request(
		"/api/import/append",
		{
			method: "POST",
			headers: { Cookie: cookie, Origin: origin, "Content-Type": "application/json", ...expectedUserHeader(cookie) },
			body: JSON.stringify(body),
		},
		{ ...env, DB: db },
	);
}

async function appendOk(cookie: string, body: unknown): Promise<AppendImportResponse> {
	const res = await postAppend(cookie, body);
	expect(res.status, "附加應回 200").toBe(200);
	return (await res.json()) as AppendImportResponse;
}

interface Item<T> {
	data: T;
	version: number;
}

async function getJson<T>(cookie: string, path: string): Promise<T> {
	const res = await request(cookie, "GET", path);
	expect(res.status, `GET ${path}`).toBe(200);
	return (await res.json()) as T;
}

/** 以 PUT 建立雲端參賽者（version 0 即建立），建立順序決定 sort_order。 */
async function putPlayer(cookie: string, player: Player): Promise<void> {
	const res = await request(cookie, "PUT", `/players/${player.id}`, { data: player, version: 0 });
	expect(res.status, `建立 ${player.id}`).toBe(200);
}

async function listPlayerIds(cookie: string): Promise<string[]> {
	const body = await getJson<{ items: Array<Item<Player>> }>(cookie, "/players");
	return body.items.map((item) => item.data.id);
}

async function listHistory(cookie: string): Promise<MatchHistoryEntry[]> {
	const body = await getJson<{ items: Array<Item<MatchHistoryEntry>> }>(cookie, "/history?order=asc");
	return body.items.map((item) => item.data);
}

type Snapshot = Record<string, Array<Record<string, unknown>>>;

async function snapshotOf(userIds: string[]): Promise<Snapshot> {
	const snapshot: Snapshot = {};
	for (const userId of userIds) {
		for (const table of USER_DATA_TABLES) {
			snapshot[`${table}:${userId}`] = await rowsOf(table, userId);
		}
	}
	return snapshot;
}

function team(ids: string[]) {
	return {
		players: ids.map((id) => ({ id, name: `球員${id}`, ratingBefore: 4, ratingAfter: 4.2 })),
		rating: 4,
	};
}

/** 歷史段（單筆歷史）經 serializeAppendSegments 後恰為 targetBytes 位元組的合法請求。 */
function requestWithHistorySegmentBytes(matchId: string, targetBytes: number): AppendImportRequest {
	const build = (padding: number): AppendImportRequest => {
		const entry = structuredClone(makeHistoryEntry(matchId));
		entry.teamA.players[0].name = "x".repeat(padding);
		return { players: [], history: [entry] };
	};
	const baseBytes = utf8ByteLength(serializeAppendSegments(build(0)).history);
	return build(targetBytes - baseBytes);
}

/** batch 被呼叫即計數並拋錯的替身；prepare 照常委派給真實 D1，所以 session 驗證可通過。 */
function batchCountingDb(error: Error): { db: D1Database; batchCalls: { count: number } } {
	const batchCalls = { count: 0 };
	const db = {
		prepare: (query: string) => env.DB?.prepare(query),
		batch: () => {
			batchCalls.count += 1;
			throw error;
		},
	} as unknown as D1Database;
	return { db, batchCalls };
}

describe("POST /api/import/append 本機備份附加到雲端", () => {
	// regression guard：sub-app 的 localAuth 對未定義路由同樣先回 404
	it("auth 停用且無 DB binding 時附加端點回 404", async () => {
		const disabledEnv = { ...env, ENVIRONMENT: undefined, DB: undefined };
		const body: AppendImportRequest = { players: [makePlayer("a-1")], history: [] };

		const res = await app.request(
			"/api/import/append",
			appRequestInit(undefined, { method: "POST", body }),
			disabledEnv,
		);

		expect(res.status).toBe(404);
	});

	// regression guard：sub-app 的 use("*") 對未定義路由也會先執行
	it("未登入呼叫附加端點回 401", async () => {
		const res = await postAppend(undefined, { players: [makePlayer("a-1")], history: [] });

		expect(res.status).toBe(401);
		expect(await res.json()).toEqual({ error: API_ERROR_CODES.UNAUTHORIZED });
	});

	it("雲端已有資料時附加略過同名或已存在 id 的參賽者與重複歷史，其餘依備份順序接在後面", async () => {
		const cookie = await seedAndSignIn("append-golden@example.com");
		const userId = await userIdOf("append-golden@example.com");
		await putPlayer(cookie, makePlayer("c1", { name: "甲", rating: 3 }));
		await putPlayer(cookie, makePlayer("c2", { name: "乙" }));
		const cloudH1 = historyAt("h1", T1);
		await seedHistory(userId, cloudH1);
		const maxSortOrderBefore = Math.max(
			...(await rowsOf("matchmaker_players", userId)).map((row) => row.sort_order as number),
		);

		const backupB2 = makePlayer("b2", { name: "丙" });
		const result = await appendOk(cookie, {
			players: [
				makePlayer("b1", { name: "甲", rating: 5 }),
				backupB2,
				makePlayer("c2", { name: "改名乙" }),
				makePlayer("b3", { name: "丁" }),
			],
			history: [{ ...historyAt("h1", T1), scoreA: 3 }, historyAt("h2", T2), historyAt("h3", T2)],
		});

		expect(result.appended).toEqual({
			players: { added: 2, skipped: 2 },
			history: { added: 2, skipped: 1 },
		});
		const players = await getJson<{ items: Array<Item<Player>> }>(cookie, "/players");
		expect(players.items.map((item) => item.data.id)).toEqual(["c1", "c2", "b2", "b3"]);
		expect(players.items[0].data.rating).toBe(3);
		expect(players.items[1].data.name).toBe("乙");
		expect(players.items[2].data).toEqual(backupB2);
		const sortOrders = new Map(
			(await rowsOf("matchmaker_players", userId)).map((row) => [row.id as string, row.sort_order as number]),
		);
		expect(sortOrders.get("b2")).toBeGreaterThan(maxSortOrderBefore);
		expect(sortOrders.get("b3")).toBeGreaterThan(sortOrders.get("b2") as number);
		const history = await listHistory(cookie);
		expect(history.map((entry) => entry.matchId)).toEqual(["h1", "h2", "h3"]);
		expect(history[0]).toEqual(cloudH1);
	});

	it("附加不改動回合、分槽、獨立計分板、版本下限與整批守衛表", async () => {
		const cookie = await seedAndSignIn("append-untouched@example.com");
		const userId = await userIdOf("append-untouched@example.com");
		// 先建立再重置，使 sync_version_floors 有本人的列；重置也清空其他表，之後再準備不碰的資料
		await putPlayer(cookie, makePlayer("u-old"));
		expect((await request(cookie, "POST", "/reset")).status).toBe(204);
		await seedRound(userId, makeRound([makeMatch("m1")]));
		await seedSlot(userId, makeSlot("m1", 5));
		const scoreboard = await exports.default.fetch(
			new Request(
				`${origin}/api/scoreboard/current`,
				appRequestInit(cookie, { method: "PUT", body: { data: makeSlot(null, 3), version: 0 } }),
			),
		);
		expect(scoreboard.status).toBe(200);
		const untouchedTables = [
			"matchmaker_round",
			"matchmaker_match_slots",
			"scoreboard_current",
			"sync_version_floors",
		];
		const before: Snapshot = {};
		for (const table of untouchedTables) {
			before[table] = await rowsOf(table, userId);
			expect(before[table].length, `${table} 附加前應有本人的列`).toBeGreaterThan(0);
		}

		const result = await appendOk(cookie, {
			players: [makePlayer("u-new", { name: "新人" })],
			history: [historyAt("u-h1", T1)],
		});

		expect(result.appended).toEqual({
			players: { added: 1, skipped: 0 },
			history: { added: 1, skipped: 0 },
		});
		for (const table of untouchedTables) {
			expect(await rowsOf(table, userId), table).toEqual(before[table]);
		}
		expect(await rowsOf("sync_batch_guards", userId)).toEqual([]);
	});

	it("同一份備份附加兩次時第二次全部略過且不產生重複", async () => {
		const cookie = await seedAndSignIn("append-twice@example.com");
		const userId = await userIdOf("append-twice@example.com");
		await putPlayer(cookie, makePlayer("t-cloud", { name: "雲端甲" }));
		const body: AppendImportRequest = {
			players: [makePlayer("t-1", { name: "新乙" }), makePlayer("t-2", { name: "新丙" })],
			history: [historyAt("t-h1", T1), historyAt("t-h2", T2)],
		};

		const first = await appendOk(cookie, body);
		const second = await appendOk(cookie, body);

		expect(first.appended).toEqual({
			players: { added: 2, skipped: 0 },
			history: { added: 2, skipped: 0 },
		});
		expect(second.appended).toEqual({
			players: { added: 0, skipped: 2 },
			history: { added: 0, skipped: 2 },
		});
		expect(await rowsOf("matchmaker_players", userId)).toHaveLength(3);
		expect(await rowsOf("matchmaker_history", userId)).toHaveLength(2);
	});

	it("備份內同名的參賽者只新增第一位", async () => {
		const cookie = await seedAndSignIn("append-samename@example.com");
		await putPlayer(cookie, makePlayer("s-cloud", { name: "甲" }));

		const result = await appendOk(cookie, {
			players: [
				makePlayer("x1", { name: "戊" }),
				makePlayer("x2", { name: "戊" }),
				makePlayer("x3", { name: "己" }),
			],
			history: [],
		});

		expect(result.appended.players).toEqual({ added: 2, skipped: 1 });
		const ids = await listPlayerIds(cookie);
		expect(ids).toContain("x1");
		expect(ids).toContain("x3");
		expect(ids).not.toContain("x2");
	});

	it("附加的歷史中因同名而略過的參賽者 id 改寫為雲端同名者的 id，其餘欄位不變", async () => {
		const cookie = await seedAndSignIn("append-rewrite@example.com");
		await putPlayer(cookie, makePlayer("c1", { name: "甲" }));
		await putPlayer(cookie, makePlayer("c5", { name: "甲" }));
		const r1: MatchHistoryEntry = {
			...historyAt("r1", T1),
			format: "singles",
			teamA: team(["b1"]),
			teamB: team(["b2"]),
		};
		const r2: MatchHistoryEntry = {
			...historyAt("r2", T2),
			format: "doubles",
			doublesComposition: "general",
			teamA: team(["b1", "b9"]),
			teamB: team(["z1", "b2"]),
		};

		const result = await appendOk(cookie, {
			players: [
				makePlayer("b1", { name: "甲" }),
				makePlayer("b2", { name: "丙" }),
				makePlayer("b9", { name: "丙" }),
			],
			history: [r1, r2],
		});

		expect(result.appended.players).toEqual({ added: 1, skipped: 2 });
		const [readR1, readR2] = await listHistory(cookie);
		const idsOf = (entry: MatchHistoryEntry, side: "teamA" | "teamB") =>
			entry[side].players.map((player) => player.id);
		expect(idsOf(readR1, "teamA")).toEqual(["c1"]);
		expect(idsOf(readR1, "teamB")).toEqual(["b2"]);
		expect(idsOf(readR2, "teamA")).toEqual(["c1", "b2"]);
		expect(idsOf(readR2, "teamB")).toEqual(["z1", "b2"]);
		// 把球員 id 依位置換回請求值後，姓名、分數、陣列順序與 doublesComposition 都應與請求相同
		const restoreIds = (read: MatchHistoryEntry, original: MatchHistoryEntry): MatchHistoryEntry => {
			const restoreTeam = (side: "teamA" | "teamB") => ({
				...read[side],
				players: read[side].players.map((player, index) => ({
					...player,
					id: original[side].players[index].id,
				})),
			});
			return { ...read, teamA: restoreTeam("teamA"), teamB: restoreTeam("teamB") };
		};
		expect(restoreIds(readR1, r1)).toEqual(r1);
		expect(restoreIds(readR2, r2)).toEqual(r2);
		const serialized = JSON.stringify([readR1, readR2]);
		expect(serialized).not.toContain('"b1"');
		expect(serialized).not.toContain('"b9"');
	});

	it("附加的參賽者版本為版本下限加一，附加的歷史版本為 1", async () => {
		const cookie = await seedAndSignIn("append-version@example.com");
		const userId = await userIdOf("append-version@example.com");
		await putPlayer(cookie, makePlayer("p1", { name: "舊乙" }));
		for (const version of [1, 2]) {
			const updated = await request(cookie, "PUT", "/players/p1", {
				data: makePlayer("p1", { name: "舊乙", rating: 4 + version }),
				version,
			});
			expect(updated.status, `更新到 version ${version + 1}`).toBe(200);
		}
		expect((await request(cookie, "POST", "/reset")).status).toBe(204);
		const p2 = await request(cookie, "PUT", "/players/p2", { data: makePlayer("p2", { name: "甲" }), version: 0 });
		expect(p2.status).toBe(200);
		expect(((await p2.json()) as { version: number }).version).toBe(4);

		await appendOk(cookie, {
			players: [makePlayer("p1", { name: "乙" })],
			history: [historyAt("v-h1", T1)],
		});

		const players = await getJson<{ items: Array<Item<Player>> }>(cookie, "/players");
		const versions = new Map(players.items.map((item) => [item.data.id, item.version]));
		expect(versions.get("p1")).toBe(4);
		expect(versions.get("p2")).toBe(4);
		const historyRows = await rowsOf("matchmaker_history", userId);
		expect(historyRows).toHaveLength(1);
		expect(historyRows[0].version).toBe(1);
		const stale = await request(cookie, "PUT", "/players/p1", { data: makePlayer("p1", { name: "乙" }), version: 3 });
		expect(stale.status).toBe(409);
	});

	it("B 的附加不受 A 的資料影響且不改動 A", async () => {
		const cookieA = await seedAndSignIn("append-iso-a@example.com");
		const cookieB = await seedAndSignIn("append-iso-b@example.com");
		const idA = await userIdOf("append-iso-a@example.com");
		const idB = await userIdOf("append-iso-b@example.com");
		await putPlayer(cookieA, makePlayer("s1", { name: "甲" }));
		await seedHistory(idA, historyAt("h1", T1));
		await putPlayer(cookieB, makePlayer("b-own", { name: "乙" }));
		const aBefore = await snapshotOf([idA]);

		const result = await appendOk(cookieB, {
			players: [makePlayer("s1", { name: "甲" })],
			history: [historyAt("h1", T1)],
		});

		expect(result.appended).toEqual({
			players: { added: 1, skipped: 0 },
			history: { added: 1, skipped: 0 },
		});
		expect(await snapshotOf([idA])).toEqual(aBefore);
	});

	it("空字串或重複的參賽者 id、重複的歷史 matchId 或兩段皆空的附加請求回 400 且不寫入", async () => {
		const cookie = await seedAndSignIn("append-invalid@example.com");
		const userId = await userIdOf("append-invalid@example.com");
		await putPlayer(cookie, makePlayer("i-cloud", { name: "甲" }));
		const before = await snapshotOf([userId]);
		const bodies: Record<string, unknown> = {
			參賽者_id_為空字串: { players: [makePlayer("")], history: [] },
			參賽者_id_重複: { players: [makePlayer("d1", { name: "丙" }), makePlayer("d1", { name: "丁" })], history: [] },
			歷史_matchId_重複: { players: [], history: [historyAt("dup", T1), historyAt("dup", T2)] },
			兩段皆空: { players: [], history: [] },
			rating_為_99: { players: [makePlayer("r99", { rating: 99 })], history: [] },
		};

		for (const [name, body] of Object.entries(bodies)) {
			const res = await postAppend(cookie, body);

			expect(res.status, name).toBe(400);
			expect(await res.json(), name).toEqual({ error: API_ERROR_CODES.INVALID_BODY });
			expect(await snapshotOf([userId]), name).toEqual(before);
		}
	});

	it("附加的參賽者超過 500 位或單段參數超過上限時回 413 PAYLOAD_TOO_LARGE 且不呼叫 D1 batch", async () => {
		const cookie = await seedAndSignIn("append-limits@example.com");
		const userId = await userIdOf("append-limits@example.com");
		const { db, batchCalls } = batchCountingDb(new Error("D1 暫時不可用（測試替身）"));
		// 501 位且其中有同名：去重後少於 500 位，仍須依請求筆數拒絕
		const tooManyPlayers: AppendImportRequest = {
			players: Array.from({ length: MAX_PLAYERS_PER_IMPORT + 1 }, (_, index) =>
				makePlayer(`cap-${index}`, { name: index === 0 ? "同名" : `同名${index % 2 === 0 ? "" : index}` }),
			),
			history: [],
		};
		const overSegment = requestWithHistorySegmentBytes("seg-over", IMPORT_SEGMENT_LIMIT_BYTES + 1);
		expect(utf8ByteLength(serializeAppendSegments(overSegment).history)).toBe(IMPORT_SEGMENT_LIMIT_BYTES + 1);

		const playersRes = await postAppendWithDb(cookie, tooManyPlayers, db);
		const segmentRes = await postAppendWithDb(cookie, overSegment, db);

		expect(playersRes.status).toBe(413);
		expect(await playersRes.json()).toEqual({ error: API_ERROR_CODES.PAYLOAD_TOO_LARGE });
		expect(segmentRes.status).toBe(413);
		expect(await segmentRes.json()).toEqual({ error: API_ERROR_CODES.PAYLOAD_TOO_LARGE });
		expect(batchCalls.count).toBe(0);

		// 另一側：恰為上限時照常附加
		const exact = requestWithHistorySegmentBytes("seg-exact", IMPORT_SEGMENT_LIMIT_BYTES);
		expect(utf8ByteLength(serializeAppendSegments(exact).history)).toBe(IMPORT_SEGMENT_LIMIT_BYTES);
		const exactRes = await postAppend(cookie, exact);
		expect(exactRes.status).toBe(200);
		expect(await rowsOf("matchmaker_history", userId)).toHaveLength(1);
	});

	it("請求 body 超過附加上限時回 413 PAYLOAD_TOO_LARGE 且雲端不寫入", async () => {
		const cookie = await seedAndSignIn("append-body-over@example.com");
		const userId = await userIdOf("append-body-over@example.com");
		await putPlayer(cookie, makePlayer("bo-cloud", { name: "甲" }));
		const before = await snapshotOf([userId]);
		// 未知欄位會在 schema 驗證時被剝除，所以只有 validator 之前的 body 上限能擋下
		const valid: AppendImportRequest = { players: [makePlayer("bo-1", { name: "乙" })], history: [] };
		const build = (padding: number): string => JSON.stringify({ ...valid, padding: "x".repeat(padding) });
		const body = build(IMPORT_BODY_LIMIT_BYTES + 1 - utf8ByteLength(build(0)));
		expect(utf8ByteLength(body)).toBe(IMPORT_BODY_LIMIT_BYTES + 1);

		const res = await postAppend(cookie, JSON.parse(body));

		expect(res.status).toBe(413);
		expect(await res.json()).toEqual({ error: API_ERROR_CODES.PAYLOAD_TOO_LARGE });
		expect(await snapshotOf([userId])).toEqual(before);
	});

	// regression guard：requireExpectedUser 對未定義路由也會先執行
	it("預期帳號缺少或與 session 不符時附加回 401 ACCOUNT_MISMATCH 且雲端不寫入", async () => {
		const cookieB = await seedAndSignIn("append-mismatch-b@example.com");
		const cookieA = await seedAndSignIn("append-mismatch-a@example.com");
		const idA = await userIdOf("append-mismatch-a@example.com");
		const idB = await userIdOf("append-mismatch-b@example.com");
		await putPlayer(cookieB, makePlayer("mm-cloud", { name: "甲" }));
		await putPlayer(cookieA, makePlayer("mm-a", { name: "乙" }));
		const before = await snapshotOf([idA, idB]);
		const variants: Array<{ name: string; headers: Record<string, string> }> = [
			{ name: "他人的帳號", headers: { Cookie: cookieB, [EXPECTED_USER_ID_HEADER]: idA } },
			{ name: "缺少標頭", headers: { Cookie: cookieB } },
			{ name: "空字串標頭", headers: { Cookie: cookieB, [EXPECTED_USER_ID_HEADER]: "" } },
		];

		for (const { name, headers } of variants) {
			const res = await postAppendWithHeaders(headers, {
				players: [makePlayer("mm-new", { name: "丙" })],
				history: [historyAt("mm-h1", T1)],
			});

			expect(res.status, name).toBe(401);
			expect(await res.json(), name).toEqual({ error: API_ERROR_CODES.ACCOUNT_MISMATCH });
			expect(await snapshotOf([idA, idB]), name).toEqual(before);
		}
	});

	it("附加以單一 D1 batch 的固定兩條陳述式寫入 300 位參賽者與 2000 筆歷史", async () => {
		const cookie = await seedAndSignIn("append-bulk@example.com");
		const userId = await userIdOf("append-bulk@example.com");
		await putPlayer(cookie, makePlayer("bulk-cloud", { name: "雲端甲" }));
		const players = Array.from({ length: 300 }, (_, index) => makePlayer(`bulk-p-${index}`));
		const history = Array.from({ length: 2000 }, (_, index) => makeHistoryEntry(`bulk-h-${index}`));
		const batchCalls: number[] = [];
		// 記錄每次 batch 的陳述式數量，其餘行為委派給真實 D1
		const recordingDb = {
			prepare: (query: string) => env.DB?.prepare(query),
			batch: (statements: D1PreparedStatement[]) => {
				batchCalls.push(statements.length);
				return env.DB?.batch(statements);
			},
		} as unknown as D1Database;

		const res = await postAppendWithDb(cookie, { players, history }, recordingDb);

		expect(res.status).toBe(200);
		const result = (await res.json()) as AppendImportResponse;
		expect(result.appended).toEqual({
			players: { added: 300, skipped: 0 },
			history: { added: 2000, skipped: 0 },
		});
		expect(batchCalls).toEqual([2]);
		const playerRows = await rowsOf("matchmaker_players", userId);
		expect(playerRows.map((row) => row.id)).toEqual(["bulk-cloud", ...players.map((player) => player.id)]);
		const historyRows = await rowsOf("matchmaker_history", userId);
		// 2000 筆 playedAt 相同，rowid 順序即插入順序；bulk-h-10 的字串序在 bulk-h-2 之前，能分辨排序依據
		expect(historyRows.map((row) => row.match_id)).toEqual(history.map((entry) => entry.matchId));
	});

	it("batch 拋出錯誤時附加回 500", async () => {
		const cookie = await seedAndSignIn("append-batcherr@example.com");
		const { db, batchCalls } = batchCountingDb(new Error("D1 暫時不可用（測試替身）"));
		const spy = vi.spyOn(console, "error").mockImplementation(() => {});
		try {
			const res = await postAppendWithDb(
				cookie,
				{ players: [makePlayer("be-1", { name: "甲" })], history: [historyAt("be-h1", T1)] },
				db,
			);

			expect(res.status).toBe(500);
			expect(batchCalls.count).toBe(1);
		} finally {
			spy.mockRestore();
		}
	});
});
