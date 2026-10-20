import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { getDb } from "../db/client";
import * as schema from "../db/schema";
import { isLocalAuthEnabled } from "./local-auth";

/**
 * createAuth 的 env 型別：cf-typegen 把範例檔的鍵產成必填 string，
 * 但遠端實況可能缺值，因此收窄成允許 undefined 並於讀取時以值檢查。
 * GOOGLE_CLIENT_ID／GOOGLE_CLIENT_SECRET 不在範例檔內，需自行宣告。
 */
export type AuthEnv = Pick<CloudflareBindings, "DB"> & {
	ENVIRONMENT: string | undefined;
	BETTER_AUTH_SECRET: string | undefined;
	BETTER_AUTH_URL: string | undefined;
	GOOGLE_CLIENT_ID?: string;
	GOOGLE_CLIENT_SECRET?: string;
};

/**
 * 每個請求依 env 建立 auth 實例。Workers 的 binding 只能在請求內取得，
 * 且 gating 測試需要注入不同 env，所以不在模組層建立。
 */
export function createAuth(env: AuthEnv) {
	if (!env.BETTER_AUTH_SECRET) {
		throw new Error("缺少 BETTER_AUTH_SECRET：不得以預設 secret 運作，請檢查 .dev.vars");
	}
	if (!env.BETTER_AUTH_URL) {
		throw new Error("缺少 BETTER_AUTH_URL：baseURL 與 trustedOrigins 皆取自此值，請檢查 .dev.vars");
	}

	// D1 沒有互動式 transaction，adapter 必須關閉 transaction
	const database = drizzleAdapter(getDb(env), { provider: "sqlite", schema, transaction: false });

	// 兩個值都在才註冊，避免只填一半時 provider 半啟用
	const { GOOGLE_CLIENT_ID: googleClientId, GOOGLE_CLIENT_SECRET: googleClientSecret } = env;
	const socialProviders =
		googleClientId && googleClientSecret
			? { google: { clientId: googleClientId, clientSecret: googleClientSecret } }
			: {};

	return betterAuth({
		database,
		baseURL: env.BETTER_AUTH_URL,
		trustedOrigins: [env.BETTER_AUTH_URL],
		secret: env.BETTER_AUTH_SECRET,
		emailAndPassword: {
			// 與 gate 共用同一個判斷，gate 被移除時這裡仍是第二道防線
			enabled: isLocalAuthEnabled(env),
			disableSignUp: true,
		},
		socialProviders,
	});
}
