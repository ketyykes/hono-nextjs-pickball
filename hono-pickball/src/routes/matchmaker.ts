import { API_ERROR_CODES } from "@pickball/core/api/errors";
import { PlayerImportRequestSchema } from "@pickball/core/api/players";
import { MatchSlotPutRequestSchema, RoundPutRequestSchema, SubmitScoreRequestSchema } from "@pickball/core/api/round";
import { versionedWriteSchema } from "@pickball/core/api/versioned";
import { PlayerSchema } from "@pickball/core/matchmaker/types";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { localAuth } from "../auth/local-auth-middleware";
import { requireExpectedUser } from "../auth/require-expected-user";
import { requireSession, type SessionAppEnv } from "../auth/require-session";
import { getDb } from "../db/client";
import { invalidBodyHook, userDataOnError } from "../http/invalid-body";
import {
	deletePlayer,
	importPlayers,
	listPlayers,
	putPlayer,
	resetMatchmaker,
} from "../matchmaker/players-repository";
import { getRound, putRound } from "../matchmaker/round-repository";
import { submitScoreForUser } from "../matchmaker/score-repository";
import { getSlot, listSlots, putSlot } from "../matchmaker/slots-repository";

const putBodySchema = versionedWriteSchema(PlayerSchema);

export const matchmakerRoutes = new Hono<SessionAppEnv>()
	// 整個 sub-app 一律先過停用閘門、session 與預期帳號驗證，新增端點時不可能漏掛授權
	.use("*", localAuth, requireSession, requireExpectedUser)
	.onError(userDataOnError)
	.get("/players", async (c) => {
		const items = await listPlayers(getDb(c.env), c.var.user.id);
		return c.json({ items });
	})
	.put(
		"/players/:id",
		zValidator("json", putBodySchema, invalidBodyHook),
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
		zValidator("json", PlayerImportRequestSchema, invalidBodyHook),
		async (c) => {
			const { players } = c.req.valid("json");
			const items = await importPlayers(getDb(c.env), c.var.user.id, players);
			if (!items) {
				return c.json({ error: API_ERROR_CODES.VERSION_CONFLICT }, 409);
			}
			return c.json({ items });
		},
	)
	.get("/round", async (c) => {
		const round = await getRound(getDb(c.env), c.var.user.id);
		return c.json(round ?? { data: null, version: 0 });
	})
	.put("/round", zValidator("json", RoundPutRequestSchema, invalidBodyHook), async (c) => {
		const { data, version } = c.req.valid("json");
		const result = await putRound(getDb(c.env), c.var.user.id, data, version);
		if (result.kind === "invalid") {
			return c.json({ error: API_ERROR_CODES.INVALID_BODY }, 400);
		}
		if (result.kind === "conflict") {
			return c.json({ error: API_ERROR_CODES.VERSION_CONFLICT }, 409);
		}
		return c.json(result.value);
	})
	.get("/slots", async (c) => {
		const items = await listSlots(getDb(c.env), c.var.user.id);
		return c.json({ items });
	})
	.get("/slots/:matchId", async (c) => {
		const slot = await getSlot(getDb(c.env), c.var.user.id, c.req.param("matchId"));
		return c.json(slot ?? { data: null, version: 0 });
	})
	.put("/slots/:matchId", zValidator("json", MatchSlotPutRequestSchema, invalidBodyHook), async (c) => {
		const { data, version } = c.req.valid("json");
		const matchId = c.req.param("matchId");
		if (data.matchId !== matchId) {
			return c.json({ error: API_ERROR_CODES.INVALID_BODY }, 400);
		}
		const saved = await putSlot(getDb(c.env), c.var.user.id, matchId, data, version);
		if (!saved) {
			return c.json({ error: API_ERROR_CODES.VERSION_CONFLICT }, 409);
		}
		return c.json(saved);
	})
	.post(
		"/round/matches/:matchId/score",
		zValidator("json", SubmitScoreRequestSchema, invalidBodyHook),
		async (c) => {
			const { scoreA, scoreB, roundVersion } = c.req.valid("json");
			const outcome = await submitScoreForUser(getDb(c.env), c.var.user.id, {
				matchId: c.req.param("matchId"),
				scoreA,
				scoreB,
				roundVersion,
			});
			if (outcome.kind === "invalid") {
				return c.json({ error: API_ERROR_CODES.INVALID_BODY }, 400);
			}
			if (outcome.kind === "conflict") {
				return c.json({ error: API_ERROR_CODES.VERSION_CONFLICT }, 409);
			}
			return c.json(outcome.value);
		},
	)
	.post("/reset", async (c) => {
		await resetMatchmaker(getDb(c.env), c.var.user.id);
		return c.body(null, 204);
	});
