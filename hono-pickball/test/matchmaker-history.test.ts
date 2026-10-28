import { env } from "cloudflare:workers";
import { API_ERROR_CODES } from "@pickball/core/api/errors";
import type { MatchHistoryEntry } from "@pickball/core/matchmaker/history";
import { describe, expect, it } from "vitest";
import app from "../src/index";
import {
	appRequestInit,
	makeHistoryEntry,
	request,
	rowsOf,
	seedAndSignIn,
	seedHistory,
} from "./helpers/matchmaker-fixtures";
import { userIdOf } from "./helpers/session";

interface HistoryListBody {
	items: Array<{ data: MatchHistoryEntry; version: number }>;
	total: number;
	droppedCount: number;
}

/** 以毫秒數指定 played_at 的歷史紀錄；同一 matchId 的 entry 可重複展開使用。 */
function entryAt(matchId: string, playedAtMs: number): MatchHistoryEntry {
	return { ...makeHistoryEntry(matchId), playedAt: new Date(playedAtMs).toISOString() };
}

/** 成功路徑的查詢；非 200 時在此就以狀態碼失敗，而不是在解析 body 時才出現難讀的錯誤。 */
async function getHistory(cookie: string, query = ""): Promise<{ body: HistoryListBody }> {
	const res = await request(cookie, "GET", `/history${query}`);
	expect(res.status, `GET /history${query}`).toBe(200);
	return { body: (await res.json()) as HistoryListBody };
}

function matchIdsOf(body: HistoryListBody): string[] {
	return body.items.map((item) => item.data.matchId);
}

describe("/api/matchmaker/history 雲端歷史", () => {
	it("auth 停用且無 DB binding 時歷史端點回 404", async () => {
		const disabledEnv = { ...env, ENVIRONMENT: undefined, DB: undefined };

		const res = await app.request(
			"/api/matchmaker/history",
			appRequestInit(undefined, { method: "GET" }),
			disabledEnv,
		);

		expect(res.status).toBe(404);
	});

	it("未登入呼叫歷史端點回 401", async () => {
		const res = await request(undefined, "GET", "/history");

		expect(res.status).toBe(401);
		expect(await res.json()).toEqual({ error: API_ERROR_CODES.UNAUTHORIZED });
	});

	it("B 看不到 A 的歷史且 total 為 0", async () => {
		const cookieA = await seedAndSignIn("history-isolation-a@example.com");
		const cookieB = await seedAndSignIn("history-isolation-b@example.com");
		const idA = await userIdOf("history-isolation-a@example.com");
		await seedHistory(idA, entryAt("a1", 100));
		await seedHistory(idA, entryAt("a2", 200));

		const forB = await getHistory(cookieB);
		const forA = await getHistory(cookieA);

		expect(forB.body).toEqual({ items: [], total: 0, droppedCount: 0 });
		// 對照組：A 自己看得到，證明 B 的空結果來自授權而非資料沒寫進去
		expect(forA.body.total).toBe(2);
		expect(matchIdsOf(forA.body)).toEqual(["a2", "a1"]);
	});

	it("預設依 played_at 由新到舊且同時間依插入順序，asc 為由舊到新", async () => {
		const cookie = await seedAndSignIn("history-order@example.com");
		const cookieOther = await seedAndSignIn("history-order-other@example.com");
		const userId = await userIdOf("history-order@example.com");
		const otherId = await userIdOf("history-order-other@example.com");
		// matchId 字母序刻意與插入順序相反（同時間的 m-b 先於 m-a 插入），擋下以 match_id 或主鍵順序充數的實作
		await seedHistory(userId, entryAt("m-first", 100));
		await seedHistory(userId, entryAt("m-b", 300));
		await seedHistory(otherId, entryAt("other", 250));
		await seedHistory(userId, entryAt("m-a", 300));
		await seedHistory(userId, entryAt("m-last", 200));

		const byDefault = await getHistory(cookie);
		const explicitDesc = await getHistory(cookie, "?order=desc");
		const asc = await getHistory(cookie, "?order=asc");
		const otherView = await getHistory(cookieOther);

		expect(matchIdsOf(byDefault.body)).toEqual(["m-b", "m-a", "m-last", "m-first"]);
		expect(byDefault.body.total).toBe(4);
		expect(byDefault.body.droppedCount).toBe(0);
		expect(byDefault.body.items.map((item) => item.version)).toEqual([1, 1, 1, 1]);
		expect(byDefault.body.items[0].data).toEqual(entryAt("m-b", 300));
		expect(matchIdsOf(explicitDesc.body)).toEqual(["m-b", "m-a", "m-last", "m-first"]);
		expect(matchIdsOf(asc.body)).toEqual(["m-first", "m-last", "m-b", "m-a"]);
		expect(asc.body.total).toBe(4);
		expect(asc.body.droppedCount).toBe(0);
		expect(otherView.body.total).toBe(1);
		expect(matchIdsOf(otherView.body)).toEqual(["other"]);
	});

	it("from 含、to 不含地篩選 played_at，total 仍為全部筆數", async () => {
		const cookie = await seedAndSignIn("history-range@example.com");
		const userId = await userIdOf("history-range@example.com");
		await seedHistory(userId, entryAt("r100", 100));
		await seedHistory(userId, entryAt("r200", 200));
		await seedHistory(userId, entryAt("r300", 300));

		const both = await getHistory(cookie, "?from=200&to=300");
		const fromOnly = await getHistory(cookie, "?from=200");
		const toOnly = await getHistory(cookie, "?to=300");
		const toZero = await getHistory(cookie, "?to=0");
		const fromBeyond = await getHistory(cookie, "?from=301");

		expect(matchIdsOf(both.body)).toEqual(["r200"]);
		expect(both.body.total).toBe(3);
		expect(matchIdsOf(fromOnly.body)).toEqual(["r300", "r200"]);
		expect(fromOnly.body.total).toBe(3);
		expect(matchIdsOf(toOnly.body)).toEqual(["r200", "r100"]);
		expect(toOnly.body.total).toBe(3);
		expect(toZero.body).toEqual({ items: [], total: 3, droppedCount: 0 });
		expect(fromBeyond.body).toEqual({ items: [], total: 3, droppedCount: 0 });
	});

	it("from 等於 to 時回 200、items 為空且 total 為全部筆數", async () => {
		const cookie = await seedAndSignIn("history-empty-range@example.com");
		const userId = await userIdOf("history-empty-range@example.com");
		await seedHistory(userId, entryAt("e100", 100));
		await seedHistory(userId, entryAt("e200", 200));
		await seedHistory(userId, entryAt("e300", 300));

		const res = await request(cookie, "GET", "/history?from=200&to=200");

		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ items: [], total: 3, droppedCount: 0 });
	});

	it("from、to 或 order 不合法時回 400", async () => {
		const cookie = await seedAndSignIn("history-invalid@example.com");
		const userId = await userIdOf("history-invalid@example.com");
		await seedHistory(userId, entryAt("v1", 100));
		const invalidQueries = ["?from=abc", "?from=-1", "?from=300&to=200", "?order=random", "?from="];

		for (const query of invalidQueries) {
			const res = await request(cookie, "GET", `/history${query}`);

			expect(res.status, query).toBe(400);
			expect(await res.json(), query).toEqual({ error: API_ERROR_CODES.INVALID_BODY });
		}
	});

	it("不合 schema 的歷史列被略過並計入 droppedCount 且不被刪除", async () => {
		const cookie = await seedAndSignIn("history-corrupt@example.com");
		const userId = await userIdOf("history-corrupt@example.com");
		const { winner: _winner, ...withoutWinner } = entryAt("broken", 150);
		const brokenData = JSON.stringify(withoutWinner);
		if (!env.DB) {
			throw new Error("D1 binding DB 不存在");
		}
		await env.DB.prepare(
			"INSERT INTO matchmaker_history (user_id, match_id, played_at, data, version, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
		)
			.bind(userId, "broken", 150, brokenData, 1, 1_700_000_000_000)
			.run();
		await seedHistory(userId, entryAt("good", 100));

		const first = await getHistory(cookie);
		const second = await getHistory(cookie);
		// 損毀列落在範圍外時不計入 droppedCount；total 仍為全部筆數
		const outsideRange = await getHistory(cookie, "?to=120");

		expect(matchIdsOf(first.body)).toEqual(["good"]);
		expect(first.body.droppedCount).toBe(1);
		expect(first.body.total).toBe(2);
		expect(second.body).toEqual(first.body);
		expect(outsideRange.body.droppedCount).toBe(0);
		expect(outsideRange.body.total).toBe(2);
		expect(matchIdsOf(outsideRange.body)).toEqual(["good"]);
		const rows = await rowsOf("matchmaker_history", userId);
		expect(rows).toHaveLength(2);
		expect(rows.find((row) => row.match_id === "broken")?.data).toBe(brokenData);
	});

	it("data 不是合法 JSON 的歷史列同樣被略過並計數而不使端點失敗", async () => {
		const cookie = await seedAndSignIn("history-not-json@example.com");
		const userId = await userIdOf("history-not-json@example.com");
		const notJson = "{not json";
		if (!env.DB) {
			throw new Error("D1 binding DB 不存在");
		}
		await env.DB.prepare(
			"INSERT INTO matchmaker_history (user_id, match_id, played_at, data, version, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
		)
			.bind(userId, "not-json", 150, notJson, 1, 1_700_000_000_000)
			.run();
		await seedHistory(userId, entryAt("good", 100));

		const res = await request(cookie, "GET", "/history");

		expect(res.status).toBe(200);
		const body = (await res.json()) as HistoryListBody;
		expect(matchIdsOf(body)).toEqual(["good"]);
		expect(body.droppedCount).toBe(1);
		expect(body.total).toBe(2);
		const rows = await rowsOf("matchmaker_history", userId);
		expect(rows).toHaveLength(2);
		expect(rows.find((row) => row.match_id === "not-json")?.data).toBe(notJson);
	});
});
