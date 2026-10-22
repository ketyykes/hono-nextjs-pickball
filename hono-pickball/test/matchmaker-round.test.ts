import { env } from "cloudflare:workers";
import { describe, expect, it, vi } from "vitest";
import app from "../src/index";
import {
	appRequestInit,
	makeHistoryEntry,
	makeMatch,
	makeRound,
	makeSlot,
	request,
	rowsOf,
	seedHistory,
	seedRound,
	seedSlot,
	throwingDb,
} from "./helpers/matchmaker-fixtures";
import { seedUser, signIn, userIdOf } from "./helpers/session";

async function seedAndSignIn(email: string): Promise<string> {
	await seedUser(email);
	return signIn(email);
}

interface Versioned<T> {
	data: T;
	version: number;
}

async function getRound(cookie: string): Promise<Versioned<unknown>> {
	const res = await request(cookie, "GET", "/round");
	expect(res.status).toBe(200);
	return (await res.json()) as Versioned<unknown>;
}

async function slotMatchIds(cookie: string): Promise<string[]> {
	const res = await request(cookie, "GET", "/slots");
	expect(res.status).toBe(200);
	const body = (await res.json()) as { items: Array<Versioned<{ matchId: string }>> };
	return body.items.map((item) => item.data.matchId);
}

// 六個端點的合法請求；迴圈測試對每個端點各自收集結果。
const endpoints: Array<{ label: string; method: string; path: string; body?: unknown }> = [
	{ label: "GET /round", method: "GET", path: "/round" },
	{ label: "PUT /round", method: "PUT", path: "/round", body: { data: makeRound([makeMatch("m1")]), version: 0 } },
	{ label: "GET /slots", method: "GET", path: "/slots" },
	{ label: "GET /slots/:matchId", method: "GET", path: "/slots/m1" },
	{ label: "PUT /slots/:matchId", method: "PUT", path: "/slots/m1", body: { data: makeSlot("m1"), version: 0 } },
	{
		label: "POST /round/matches/:matchId/score",
		method: "POST",
		path: "/round/matches/m1/score",
		body: { scoreA: "11", scoreB: "7", roundVersion: 1 },
	},
];

describe("/api/matchmaker 回合與分槽的授權與停用閘門", () => {
	it("auth 停用且無 DB binding 時回合、分槽與送出比分端點皆回 404", async () => {
		const disabledEnv = { ...env, ENVIRONMENT: undefined, DB: undefined };

		const statuses: number[] = [];
		for (const endpoint of endpoints) {
			const res = await app.request(`/api/matchmaker${endpoint.path}`, appRequestInit(undefined, endpoint), disabledEnv);
			statuses.push(res.status);
		}

		expect(statuses).toEqual([404, 404, 404, 404, 404, 404]);
	});

	it("未登入呼叫回合、分槽與送出比分端點皆回 401", async () => {
		const statuses: number[] = [];
		const bodies: unknown[] = [];
		for (const endpoint of endpoints) {
			const res = await request(undefined, endpoint.method, endpoint.path, endpoint.body);
			statuses.push(res.status);
			bodies.push(await res.json());
		}

		expect(statuses).toEqual([401, 401, 401, 401, 401, 401]);
		expect(bodies).toEqual(Array(6).fill({ error: "UNAUTHORIZED" }));
	});

	it("B 看不到也改不到 A 的回合與分槽", async () => {
		const cookieA = await seedAndSignIn("mr-iso-a@example.com");
		const cookieB = await seedAndSignIn("mr-iso-b@example.com");
		const round = makeRound([makeMatch("m1")]);
		expect((await request(cookieA, "PUT", "/round", { data: round, version: 0 })).status).toBe(200);
		expect((await request(cookieA, "PUT", "/slots/m1", { data: makeSlot("m1", 3), version: 0 })).status).toBe(200);

		const bRound = await request(cookieB, "GET", "/round");
		const bSlots = await request(cookieB, "GET", "/slots");
		const bSlot = await request(cookieB, "GET", "/slots/m1");
		const bRoundPut = await request(cookieB, "PUT", "/round", { data: makeRound([makeMatch("mx")]), version: 1 });
		const bSlotPut = await request(cookieB, "PUT", "/slots/m1", { data: makeSlot("m1", 9), version: 0 });
		// 以 A 的分槽版本（1）更新：B 名下沒有這一列，不可落到 A 的資料上
		const bSlotPutV1 = await request(cookieB, "PUT", "/slots/m1", { data: makeSlot("m1", 9), version: 1 });

		expect(await bRound.json()).toEqual({ data: null, version: 0 });
		expect(await bSlots.json()).toEqual({ items: [] });
		expect(bSlot.status).toBe(200);
		expect(await bSlot.json()).toEqual({ data: null, version: 0 });
		expect(bRoundPut.status).toBe(409);
		expect(bSlotPut.status).toBe(409);
		expect(bSlotPutV1.status).toBe(409);
		// A 的資料不變
		expect(await getRound(cookieA)).toEqual({ data: round, version: 1 });
		const aSlot = (await (await request(cookieA, "GET", "/slots/m1")).json()) as Versioned<{ scores: { us: number } }>;
		expect(aSlot.version).toBe(1);
		expect(aSlot.data.scores.us).toBe(3);
		// B 的兩次失敗寫入也沒有在 B 名下留下任何列
		expect(await getRound(cookieB)).toEqual({ data: null, version: 0 });
		expect(await slotMatchIds(cookieB)).toEqual([]);
	});

	it("不從 query 或 body 接受 userId（回合與分槽）", async () => {
		const cookieA = await seedAndSignIn("mr-uid-a@example.com");
		const cookieB = await seedAndSignIn("mr-uid-b@example.com");
		const idA = await userIdOf("mr-uid-a@example.com");
		const idB = await userIdOf("mr-uid-b@example.com");
		const roundA = makeRound([makeMatch("m1")]);
		expect((await request(cookieA, "PUT", "/round", { data: roundA, version: 0 })).status).toBe(200);
		// A 先有分槽，B 帶 A 的 userId 讀取時「讀不到」才有意義
		expect((await request(cookieA, "PUT", "/slots/m1", { data: makeSlot("m1"), version: 0 })).status).toBe(200);

		const bGetRound = await request(cookieB, "GET", `/round?userId=${idA}`);
		const bGetSlots = await request(cookieB, "GET", `/slots?userId=${idA}`);
		const bGetSlot = await request(cookieB, "GET", `/slots/m1?userId=${idA}`);
		const bPutRound = await request(cookieB, "PUT", `/round?userId=${idA}`, {
			data: makeRound([makeMatch("b1")]),
			version: 0,
			userId: idA,
		});
		const bPutSlot = await request(cookieB, "PUT", `/slots/b1?userId=${idA}`, {
			data: makeSlot("b1"),
			version: 0,
			userId: idA,
		});

		expect(await bGetRound.json()).toEqual({ data: null, version: 0 });
		expect(await bGetSlots.json()).toEqual({ items: [] });
		expect(bGetSlot.status).toBe(200);
		expect(await bGetSlot.json()).toEqual({ data: null, version: 0 });
		expect(bPutRound.status).toBe(200);
		expect(bPutSlot.status).toBe(200);
		// 寫入落在 B 名下，A 的回合沒被覆蓋、也沒多出分槽
		expect(await rowsOf("matchmaker_round", idB)).toHaveLength(1);
		expect(await rowsOf("matchmaker_match_slots", idB)).toHaveLength(1);
		expect(await getRound(cookieA)).toEqual({ data: roundA, version: 1 });
		expect(await slotMatchIds(cookieA)).toEqual(["m1"]);
	});

	it("getSession 拋出例外時回合與分槽端點回 500", async () => {
		const cookie = await seedAndSignIn("mr-session-down@example.com");
		const brokenEnv = { ...env, DB: throwingDb };
		const spy = vi.spyOn(console, "error").mockImplementation(() => {});
		try {
			const statuses: number[] = [];
			for (const endpoint of endpoints) {
				const res = await app.request(`/api/matchmaker${endpoint.path}`, appRequestInit(cookie, endpoint), brokenEnv);
				statuses.push(res.status);
			}

			expect(statuses).toEqual([500, 500, 500, 500, 500, 500]);
		} finally {
			spy.mockRestore();
		}
	});
});

describe("/api/matchmaker/round", () => {
	it("回合依單筆契約建立、更新並在版本不符時回 409", async () => {
		const cookie = await seedAndSignIn("mr-contract@example.com");
		const first = makeRound([makeMatch("m1")]);
		const second = makeRound([makeMatch("m1"), makeMatch("m2")], 2);

		const empty = await request(cookie, "GET", "/round");
		const created = await request(cookie, "PUT", "/round", { data: first, version: 0 });
		const updated = await request(cookie, "PUT", "/round", { data: second, version: 1 });
		const stale = await request(cookie, "PUT", "/round", { data: first, version: 1 });
		const createdAgain = await request(cookie, "PUT", "/round", { data: first, version: 0 });

		expect(await empty.json()).toEqual({ data: null, version: 0 });
		expect(created.status).toBe(200);
		expect(await created.json()).toEqual({ data: first, version: 1 });
		expect(updated.status).toBe(200);
		expect(await updated.json()).toEqual({ data: second, version: 2 });
		expect(stale.status).toBe(409);
		expect(await stale.json()).toEqual({ error: "VERSION_CONFLICT" });
		// 已有資料卻送 0 同樣是衝突；兩次衝突都不改動資料
		expect(createdAgain.status).toBe(409);
		expect(await getRound(cookie)).toEqual({ data: second, version: 2 });
	});

	it("回合寫入並回傳驗證後的輸出（含 schema 補上的預設值）", async () => {
		const cookie = await seedAndSignIn("mr-defaults@example.com");
		// 模擬舊版資料：缺少後來才加入、帶 default 的 timer 欄位
		const { timer: _omitted, ...withoutTimer } = makeRound([makeMatch("m1")]);

		const created = await request(cookie, "PUT", "/round", { data: withoutTimer, version: 0 });
		const updated = await request(cookie, "PUT", "/round", { data: withoutTimer, version: 1 });
		const stored = (await getRound(cookie)) as Versioned<{ timer: unknown }>;

		expect(((await created.json()) as Versioned<{ timer: unknown }>).data.timer).toBeNull();
		expect(((await updated.json()) as Versioned<{ timer: unknown }>).data.timer).toBeNull();
		expect(stored.data.timer).toBeNull();
	});

	it("回合 PUT 的 body 不合 RoundSchema 時回 400", async () => {
		const cookie = await seedAndSignIn("mr-badbody@example.com");

		const missing = await request(cookie, "PUT", "/round", { data: { roundNumber: 1 }, version: 0 });
		const nullData = await request(cookie, "PUT", "/round", { data: null, version: 0 });
		const notJson = await request(cookie, "PUT", "/round", "not json", "text/plain");

		expect(missing.status).toBe(400);
		expect(await missing.json()).toEqual({ error: "INVALID_BODY" });
		expect(nullData.status).toBe(400);
		expect(notJson.status).toBe(400);
		expect(await getRound(cookie)).toEqual({ data: null, version: 0 });
	});

	it("回合 PUT 改變場次完成狀態或已完成場次內容時回 400", async () => {
		const cookie = await seedAndSignIn("mr-completed@example.com");
		const userId = await userIdOf("mr-completed@example.com");
		const original = makeRound([makeMatch("m1"), makeMatch("m2", "completed")]);
		await seedRound(userId, original);

		const completeM1 = await request(cookie, "PUT", "/round", {
			data: makeRound([makeMatch("m1", "completed"), makeMatch("m2", "completed")]),
			version: 1,
		});
		const editM2 = await request(cookie, "PUT", "/round", {
			data: makeRound([makeMatch("m1"), makeMatch("m2", "completed", 15)]),
			version: 1,
		});
		const dropM2 = await request(cookie, "PUT", "/round", {
			data: makeRound([makeMatch("m1"), makeMatch("m3", "completed")]),
			version: 1,
		});
		const freshCookie = await seedAndSignIn("mr-completed-fresh@example.com");
		const createCompleted = await request(freshCookie, "PUT", "/round", {
			data: makeRound([makeMatch("m1", "completed")]),
			version: 0,
		});

		for (const res of [completeM1, editM2, dropM2, createCompleted]) {
			expect(res.status).toBe(400);
			expect(await res.json()).toEqual({ error: "INVALID_BODY" });
		}
		expect(await getRound(cookie)).toEqual({ data: original, version: 1 });
		expect(await getRound(freshCookie)).toEqual({ data: null, version: 0 });
	});

	it("回合 PUT 保留同 id 且內容相同的已完成場次", async () => {
		const cookie = await seedAndSignIn("mr-keep-completed@example.com");
		const userId = await userIdOf("mr-keep-completed@example.com");
		await seedRound(userId, makeRound([makeMatch("m1"), makeMatch("m2", "completed")]));
		const next = makeRound([makeMatch("m2", "completed"), makeMatch("m3")], 2);

		const res = await request(cookie, "PUT", "/round", { data: next, version: 1 });

		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ data: next, version: 2 });
	});

	it("回合 PUT 比對已完成場次時不受 JSON 鍵順序影響", async () => {
		const cookie = await seedAndSignIn("mr-key-order@example.com");
		const userId = await userIdOf("mr-key-order@example.com");
		// 資料庫內的已完成場次鍵順序與 schema 輸出相反（含巢狀物件與陣列內的物件）
		const reverseKeys = (value: unknown): unknown => {
			if (Array.isArray(value)) {
				return value.map(reverseKeys);
			}
			if (typeof value === "object" && value !== null) {
				return Object.fromEntries(
					Object.entries(value)
						.reverse()
						.map(([key, inner]) => [key, reverseKeys(inner)]),
				);
			}
			return value;
		};
		const stored = makeRound([makeMatch("m1"), makeMatch("m2", "completed")]);
		await seedRound(userId, { ...stored, matches: [stored.matches[0], reverseKeys(stored.matches[1]) as never] });

		const res = await request(cookie, "PUT", "/round", { data: makeRound([makeMatch("m1"), makeMatch("m2", "completed")]), version: 1 });
		const edited = await request(cookie, "PUT", "/round", {
			data: makeRound([makeMatch("m1"), makeMatch("m2", "completed", 15)]),
			version: 2,
		});

		expect(res.status).toBe(200);
		expect(edited.status).toBe(400);
	});

	it("回合 PUT 的寫入與孤兒分槽清除在同一個 D1 batch 內送出", async () => {
		const cookie = await seedAndSignIn("mr-one-batch@example.com");
		const batchSizes: number[] = [];
		const spyDb = {
			prepare: (query: string) => env.DB!.prepare(query),
			batch: (statements: D1PreparedStatement[]) => {
				batchSizes.push(statements.length);
				return env.DB!.batch(statements);
			},
			exec: (query: string) => env.DB!.exec(query),
		} as unknown as D1Database;
		const init = appRequestInit(cookie, { method: "PUT", body: { data: makeRound([makeMatch("m1")]), version: 0 } });

		const created = await app.request("/api/matchmaker/round", init, { ...env, DB: spyDb });
		const stale = await app.request("/api/matchmaker/round", init, { ...env, DB: spyDb });

		expect(created.status).toBe(200);
		expect(stale.status).toBe(409);
		// 成功與衝突兩條路徑都是「一次 batch、兩條陳述式」
		expect(batchSizes).toEqual([2, 2]);
	});

	it("回合 PUT 刪除不屬於新回合的分槽且衝突時分槽仍與雲端回合一致", async () => {
		const cookie = await seedAndSignIn("mr-orphan@example.com");
		const other = await seedAndSignIn("mr-orphan-other@example.com");
		const userId = await userIdOf("mr-orphan@example.com");
		const otherId = await userIdOf("mr-orphan-other@example.com");
		await seedRound(userId, makeRound([makeMatch("m1"), makeMatch("m2")]));
		await seedSlot(userId, makeSlot("m1"));
		await seedSlot(userId, makeSlot("m2"));
		// 另一位使用者有同 match_id 的分槽，不可被誤刪
		await seedRound(otherId, makeRound([makeMatch("m1"), makeMatch("m2")]));
		await seedSlot(otherId, makeSlot("m2"));

		const rearranged = await request(cookie, "PUT", "/round", {
			data: makeRound([makeMatch("m1"), makeMatch("m3")], 2),
			version: 1,
		});
		expect(rearranged.status).toBe(200);
		expect(await slotMatchIds(cookie)).toEqual(["m1"]);

		// 以過期 version 重排成只含 m3：409，但分槽仍須對應「資料庫中的目前回合」（m1、m3），故 m1 保留
		await seedSlot(userId, makeSlot("m9"));
		const stale = await request(cookie, "PUT", "/round", {
			data: makeRound([makeMatch("m3")], 3),
			version: 1,
		});
		expect(stale.status).toBe(409);
		expect(await slotMatchIds(cookie)).toEqual(["m1"]);
		expect(await slotMatchIds(other)).toEqual(["m2"]);
		expect((await getRound(cookie)).version).toBe(2);
	});

	it("回合 PUT 把場次改為已完成時分槽同樣被清除", async () => {
		const cookie = await seedAndSignIn("mr-orphan-done@example.com");
		const userId = await userIdOf("mr-orphan-done@example.com");
		await seedRound(userId, makeRound([makeMatch("m1"), makeMatch("m2", "completed")]));
		await seedSlot(userId, makeSlot("m1"));
		// 殘留的已完成場次分槽（理論上不該存在），下一次回合 PUT 必須清掉
		await seedSlot(userId, makeSlot("m2"));

		const res = await request(cookie, "PUT", "/round", {
			data: makeRound([makeMatch("m1"), makeMatch("m2", "completed")]),
			version: 1,
		});

		expect(res.status).toBe(200);
		expect(await slotMatchIds(cookie)).toEqual(["m1"]);
	});

	it("回合 PUT 不新增、不修改也不刪除任何歷史", async () => {
		const cookie = await seedAndSignIn("mr-history@example.com");
		const userId = await userIdOf("mr-history@example.com");
		await seedRound(userId, makeRound([makeMatch("m1"), makeMatch("m2", "completed")]));
		await seedHistory(userId, makeHistoryEntry("h1"));
		await seedHistory(userId, makeHistoryEntry("h2"));
		const before = await rowsOf("matchmaker_history", userId);

		const res = await request(cookie, "PUT", "/round", {
			data: makeRound([makeMatch("n1"), makeMatch("n2")], 2),
			version: 1,
		});

		expect(res.status).toBe(200);
		expect(before).toHaveLength(2);
		expect(await rowsOf("matchmaker_history", userId)).toEqual(before);
	});
});
