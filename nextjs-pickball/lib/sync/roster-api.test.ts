import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Player } from "@pickball/core/matchmaker/types";

vi.mock("./api-client", () => ({ requestJson: vi.fn() }));

import { requestJson } from "./api-client";
import {
	NO_CONTENT_SCHEMA,
	PUT_PLAYER_RESPONSE_SCHEMA,
	deleteRemotePlayer,
	fetchRemotePlayers,
	importRemotePlayers,
	putRemotePlayer,
	resetRemoteMatchmaker,
} from "./roster-api";
import { PlayerListResponseSchema } from "@pickball/core/api/players";

function makePlayer(id: string): Player {
	return {
		id,
		name: "Alice",
		gender: "female",
		colorFrom: "#ff0000",
		colorTo: "#00ff00",
		rating: 3,
		restCount: 0,
		gamesPlayed: 0,
		isActive: true,
		createdAt: "2026-01-01T00:00:00.000Z",
	};
}

describe("roster-api", () => {
	beforeEach(() => {
		vi.mocked(requestJson).mockReset();
		vi.mocked(requestJson).mockResolvedValue({ kind: "failed" });
	});

	it("名單 API 包裝以正確的方法、路徑與 body 呼叫 requestJson", async () => {
		const player = makePlayer("p-1");

		await fetchRemotePlayers("user-a");
		await putRemotePlayer("user-a", player, 3);
		await deleteRemotePlayer("user-a", "p-1");
		await importRemotePlayers("user-a", [player]);
		await resetRemoteMatchmaker("user-a");

		const calls = vi.mocked(requestJson).mock.calls;
		expect(calls).toHaveLength(5);

		expect(calls[0][0]).toBe("GET");
		expect(calls[0][1]).toBe("/api/matchmaker/players");
		expect(calls[0][2].body).toBeUndefined();
		expect(calls[0][2].schema).toBe(PlayerListResponseSchema);

		expect(calls[1][0]).toBe("PUT");
		expect(calls[1][1]).toBe("/api/matchmaker/players/p-1");
		expect(calls[1][2].body).toEqual({ data: player, version: 3 });
		expect(calls[1][2].schema).toBe(PUT_PLAYER_RESPONSE_SCHEMA);

		expect(calls[2][0]).toBe("DELETE");
		expect(calls[2][1]).toBe("/api/matchmaker/players/p-1");
		expect(calls[2][2].body).toBeUndefined();
		expect(calls[2][2].schema).toBe(NO_CONTENT_SCHEMA);

		expect(calls[3][0]).toBe("POST");
		expect(calls[3][1]).toBe("/api/matchmaker/players/import");
		expect(calls[3][2].body).toEqual({ players: [player] });
		expect(calls[3][2].schema).toBe(PlayerListResponseSchema);

		expect(calls[4][0]).toBe("POST");
		expect(calls[4][1]).toBe("/api/matchmaker/reset");
		expect(calls[4][2].body).toBeUndefined();
		expect(calls[4][2].schema).toBe(NO_CONTENT_SCHEMA);
	});

	it("PUT body 的 version 取自呼叫參數", async () => {
		await putRemotePlayer("user-a", makePlayer("p-1"), 7);

		expect(vi.mocked(requestJson).mock.calls[0][2].body).toEqual({
			data: makePlayer("p-1"),
			version: 7,
		});
	});

	it("id 含特殊字元時路徑以 encodeURIComponent 編碼", async () => {
		await putRemotePlayer("user-a", makePlayer("a/b c"), 1);
		await deleteRemotePlayer("user-a", "a/b c");

		const calls = vi.mocked(requestJson).mock.calls;
		expect(calls[0][1]).toBe("/api/matchmaker/players/a%2Fb%20c");
		expect(calls[1][1]).toBe("/api/matchmaker/players/a%2Fb%20c");
	});

	it("原樣回傳 requestJson 的結果", async () => {
		const result = { kind: "unauthorized" } as const;
		vi.mocked(requestJson).mockResolvedValue(result);
		await expect(fetchRemotePlayers("user-a")).resolves.toBe(result);
		await expect(resetRemoteMatchmaker("user-a")).resolves.toBe(result);
		await expect(putRemotePlayer("user-a", makePlayer("p-1"), 1)).resolves.toBe(result);
		await expect(deleteRemotePlayer("user-a", "p-1")).resolves.toBe(result);
		await expect(importRemotePlayers("user-a", [makePlayer("p-1")])).resolves.toBe(result);
	});

	it("包裝把 expectedUserId 交給 requestJson", async () => {
		const player = makePlayer("p-1");

		await fetchRemotePlayers("user-a");
		await putRemotePlayer("user-a", player, 3);
		await deleteRemotePlayer("user-a", "p-1");
		await importRemotePlayers("user-a", [player]);
		await resetRemoteMatchmaker("user-a");

		const calls = vi.mocked(requestJson).mock.calls;
		expect(calls).toHaveLength(5);
		for (const call of calls) {
			expect(call[2].expectedUserId).toBe("user-a");
		}
	});
});
