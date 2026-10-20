import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
// 官方要求：import main 模組，src/ 改動時測試才會自動重跑。
import "../src/index";
import { getDb } from "../src/db/client";
import { user } from "../src/db/schema";

// storage 以測試檔為隔離單位，本檔使用獨有的 id／email。
describe("getDb", () => {
	it("getDb 回傳的實例可寫入並讀回 user 資料列", async () => {
		const db = getDb(env);
		const now = new Date(1_700_000_000_000);
		await db.insert(user).values({
			id: "db-client-user-1",
			name: "getDb 測試使用者",
			email: "db-client-1@example.com",
			createdAt: now,
			updatedAt: now,
		});

		const rows = await db
			.select()
			.from(user)
			.where(eq(user.email, "db-client-1@example.com"));

		expect(rows).toHaveLength(1);
		expect(rows[0].id).toBe("db-client-user-1");
		expect(rows[0].name).toBe("getDb 測試使用者");
		expect(rows[0].email).toBe("db-client-1@example.com");
	});

	it("DB binding 不存在時 getDb 立即拋出含 DB 字樣的錯誤", () => {
		expect(() => getDb({ ...env, DB: undefined })).toThrow(/DB/);
	});
});
