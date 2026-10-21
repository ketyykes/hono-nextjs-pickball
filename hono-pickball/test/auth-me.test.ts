import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import "../src/index";
import { buildTestAccountSeedSql } from "../src/db/seed/test-account";

// storage 以測試檔隔離，同檔 it 共用 D1，各 it 使用不同 email。
const password = "test-password-me";
const origin = "http://localhost:3005";

async function seed(email: string, name = "Me"): Promise<void> {
	if (!env.DB) {
		throw new Error("D1 binding DB 不存在");
	}
	await env.DB.exec(await buildTestAccountSeedSql({ email, password, name, now: new Date(1_700_000_000_000) }));
}

async function userIdOf(email: string): Promise<string> {
	if (!env.DB) {
		throw new Error("D1 binding DB 不存在");
	}
	const row = await env.DB.prepare("SELECT id FROM user WHERE email = ?").bind(email).first<{ id: string }>();
	if (!row) {
		throw new Error(`找不到使用者 ${email}`);
	}
	return row.id;
}

/** 登入並回傳可直接放進 Cookie header 的 name=value。 */
async function signIn(email: string): Promise<string> {
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

function getMe(cookie?: string, query = ""): Promise<Response> {
	return exports.default.fetch(
		new Request(`${origin}/api/me${query}`, { headers: cookie ? { Cookie: cookie } : {} }),
	);
}

describe("GET /api/me", () => {
	it("未登入呼叫 /api/me 回 401", async () => {
		const res = await getMe();

		expect(res.status).toBe(401);
		expect(await res.json()).toEqual({ error: "UNAUTHORIZED" });
	});

	it("偽造的 session cookie 呼叫 /api/me 回 401", async () => {
		const res = await getMe("better-auth.session_token=forged");

		expect(res.status).toBe(401);
		expect(await res.json()).toEqual({ error: "UNAUTHORIZED" });
	});

	it("登入後 /api/me 回本人的 id、email 與 name", async () => {
		const email = "me-self@example.com";
		await seed(email, "Self");
		const cookie = await signIn(email);

		const res = await getMe(cookie);

		expect(res.status).toBe(200);
		const body = (await res.json()) as { user: Record<string, unknown> };
		expect(Object.keys(body.user).sort()).toEqual(["email", "id", "name"]);
		expect(body.user.email).toBe(email);
		expect(body.user.id).toBe(await userIdOf(email));
		expect(body.user.name).toBe("Self");
	});

	it("A 的 cookie 只能取得 A 而非 B 的資料", async () => {
		const emailA = "me-user-a@example.com";
		const emailB = "me-user-b@example.com";
		await seed(emailA, "A");
		await seed(emailB, "B");
		const idA = await userIdOf(emailA);
		const idB = await userIdOf(emailB);
		const cookieA = await signIn(emailA);

		// 帶上 B 的 id 當 query，確認端點不會依請求參數改變回傳對象
		const res = await getMe(cookieA, `?userId=${idB}`);

		expect(res.status).toBe(200);
		const body = (await res.json()) as { user: { id: string; email: string } };
		expect(body.user.id).toBe(idA);
		expect(body.user.id).not.toBe(idB);
		expect(body.user.email).toBe(emailA);
	});

	it("登出後原 session cookie 呼叫 /api/me 回 401", async () => {
		const email = "me-sign-out@example.com";
		await seed(email);
		const cookie = await signIn(email);
		expect((await getMe(cookie)).status).toBe(200);

		const signOut = await exports.default.fetch(
			new Request(`${origin}/api/auth/sign-out`, {
				method: "POST",
				headers: { "Content-Type": "application/json", Origin: origin, Cookie: cookie },
				body: "{}",
			}),
		);
		expect(signOut.status).toBe(200);

		const res = await getMe(cookie);
		expect(res.status).toBe(401);
	});
});
