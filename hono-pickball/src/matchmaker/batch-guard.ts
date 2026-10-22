import { eq, type SQL, sql } from "drizzle-orm";
import type { getDb } from "../db/client";
import { syncBatchGuards } from "../db/schema";

type Db = ReturnType<typeof getDb>;

/**
 * 產生整批守衛的 INSERT；MUST 放在 batch 的第一條。
 * 條件為假時 CASE 得到 NULL，違反 version 的 NOT NULL 而使該陳述式失敗，D1 隨之回滾整批。
 * 刻意不用 OR IGNORE／OR REPLACE／onConflictDoNothing：它們會讓違反約束的守衛被靜默略過。
 * 比較必須在 SQL 內對資料庫目前內容執行；不可先在 JS 端判定再傳入常數條件（如 sql`1`），
 * 否則先讀後寫之間的競態就沒有被消除（batch 前讀到的 version 只能當比較基準，不能當結果）。
 */
export function insertBatchGuard(db: Db, userId: string, condition: SQL, now: Date) {
	return db.insert(syncBatchGuards).values({
		userId,
		version: sql`CASE WHEN ${condition} THEN 1 END`,
		updatedAt: now,
	});
}

/** 產生釋放守衛的 DELETE；MUST 放在 batch 的最後一條，使守衛表在任何 batch 結束後恆為空。 */
export function releaseBatchGuard(db: Db, userId: string) {
	return db.delete(syncBatchGuards).where(eq(syncBatchGuards.userId, userId));
}

/** 錯誤是否為整批守衛失敗；錯誤可能被包在 cause 內，逐層檢查。不比對寬泛的 SQLITE_CONSTRAINT。 */
export function isBatchGuardViolation(error: unknown): boolean {
	let current: unknown = error;
	for (let depth = 0; depth < 5 && current instanceof Error; depth += 1) {
		if (current.message.includes("NOT NULL constraint failed: sync_batch_guards.version")) {
			return true;
		}
		current = current.cause;
	}
	return false;
}
