import { env, exports } from "cloudflare:workers";
import { EXPECTED_USER_ID_HEADER } from "@pickball/core/api/headers";
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

// cookie → user id：讓請求 helper 能替每個成功路徑請求補上該 cookie 所屬使用者的預期帳號標頭，
// 而不必在每個 it 內手動傳 id（it 本體因此零改動）。
const userIdByCookie = new Map<string, string>();

/** 依 cookie 回傳 `X-Expected-User-Id` 標頭；未經 signIn 的 cookie 回空物件（不帶標頭）。 */
export function expectedUserHeader(cookie: string): Record<string, string> {
	const userId = userIdByCookie.get(cookie);
	if (userId === undefined) {
		return {};
	}
	return { [EXPECTED_USER_ID_HEADER]: userId };
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
	const body = (await res.json()) as { user: { id: string } };
	userIdByCookie.set(cookie, body.user.id);
	return cookie;
}
