import { env } from "cloudflare:workers";
import { USER_DATA_TABLES } from "@pickball/core/api/user-data-tables";
import { describe, expect, it } from "vitest";
import "../src/index";

// auth 核心四張表不屬於使用者資料表；其餘資料表都必須列入 USER_DATA_TABLES。
const AUTH_CORE_TABLES = ["user", "session", "account", "verification"];

function getTestDb(): D1Database {
	if (!env.DB) {
		throw new Error("env.DB 不存在：測試夾具未帶入 env.local 的 D1 binding");
	}
	return env.DB;
}

describe("使用者資料表清單與欄位慣例", () => {
	it("USER_DATA_TABLES 恰為 auth 以外的所有資料表", async () => {
		const db = getTestDb();
		const { results } = await db
			.prepare(
				"SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name <> 'd1_migrations'",
			)
			.all<{ name: string }>();

		const actual = results
			.map((row) => row.name)
			.filter((name) => !AUTH_CORE_TABLES.includes(name))
			.sort();

		// 長度 >= 1 擋掉「兩邊都是空陣列」的恆真
		expect(USER_DATA_TABLES.length).toBeGreaterThanOrEqual(1);
		expect(actual).toEqual([...USER_DATA_TABLES].sort());
	});

	it("每張使用者資料表皆有 user_id、version 與 updated_at 且 user_id 參照 user 並 cascade", async () => {
		const db = getTestDb();
		expect(USER_DATA_TABLES.length).toBeGreaterThanOrEqual(1);

		for (const table of USER_DATA_TABLES) {
			const { results: columns } = await db
				.prepare("SELECT name, \"notnull\" AS not_null FROM pragma_table_info(?)")
				.bind(table)
				.all<{ name: string; not_null: number }>();
			for (const required of ["user_id", "version", "updated_at"]) {
				const column = columns.find((c) => c.name === required);
				expect(column, `${table}.${required} 應存在`).toBeDefined();
				expect(column?.not_null, `${table}.${required} 應為 NOT NULL`).toBe(1);
			}

			const { results: foreignKeys } = await db
				.prepare('SELECT "table" AS ref_table, "from" AS from_col, "to" AS to_col, on_delete FROM pragma_foreign_key_list(?)')
				.bind(table)
				.all<{ ref_table: string; from_col: string; to_col: string; on_delete: string }>();
			const userFk = foreignKeys.find((fk) => fk.from_col === "user_id");
			expect(userFk, `${table}.user_id 應有 foreign key`).toEqual({
				ref_table: "user",
				from_col: "user_id",
				to_col: "id",
				on_delete: "CASCADE",
			});
		}
	});
});
