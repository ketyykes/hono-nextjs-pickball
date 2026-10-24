import { describe, expect, it } from "vitest";
import { makeMatch, makeRound, makeSlot, request, rowsOf, seedAndSignIn, seedRound } from "./helpers/matchmaker-fixtures";
import { userIdOf } from "./helpers/session";

interface SlotItem {
	data: { matchId: string; scores: { us: number; them: number } };
	version: number;
}

describe("/api/matchmaker/slots", () => {
	it("分槽只能為目前回合中未完成的場次建立", async () => {
		const cookie = await seedAndSignIn("ms-create@example.com");
		const userId = await userIdOf("ms-create@example.com");
		await seedRound(userId, makeRound([makeMatch("m1"), makeMatch("m2", "completed")]));

		const m1 = await request(cookie, "PUT", "/slots/m1", { data: makeSlot("m1"), version: 0 });
		const m2 = await request(cookie, "PUT", "/slots/m2", { data: makeSlot("m2"), version: 0 });
		const m9 = await request(cookie, "PUT", "/slots/m9", { data: makeSlot("m9"), version: 0 });
		const m1Again = await request(cookie, "PUT", "/slots/m1", { data: makeSlot("m1", 5), version: 0 });

		expect(m1.status).toBe(200);
		expect(((await m1.json()) as SlotItem).version).toBe(1);
		expect(m2.status).toBe(409);
		expect(await m2.json()).toEqual({ error: "VERSION_CONFLICT" });
		expect(m9.status).toBe(409);
		// 已存在的分槽以 version 0 再建立：維持 ensure 語意，不覆蓋
		expect(m1Again.status).toBe(409);
		const rows = await rowsOf("matchmaker_match_slots", userId);
		expect(rows.map((row) => row.match_id)).toEqual(["m1"]);
		const stored = (await (await request(cookie, "GET", "/slots/m1")).json()) as SlotItem;
		expect(stored.data.scores.us).toBe(0);
	});

	it("分槽寫入並回傳驗證後的輸出（含 schema 補上的預設值）", async () => {
		const cookie = await seedAndSignIn("ms-defaults@example.com");
		const userId = await userIdOf("ms-defaults@example.com");
		await seedRound(userId, makeRound([makeMatch("m1")]));
		// 模擬舊版資料：缺少後來才加入、帶 default 的欄位
		const { courtNumber: _omitted, ...withoutCourtNumber } = makeSlot("m1");

		const created = await request(cookie, "PUT", "/slots/m1", { data: withoutCourtNumber, version: 0 });
		const updated = await request(cookie, "PUT", "/slots/m1", { data: withoutCourtNumber, version: 1 });
		const stored = (await (await request(cookie, "GET", "/slots/m1")).json()) as SlotItem & {
			data: { courtNumber: number | null };
		};

		expect(((await created.json()) as { data: { courtNumber: unknown } }).data.courtNumber).toBeNull();
		expect(((await updated.json()) as { data: { courtNumber: unknown } }).data.courtNumber).toBeNull();
		expect(stored.data.courtNumber).toBeNull();
	});

	it("分槽沒有回合時建立回 409", async () => {
		const cookie = await seedAndSignIn("ms-noround@example.com");

		const res = await request(cookie, "PUT", "/slots/m1", { data: makeSlot("m1"), version: 0 });

		expect(res.status).toBe(409);
		expect(await (await request(cookie, "GET", "/slots")).json()).toEqual({ items: [] });
	});

	it("分槽依版本更新並可單筆或整份讀取", async () => {
		const cookie = await seedAndSignIn("ms-update@example.com");
		const userId = await userIdOf("ms-update@example.com");
		await seedRound(userId, makeRound([makeMatch("m1"), makeMatch("m2"), makeMatch("m3")]));
		// 刻意倒序建立，驗證 GET /slots 依 match_id 排序而非建立順序
		expect((await request(cookie, "PUT", "/slots/m3", { data: makeSlot("m3"), version: 0 })).status).toBe(200);
		expect((await request(cookie, "PUT", "/slots/m1", { data: makeSlot("m1"), version: 0 })).status).toBe(200);
		expect((await request(cookie, "PUT", "/slots/m2", { data: makeSlot("m2"), version: 0 })).status).toBe(200);

		const updated = await request(cookie, "PUT", "/slots/m1", { data: makeSlot("m1", 4), version: 1 });
		const stale = await request(cookie, "PUT", "/slots/m1", { data: makeSlot("m1", 8), version: 1 });
		const single = await request(cookie, "GET", "/slots/m1");
		const list = await request(cookie, "GET", "/slots");
		const missing = await request(cookie, "GET", "/slots/zz");

		expect(updated.status).toBe(200);
		expect(await updated.json()).toEqual({ data: makeSlot("m1", 4), version: 2 });
		expect(stale.status).toBe(409);
		expect(await single.json()).toEqual({ data: makeSlot("m1", 4), version: 2 });
		expect(await list.json()).toEqual({
			items: [
				{ data: makeSlot("m1", 4), version: 2 },
				{ data: makeSlot("m2"), version: 1 },
				{ data: makeSlot("m3"), version: 1 },
			],
		});
		expect(missing.status).toBe(200);
		expect(await missing.json()).toEqual({ data: null, version: 0 });
	});

	it("分槽以 version 大於 0 更新不存在的分槽時回 409", async () => {
		const cookie = await seedAndSignIn("ms-ghost@example.com");
		const userId = await userIdOf("ms-ghost@example.com");
		await seedRound(userId, makeRound([makeMatch("m1")]));

		const res = await request(cookie, "PUT", "/slots/m1", { data: makeSlot("m1"), version: 1 });

		expect(res.status).toBe(409);
		expect(await rowsOf("matchmaker_match_slots", userId)).toEqual([]);
	});

	it("分槽的 matchId 與 path 不一致或資料不合法時回 400", async () => {
		const cookie = await seedAndSignIn("ms-invalid@example.com");
		const userId = await userIdOf("ms-invalid@example.com");
		await seedRound(userId, makeRound([makeMatch("m1"), makeMatch("m2")]));

		const mismatch = await request(cookie, "PUT", "/slots/m1", { data: makeSlot("m2"), version: 0 });
		const nullMatchId = await request(cookie, "PUT", "/slots/m1", { data: makeSlot(null), version: 0 });
		const badData = await request(cookie, "PUT", "/slots/m1", { data: { matchId: "m1", mode: "triples" }, version: 0 });

		for (const res of [mismatch, nullMatchId, badData]) {
			expect(res.status).toBe(400);
			expect(await res.json()).toEqual({ error: "INVALID_BODY" });
		}
		expect(await rowsOf("matchmaker_match_slots", userId)).toEqual([]);
	});

	it("分槽的 matchId 不一致時 version 大於 0 的更新同樣回 400 且不寫入", async () => {
		const cookie = await seedAndSignIn("ms-mismatch-update@example.com");
		const userId = await userIdOf("ms-mismatch-update@example.com");
		await seedRound(userId, makeRound([makeMatch("m1"), makeMatch("m2")]));
		expect((await request(cookie, "PUT", "/slots/m1", { data: makeSlot("m1"), version: 0 })).status).toBe(200);
		expect((await request(cookie, "PUT", "/slots/m2", { data: makeSlot("m2"), version: 0 })).status).toBe(200);

		const res = await request(cookie, "PUT", "/slots/m1", { data: makeSlot("m2", 7), version: 1 });

		expect(res.status).toBe(400);
		const items = ((await (await request(cookie, "GET", "/slots")).json()) as { items: SlotItem[] }).items;
		expect(items.map((item) => [item.data.matchId, item.data.scores.us, item.version])).toEqual([
			["m1", 0, 1],
			["m2", 0, 1],
		]);
	});
});
