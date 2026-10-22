import type { Round } from "@pickball/core/matchmaker/round-types";
import { and, eq, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { matchmakerMatchSlots, matchmakerRound } from "../db/schema";

export interface VersionedRound {
	data: Round;
	version: number;
}

/** PUT 回合的結果：衝突（版本不符）與 invalid（改變了完成狀態）要回不同的 HTTP 狀態碼。 */
export type PutRoundResult =
	| { kind: "ok"; value: VersionedRound }
	| { kind: "conflict" }
	| { kind: "invalid" };

/** 讀取本人目前的回合；尚無回合回 null。 */
export async function getRound(db: Db, userId: string): Promise<VersionedRound | null> {
	const rows = await db.select().from(matchmakerRound).where(eq(matchmakerRound.userId, userId)).limit(1);
	const row = rows[0];
	return row ? { data: row.data, version: row.version } : null;
}

function compareKeys(a: string, b: string): number {
	if (a < b) {
		return -1;
	}
	if (a > b) {
		return 1;
	}
	return 0;
}

/** 遞迴依鍵排序，讓內容相同但鍵順序不同的 JSON 值序列化後相等。 */
function sortKeys(value: unknown): unknown {
	if (Array.isArray(value)) {
		return value.map(sortKeys);
	}
	if (typeof value === "object" && value !== null) {
		return Object.fromEntries(
			Object.entries(value)
				.sort(([a], [b]) => compareKeys(a, b))
				.map(([key, inner]) => [key, sortKeys(inner)]),
		);
	}
	return value;
}

function isDeepEqual(a: unknown, b: unknown): boolean {
	return JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b));
}

/**
 * 新資料中每一場 completed 場次，都必須在目前回合中存在同 id 且內容相同的 completed 場次。
 * 場次只能經送出比分端點完成，否則評分與歷史不會被寫入（後端權威）。
 */
function keepsCompletedMatches(current: Round | null, next: Round): boolean {
	return next.matches
		.filter((match) => match.status === "completed")
		.every((match) =>
			current?.matches.some((existing) => existing.status === "completed" && isDeepEqual(existing, match)),
		);
}

/**
 * 以樂觀鎖建立或更新回合，並在同一個 batch 內清除不屬於目前回合未完成場次的分槽。
 * 完成狀態的比對在 batch 外，但寫入帶版本條件：比對後回合若被改動，寫入影響 0 列而回 conflict。
 * 孤兒分槽的刪除條件以資料庫中的回合內容推導，所以不論寫入成功與否，分槽都與目前回合一致。
 */
export async function putRound(
	db: Db,
	userId: string,
	data: Round,
	expectedVersion: number,
): Promise<PutRoundResult> {
	const current = await getRound(db, userId);
	if (!keepsCompletedMatches(current?.data ?? null, data)) {
		return { kind: "invalid" };
	}

	const now = new Date();
	const write =
		expectedVersion === 0
			? db.insert(matchmakerRound).values({ userId, data, version: 1, updatedAt: now }).onConflictDoNothing().returning()
			: db
					.update(matchmakerRound)
					.set({ data, version: expectedVersion + 1, updatedAt: now })
					.where(and(eq(matchmakerRound.userId, userId), eq(matchmakerRound.version, expectedVersion)))
					.returning();
	const deleteOrphanSlots = db.delete(matchmakerMatchSlots).where(
		and(
			eq(matchmakerMatchSlots.userId, userId),
			sql`${matchmakerMatchSlots.matchId} NOT IN (
				SELECT json_extract(m.value, '$.id')
				FROM matchmaker_round r, json_each(r.data, '$.matches') m
				WHERE r.user_id = ${userId} AND json_extract(m.value, '$.status') != 'completed'
			)`,
		),
	);

	const [written] = await db.batch([write, deleteOrphanSlots]);
	const row = written[0];
	if (!row) {
		return { kind: "conflict" };
	}
	return { kind: "ok", value: { data: row.data, version: row.version } };
}
