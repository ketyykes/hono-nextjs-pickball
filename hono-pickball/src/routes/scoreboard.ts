import { API_ERROR_CODES } from "@pickball/core/api/errors";
import { versionedWriteSchema } from "@pickball/core/api/versioned";
import { ScoreboardStateSchema } from "@pickball/core/scoreboard/types";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { localAuth } from "../auth/local-auth-middleware";
import { requireExpectedUser } from "../auth/require-expected-user";
import { requireSession, type SessionAppEnv } from "../auth/require-session";
import { getDb } from "../db/client";
import { invalidBodyHook, userDataOnError } from "../http/invalid-body";
import { getCurrent, putCurrent } from "../scoreboard/repository";

const putBodySchema = versionedWriteSchema(ScoreboardStateSchema);

export const scoreboardRoutes = new Hono<SessionAppEnv>()
	// 整個 sub-app 一律先過停用閘門、session 與預期帳號驗證，新增端點時不可能漏掛授權
	.use("*", localAuth, requireSession, requireExpectedUser)
	.onError(userDataOnError)
	.get("/current", async (c) => {
		const current = await getCurrent(getDb(c.env), c.var.user.id);
		// 尚無資料不回 404：瀏覽器會把 4xx 記為 console 錯誤
		return c.json(current ?? { data: null, version: 0 });
	})
	.put(
		"/current",
		zValidator("json", putBodySchema, invalidBodyHook),
		async (c) => {
			const { data, version } = c.req.valid("json");
			// current 只存獨立計分板；綁定場次的狀態在 B7 前一律留在本機
			if (data.matchId !== null) {
				return c.json({ error: API_ERROR_CODES.INVALID_BODY }, 400);
			}
			const saved = await putCurrent(getDb(c.env), c.var.user.id, data, version);
			if (!saved) {
				return c.json({ error: API_ERROR_CODES.VERSION_CONFLICT }, 409);
			}
			return c.json(saved);
		},
	);
