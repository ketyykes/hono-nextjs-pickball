import { API_ERROR_CODES } from "@pickball/core/api/errors";
import { PlayerImportRequestSchema } from "@pickball/core/api/players";
import { versionedWriteSchema } from "@pickball/core/api/versioned";
import { PlayerSchema } from "@pickball/core/matchmaker/types";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { localAuth } from "../auth/local-auth-middleware";
import { requireSession, type SessionAppEnv } from "../auth/require-session";
import { getDb } from "../db/client";
import {
	deletePlayer,
	importPlayers,
	listPlayers,
	putPlayer,
	resetMatchmaker,
} from "../matchmaker/players-repository";

const putBodySchema = versionedWriteSchema(PlayerSchema);

export const matchmakerRoutes = new Hono<SessionAppEnv>()
	// 整個 sub-app 一律先過停用閘門與 session 驗證，新增端點時不可能漏掛授權
	.use("*", localAuth, requireSession)
	// JSON 語法錯誤由 Hono 拋 HTTPException(400)（純文字）；契約要求統一回 INVALID_BODY
	.onError((err, c) => {
		if (err instanceof HTTPException && err.status === 400) {
			return c.json({ error: API_ERROR_CODES.INVALID_BODY }, 400);
		}
		// 其餘錯誤維持 Hono 預設行為（sub-app 的 onError 會取代預設處理）
		if (err instanceof HTTPException) {
			return err.getResponse();
		}
		console.error(err);
		return c.text("Internal Server Error", 500);
	})
	.get("/players", async (c) => {
		const items = await listPlayers(getDb(c.env), c.var.user.id);
		return c.json({ items });
	})
	.put(
		"/players/:id",
		zValidator("json", putBodySchema, (result, c) => {
			if (!result.success) {
				return c.json({ error: API_ERROR_CODES.INVALID_BODY }, 400);
			}
		}),
		async (c) => {
			const { data, version } = c.req.valid("json");
			if (data.id !== c.req.param("id")) {
				return c.json({ error: API_ERROR_CODES.INVALID_BODY }, 400);
			}
			const saved = await putPlayer(getDb(c.env), c.var.user.id, data, version);
			if (!saved) {
				return c.json({ error: API_ERROR_CODES.VERSION_CONFLICT }, 409);
			}
			return c.json(saved);
		},
	)
	.delete("/players/:id", async (c) => {
		await deletePlayer(getDb(c.env), c.var.user.id, c.req.param("id"));
		return c.body(null, 204);
	})
	.post(
		"/players/import",
		zValidator("json", PlayerImportRequestSchema, (result, c) => {
			if (!result.success) {
				return c.json({ error: API_ERROR_CODES.INVALID_BODY }, 400);
			}
		}),
		async (c) => {
			const { players } = c.req.valid("json");
			const items = await importPlayers(getDb(c.env), c.var.user.id, players);
			if (!items) {
				return c.json({ error: API_ERROR_CODES.VERSION_CONFLICT }, 409);
			}
			return c.json({ items });
		},
	)
	.post("/reset", async (c) => {
		await resetMatchmaker(getDb(c.env), c.var.user.id);
		return c.body(null, 204);
	});
