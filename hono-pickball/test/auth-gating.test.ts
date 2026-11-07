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

describe("Google 設定不全的 gate", () => {
	it("非 development 且 Google 設定不全時 auth 整組停用且不觸碰 D1", async () => {
		// 只設一半：不得半啟用，且沒有 DB binding 也不能 500
		const halfConfiguredEnv = { ...env, ENVIRONMENT: undefined, DB: undefined, GOOGLE_CLIENT_ID: "fake-client-id", GOOGLE_CLIENT_SECRET: "" };

		const sessionRes = await app.request("/api/session", {}, halfConfiguredEnv);
		const socialRes = await app.request(
			"/api/auth/sign-in/social",
			{
				method: "POST",
				headers: { "Content-Type": "application/json", Origin: "http://localhost:3005" },
				body: JSON.stringify({ provider: "google", callbackURL: "/", errorCallbackURL: "/login" }),
			},
			halfConfiguredEnv,
		);
		const meRes = await app.request("/api/me", {}, halfConfiguredEnv);

		expect(sessionRes.status).toBe(200);
		expect(await sessionRes.json()).toEqual({
			authEnabled: false,
			user: null,
			signInMethods: { google: false, emailPassword: false },
		});
		expect(socialRes.status).toBe(404);
		expect(meRes.status).toBe(404);
	});
});

describe("Google 啟用時的 email 端點", () => {
	it("非 development 且 Google 設定齊全時 email 登入與註冊回 404 且不發 cookie", async () => {
		const email = "gating-google-email@example.com";
		const signUpEmail = "gating-google-signup@example.com";
		await seed(email);
		const googleEnv = {
			...env,
			ENVIRONMENT: undefined,
			GOOGLE_CLIENT_ID: "fake-client-id",
			GOOGLE_CLIENT_SECRET: "fake-client-secret",
		};

		const signInRes = await app.request("/api/auth/sign-in/email", signInRequest(email), googleEnv);
		const signUpRes = await app.request(
			"/api/auth/sign-up/email",
			{
				method: "POST",
				headers: { "Content-Type": "application/json", Origin: "http://localhost:3005" },
				body: JSON.stringify({ email: signUpEmail, password, name: "Gating Signup" }),
			},
			googleEnv,
		);

		expect(signInRes.status).toBe(404);
		expect(signInRes.headers.get("set-cookie")).toBeNull();
		expect(signUpRes.status).toBe(404);
		expect(signUpRes.headers.get("set-cookie")).toBeNull();
		if (!env.DB) {
			throw new Error("D1 binding DB 不存在");
		}
		const created = await env.DB.prepare("SELECT count(*) AS total FROM user WHERE email = ?")
			.bind(signUpEmail)
			.first<{ total: number }>();
		expect(created?.total).toBe(0);
	});
});

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
