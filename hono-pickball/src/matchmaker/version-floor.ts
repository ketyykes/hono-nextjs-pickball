import { type SQL, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { syncVersionFloors } from "../db/schema";

/**
 * 可重建的版本化表建立列時的初始 version：該使用者的版本下限加一。
 * 以子查詢寫在建立的同一條陳述式內，先在 JS 端讀再寫會讓兩次呼叫之間被其他裝置提高下限。
 * 從未刪除過資料的使用者沒有下限列，coalesce 為 0，所以初始 version 仍是 1。
 */
export function initialVersion(userId: string): SQL<number> {
	return sql<number>`(SELECT coalesce(max(${syncVersionFloors.version}), 0) + 1 FROM ${syncVersionFloors} WHERE ${syncVersionFloors.userId} = ${userId})`;
}

/**
 * 產生「把下限提高到將被刪除之列的最大 version」的陳述式；MUST 放在同一個 batch 內、刪除陳述式之前。
 * deletedVersions 是以與刪除相同條件選出將被刪列 version（欄名為 v）的子查詢，
 * 這樣選取與刪除看到的是同一份資料，不必依賴 batch 外先讀到的值。
 * 沒有任何列將被刪除時聚合仍會回一列（max 為 NULL），外層 WHERE 使其零列，
 * 既不寫入也不改動下限列，避免 NULL 違反 NOT NULL 讓整批回滾。
 * 下限只升不降，所以衝突時取較大者。
 */
export function raiseVersionFloor(db: Db, userId: string, deletedVersions: SQL, now: Date) {
	return db
		.insert(syncVersionFloors)
		.select(
			sql`SELECT ${userId}, v, ${now.getTime()} FROM (SELECT max(v) AS v FROM (${deletedVersions})) WHERE v IS NOT NULL`,
		)
		.onConflictDoUpdate({
			target: syncVersionFloors.userId,
			set: {
				version: sql`max(${syncVersionFloors.version}, excluded.version)`,
				updatedAt: sql`excluded.updated_at`,
			},
		});
}
