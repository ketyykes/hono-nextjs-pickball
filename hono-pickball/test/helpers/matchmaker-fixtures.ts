import { env, exports } from "cloudflare:workers";
import type { MatchHistoryEntry } from "@pickball/core/matchmaker/history";
import type { Round, RoundMatch } from "@pickball/core/matchmaker/round-types";
import { createInitialState } from "@pickball/core/scoreboard/reducer";
import type { MatchSlot } from "@pickball/core/api/round";
import { getDb } from "../../src/db/client";
import { matchmakerHistory, matchmakerMatchSlots, matchmakerRound } from "../../src/db/schema";
import { expectedUserHeader, seedUser, signIn } from "./session";

/** 建立測試使用者並登入，回傳可放進 Cookie header 的字串。 */
export async function seedAndSignIn(email: string): Promise<string> {
	await seedUser(email);
	return signIn(email);
}

export const origin = "http://localhost:3005";
export const base = `${origin}/api/matchmaker`;

/** 產生符合 RoundMatchSchema 的場次；completed 時補齊比分、勝方與賽後分數。 */
export function makeMatch(id: string, status: "pending" | "completed" = "pending", scoreA = 11): RoundMatch {
	const completed = status === "completed";
	return {
		id,
		courtNumber: 1,
		format: "singles",
		teams: [
			{ playerIds: [`${id}-a`], rating: 4 },
			{ playerIds: [`${id}-b`], rating: 4 },
		],
		status,
		scores: completed ? { teamA: scoreA, teamB: 7 } : null,
		winner: completed ? "teamA" : null,
		completedAt: completed ? "2026-01-01T00:10:00.000Z" : null,
		playerRatings: [
			{ playerId: `${id}-a`, before: 4, after: completed ? 4.1 : null },
			{ playerId: `${id}-b`, before: 4, after: completed ? 3.9 : null },
		],
	};
}

export function makeRound(matches: RoundMatch[], roundNumber = 1): Round {
	return {
		roundNumber,
		createdAt: "2026-01-01T00:00:00.000Z",
		format: "singles",
		courtCount: 2,
		targetScore: 11,
		matches,
		restingPlayerIds: [],
		seenSignatures: { teammateKeys: [], opponentKeys: [], fullMatchKeys: [] },
		timer: null,
	};
}

export function makeSlot(matchId: string | null, us = 0): MatchSlot {
	const state = createInitialState();
	return { ...state, scores: { us, them: 0 }, matchId } as MatchSlot;
}

export function makeHistoryEntry(matchId: string): MatchHistoryEntry {
	const team = (id: string) => ({
		players: [{ id, name: `球員${id}`, ratingBefore: 4, ratingAfter: 4.1 }],
		rating: 4,
	});
	return {
		matchId,
		courtNumber: 1,
		playedAt: "2026-01-01T00:10:00.000Z",
		format: "singles",
		teamA: team(`${matchId}-a`),
		teamB: team(`${matchId}-b`),
		scoreA: 11,
		scoreB: 7,
		winner: "teamA",
	};
}

export function request(
	cookie: string | undefined,
	method: string,
	path: string,
	body?: unknown,
	contentType = "application/json",
): Promise<Response> {
	const headers: Record<string, string> = { Origin: origin };
	if (cookie) {
		headers.Cookie = cookie;
		Object.assign(headers, expectedUserHeader(cookie));
	}
	const init: RequestInit = { method, headers };
	if (body !== undefined) {
		headers["Content-Type"] = contentType;
		init.body = typeof body === "string" ? body : JSON.stringify(body);
	}
	return exports.default.fetch(new Request(`${base}${path}`, init));
}

export function appRequestInit(
	cookie: string | undefined,
	endpoint: { method: string; body?: unknown },
): RequestInit {
	const headers: Record<string, string> = { Origin: origin };
	if (cookie) {
		headers.Cookie = cookie;
		Object.assign(headers, expectedUserHeader(cookie));
	}
	const init: RequestInit = { method: endpoint.method, headers };
	if (endpoint.body !== undefined) {
		headers["Content-Type"] = "application/json";
		init.body = JSON.stringify(endpoint.body);
	}
	return init;
}

/** 任何查詢都拋錯的 D1 替身。 */
export const throwingDb = {
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

const NOW = new Date(1_700_000_000_000);

/** 繞過 API 直接寫入回合（用來建立 API 本身不允許的 completed 場次）。 */
export async function seedRound(userId: string, round: Round, version = 1): Promise<void> {
	await getDb(env).insert(matchmakerRound).values({ userId, data: round, version, updatedAt: NOW });
}

export async function seedSlot(userId: string, slot: MatchSlot, version = 1): Promise<void> {
	if (slot.matchId === null) {
		throw new Error("分槽必須有 matchId");
	}
	await getDb(env)
		.insert(matchmakerMatchSlots)
		.values({ userId, matchId: slot.matchId, data: slot, version, updatedAt: NOW });
}

export async function seedHistory(userId: string, entry: MatchHistoryEntry): Promise<void> {
	await getDb(env)
		.insert(matchmakerHistory)
		.values({
			userId,
			matchId: entry.matchId,
			playedAt: new Date(entry.playedAt),
			data: entry,
			version: 1,
			updatedAt: NOW,
		});
}

/** 直接讀表，確認 API 之外的實際落地內容。 */
export async function rowsOf(table: string, userId: string): Promise<Array<Record<string, unknown>>> {
	if (!env.DB) {
		throw new Error("D1 binding DB 不存在");
	}
	const { results } = await env.DB.prepare(`SELECT * FROM ${table} WHERE user_id = ? ORDER BY rowid`)
		.bind(userId)
		.all<Record<string, unknown>>();
	return results;
}
