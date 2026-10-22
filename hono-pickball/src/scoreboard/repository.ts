import type { ScoreboardState } from "@pickball/core/scoreboard/types";
import { and, eq } from "drizzle-orm";
import type { getDb } from "../db/client";
import { scoreboardCurrent } from "../db/schema";

type Db = ReturnType<typeof getDb>;

export interface VersionedScoreboard {
	data: ScoreboardState;
	version: number;
}

/** 讀取本人目前的計分板；尚無資料回 null。 */
export async function getCurrent(db: Db, userId: string): Promise<VersionedScoreboard | null> {
	const rows = await db.select().from(scoreboardCurrent).where(eq(scoreboardCurrent.userId, userId)).limit(1);
	const row = rows[0];
	if (!row) {
		return null;
	}
	return { data: row.data, version: row.version };
}

/**
 * 以樂觀鎖寫入；回傳 null 代表版本衝突。
 * 版本比對與寫入必須是單一條件式 SQL：先讀再寫會讓兩次呼叫之間被其他裝置插隊。
 */
export async function putCurrent(
	db: Db,
	userId: string,
	data: ScoreboardState,
	expectedVersion: number,
): Promise<VersionedScoreboard | null> {
	const updatedAt = new Date();

	if (expectedVersion === 0) {
		const inserted = await db
			.insert(scoreboardCurrent)
			.values({ userId, data, version: 1, updatedAt })
			.onConflictDoNothing()
			.returning();
		const row = inserted[0];
		return row ? { data: row.data, version: row.version } : null;
	}

	const updated = await db
		.update(scoreboardCurrent)
		.set({ data, version: expectedVersion + 1, updatedAt })
		.where(and(eq(scoreboardCurrent.userId, userId), eq(scoreboardCurrent.version, expectedVersion)))
		.returning();
	const row = updated[0];
	return row ? { data: row.data, version: row.version } : null;
}
