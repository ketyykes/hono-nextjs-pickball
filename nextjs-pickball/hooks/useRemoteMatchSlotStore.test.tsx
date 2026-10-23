import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { createInitialState } from "@pickball/core/scoreboard/reducer";
import type { MatchSlot } from "@pickball/core/api/round";
import { useRemoteMatchSlotStore } from "./useRemoteMatchSlotStore";
import type { ScoreboardBindingStatus } from "./useScoreboardStore";

const SLOT_PATH = "/api/matchmaker/slots/m1";

function slotWithScores(us: number, them: number): MatchSlot {
	return { ...createInitialState(), matchId: "m1", scores: { us, them } };
}

function jsonResponse(status: number, body: unknown): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

/** 依呼叫順序回應；佇列用完代表測試沒預期到的請求，直接讓它失敗。 */
let queue: Array<() => Promise<Response>>;
const fetchMock = vi.fn<typeof fetch>(() => {
	const next = queue.shift();
	if (next === undefined) return Promise.reject(new Error("unexpected fetch"));
	return next();
});

function enqueue(status: number, body: unknown = {}): void {
	queue.push(() => Promise.resolve(jsonResponse(status, body)));
}

function putCalls() {
	return fetchMock.mock.calls.filter(([, init]) => init?.method === "PUT");
}

function putVersions(): number[] {
	return putCalls().map(([, init]) => JSON.parse(String(init?.body)).version as number);
}

function renderSlot(options: { enabled: boolean; onUnauthorized?: () => void }) {
	const onUnauthorized = options.onUnauthorized ?? vi.fn();
	const bindingLog: ScoreboardBindingStatus[] = [];
	const rendered = renderHook(() => {
		const value = useRemoteMatchSlotStore({
			enabled: options.enabled,
			matchId: "m1",
			onUnauthorized,
		});
		bindingLog.push(value[2]);
		return value;
	});
	return { ...rendered, bindingLog, onUnauthorized };
}

async function settle(ms = 50): Promise<void> {
	await act(async () => {
		await new Promise((resolve) => setTimeout(resolve, ms));
	});
}

beforeEach(() => {
	queue = [];
	fetchMock.mockClear();
	vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("useRemoteMatchSlotStore", () => {
	it("雲端分槽載入後為 bound 並以目前 version 儲存", async () => {
		enqueue(200, { data: slotWithScores(2, 1), version: 4 });
		const { result, bindingLog } = renderSlot({ enabled: true });

		await waitFor(() => expect(result.current[2]).toBe("bound"));
		expect(bindingLog[0]).toBe("pending");
		expect(bindingLog.indexOf("pending")).toBeLessThan(bindingLog.indexOf("bound"));
		expect(result.current[0].scores).toEqual({ us: 2, them: 1 });
		expect(result.current[3]).toBe("synced");
		// 載入後沒有立即寫回
		await settle();
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(fetchMock.mock.calls[0][0]).toBe(SLOT_PATH);
		expect(putCalls()).toHaveLength(0);

		enqueue(200, { data: slotWithScores(3, 1), version: 5 });
		act(() => {
			result.current[1]({ type: "RALLY_WON", winner: "us" });
		});
		await waitFor(() => expect(putCalls()).toHaveLength(1));
		expect(putCalls()[0][0]).toBe(SLOT_PATH);
		expect(putVersions()).toEqual([4]);
		const body = JSON.parse(String(putCalls()[0][1]?.body));
		expect(body.data.matchId).toBe("m1");
		await waitFor(() => expect(result.current[3]).toBe("synced"));
	});

	it("雲端分槽不存在時 bindingStatus 為 missing 且不送出 PUT", async () => {
		enqueue(200, { data: null, version: 0 });
		const { result } = renderSlot({ enabled: true });

		await waitFor(() => expect(result.current[2]).toBe("missing"));
		act(() => {
			result.current[1]({ type: "RALLY_WON", winner: "us" });
		});
		await settle();
		expect(result.current[2]).toBe("missing");
		expect(putCalls()).toHaveLength(0);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it("分槽 PUT 衝突後依重新載入結果轉為 missing 或 conflict", async () => {
		// 分支一：重新載入回 null，場次已被送出或重排
		enqueue(200, { data: slotWithScores(0, 0), version: 4 });
		const missingCase = renderSlot({ enabled: true });
		await waitFor(() => expect(missingCase.result.current[2]).toBe("bound"));

		enqueue(409);
		enqueue(200, { data: null, version: 0 });
		act(() => {
			missingCase.result.current[1]({ type: "RALLY_WON", winner: "us" });
		});
		await waitFor(() => expect(missingCase.result.current[2]).toBe("missing"));
		expect(putCalls()).toHaveLength(1);
		act(() => {
			missingCase.result.current[1]({ type: "RALLY_WON", winner: "us" });
		});
		await settle();
		expect(putCalls()).toHaveLength(1);
		missingCase.unmount();

		// 分支二：重新載入回非 null，以雲端狀態取代並回報 conflict
		fetchMock.mockClear();
		enqueue(200, { data: slotWithScores(0, 0), version: 4 });
		const conflictCase = renderSlot({ enabled: true });
		await waitFor(() => expect(conflictCase.result.current[2]).toBe("bound"));

		enqueue(409);
		enqueue(200, { data: slotWithScores(9, 9), version: 7 });
		act(() => {
			conflictCase.result.current[1]({ type: "RALLY_WON", winner: "us" });
		});
		await waitFor(() => expect(conflictCase.result.current[3]).toBe("conflict"));
		expect(conflictCase.result.current[2]).toBe("bound");
		expect(conflictCase.result.current[0].scores).toEqual({ us: 9, them: 9 });
		expect(putCalls()).toHaveLength(1);

		enqueue(200, { data: slotWithScores(10, 9), version: 8 });
		act(() => {
			conflictCase.result.current[1]({ type: "RALLY_WON", winner: "us" });
		});
		await waitFor(() => expect(putCalls()).toHaveLength(2));
		expect(putVersions()).toEqual([4, 7]);
		await waitFor(() => expect(conflictCase.result.current[3]).toBe("synced"));

		// 衝突後重新 GET 失敗：load-failed，之後不再送出
		enqueue(409);
		enqueue(500);
		act(() => {
			conflictCase.result.current[1]({ type: "RALLY_WON", winner: "us" });
		});
		await waitFor(() => expect(conflictCase.result.current[3]).toBe("load-failed"));
		const putCountBefore = putCalls().length;
		act(() => {
			conflictCase.result.current[1]({ type: "RALLY_WON", winner: "us" });
		});
		await settle();
		expect(putCalls()).toHaveLength(putCountBefore);
	});

	it("分槽 GET 回 401 時呼叫 onUnauthorized，enabled 為 false 時不發請求", async () => {
		enqueue(401);
		const getCase = renderSlot({ enabled: true });
		await waitFor(() => expect(getCase.onUnauthorized).toHaveBeenCalledTimes(1));
		act(() => {
			getCase.result.current[1]({ type: "RALLY_WON", winner: "us" });
		});
		await settle();
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(getCase.onUnauthorized).toHaveBeenCalledTimes(1);
		getCase.unmount();

		// PUT 401
		fetchMock.mockClear();
		enqueue(200, { data: slotWithScores(0, 0), version: 4 });
		enqueue(401);
		const putCase = renderSlot({ enabled: true });
		await waitFor(() => expect(putCase.result.current[2]).toBe("bound"));
		act(() => {
			putCase.result.current[1]({ type: "RALLY_WON", winner: "us" });
		});
		await waitFor(() => expect(putCase.onUnauthorized).toHaveBeenCalledTimes(1));
		const callsAfterUnauthorized = fetchMock.mock.calls.length;
		act(() => {
			putCase.result.current[1]({ type: "RALLY_WON", winner: "us" });
		});
		await settle();
		expect(fetchMock).toHaveBeenCalledTimes(callsAfterUnauthorized);
		putCase.unmount();

		// 停用
		fetchMock.mockClear();
		const disabled = renderSlot({ enabled: false });
		act(() => {
			disabled.result.current[1]({ type: "RALLY_WON", winner: "us" });
		});
		await settle();
		expect(fetchMock).not.toHaveBeenCalled();
		expect(disabled.result.current[3]).toBe("local");
	});
});
