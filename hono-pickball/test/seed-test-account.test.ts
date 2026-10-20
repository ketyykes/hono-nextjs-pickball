import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
// 官方要求：import main 模組，src/ 改動時測試才會自動重跑。
import "../src/index";
import { buildTestAccountSeedSql } from "../src/db/seed/test-account";

// storage 以測試檔隔離，同檔 it 共用 D1，各 it 使用不同 email。
describe("buildTestAccountSeedSql", () => {
	it("seed SQL 不含明文密碼且正確跳脫單引號", async () => {
		if (!env.DB) {
			throw new Error("D1 binding DB 不存在");
		}
		const password = "p@ss'word";
		const sql = await buildTestAccountSeedSql({
			email: "o'neil-seed@example.com",
			password,
			name: "O'Neil",
			now: new Date(1_700_000_000_000),
		});

		expect(sql).not.toContain(password);
		// 明文被跳脫後會變成 p@ss''word，只比對原字串會漏掉這種外洩。
		expect(sql).not.toContain(password.replaceAll("'", "''"));

		await env.DB.exec(sql);
		const row = await env.DB
			.prepare("SELECT name FROM user WHERE email = ?")
			.bind("o'neil-seed@example.com")
			.first<{ name: string }>();
		expect(row?.name).toBe("O'Neil");
	});
});
