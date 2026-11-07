import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import app from "../src/index";

// 「非 development」是正式站實況（ENVIRONMENT 缺值）；Google 值為假值，授權網址由 better-auth 在本機組出，不需網路。
const origin = "http://localhost:3005";
const googleEnv = {
	...env,
	ENVIRONMENT: undefined,
	GOOGLE_CLIENT_ID: "fake-client-id",
	GOOGLE_CLIENT_SECRET: "fake-client-secret",
};

describe("Google 登入（非 development）", () => {
	it("非 development 且 Google 設定齊全時 sign-in/social 回傳導向 Google 的授權網址", async () => {
		const res = await app.request(
			"/api/auth/sign-in/social",
			{
				method: "POST",
				headers: { "Content-Type": "application/json", Origin: origin },
				body: JSON.stringify({ provider: "google", callbackURL: "/", errorCallbackURL: "/login" }),
			},
			googleEnv,
		);

		expect(res.status).toBe(200);
		const body = (await res.json()) as { redirect: boolean; url: string };
		expect(body.redirect).toBe(true);
		const url = new URL(body.url);
		expect(url.origin).toBe("https://accounts.google.com");
		expect(url.pathname).toBe("/o/oauth2/v2/auth");
		expect(url.searchParams.get("client_id")).toBe("fake-client-id");
		expect(url.searchParams.get("redirect_uri")).toBe(`${origin}/api/auth/callback/google`);
		// 場邊共用裝置換人登入時，Google 不得自動沿用上一位的帳號
		expect(url.searchParams.get("prompt")).toBe("select_account");
		const scopes = (url.searchParams.get("scope") ?? "").split(" ");
		expect(scopes).toEqual(expect.arrayContaining(["openid", "email", "profile"]));
	});

	it("非 development 且 Google 設定齊全時使用者資料 API 未登入回 401", async () => {
		// 閘門放行、由 requireSession 拒絕，而不是 404
		const scoreboardRes = await app.request("/api/scoreboard/current", {}, googleEnv);
		const playersRes = await app.request("/api/matchmaker/players", {}, googleEnv);

		expect(scoreboardRes.status).toBe(401);
		expect(await scoreboardRes.json()).toEqual({ error: "UNAUTHORIZED" });
		expect(playersRes.status).toBe(401);
		expect(await playersRes.json()).toEqual({ error: "UNAUTHORIZED" });
	});
});
