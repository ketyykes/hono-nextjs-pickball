import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import app from "../src/index";
import { buildTestAccountSeedSql } from "../src/db/seed/test-account";

// 停用／缺值／無 DB 情境的 env 由 exports.default 固定，只能以 app.request 注入覆寫後的 env。
const password = "test-password-gating";

async function seed(email: string): Promise<void> {
	if (!env.DB) {
		throw new Error("D1 binding DB 不存在");
	}
	await env.DB.exec(await buildTestAccountSeedSql({ email, password, name: "Gating", now: new Date(1_700_000_000_000) }));
}

function signInRequest(email: string): RequestInit {
	return {
		method: "POST",
		headers: { "Content-Type": "application/json", Origin: "http://localhost:3005" },
		body: JSON.stringify({ email, password }),
	};
}

describe("本機登入 gate", () => {
	it("ENVIRONMENT 缺值時 sign-in 回 404 且不發 cookie", async () => {
		await seed("gating-missing@example.com");

		const res = await app.request(
			"/api/auth/sign-in/email",
			signInRequest("gating-missing@example.com"),
			{ ...env, ENVIRONMENT: undefined },
		);

		expect(res.status).toBe(404);
		expect(res.headers.get("set-cookie")).toBeNull();
	});

	it("ENVIRONMENT 為 production 時 sign-in 回 404 且不發 cookie", async () => {
		await seed("gating-production@example.com");

		const res = await app.request(
			"/api/auth/sign-in/email",
			signInRequest("gating-production@example.com"),
			{ ...env, ENVIRONMENT: "production" },
		);

		expect(res.status).toBe(404);
		expect(res.headers.get("set-cookie")).toBeNull();
	});

	it("停用且無 DB binding 時 auth 路由與 /api/me 皆回 404", async () => {
		// 等同正式部署設定：沒有 ENVIRONMENT 也沒有 DB
		const productionLikeEnv = { ...env, ENVIRONMENT: undefined, DB: undefined };

		const authRes = await app.request("/api/auth/get-session", {}, productionLikeEnv);
		const meRes = await app.request("/api/me", {}, productionLikeEnv);

		expect(authRes.status).toBe(404);
		expect(meRes.status).toBe(404);
	});
});
