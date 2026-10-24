import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Round } from "@pickball/core/matchmaker/round-types";
import { createInitialState } from "@pickball/core/scoreboard/reducer";
import {
	MatchSlotGetResponseSchema,
	MatchSlotListResponseSchema,
	RoundGetResponseSchema,
	SubmitScoreResponseSchema,
	type MatchSlot,
} from "@pickball/core/api/round";

vi.mock("./api-client", () => ({ requestJson: vi.fn() }));

import { requestJson } from "./api-client";
import {
	PUT_ROUND_RESPONSE_SCHEMA,
	PUT_SLOT_RESPONSE_SCHEMA,
	fetchRemoteRound,
	fetchRemoteSlot,
	fetchRemoteSlots,
	putRemoteRound,
	putRemoteSlot,
	submitRemoteScore,
} from "./round-api";

const ROUND = { marker: "round" } as unknown as Round;
const SLOT = { marker: "slot", matchId: "m 1" } as unknown as MatchSlot;

describe("round-api", () => {
	beforeEach(() => {
		vi.mocked(requestJson).mockReset();
		vi.mocked(requestJson).mockResolvedValue({ kind: "failed" });
	});

	it("回合 API 包裝以正確的方法、路徑與 body 呼叫 requestJson", async () => {
		await fetchRemoteRound();
		await putRemoteRound(ROUND, 3);
		await fetchRemoteSlots();
		await fetchRemoteSlot("m 1");
		await putRemoteSlot("m 1", SLOT, 0);
		await submitRemoteScore("m 1", "11", "7", 4);

		const calls = vi.mocked(requestJson).mock.calls;
		expect(calls).toHaveLength(6);

		expect(calls[0][0]).toBe("GET");
		expect(calls[0][1]).toBe("/api/matchmaker/round");
		expect(calls[0][2].body).toBeUndefined();
		expect(calls[0][2].schema).toBe(RoundGetResponseSchema);

		expect(calls[1][0]).toBe("PUT");
		expect(calls[1][1]).toBe("/api/matchmaker/round");
		expect(calls[1][2].body).toEqual({ data: ROUND, version: 3 });
		expect(calls[1][2].schema).toBe(PUT_ROUND_RESPONSE_SCHEMA);

		expect(calls[2][0]).toBe("GET");
		expect(calls[2][1]).toBe("/api/matchmaker/slots");
		expect(calls[2][2].body).toBeUndefined();
		expect(calls[2][2].schema).toBe(MatchSlotListResponseSchema);

		expect(calls[3][0]).toBe("GET");
		expect(calls[3][1]).toBe("/api/matchmaker/slots/m%201");
		expect(calls[3][2].body).toBeUndefined();
		expect(calls[3][2].schema).toBe(MatchSlotGetResponseSchema);

		expect(calls[4][0]).toBe("PUT");
		expect(calls[4][1]).toBe("/api/matchmaker/slots/m%201");
		expect(calls[4][2].body).toEqual({ data: SLOT, version: 0 });
		expect(calls[4][2].schema).toBe(PUT_SLOT_RESPONSE_SCHEMA);

		expect(calls[5][0]).toBe("POST");
		expect(calls[5][1]).toBe("/api/matchmaker/round/matches/m%201/score");
		expect(calls[5][2].body).toEqual({ scoreA: "11", scoreB: "7", roundVersion: 4 });
		expect(calls[5][2].schema).toBe(SubmitScoreResponseSchema);
	});

	it("原樣回傳 requestJson 的結果", async () => {
		const result = { kind: "conflict" } as const;
		vi.mocked(requestJson).mockResolvedValue(result);
		await expect(fetchRemoteRound()).resolves.toBe(result);
		await expect(putRemoteRound(ROUND, 1)).resolves.toBe(result);
		await expect(fetchRemoteSlots()).resolves.toBe(result);
		await expect(fetchRemoteSlot("m1")).resolves.toBe(result);
		await expect(putRemoteSlot("m1", SLOT, 1)).resolves.toBe(result);
		await expect(submitRemoteScore("m1", "1", "2", 1)).resolves.toBe(result);
	});

	// regression guard：兩個 PUT 回應 schema 原本只以常數身分比對，換成對方的 schema 時仍會綠燈
	it("PUT 回應 schema 只接受各自的資料形狀，回合與分槽不可互換", () => {
		const validRound = {
			roundNumber: 1,
			createdAt: "2026-01-01T00:00:00.000Z",
			format: "doubles",
			courtCount: 1,
			targetScore: 11,
			matches: [],
			restingPlayerIds: [],
			seenSignatures: { teammateKeys: [], opponentKeys: [], fullMatchKeys: [] },
			timer: null,
		};
		const validSlot = { ...createInitialState({ matchId: "m1" }), matchId: "m1" };

		expect(PUT_ROUND_RESPONSE_SCHEMA.safeParse({ data: validRound, version: 2 }).success).toBe(true);
		expect(PUT_ROUND_RESPONSE_SCHEMA.safeParse({ data: validSlot, version: 2 }).success).toBe(false);

		expect(PUT_SLOT_RESPONSE_SCHEMA.safeParse({ data: validSlot, version: 1 }).success).toBe(true);
		expect(PUT_SLOT_RESPONSE_SCHEMA.safeParse({ data: validRound, version: 1 }).success).toBe(false);
	});
});
