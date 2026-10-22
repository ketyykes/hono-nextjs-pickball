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

	// 以下四個 it 對應 matchmaker_players（B6 新增，複合主鍵 (user_id, id)）。
	it("matchmaker_players 可由 migration 建立並寫入讀回", async () => {
		const db = getTestDb();
		await insertUser(db, "mp-rw-user", "mp-rw@example.com");
		const data = JSON.stringify({ id: "p1", name: "小明" });
		await db
			.prepare(
				"INSERT INTO matchmaker_players (user_id, id, data, sort_order, version, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
			)
			.bind("mp-rw-user", "p1", data, 3, 2, NOW + 9)
			.run();

		const row = await db
			.prepare("SELECT data, sort_order, version, updated_at FROM matchmaker_players WHERE user_id = ? AND id = ?")
			.bind("mp-rw-user", "p1")
			.first();

		expect(row).toEqual({ data, sort_order: 3, version: 2, updated_at: NOW + 9 });
	});

	it("同一使用者的參賽者 id 不可重複，不同使用者可使用相同 id", async () => {
		const db = getTestDb();
		await insertUser(db, "mp-dup-a", "mp-dup-a@example.com");
		await insertUser(db, "mp-dup-b", "mp-dup-b@example.com");
		const insertRow = (userId: string) =>
			db
				.prepare(
					"INSERT INTO matchmaker_players (user_id, id, data, sort_order, version, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
				)
				.bind(userId, "p1", "{}", 0, 1, NOW)
				.run();

		await insertRow("mp-dup-a");
		await expect(insertRow("mp-dup-a")).rejects.toThrow(/UNIQUE|PRIMARY KEY/);
		await insertRow("mp-dup-b");

		expect(
			await countRows(
				db,
				"SELECT COUNT(*) AS n FROM matchmaker_players WHERE user_id IN (?, ?) AND id = ?",
				"mp-dup-a",
				"mp-dup-b",
				"p1",
			),
		).toBe(2);
	});

	it("matchmaker_players 的 user_id 必須參照既有使用者", async () => {
		const db = getTestDb();
		await expect(
			db
				.prepare(
					"INSERT INTO matchmaker_players (user_id, id, data, sort_order, version, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
				)
				.bind("mp-ghost-user", "p1", "{}", 0, 1, NOW)
				.run(),
		).rejects.toThrow(/FOREIGN KEY/);
	});

	it("刪除使用者時其 matchmaker_players 一併刪除", async () => {
		const db = getTestDb();
		const userId = "mp-cascade-user";
		await insertUser(db, userId, "mp-cascade@example.com");
		for (const id of ["p1", "p2"]) {
			await db
				.prepare(
					"INSERT INTO matchmaker_players (user_id, id, data, sort_order, version, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
				)
				.bind(userId, id, "{}", 0, 1, NOW)
				.run();
		}

		// 先確認資料確實建立，避免刪除後的 0 是恆真
		expect(
			await countRows(db, "SELECT COUNT(*) AS n FROM matchmaker_players WHERE user_id = ?", userId),
		).toBe(2);

		await db.prepare("DELETE FROM user WHERE id = ?").bind(userId).run();

		expect(
			await countRows(db, "SELECT COUNT(*) AS n FROM matchmaker_players WHERE user_id = ?", userId),
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

	// 以下四個 it 對應 B7 新增的 matchmaker_round／matchmaker_match_slots／matchmaker_history／sync_batch_guards。
	it("matchmaker_round、matchmaker_match_slots、matchmaker_history 與 sync_batch_guards 可由 migration 建立並寫入讀回", async () => {
		const db = getTestDb();
		const userId = "b7-rw-user";
		await insertUser(db, userId, "b7-rw@example.com");
		const roundData = JSON.stringify({ matches: [], note: "回合" });
		const slotData = JSON.stringify({ games: [], note: "分槽" });
		const historyData = JSON.stringify({ matchId: "m1", note: "歷史" });
		await db
			.prepare("INSERT INTO matchmaker_round (user_id, data, version, updated_at) VALUES (?, ?, ?, ?)")
			.bind(userId, roundData, 4, NOW + 1)
			.run();
		await db
			.prepare(
				"INSERT INTO matchmaker_match_slots (user_id, match_id, data, version, updated_at) VALUES (?, ?, ?, ?, ?)",
			)
			.bind(userId, "m1", slotData, 5, NOW + 2)
			.run();
		await db
			.prepare(
				"INSERT INTO matchmaker_history (user_id, match_id, played_at, data, version, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
			)
			.bind(userId, "m1", NOW + 3, historyData, 1, NOW + 4)
			.run();
		await db
			.prepare("INSERT INTO sync_batch_guards (user_id, version, updated_at) VALUES (?, ?, ?)")
			.bind(userId, 1, NOW + 5)
			.run();

		expect(
			await db
				.prepare("SELECT data, version, updated_at FROM matchmaker_round WHERE user_id = ?")
				.bind(userId)
				.first(),
		).toEqual({ data: roundData, version: 4, updated_at: NOW + 1 });
		expect(
			await db
				.prepare(
					"SELECT match_id, data, version, updated_at FROM matchmaker_match_slots WHERE user_id = ?",
				)
				.bind(userId)
				.first(),
		).toEqual({ match_id: "m1", data: slotData, version: 5, updated_at: NOW + 2 });
		expect(
			await db
				.prepare(
					"SELECT match_id, played_at, data, version, updated_at FROM matchmaker_history WHERE user_id = ?",
				)
				.bind(userId)
				.first(),
		).toEqual({
			match_id: "m1",
			played_at: NOW + 3,
			data: historyData,
			version: 1,
			updated_at: NOW + 4,
		});
		expect(
			await db
				.prepare("SELECT version, updated_at FROM sync_batch_guards WHERE user_id = ?")
				.bind(userId)
				.first(),
		).toEqual({ version: 1, updated_at: NOW + 5 });
		// 守衛表平時恆為空：讀回後清掉本 it 寫入的列
		await db.prepare("DELETE FROM sync_batch_guards WHERE user_id = ?").bind(userId).run();
		expect(await countRows(db, "SELECT COUNT(*) AS n FROM sync_batch_guards WHERE user_id = ?", userId)).toBe(0);
	});

	it("回合每位使用者一筆，分槽與歷史的 match_id 只在同一使用者內唯一", async () => {
		const db = getTestDb();
		await insertUser(db, "b7-pk-a", "b7-pk-a@example.com");
		await insertUser(db, "b7-pk-b", "b7-pk-b@example.com");
		const insertRound = (userId: string) =>
			db
				.prepare("INSERT INTO matchmaker_round (user_id, data, version, updated_at) VALUES (?, ?, ?, ?)")
				.bind(userId, "{}", 1, NOW)
				.run();
		const insertSlot = (userId: string) =>
			db
				.prepare(
					"INSERT INTO matchmaker_match_slots (user_id, match_id, data, version, updated_at) VALUES (?, ?, ?, ?, ?)",
				)
				.bind(userId, "m1", "{}", 1, NOW)
				.run();
		const insertHistory = (userId: string) =>
			db
				.prepare(
					"INSERT INTO matchmaker_history (user_id, match_id, played_at, data, version, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
				)
				.bind(userId, "m1", NOW, "{}", 1, NOW)
				.run();

		await insertRound("b7-pk-a");
		await insertSlot("b7-pk-a");
		await insertHistory("b7-pk-a");

		await expect(insertRound("b7-pk-a")).rejects.toThrow(/UNIQUE|PRIMARY KEY/);
		await expect(insertSlot("b7-pk-a")).rejects.toThrow(/UNIQUE|PRIMARY KEY/);
		await expect(insertHistory("b7-pk-a")).rejects.toThrow(/UNIQUE|PRIMARY KEY/);

		// 使用者 B 使用相同的 match_id 必須成功
		await insertRound("b7-pk-b");
		await insertSlot("b7-pk-b");
		await insertHistory("b7-pk-b");

		expect(
			await countRows(
				db,
				"SELECT COUNT(*) AS n FROM matchmaker_match_slots WHERE user_id IN (?, ?) AND match_id = ?",
				"b7-pk-a",
				"b7-pk-b",
				"m1",
			),
		).toBe(2);
		expect(
			await countRows(
				db,
				"SELECT COUNT(*) AS n FROM matchmaker_history WHERE user_id IN (?, ?) AND match_id = ?",
				"b7-pk-a",
				"b7-pk-b",
				"m1",
			),
		).toBe(2);
	});

	it("sync_batch_guards 的 version 不可為 NULL", async () => {
		const db = getTestDb();
		await insertUser(db, "b7-guard-user", "b7-guard@example.com");
		await expect(
			db
				.prepare("INSERT INTO sync_batch_guards (user_id, version, updated_at) VALUES (?, NULL, ?)")
				.bind("b7-guard-user", NOW)
				.run(),
		).rejects.toThrow(/NOT NULL/);

		// 不得有 DEFAULT：SQLite 的 OR REPLACE 會以預設值取代 NULL 而使守衛失效
		const versionColumn = await db
			.prepare("SELECT dflt_value FROM pragma_table_info('sync_batch_guards') WHERE name = 'version'")
			.first<{ dflt_value: string | null }>();
		expect(versionColumn?.dflt_value).toBeNull();
	});

	it("刪除使用者時其回合、分槽與歷史一併刪除", async () => {
		const db = getTestDb();
		const userId = "b7-cascade-user";
		await insertUser(db, userId, "b7-cascade@example.com");
		await db
			.prepare("INSERT INTO matchmaker_round (user_id, data, version, updated_at) VALUES (?, ?, ?, ?)")
			.bind(userId, "{}", 1, NOW)
			.run();
		await db
			.prepare(
				"INSERT INTO matchmaker_match_slots (user_id, match_id, data, version, updated_at) VALUES (?, ?, ?, ?, ?)",
			)
			.bind(userId, "m1", "{}", 1, NOW)
			.run();
		await db
			.prepare(
				"INSERT INTO matchmaker_history (user_id, match_id, played_at, data, version, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
			)
			.bind(userId, "m1", NOW, "{}", 1, NOW)
			.run();

		const tables = ["matchmaker_round", "matchmaker_match_slots", "matchmaker_history"];
		// 先確認資料確實建立，避免刪除後的 0 是恆真
		for (const table of tables) {
			expect(
				await countRows(db, `SELECT COUNT(*) AS n FROM ${table} WHERE user_id = ?`, userId),
				`${table} 刪除前應有 1 列`,
			).toBe(1);
		}

		await db.prepare("DELETE FROM user WHERE id = ?").bind(userId).run();

		for (const table of tables) {
			expect(
				await countRows(db, `SELECT COUNT(*) AS n FROM ${table} WHERE user_id = ?`, userId),
				`${table} 刪除後應為 0 列`,
			).toBe(0);
		}
	});

	// regression guard（寫入即綠）：補新表 NOT NULL 欄位的約束覆蓋。
	it("回合、分槽、歷史的 data 與歷史的 played_at 不可為 NULL", async () => {
		const db = getTestDb();
		const userId = "b7-null-user";
		await insertUser(db, userId, "b7-null@example.com");
		const statements = [
			["matchmaker_round.data", "INSERT INTO matchmaker_round (user_id, data, version, updated_at) VALUES (?, NULL, 1, ?)", [userId, NOW]],
			["matchmaker_match_slots.data", "INSERT INTO matchmaker_match_slots (user_id, match_id, data, version, updated_at) VALUES (?, 'm1', NULL, 1, ?)", [userId, NOW]],
			["matchmaker_history.data", "INSERT INTO matchmaker_history (user_id, match_id, played_at, data, version, updated_at) VALUES (?, 'm1', ?, NULL, 1, ?)", [userId, NOW, NOW]],
			["matchmaker_history.played_at", "INSERT INTO matchmaker_history (user_id, match_id, played_at, data, version, updated_at) VALUES (?, 'm1', NULL, '{}', 1, ?)", [userId, NOW]],
		] as const;
		for (const [label, statement, params] of statements) {
			await expect(db.prepare(statement).bind(...params).run(), label).rejects.toThrow(/NOT NULL/);
		}
	});
});
