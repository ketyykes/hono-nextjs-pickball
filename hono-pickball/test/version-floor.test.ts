import { exports } from "cloudflare:workers";
import type { LocalImportRequest } from "@pickball/core/api/import";
import type { MatchHistoryEntry } from "@pickball/core/matchmaker/history";
import type { Player } from "@pickball/core/matchmaker/types";
import { createInitialState } from "@pickball/core/scoreboard/reducer";
import type { ScoreboardState } from "@pickball/core/scoreboard/types";
import { describe, expect, it } from "vitest";
import "../src/index";
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
	seedRound,
	seedSlot,
} from "./helpers/matchmaker-fixtures";
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

function historyAt(matchId: string, playedAt: string): MatchHistoryEntry {
	return { ...makeHistoryEntry(matchId), playedAt };
}

function standaloneScoreboard(us: number, them: number): ScoreboardState {
	return { ...createInitialState(), scores: { us, them } };
}

// 與 local-import.test.ts 的同名函式相同；那邊是檔內私有，這裡複製而不是為了共用去改既有測試檔。
// 參賽者含 m1 兩隊的選手 m1-a、m1-b，送出比分才走得到版本檢查。
function makePayload(): LocalImportRequest {
	return {
		version: 1,
		players: [makePlayer("m1-a", "甲"), makePlayer("m1-b", "乙"), makePlayer("p-c", "丙")],
		currentRound: makeRound([makeMatch("m1")]),
		history: [historyAt("h1", "2026-01-01T00:10:00.000Z")],
		scoreboard: { current: standaloneScoreboard(7, 3), matches: [makeSlot("m1", 5)] },
	};
}

function postImport(cookie: string, body: unknown): Promise<Response> {
	return exports.default.fetch(new Request(`${origin}/api/import`, appRequestInit(cookie, { method: "POST", body })));
}

async function bodyOf<T>(res: Response): Promise<T> {
	return (await res.json()) as T;
}

describe("版本下限", () => {
	it("重置後重建的回合版本大於重置前且持舊版本的 PUT 回 409，再重置後匯入的歷史與獨立計分板版本仍為 1", async () => {
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

		// 下限只套用在可重建的版本化表：再重置後匯入，歷史與獨立計分板仍從 1 起算
		expect((await request(cookie, "POST", "/reset")).status).toBe(204);
		const userId = await userIdOf(email);
		const imported = await postImport(cookie, {
			...makePayload(),
			players: [makePlayer("p-x")],
			currentRound: null,
			scoreboard: { current: standaloneScoreboard(7, 3), matches: [] },
		});
		expect(imported.status).toBe(200);
		expect((await rowsOf("matchmaker_players", userId)).map((row) => row.version)).toEqual([4]);
		expect((await rowsOf("matchmaker_history", userId)).map((row) => row.version)).toEqual([1]);
		expect((await rowsOf("scoreboard_current", userId)).map((row) => row.version)).toEqual([1]);
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

	it("其他使用者有較高版本的資料時重置只依本人的資料提高下限", async () => {
		const emailA = "vf-own-floor-a@example.com";
		const emailB = "vf-own-floor-b@example.com";
		const cookieA = await seedAndSignIn(emailA);
		const cookieB = await seedAndSignIn(emailB);
		const idA = await userIdOf(emailA);
		const idB = await userIdOf(emailB);
		const round = makeRound([makeMatch("m1")]);

		// B 三張表的版本各不相同且都高於 A，任一表的選取漏掉 user_id 都會讓 A 的下限變成該表的值
		for (let version = 0; version < 5; version += 1) {
			await request(cookieB, "PUT", "/players/p1", { data: makePlayer("p1"), version });
		}
		await seedRound(idB, round, 6);
		await seedSlot(idB, makeSlot("m1"), 7);

		// A 的參賽者 version 2、回合與分槽 version 1，重置後下限應為 2
		await request(cookieA, "PUT", "/players/p1", { data: makePlayer("p1"), version: 0 });
		await request(cookieA, "PUT", "/players/p1", { data: makePlayer("p1"), version: 1 });
		await request(cookieA, "PUT", "/round", { data: round, version: 0 });
		await request(cookieA, "PUT", "/slots/m1", { data: makeSlot("m1"), version: 0 });
		expect((await request(cookieA, "POST", "/reset")).status).toBe(204);

		expect((await rowsOf("sync_version_floors", idA)).map((row) => row.version)).toEqual([2]);
		const rebuiltRound = await request(cookieA, "PUT", "/round", { data: round, version: 0 });
		const rebuiltPlayer = await request(cookieA, "PUT", "/players/p1", { data: makePlayer("p1"), version: 0 });
		const rebuiltSlot = await request(cookieA, "PUT", "/slots/m1", { data: makeSlot("m1"), version: 0 });
		expect((await bodyOf<Versioned<unknown>>(rebuiltRound)).version).toBe(3);
		expect((await bodyOf<Versioned<unknown>>(rebuiltPlayer)).version).toBe(3);
		expect((await bodyOf<Versioned<unknown>>(rebuiltSlot)).version).toBe(3);

		// B 的資料與下限都不受 A 的重置影響
		expect((await rowsOf("matchmaker_players", idB)).map((row) => row.version)).toEqual([5]);
		expect((await rowsOf("matchmaker_round", idB)).map((row) => row.version)).toEqual([6]);
		expect((await rowsOf("matchmaker_match_slots", idB)).map((row) => row.version)).toEqual([7]);
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

	it("重置後批次附加同 id 的參賽者回應實際版本且持舊版本的 PUT 回 409", async () => {
		const cookie = await seedAndSignIn("vf-player-import@example.com");
		const original = makePlayer("p1", "舊");

		await request(cookie, "PUT", "/players/p1", { data: original, version: 0 });
		await request(cookie, "PUT", "/players/p1", { data: original, version: 1 });
		expect((await request(cookie, "POST", "/reset")).status).toBe(204);

		const appended = [makePlayer("p1", "重建"), makePlayer("p2")];
		const imported = await request(cookie, "POST", "/players/import", { players: appended });
		expect(imported.status).toBe(200);
		const importedItems = (await bodyOf<{ items: Versioned<Player>[] }>(imported)).items;
		expect(importedItems.map((item) => item.version)).toEqual([3, 3]);

		const listed = await bodyOf<{ items: Versioned<Player>[] }>(await request(cookie, "GET", "/players"));
		expect(listed.items).toEqual(importedItems);
		for (const staleVersion of [1, 2]) {
			const stale = await request(cookie, "PUT", "/players/p1", { data: original, version: staleVersion });
			expect(stale.status).toBe(409);
			expect(await stale.json()).toEqual({ error: "VERSION_CONFLICT" });
		}
	});

	it("重置後重建同場次的分槽版本大於重置前且持舊版本的 PUT 回 409", async () => {
		const cookie = await seedAndSignIn("vf-slot@example.com");
		const round = makeRound([makeMatch("m1")]);

		// 回合 version 1，m1 分槽建立後更新成 version 2
		await request(cookie, "PUT", "/round", { data: round, version: 0 });
		await request(cookie, "PUT", "/slots/m1", { data: makeSlot("m1"), version: 0 });
		await request(cookie, "PUT", "/slots/m1", { data: makeSlot("m1", 1), version: 1 });
		expect((await request(cookie, "POST", "/reset")).status).toBe(204);

		const rebuiltRound = await request(cookie, "PUT", "/round", { data: round, version: 0 });
		expect((await bodyOf<Versioned<unknown>>(rebuiltRound)).version).toBe(3);
		const rebuiltSlot = makeSlot("m1", 4);
		const created = await request(cookie, "PUT", "/slots/m1", { data: rebuiltSlot, version: 0 });
		expect(created.status).toBe(200);
		expect((await bodyOf<Versioned<unknown>>(created)).version).toBe(3);

		for (const staleVersion of [1, 2]) {
			const stale = await request(cookie, "PUT", "/slots/m1", { data: makeSlot("m1", 9), version: staleVersion });
			expect(stale.status).toBe(409);
			expect(await stale.json()).toEqual({ error: "VERSION_CONFLICT" });
		}
		const current = await bodyOf<Versioned<unknown>>(await request(cookie, "GET", "/slots/m1"));
		expect(current).toEqual({ data: rebuiltSlot, version: 3 });
	});

	it("重置後重新匯入同一份本機資料時持舊版本的寫入皆回 409", async () => {
		const email = "vf-import@example.com";
		const cookie = await seedAndSignIn(email);
		const userId = await userIdOf(email);
		const payload = makePayload();

		const first = await postImport(cookie, payload);
		expect(first.status).toBe(200);
		expect((await request(cookie, "POST", "/reset")).status).toBe(204);
		const second = await postImport(cookie, payload);
		expect(second.status).toBe(200);
		expect((await bodyOf<{ imported: { scoreboardCurrent: string } }>(second)).imported.scoreboardCurrent).toBe("skipped");

		const versionsOf = async (table: string) => (await rowsOf(table, userId)).map((row) => row.version);
		expect(await versionsOf("matchmaker_players")).toEqual([2, 2, 2]);
		expect(await versionsOf("matchmaker_round")).toEqual([2]);
		expect(await versionsOf("matchmaker_match_slots")).toEqual([2]);
		expect(await versionsOf("matchmaker_history")).toEqual([1]);
		expect(await versionsOf("scoreboard_current")).toEqual([1]);
		const before = {
			players: await rowsOf("matchmaker_players", userId),
			round: await rowsOf("matchmaker_round", userId),
			slots: await rowsOf("matchmaker_match_slots", userId),
			history: await rowsOf("matchmaker_history", userId),
		};

		// 另一台裝置在第一次匯入後讀到的版本都是 1
		const staleResponses = [
			await request(cookie, "PUT", "/players/m1-a", { data: makePlayer("m1-a", "舊"), version: 1 }),
			await request(cookie, "PUT", "/round", { data: makeRound([makeMatch("m9")]), version: 1 }),
			await request(cookie, "PUT", "/slots/m1", { data: makeSlot("m1", 9), version: 1 }),
			await request(cookie, "POST", "/round/matches/m1/score", { scoreA: "11", scoreB: "7", roundVersion: 1 }),
		];
		expect(staleResponses.map((res) => res.status)).toEqual([409, 409, 409, 409]);
		expect({
			players: await rowsOf("matchmaker_players", userId),
			round: await rowsOf("matchmaker_round", userId),
			slots: await rowsOf("matchmaker_match_slots", userId),
			history: await rowsOf("matchmaker_history", userId),
		}).toEqual(before);
	});
});
