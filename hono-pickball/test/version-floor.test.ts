import "../src/index";
import type { Player } from "@pickball/core/matchmaker/types";
import { describe, expect, it } from "vitest";
import { makeMatch, makeRound, request, rowsOf, seedAndSignIn } from "./helpers/matchmaker-fixtures";
import { userIdOf } from "./helpers/session";

interface Versioned<T> {
	data: T;
	version: number;
}

function makePlayer(id: string, name = `球友 ${id}`): Player {
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
	};
}

async function bodyOf<T>(res: Response): Promise<T> {
	return (await res.json()) as T;
}

describe("版本下限", () => {
	it("重置後重建的回合版本大於重置前且持舊版本的 PUT 回 409", async () => {
		const email = "vf-round@example.com";
		const cookie = await seedAndSignIn(email);
		const r1 = makeRound([makeMatch("m1")], 1);
		const r2 = makeRound([makeMatch("m2")], 2);

		// 回合建立後再更新一次，目前 version 為 2
		expect((await request(cookie, "PUT", "/round", { data: r1, version: 0 })).status).toBe(200);
		expect((await request(cookie, "PUT", "/round", { data: r1, version: 1 })).status).toBe(200);
		expect((await request(cookie, "POST", "/reset")).status).toBe(204);

		const rebuilt = await request(cookie, "PUT", "/round", { data: r2, version: 0 });
		expect(rebuilt.status).toBe(200);
		expect((await bodyOf<Versioned<unknown>>(rebuilt)).version).toBe(3);

		for (const staleVersion of [1, 2]) {
			const stale = await request(cookie, "PUT", "/round", { data: r1, version: staleVersion });
			expect(stale.status).toBe(409);
			expect(await stale.json()).toEqual({ error: "VERSION_CONFLICT" });
		}
		const current = await bodyOf<Versioned<unknown>>(await request(cookie, "GET", "/round"));
		expect(current).toEqual({ data: r2, version: 3 });
	});

	it("沒有任何資料時重置仍回 204 且之後建立的版本為 1", async () => {
		const email = "vf-empty@example.com";
		const cookie = await seedAndSignIn(email);
		const userId = await userIdOf(email);

		expect((await request(cookie, "POST", "/reset")).status).toBe(204);

		const round = await request(cookie, "PUT", "/round", { data: makeRound([makeMatch("m1")]), version: 0 });
		const player = await request(cookie, "PUT", "/players/p1", { data: makePlayer("p1"), version: 0 });
		expect((await bodyOf<Versioned<unknown>>(round)).version).toBe(1);
		expect((await bodyOf<Versioned<unknown>>(player)).version).toBe(1);
		expect(await rowsOf("sync_version_floors", userId)).toEqual([]);
	});

	it("一位使用者的重置不影響其他使用者的建立版本", async () => {
		const cookieA = await seedAndSignIn("vf-isolation-a@example.com");
		const cookieB = await seedAndSignIn("vf-isolation-b@example.com");
		const idB = await userIdOf("vf-isolation-b@example.com");
		const round = makeRound([makeMatch("m1")]);

		await request(cookieA, "PUT", "/round", { data: round, version: 0 });
		await request(cookieA, "PUT", "/round", { data: round, version: 1 });
		await request(cookieA, "PUT", "/round", { data: round, version: 2 });
		expect((await request(cookieA, "POST", "/reset")).status).toBe(204);

		const bRound = await request(cookieB, "PUT", "/round", { data: round, version: 0 });
		const bPlayer = await request(cookieB, "PUT", "/players/p1", { data: makePlayer("p1"), version: 0 });
		expect((await bodyOf<Versioned<unknown>>(bRound)).version).toBe(1);
		expect((await bodyOf<Versioned<unknown>>(bPlayer)).version).toBe(1);
		expect(await rowsOf("sync_version_floors", idB)).toEqual([]);
	});

	it("重置後以 version 0 重建同 id 的參賽者版本大於重置前且持舊版本的 PUT 回 409", async () => {
		const cookie = await seedAndSignIn("vf-player@example.com");
		const original = makePlayer("p1", "舊");
		const rebuilt = makePlayer("p1", "重建");

		// p1 建立後更新兩次成為 version 3，p2 維持 version 1
		await request(cookie, "PUT", "/players/p1", { data: original, version: 0 });
		await request(cookie, "PUT", "/players/p1", { data: original, version: 1 });
		await request(cookie, "PUT", "/players/p1", { data: original, version: 2 });
		await request(cookie, "PUT", "/players/p2", { data: makePlayer("p2"), version: 0 });
		expect((await request(cookie, "POST", "/reset")).status).toBe(204);

		const created = await request(cookie, "PUT", "/players/p1", { data: rebuilt, version: 0 });
		expect(created.status).toBe(200);
		expect((await bodyOf<Versioned<Player>>(created)).version).toBe(4);
		const stale = await request(cookie, "PUT", "/players/p1", { data: original, version: 3 });
		expect(stale.status).toBe(409);
		expect(await stale.json()).toEqual({ error: "VERSION_CONFLICT" });
		const listed = await bodyOf<{ items: Versioned<Player>[] }>(await request(cookie, "GET", "/players"));
		expect(listed.items).toEqual([{ data: rebuilt, version: 4 }]);
	});
});
