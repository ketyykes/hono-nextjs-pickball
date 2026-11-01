import type { Player } from "@pickball/core/matchmaker/types";
import { and, asc, eq, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { matchmakerHistory, matchmakerMatchSlots, matchmakerPlayers, matchmakerRound } from "../db/schema";
import { initialVersion, raiseVersionFloor } from "./version-floor";

export interface VersionedPlayer {
	data: Player;
	version: number;
}

function toVersioned(row: { data: Player; version: number }): VersionedPlayer {
	return { data: row.data, version: row.version };
}

/** 依建立順序列出本人的參賽者；sort_order 重複（兩台裝置同時匯入）時以 rowid 保持穩定。 */
export async function listPlayers(db: Db, userId: string): Promise<VersionedPlayer[]> {
	const rows = await db
		.select()
		.from(matchmakerPlayers)
		.where(eq(matchmakerPlayers.userId, userId))
		.orderBy(asc(matchmakerPlayers.sortOrder), sql`rowid`);
	return rows.map(toVersioned);
}

/**
 * 以樂觀鎖建立或更新單一參賽者；回傳 null 代表版本衝突。
 * 版本比對與寫入必須是單一條件式 SQL：先讀再寫會讓兩次呼叫之間被其他裝置插隊。
 */
export async function putPlayer(
	db: Db,
	userId: string,
	data: Player,
	expectedVersion: number,
): Promise<VersionedPlayer | null> {
	const now = new Date();
	if (expectedVersion === 0) {
		// select 內的值不經欄位 mapping：data 要自行序列化、updated_at 要傳毫秒數。
		// sort_order 取該使用者現有最大值加一；沒有任何列時 coalesce 為 -1，所以從 0 起算。
		const inserted = await db
			.insert(matchmakerPlayers)
			.select(
				sql`select ${userId}, ${data.id}, ${JSON.stringify(data)}, coalesce(max(${matchmakerPlayers.sortOrder}), -1) + 1, ${initialVersion(userId)}, ${now.getTime()} from ${matchmakerPlayers} where ${matchmakerPlayers.userId} = ${userId}`,
			)
			.onConflictDoNothing()
			.returning();
		const row = inserted[0];
		return row ? toVersioned(row) : null;
	}

	const updated = await db
		.update(matchmakerPlayers)
		.set({ data, version: expectedVersion + 1, updatedAt: now })
		.where(
			and(
				eq(matchmakerPlayers.userId, userId),
				eq(matchmakerPlayers.id, data.id),
				eq(matchmakerPlayers.version, expectedVersion),
			),
		)
		.returning();
	const row = updated[0];
	return row ? toVersioned(row) : null;
}

/** 刪除單一參賽者；刻意不檢查影響列數與版本，讓刪除冪等。 */
export async function deletePlayer(db: Db, userId: string, id: string): Promise<void> {
	await db
		.delete(matchmakerPlayers)
		.where(and(eq(matchmakerPlayers.userId, userId), eq(matchmakerPlayers.id, id)));
}

/** 只認主鍵／UNIQUE 衝突（FK、NOT NULL、CHECK 違規不是 id 重複）；錯誤可能被包在 cause 內，逐層檢查。 */
function isConstraintError(error: unknown): boolean {
	let current: unknown = error;
	for (let depth = 0; depth < 5 && current instanceof Error; depth += 1) {
		if (/SQLITE_CONSTRAINT_PRIMARYKEY|UNIQUE constraint failed/.test(current.message)) {
			return true;
		}
		current = current.cause;
	}
	return false;
}

/**
 * 整份附加到既有名單之後；回傳 null 代表有 id 已存在，整份未寫入。
 * 不加 onConflictDoNothing：要讓主鍵衝突使整個 D1 batch 回滾，才有「全有或全無」。
 * 非衝突的錯誤一律重新拋出，不可吞成 409。
 */
export async function importPlayers(
	db: Db,
	userId: string,
	players: Player[],
): Promise<VersionedPlayer[] | null> {
	const maxRows = await db
		.select({ max: sql<number | null>`max(${matchmakerPlayers.sortOrder})` })
		.from(matchmakerPlayers)
		.where(eq(matchmakerPlayers.userId, userId));
	const start = (maxRows[0]?.max ?? -1) + 1;
	const now = new Date();

	const statements = players.map((player, index) =>
		db
			.insert(matchmakerPlayers)
			.values({
				userId,
				id: player.id,
				data: player,
				sortOrder: start + index,
				version: initialVersion(userId),
				updatedAt: now,
			})
			.returning(),
	);
	let results;
	try {
		results = await db.batch(statements as [(typeof statements)[number], ...(typeof statements)[number][]]);
	} catch (error) {
		if (isConstraintError(error)) {
			return null;
		}
		throw error;
	}
	// 回應的 version 取自實際寫入的列：初始版本由 SQL 子查詢決定，JS 端無從得知
	return results.map((rows) => toVersioned(rows[0]));
}

/** 刪除本人全部對戰分配機資料；之後新增的資料表要加進同一個 batch。 */
export async function resetMatchmaker(db: Db, userId: string): Promise<void> {
	const now = new Date();
	// 下限必須在刪除之前提高：刪除後就讀不到將被刪列的 version
	const deletedVersions = sql`SELECT version AS v FROM matchmaker_players WHERE user_id = ${userId}
		UNION ALL SELECT version AS v FROM matchmaker_round WHERE user_id = ${userId}
		UNION ALL SELECT version AS v FROM matchmaker_match_slots WHERE user_id = ${userId}`;
	await db.batch([
		raiseVersionFloor(db, userId, deletedVersions, now),
		db.delete(matchmakerPlayers).where(eq(matchmakerPlayers.userId, userId)),
		db.delete(matchmakerRound).where(eq(matchmakerRound.userId, userId)),
		db.delete(matchmakerMatchSlots).where(eq(matchmakerMatchSlots.userId, userId)),
		db.delete(matchmakerHistory).where(eq(matchmakerHistory.userId, userId)),
	]);
}
