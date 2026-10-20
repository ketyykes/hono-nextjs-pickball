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

	// 覆蓋測試：實作早已帶入 schema，寫入即綠，並非 RED。
	// db.query 只有在 drizzle 帶入 schema 時才存在，用來鎖住「帶入全部資料表定義」。
	it("getDb 回傳的實例帶入 schema，可用 relational query 讀回 user", async () => {
		const db = getDb(env);
		const now = new Date(1_700_000_000_000);
		await db.insert(user).values({
			id: "db-client-user-2",
			name: "relational query 測試使用者",
			email: "db-client-2@example.com",
			createdAt: now,
			updatedAt: now,
		});

		const row = await db.query.user.findFirst({
			where: (u, { eq }) => eq(u.email, "db-client-2@example.com"),
		});

		expect(row?.id).toBe("db-client-user-2");
	});

	it("DB binding 不存在時 getDb 立即拋出含 DB 字樣的錯誤", () => {
		expect(() => getDb({ ...env, DB: undefined })).toThrow(/DB/);
	});
});
