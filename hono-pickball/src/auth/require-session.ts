import { createMiddleware } from "hono/factory";
import type { createAuth } from "./create-auth";

type AuthInstance = ReturnType<typeof createAuth>;
type AuthSession = AuthInstance["$Infer"]["Session"];

/** 掛上 auth 相關 middleware 的路由共用的 Hono 型別參數。 */
export type AuthAppEnv = {
	Bindings: CloudflareBindings;
	Variables: {
		auth: AuthInstance;
		user: AuthSession["user"];
		session: AuthSession["session"];
	};
};

/**
 * 以 context 內既有的 auth 實例驗證 session；無有效 session 一律 401。
 * 不 try/catch：查詢失敗要讓授權路徑回 500，不能默默放行或降級成未登入。
 */
export const requireSession = createMiddleware<AuthAppEnv>(async (c, next) => {
	const result = await c.var.auth.api.getSession({ headers: c.req.raw.headers });
	if (!result) {
		return c.json({ error: "UNAUTHORIZED" }, 401);
	}
	c.set("user", result.user);
	c.set("session", result.session);
	await next();
});
