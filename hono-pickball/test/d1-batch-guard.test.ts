import { env } from "cloudflare:workers";
import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { getDb } from "../src/db/client";
import { matchmakerPlayers, matchmakerRound } from "../src/db/schema";
// 官方要求：import main 模組，src/ 改動時測試才會自動重跑。
import "../src/index";

// batch-guard 模組刻意在 it 內動態匯入：模組尚不存在時只讓用到它的 it 紅燈，
// 不影響描述 D1 平台行為的第一個 it（characterization）。

const NOW = new Date(1_700_000_000_000);

function getTestDb(): D1Database {
	if (!env.DB) {
		throw new Error("env.DB 不存在：測試夾具未帶入 env.local 的 D1 binding");
	}
	return env.DB;
}

async function insertUser(id: string) {
	await getTestDb()
		.prepare(
			"INSERT INTO user (id, name, email, email_verified, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?)",
		)
		.bind(id, "測試使用者", `${id}@example.com`, NOW.getTime(), NOW.getTime())
		.run();
}

async function countRows(table: string, userId: string) {
	const row = await getTestDb()
		.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE user_id = ?`)
		.bind(userId)
		.first<{ n: number }>();
	return row?.n;
}

describe("D1 整批守衛", () => {
	it("batch 中影響 0 列的 UPDATE 不會使整批回滾", async () => {
		const db = getDb(env);
		const userId = "guard-zero-user";
		await insertUser(userId);

		await db.batch([
			db.insert(matchmakerRound).values({ userId, data: { matches: [] } as never, version: 1, updatedAt: NOW }),
			// 對不存在的 user_id 更新：影響 0 列，不是錯誤
			db
				.update(matchmakerPlayers)
				.set({ version: 2 })
				.where(eq(matchmakerPlayers.userId, "guard-zero-ghost")),
		]);

		expect(await countRows("matchmaker_round", userId)).toBe(1);
	});

	it("整批守衛的條件不成立時整批回滾且被分類為版本衝突", async () => {
		const { insertBatchGuard, releaseBatchGuard, isBatchGuardViolation } = await import(
			"../src/matchmaker/batch-guard"
		);
		const db = getDb(env);
		const userId = "guard-batch-user";
		await insertUser(userId);
		const roundIsAbsent = (expected: number) =>
			sql`(SELECT COUNT(*) FROM matchmaker_round WHERE user_id = ${userId}) = ${expected}`;
		const buildBatch = (condition: ReturnType<typeof roundIsAbsent>) =>
			db.batch([
				insertBatchGuard(db, userId, condition, NOW),
				db.insert(matchmakerRound).values({ userId, data: { matches: [] } as never, version: 1, updatedAt: NOW }),
				releaseBatchGuard(db, userId),
			]);

		// 條件為假（期望已有 1 列，實際為 0）：拋出、被分類為衝突、兩表皆無列
		const failure = await buildBatch(roundIsAbsent(1)).then(
			() => undefined,
			(error: unknown) => error ?? new Error("rejected with empty value"),
		);
		expect(failure).toBeDefined();
		expect(isBatchGuardViolation(failure)).toBe(true);
		expect(await countRows("matchmaker_round", userId)).toBe(0);
		expect(await countRows("sync_batch_guards", userId)).toBe(0);

		// 條件為真：同一組陳述式成功，round 一列、守衛表為空
		await buildBatch(roundIsAbsent(0));
		expect(await countRows("matchmaker_round", userId)).toBe(1);
		expect(await countRows("sync_batch_guards", userId)).toBe(0);
	});

	it("非守衛的資料庫錯誤不被分類為版本衝突", async () => {
		const { isBatchGuardViolation } = await import("../src/matchmaker/batch-guard");
		const db = getDb(env);

		// 不存在的 user_id：foreign key 違反
		const failure = await db
			.batch([
				db.insert(matchmakerRound).values({
					userId: "guard-ghost-user",
					data: { matches: [] } as never,
					version: 1,
					updatedAt: NOW,
				}),
			])
			.then(
				() => undefined,
				(error: unknown) => error ?? new Error("rejected with empty value"),
			);

		expect(failure).toBeDefined();
		expect(String((failure as Error).message)).toMatch(/FOREIGN KEY/);
		expect(isBatchGuardViolation(failure)).toBe(false);
		// 非 Error 值也不可被誤判
		expect(isBatchGuardViolation("NOT NULL constraint failed: sync_batch_guards.version")).toBe(false);
		expect(isBatchGuardViolation(undefined)).toBe(false);
		// 守衛訊息被包在 cause 內時仍要認得（正式 D1 的外層前綴可能不同）
		const wrapped = new Error("包裝後的錯誤", {
			cause: new Error("NOT NULL constraint failed: sync_batch_guards.version"),
		});
		expect(isBatchGuardViolation(wrapped)).toBe(true);
		// 守衛表主鍵（殘留守衛列）衝突不是守衛條件失敗，不可被吞成版本衝突
		expect(isBatchGuardViolation(new Error("UNIQUE constraint failed: sync_batch_guards.user_id"))).toBe(false);
		// 其他表的 NOT NULL 違反不是守衛失敗
		expect(isBatchGuardViolation(new Error("NOT NULL constraint failed: matchmaker_round.data"))).toBe(false);
	});

	// regression guard（寫入即綠）：守衛表殘留一列時，守衛 INSERT 會因主鍵衝突失敗，
	// 該錯誤不是版本衝突，不可被分類為 409。
	it("殘留守衛列造成的主鍵衝突不被分類為版本衝突且整批回滾", async () => {
		const { insertBatchGuard, releaseBatchGuard, isBatchGuardViolation } = await import(
			"../src/matchmaker/batch-guard"
		);
		const db = getDb(env);
		const userId = "guard-stale-user";
		await insertUser(userId);
		await getTestDb()
			.prepare("INSERT INTO sync_batch_guards (user_id, version, updated_at) VALUES (?, 1, ?)")
			.bind(userId, NOW.getTime())
			.run();

		const failure = await db
			.batch([
				insertBatchGuard(db, userId, sql`1 = 1`, NOW),
				db.insert(matchmakerRound).values({ userId, data: { matches: [] } as never, version: 1, updatedAt: NOW }),
				releaseBatchGuard(db, userId),
			])
			.then(
				() => undefined,
				(error: unknown) => error ?? new Error("rejected with empty value"),
			);

		expect(failure).toBeDefined();
		expect(String((failure as Error).message)).toMatch(/UNIQUE constraint failed: sync_batch_guards\.user_id/);
		expect(isBatchGuardViolation(failure)).toBe(false);
		expect(await countRows("matchmaker_round", userId)).toBe(0);
		// 殘留列未被釋放陳述式刪除（整批已回滾）
		expect(await countRows("sync_batch_guards", userId)).toBe(1);
	});
});
