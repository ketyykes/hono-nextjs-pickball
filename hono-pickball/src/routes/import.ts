import { API_ERROR_CODES } from "@pickball/core/api/errors";
import { AppendImportRequestSchema, IMPORT_BODY_LIMIT_BYTES, LocalImportRequestSchema } from "@pickball/core/api/import";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { localAuth } from "../auth/local-auth-middleware";
import { requireExpectedUser } from "../auth/require-expected-user";
import { requireSession, type SessionAppEnv } from "../auth/require-session";
import { getDb } from "../db/client";
import { jsonBodyLimit } from "../http/body-limit";
import { invalidBodyHook, userDataOnError } from "../http/invalid-body";
import { appendLocalBackup, importLocalData } from "../import/local-import-repository";

export const importRoutes = new Hono<SessionAppEnv>()
	// 匯入寫錯帳號的後果最大（整份訪客資料進入別人的雲端且無法撤回），所以預期帳號守衛不可省
	.use("*", localAuth, requireSession, requireExpectedUser)
	.onError(userDataOnError)
	.post("/", jsonBodyLimit(IMPORT_BODY_LIMIT_BYTES), zValidator("json", LocalImportRequestSchema, invalidBodyHook), async (c) => {
		const outcome = await importLocalData(getDb(c.env), c.var.user.id, c.req.valid("json"));
		if (outcome.kind === "conflict") {
			return c.json({ error: API_ERROR_CODES.VERSION_CONFLICT }, 409);
		}
		if (outcome.kind === "too-large") {
			return c.json({ error: API_ERROR_CODES.PAYLOAD_TOO_LARGE }, 413);
		}
		return c.json({ imported: outcome.value });
	})
	.post("/append", jsonBodyLimit(IMPORT_BODY_LIMIT_BYTES), zValidator("json", AppendImportRequestSchema, invalidBodyHook), async (c) => {
		const outcome = await appendLocalBackup(getDb(c.env), c.var.user.id, c.req.valid("json"));
		if (outcome.kind === "too-large") {
			return c.json({ error: API_ERROR_CODES.PAYLOAD_TOO_LARGE }, 413);
		}
		return c.json({ appended: outcome.value });
	});
