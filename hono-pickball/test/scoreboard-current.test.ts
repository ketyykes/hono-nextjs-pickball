import { env, exports } from "cloudflare:workers";
import { createInitialState } from "@pickball/core/scoreboard/reducer";
import type { ScoreboardState } from "@pickball/core/scoreboard/types";
import { describe, expect, it, vi } from "vitest";
import app from "../src/index";
import { seedUser, signIn, userIdOf } from "./helpers/session";

const origin = "http://localhost:3005";
const url = `${origin}/api/scoreboard/current`;

function scoreState(us: number, them: number): ScoreboardState {
	const state = createInitialState();
	return { ...state, scores: { us, them } };
}

function getCurrent(cookie: string): Promise<Response> {
	return exports.default.fetch(new Request(url, { headers: { Cookie: cookie } }));
}

function putCurrent(cookie: string, body: unknown, contentType = "application/json"): Promise<Response> {
	return exports.default.fetch(
		new Request(url, {
			method: "PUT",
			headers: { Cookie: cookie, "Content-Type": contentType, Origin: origin },
			body: typeof body === "string" ? body : JSON.stringify(body),
		}),
	);
}

async function seedAndSignIn(email: string): Promise<string> {
	await seedUser(email);
	return signIn(email);
}

describe("/api/scoreboard/current", () => {
	it("auth 停用且無 DB binding 時 GET 與 PUT /api/scoreboard/current 皆回 404", async () => {
		const disabledEnv = { ...env, ENVIRONMENT: undefined, DB: undefined };

		const getRes = await app.request("/api/scoreboard/current", {}, disabledEnv);
		const putRes = await app.request(
			"/api/scoreboard/current",
			{
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ data: scoreState(1, 0), version: 0 }),
			},
			disabledEnv,
		);

		expect(getRes.status).toBe(404);
		expect(putRes.status).toBe(404);
	});

	it("未登入呼叫 GET 與 PUT /api/scoreboard/current 皆回 401", async () => {
		const getRes = await exports.default.fetch(new Request(url));
		const putRes = await exports.default.fetch(
			new Request(url, {
				method: "PUT",
				headers: { "Content-Type": "application/json", Origin: origin },
				body: JSON.stringify({ data: scoreState(1, 0), version: 0 }),
			}),
		);

		expect(getRes.status).toBe(401);
		expect(await getRes.json()).toEqual({ error: "UNAUTHORIZED" });
		expect(putRes.status).toBe(401);
		expect(await putRes.json()).toEqual({ error: "UNAUTHORIZED" });
	});

	it("B 的 cookie 讀不到 A 的計分板且寫入不影響 A", async () => {
		const cookieA = await seedAndSignIn("sb-owner-a@example.com");
		const cookieB = await seedAndSignIn("sb-owner-b@example.com");
		const putA = await putCurrent(cookieA, { data: scoreState(5, 3), version: 0 });
		expect(putA.status).toBe(200);

		const getB = await getCurrent(cookieB);
		expect(getB.status).toBe(200);
		expect(await getB.json()).toEqual({ data: null, version: 0 });

		const putB = await putCurrent(cookieB, { data: scoreState(1, 1), version: 0 });
		expect(putB.status).toBe(200);
		expect(((await putB.json()) as { version: number }).version).toBe(1);

		// A、B 此時版本同為 1：B 以 version 1 更新時，只能改到 B 自己那一列
		const updateB = await putCurrent(cookieB, { data: scoreState(7, 7), version: 1 });
		expect(updateB.status).toBe(200);

		const getA = await getCurrent(cookieA);
		expect(await getA.json()).toEqual({ data: scoreState(5, 3), version: 1 });
	});

	it("尚無資料時 GET 回 data null 與 version 0", async () => {
		const cookie = await seedAndSignIn("sb-empty@example.com");

		const res = await getCurrent(cookie);

		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ data: null, version: 0 });
	});

	it("以 version 0 首次寫入成功並回 version 1", async () => {
		const cookie = await seedAndSignIn("sb-first@example.com");

		// 省略帶 schema 預設值的欄位：寫入與回傳的必須是驗證後的輸出（已補上 null）
		const { matchId: _m, courtNumber: _c, teamPlayers: _t, ...withoutDefaults } = scoreState(2, 1);

		const putRes = await putCurrent(cookie, { data: withoutDefaults, version: 0 });

		expect(putRes.status).toBe(200);
		expect(await putRes.json()).toEqual({ data: scoreState(2, 1), version: 1 });
		const getRes = await getCurrent(cookie);
		expect(await getRes.json()).toEqual({ data: scoreState(2, 1), version: 1 });
	});

	it("以目前 version 寫入成功並遞增 version，GET 取回相同資料", async () => {
		const cookie = await seedAndSignIn("sb-update@example.com");
		await putCurrent(cookie, { data: scoreState(2, 1), version: 0 });

		const putRes = await putCurrent(cookie, { data: scoreState(4, 2), version: 1 });

		expect(putRes.status).toBe(200);
		expect(await putRes.json()).toEqual({ data: scoreState(4, 2), version: 2 });
		const getRes = await getCurrent(cookie);
		expect(await getRes.json()).toEqual({ data: scoreState(4, 2), version: 2 });
	});

	it("version 不符時回 409 VERSION_CONFLICT 且資料不變", async () => {
		const cookie = await seedAndSignIn("sb-conflict@example.com");
		await putCurrent(cookie, { data: scoreState(1, 0), version: 0 });
		await putCurrent(cookie, { data: scoreState(2, 0), version: 1 });

		const lower = await putCurrent(cookie, { data: scoreState(9, 9), version: 1 });
		const higher = await putCurrent(cookie, { data: scoreState(9, 9), version: 3 });

		expect(lower.status).toBe(409);
		expect(await lower.json()).toEqual({ error: "VERSION_CONFLICT" });
		expect(higher.status).toBe(409);
		expect(await higher.json()).toEqual({ error: "VERSION_CONFLICT" });
		const getRes = await getCurrent(cookie);
		expect(await getRes.json()).toEqual({ data: scoreState(2, 0), version: 2 });
	});

	it("已有資料時以 version 0 寫入回 409", async () => {
		const cookie = await seedAndSignIn("sb-zero-conflict@example.com");
		await putCurrent(cookie, { data: scoreState(3, 3), version: 0 });

		const res = await putCurrent(cookie, { data: scoreState(9, 9), version: 0 });

		expect(res.status).toBe(409);
		expect(await res.json()).toEqual({ error: "VERSION_CONFLICT" });
		const getRes = await getCurrent(cookie);
		expect(await getRes.json()).toEqual({ data: scoreState(3, 3), version: 1 });
	});

	it("body 不符 schema 或 content-type 非 JSON 時回 400 INVALID_BODY", async () => {
		const cookie = await seedAndSignIn("sb-invalid@example.com");
		const { scores: _scores, ...missingScores } = scoreState(1, 0);
		const validJson = JSON.stringify({ data: scoreState(1, 0), version: 0 });

		const responses = [
			await putCurrent(cookie, { data: missingScores, version: 0 }),
			await putCurrent(cookie, { data: scoreState(1, 0), version: -1 }),
			await putCurrent(cookie, { data: scoreState(1, 0), version: 1.5 }),
			await putCurrent(cookie, validJson, "text/plain"),
			// spec 原文涵蓋「body 不是 JSON」：Content-Type 為 JSON 但語法錯誤
			await putCurrent(cookie, '{"data":'),
		];

		for (const res of responses) {
			expect(res.status).toBe(400);
			expect(await res.json()).toEqual({ error: "INVALID_BODY" });
		}
		const getRes = await getCurrent(cookie);
		expect(await getRes.json()).toEqual({ data: null, version: 0 });
	});

	it("data.matchId 非 null 時回 400 INVALID_BODY", async () => {
		const cookie = await seedAndSignIn("sb-matchid@example.com");
		const bound = { ...scoreState(1, 0), matchId: "m1" };

		const res = await putCurrent(cookie, { data: bound, version: 0 });

		expect(res.status).toBe(400);
		expect(await res.json()).toEqual({ error: "INVALID_BODY" });
		const getRes = await getCurrent(cookie);
		expect(await getRes.json()).toEqual({ data: null, version: 0 });
	});
	// 以下三個 it 為 regression guard（行為早已實作，寫入即綠）。
	it("PUT 忽略 query 與 body 中的 userId，一律寫入登入者本人", async () => {
		const cookieA = await seedAndSignIn("sb-uid-a@example.com");
		const cookieB = await seedAndSignIn("sb-uid-b@example.com");
		const idA = await userIdOf("sb-uid-a@example.com");

		const res = await exports.default.fetch(
			new Request(`${url}?userId=${idA}`, {
				method: "PUT",
				headers: { Cookie: cookieB, "Content-Type": "application/json", Origin: origin },
				body: JSON.stringify({ data: scoreState(2, 2), version: 0, userId: idA }),
			}),
		);

		expect(res.status).toBe(200);
		expect(await (await getCurrent(cookieA)).json()).toEqual({ data: null, version: 0 });
		expect(await (await getCurrent(cookieB)).json()).toEqual({ data: scoreState(2, 2), version: 1 });
	});

	it("getSession 拋出例外時回 500", async () => {
		const cookie = await seedAndSignIn("sb-session-down@example.com");
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
		const brokenEnv = { ...env, DB: throwingDb };
		const spy = vi.spyOn(console, "error").mockImplementation(() => {});
		try {
			const getRes = await app.request("/api/scoreboard/current", { headers: { Cookie: cookie } }, brokenEnv);
			const putRes = await app.request(
				"/api/scoreboard/current",
				{
					method: "PUT",
					headers: { Cookie: cookie, "Content-Type": "application/json", Origin: origin },
					body: JSON.stringify({ data: scoreState(1, 0), version: 0 }),
				},
				brokenEnv,
			);

			expect([getRes.status, putRes.status]).toEqual([500, 500]);
		} finally {
			spy.mockRestore();
		}
	});

	it("已有資料時 GET 回 200 與該筆資料", async () => {
		const cookie = await seedAndSignIn("sb-get-existing@example.com");
		const put = await putCurrent(cookie, { data: scoreState(4, 6), version: 0 });
		expect(put.status).toBe(200);

		const res = await getCurrent(cookie);

		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ data: scoreState(4, 6), version: 1 });
	});
});
