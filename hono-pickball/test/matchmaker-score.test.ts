import { env } from "cloudflare:workers";
import { SubmitScoreResponseSchema } from "@pickball/core/api/round";
import type { Round, RoundMatch } from "@pickball/core/matchmaker/round-types";
import { updateRatings } from "@pickball/core/matchmaker/rating";
import { submitScore } from "@pickball/core/matchmaker/round";
import type { Player } from "@pickball/core/matchmaker/types";
import { describe, expect, it } from "vitest";
import { getDb } from "../src/db/client";
import { matchmakerPlayers } from "../src/db/schema";
import {
	makeHistoryEntry,
	makeMatch,
	makeRound,
	makeSlot,
	request,
	rowsOf,
	seedAndSignIn,
	seedHistory,
	seedRound,
	seedSlot,
} from "./helpers/matchmaker-fixtures";
import { userIdOf } from "./helpers/session";

const NOW = new Date(1_700_000_000_000);
const TABLES = [
	"matchmaker_players",
	"matchmaker_round",
	"matchmaker_history",
	"matchmaker_match_slots",
	"sync_batch_guards",
] as const;

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

async function seedPlayers(userId: string, players: Player[], version = 1): Promise<void> {
	await getDb(env)
		.insert(matchmakerPlayers)
		.values(
			players.map((player, index) => ({
				userId,
				id: player.id,
				data: player,
				sortOrder: index,
				version,
				updatedAt: NOW,
			})),
		);
}

function doublesMatch(id: string, ids: [string, string, string, string]): RoundMatch {
	return {
		...makeMatch(id),
		format: "doubles",
		teams: [
			{ playerIds: [ids[0], ids[1]], rating: 8 },
			{ playerIds: [ids[2], ids[3]], rating: 8 },
		],
		playerRatings: ids.map((playerId) => ({ playerId, before: 4, after: null })),
	};
}

type Snapshot = Record<(typeof TABLES)[number], Array<Record<string, unknown>>>;

async function snapshot(userId: string): Promise<Snapshot> {
	const entries = await Promise.all(TABLES.map(async (table) => [table, await rowsOf(table, userId)] as const));
	return Object.fromEntries(entries) as Snapshot;
}

function scoreBody(roundVersion: number, scoreA = "11", scoreB = "7") {
	return { scoreA, scoreB, roundVersion };
}

function postScore(cookie: string | undefined, matchId: string, body: unknown, query = ""): Promise<Response> {
	return request(cookie, "POST", `/round/matches/${matchId}/score${query}`, body);
}

/** 單打場次 m1（球員 m1-a、m1-b）加上另一場 m2 的分槽；回傳 userId 與 cookie。 */
async function setupSingles(
	email: string,
	options: { roundVersion?: number; timer?: Round["timer"]; extraPlayers?: Player[] } = {},
): Promise<{ cookie: string; userId: string; round: Round }> {
	const cookie = await seedAndSignIn(email);
	const userId = await userIdOf(email);
	const round = { ...makeRound([makeMatch("m1"), makeMatch("m2")]), timer: options.timer ?? null };
	await seedPlayers(userId, [makePlayer("m1-a"), makePlayer("m1-b"), ...(options.extraPlayers ?? [])]);
	await seedRound(userId, round, options.roundVersion ?? 3);
	await seedSlot(userId, makeSlot("m1", 2));
	await seedSlot(userId, makeSlot("m2", 5));
	return { cookie, userId, round };
}

describe("POST /api/matchmaker/round/matches/:matchId/score", () => {
	it("送出比分在單一 batch 內更新評分、回合與歷史並刪除該場分槽", async () => {
		const cookie = await seedAndSignIn("ms-golden@example.com");
		const userId = await userIdOf("ms-golden@example.com");
		const players = [
			makePlayer("p1", { rating: 4, gamesPlayed: 0 }),
			makePlayer("p2", { rating: 4.5, gamesPlayed: 3 }),
			makePlayer("p3", { rating: 3.5, gamesPlayed: 10 }),
			makePlayer("p4", { rating: 5, gamesPlayed: 5 }),
			makePlayer("p5", { rating: 6, gamesPlayed: 7 }),
		];
		const round = { ...makeRound([doublesMatch("m1", ["p1", "p2", "p3", "p4"]), makeMatch("m2")]), format: "doubles" as const };
		await seedPlayers(userId, players);
		await seedRound(userId, round, 3);
		await seedSlot(userId, makeSlot("m1", 2));
		await seedSlot(userId, makeSlot("m2", 5));
		// 另一位使用者有相同的球員 id、場次 id 與版本：任何缺少 user_id 條件的陳述式都會誤傷他
		await seedAndSignIn("ms-golden-bystander@example.com");
		const otherId = await userIdOf("ms-golden-bystander@example.com");
		await seedPlayers(otherId, players.slice(0, 4).map((player) => makePlayer(player.id)));
		await seedRound(otherId, round, 3);
		await seedSlot(otherId, makeSlot("m1", 2));
		await seedHistory(otherId, makeHistoryEntry("m1"));
		const otherBefore = await snapshot(otherId);
		const before = Date.now();

		const res = await postScore(cookie, "m1", scoreBody(3));

		expect(res.status).toBe(200);
		expect(await snapshot(otherId)).toEqual(otherBefore);
		const body = SubmitScoreResponseSchema.parse(await res.json());
		const expected = submitScore({
			round,
			players,
			matchId: "m1",
			rawScoreA: "11",
			rawScoreB: "7",
			now: body.historyEntry.playedAt,
		});
		if (!expected.ok) {
			throw new Error("核心 submitScore 應成功");
		}
		expect(body.round.version).toBe(4);
		expect(body.round.data).toEqual(expected.round);
		expect(body.round.data.matches.find((match) => match.id === "m1")?.status).toBe("completed");
		expect(body.players.map((player) => player.data.id)).toEqual(["p1", "p2", "p3", "p4"]);
		const after = await snapshot(userId);
		const dbPlayers = after.matchmaker_players.map((row) => ({
			id: row.id,
			data: JSON.parse(row.data as string) as Player,
			version: row.version,
			updatedAt: row.updated_at as number,
		}));
		for (const patch of expected.playerPatches) {
			const row = dbPlayers.find((player) => player.id === patch.id);
			const original = players.find((player) => player.id === patch.id) as Player;
			expect(row?.data.rating).toBe(patch.rating);
			expect(row?.data.gamesPlayed).toBe(original.gamesPlayed + 1);
			expect(row?.version).toBe(2);
			expect(row?.updatedAt).toBeGreaterThanOrEqual(before);
			expect(body.players.find((player) => player.data.id === patch.id)).toEqual({ data: row?.data, version: 2 });
		}
		// 未參賽者與其他欄位完全不動
		const bystander = dbPlayers.find((player) => player.id === "p5");
		expect(bystander).toEqual({ id: "p5", data: players[4], version: 1, updatedAt: NOW.getTime() });
		expect(JSON.parse(after.matchmaker_round[0].data as string)).toEqual(expected.round);
		expect(after.matchmaker_round[0].version).toBe(4);
		expect(after.matchmaker_round[0].updated_at as number).toBeGreaterThanOrEqual(before);
		expect(after.matchmaker_history).toHaveLength(1);
		expect(after.matchmaker_history[0].match_id).toBe("m1");
		expect(after.matchmaker_history[0].updated_at as number).toBeGreaterThanOrEqual(before);
		expect(after.matchmaker_match_slots.map((row) => row.match_id)).toEqual(["m2"]);
		expect(after.sync_batch_guards).toEqual([]);
	});

	it("計時回合的平局在雲端送出後 winner 為 draw 且評分以 S 等於 0.5 計算", async () => {
		const { cookie, userId } = await setupSingles("ms-draw@example.com", {
			timer: { durationMinutes: 10, startedAt: null },
		});
		// 讓兩人 rating 不同，平局時 S=0.5 才會使高分者下降、低分者上升
		await getDb(env).delete(matchmakerPlayers);
		await seedPlayers(userId, [makePlayer("m1-a", { rating: 5 }), makePlayer("m1-b", { rating: 3 })]);

		const res = await postScore(cookie, "m1", scoreBody(3, "9", "9"));

		expect(res.status).toBe(200);
		const body = SubmitScoreResponseSchema.parse(await res.json());
		const match = body.round.data.matches.find((m) => m.id === "m1");
		expect(match?.winner).toBe("draw");
		expect(body.historyEntry.winner).toBe("draw");
		const rows = await rowsOf("matchmaker_history", userId);
		expect((JSON.parse(rows[0].data as string) as { winner: string }).winner).toBe("draw");
		const expected = updateRatings({
			format: "singles",
			teams: [[{ id: "m1-a", rating: 5, gamesPlayed: 0 }], [{ id: "m1-b", rating: 3, gamesPlayed: 0 }]],
			winnerIndex: "draw",
		});
		const afterByPlayer = Object.fromEntries(body.players.map((player) => [player.data.id, player.data.rating]));
		expect(afterByPlayer).toEqual(Object.fromEntries(expected.changes.map((change) => [change.id, change.after])));
		expect(afterByPlayer["m1-a"]).toBeLessThan(5);
		expect(afterByPlayer["m1-b"]).toBeGreaterThan(3);
	});

	it("roundVersion 不符時回 409 且名單、回合、歷史與分槽皆不變", async () => {
		const { cookie, userId } = await setupSingles("ms-stale@example.com");
		await seedHistory(userId, makeHistoryEntry("old"));
		const before = await snapshot(userId);

		const res = await postScore(cookie, "m1", scoreBody(2));

		expect(res.status).toBe(409);
		expect(await res.json()).toEqual({ error: "VERSION_CONFLICT" });
		expect(await snapshot(userId)).toEqual(before);
	});

	it("計算後任一參與球員版本變動時整批守衛使 batch 不寫入任何資料", async () => {
		const { submitScoreForUser } = await import("../src/matchmaker/score-repository");
		const ids = ["p1", "p2", "p3", "p4"] as const;
		// 四位參與球員逐一被改動，每一位都必須使守衛失敗
		for (const target of ids) {
			const email = `ms-guard-player-${target}@example.com`;
			const cookie = await seedAndSignIn(email);
			const userId = await userIdOf(email);
			void cookie;
			await seedPlayers(userId, [...ids.map((id) => makePlayer(id)), makePlayer("p5")]);
			await seedRound(
				userId,
				{ ...makeRound([doublesMatch("m1", ["p1", "p2", "p3", "p4"])]), format: "doubles" },
				3,
			);
			await seedSlot(userId, makeSlot("m1"));
			let afterReadCalled = false;

			const result = await submitScoreForUser(
				getDb(env),
				userId,
				{ matchId: "m1", scoreA: "11", scoreB: "7", roundVersion: 3 },
				{
					afterRead: async () => {
						afterReadCalled = true;
						await env.DB?.prepare("UPDATE matchmaker_players SET version = 2 WHERE user_id = ? AND id = ?")
							.bind(userId, target)
							.run();
					},
				},
			);

			expect(afterReadCalled).toBe(true);
			expect(result.kind).toBe("conflict");
			const after = await snapshot(userId);
			expect(after.matchmaker_players.map((row) => [row.id, row.version])).toEqual(
				[...ids.map((id): [string, number] => [id, id === target ? 2 : 1]), ["p5", 1]],
			);
			// 所有名單的 data 都沒有被寫入新 rating 或 gamesPlayed
			for (const row of after.matchmaker_players) {
				expect(JSON.parse(row.data as string)).toEqual(makePlayer(row.id as string));
			}
			expect(after.matchmaker_round[0].version).toBe(3);
			expect(after.matchmaker_history).toEqual([]);
			expect(after.matchmaker_match_slots.map((row) => row.match_id)).toEqual(["m1"]);
			expect(after.sync_batch_guards).toEqual([]);
		}
	});

	it("計算後回合被刪除時整批守衛使 batch 不寫入任何資料", async () => {
		const { submitScoreForUser } = await import("../src/matchmaker/score-repository");
		const { userId } = await setupSingles("ms-guard-deleted@example.com");

		const result = await submitScoreForUser(
			getDb(env),
			userId,
			{ matchId: "m1", scoreA: "11", scoreB: "7", roundVersion: 3 },
			{
				afterRead: async () => {
					await env.DB?.prepare("DELETE FROM matchmaker_round WHERE user_id = ?").bind(userId).run();
				},
			},
		);

		expect(result.kind).toBe("conflict");
		const after = await snapshot(userId);
		expect(after.matchmaker_history).toEqual([]);
		expect(after.matchmaker_round).toEqual([]);
		expect(after.matchmaker_players.map((row) => [row.id, row.version])).toEqual([
			["m1-a", 1],
			["m1-b", 1],
		]);
		for (const row of after.matchmaker_players) {
			expect(JSON.parse(row.data as string)).toEqual(makePlayer(row.id as string));
		}
		expect(after.matchmaker_match_slots.map((row) => row.match_id)).toEqual(["m1", "m2"]);
		expect(after.sync_batch_guards).toEqual([]);
	});

	it("計算後回合版本變動時整批守衛使 batch 不寫入任何資料", async () => {
		const { submitScoreForUser } = await import("../src/matchmaker/score-repository");
		const { userId } = await setupSingles("ms-guard-round-version@example.com");

		const result = await submitScoreForUser(
			getDb(env),
			userId,
			{ matchId: "m1", scoreA: "11", scoreB: "7", roundVersion: 3 },
			{
				afterRead: async () => {
					await env.DB?.prepare("UPDATE matchmaker_round SET version = 4 WHERE user_id = ?").bind(userId).run();
				},
			},
		);

		expect(result.kind).toBe("conflict");
		const after = await snapshot(userId);
		expect(after.matchmaker_round[0].version).toBe(4);
		expect(JSON.parse(after.matchmaker_round[0].data as string).matches[0].status).toBe("pending");
		expect(after.matchmaker_history).toEqual([]);
		expect(after.matchmaker_players.map((row) => row.version)).toEqual([1, 1]);
		expect(after.matchmaker_match_slots.map((row) => row.match_id)).toEqual(["m1", "m2"]);
		expect(after.sync_batch_guards).toEqual([]);
	});

	it("歷史主鍵衝突時整批回滾並回報衝突（第二道防線）", async () => {
		const { submitScoreForUser } = await import("../src/matchmaker/score-repository");
		const { userId } = await setupSingles("ms-history-pk@example.com");

		// 守衛只看回合與球員版本；此處只在歷史插入一筆同場次，讓主鍵衝突單獨成為唯一失敗原因
		const result = await submitScoreForUser(
			getDb(env),
			userId,
			{ matchId: "m1", scoreA: "11", scoreB: "7", roundVersion: 3 },
			{ afterRead: () => seedHistory(userId, makeHistoryEntry("m1")) },
		);

		expect(result.kind).toBe("conflict");
		const after = await snapshot(userId);
		expect(after.matchmaker_history).toHaveLength(1);
		expect(JSON.parse(after.matchmaker_history[0].data as string)).toEqual(makeHistoryEntry("m1"));
		expect(after.matchmaker_round[0].version).toBe(3);
		expect(after.matchmaker_players.map((row) => row.version)).toEqual([1, 1]);
		expect(after.matchmaker_match_slots.map((row) => row.match_id)).toEqual(["m1", "m2"]);
		expect(after.sync_batch_guards).toEqual([]);
	});

	it("殘留的守衛列造成的主鍵衝突不被吞成 409 而是照常拋出", async () => {
		const { submitScoreForUser } = await import("../src/matchmaker/score-repository");
		const { userId } = await setupSingles("ms-guard-residue@example.com");

		const attempt = submitScoreForUser(
			getDb(env),
			userId,
			{ matchId: "m1", scoreA: "11", scoreB: "7", roundVersion: 3 },
			{
				afterRead: async () => {
					await env.DB?.prepare("INSERT INTO sync_batch_guards (user_id, version, updated_at) VALUES (?, 1, ?)")
						.bind(userId, NOW.getTime())
						.run();
				},
			},
		);

		await expect(attempt).rejects.toThrow(/sync_batch_guards\.user_id/);
		await env.DB?.prepare("DELETE FROM sync_batch_guards WHERE user_id = ?").bind(userId).run();
		const after = await snapshot(userId);
		expect(after.matchmaker_history).toEqual([]);
		expect(after.matchmaker_round[0].version).toBe(3);
	});

	it("B 對 A 的場次送出比分回 409 且 A 的資料不變", async () => {
		const { userId: idA } = await setupSingles("ms-iso-a@example.com", { roundVersion: 1 });
		const cookieB = await seedAndSignIn("ms-iso-b@example.com");
		const before = await snapshot(idA);

		const res = await postScore(cookieB, "m1", scoreBody(1));

		expect(res.status).toBe(409);
		expect(await snapshot(idA)).toEqual(before);
		expect(await snapshot(await userIdOf("ms-iso-b@example.com"))).toEqual({
			matchmaker_players: [],
			matchmaker_round: [],
			matchmaker_history: [],
			matchmaker_match_slots: [],
			sync_batch_guards: [],
		});
	});

	it("送出比分的格式錯誤回 400、場次不存在或已完成回 409，且皆不寫入", async () => {
		const { cookie, userId } = await setupSingles("ms-failures@example.com");
		// 把 m2 直接改為已完成（API 不允許，故以 DB 直寫）
		const round = { ...makeRound([makeMatch("m1"), makeMatch("m2", "completed")]) };
		await env.DB?.prepare("UPDATE matchmaker_round SET data = ? WHERE user_id = ?")
			.bind(JSON.stringify(round), userId)
			.run();
		const before = await snapshot(userId);

		const cases: Array<{ matchId: string; scoreA: string; scoreB: string; status: number }> = [
			{ matchId: "m1", scoreA: "", scoreB: "7", status: 400 },
			{ matchId: "m1", scoreA: "abc", scoreB: "7", status: 400 },
			{ matchId: "m1", scoreA: "-1", scoreB: "7", status: 400 },
			{ matchId: "m1", scoreA: "5", scoreB: "5", status: 400 },
			{ matchId: "nope", scoreA: "11", scoreB: "7", status: 409 },
			{ matchId: "m2", scoreA: "11", scoreB: "7", status: 409 },
		];
		const statuses: number[] = [];
		const bodies: unknown[] = [];
		for (const item of cases) {
			const res = await postScore(cookie, item.matchId, scoreBody(3, item.scoreA, item.scoreB));
			statuses.push(res.status);
			bodies.push(await res.json());
		}

		expect(statuses).toEqual(cases.map((item) => item.status));
		expect(bodies).toEqual(cases.map((item) => ({ error: item.status === 400 ? "INVALID_BODY" : "VERSION_CONFLICT" })));
		expect(await snapshot(userId)).toEqual(before);
	});

	it("同一場次重複送出時回 409 且歷史只有一筆", async () => {
		const { cookie, userId } = await setupSingles("ms-twice@example.com");

		const first = await postScore(cookie, "m1", scoreBody(3));
		const second = await postScore(cookie, "m1", scoreBody(4));

		expect(first.status).toBe(200);
		expect(second.status).toBe(409);
		const after = await snapshot(userId);
		expect(after.matchmaker_history).toHaveLength(1);
		expect(after.matchmaker_round[0].version).toBe(4);
		for (const row of after.matchmaker_players) {
			expect((JSON.parse(row.data as string) as Player).gamesPlayed).toBe(1);
			expect(row.version).toBe(2);
		}
	});

	it("雲端歷史的 data 等於回應的 historyEntry 且 played_at 為其毫秒值", async () => {
		const { cookie, userId } = await setupSingles("ms-history@example.com");
		const before = Date.now();

		const res = await postScore(cookie, "m1", scoreBody(3));

		const body = SubmitScoreResponseSchema.parse(await res.json());
		const rows = await rowsOf("matchmaker_history", userId);
		expect(rows).toHaveLength(1);
		expect(JSON.parse(rows[0].data as string)).toEqual(body.historyEntry);
		expect(rows[0].played_at).toBe(Date.parse(body.historyEntry.playedAt));
		expect(rows[0].version).toBe(1);
		// 完成時間取伺服器時間，且回合內的 completedAt 與歷史一致
		expect(Date.parse(body.historyEntry.playedAt)).toBeGreaterThanOrEqual(before);
		expect(Date.parse(body.historyEntry.playedAt)).toBeLessThanOrEqual(Date.now());
		expect(body.round.data.matches[0].completedAt).toBe(body.historyEntry.playedAt);
	});

	it("雲端寫入的評分與核心 submitScore 的結果逐位相等並回報觸界", async () => {
		const email = "ms-core-parity@example.com";
		const cookie = await seedAndSignIn(email);
		const userId = await userIdOf(email);
		const players = [
			makePlayer("p1", { rating: 7.98, gamesPlayed: 0 }),
			makePlayer("p2", { rating: 4.37, gamesPlayed: 12 }),
			makePlayer("p3", { rating: 5.11, gamesPlayed: 3 }),
			makePlayer("p4", { rating: 1.02, gamesPlayed: 40 }),
		];
		const round = { ...makeRound([doublesMatch("m1", ["p1", "p2", "p3", "p4"])]), format: "doubles" as const };
		await seedPlayers(userId, players);
		await seedRound(userId, round, 1);

		const res = await postScore(cookie, "m1", scoreBody(1, "11", "3"));

		expect(res.status).toBe(200);
		const body = SubmitScoreResponseSchema.parse(await res.json());
		const expected = submitScore({
			round,
			players,
			matchId: "m1",
			rawScoreA: "11",
			rawScoreB: "3",
			now: body.historyEntry.playedAt,
		});
		if (!expected.ok) {
			throw new Error("核心 submitScore 應成功");
		}
		const rows = await rowsOf("matchmaker_players", userId);
		const ratings = Object.fromEntries(rows.map((row) => [row.id, (JSON.parse(row.data as string) as Player).rating]));
		expect(ratings).toEqual(Object.fromEntries(expected.playerPatches.map((patch) => [patch.id, patch.rating])));
		expect(body.boundaryHits).toEqual(expected.boundaryHits);
		expect(body.boundaryHits.length).toBeGreaterThan(0);
	});

	it("名單缺少參賽者或回合不存在時回 409 且不寫入", async () => {
		const email = "ms-missing@example.com";
		const cookie = await seedAndSignIn(email);
		const userId = await userIdOf(email);
		const noRound = await postScore(cookie, "m1", scoreBody(1));
		await seedPlayers(userId, [makePlayer("m1-a")]);
		await seedRound(userId, makeRound([makeMatch("m1")]), 1);
		const before = await snapshot(userId);

		const missingPlayer = await postScore(cookie, "m1", scoreBody(1));

		expect(noRound.status).toBe(409);
		expect(missingPlayer.status).toBe(409);
		expect(await snapshot(userId)).toEqual(before);
	});

	it("body 不符 schema 時回 400 且不寫入", async () => {
		const { cookie, userId } = await setupSingles("ms-bad-body@example.com");
		const before = await snapshot(userId);

		const zeroVersion = await postScore(cookie, "m1", { scoreA: "11", scoreB: "7", roundVersion: 0 });
		const missingScore = await postScore(cookie, "m1", { scoreA: "11", roundVersion: 3 });

		expect(zeroVersion.status).toBe(400);
		expect(await zeroVersion.json()).toEqual({ error: "INVALID_BODY" });
		expect(missingScore.status).toBe(400);
		expect(await snapshot(userId)).toEqual(before);
	});

	it("完成時間取伺服器時間而非請求 body 帶入的時間", async () => {
		const { cookie } = await setupSingles("ms-server-time@example.com");
		const before = Date.now();

		const res = await postScore(cookie, "m1", {
			...scoreBody(3),
			now: "2000-01-01T00:00:00.000Z",
			completedAt: "2000-01-01T00:00:00.000Z",
		});

		const body = SubmitScoreResponseSchema.parse(await res.json());
		expect(Date.parse(body.historyEntry.playedAt)).toBeGreaterThanOrEqual(before);
	});

	it("不從 query 或 body 接受 userId（送出比分）", async () => {
		const { userId: idA } = await setupSingles("ms-uid-a@example.com", { roundVersion: 1 });
		const cookieB = await seedAndSignIn("ms-uid-b@example.com");
		const before = await snapshot(idA);

		const res = await postScore(cookieB, "m1", { ...scoreBody(1), userId: idA }, `?userId=${idA}`);

		expect(res.status).toBe(409);
		expect(await snapshot(idA)).toEqual(before);
	});
});
