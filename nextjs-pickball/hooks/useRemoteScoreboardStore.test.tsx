import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { createInitialState } from "@pickball/core/scoreboard/reducer";
import type { ScoreboardState } from "@pickball/core/scoreboard/types";
import { useRemoteScoreboardStore } from "./useRemoteScoreboardStore";
import type { SyncStatus } from "@/lib/sync/sync-status";

const CURRENT_PATH = "/api/scoreboard/current";

function stateWithScores(us: number, them: number): ScoreboardState {
	return { ...createInitialState(), scores: { us, them } };
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

/** 手動決定何時回應的請求，用來觀察「在途」期間的狀態。 */
function enqueueDeferred(): (status: number, body: unknown) => void {
	let release: (status: number, body: unknown) => void = () => {};
	queue.push(
		() =>
			new Promise<Response>((resolve) => {
				release = (status, body) => resolve(jsonResponse(status, body));
			}),
	);
	return (status, body) => release(status, body);
}

function putCalls() {
	return fetchMock.mock.calls.filter(([, init]) => init?.method === "PUT");
}

function putVersions(): number[] {
	return putCalls().map(([, init]) => JSON.parse(String(init?.body)).version as number);
}

function renderRemote(options: { enabled: boolean; onUnauthorized?: () => void; strict?: boolean }) {
	const onUnauthorized = options.onUnauthorized ?? vi.fn();
	const statusLog: SyncStatus[] = [];
	const rendered = renderHook(() => {
		const value = useRemoteScoreboardStore({
			enabled: options.enabled,
			onUnauthorized,
		});
		statusLog.push(value[2]);
		return value;
	}, options.strict ? { wrapper: StrictMode } : undefined);
	return { ...rendered, statusLog, onUnauthorized };
}

beforeEach(() => {
	queue = [];
	fetchMock.mockClear();
	vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("useRemoteScoreboardStore", () => {
	it("啟用後 GET 成功即 HYDRATE 並回報 synced，且不立即寫回", async () => {
		enqueue(200, { data: stateWithScores(7, 5), version: 2 });
		const { result, statusLog } = renderRemote({ enabled: true });

		await waitFor(() => expect(result.current[2]).toBe("synced"));
		expect(result.current[0].scores).toEqual({ us: 7, them: 5 });
		expect(statusLog.indexOf("loading")).toBeGreaterThanOrEqual(0);
		expect(statusLog.indexOf("loading")).toBeLessThan(statusLog.indexOf("synced"));
		// 等一輪確認 HYDRATE 之後沒有延遲出現的寫回
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 50));
		});
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(fetchMock.mock.calls[0][0]).toBe(CURRENT_PATH);
		expect(putCalls()).toHaveLength(0);
	});

	it("雲端無資料時維持初始狀態，第一次儲存帶 version 0", async () => {
		// StrictMode 會重跑 effect：第一次的 GET 被忽略，第二次才算數，但 PUT 不得重複
		const releaseStaleGet = enqueueDeferred();
		enqueue(200, { data: null, version: 0 });
		const { result } = renderRemote({ enabled: true, strict: true });
		await waitFor(() => expect(result.current[2]).toBe("synced"));
		// 第一次（已被取消）的 GET 較晚才回來：其 1:1 不得覆蓋第二次 data null 的結果
		await act(async () => {
			releaseStaleGet(200, { data: stateWithScores(1, 1), version: 1 });
			await new Promise((resolve) => setTimeout(resolve, 20));
		});
		expect(result.current[0]).toEqual(createInitialState());
		expect(putCalls()).toHaveLength(0);

		enqueue(200, { data: stateWithScores(1, 0), version: 1 });
		act(() => {
			result.current[1]({ type: "RALLY_WON", winner: "us" });
		});
		await waitFor(() => expect(putCalls()).toHaveLength(1));
		expect(putVersions()).toEqual([0]);
		const body = JSON.parse(String(putCalls()[0][1]?.body));
		expect(body.data.scores).toEqual({ us: 1, them: 0 });

		// 同一個 mount 內 enabled 切換後，新一輪 GET 回無資料時不得保留前一輪的比分
		enqueue(200, { data: stateWithScores(3, 1), version: 2 });
		enqueue(200, { data: null, version: 0 });
		const reused = renderHook(
			({ enabled }) => useRemoteScoreboardStore({ enabled, onUnauthorized: vi.fn() }),
			{ initialProps: { enabled: true } },
		);
		await waitFor(() => expect(reused.result.current[0].scores).toEqual({ us: 3, them: 1 }));
		await waitFor(() => expect(reused.result.current[2]).toBe("synced"));
		reused.rerender({ enabled: false });
		reused.rerender({ enabled: true });
		await waitFor(() => expect(queue).toHaveLength(0));
		await waitFor(() => expect(reused.result.current[2]).toBe("synced"));
		expect(reused.result.current[0]).toEqual(createInitialState());
	});

	it("dispatch 後以目前 version PUT 新狀態，成功後沿用回應的 version", async () => {
		enqueue(200, { data: stateWithScores(0, 0), version: 2 });
		const { result, statusLog, unmount } = renderRemote({ enabled: true });
		await waitFor(() => expect(result.current[2]).toBe("synced"));

		const releaseFirst = enqueueDeferred();
		act(() => {
			result.current[1]({ type: "RALLY_WON", winner: "us" });
		});
		await waitFor(() => expect(result.current[2]).toBe("saving"));
		await act(async () => {
			releaseFirst(200, { data: stateWithScores(1, 0), version: 3 });
		});
		await waitFor(() => expect(result.current[2]).toBe("synced"));

		enqueue(200, { data: stateWithScores(2, 0), version: 4 });
		act(() => {
			result.current[1]({ type: "RALLY_WON", winner: "us" });
		});
		await waitFor(() => expect(putCalls()).toHaveLength(2));
		await waitFor(() => expect(result.current[2]).toBe("synced"));
		expect(putVersions()).toEqual([2, 3]);

		// 失敗重試期間維持 retrying，不會被重送時的 saving 洗掉造成提示閃爍
		enqueue(503);
		const releaseRetry = enqueueDeferred();
		const logLengthBeforeRetry = statusLog.length;
		act(() => {
			result.current[1]({ type: "RALLY_WON", winner: "us" });
		});
		await waitFor(() => expect(result.current[2]).toBe("retrying"));
		await waitFor(() => expect(putCalls()).toHaveLength(4), { timeout: 3000 });
		// 重送在途期間仍是 retrying
		expect(result.current[2]).toBe("retrying");
		await act(async () => {
			releaseRetry(200, { data: stateWithScores(3, 0), version: 5 });
		});
		await waitFor(() => expect(result.current[2]).toBe("synced"), { timeout: 3000 });
		const duringRetry = statusLog.slice(logLengthBeforeRetry);
		const firstRetrying = duringRetry.indexOf("retrying");
		const retryTail = duringRetry.slice(firstRetrying);
		expect(retryTail.indexOf("saving")).toBe(-1);
		expect(putVersions()).toEqual([2, 3, 4, 4]);

		// 伺服器拒絕（4xx）後狀態為 rejected，下一次送出的 saving 期間不覆蓋它
		enqueue(400);
		act(() => {
			result.current[1]({ type: "RALLY_WON", winner: "us" });
		});
		await waitFor(() => expect(result.current[2]).toBe("rejected"));
		const releaseAfterRejected = enqueueDeferred();
		act(() => {
			result.current[1]({ type: "RALLY_WON", winner: "us" });
		});
		await waitFor(() => expect(putCalls()).toHaveLength(6));
		expect(result.current[2]).toBe("rejected");
		await act(async () => {
			releaseAfterRejected(200, { data: stateWithScores(5, 0), version: 6 });
		});
		await waitFor(() => expect(result.current[2]).toBe("synced"));

		// 卸載後等待中的重試不得再送出
		enqueue(503);
		act(() => {
			result.current[1]({ type: "RALLY_WON", winner: "us" });
		});
		await waitFor(() => expect(result.current[2]).toBe("retrying"));
		const callsAtUnmount = fetchMock.mock.calls.length;
		unmount();
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 1300));
		});
		expect(fetchMock).toHaveBeenCalledTimes(callsAtUnmount);
	});

	it("PUT 回 409 時重新 GET 並以雲端狀態取代，狀態為 conflict", async () => {
		enqueue(200, { data: stateWithScores(0, 0), version: 2 });
		const { result, statusLog } = renderRemote({ enabled: true });
		await waitFor(() => expect(result.current[2]).toBe("synced"));
		const syncedIndex = statusLog.indexOf("synced");

		enqueue(409);
		const releaseReload = enqueueDeferred();
		act(() => {
			result.current[1]({ type: "RALLY_WON", winner: "us" });
		});
		// 重載用的 GET 在途期間不可切到 loading（會取代計分畫面）
		await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 20));
		});
		expect(result.current[2]).not.toBe("loading");
		await act(async () => {
			releaseReload(200, { data: stateWithScores(9, 9), version: 5 });
		});
		await waitFor(() => expect(result.current[2]).toBe("conflict"));
		expect(result.current[0].scores).toEqual({ us: 9, them: 9 });
		// 重新載入期間不可切到 loading（會取代計分畫面）
		expect(statusLog.slice(syncedIndex)).not.toContain("loading");
		// 衝突重載不應再多送 PUT
		expect(putCalls()).toHaveLength(1);

		const releaseSecond = enqueueDeferred();
		act(() => {
			result.current[1]({ type: "RALLY_WON", winner: "us" });
		});
		await waitFor(() => expect(putCalls()).toHaveLength(2));
		expect(putVersions()).toEqual([2, 5]);
		// 衝突文案維持到下一次儲存成功為止
		expect(result.current[2]).toBe("conflict");
		await act(async () => {
			releaseSecond(200, { data: stateWithScores(10, 9), version: 6 });
		});
		await waitFor(() => expect(result.current[2]).toBe("synced"));

		// 衝突重載時雲端資料已不存在（data 為 null）：回到初始狀態，版本為 0
		enqueue(409);
		enqueue(200, { data: null, version: 0 });
		act(() => {
			result.current[1]({ type: "RALLY_WON", winner: "us" });
		});
		await waitFor(() => expect(result.current[2]).toBe("conflict"));
		expect(result.current[0]).toEqual(createInitialState());

		// 衝突後重新 GET 也失敗：改為 load-failed，之後不得再以舊版本送出 PUT
		enqueue(409);
		enqueue(500);
		act(() => {
			result.current[1]({ type: "RALLY_WON", winner: "us" });
		});
		await waitFor(() => expect(result.current[2]).toBe("load-failed"));
		const putCountBefore = putCalls().length;
		act(() => {
			result.current[1]({ type: "RALLY_WON", winner: "us" });
		});
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 50));
		});
		expect(putCalls()).toHaveLength(putCountBefore);
	});

	it("GET 失敗時狀態為 load-failed 且不送出任何 PUT", async () => {
		enqueue(500);
		const { result } = renderRemote({ enabled: true });
		await waitFor(() => expect(result.current[2]).toBe("load-failed"));

		act(() => {
			result.current[1]({ type: "RALLY_WON", winner: "us" });
		});
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 50));
		});
		expect(result.current[2]).toBe("load-failed");
		expect(putCalls()).toHaveLength(0);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it("GET 或 PUT 回 401 時呼叫 onUnauthorized 且不再送出", async () => {
		// GET 401
		enqueue(401);
		const getCase = renderRemote({ enabled: true });
		await waitFor(() => expect(getCase.onUnauthorized).toHaveBeenCalledTimes(1));
		act(() => {
			getCase.result.current[1]({ type: "RALLY_WON", winner: "us" });
		});
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 50));
		});
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(getCase.onUnauthorized).toHaveBeenCalledTimes(1);
		getCase.unmount();

		// PUT 401
		fetchMock.mockClear();
		enqueue(200, { data: null, version: 0 });
		enqueue(401);
		const putCase = renderRemote({ enabled: true });
		await waitFor(() => expect(putCase.result.current[2]).toBe("synced"));
		act(() => {
			putCase.result.current[1]({ type: "RALLY_WON", winner: "us" });
		});
		await waitFor(() => expect(putCase.onUnauthorized).toHaveBeenCalledTimes(1));
		const callsAfterUnauthorized = fetchMock.mock.calls.length;
		act(() => {
			putCase.result.current[1]({ type: "RALLY_WON", winner: "us" });
		});
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 50));
		});
		expect(fetchMock).toHaveBeenCalledTimes(callsAfterUnauthorized);
		expect(putCase.onUnauthorized).toHaveBeenCalledTimes(1);
	});

	it("enabled 為 false 時不發出任何請求", async () => {
		const { result } = renderRemote({ enabled: false });
		act(() => {
			result.current[1]({ type: "RALLY_WON", winner: "us" });
		});
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 50));
		});
		expect(fetchMock).not.toHaveBeenCalled();
		expect(result.current[2]).toBe("local");
	});
});
