import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { createInitialState } from "@pickball/core/scoreboard/reducer";
import type { MatchSlot } from "@pickball/core/api/round";
import type { SyncStatus } from "@/lib/sync/sync-status";
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

/** 假計時器下推進時間；waitFor 在 vitest 假計時器下會卡住，因此帳號世代的測試一律用它。 */
async function advance(ms: number): Promise<void> {
	await act(async () => {
		await vi.advanceTimersByTimeAsync(ms);
	});
}

function expectedUserOf(init: RequestInit | undefined): string | null {
	return new Headers(init?.headers).get("X-Expected-User-Id");
}

interface AccountProps {
	userId: string | null;
}

function renderAccount(initialProps: AccountProps) {
	const rendered = renderHook(
		(props: AccountProps) =>
			useRemoteMatchSlotStore({
				enabled: true,
				matchId: "m1",
				userId: props.userId,
				onUnauthorized: vi.fn(),
			}),
		{ initialProps },
	);
	return rendered;
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
		// missing 時由失效說明取代畫面，不再疊加同步提示
		expect(result.current[3]).toBe("synced");
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

	// 以下為 regression guard：實作先於測試存在，寫入當下即綠燈（B7 §8 自跑 mutation 後補）
	it("regression guard：分槽儲存的同步狀態轉換與保留規則", async () => {
		enqueue(200, { data: slotWithScores(0, 0), version: 4 });
		const { result, unmount } = renderSlot({ enabled: true });
		await waitFor(() => expect(result.current[3]).toBe("synced"));

		// saving，成功後沿用回應的 version
		const releaseFirst = enqueueDeferred();
		act(() => {
			result.current[1]({ type: "RALLY_WON", winner: "us" });
		});
		await waitFor(() => expect(result.current[3]).toBe("saving"));
		await act(async () => {
			releaseFirst(200, { data: slotWithScores(1, 0), version: 5 });
		});
		await waitFor(() => expect(result.current[3]).toBe("synced"));
		enqueue(200, { data: slotWithScores(2, 0), version: 6 });
		act(() => {
			result.current[1]({ type: "RALLY_WON", winner: "us" });
		});
		await waitFor(() => expect(putCalls()).toHaveLength(2));
		await waitFor(() => expect(result.current[3]).toBe("synced"));
		expect(putVersions()).toEqual([4, 5]);

		// 503：retrying，重送在途期間仍是 retrying，成功後 synced
		enqueue(503);
		const releaseRetry = enqueueDeferred();
		act(() => {
			result.current[1]({ type: "RALLY_WON", winner: "us" });
		});
		await waitFor(() => expect(result.current[3]).toBe("retrying"));
		await waitFor(() => expect(putCalls()).toHaveLength(4), { timeout: 3000 });
		expect(result.current[3]).toBe("retrying");
		await act(async () => {
			releaseRetry(200, { data: slotWithScores(3, 0), version: 7 });
		});
		await waitFor(() => expect(result.current[3]).toBe("synced"), { timeout: 3000 });

		// 4xx：rejected，下一次送出的 saving 期間不覆蓋它
		enqueue(400);
		act(() => {
			result.current[1]({ type: "RALLY_WON", winner: "us" });
		});
		await waitFor(() => expect(result.current[3]).toBe("rejected"));
		const releaseAfterRejected = enqueueDeferred();
		act(() => {
			result.current[1]({ type: "RALLY_WON", winner: "us" });
		});
		await waitFor(() => expect(putCalls()).toHaveLength(6));
		expect(result.current[3]).toBe("rejected");
		await act(async () => {
			releaseAfterRejected(200, { data: slotWithScores(5, 0), version: 8 });
		});
		await waitFor(() => expect(result.current[3]).toBe("synced"));

		// 204 沒有內容可更新版本，視為失敗而非成功
		enqueue(204);
		act(() => {
			result.current[1]({ type: "RALLY_WON", winner: "us" });
		});
		await waitFor(() => expect(result.current[3]).toBe("retrying"));
		unmount();
		// 卸載後等待中的重試不得再送出
		const callsAtUnmount = fetchMock.mock.calls.length;
		await settle(1300);
		expect(fetchMock).toHaveBeenCalledTimes(callsAtUnmount);
	});

	it("regression guard：衝突文案維持到下一次儲存成功為止", async () => {
		enqueue(200, { data: slotWithScores(0, 0), version: 4 });
		const { result } = renderSlot({ enabled: true });
		await waitFor(() => expect(result.current[2]).toBe("bound"));

		enqueue(409);
		enqueue(200, { data: slotWithScores(9, 9), version: 7 });
		act(() => {
			result.current[1]({ type: "RALLY_WON", winner: "us" });
		});
		await waitFor(() => expect(result.current[3]).toBe("conflict"));

		const release = enqueueDeferred();
		act(() => {
			result.current[1]({ type: "RALLY_WON", winner: "us" });
		});
		await waitFor(() => expect(putCalls()).toHaveLength(2));
		expect(result.current[3]).toBe("conflict");
		await act(async () => {
			release(200, { data: slotWithScores(10, 9), version: 8 });
		});
		await waitFor(() => expect(result.current[3]).toBe("synced"));
	});

	it("regression guard：重新啟用或換場次時回到 pending／loading 並重新載入", async () => {
		enqueue(200, { data: slotWithScores(2, 1), version: 4 });
		const rendered = renderHook(
			({ enabled, matchId }) =>
				useRemoteMatchSlotStore({ enabled, matchId, onUnauthorized: vi.fn() }),
			{ initialProps: { enabled: true, matchId: "m1" } },
		);
		await waitFor(() => expect(rendered.result.current[2]).toBe("bound"));

		// 重新啟用：載入中不得殘留上一輪的 bound／synced
		rendered.rerender({ enabled: false, matchId: "m1" });
		const releaseReload = enqueueDeferred();
		rendered.rerender({ enabled: true, matchId: "m1" });
		await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
		expect(rendered.result.current[2]).toBe("pending");
		expect(rendered.result.current[3]).toBe("loading");
		await act(async () => {
			releaseReload(200, { data: slotWithScores(2, 1), version: 4 });
		});
		await waitFor(() => expect(rendered.result.current[2]).toBe("bound"));

		// 換場次：改讀新場次的分槽
		enqueue(200, { data: null, version: 0 });
		rendered.rerender({ enabled: true, matchId: "m2" });
		await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
		expect(fetchMock.mock.calls[2][0]).toBe("/api/matchmaker/slots/m2");
		await waitFor(() => expect(rendered.result.current[2]).toBe("missing"));
	});

	it("regression guard：卸載後才到達的結果被忽略，且 onUnauthorized 以最新的函式呼叫", async () => {
		// 卸載後才回來的 401 不得呼叫 onUnauthorized
		const releaseStale = enqueueDeferred();
		const unmounted = renderSlot({ enabled: true });
		await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
		unmounted.unmount();
		await act(async () => {
			releaseStale(401, {});
			await new Promise((resolve) => setTimeout(resolve, 20));
		});
		expect(unmounted.onUnauthorized).not.toHaveBeenCalled();

		// rerender 換了 onUnauthorized 後，GET 401 呼叫的是新的函式
		fetchMock.mockClear();
		const releaseGet = enqueueDeferred();
		const first = vi.fn();
		const second = vi.fn();
		const rendered = renderHook(
			({ onUnauthorized }) =>
				useRemoteMatchSlotStore({ enabled: true, matchId: "m1", onUnauthorized }),
			{ initialProps: { onUnauthorized: first } },
		);
		await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
		rendered.rerender({ onUnauthorized: second });
		await act(async () => {
			releaseGet(401, {});
		});
		await waitFor(() => expect(second).toHaveBeenCalledTimes(1));
		expect(first).not.toHaveBeenCalled();
	});

	// 以下為 Stage 2 審查的 mutation（H12、H42、H38、H10）發現缺口後補的 regression guard，寫入當下即綠燈
	it("regression guard：衝突後重新 GET 回 401 時呼叫 onUnauthorized，之後 dispatch 不再送出 PUT", async () => {
		enqueue(200, { data: slotWithScores(0, 0), version: 4 });
		const { result, onUnauthorized } = renderSlot({ enabled: true });
		await waitFor(() => expect(result.current[2]).toBe("bound"));

		enqueue(409);
		enqueue(401);
		act(() => {
			result.current[1]({ type: "RALLY_WON", winner: "us" });
		});
		await waitFor(() => expect(onUnauthorized).toHaveBeenCalledTimes(1));
		act(() => {
			result.current[1]({ type: "RALLY_WON", winner: "us" });
		});
		await settle();
		expect(putCalls()).toHaveLength(1);
		expect(fetchMock).toHaveBeenCalledTimes(3);
	});

	it("regression guard：換場次後載入中 dispatch 不得以前一場的 version 送出 PUT", async () => {
		enqueue(200, { data: slotWithScores(2, 1), version: 4 });
		const rendered = renderHook(
			({ matchId }) =>
				useRemoteMatchSlotStore({ enabled: true, matchId, onUnauthorized: vi.fn() }),
			{ initialProps: { matchId: "m1" } },
		);
		await waitFor(() => expect(rendered.result.current[2]).toBe("bound"));

		// 第二場的 GET 永不回應，維持載入中
		queue.push(() => new Promise<Response>(() => {}));
		rendered.rerender({ matchId: "m2" });
		await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
		act(() => {
			rendered.result.current[1]({ type: "RALLY_WON", winner: "us" });
		});
		await settle();
		expect(putCalls()).toHaveLength(0);
	});

	it("regression guard：啟用後第一個 render 的 syncStatus 即為 loading", async () => {
		const statusLog: SyncStatus[] = [];
		// GET 永不回應，避免載入完成後的 synced 混入紀錄
		queue.push(() => new Promise<Response>(() => {}));
		renderHook(() => {
			const value = useRemoteMatchSlotStore({
				enabled: true,
				matchId: "m1",
				onUnauthorized: vi.fn(),
			});
			statusLog.push(value[3]);
			return value;
		});
		await settle();
		expect(statusLog[0]).toBe("loading");
		expect(statusLog).not.toContain("synced");
	});

	it("regression guard：GET 回 204（無內容）時為 load-failed", async () => {
		queue.push(() => Promise.resolve(new Response(null, { status: 204 })));
		const { result } = renderSlot({ enabled: true });
		await waitFor(() => expect(result.current[3]).toBe("load-failed"));
	});

	it("userId 變更時丟棄前一帳號的待送變更並以新帳號重新載入", async () => {
		vi.useFakeTimers();
		try {
			enqueue(200, { data: slotWithScores(2, 1), version: 4 });
			const { result, rerender } = renderAccount({ userId: "user-a" });
			await advance(0);
			expect(result.current[2]).toBe("bound");

			enqueue(500);
			act(() => {
				result.current[1]({ type: "RALLY_WON", winner: "us" });
			});
			await advance(0);
			expect(putCalls()).toHaveLength(1);
			const before = fetchMock.mock.calls.length;

			enqueue(200, { data: null, version: 0 });
			rerender({ userId: "user-b" });
			await advance(30_000);

			const after = fetchMock.mock.calls.slice(before);
			expect(after).toHaveLength(1);
			expect(after[0][1]?.method ?? "GET").toBe("GET");
			expect(expectedUserOf(after[0][1])).toBe("user-b");
			expect(result.current[2]).toBe("missing");
		} finally {
			vi.useRealTimers();
		}
	});

	it("enabled 為 true 但 userId 為 null 時不發出任何請求", async () => {
		const { result } = renderAccount({ userId: null });
		act(() => {
			result.current[1]({ type: "RALLY_WON", winner: "us" });
		});
		await settle();
		expect(fetchMock).not.toHaveBeenCalled();
	});
});
