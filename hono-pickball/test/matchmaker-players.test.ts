import { env, exports } from "cloudflare:workers";
import type { Player } from "@pickball/core/matchmaker/types";
import { describe, expect, it, vi } from "vitest";
import app from "../src/index";
import {
	makeHistoryEntry,
	makeMatch,
	makeRound,
	makeSlot,
	rowsOf,
	seedHistory,
	seedRound,
	seedSlot,
} from "./helpers/matchmaker-fixtures";
import { seedUser, signIn, userIdOf } from "./helpers/session";

// storage 以測試檔隔離，同檔 it 共用 D1，所以各 it 使用自己的 email。
const origin = "http://localhost:3005";
const base = `${origin}/api/matchmaker`;

function makePlayer(id: string, name = `球友 ${id}`, overrides: Partial<Player> = {}): Player {
	return {
		id,
		name,
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

async function seedAndSignIn(email: string): Promise<string> {
	await seedUser(email);
	return signIn(email);
}

function request(
	cookie: string | undefined,
	method: string,
	path: string,
	body?: unknown,
	contentType = "application/json",
): Promise<Response> {
	const headers: Record<string, string> = { Origin: origin };
	if (cookie) {
		headers.Cookie = cookie;
	}
	const init: RequestInit = { method, headers };
	if (body !== undefined) {
		headers["Content-Type"] = contentType;
		init.body = typeof body === "string" ? body : JSON.stringify(body);
	}
	return exports.default.fetch(new Request(`${base}${path}`, init));
}

function putPlayer(cookie: string, player: Player, version: number): Promise<Response> {
	return request(cookie, "PUT", `/players/${player.id}`, { data: player, version });
}

function importPlayers(cookie: string, players: Player[]): Promise<Response> {
	return request(cookie, "POST", "/players/import", { players });
}

interface ListItem {
	data: Player;
	version: number;
}

async function listItems(cookie: string): Promise<ListItem[]> {
	const res = await request(cookie, "GET", "/players");
	expect(res.status).toBe(200);
	return ((await res.json()) as { items: ListItem[] }).items;
}

/** 直接讀 DB 的 sort_order，確認排序依據是欄位而非碰巧的 rowid／主鍵順序。 */
async function sortOrders(userId: string): Promise<Array<[string, number]>> {
	if (!env.DB) {
		throw new Error("D1 binding DB 不存在");
	}
	const { results } = await env.DB.prepare(
		"SELECT id, sort_order FROM matchmaker_players WHERE user_id = ? ORDER BY sort_order, rowid",
	)
		.bind(userId)
		.all<{ id: string; sort_order: number }>();
	return results.map((row) => [row.id, row.sort_order]);
}

// 五個端點的合法請求；迴圈測試對每個端點各自收集結果。
const endpoints: Array<{ label: string; method: string; path: string; body?: unknown }> = [
	{ label: "GET /players", method: "GET", path: "/players" },
	{ label: "PUT /players/:id", method: "PUT", path: "/players/p1", body: { data: makePlayer("p1"), version: 0 } },
	{ label: "DELETE /players/:id", method: "DELETE", path: "/players/p1" },
	{ label: "POST /players/import", method: "POST", path: "/players/import", body: { players: [makePlayer("p1")] } },
	{ label: "POST /reset", method: "POST", path: "/reset" },
];

function appRequestInit(cookie: string | undefined, endpoint: (typeof endpoints)[number]): RequestInit {
	const headers: Record<string, string> = { Origin: origin };
	if (cookie) {
		headers.Cookie = cookie;
	}
	const init: RequestInit = { method: endpoint.method, headers };
	if (endpoint.body !== undefined) {
		headers["Content-Type"] = "application/json";
		init.body = JSON.stringify(endpoint.body);
	}
	return init;
}

/** 任何查詢都拋錯的 D1 替身。 */
const throwingDb = {
	prepare() {
		throw new Error("D1 查詢失敗（測試替身）");
	},
	batch() {
		throw new Error("D1 查詢失敗（測試替身）");
	},
	exec() {
		throw new Error("D1 查詢失敗（測試替身）");
	},
} as unknown as D1Database;

describe("/api/matchmaker 授權與停用閘門", () => {
	it("auth 停用且無 DB binding 時所有 /api/matchmaker 端點皆回 404", async () => {
		const disabledEnv = { ...env, ENVIRONMENT: undefined, DB: undefined };

		const statuses: number[] = [];
		for (const endpoint of endpoints) {
			const res = await app.request(`/api/matchmaker${endpoint.path}`, appRequestInit(undefined, endpoint), disabledEnv);
			statuses.push(res.status);
		}

		expect(statuses).toEqual([404, 404, 404, 404, 404]);
	});

	it("未登入呼叫所有 /api/matchmaker 端點皆回 401", async () => {
		const statuses: number[] = [];
		const bodies: unknown[] = [];
		for (const endpoint of endpoints) {
			const res = await request(undefined, endpoint.method, endpoint.path, endpoint.body);
			statuses.push(res.status);
			bodies.push(await res.json());
		}

		expect(statuses).toEqual([401, 401, 401, 401, 401]);
		expect(bodies).toEqual(Array(5).fill({ error: "UNAUTHORIZED" }));
	});

	it("B 看不到 A 的參賽者，且以相同 id 的 PUT 與 DELETE 不影響 A", async () => {
		const cookieA = await seedAndSignIn("mp-iso-a@example.com");
		const cookieB = await seedAndSignIn("mp-iso-b@example.com");
		expect((await putPlayer(cookieA, makePlayer("p1", "A 的球友"), 0)).status).toBe(200);

		const bItems = await listItems(cookieB);
		const bPut = await putPlayer(cookieB, makePlayer("p1", "B 想改的"), 1);
		const bDelete = await request(cookieB, "DELETE", "/players/p1");

		expect(bItems.map((item) => item.data.id)).not.toContain("p1");
		expect(bPut.status).toBe(409);
		expect(bDelete.status).toBe(204);
		const aItems = await listItems(cookieA);
		expect(aItems).toHaveLength(1);
		expect(aItems[0].data.id).toBe("p1");
		expect(aItems[0].data.name).toBe("A 的球友");
		expect(aItems[0].version).toBe(1);
	});

	it("B 的匯入與重置不影響 A 的名單", async () => {
		const cookieA = await seedAndSignIn("mp-imp-a@example.com");
		const cookieB = await seedAndSignIn("mp-imp-b@example.com");
		expect((await importPlayers(cookieA, [makePlayer("p1", "A1"), makePlayer("p2", "A2")])).status).toBe(200);

		const bImport = await importPlayers(cookieB, [makePlayer("p1", "B1"), makePlayer("p2", "B2")]);
		expect(bImport.status).toBe(200);
		// B 的 sort_order 從 0 起算，不受 A 既有列影響
		expect(await sortOrders(await userIdOf("mp-imp-b@example.com"))).toEqual([
			["p1", 0],
			["p2", 1],
		]);
		const bReset = await request(cookieB, "POST", "/reset");

		expect(bReset.status).toBe(204);
		expect(await listItems(cookieB)).toEqual([]);
		const aItems = await listItems(cookieA);
		expect(aItems.map((item) => item.data.name)).toEqual(["A1", "A2"]);
	});

	it("不從 query 或 body 接受 userId", async () => {
		const cookieA = await seedAndSignIn("mp-uid-a@example.com");
		const cookieB = await seedAndSignIn("mp-uid-b@example.com");
		const idA = await userIdOf("mp-uid-a@example.com");
		expect((await putPlayer(cookieA, makePlayer("a1", "A 的球友"), 0)).status).toBe(200);

		// B 帶著 A 的 userId 嘗試讀、寫、匯入、重置
		const bGet = await request(cookieB, "GET", `/players?userId=${idA}`);
		const bPut = await request(cookieB, "PUT", `/players/b1?userId=${idA}`, {
			data: makePlayer("b1", "B 的球友"),
			version: 0,
			userId: idA,
		});
		const bImport = await request(cookieB, "POST", `/players/import?userId=${idA}`, {
			players: [makePlayer("b2", "B 的第二位")],
			userId: idA,
		});
		// A 已有一列，B 的 sort_order 仍須從 0 起算（建立與匯入的 max 都只看本人的列）
		expect(await sortOrders(await userIdOf("mp-uid-b@example.com"))).toEqual([
			["b1", 0],
			["b2", 1],
		]);
		const bDelete = await request(cookieB, "DELETE", `/players/a1?userId=${idA}`);
		const bReset = await request(cookieB, "POST", `/reset?userId=${idA}`, { userId: idA });

		expect(((await bGet.json()) as { items: unknown[] }).items).toEqual([]);
		expect(bPut.status).toBe(200);
		expect(bImport.status).toBe(200);
		expect(bDelete.status).toBe(204);
		expect(bReset.status).toBe(204);
		// A 的資料沒被動到，B 的寫入也沒落到 A 名下
		const aItems = await listItems(cookieA);
		expect(aItems.map((item) => item.data.id)).toEqual(["a1"]);
		expect(await listItems(cookieB)).toEqual([]);
	});

	it("getSession 拋出例外時回 500", async () => {
		// 用真實登入取得簽章正確的 cookie，確保 better-auth 一定會走到 DB 查詢
		const cookie = await seedAndSignIn("mp-session-down@example.com");
		const brokenEnv = { ...env, DB: throwingDb };
		const spy = vi.spyOn(console, "error").mockImplementation(() => {});
		try {
			const statuses: number[] = [];
			for (const endpoint of endpoints) {
				const res = await app.request(`/api/matchmaker${endpoint.path}`, appRequestInit(cookie, endpoint), brokenEnv);
				statuses.push(res.status);
			}

			expect(statuses).toEqual([500, 500, 500, 500, 500]);
		} finally {
			spy.mockRestore();
		}
	});
});

describe("/api/matchmaker 名單端點", () => {
	it("尚無參賽者時 GET 回空的 items", async () => {
		const cookie = await seedAndSignIn("mp-empty@example.com");

		const res = await request(cookie, "GET", "/players");

		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ items: [] });
	});

	it("以 version 0 建立參賽者並依建立順序列出", async () => {
		const cookie = await seedAndSignIn("mp-create@example.com");

		const res2 = await putPlayer(cookie, makePlayer("p2", "第二"), 0);
		const res1 = await putPlayer(cookie, makePlayer("p1", "第一"), 0);

		expect(res2.status).toBe(200);
		expect(res1.status).toBe(200);
		expect(((await res2.json()) as ListItem).version).toBe(1);
		expect(((await res1.json()) as ListItem).version).toBe(1);
		// id 字母序是 p1、p2；回傳 p2、p1 才證明依 sort_order 而非主鍵順序
		const items = await listItems(cookie);
		expect(items.map((item) => item.data.id)).toEqual(["p2", "p1"]);
		expect(await sortOrders(await userIdOf("mp-create@example.com"))).toEqual([
			["p2", 0],
			["p1", 1],
		]);
	});

	it("以目前 version 更新參賽者並遞增 version", async () => {
		const cookie = await seedAndSignIn("mp-update@example.com");
		await putPlayer(cookie, makePlayer("p1", "舊名字"), 0);
		await putPlayer(cookie, makePlayer("p2", "旁人"), 0);

		const res = await putPlayer(cookie, makePlayer("p1", "新名字"), 1);

		expect(res.status).toBe(200);
		const body = (await res.json()) as ListItem;
		expect(body.version).toBe(2);
		expect(body.data.name).toBe("新名字");
		const items = await listItems(cookie);
		expect(items.map((item) => [item.data.id, item.data.name, item.version])).toEqual([
			["p1", "新名字", 2],
			["p2", "旁人", 1],
		]);
	});

	it("參賽者 version 不符時回 409 且資料不變", async () => {
		const cookie = await seedAndSignIn("mp-conflict@example.com");
		await putPlayer(cookie, makePlayer("p1", "v1"), 0);
		await putPlayer(cookie, makePlayer("p1", "v2"), 1);

		const tooLow = await putPlayer(cookie, makePlayer("p1", "不該寫入"), 1);
		const tooHigh = await putPlayer(cookie, makePlayer("p1", "不該寫入"), 3);
		const missing = await putPlayer(cookie, makePlayer("p9", "不存在"), 1);

		for (const res of [tooLow, tooHigh, missing]) {
			expect(res.status).toBe(409);
			expect(await res.json()).toEqual({ error: "VERSION_CONFLICT" });
		}
		const items = await listItems(cookie);
		expect(items.map((item) => [item.data.id, item.data.name, item.version])).toEqual([["p1", "v2", 2]]);
	});

	it("參賽者已存在時以 version 0 寫入回 409", async () => {
		const cookie = await seedAndSignIn("mp-exists@example.com");
		await putPlayer(cookie, makePlayer("p1", "原本"), 0);

		const res = await putPlayer(cookie, makePlayer("p1", "覆蓋"), 0);

		expect(res.status).toBe(409);
		expect(await res.json()).toEqual({ error: "VERSION_CONFLICT" });
		const items = await listItems(cookie);
		expect(items.map((item) => [item.data.name, item.version])).toEqual([["原本", 1]]);
	});

	it("path id 與 data.id 不一致或資料不合 PlayerSchema 時回 400", async () => {
		const cookie = await seedAndSignIn("mp-invalid@example.com");

		const idMismatch = await request(cookie, "PUT", "/players/p1", { data: makePlayer("p2"), version: 0 });
		const badRating = await request(cookie, "PUT", "/players/p1", {
			data: makePlayer("p1", "越界", { rating: 99 }),
			version: 0,
		});
		const notJson = await request(
			cookie,
			"PUT",
			"/players/p1",
			JSON.stringify({ data: makePlayer("p1"), version: 0 }),
			"text/plain",
		);
		const brokenJson = await request(cookie, "PUT", "/players/p1", '{"data":');

		for (const res of [idMismatch, badRating, notJson, brokenJson]) {
			expect(res.status).toBe(400);
			expect(await res.json()).toEqual({ error: "INVALID_BODY" });
		}
		expect(await listItems(cookie)).toEqual([]);
	});

	it("刪除參賽者回 204 且重複刪除仍回 204", async () => {
		const cookie = await seedAndSignIn("mp-delete@example.com");
		await putPlayer(cookie, makePlayer("p1"), 0);
		await putPlayer(cookie, makePlayer("p2"), 0);

		const first = await request(cookie, "DELETE", "/players/p1");
		const second = await request(cookie, "DELETE", "/players/p1");
		const never = await request(cookie, "DELETE", "/players/never-existed");

		expect(first.status).toBe(204);
		expect(second.status).toBe(204);
		expect(never.status).toBe(204);
		// 只刪指定 id，其他參賽者不受影響
		expect((await listItems(cookie)).map((item) => item.data.id)).toEqual(["p2"]);
	});

	it("匯入的參賽者附加在既有名單之後並各自為 version 1", async () => {
		const cookie = await seedAndSignIn("mp-append@example.com");
		await putPlayer(cookie, makePlayer("p1"), 0);

		const res = await importPlayers(cookie, [makePlayer("p2"), makePlayer("p3")]);

		expect(res.status).toBe(200);
		const body = (await res.json()) as { items: ListItem[] };
		expect(body.items.map((item) => [item.data.id, item.version])).toEqual([
			["p2", 1],
			["p3", 1],
		]);
		expect((await listItems(cookie)).map((item) => item.data.id)).toEqual(["p1", "p2", "p3"]);
		expect(await sortOrders(await userIdOf("mp-append@example.com"))).toEqual([
			["p1", 0],
			["p2", 1],
			["p3", 2],
		]);
	});

	it("匯入時任一 id 已存在則整份不寫入並回 409", async () => {
		const cookie = await seedAndSignIn("mp-atomic@example.com");
		await putPlayer(cookie, makePlayer("p1"), 0);

		const res = await importPlayers(cookie, [makePlayer("p4"), makePlayer("p1"), makePlayer("p5")]);

		expect(res.status).toBe(409);
		expect(await res.json()).toEqual({ error: "VERSION_CONFLICT" });
		expect((await listItems(cookie)).map((item) => item.data.id)).toEqual(["p1"]);
	});

	it("匯入清單為空或含重複 id 時回 400", async () => {
		const cookie = await seedAndSignIn("mp-import-bad@example.com");

		const empty = await importPlayers(cookie, []);
		const duplicated = await importPlayers(cookie, [makePlayer("p1"), makePlayer("p1")]);

		for (const res of [empty, duplicated]) {
			expect(res.status).toBe(400);
			expect(await res.json()).toEqual({ error: "INVALID_BODY" });
		}
		expect(await listItems(cookie)).toEqual([]);
	});

	it("匯入含不合 PlayerSchema 的參賽者時回 400 且不寫入", async () => {
		const cookie = await seedAndSignIn("mp-import-schema@example.com");

		const res = await importPlayers(cookie, [makePlayer("p1", "越界", { rating: 99 }), makePlayer("p2")]);

		expect(res.status).toBe(400);
		expect(await res.json()).toEqual({ error: "INVALID_BODY" });
		expect(await listItems(cookie)).toEqual([]);
	});

	it("匯入遇到非主鍵衝突的資料庫錯誤時回 500", async () => {
		const cookie = await seedAndSignIn("mp-import-dberr@example.com");
		// 只讓 batch 失敗：getSession 與讀取最大 sort_order 走 prepare，照常通過
		const batchFailingDb = {
			prepare: (query: string) => env.DB?.prepare(query),
			batch: () => {
				throw new Error("D1 暫時不可用（測試替身）");
			},
		} as unknown as D1Database;
		const spy = vi.spyOn(console, "error").mockImplementation(() => {});
		try {
			const res = await app.request(
				"/api/matchmaker/players/import",
				{
					method: "POST",
					headers: { Cookie: cookie, Origin: origin, "Content-Type": "application/json" },
					body: JSON.stringify({ players: [makePlayer("p1")] }),
				},
				{ ...env, DB: batchFailingDb },
			);

			expect(res.status).toBe(500);
		} finally {
			spy.mockRestore();
		}
		expect(await listItems(cookie)).toEqual([]);
	});

	it("匯入遇到非主鍵的約束違規時回 500 而非 409", async () => {
		const cookie = await seedAndSignIn("mp-import-fk@example.com");
		// 實測（design Open Questions）：D1 batch 的主鍵衝突在最外層訊息就含 SQLITE_CONSTRAINT_PRIMARYKEY，
		// 不需走 cause。此處刻意把非主鍵的 FOREIGN KEY 違規包在 cause 內，驗證兩件事：
		// 一是 isConstraintError 沿 cause 鏈查找也只認主鍵／UNIQUE，二是 FK 違規不是 id 重複，必須回 500 而非 409
		const constraintError = new Error("D1_ERROR: FOREIGN KEY constraint failed: SQLITE_CONSTRAINT (extended: SQLITE_CONSTRAINT_FOREIGNKEY)");
		const batchFailingDb = {
			prepare: (query: string) => env.DB?.prepare(query),
			batch: () => {
				throw new Error("Failed query", { cause: constraintError });
			},
		} as unknown as D1Database;
		const spy = vi.spyOn(console, "error").mockImplementation(() => {});
		try {
			const res = await app.request(
				"/api/matchmaker/players/import",
				{
					method: "POST",
					headers: { Cookie: cookie, Origin: origin, "Content-Type": "application/json" },
					body: JSON.stringify({ players: [makePlayer("p1")] }),
				},
				{ ...env, DB: batchFailingDb },
			);

			expect(res.status).toBe(500);
		} finally {
			spy.mockRestore();
		}
		expect(await listItems(cookie)).toEqual([]);
	});

	// regression guard（寫入即綠）：寫入與回傳的是驗證後的輸出，含 schema 補上的預設值。
	it("省略 restCount 與 gamesPlayed 時以預設值 0 寫入並回傳", async () => {
		const cookie = await seedAndSignIn("mp-defaults@example.com");
		const withoutDefaults = (id: string) => {
			const { restCount: _restCount, gamesPlayed: _gamesPlayed, ...rest } = makePlayer(id);
			return rest;
		};

		const putRes = await request(cookie, "PUT", "/players/p1", { data: withoutDefaults("p1"), version: 0 });
		const importRes = await request(cookie, "POST", "/players/import", {
			players: [withoutDefaults("p2"), withoutDefaults("p3")],
		});

		expect(putRes.status).toBe(200);
		expect(await putRes.json()).toEqual({ data: makePlayer("p1"), version: 1 });
		expect(importRes.status).toBe(200);
		expect(await importRes.json()).toEqual({
			items: [
				{ data: makePlayer("p2"), version: 1 },
				{ data: makePlayer("p3"), version: 1 },
			],
		});
		expect(await listItems(cookie)).toEqual([
			{ data: makePlayer("p1"), version: 1 },
			{ data: makePlayer("p2"), version: 1 },
			{ data: makePlayer("p3"), version: 1 },
		]);
	});

	it("重置刪除本人全部參賽者並回 204", async () => {
		const cookie = await seedAndSignIn("mp-reset@example.com");
		await importPlayers(cookie, [makePlayer("p1"), makePlayer("p2"), makePlayer("p3")]);
		expect(await listItems(cookie)).toHaveLength(3);

		const res = await request(cookie, "POST", "/reset");

		expect(res.status).toBe(204);
		expect(await listItems(cookie)).toEqual([]);
	});

	it("重置在同一 batch 內刪除本人的名單、回合、分槽與歷史", async () => {
		const cookieA = await seedAndSignIn("mp-reset-all-a@example.com");
		const cookieB = await seedAndSignIn("mp-reset-all-b@example.com");
		const idA = await userIdOf("mp-reset-all-a@example.com");
		const idB = await userIdOf("mp-reset-all-b@example.com");
		const tables = ["matchmaker_players", "matchmaker_round", "matchmaker_match_slots", "matchmaker_history"];
		for (const [cookie, id] of [
			[cookieA, idA],
			[cookieB, idB],
		] as const) {
			await importPlayers(cookie, [makePlayer("p1"), makePlayer("p2")]);
			await seedRound(id, makeRound([makeMatch("m1"), makeMatch("m2")]));
			await seedSlot(id, makeSlot("m1"));
			await seedSlot(id, makeSlot("m2"));
			await seedHistory(id, makeHistoryEntry("h1"));
			await seedHistory(id, makeHistoryEntry("h2"));
		}
		const bBefore = await Promise.all(tables.map((table) => rowsOf(table, idB)));

		const res = await request(cookieA, "POST", "/reset");

		expect(res.status).toBe(204);
		for (const table of tables) {
			expect(await rowsOf(table, idA)).toEqual([]);
		}
		expect(await Promise.all(tables.map((table) => rowsOf(table, idB)))).toEqual(bBefore);
		expect(bBefore.map((rows) => rows.length)).toEqual([2, 1, 2, 2]);
	});

	it("重置以單一 D1 batch 送出四條刪除", async () => {
		const cookie = await seedAndSignIn("mp-reset-one-batch@example.com");
		const batchSizes: number[] = [];
		const spyDb = {
			prepare: (query: string) => env.DB!.prepare(query),
			batch: (statements: D1PreparedStatement[]) => {
				batchSizes.push(statements.length);
				return env.DB!.batch(statements);
			},
			exec: (query: string) => env.DB!.exec(query),
		} as unknown as D1Database;

		const res = await app.request("/api/matchmaker/reset", appRequestInit(cookie, endpoints[4]), {
			...env,
			DB: spyDb,
		});

		expect(res.status).toBe(204);
		expect(batchSizes).toEqual([4]);
	});
});
