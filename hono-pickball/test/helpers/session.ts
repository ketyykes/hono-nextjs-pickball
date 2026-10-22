import { env, exports } from "cloudflare:workers";
import { expect } from "vitest";
import { buildTestAccountSeedSql } from "../../src/db/seed/test-account";

// 假密碼，只存在於測試用 D1，不是 .dev.vars 的真帳密。
const password = "test-password-helper";
const origin = "http://localhost:3005";

function getDb(): D1Database {
	if (!env.DB) {
		throw new Error("D1 binding DB 不存在");
	}
	return env.DB;
}

/** 建立可登入的測試使用者。 */
export async function seedUser(email: string, name = "Helper"): Promise<void> {
	await getDb().exec(await buildTestAccountSeedSql({ email, password, name, now: new Date(1_700_000_000_000) }));
}

export async function userIdOf(email: string): Promise<string> {
	const row = await getDb().prepare("SELECT id FROM user WHERE email = ?").bind(email).first<{ id: string }>();
	if (!row) {
		throw new Error(`找不到使用者 ${email}`);
	}
	return row.id;
}

/** 登入並回傳可直接放進 Cookie header 的 name=value。 */
export async function signIn(email: string): Promise<string> {
	const res = await exports.default.fetch(
		new Request(`${origin}/api/auth/sign-in/email`, {
			method: "POST",
			headers: { "Content-Type": "application/json", Origin: origin },
			body: JSON.stringify({ email, password }),
		}),
	);
	expect(res.status).toBe(200);
	const cookie = (res.headers.get("set-cookie") ?? "").split(";")[0];
	expect(cookie).toContain("better-auth.session_token=");
	return cookie;
}
