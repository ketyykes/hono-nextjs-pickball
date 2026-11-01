import type { MatchSlot } from "@pickball/core/api/round";
import { and, asc, eq, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { matchmakerMatchSlots } from "../db/schema";
import { initialVersion } from "./version-floor";

export interface VersionedSlot {
	data: MatchSlot;
	version: number;
}

function toVersioned(row: { data: MatchSlot; version: number }): VersionedSlot {
	return { data: row.data, version: row.version };
}

/** 依 match_id 遞增列出本人的分槽；分槽沒有建立順序的語意。 */
export async function listSlots(db: Db, userId: string): Promise<VersionedSlot[]> {
	const rows = await db
		.select()
		.from(matchmakerMatchSlots)
		.where(eq(matchmakerMatchSlots.userId, userId))
		.orderBy(asc(matchmakerMatchSlots.matchId));
	return rows.map(toVersioned);
}

/** 讀取單一分槽；不存在回 null。 */
export async function getSlot(db: Db, userId: string, matchId: string): Promise<VersionedSlot | null> {
	const rows = await db
		.select()
		.from(matchmakerMatchSlots)
		.where(and(eq(matchmakerMatchSlots.userId, userId), eq(matchmakerMatchSlots.matchId, matchId)))
		.limit(1);
	const row = rows[0];
	return row ? toVersioned(row) : null;
}

/**
 * 以樂觀鎖建立或更新單一分槽；回傳 null 代表衝突。
 * 建立（version 0）的前置條件在同一條 SQL 內判斷：場次必須屬於目前回合且尚未 completed，
 * 先讀回合再寫會讓兩次呼叫之間被其他裝置改掉回合。
 */
export async function putSlot(
	db: Db,
	userId: string,
	matchId: string,
	data: MatchSlot,
	expectedVersion: number,
): Promise<VersionedSlot | null> {
	const now = new Date();
	if (expectedVersion === 0) {
		// select 內的值不經欄位 mapping：data 要自行序列化、updated_at 要傳毫秒數。
		const inserted = await db
			.insert(matchmakerMatchSlots)
			.select(
				sql`select ${userId}, ${matchId}, ${JSON.stringify(data)}, ${initialVersion(userId)}, ${now.getTime()}
					where exists (
						select 1 from matchmaker_round r, json_each(r.data, '$.matches') m
						where r.user_id = ${userId}
							and json_extract(m.value, '$.id') = ${matchId}
							and json_extract(m.value, '$.status') != 'completed'
					)`,
			)
			.onConflictDoNothing()
			.returning();
		const row = inserted[0];
		return row ? toVersioned(row) : null;
	}

	const updated = await db
		.update(matchmakerMatchSlots)
		.set({ data, version: expectedVersion + 1, updatedAt: now })
		.where(
			and(
				eq(matchmakerMatchSlots.userId, userId),
				eq(matchmakerMatchSlots.matchId, matchId),
				eq(matchmakerMatchSlots.version, expectedVersion),
			),
		)
		.returning();
	const row = updated[0];
	return row ? toVersioned(row) : null;
}
