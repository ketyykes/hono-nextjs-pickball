import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
// 官方要求：import main 模組，src/ 改動時測試才會自動重跑。
import "../src/index";
import { buildTestAccountSeedSql, deriveSwitchAccountEmail } from "../src/db/seed/test-account";

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

	it("seed 產生的測試帳號可以登入", async () => {
		if (!env.DB) {
			throw new Error("D1 binding DB 不存在");
		}
		const email = "seed-login@example.com";
		const password = "test-password-seed-login";
		await env.DB.exec(
			await buildTestAccountSeedSql({ email, password, name: "Seed Login", now: new Date(1_700_000_000_000) }),
		);

		const res = await signIn(email, password);

		expect(res.status).toBe(200);
	});

	it("重複 seed 同一 email 只留下一筆且以最新密碼為準", async () => {
		if (!env.DB) {
			throw new Error("D1 binding DB 不存在");
		}
		const email = "seed-twice@example.com";
		const now = new Date(1_700_000_000_000);
		await env.DB.exec(await buildTestAccountSeedSql({ email, password: "test-password-first", name: "Twice", now }));
		await env.DB.exec(await buildTestAccountSeedSql({ email, password: "test-password-second", name: "Twice", now }));

		const users = await env.DB
			.prepare("SELECT id FROM user WHERE email = ?")
			.bind(email)
			.all<{ id: string }>();
		expect(users.results).toHaveLength(1);
		const userId = users.results[0].id;

		const accounts = await env.DB
			.prepare("SELECT account_id, provider_id FROM account WHERE user_id = ?")
			.bind(userId)
			.all<{ account_id: string; provider_id: string }>();
		expect(accounts.results).toHaveLength(1);
		// spec：accountId = userId、providerId = "credential"
		expect(accounts.results[0].account_id).toBe(userId);
		expect(accounts.results[0].provider_id).toBe("credential");

		expect((await signIn(email, "test-password-first")).status).toBe(401);
		expect((await signIn(email, "test-password-second")).status).toBe(200);
	});
});

describe("deriveSwitchAccountEmail", () => {
	it("deriveSwitchAccountEmail 產生不同於原值且固定的 email", () => {
		for (const input of ["tester@example.com", "tester+x@example.com"]) {
			const first = deriveSwitchAccountEmail(input);
			const second = deriveSwitchAccountEmail(input);

			expect(first.split("@")).toHaveLength(2);
			expect(first.split("@")[1]).toBe(input.split("@")[1]);
			expect(first).not.toBe(input);
			expect(second).toBe(first);
		}
	});

	it("衍生帳號與原帳號以同一組密碼皆可登入且為不同使用者", async () => {
		if (!env.DB) {
			throw new Error("D1 binding DB 不存在");
		}
		const email = "seed-switch@example.com";
		const switchEmail = deriveSwitchAccountEmail(email);
		const password = "test-password-switch";
		const now = new Date(1_700_000_000_000);
		await env.DB.exec(await buildTestAccountSeedSql({ email, password, name: "Switch", now }));
		await env.DB.exec(await buildTestAccountSeedSql({ email: switchEmail, password, name: "Switch B", now }));

		const original = await signIn(email, password);
		const derived = await signIn(switchEmail, password);

		expect(original.status).toBe(200);
		expect(derived.status).toBe(200);
		const originalBody = await original.json<{ user: { id: string } }>();
		const derivedBody = await derived.json<{ user: { id: string } }>();
		expect(derivedBody.user.id).not.toBe(originalBody.user.id);
	});
});

function signIn(email: string, password: string): Promise<Response> {
	return exports.default.fetch(
		new Request("http://localhost:3005/api/auth/sign-in/email", {
			method: "POST",
			headers: { "Content-Type": "application/json", Origin: "http://localhost:3005" },
			body: JSON.stringify({ email, password }),
		}),
	);
}
