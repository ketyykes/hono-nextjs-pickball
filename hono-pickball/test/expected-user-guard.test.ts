import { env, exports } from "cloudflare:workers";
import { API_ERROR_CODES } from "@pickball/core/api/errors";
import { EXPECTED_USER_ID_HEADER } from "@pickball/core/api/headers";
import { USER_DATA_TABLES } from "@pickball/core/api/user-data-tables";
import type { Player } from "@pickball/core/matchmaker/types";
import { createInitialState } from "@pickball/core/scoreboard/reducer";
import type { ScoreboardState } from "@pickball/core/scoreboard/types";
import { describe, expect, it } from "vitest";
import { getDb } from "../src/db/client";
import { matchmakerPlayers, scoreboardCurrent } from "../src/db/schema";
import app from "../src/index";
import {
	makeHistoryEntry,
	makeMatch,
	makeRound,
	makeSlot,
	rowsOf,
	seedAndSignIn,
	seedHistory,
	seedRound,
	seedSlot,
} from "./helpers/matchmaker-fixtures";
import { userIdOf } from "./helpers/session";

const origin = "http://localhost:3005";
const NOW = new Date(1_700_000_000_000);

// 不要求預期帳號的路由；其餘路由一律視為使用者資料路由（新增端點時漏掛守衛會在這裡現形）
const NON_USER_DATA_PATHS = new Set(["/api/health", "/api/cookie-check", "/api/auth/*", "/api/me", "/api/session"]);

interface Sample {
	method: string;
	path: string;
	body?: unknown;
}

function scoreState(us: number, them: number): ScoreboardState {
	const state = createInitialState();
	return { ...state, scores: { us, them } };
}

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

/**
 * 每條使用者資料路由一份「若被放行就會改變或回傳資料」的合法請求，
 * 以 B 的資料為對象（B 的計分板 version 1、名單 m1-a／m1-b、回合 version 1 含 pending 的 m1、m1 分槽 version 1）。
 */
const SAMPLES: Record<string, Sample> = {
	"GET /api/scoreboard/current": { method: "GET", path: "/api/scoreboard/current" },
	"PUT /api/scoreboard/current": {
		method: "PUT",
		path: "/api/scoreboard/current",
		body: { data: scoreState(9, 9), version: 1 },
	},
	"GET /api/matchmaker/players": { method: "GET", path: "/api/matchmaker/players" },
	"PUT /api/matchmaker/players/:id": {
		method: "PUT",
		path: "/api/matchmaker/players/m1-a",
		body: { data: makePlayer("m1-a", { name: "被改名" }), version: 1 },
	},
	"DELETE /api/matchmaker/players/:id": { method: "DELETE", path: "/api/matchmaker/players/m1-b" },
	"POST /api/matchmaker/players/import": {
		method: "POST",
		path: "/api/matchmaker/players/import",
		body: { players: [makePlayer("imported-1")] },
	},
	"GET /api/matchmaker/round": { method: "GET", path: "/api/matchmaker/round" },
	"PUT /api/matchmaker/round": {
		method: "PUT",
		path: "/api/matchmaker/round",
		body: { data: makeRound([makeMatch("m1"), makeMatch("m2")], 2), version: 1 },
	},
	"GET /api/matchmaker/slots": { method: "GET", path: "/api/matchmaker/slots" },
	"GET /api/matchmaker/slots/:matchId": { method: "GET", path: "/api/matchmaker/slots/m1" },
	"PUT /api/matchmaker/slots/:matchId": {
		method: "PUT",
		path: "/api/matchmaker/slots/m1",
		body: { data: makeSlot("m1", 5), version: 1 },
	},
	"POST /api/matchmaker/round/matches/:matchId/score": {
		method: "POST",
		path: "/api/matchmaker/round/matches/m1/score",
		body: { scoreA: "11", scoreB: "7", roundVersion: 1 },
	},
	"GET /api/matchmaker/history": { method: "GET", path: "/api/matchmaker/history" },
	// B 已有名單等資料，若守衛被放行會回 409 而非 401，因此狀態碼斷言仍能分辨守衛是否生效
	"POST /api/import": {
		method: "POST",
		path: "/api/import",
		body: { version: 1, players: [makePlayer("imp-1")], currentRound: null, history: [], scoreboard: { current: null, matches: [] } },
	},
	// reset 會清空整個使用者的資料，排在最後：守衛被整條拿掉時，前面的 PUT／score 快照斷言才能先獨立轉紅
	"POST /api/matchmaker/reset": { method: "POST", path: "/api/matchmaker/reset" },
};

function listUserDataRouteKeys(): string[] {
	// app.routes 每個 handler／middleware 各列一筆，同一 method＋path 會重複，必須先去重
	const unique = new Set(app.routes.map((route) => `${route.method} ${route.path}`));
	return [...unique]
		.filter((key) => {
			const [method, path] = key.split(" ");
			return method !== "ALL" && !NON_USER_DATA_PATHS.has(path);
		})
		.sort();
}

let accountCounter = 0;

interface Accounts {
	cookieA: string;
	cookieB: string;
	idA: string;
	idB: string;
}

/** A、B 各自在計分板、名單、回合、分槽與歷史都有資料，使 reset、PUT、score 若被放行一定看得出來。 */
async function setupAccounts(): Promise<Accounts> {
	accountCounter += 1;
	const emailA = `guard-a-${accountCounter}@example.com`;
	const emailB = `guard-b-${accountCounter}@example.com`;
	const cookieA = await seedAndSignIn(emailA);
	const cookieB = await seedAndSignIn(emailB);
	const idA = await userIdOf(emailA);
	const idB = await userIdOf(emailB);

	const db = getDb(env);
	for (const [userId, us] of [
		[idA, 5],
		[idB, 3],
	] as const) {
		await db.insert(scoreboardCurrent).values({ userId, data: scoreState(us, 1), version: 1, updatedAt: NOW });
		await db.insert(matchmakerPlayers).values(
			["m1-a", "m1-b"].map((id, index) => ({
				userId,
				id,
				data: makePlayer(id),
				sortOrder: index,
				version: 1,
				updatedAt: NOW,
			})),
		);
		await seedRound(userId, makeRound([makeMatch("m1")]));
		await seedSlot(userId, makeSlot("m1", us));
		await seedHistory(userId, makeHistoryEntry("h0"));
	}
	return { cookieA, cookieB, idA, idB };
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

function buildInit(sample: Sample, headers: Record<string, string>): RequestInit {
	const init: RequestInit = { method: sample.method, headers: { Origin: origin, ...headers } };
	if (sample.body !== undefined) {
		(init.headers as Record<string, string>)["Content-Type"] = "application/json";
		init.body = JSON.stringify(sample.body);
	}
	return init;
}

function send(sample: Sample, headers: Record<string, string>): Promise<Response> {
	return exports.default.fetch(new Request(`${origin}${sample.path}`, buildInit(sample, headers)));
}

describe("使用者資料請求的預期帳號守衛", () => {
	it("每條使用者資料路由在預期帳號與 session 不符時皆回 401 ACCOUNT_MISMATCH 且資料不變", async () => {
		const { cookieB, idA, idB } = await setupAccounts();
		const wrongValues: Record<string, string> = {
			他人的帳號: idA,
			"本人帳號加尾碼（防止 startsWith）": `${idB}x`,
			"本人帳號的前綴（防止反向 startsWith）": idB.slice(0, -1),
			多值串接: `${idB},${idA}`,
			// 前後空白與 tab 會被 Fetch Headers 正規化，無法用來測 trim；VT 不會被正規化，所以用它擋「trim 後比較」的實作
			"本人帳號加 VT（防止 trim）": `${idB}\u000b`,
		};

		for (const [routeKey, sample] of Object.entries(SAMPLES)) {
			for (const [variant, wrongValue] of Object.entries(wrongValues)) {
				const label = `${routeKey}（${variant}）`;
				const before = await snapshotOf([idA, idB]);

				const res = await send(sample, { Cookie: cookieB, [EXPECTED_USER_ID_HEADER]: wrongValue });

				expect(res.status, `${label} 狀態碼`).toBe(401);
				expect(await res.json(), `${label} body`).toEqual({ error: API_ERROR_CODES.ACCOUNT_MISMATCH });
				expect(await snapshotOf([idA, idB]), `${label} 資料快照`).toEqual(before);
			}
		}
	});

	it("缺少或空白的預期帳號標頭使使用者資料路由回 401 ACCOUNT_MISMATCH 且資料不變", async () => {
		const { cookieB, idA, idB } = await setupAccounts();
		const rounds: Record<string, Record<string, string>> = {
			缺少標頭: { Cookie: cookieB },
			空字串標頭: { Cookie: cookieB, [EXPECTED_USER_ID_HEADER]: "" },
		};

		for (const [routeKey, sample] of Object.entries(SAMPLES)) {
			for (const [roundName, headers] of Object.entries(rounds)) {
				const label = `${routeKey}（${roundName}）`;
				const before = await snapshotOf([idA, idB]);

				const res = await send(sample, headers);

				expect(res.status, `${label} 狀態碼`).toBe(401);
				expect(await res.json(), `${label} body`).toEqual({ error: API_ERROR_CODES.ACCOUNT_MISMATCH });
				expect(await snapshotOf([idA, idB]), `${label} 資料快照`).toEqual(before);
			}
		}
	});

	it("列舉出的使用者資料路由恰與守衛樣本表一致", () => {
		const enumerated = listUserDataRouteKeys();

		expect(enumerated).toEqual(Object.keys(SAMPLES).sort());
		expect(enumerated).toHaveLength(15);
		for (const [routeKey, sample] of Object.entries(SAMPLES)) {
			expect(routeKey.startsWith(`${sample.method} `), `${routeKey} 的樣本方法`).toBe(true);
		}
	});

	it("未登入回 UNAUTHORIZED、停用回 404，皆優先於帳號守衛", async () => {
		const { idA, idB } = await setupAccounts();
		const disabledEnv = { ...env, ENVIRONMENT: undefined, DB: undefined };

		for (const [routeKey, sample] of Object.entries(SAMPLES)) {
			const before = await snapshotOf([idA, idB]);

			const unauthenticated = await send(sample, {});
			expect(unauthenticated.status, `${routeKey} 未登入狀態碼`).toBe(401);
			expect(await unauthenticated.json(), `${routeKey} 未登入 body`).toEqual({
				error: API_ERROR_CODES.UNAUTHORIZED,
			});

			const disabled = await app.request(sample.path, buildInit(sample, {}), disabledEnv);
			expect(disabled.status, `${routeKey} 停用狀態碼`).toBe(404);

			expect(await snapshotOf([idA, idB]), `${routeKey} 資料快照`).toEqual(before);
		}
	});

	it("標頭與 session 相符時使用者資料端點照常處理且標頭名稱不分大小寫", async () => {
		accountCounter += 1;
		const email = `guard-match-${accountCounter}@example.com`;
		const cookie = await seedAndSignIn(email);
		const userId = await userIdOf(email);
		const headers = { Cookie: cookie, "x-expected-user-id": userId };
		const data = scoreState(4, 2);

		const put = await send(
			{ method: "PUT", path: "/api/scoreboard/current", body: { data, version: 0 } },
			headers,
		);
		const get = await send({ method: "GET", path: "/api/scoreboard/current" }, headers);

		expect(put.status).toBe(200);
		expect(((await put.json()) as { version: number }).version).toBe(1);
		expect(get.status).toBe(200);
		expect(await get.json()).toEqual({ data, version: 1 });
	});

	it("非使用者資料路由不要求預期帳號標頭", async () => {
		accountCounter += 1;
		const email = `guard-open-${accountCounter}@example.com`;
		const cookie = await seedAndSignIn(email);
		const userId = await userIdOf(email);

		const me = await send({ method: "GET", path: "/api/me" }, { Cookie: cookie });
		const session = await send({ method: "GET", path: "/api/session" }, { Cookie: cookie });
		const health = await send({ method: "GET", path: "/api/health" }, { Cookie: cookie });

		expect(me.status).toBe(200);
		expect(((await me.json()) as { user: { id: string } }).user.id).toBe(userId);
		expect(session.status).toBe(200);
		expect(((await session.json()) as { user: { id: string } }).user.id).toBe(userId);
		expect(health.status).toBe(200);
	});
});
