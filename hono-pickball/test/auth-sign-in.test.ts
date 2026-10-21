import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import "../src/index";
import { buildTestAccountSeedSql } from "../src/db/seed/test-account";

// storage 以測試檔隔離，同檔 it 共用 D1，各 it 使用不同 email。
const password = "test-password-sign-in";

async function seed(email: string): Promise<void> {
	if (!env.DB) {
		throw new Error("D1 binding DB 不存在");
	}
	await env.DB.exec(await buildTestAccountSeedSql({ email, password, name: "Sign In", now: new Date(1_700_000_000_000) }));
}

function post(path: string, body: Record<string, string>): Promise<Response> {
	return exports.default.fetch(
		new Request(`http://localhost:3005${path}`, {
			method: "POST",
			headers: { "Content-Type": "application/json", Origin: "http://localhost:3005" },
			body: JSON.stringify(body),
		}),
	);
}

describe("POST /api/auth/sign-in/email", () => {
	it("帳密正確時回 200 並設定 HttpOnly、SameSite=Lax 的 session cookie", async () => {
		await seed("sign-in-ok@example.com");

		const res = await post("/api/auth/sign-in/email", { email: "sign-in-ok@example.com", password });

		expect(res.status).toBe(200);
		const setCookie = res.headers.get("set-cookie") ?? "";
		expect(setCookie).toContain("better-auth.session_token=");
		expect(setCookie).toContain("HttpOnly");
		expect(setCookie).toContain("SameSite=Lax");
		expect(setCookie).toContain("Path=/");
		// http baseURL 下加 Secure 會讓瀏覽器收不到 cookie
		expect(setCookie).not.toContain("Secure");
	});

	it("密碼錯誤時回 401 且不發 session cookie", async () => {
		await seed("sign-in-wrong@example.com");

		const res = await post("/api/auth/sign-in/email", { email: "sign-in-wrong@example.com", password: "test-password-wrong" });

		expect(res.status).toBe(401);
		expect(res.headers.get("set-cookie") ?? "").not.toContain("better-auth.session_token");
	});

	it("帳號不存在與密碼錯誤回應相同的 401", async () => {
		await seed("sign-in-enum@example.com");

		const wrongPassword = await post("/api/auth/sign-in/email", { email: "sign-in-enum@example.com", password: "test-password-wrong" });
		const noAccount = await post("/api/auth/sign-in/email", { email: "sign-in-nobody@example.com", password: "test-password-wrong" });

		expect(wrongPassword.status).toBe(401);
		expect(noAccount.status).toBe(401);
		expect(await noAccount.json()).toEqual(await wrongPassword.json());
	});
});

describe("POST /api/auth/sign-up/email", () => {
	it("註冊端點回 400 且不建立使用者", async () => {
		if (!env.DB) {
			throw new Error("D1 binding DB 不存在");
		}
		const email = "sign-up-new@example.com";

		const res = await post("/api/auth/sign-up/email", { email, password, name: "New" });

		expect(res.status).toBe(400);
		const row = await env.DB.prepare("SELECT COUNT(*) AS n FROM user WHERE email = ?").bind(email).first<{ n: number }>();
		expect(row?.n).toBe(0);
	});
});
