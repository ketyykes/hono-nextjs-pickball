import { eq, type SQL, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { syncBatchGuards } from "../db/schema";

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

/** 逐層檢查錯誤與其 cause（正式 D1 的外層前綴可能不同），任一層符合就回 true。 */
function errorChainMatches(error: unknown, matches: (message: string) => boolean): boolean {
	let current: unknown = error;
	for (let depth = 0; depth < 5 && current instanceof Error; depth += 1) {
		if (matches(current.message)) {
			return true;
		}
		current = current.cause;
	}
	return false;
}

/** 錯誤是否為整批守衛失敗；不比對寬泛的 SQLITE_CONSTRAINT。 */
export function isBatchGuardViolation(error: unknown): boolean {
	return errorChainMatches(error, (message) =>
		message.includes("NOT NULL constraint failed: sync_batch_guards.version"),
	);
}

/**
 * 錯誤是否為 matchmaker_history 的主鍵衝突（同一場次重複寫入歷史）。
 * 必須限定表名：殘留守衛列的 sync_batch_guards.user_id 衝突、其他表的錯誤都不能被吞成 409。
 */
export function isHistoryPrimaryKeyViolation(error: unknown): boolean {
	return errorChainMatches(error, (message) => message.includes("UNIQUE constraint failed: matchmaker_history."));
}
