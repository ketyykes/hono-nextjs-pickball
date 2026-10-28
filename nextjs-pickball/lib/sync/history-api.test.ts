import { beforeEach, describe, expect, it, vi } from "vitest";
import { HistoryListResponseSchema } from "@pickball/core/api/history";

vi.mock("./api-client", () => ({ requestJson: vi.fn() }));

import { requestJson } from "./api-client";
import { fetchRemoteHistory } from "./history-api";

describe("history-api", () => {
	beforeEach(() => {
		vi.mocked(requestJson).mockReset();
		vi.mocked(requestJson).mockResolvedValue({ kind: "failed" });
	});

	it("歷史 API 包裝以正確的查詢字串呼叫 requestJson", async () => {
		await fetchRemoteHistory("user-a", { from: 1, to: 2 });
		await fetchRemoteHistory("user-a", { order: "asc" });
		await fetchRemoteHistory("user-a", {});

		const calls = vi.mocked(requestJson).mock.calls;
		expect(calls).toHaveLength(3);

		const paths = calls.map((call) => call[1]);
		expect(paths).toEqual([
			"/api/matchmaker/history?from=1&to=2",
			"/api/matchmaker/history?order=asc",
			"/api/matchmaker/history",
		]);

		for (const call of calls) {
			expect(call[0]).toBe("GET");
			expect(call[2].body).toBeUndefined();
			expect(call[2].schema).toBe(HistoryListResponseSchema);
			// expectedUserId 原樣交給 requestJson，不在包裝內改讀其他來源
			expect(call[2].expectedUserId).toBe("user-a");
		}
	});
});
