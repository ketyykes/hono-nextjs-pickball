import { API_ERROR_CODES } from "@pickball/core/api/errors";
import { EXPECTED_USER_ID_HEADER } from "@pickball/core/api/headers";
import { createMiddleware } from "hono/factory";
import type { SessionAppEnv } from "./require-session";

/**
 * 比對前端宣告的預期帳號與 session 的實際帳號。
 * 同一瀏覽器的分頁共用 cookie，另一分頁換帳號後本分頁的請求會以新帳號通過 requireSession；
 * 缺標頭與不符共用同一個錯誤碼（fail-closed），且在 validator 與 handler 之前結束，資料因此不會被動到。
 * 必須排在 requireSession 之後：未登入要維持 UNAUTHORIZED，這裡才讀得到 c.var.user。
 */
export const requireExpectedUser = createMiddleware<SessionAppEnv>(async (c, next) => {
	const expectedUserId = c.req.header(EXPECTED_USER_ID_HEADER);
	if (!expectedUserId || expectedUserId !== c.var.user.id) {
		return c.json({ error: API_ERROR_CODES.ACCOUNT_MISMATCH }, 401);
	}
	await next();
});
