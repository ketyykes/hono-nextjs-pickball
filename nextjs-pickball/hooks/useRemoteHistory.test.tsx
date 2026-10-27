import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { MatchHistoryEntry } from "@pickball/core/matchmaker/history";
import { rangeBounds, type HistoryRange } from "@pickball/core/matchmaker/history-range";
import type { SyncStatus } from "@/lib/sync/sync-status";
import { useRemoteHistory } from "./useRemoteHistory";

const HISTORY_PATH = "/api/matchmaker/history";

// 假時鐘刻意選在與真實日期不同的月份：hook 若在模組載入時就取 now，
// 算出的界線會與測試預期不同
const FAKE_NOW = new Date(2026, 2, 18, 10, 30, 0);

function entry(matchId: string): MatchHistoryEntry {
	return {
		matchId,
		courtNumber: 1,
		playedAt: "2026-03-18T01:00:00.000Z",
		format: "singles",
		teamA: { players: [{ id: "p1", name: "甲", ratingBefore: 1000, ratingAfter: 1010 }], rating: 1000 },
		teamB: { players: [{ id: "p2", name: "乙", ratingBefore: 1000, ratingAfter: 990 }], rating: 1000 },
		scoreA: 11,
		scoreB: 7,
		winner: "teamA",
	};
}

function listBody(matchIds: string[], total = matchIds.length, droppedCount = 0) {
	return {
		items: matchIds.map((matchId) => ({ data: entry(matchId), version: 1 })),
		total,
		droppedCount,
	};
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

/** 手動決定何時回應的請求，用來觀察「在途」期間的狀態與回應順序。 */
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

function expectedUserOf(init: RequestInit | undefined): string | null {
	return new Headers(init?.headers).get("X-Expected-User-Id");
}

function queryOf(callIndex: number): { from: string | null; to: string | null } {
	const url = new URL(String(fetchMock.mock.calls[callIndex][0]), "http://localhost");
	expect(url.pathname).toBe(HISTORY_PATH);
	return { from: url.searchParams.get("from"), to: url.searchParams.get("to") };
}

function expectedQuery(range: HistoryRange): { from: string | null; to: string | null } {
	const { from, to } = rangeBounds(range, FAKE_NOW);
	return {
		from: from === null ? null : String(from),
		to: to === null ? null : String(to),
	};
}

async function settle(ms = 50): Promise<void> {
	await act(async () => {
		await new Promise((resolve) => setTimeout(resolve, ms));
	});
}

interface HookProps {
	enabled: boolean;
	userId: string | null;
	range: HistoryRange;
	onUnauthorized?: () => void;
}

function renderHistory(initialProps: HookProps) {
	const log: Array<{ userId: string | null; items: number; total: number; syncStatus: SyncStatus }> = [];
	const rendered = renderHook(
		(props: HookProps) => {
			const value = useRemoteHistory({
				enabled: props.enabled,
				userId: props.userId,
				range: props.range,
				onUnauthorized: props.onUnauthorized ?? vi.fn(),
			});
			log.push({
				userId: props.userId,
				items: value.items.length,
				total: value.total,
				syncStatus: value.syncStatus,
			});
			return value;
		},
		{ initialProps },
	);
	return { ...rendered, log };
}

/** 連續相同的狀態合併成一筆，只看轉換順序。 */
function statusSequence(log: Array<{ syncStatus: SyncStatus }>): SyncStatus[] {
	const sequence: SyncStatus[] = [];
	for (const { syncStatus } of log) {
		if (sequence[sequence.length - 1] !== syncStatus) sequence.push(syncStatus);
	}
	return sequence;
}

beforeEach(() => {
	queue = [];
	fetchMock.mockClear();
	vi.stubGlobal("fetch", fetchMock);
	// 只假 Date：waitFor 與 setTimeout 仍用真計時器
	vi.useFakeTimers({ toFake: ["Date"] });
	vi.setSystemTime(FAKE_NOW);
});

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

describe("useRemoteHistory", () => {
	it("依 range 以 rangeBounds 的界線載入雲端歷史並在 range 改變時重新載入", async () => {
		enqueue(200, listBody(["m-today"]));
		enqueue(200, listBody(["m-last-1", "m-last-2"], 5, 1));
		const { result, rerender, log } = renderHistory({
			enabled: true,
			userId: "user-a",
			range: "today",
		});

		await waitFor(() => expect(result.current.syncStatus).toBe("synced"));
		expect(statusSequence(log)).toEqual(["loading", "synced"]);
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(queryOf(0)).toEqual(expectedQuery("today"));
		expect(expectedUserOf(fetchMock.mock.calls[0][1])).toBe("user-a");
		expect(result.current.items.map((item) => item.data.matchId)).toEqual(["m-today"]);

		rerender({ enabled: true, userId: "user-a", range: "lastMonth" });

		await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
		await waitFor(() => expect(result.current.items).toHaveLength(2));
		expect(queryOf(1)).toEqual(expectedQuery("lastMonth"));
		// 兩個區間的界線不同，避免兩次請求用了同一組界線仍通過
		expect(queryOf(1)).not.toEqual(queryOf(0));
		expect(expectedUserOf(fetchMock.mock.calls[1][1])).toBe("user-a");
		expect(result.current.syncStatus).toBe("synced");
		expect(result.current.total).toBe(5);
		expect(result.current.droppedCount).toBe(1);
		expect(statusSequence(log)).toEqual(["loading", "synced", "loading", "synced"]);
	});

	it("range 快速切換時只採用最後一次請求的結果", async () => {
		const releaseToday = enqueueDeferred();
		const releaseWeek = enqueueDeferred();
		const { result, rerender } = renderHistory({
			enabled: true,
			userId: "user-a",
			range: "today",
		});
		await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

		rerender({ enabled: true, userId: "user-a", range: "thisWeek" });
		await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

		// 第二次（thisWeek）先回應，第一次（today）才晚到
		await act(async () => {
			releaseWeek(200, listBody(["m-week"]));
		});
		await waitFor(() => expect(result.current.syncStatus).toBe("synced"));
		await act(async () => {
			releaseToday(200, listBody(["m-today-late-1", "m-today-late-2"], 2));
		});
		await settle();

		expect(result.current.items.map((item) => item.data.matchId)).toEqual(["m-week"]);
		expect(result.current.total).toBe(1);
		expect(result.current.syncStatus).toBe("synced");
	});

	it("GET 失敗時為 load-failed，401 時呼叫 onUnauthorized，停用時不發請求", async () => {
		// GET 回 500
		enqueue(500);
		const failed = renderHistory({ enabled: true, userId: "user-a", range: "today" });
		await waitFor(() => expect(failed.result.current.syncStatus).toBe("load-failed"));
		expect(failed.result.current.items).toEqual([]);
		failed.unmount();

		// GET 回 401
		enqueue(401);
		const onUnauthorized = vi.fn();
		const unauthorized = renderHistory({
			enabled: true,
			userId: "user-a",
			range: "today",
			onUnauthorized,
		});
		await waitFor(() => expect(onUnauthorized).toHaveBeenCalledTimes(1));
		await settle();
		expect(onUnauthorized).toHaveBeenCalledTimes(1);
		// 401 交給 session refresh，不把資料標成已同步
		expect(unauthorized.result.current.syncStatus).not.toBe("synced");
		expect(unauthorized.result.current.items).toEqual([]);
		unauthorized.unmount();

		expect(fetchMock).toHaveBeenCalledTimes(2);

		// 停用與 userId 為 null：不發請求，對外狀態為 local
		const disabled = renderHistory({ enabled: false, userId: "user-a", range: "today" });
		await settle();
		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(disabled.result.current.syncStatus).toBe("local");
		expect(disabled.result.current.items).toEqual([]);
		disabled.unmount();

		const noUser = renderHistory({ enabled: true, userId: null, range: "today" });
		await settle();
		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(noUser.result.current.syncStatus).toBe("local");
		expect(noUser.result.current.items).toEqual([]);
	});

	it("userId 變更時以新帳號重新載入歷史且不顯示前一帳號的歷史", async () => {
		// 第一段：A 已載入一筆，換成 B 且 B 的 GET 尚未回應
		enqueue(200, listBody(["a-1"]));
		const releaseB = enqueueDeferred();
		const first = renderHistory({ enabled: true, userId: "user-a", range: "today" });
		await waitFor(() => expect(first.result.current.total).toBe(1));
		expect(first.result.current.syncStatus).toBe("synced");

		first.rerender({ enabled: true, userId: "user-b", range: "today" });

		// rerender 後立即讀到的結果
		expect(first.result.current).toEqual({
			items: [],
			total: 0,
			droppedCount: 0,
			syncStatus: "loading",
		});
		// 換帳號的那一次 render 起，就不得出現前一帳號的資料（含 effect 尚未重設狀態的那一幀）
		const bRenders = first.log.filter((snapshot) => snapshot.userId === "user-b");
		expect(bRenders.length).toBeGreaterThan(0);
		for (const snapshot of bRenders) {
			expect(snapshot.items).toBe(0);
			expect(snapshot.total).toBe(0);
			expect(snapshot.syncStatus).toBe("loading");
		}

		await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
		expect(expectedUserOf(fetchMock.mock.calls[0][1])).toBe("user-a");
		expect(expectedUserOf(fetchMock.mock.calls[1][1])).toBe("user-b");

		await act(async () => {
			releaseB(200, listBody(["b-1", "b-2"], 2));
		});
		await waitFor(() => expect(first.result.current.syncStatus).toBe("synced"));
		expect(first.result.current.items.map((item) => item.data.matchId)).toEqual(["b-1", "b-2"]);
		expect(first.result.current.total).toBe(2);
		first.unmount();

		// 第二段：A 的請求仍在途時換成 B，A 世代晚到的回應不得影響結果
		fetchMock.mockClear();
		const releaseA = enqueueDeferred();
		const releaseB2 = enqueueDeferred();
		const second = renderHistory({ enabled: true, userId: "user-a", range: "today" });
		await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
		second.rerender({ enabled: true, userId: "user-b", range: "today" });
		await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
		expect(expectedUserOf(fetchMock.mock.calls[1][1])).toBe("user-b");

		await act(async () => {
			releaseB2(200, listBody(["b-only"]));
		});
		await waitFor(() => expect(second.result.current.syncStatus).toBe("synced"));
		await act(async () => {
			releaseA(200, listBody(["a-late-1", "a-late-2", "a-late-3"], 3));
		});
		await settle();

		expect(second.result.current.items.map((item) => item.data.matchId)).toEqual(["b-only"]);
		expect(second.result.current.total).toBe(1);
		expect(second.result.current.syncStatus).toBe("synced");
	});

	// regression guard：加入時即為綠燈（實作已具備），補 mutation 驗證發現的兩個缺口（enabled 依賴、onUnauthorized 取最新函式）
	it("regression guard：enabled 由 false 改為 true 時開始載入，onUnauthorized 以最新的函式呼叫", async () => {
		enqueue(401);
		const first = vi.fn();
		const second = vi.fn();
		const { rerender } = renderHistory({
			enabled: false,
			userId: "user-a",
			range: "today",
			onUnauthorized: first,
		});
		await settle();
		expect(fetchMock).not.toHaveBeenCalled();

		// 同一次 rerender 換掉 onUnauthorized：請求送出後收到 401 要呼叫新的函式
		rerender({ enabled: true, userId: "user-a", range: "today", onUnauthorized: second });
		await waitFor(() => expect(second).toHaveBeenCalledTimes(1));
		expect(first).not.toHaveBeenCalled();
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});
});
