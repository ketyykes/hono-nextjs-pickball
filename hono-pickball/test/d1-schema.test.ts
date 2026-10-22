import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
// 官方要求：import main 模組，src/ 改動時測試才會自動重跑。
import "../src/index";

// 直接以 SQL 驗證 migration 建出的 schema，不經 getDb，避免與查詢層耦合。
// env 自 cloudflare:workers 匯入（cloudflare:test 的 env 已 @deprecated）。
// storage 以測試檔為隔離單位，同檔 it 共用資料，所以各 it 使用自己的 id／email。

/** 取得 DB binding；不存在時拋出明確錯誤，區分「夾具沒接上」與「表不存在」。 */
function getTestDb(): D1Database {
	if (!env.DB) {
		throw new Error("env.DB 不存在：測試夾具未帶入 env.local 的 D1 binding");
	}
	return env.DB;
}

const NOW = 1_700_000_000_000;

async function insertUser(db: D1Database, id: string, email: string) {
	await db
		.prepare(
			"INSERT INTO user (id, name, email, email_verified, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?)",
		)
		.bind(id, "測試使用者", email, NOW, NOW)
		.run();
}

async function countRows(db: D1Database, sql: string, ...params: unknown[]) {
	const row = await db.prepare(sql).bind(...params).first<{ n: number }>();
	return row?.n;
}

describe("D1 migration 夾具與 auth 核心資料表", () => {
	it("測試用 D1 已套用 TEST_MIGRATIONS 的全部 migration", async () => {
		const db = getTestDb();
		const { results } = await db
			.prepare("SELECT name FROM d1_migrations ORDER BY id")
			.all<{ name: string }>();

		const applied = results.map((row) => row.name);
		const expected = env.TEST_MIGRATIONS.map((migration) => migration.name);

		// 長度 >= 1 擋掉「兩邊都是空陣列」的恆真
		expect(expected.length).toBeGreaterThanOrEqual(1);
		expect(applied).toEqual(expected);
	});

	it("auth 核心四張資料表皆已由 migration 建立", async () => {
		const db = getTestDb();
		const { results } = await db
			.prepare("SELECT name FROM sqlite_master WHERE type='table'")
			.all<{ name: string }>();

		const tableNames = results.map((row) => row.name);
		expect(tableNames).toEqual(
			expect.arrayContaining(["user", "session", "account", "verification"]),
		);
	});

	it("user.email 重複時插入失敗", async () => {
		const db = getTestDb();
		await insertUser(db, "dup-user-1", "dup@example.com");

		await expect(
			insertUser(db, "dup-user-2", "dup@example.com"),
		).rejects.toThrow(/UNIQUE/);

		expect(
			await countRows(
				db,
				"SELECT COUNT(*) AS n FROM user WHERE email = ?",
				"dup@example.com",
			),
		).toBe(1);
	});

	it("刪除使用者時其 session 與 account 一併刪除", async () => {
		const db = getTestDb();
		const userId = "cascade-user-1";
		await insertUser(db, userId, "cascade@example.com");
		await db
			.prepare(
				"INSERT INTO session (id, expires_at, token, created_at, updated_at, user_id) VALUES (?, ?, ?, ?, ?, ?)",
			)
			.bind("cascade-session-1", NOW + 1000, "cascade-token-1", NOW, NOW, userId)
			.run();
		await db
			.prepare(
				"INSERT INTO account (id, account_id, provider_id, user_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
			)
			.bind("cascade-account-1", "cascade-acc", "credential", userId, NOW, NOW)
			.run();

		// 先確認資料確實建立，避免刪除後的 0 是恆真
		expect(
			await countRows(db, "SELECT COUNT(*) AS n FROM session WHERE user_id = ?", userId),
		).toBe(1);
		expect(
			await countRows(db, "SELECT COUNT(*) AS n FROM account WHERE user_id = ?", userId),
		).toBe(1);

		await db.prepare("DELETE FROM user WHERE id = ?").bind(userId).run();

		expect(
			await countRows(db, "SELECT COUNT(*) AS n FROM session WHERE user_id = ?", userId),
		).toBe(0);
		expect(
			await countRows(db, "SELECT COUNT(*) AS n FROM account WHERE user_id = ?", userId),
		).toBe(0);
	});

	// 以下兩個 it 為覆蓋測試（寫入即綠，非 RED）：補齊設定層約束與新表的讀寫覆蓋義務。
	it("session.token 重複時插入失敗", async () => {
		const db = getTestDb();
		await insertUser(db, "token-user-1", "token@example.com");
		const insertSession = (id: string) =>
			db
				.prepare(
					"INSERT INTO session (id, expires_at, token, created_at, updated_at, user_id) VALUES (?, ?, ?, ?, ?, ?)",
				)
				.bind(id, NOW + 1000, "dup-token-1", NOW, NOW, "token-user-1")
				.run();

		await insertSession("token-session-1");
		await expect(insertSession("token-session-2")).rejects.toThrow(/UNIQUE/);

		expect(
			await countRows(
				db,
				"SELECT COUNT(*) AS n FROM session WHERE token = ?",
				"dup-token-1",
			),
		).toBe(1);
	});

	it("verification 資料表可寫入並讀回", async () => {
		const db = getTestDb();
		await db
			.prepare(
				"INSERT INTO verification (id, identifier, value, expires_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
			)
			.bind("verification-1", "verify@example.com", "verify-value-1", NOW + 5000, NOW + 1, NOW + 2)
			.run();

		const row = await db
			.prepare(
				"SELECT id, identifier, value, expires_at, created_at, updated_at FROM verification WHERE id = ?",
			)
			.bind("verification-1")
			.first();

		expect(row).toEqual({
			id: "verification-1",
			identifier: "verify@example.com",
			value: "verify-value-1",
			expires_at: NOW + 5000,
			created_at: NOW + 1,
			updated_at: NOW + 2,
		});
	});

	// 以下四個 it 對應 scoreboard_current（B5 新增的第一張使用者資料表）。
	it("scoreboard_current 可由 migration 建立並寫入讀回", async () => {
		const db = getTestDb();
		await insertUser(db, "sc-rw-user", "sc-rw@example.com");
		const data = JSON.stringify({ games: [], note: "快照" });
		await db
			.prepare(
				"INSERT INTO scoreboard_current (user_id, data, version, updated_at) VALUES (?, ?, ?, ?)",
			)
			.bind("sc-rw-user", data, 1, NOW + 7)
			.run();

		const row = await db
			.prepare("SELECT data, version, updated_at FROM scoreboard_current WHERE user_id = ?")
			.bind("sc-rw-user")
			.first();

		expect(row).toEqual({ data, version: 1, updated_at: NOW + 7 });
	});

	it("同一使用者在 scoreboard_current 只能有一列", async () => {
		const db = getTestDb();
		await insertUser(db, "sc-dup-user", "sc-dup@example.com");
		const insertRow = () =>
			db
				.prepare(
					"INSERT INTO scoreboard_current (user_id, data, version, updated_at) VALUES (?, ?, ?, ?)",
				)
				.bind("sc-dup-user", "{}", 1, NOW)
				.run();

		await insertRow();
		await expect(insertRow()).rejects.toThrow(/UNIQUE|PRIMARY KEY/);

		expect(
			await countRows(
				db,
				"SELECT COUNT(*) AS n FROM scoreboard_current WHERE user_id = ?",
				"sc-dup-user",
			),
		).toBe(1);
	});

	it("scoreboard_current 的 user_id 必須參照既有使用者", async () => {
		const db = getTestDb();
		await expect(
			db
				.prepare(
					"INSERT INTO scoreboard_current (user_id, data, version, updated_at) VALUES (?, ?, ?, ?)",
				)
				.bind("sc-ghost-user", "{}", 1, NOW)
				.run(),
		).rejects.toThrow(/FOREIGN KEY/);
	});

	it("刪除使用者時其 scoreboard_current 一併刪除", async () => {
		const db = getTestDb();
		const userId = "sc-cascade-user";
		await insertUser(db, userId, "sc-cascade@example.com");
		await db
			.prepare(
				"INSERT INTO scoreboard_current (user_id, data, version, updated_at) VALUES (?, ?, ?, ?)",
			)
			.bind(userId, "{}", 1, NOW)
			.run();

		// 先確認資料確實建立，避免刪除後的 0 是恆真
		expect(
			await countRows(db, "SELECT COUNT(*) AS n FROM scoreboard_current WHERE user_id = ?", userId),
		).toBe(1);

		await db.prepare("DELETE FROM user WHERE id = ?").bind(userId).run();

		expect(
			await countRows(db, "SELECT COUNT(*) AS n FROM scoreboard_current WHERE user_id = ?", userId),
		).toBe(0);
	});

	// regression guard（寫入即綠）：補 scoreboard_current.data 的 NOT NULL 約束覆蓋。
	it("scoreboard_current 的 data 不可為 NULL", async () => {
		const db = getTestDb();
		await insertUser(db, "sc-null-user", "sc-null@example.com");
		await expect(
			db
				.prepare(
					"INSERT INTO scoreboard_current (user_id, data, version, updated_at) VALUES (?, NULL, ?, ?)",
				)
				.bind("sc-null-user", 1, NOW)
				.run(),
		).rejects.toThrow(/NOT NULL/);
	});
});
