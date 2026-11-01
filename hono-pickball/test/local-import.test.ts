import { env, exports } from "cloudflare:workers";
import { API_ERROR_CODES } from "@pickball/core/api/errors";
import { EXPECTED_USER_ID_HEADER } from "@pickball/core/api/headers";
import {
	IMPORT_BODY_LIMIT_BYTES,
	IMPORT_SEGMENT_LIMIT_BYTES,
	type LocalImportRequest,
	LocalImportRequestSchema,
	type LocalImportResponse,
	serializeImportSegments,
	utf8ByteLength,
} from "@pickball/core/api/import";
import { MAX_PLAYERS_PER_IMPORT } from "@pickball/core/api/players";
import { USER_DATA_TABLES } from "@pickball/core/api/user-data-tables";
import type { MatchHistoryEntry } from "@pickball/core/matchmaker/history";
import type { Player } from "@pickball/core/matchmaker/types";
import { createInitialState } from "@pickball/core/scoreboard/reducer";
import type { ScoreboardState } from "@pickball/core/scoreboard/types";
import { describe, expect, it, vi } from "vitest";
import { getDb } from "../src/db/client";
import { matchmakerPlayers, scoreboardCurrent } from "../src/db/schema";
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

const NOW = new Date(1_700_000_000_000);
const IMPORT_URL = `${origin}/api/import`;

// 兩個固定時間：T2 > T1，用來證明 played_at 是 playedAt 的毫秒值而不是插入時間
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

function standaloneScoreboard(us: number, them: number): ScoreboardState {
	return { ...createInitialState(), scores: { us, them } };
}

/**
 * 五段皆有資料的合法匯入：3 位參賽者（id 順序刻意不是字母序）、一個含 m1 的回合與 m1 的分槽、
 * h1／h2／h3 三筆歷史（h2、h3 同時間）與一場獨立計分板。
 */
function makePayload(overrides: Partial<LocalImportRequest> = {}): LocalImportRequest {
	return {
		version: 1,
		players: [
			makePlayer("p-c", { name: "丙", rating: 4.1 }),
			makePlayer("p-a", { name: "甲", rating: 3.33 }),
			makePlayer("p-b", { name: "乙", rating: 5 }),
		],
		currentRound: makeRound([makeMatch("m1")]),
		history: [historyAt("h1", T1), historyAt("h2", T2), historyAt("h3", T2)],
		scoreboard: { current: standaloneScoreboard(7, 3), matches: [makeSlot("m1", 5)] },
		...overrides,
	};
}

function postImport(cookie: string | undefined, body: unknown): Promise<Response> {
	return exports.default.fetch(new Request(IMPORT_URL, appRequestInit(cookie, { method: "POST", body })));
}

/** 不經 helper 補標頭：用來送出缺少、空白或他人帳號的 X-Expected-User-Id。 */
function postImportWithHeaders(headers: Record<string, string>, body: unknown): Promise<Response> {
	return exports.default.fetch(
		new Request(IMPORT_URL, {
			method: "POST",
			headers: { Origin: origin, "Content-Type": "application/json", ...headers },
			body: typeof body === "string" ? body : JSON.stringify(body),
		}),
	);
}

async function importOk(cookie: string, body: unknown): Promise<LocalImportResponse> {
	const res = await postImport(cookie, body);
	expect(res.status, "匯入應回 200").toBe(200);
	return (await res.json()) as LocalImportResponse;
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

async function expectNoRows(userIds: string[]): Promise<void> {
	for (const [key, rows] of Object.entries(await snapshotOf(userIds))) {
		expect(rows, key).toEqual([]);
	}
}

describe("POST /api/import 本機資料匯入", () => {
	it("auth 停用且無 DB binding 時匯入端點回 404", async () => {
		const disabledEnv = { ...env, ENVIRONMENT: undefined, DB: undefined };

		const res = await app.request(
			"/api/import",
			appRequestInit(undefined, { method: "POST", body: makePayload() }),
			disabledEnv,
		);

		expect(res.status).toBe(404);
	});

	it("未登入呼叫匯入端點回 401", async () => {
		const res = await postImport(undefined, makePayload());

		expect(res.status).toBe(401);
		expect(await res.json()).toEqual({ error: API_ERROR_CODES.UNAUTHORIZED });
	});

	it("B 的匯入不受 A 的資料影響且不改動 A", async () => {
		const cookieA = await seedAndSignIn("import-isolation-a@example.com");
		const cookieB = await seedAndSignIn("import-isolation-b@example.com");
		const idA = await userIdOf("import-isolation-a@example.com");
		const idB = await userIdOf("import-isolation-b@example.com");
		await importOk(
			cookieA,
			makePayload({
				players: [makePlayer("p-c", { name: "A 的丙" }), makePlayer("p-a", { name: "A 的甲" })],
			}),
		);
		const beforeA = await snapshotOf([idA]);

		// B 的資料含相同的參賽者 id 與相同的歷史 matchId
		const result = await importOk(cookieB, makePayload());

		expect(result.imported).toEqual({
			players: 3,
			round: true,
			slots: 1,
			history: 3,
			scoreboardCurrent: "imported",
		});
		expect(await snapshotOf([idA])).toEqual(beforeA);
		const playersForB = await getJson<{ items: Array<Item<Player>> }>(cookieB, "/players");
		expect(playersForB.items.map((item) => item.data.name)).toEqual(["丙", "甲", "乙"]);
		const playersForA = await getJson<{ items: Array<Item<Player>> }>(cookieA, "/players");
		expect(playersForA.items.map((item) => item.data.name)).toEqual(["A 的丙", "A 的甲"]);
		expect(await rowsOf("matchmaker_history", idB)).toHaveLength(3);
	});

	it("匯入五段資料後各自為 version 1 且保留原順序", async () => {
		const cookie = await seedAndSignIn("import-golden@example.com");
		const userId = await userIdOf("import-golden@example.com");
		const payload = makePayload();
		const startedAt = Date.now();

		const result = await importOk(cookie, payload);
		const finishedAt = Date.now();

		expect(result).toEqual({
			imported: { players: 3, round: true, slots: 1, history: 3, scoreboardCurrent: "imported" },
		});
		const players = await getJson<{ items: Array<Item<Player>> }>(cookie, "/players");
		expect(players.items).toEqual(payload.players.map((data) => ({ data, version: 1 })));
		expect(await getJson(cookie, "/round")).toEqual({ data: payload.currentRound, version: 1 });
		expect(await getJson(cookie, "/slots")).toEqual({
			items: [{ data: payload.scoreboard.matches[0], version: 1 }],
		});
		// 分槽的 match_id 欄位是主鍵的一部分，單筆讀取以它定位
		expect(await getJson(cookie, "/slots/m1")).toEqual({ data: payload.scoreboard.matches[0], version: 1 });
		expect((await rowsOf("matchmaker_match_slots", userId)).map((row) => row.match_id)).toEqual(["m1"]);
		const history = await getJson<{ items: Array<Item<MatchHistoryEntry>> }>(cookie, "/history?order=asc");
		expect(history.items.map((item) => item.data.matchId)).toEqual(["h1", "h2", "h3"]);
		expect(history.items.map((item) => item.version)).toEqual([1, 1, 1]);
		const scoreboardRes = await exports.default.fetch(
			new Request(`${origin}/api/scoreboard/current`, appRequestInit(cookie, { method: "GET" })),
		);
		expect(scoreboardRes.status).toBe(200);
		expect(await scoreboardRes.json()).toEqual({ data: payload.scoreboard.current, version: 1 });

		// 直接讀表：sort_order 是陣列索引，且所有列的 version 皆為 1
		const playerRows = await rowsOf("matchmaker_players", userId);
		expect(playerRows.map((row) => row.id)).toEqual(["p-c", "p-a", "p-b"]);
		expect(playerRows.map((row) => row.sort_order)).toEqual([0, 1, 2]);
		for (const table of [
			"matchmaker_players",
			"matchmaker_round",
			"matchmaker_match_slots",
			"matchmaker_history",
			"scoreboard_current",
		]) {
			const rows = await rowsOf(table, userId);
			expect(rows.length, table).toBeGreaterThan(0);
			for (const row of rows) {
				expect(row.version, table).toBe(1);
				// updated_at 取伺服器時間；寫成 0 或沿用資料內的時間都會讓雲端列的更新時間失真
				expect(row.updated_at as number, table).toBeGreaterThanOrEqual(startedAt);
				expect(row.updated_at as number, table).toBeLessThanOrEqual(finishedAt);
			}
		}
		expect(await rowsOf("sync_batch_guards", userId)).toEqual([]);
	});

	it("四張對戰分配機表任一有資料時回 409 且整份不寫入", async () => {
		const scenarios: Array<{
			name: string;
			table: string;
			seed: (userId: string) => Promise<void>;
		}> = [
			{
				name: "只有一位參賽者",
				table: "matchmaker_players",
				seed: async (userId) => {
					await getDb(env)
						.insert(matchmakerPlayers)
						.values({ userId, id: "cloud-p", data: makePlayer("cloud-p"), sortOrder: 0, version: 1, updatedAt: NOW });
				},
			},
			{
				name: "只有回合",
				table: "matchmaker_round",
				seed: (userId) => seedRound(userId, makeRound([makeMatch("cloud-m")])),
			},
			{
				name: "只有一個分槽",
				table: "matchmaker_match_slots",
				seed: (userId) => seedSlot(userId, makeSlot("cloud-m")),
			},
			{
				name: "只有一筆歷史",
				table: "matchmaker_history",
				seed: (userId) => seedHistory(userId, makeHistoryEntry("cloud-h")),
			},
		];

		for (const [index, scenario] of scenarios.entries()) {
			const email = `import-conflict-${index}@example.com`;
			const cookie = await seedAndSignIn(email);
			const userId = await userIdOf(email);
			await scenario.seed(userId);
			const before = await snapshotOf([userId]);

			const res = await postImport(cookie, makePayload());

			expect(res.status, scenario.name).toBe(409);
			expect(await res.json(), scenario.name).toEqual({ error: API_ERROR_CODES.VERSION_CONFLICT });
			// 整份不寫入：資料與請求前逐列相同，且含獨立計分板與殘留的守衛列都不存在
			expect(await snapshotOf([userId]), scenario.name).toEqual(before);
			expect(await rowsOf("scoreboard_current", userId), scenario.name).toEqual([]);
			expect(await rowsOf("sync_batch_guards", userId), scenario.name).toEqual([]);
			expect((await rowsOf(scenario.table, userId)).length, scenario.name).toBe(1);
		}
	});

	it("同一份資料重複匯入時第二次回 409 且歷史不重複", async () => {
		const cookie = await seedAndSignIn("import-twice@example.com");
		const userId = await userIdOf("import-twice@example.com");
		const payload = makePayload();

		const first = await postImport(cookie, payload);
		const second = await postImport(cookie, payload);

		expect(first.status).toBe(200);
		expect(second.status).toBe(409);
		expect(await second.json()).toEqual({ error: API_ERROR_CODES.VERSION_CONFLICT });
		expect(await rowsOf("matchmaker_history", userId)).toHaveLength(payload.history.length);
		expect(await rowsOf("matchmaker_players", userId)).toHaveLength(payload.players.length);
	});

	it("雲端已有獨立計分板時略過該段且不覆寫", async () => {
		const cookie = await seedAndSignIn("import-skipped@example.com");
		const userId = await userIdOf("import-skipped@example.com");
		const cloudBoard = standaloneScoreboard(2, 9);
		await getDb(env)
			.insert(scoreboardCurrent)
			.values({ userId, data: cloudBoard, version: 4, updatedAt: NOW });
		const payload = makePayload({
			players: [makePlayer("p-a"), makePlayer("p-b")],
			currentRound: null,
			history: [],
			scoreboard: { current: standaloneScoreboard(7, 3), matches: [] },
		});

		const result = await importOk(cookie, payload);

		expect(result.imported).toEqual({
			players: 2,
			round: false,
			slots: 0,
			history: 0,
			scoreboardCurrent: "skipped",
		});
		const stored = await getDb(env).query.scoreboardCurrent.findFirst({
			where: (table, { eq }) => eq(table.userId, userId),
		});
		expect(stored?.data).toEqual(cloudBoard);
		expect(stored?.version).toBe(4);
		expect(await rowsOf("matchmaker_players", userId)).toHaveLength(2);
		expect(await rowsOf("sync_batch_guards", userId)).toEqual([]);
	});

	it("重複 id、孤兒分槽、空匯入或版本不符的請求回 400 且不寫入", async () => {
		const completedRound = makeRound([makeMatch("m1"), makeMatch("m2", "completed")]);
		const invalidBodies: Array<{ name: string; body: unknown }> = [
			{ name: "參賽者 id 重複", body: makePayload({ players: [makePlayer("dup"), makePlayer("dup")] }) },
			{ name: "歷史 matchId 重複", body: makePayload({ history: [historyAt("dup", T1), historyAt("dup", T2)] }) },
			{
				name: "分槽不屬於回合",
				body: makePayload({ scoreboard: { current: null, matches: [makeSlot("m9")] } }),
			},
			{
				name: "分槽屬於已完成場次",
				body: makePayload({
					currentRound: completedRound,
					scoreboard: { current: null, matches: [makeSlot("m2")] },
				}),
			},
			{
				name: "currentRound 為 null 卻有分槽",
				body: makePayload({ currentRound: null, scoreboard: { current: null, matches: [makeSlot("m1")] } }),
			},
			{
				name: "五段皆空",
				body: makePayload({
					players: [],
					currentRound: null,
					history: [],
					scoreboard: { current: null, matches: [] },
				}),
			},
			{ name: "version 不是 1", body: { ...makePayload(), version: 2 } },
		];
		const cookie = await seedAndSignIn("import-invalid@example.com");
		const userId = await userIdOf("import-invalid@example.com");

		for (const { name, body } of invalidBodies) {
			const res = await postImport(cookie, body);

			expect(res.status, name).toBe(400);
			expect(await res.json(), name).toEqual({ error: API_ERROR_CODES.INVALID_BODY });
			await expectNoRows([userId]);
		}

		// JSON 語法錯誤由 Hono 拋 HTTPException(400)，須經 sub-app 的 onError 轉成 INVALID_BODY
		const malformed = await postImportWithHeaders(
			{ Cookie: cookie, [EXPECTED_USER_ID_HEADER]: userId },
			"{not json",
		);
		expect(malformed.status, "JSON 語法錯誤").toBe(400);
		expect(await malformed.json(), "JSON 語法錯誤").toEqual({ error: API_ERROR_CODES.INVALID_BODY });
		await expectNoRows([userId]);
	});

	it("300 位參賽者與 2000 筆歷史可一次匯入", async () => {
		const cookie = await seedAndSignIn("import-bulk@example.com");
		const userId = await userIdOf("import-bulk@example.com");
		const players = Array.from({ length: 300 }, (_, index) => makePlayer(`bulk-p-${index}`));
		const history = Array.from({ length: 2000 }, (_, index) => makeHistoryEntry(`bulk-h-${index}`));
		// 30 個分槽：單一陳述式的參數上限是 100，逐筆展開的分槽寫入在這個量級就會失敗
		const matchIds = Array.from({ length: 30 }, (_, index) => `bulk-m-${index}`);
		const currentRound = makeRound(matchIds.map((id) => makeMatch(id)));
		const slots = matchIds.map((id) => makeSlot(id));

		const result = await importOk(
			cookie,
			makePayload({ players, history, currentRound, scoreboard: { current: null, matches: slots } }),
		);

		expect(result.imported).toEqual({
			players: 300,
			round: true,
			slots: 30,
			history: 2000,
			scoreboardCurrent: "none",
		});
		expect(await rowsOf("matchmaker_match_slots", userId)).toHaveLength(30);
		const playerRows = await rowsOf("matchmaker_players", userId);
		expect(playerRows).toHaveLength(300);
		expect(playerRows.map((row) => row.sort_order)).toEqual(players.map((_, index) => index));
		const historyRows = await rowsOf("matchmaker_history", userId);
		expect(historyRows).toHaveLength(2000);
		// 2000 筆 playedAt 相同，rowid 順序即插入順序；bulk-h-10 的字串序在 bulk-h-2 之前，能分辨排序依據
		expect(historyRows.map((row) => row.match_id)).toEqual(history.map((entry) => entry.matchId));

		// 單一段落的 JSON 參數超過 D1 的 2MB 上限時，在送出 batch 之前就回 413，且不留下任何寫入
		const oversizedCookie = await seedAndSignIn("import-oversize@example.com");
		const oversizedId = await userIdOf("import-oversize@example.com");
		const oversizedHistory = ["a", "b", "c"].map((suffix) => {
			const entry = makeHistoryEntry(`oversize-${suffix}`);
			entry.teamA.players[0].name = "x".repeat(800_000);
			return entry;
		});
		const oversized = await postImport(
			oversizedCookie,
			makePayload({
				players: [makePlayer("oversize-p")],
				currentRound: null,
				history: oversizedHistory,
				scoreboard: { current: null, matches: [] },
			}),
		);
		expect(oversized.status).toBe(413);
		expect(await oversized.json()).toEqual({ error: "PAYLOAD_TOO_LARGE" });
		await expectNoRows([oversizedId]);
	});

	/** 歷史段（單筆歷史）經 serializeImportSegments 後恰為 targetBytes 位元組的合法請求。 */
	function payloadWithHistorySegmentBytes(matchId: string, targetBytes: number): LocalImportRequest {
		const entry = makeHistoryEntry(matchId);
		const build = (padding: number): LocalImportRequest => {
			const copy = structuredClone(entry);
			copy.teamA.players[0].name = "x".repeat(padding);
			return makePayload({
				players: [],
				currentRound: null,
				history: [copy],
				scoreboard: { current: null, matches: [] },
			});
		};
		const baseBytes = utf8ByteLength(serializeImportSegments(build(0)).history);
		return build(targetBytes - baseBytes);
	}

	/** 參賽者段（單一位參賽者）經 serializeImportSegments 後恰為 targetBytes 位元組的合法請求。 */
	function payloadWithPlayersSegmentBytes(playerId: string, targetBytes: number): LocalImportRequest {
		const build = (padding: number): LocalImportRequest =>
			makePayload({
				players: [makePlayer(playerId, { name: "x".repeat(padding) })],
				currentRound: null,
				history: [],
				scoreboard: { current: null, matches: [] },
			});
		const baseBytes = utf8ByteLength(serializeImportSegments(build(0)).players);
		return build(targetBytes - baseBytes);
	}

	it("單段 JSON 參數恰為上限時匯入成功，超過一位元組時回 413 PAYLOAD_TOO_LARGE 且雲端不寫入", async () => {
		const okCookie = await seedAndSignIn("import-seg-ok@example.com");
		const okId = await userIdOf("import-seg-ok@example.com");
		const okPayload = payloadWithHistorySegmentBytes("seg-ok", IMPORT_SEGMENT_LIMIT_BYTES);
		expect(utf8ByteLength(serializeImportSegments(okPayload).history)).toBe(IMPORT_SEGMENT_LIMIT_BYTES);
		const ok = await importOk(okCookie, okPayload);
		expect(ok.imported.history).toBe(1);
		expect(await rowsOf("matchmaker_history", okId)).toHaveLength(1);

		const historyCookie = await seedAndSignIn("import-seg-history@example.com");
		const historyId = await userIdOf("import-seg-history@example.com");
		const historyOver = payloadWithHistorySegmentBytes("seg-over", IMPORT_SEGMENT_LIMIT_BYTES + 1);
		expect(utf8ByteLength(serializeImportSegments(historyOver).history)).toBe(IMPORT_SEGMENT_LIMIT_BYTES + 1);
		const historyRes = await postImport(historyCookie, historyOver);
		expect(historyRes.status).toBe(413);
		expect(await historyRes.json()).toEqual({ error: "PAYLOAD_TOO_LARGE" });
		await expectNoRows([historyId]);

		const playersCookie = await seedAndSignIn("import-seg-players@example.com");
		const playersId = await userIdOf("import-seg-players@example.com");
		const playersOver = payloadWithPlayersSegmentBytes("seg-p", IMPORT_SEGMENT_LIMIT_BYTES + 1);
		expect(utf8ByteLength(serializeImportSegments(playersOver).players)).toBe(IMPORT_SEGMENT_LIMIT_BYTES + 1);
		const playersRes = await postImport(playersCookie, playersOver);
		expect(playersRes.status).toBe(413);
		expect(await playersRes.json()).toEqual({ error: "PAYLOAD_TOO_LARGE" });
		await expectNoRows([playersId]);
	});

	function playersOnlyPayload(count: number): LocalImportRequest {
		return makePayload({
			players: Array.from({ length: count }, (_, index) => makePlayer(`cap-p-${index}`)),
			currentRound: null,
			history: [],
			scoreboard: { current: null, matches: [] },
		});
	}

	it("參賽者恰為 500 位時匯入成功，501 位時回 413 PAYLOAD_TOO_LARGE 且雲端不寫入", async () => {
		const okCookie = await seedAndSignIn("import-cap-ok@example.com");
		const okId = await userIdOf("import-cap-ok@example.com");
		const ok = await importOk(okCookie, playersOnlyPayload(MAX_PLAYERS_PER_IMPORT));
		expect(ok.imported.players).toBe(MAX_PLAYERS_PER_IMPORT);
		expect(await rowsOf("matchmaker_players", okId)).toHaveLength(MAX_PLAYERS_PER_IMPORT);

		const overCookie = await seedAndSignIn("import-cap-over@example.com");
		const overId = await userIdOf("import-cap-over@example.com");
		const over = await postImport(overCookie, playersOnlyPayload(MAX_PLAYERS_PER_IMPORT + 1));
		expect(over.status).toBe(413);
		expect(await over.json()).toEqual({ error: "PAYLOAD_TOO_LARGE" });
		await expectNoRows([overId]);
	});

	it("請求 body 超過匯入上限時回 413 PAYLOAD_TOO_LARGE 且雲端不寫入", async () => {
		const cookie = await seedAndSignIn("import-body-over@example.com");
		const userId = await userIdOf("import-body-over@example.com");
		// 未知欄位會在 schema 驗證時被剝除，所以只有 validator 之前的 body 上限能擋下
		const build = (padding: number): string => JSON.stringify({ ...makePayload(), padding: "x".repeat(padding) });
		// 只多一位元組：上限的另一側由「恰為匯入上限時照常處理」固定
		const body = build(IMPORT_BODY_LIMIT_BYTES + 1 - utf8ByteLength(build(0)));
		expect(utf8ByteLength(body)).toBe(IMPORT_BODY_LIMIT_BYTES + 1);

		const res = await postImport(cookie, JSON.parse(body));

		expect(res.status).toBe(413);
		expect(await res.json()).toEqual({ error: "PAYLOAD_TOO_LARGE" });
		await expectNoRows([userId]);
	});

	// regression guard：恰等於 body 上限時照常處理（邊界的另一側）
	it("請求 body 恰為匯入上限時照常處理", async () => {
		const cookie = await seedAndSignIn("import-body-exact@example.com");
		const build = (padding: number): string => JSON.stringify({ ...makePayload(), padding: "x".repeat(padding) });
		const baseBytes = utf8ByteLength(build(0));
		const body = build(IMPORT_BODY_LIMIT_BYTES - baseBytes);
		// 先確認組出的 body 恰為上限，再送出；避免測試本身算錯而失去邊界意義
		expect(utf8ByteLength(body)).toBe(IMPORT_BODY_LIMIT_BYTES);

		const res = await postImport(cookie, JSON.parse(body));

		expect(res.status).toBe(200);
	});

	// regression guard：body 上限掛在 validator 之前，schema 不合法但 body 過大時回 413 而非 400
	it("匯入的 body 超過上限且內容不合 schema 時回 413 而非 400", async () => {
		const cookie = await seedAndSignIn("import-body-order-validator@example.com");
		const userId = await userIdOf("import-body-order-validator@example.com");

		const res = await postImport(cookie, { padding: "x".repeat(IMPORT_BODY_LIMIT_BYTES) });

		expect(res.status).toBe(413);
		expect(await res.json()).toEqual({ error: "PAYLOAD_TOO_LARGE" });
		await expectNoRows([userId]);
	});

	// regression guard：body 上限掛在 sub-app 守衛之後，未登入與帳號不符的回應仍優先於 413
	it("匯入的 body 超過上限時，未登入仍回 401、帳號不符仍回 401 ACCOUNT_MISMATCH", async () => {
		const cookie = await seedAndSignIn("import-body-order@example.com");
		const oversized = JSON.stringify({ ...makePayload(), padding: "x".repeat(IMPORT_BODY_LIMIT_BYTES) });

		const anonymous = await postImportWithHeaders({}, oversized);
		const mismatch = await postImportWithHeaders({ Cookie: cookie, [EXPECTED_USER_ID_HEADER]: "someone-else" }, oversized);

		expect(anonymous.status).toBe(401);
		expect(await anonymous.json()).toEqual({ error: API_ERROR_CODES.UNAUTHORIZED });
		expect(mismatch.status).toBe(401);
		expect(await mismatch.json()).toEqual({ error: API_ERROR_CODES.ACCOUNT_MISMATCH });
	});

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

	async function postImportWithDb(cookie: string, body: unknown, db: D1Database): Promise<Response> {
		return app.request(
			"/api/import",
			{
				method: "POST",
				headers: { Cookie: cookie, Origin: origin, "Content-Type": "application/json", ...expectedUserHeader(cookie) },
				body: JSON.stringify(body),
			},
			{ ...env, DB: db },
		);
	}

	// regression guard：前端與後端必須量測並送出同一份形狀，repository 不得自行另組 JSON
	it("送進 json_each 的五個參數就是 serializeImportSegments 的輸出", async () => {
		const cookie = await seedAndSignIn("import-segments@example.com");
		const payload = makePayload();
		const boundStrings: string[] = [];
		// 記錄每條陳述式 bind 的字串參數，其餘行為委派給真實 D1
		const recordingDb = {
			prepare: (query: string) => {
				const statement = env.DB?.prepare(query);
				if (!statement) {
					throw new Error("缺少 DB binding");
				}
				return new Proxy(statement, {
					get(target, property) {
						if (property === "bind") {
							return (...args: unknown[]) => {
								for (const arg of args) {
									if (typeof arg === "string") {
										boundStrings.push(arg);
									}
								}
								return target.bind(...args);
							};
						}
						const value = Reflect.get(target, property, target);
						return typeof value === "function" ? value.bind(target) : value;
					},
				});
			},
			batch: (statements: D1PreparedStatement[]) => env.DB?.batch(statements),
		} as unknown as D1Database;

		const res = await postImportWithDb(cookie, payload, recordingDb);

		expect(res.status).toBe(200);
		// 後端序列化的是 schema 解析後的物件（key 順序以 schema 為準），所以以同一份解析結果計算期望值
		const segments = serializeImportSegments(LocalImportRequestSchema.parse(payload));
		for (const segment of [segments.players, segments.round, segments.slots, segments.history, segments.current]) {
			expect(boundStrings).toContain(segment);
		}
	});

	it("超過上限的匯入不呼叫 D1 batch", async () => {
		const cookie = await seedAndSignIn("import-nobatch@example.com");
		const { db, batchCalls } = batchCountingDb(new Error("D1 暫時不可用（測試替身）"));

		const res = await postImportWithDb(cookie, playersOnlyPayload(MAX_PLAYERS_PER_IMPORT + 1), db);

		expect(res.status).toBe(413);
		expect(await res.json()).toEqual({ error: "PAYLOAD_TOO_LARGE" });
		expect(batchCalls.count).toBe(0);
	});

	// regression guard：現行 catch 已照常拋出非守衛錯誤
	it("batch 拋出非守衛錯誤時匯入回 500 而非 409", async () => {
		const cookie = await seedAndSignIn("import-batcherr@example.com");
		const { db, batchCalls } = batchCountingDb(new Error("D1 暫時不可用（測試替身）"));
		const spy = vi.spyOn(console, "error").mockImplementation(() => {});
		try {
			const res = await postImportWithDb(cookie, makePayload(), db);

			expect(res.status).toBe(500);
			expect(batchCalls.count).toBe(1);
		} finally {
			spy.mockRestore();
		}
	});

	// regression guard：核心 schema 已收緊 id，寫入時預期先綠
	it("參賽者 id 為空字串的匯入請求回 400 且不寫入", async () => {
		const cookie = await seedAndSignIn("import-emptyid@example.com");
		const userId = await userIdOf("import-emptyid@example.com");

		const res = await postImport(cookie, makePayload({ players: [makePlayer("p-ok"), makePlayer("")] }));

		expect(res.status).toBe(400);
		expect(await res.json()).toEqual({ error: API_ERROR_CODES.INVALID_BODY });
		await expectNoRows([userId]);
	});

	it("預期帳號缺少或與 session 不符時匯入回 401 ACCOUNT_MISMATCH 且雲端不寫入", async () => {
		const cookieB = await seedAndSignIn("import-mismatch-b@example.com");
		await seedAndSignIn("import-mismatch-a@example.com");
		const idA = await userIdOf("import-mismatch-a@example.com");
		const idB = await userIdOf("import-mismatch-b@example.com");
		const variants: Array<{ name: string; headers: Record<string, string> }> = [
			{ name: "他人的帳號", headers: { Cookie: cookieB, [EXPECTED_USER_ID_HEADER]: idA } },
			{ name: "缺少標頭", headers: { Cookie: cookieB } },
			{ name: "空字串標頭", headers: { Cookie: cookieB, [EXPECTED_USER_ID_HEADER]: "" } },
		];

		for (const { name, headers } of variants) {
			const res = await postImportWithHeaders(headers, makePayload());

			expect(res.status, name).toBe(401);
			expect(await res.json(), name).toEqual({ error: API_ERROR_CODES.ACCOUNT_MISMATCH });
			await expectNoRows([idA, idB]);
		}
	});

	it("匯入的歷史可被歷史端點依區間與兩種排序讀回", async () => {
		const cookie = await seedAndSignIn("import-history-read@example.com");
		const userId = await userIdOf("import-history-read@example.com");
		// 特殊字元的姓名：JSON 經參數綁定與 json_extract 往返後必須逐字相同
		const h1 = historyAt("h1", T1);
		h1.teamA.players[0].name = 'Q"uote\\back\nline\ttab 😀 中文';
		const payload = makePayload({
			players: [],
			currentRound: null,
			scoreboard: { current: null, matches: [] },
			history: [h1, historyAt("h2", T2), historyAt("h3", T2)],
		});
		await importOk(cookie, payload);
		const t2 = Date.parse(T2);

		const byDefault = await getJson<{ items: Array<Item<MatchHistoryEntry>> }>(cookie, "/history");
		const asc = await getJson<{ items: Array<Item<MatchHistoryEntry>> }>(cookie, "/history?order=asc");
		const fromT2 = await getJson<{ items: Array<Item<MatchHistoryEntry>> }>(cookie, `/history?from=${t2}`);
		const toT2 = await getJson<{ items: Array<Item<MatchHistoryEntry>> }>(cookie, `/history?to=${t2}`);

		const idsOf = (body: { items: Array<Item<MatchHistoryEntry>> }) => body.items.map((item) => item.data.matchId);
		expect(idsOf(byDefault)).toEqual(["h2", "h3", "h1"]);
		expect(idsOf(asc)).toEqual(["h1", "h2", "h3"]);
		expect(idsOf(fromT2)).toEqual(["h2", "h3"]);
		expect(idsOf(toT2)).toEqual(["h1"]);
		expect(asc.items.map((item) => item.data)).toEqual(payload.history);
		// 直接讀表：played_at 必須精確等於 Date.parse(playedAt)，差 1 毫秒會讓 from／to 的邊界判斷偏移
		const rows = await rowsOf("matchmaker_history", userId);
		expect(rows.map((row) => row.match_id)).toEqual(["h1", "h2", "h3"]);
		expect(rows.map((row) => row.played_at)).toEqual([Date.parse(T1), Date.parse(T2), Date.parse(T2)]);
		expect(asc.items.map((item) => item.version)).toEqual([1, 1, 1]);
	});
});
