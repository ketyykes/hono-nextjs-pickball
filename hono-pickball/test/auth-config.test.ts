import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import "../src/index";
import { createAuth } from "../src/auth/create-auth";
import { isLocalAuthEnabled } from "../src/auth/local-auth";

describe("isLocalAuthEnabled", () => {
	it("isLocalAuthEnabled 只在 ENVIRONMENT 恰為 development 時為真", () => {
		// 反向設計：缺值、空字串、大小寫不同都必須視為停用
		expect(isLocalAuthEnabled({ ENVIRONMENT: undefined })).toBe(false);
		expect(isLocalAuthEnabled({ ENVIRONMENT: "" })).toBe(false);
		expect(isLocalAuthEnabled({ ENVIRONMENT: "production" })).toBe(false);
		expect(isLocalAuthEnabled({ ENVIRONMENT: "Development" })).toBe(false);
		expect(isLocalAuthEnabled({ ENVIRONMENT: "development" })).toBe(true);
	});
});

describe("createAuth", () => {
	it("缺少 BETTER_AUTH_SECRET 時 createAuth 拋錯", () => {
		expect(() => createAuth({ ...env, BETTER_AUTH_SECRET: undefined })).toThrow(/BETTER_AUTH_SECRET/);
	});

	it("缺少 BETTER_AUTH_URL 時 createAuth 拋錯", () => {
		expect(() => createAuth({ ...env, BETTER_AUTH_URL: undefined })).toThrow(/BETTER_AUTH_URL/);
	});

	it("baseURL 與 trustedOrigins 皆取自 BETTER_AUTH_URL", () => {
		// 覆寫值刻意異於 vitest binding，才擋得住把實作寫死成 binding 值
		const auth = createAuth({ ...env, BETTER_AUTH_URL: "http://other.test:4321", BETTER_AUTH_SECRET: "probe-secret-for-assertion" });
		expect(auth.options.baseURL).toBe("http://other.test:4321");
		expect(auth.options.trustedOrigins).toEqual(["http://other.test:4321"]);
		expect(auth.options.secret).toBe("probe-secret-for-assertion");
	});

	it("emailAndPassword 只在 development 啟用且一律禁止註冊", () => {
		const enabled = createAuth({ ...env, ENVIRONMENT: "development" });
		expect(enabled.options.emailAndPassword?.enabled).toBe(true);
		expect(enabled.options.emailAndPassword?.disableSignUp).toBe(true);

		const disabled = createAuth({ ...env, ENVIRONMENT: undefined });
		expect(disabled.options.emailAndPassword?.enabled).toBe(false);
		expect(disabled.options.emailAndPassword?.disableSignUp).toBe(true);
	});

	it("Google provider 只在 client id 與 secret 皆存在時註冊", () => {
		const none = createAuth({ ...env });
		expect(none.options.socialProviders?.google).toBeUndefined();

		const onlyId = createAuth({ ...env, GOOGLE_CLIENT_ID: "fake-client-id" });
		expect(onlyId.options.socialProviders?.google).toBeUndefined();

		const onlySecret = createAuth({ ...env, GOOGLE_CLIENT_SECRET: "fake-client-secret" });
		expect(onlySecret.options.socialProviders?.google).toBeUndefined();

		const both = createAuth({ ...env, GOOGLE_CLIENT_ID: "fake-client-id", GOOGLE_CLIENT_SECRET: "fake-client-secret" });
		expect(both.options.socialProviders?.google).toMatchObject({ clientId: "fake-client-id", clientSecret: "fake-client-secret" });
	});
});
