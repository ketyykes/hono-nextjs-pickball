import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import app from "../src/index";
import { buildTestAccountSeedSql } from "../src/db/seed/test-account";

// storage 以測試檔隔離，同檔 it 共用 D1，各 it 使用不同 email。
// 停用／替身 DB 情境的 env 由 exports.default 固定，只能以 app.request 注入覆寫後的 env。
const password = "test-password-session";
const origin = "http://localhost:3005";

async function seed(email: string, name = "Session"): Promise<void> {
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

function getSession(cookie?: string): Promise<Response> {
	return exports.default.fetch(
		new Request(`${origin}/api/session`, { headers: cookie ? { Cookie: cookie } : {} }),
	);
}

/** 任何查詢都拋錯的 D1 替身。 */
const throwingDb = {
	prepare() {
		throw new Error("D1 查詢失敗（測試替身）");
	},
	batch() {
		throw new Error("D1 查詢失敗（測試替身）");
	},
	exec() {
		throw new Error("D1 查詢失敗（測試替身）");
	},
} as unknown as D1Database;

describe("GET /api/session", () => {
	it("停用且無 DB 時回 200 與 authEnabled false", async () => {
		const res = await app.request("/api/session", {}, { ...env, ENVIRONMENT: undefined, DB: undefined });

		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ authEnabled: false, user: null });
	});

	it("啟用但未登入時回 200 與 user null", async () => {
		const res = await getSession();

		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ authEnabled: true, user: null });
	});

	it("登入後回 200 與目前使用者的 id、email 與 name", async () => {
		const email = "session-self@example.com";
		await seed(email, "Self");
		const cookie = await signIn(email);

		const res = await getSession(cookie);

		expect(res.status).toBe(200);
		const body = (await res.json()) as { authEnabled: boolean; user: Record<string, unknown> };
		expect(body.authEnabled).toBe(true);
		expect(Object.keys(body.user).sort()).toEqual(["email", "id", "name"]);
		expect(body.user.email).toBe(email);
		expect(body.user.id).toBe(await userIdOf(email));
		expect(body.user.name).toBe("Self");
	});

	it("session 查詢拋錯時仍回 200 與 user null", async () => {
		// 用真實登入取得簽章正確的 cookie，確保 better-auth 一定會走到 DB 查詢而非提早判定無效
		const email = "session-db-down@example.com";
		await seed(email);
		const cookie = await signIn(email);
		const brokenEnv = { ...env, DB: throwingDb };
		const init = { headers: { Cookie: cookie } };

		const res = await app.request("/api/session", init, brokenEnv);
		// 同一個替身 env 與 cookie 打受保護端點：降級只屬於探針，授權路徑不得吞錯
		const meRes = await app.request("/api/me", init, brokenEnv);

		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ authEnabled: true, user: null });
		expect(meRes.status).toBe(500);
	});
});
