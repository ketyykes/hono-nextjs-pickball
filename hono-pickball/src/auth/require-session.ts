import { createMiddleware } from "hono/factory";
import type { createAuth } from "./create-auth";

type AuthInstance = ReturnType<typeof createAuth>;
type AuthSession = AuthInstance["$Infer"]["Session"];

/** 只有 auth 實例（localAuth 之後）的 Hono 型別參數；此層讀不到 user／session。 */
export type AuthAppEnv = {
	Bindings: CloudflareBindings;
	Variables: {
		auth: AuthInstance;
	};
};

/**
 * 經 requireSession 之後的 Hono 型別參數。
 * 與 AuthAppEnv 分開，才能讓「漏掛 requireSession 卻讀 c.var.user」成為型別錯誤。
 */
export type SessionAppEnv = {
	Bindings: CloudflareBindings;
	Variables: AuthAppEnv["Variables"] & {
		user: AuthSession["user"];
		session: AuthSession["session"];
	};
};

/**
 * 以 context 內既有的 auth 實例驗證 session；無有效 session 一律 401。
 * 不 try/catch：查詢失敗要讓授權路徑回 500，不能默默放行或降級成未登入。
 */
export const requireSession = createMiddleware<SessionAppEnv>(async (c, next) => {
	const result = await c.var.auth.api.getSession({ headers: c.req.raw.headers });
	if (!result) {
		return c.json({ error: "UNAUTHORIZED" }, 401);
	}
	c.set("user", result.user);
	c.set("session", result.session);
	await next();
});
