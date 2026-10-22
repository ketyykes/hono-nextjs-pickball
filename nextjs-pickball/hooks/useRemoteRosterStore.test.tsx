import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { Player } from "@pickball/core/matchmaker/types";
import { useRemoteRosterStore } from "./useRemoteRosterStore";
import type { SyncStatus } from "@/lib/sync/sync-status";
import { ROSTER_STORAGE_KEY, ROUND_STORAGE_KEY, HISTORY_STORAGE_KEY } from "@/lib/matchmaker/storage-keys";
import { MATCH_SLOTS_KEY } from "@/lib/scoreboard/match-slots";
import { STORAGE_KEY as SCOREBOARD_CURRENT_KEY } from "@/lib/scoreboard/storage";

const PLAYERS_PATH = "/api/matchmaker/players";

function makePlayer(id: string, overrides: Partial<Player> = {}): Player {
	return {
		id,
		name: `球員${id}`,
		gender: "male",
		colorFrom: "#0E6B63",
		colorTo: "#134E4A",
		rating: 3,
		restCount: 0,
		gamesPlayed: 0,
		isActive: true,
		createdAt: "2026-08-15T00:00:00.000Z",
		...overrides,
	};
}

function listBody(entries: Array<[Player, number]>) {
	return { items: entries.map(([data, version]) => ({ data, version })) };
}

function jsonResponse(status: number, body: unknown): Response {
	// 204 不可帶 body，否則 Response 建構子會丟例外
	if (status === 204) return new Response(null, { status });
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

type QueueEntry = (init: RequestInit | undefined) => Promise<Response>;

/** 依呼叫順序回應；佇列用完代表測試沒預期到的請求，直接讓它失敗。 */
let queue: QueueEntry[];
const fetchMock = vi.fn<typeof fetch>((_input, init) => {
	const next = queue.shift();
	if (next === undefined) return Promise.reject(new Error("unexpected fetch"));
	return next(init);
});

function enqueue(status: number, body: unknown = {}): void {
	queue.push(() => Promise.resolve(jsonResponse(status, body)));
}

/** PUT 成功：回傳請求中的 data 與指定 version，模擬後端寫入後的回應。 */
function enqueueEcho(version: number): void {
	queue.push((init) => {
		const { data } = JSON.parse(String(init?.body));
		return Promise.resolve(jsonResponse(200, { data, version }));
	});
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

function callsOf(method: string) {
	return fetchMock.mock.calls.filter(([, init]) => (init?.method ?? "GET") === method);
}

function putCalls() {
	return callsOf("PUT");
}

function putBodies() {
	return putCalls().map(([, init]) => JSON.parse(String(init?.body)));
}

function putVersions(): number[] {
	return putBodies().map((body) => body.version as number);
}

function renderRemote(options: {
	enabled: boolean;
	onUnauthorized?: () => void;
	strict?: boolean;
}) {
	const onUnauthorized = options.onUnauthorized ?? vi.fn();
	const statusLog: SyncStatus[] = [];
	const rendered = renderHook(
		() => {
			const value = useRemoteRosterStore({ enabled: options.enabled, onUnauthorized });
			statusLog.push(value.syncStatus);
			return value;
		},
		options.strict ? { wrapper: StrictMode } : undefined,
	);
	return { ...rendered, statusLog, onUnauthorized };
}

/** 讓尚未預期的延遲請求有機會出現，用於斷言「沒有再送出」。 */
async function settle(ms = 50): Promise<void> {
	await act(async () => {
		await new Promise((resolve) => setTimeout(resolve, ms));
	});
}

beforeEach(() => {
	queue = [];
	fetchMock.mockClear();
	localStorage.clear();
	vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe("useRemoteRosterStore", () => {
	it("啟用後 GET 成功即載入名單並回報 synced，且不立即寫回", async () => {
		const p1 = makePlayer("p1");
		const p2 = makePlayer("p2");
		enqueue(200, listBody([[p1, 3], [p2, 3]]));
		const { result, statusLog } = renderRemote({ enabled: true });

		await waitFor(() => expect(result.current.syncStatus).toBe("synced"));
		expect(result.current.players).toEqual([p1, p2]);
		expect(result.current.droppedCount).toBe(0);
		expect(statusLog.indexOf("loading")).toBeGreaterThanOrEqual(0);
		expect(statusLog.indexOf("loading")).toBeLessThan(statusLog.indexOf("synced"));
		await settle();
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(fetchMock.mock.calls[0][0]).toBe(PLAYERS_PATH);
		expect(putCalls()).toHaveLength(0);
		expect(callsOf("DELETE")).toHaveLength(0);
	});

	it("addPlayer 以注入的 id 送出 version 0 的 PUT", async () => {
		vi.spyOn(crypto, "randomUUID").mockReturnValue("00000000-0000-4000-8000-000000000001");
		enqueue(200, listBody([[makePlayer("p1"), 3]]));
		const { result } = renderRemote({ enabled: true });
		await waitFor(() => expect(result.current.syncStatus).toBe("synced"));

		enqueueEcho(1);
		act(() => {
			result.current.addPlayer({ name: "新球員", gender: "female", rating: 4 });
		});

		expect(result.current.players).toHaveLength(2);
		expect(result.current.players[1].id).toBe("00000000-0000-4000-8000-000000000001");
		await waitFor(() => expect(putCalls()).toHaveLength(1));
		expect(putCalls()[0][0]).toBe(`${PLAYERS_PATH}/00000000-0000-4000-8000-000000000001`);
		const body = putBodies()[0];
		expect(body.data.id).toBe("00000000-0000-4000-8000-000000000001");
		expect(body.data.name).toBe("新球員");
		expect(body.version).toBe(0);
		await waitFor(() => expect(result.current.syncStatus).toBe("synced"));
	});

	it("updatePlayer 與 togglePlayerActive 以該參賽者目前 version 送出 PUT，成功後沿用回應的 version", async () => {
		enqueue(200, listBody([[makePlayer("p1"), 3]]));
		const { result } = renderRemote({ enabled: true });
		await waitFor(() => expect(result.current.syncStatus).toBe("synced"));

		enqueueEcho(4);
		act(() => {
			result.current.updatePlayer("p1", { name: "改名" });
		});
		expect(result.current.players[0].name).toBe("改名");
		await waitFor(() => expect(putCalls()).toHaveLength(1));
		await waitFor(() => expect(result.current.syncStatus).toBe("synced"));

		enqueueEcho(5);
		act(() => {
			result.current.togglePlayerActive("p1");
		});
		expect(result.current.players[0].isActive).toBe(false);
		await waitFor(() => expect(putCalls()).toHaveLength(2));
		await waitFor(() => expect(result.current.syncStatus).toBe("synced"));

		expect(putVersions()).toEqual([3, 4]);
		expect(putBodies()[1].data).toMatchObject({ name: "改名", isActive: false });
	});

	it("removePlayer 送出 DELETE 並立即自畫面移除", async () => {
		enqueue(200, listBody([[makePlayer("p1"), 3], [makePlayer("p2"), 3]]));
		const { result } = renderRemote({ enabled: true });
		await waitFor(() => expect(result.current.syncStatus).toBe("synced"));

		enqueue(204);
		act(() => {
			result.current.removePlayer("p1");
		});

		expect(result.current.players.map((player) => player.id)).toEqual(["p2"]);
		await waitFor(() => expect(callsOf("DELETE")).toHaveLength(1));
		expect(callsOf("DELETE")[0][0]).toBe(`${PLAYERS_PATH}/p1`);
		await waitFor(() => expect(result.current.syncStatus).toBe("synced"));
	});

	it("同一參賽者連續變更時只送最新一份", async () => {
		enqueue(200, listBody([[makePlayer("p1"), 3]]));
		const { result } = renderRemote({ enabled: true });
		await waitFor(() => expect(result.current.syncStatus).toBe("synced"));

		const releaseFirst = enqueueDeferred();
		act(() => {
			result.current.updatePlayer("p1", { name: "A" });
		});
		await waitFor(() => expect(putCalls()).toHaveLength(1));
		act(() => {
			result.current.updatePlayer("p1", { name: "B" });
			result.current.updatePlayer("p1", { name: "C" });
		});
		await settle();
		expect(putCalls()).toHaveLength(1);

		enqueueEcho(5);
		await act(async () => {
			releaseFirst(200, { data: makePlayer("p1", { name: "A" }), version: 4 });
		});
		await waitFor(() => expect(putCalls()).toHaveLength(2));
		await waitFor(() => expect(result.current.syncStatus).toBe("synced"));
		expect(putBodies()[1].data.name).toBe("C");
		expect(putVersions()).toEqual([3, 4]);
	});

	it("任一 PUT 回 409 時停止所有儲存、重新載入名單並回報 conflict", async () => {
		enqueue(200, listBody([[makePlayer("p1"), 3], [makePlayer("p2"), 3]]));
		const { result } = renderRemote({ enabled: true });
		await waitFor(() => expect(result.current.syncStatus).toBe("synced"));

		// p2 一筆在途、一筆待送；p1 的 PUT 回 409
		const releaseP2 = enqueueDeferred();
		act(() => {
			result.current.updatePlayer("p2", { name: "p2-第一次" });
		});
		await waitFor(() => expect(putCalls()).toHaveLength(1));
		act(() => {
			result.current.updatePlayer("p2", { name: "p2-待送" });
		});
		enqueue(409);
		const cloudP1 = makePlayer("p1", { name: "雲端的 p1" });
		const cloudP3 = makePlayer("p3");
		enqueue(200, listBody([[cloudP1, 5], [cloudP3, 2]]));
		act(() => {
			result.current.updatePlayer("p1", { name: "本機的 p1" });
		});

		await waitFor(() => expect(result.current.syncStatus).toBe("conflict"));
		expect(result.current.players).toEqual([cloudP1, cloudP3]);
		expect(fetchMock.mock.calls.filter(([, init]) => (init?.method ?? "GET") === "GET")).toHaveLength(2);

		// 衝突後 p2 的在途結果到達：待送的 p2-待送 不得再送出
		await act(async () => {
			releaseP2(200, { data: makePlayer("p2", { name: "p2-第一次" }), version: 4 });
		});
		await settle();
		expect(putCalls()).toHaveLength(2);
		expect(result.current.syncStatus).toBe("conflict");
	});

	it("GET 失敗時回報 load-failed 且變更操作不送出請求", async () => {
		enqueue(500);
		const { result } = renderRemote({ enabled: true });
		await waitFor(() => expect(result.current.syncStatus).toBe("load-failed"));

		act(() => {
			result.current.addPlayer({ name: "新球員", gender: "male", rating: 3 });
			result.current.updatePlayer("p1", { name: "x" });
			result.current.togglePlayerActive("p1");
			result.current.removePlayer("p1");
		});
		await settle();

		expect(result.current.syncStatus).toBe("load-failed");
		expect(result.current.players).toEqual([]);
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(putCalls()).toHaveLength(0);
		expect(callsOf("DELETE")).toHaveLength(0);
	});

	it("GET 或寫入回 401 時呼叫 onUnauthorized", async () => {
		// GET 401
		enqueue(401);
		const getCase = renderRemote({ enabled: true });
		await waitFor(() => expect(getCase.onUnauthorized).toHaveBeenCalledTimes(1));
		act(() => {
			getCase.result.current.addPlayer({ name: "新球員", gender: "male", rating: 3 });
		});
		await settle();
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(getCase.onUnauthorized).toHaveBeenCalledTimes(1);
		getCase.unmount();

		// PUT 401：之後不再送出任何請求，包含其他參賽者的待送變更
		fetchMock.mockClear();
		enqueue(200, listBody([[makePlayer("p1"), 3], [makePlayer("p2"), 3]]));
		const putCase = renderRemote({ enabled: true });
		await waitFor(() => expect(putCase.result.current.syncStatus).toBe("synced"));
		const releaseP2 = enqueueDeferred();
		act(() => {
			putCase.result.current.updatePlayer("p2", { name: "在途" });
		});
		await waitFor(() => expect(putCalls()).toHaveLength(1));
		act(() => {
			putCase.result.current.updatePlayer("p2", { name: "待送" });
		});
		enqueue(401);
		act(() => {
			putCase.result.current.updatePlayer("p1", { name: "x" });
		});
		await waitFor(() => expect(putCase.onUnauthorized).toHaveBeenCalledTimes(1));
		await act(async () => {
			releaseP2(200, { data: makePlayer("p2", { name: "在途" }), version: 4 });
		});
		const callsAfterUnauthorized = fetchMock.mock.calls.length;
		act(() => {
			putCase.result.current.updatePlayer("p1", { name: "y" });
			putCase.result.current.removePlayer("p2");
		});
		await settle();
		expect(fetchMock).toHaveBeenCalledTimes(callsAfterUnauthorized);
		expect(callsAfterUnauthorized).toBe(4);
		expect(putCase.onUnauthorized).toHaveBeenCalledTimes(1);
	});

	it("enabled 為 false 時不發出任何請求", async () => {
		const { result } = renderRemote({ enabled: false });
		act(() => {
			result.current.addPlayer({ name: "新球員", gender: "male", rating: 3 });
			result.current.updatePlayer("p1", { name: "x" });
			result.current.removePlayer("p1");
			result.current.resetRoster();
		});
		await settle();
		expect(fetchMock).not.toHaveBeenCalled();
		expect(result.current.syncStatus).toBe("local");
	});

	it("resetRoster 成功後清空名單並只清除本機回合、歷史與分槽", async () => {
		for (const key of [
			ROSTER_STORAGE_KEY,
			ROUND_STORAGE_KEY,
			HISTORY_STORAGE_KEY,
			MATCH_SLOTS_KEY,
			SCOREBOARD_CURRENT_KEY,
		]) {
			localStorage.setItem(key, "x");
		}
		enqueue(
			200,
			listBody([[makePlayer("p1"), 3], [makePlayer("p2"), 3], [makePlayer("p3"), 3]]),
		);
		const { result } = renderRemote({ enabled: true });
		await waitFor(() => expect(result.current.players).toHaveLength(3));
		// 載入完成後本機 key 仍在（本機 hook 沒有 mount，這裡只驗證雲端 hook 不動它）
		enqueue(204);
		act(() => {
			result.current.resetRoster();
		});

		await waitFor(() => expect(result.current.players).toEqual([]));
		expect(result.current.syncStatus).toBe("synced");
		const posts = callsOf("POST");
		expect(posts).toHaveLength(1);
		expect(posts[0][0]).toBe("/api/matchmaker/reset");
		expect(localStorage.getItem(ROSTER_STORAGE_KEY)).toBe("x");
		expect(localStorage.getItem(ROUND_STORAGE_KEY)).toBeNull();
		expect(localStorage.getItem(HISTORY_STORAGE_KEY)).toBeNull();
		expect(localStorage.getItem(MATCH_SLOTS_KEY)).toBeNull();
		expect(localStorage.getItem(SCOREBOARD_CURRENT_KEY)).toBe("x");
	});

	it("resetRoster 失敗時名單不變並回報 rejected", async () => {
		const keys = [
			ROSTER_STORAGE_KEY,
			ROUND_STORAGE_KEY,
			HISTORY_STORAGE_KEY,
			MATCH_SLOTS_KEY,
			SCOREBOARD_CURRENT_KEY,
		];
		for (const key of keys) localStorage.setItem(key, "x");
		enqueue(
			200,
			listBody([[makePlayer("p1"), 3], [makePlayer("p2"), 3], [makePlayer("p3"), 3]]),
		);
		const { result } = renderRemote({ enabled: true });
		await waitFor(() => expect(result.current.players).toHaveLength(3));

		// 重置進行中不得被名單操作插隊，也不得樂觀清空
		const releaseReset = enqueueDeferred();
		act(() => {
			result.current.resetRoster();
		});
		await waitFor(() => expect(callsOf("POST")).toHaveLength(1));
		expect(result.current.players).toHaveLength(3);
		act(() => {
			result.current.removePlayer("p1");
		});
		await settle();
		expect(callsOf("DELETE")).toHaveLength(0);

		await act(async () => {
			releaseReset(500, {});
		});
		await waitFor(() => expect(result.current.syncStatus).toBe("rejected"));
		expect(result.current.players).toHaveLength(3);
		for (const key of keys) expect(localStorage.getItem(key)).toBe("x");
		expect(callsOf("POST")).toHaveLength(1);

		// 失敗後操作恢復可用
		enqueueEcho(4);
		act(() => {
			result.current.updatePlayer("p1", { name: "之後仍可編輯" });
		});
		await waitFor(() => expect(putCalls()).toHaveLength(1));
		await waitFor(() => expect(result.current.syncStatus).toBe("synced"));
	});
});

describe("useRemoteRosterStore 補充守護", () => {
	it("resetRoster 回 409 視同失敗，回 401 則呼叫 onUnauthorized 且不清空", async () => {
		enqueue(200, listBody([[makePlayer("p1"), 3]]));
		const { result, onUnauthorized } = renderRemote({ enabled: true });
		await waitFor(() => expect(result.current.syncStatus).toBe("synced"));

		enqueue(409);
		act(() => {
			result.current.resetRoster();
		});
		await waitFor(() => expect(result.current.syncStatus).toBe("rejected"));
		expect(result.current.players).toHaveLength(1);
		expect(onUnauthorized).not.toHaveBeenCalled();

		enqueue(401);
		act(() => {
			result.current.resetRoster();
		});
		await waitFor(() => expect(onUnauthorized).toHaveBeenCalledTimes(1));
		expect(result.current.players).toHaveLength(1);
		expect(callsOf("POST")).toHaveLength(2);
	});

	it("載入中的變更操作不送出、不改名單", async () => {
		const releaseGet = enqueueDeferred();
		const { result } = renderRemote({ enabled: true });
		await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
		expect(result.current.syncStatus).toBe("loading");

		act(() => {
			result.current.addPlayer({ name: "新球員", gender: "male", rating: 3 });
			result.current.removePlayer("p1");
			result.current.resetRoster();
		});
		expect(result.current.players).toEqual([]);

		await act(async () => {
			releaseGet(200, listBody([[makePlayer("p1"), 3]]));
		});
		await waitFor(() => expect(result.current.syncStatus).toBe("synced"));
		await settle();
		expect(result.current.players.map((player) => player.id)).toEqual(["p1"]);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it("儲存狀態依序經過 saving、retrying、rejected 並在成功後回到 synced", async () => {
		enqueue(200, listBody([[makePlayer("p1"), 3]]));
		const { result } = renderRemote({ enabled: true });
		await waitFor(() => expect(result.current.syncStatus).toBe("synced"));

		// saving
		const releaseFirst = enqueueDeferred();
		act(() => {
			result.current.updatePlayer("p1", { name: "A" });
		});
		await waitFor(() => expect(result.current.syncStatus).toBe("saving"));
		await act(async () => {
			releaseFirst(200, { data: makePlayer("p1", { name: "A" }), version: 4 });
		});
		await waitFor(() => expect(result.current.syncStatus).toBe("synced"));

		// retrying：重送在途期間不被 saving 洗掉
		enqueue(503);
		const releaseRetry = enqueueDeferred();
		act(() => {
			result.current.updatePlayer("p1", { name: "B" });
		});
		await waitFor(() => expect(result.current.syncStatus).toBe("retrying"));
		await waitFor(() => expect(putCalls()).toHaveLength(3), { timeout: 3000 });
		expect(result.current.syncStatus).toBe("retrying");
		await act(async () => {
			releaseRetry(200, { data: makePlayer("p1", { name: "B" }), version: 5 });
		});
		await waitFor(() => expect(result.current.syncStatus).toBe("synced"), { timeout: 3000 });
		expect(putVersions()).toEqual([3, 4, 4]);

		// rejected：下一次送出的 saving 期間不覆蓋，成功後才回 synced
		enqueue(400);
		act(() => {
			result.current.updatePlayer("p1", { name: "C" });
		});
		await waitFor(() => expect(result.current.syncStatus).toBe("rejected"));
		const releaseAfterRejected = enqueueDeferred();
		act(() => {
			result.current.updatePlayer("p1", { name: "D" });
		});
		await waitFor(() => expect(putCalls()).toHaveLength(5));
		expect(result.current.syncStatus).toBe("rejected");
		await act(async () => {
			releaseAfterRejected(200, { data: makePlayer("p1", { name: "D" }), version: 6 });
		});
		await waitFor(() => expect(result.current.syncStatus).toBe("synced"));
	});

	it("多位參賽者的狀態彙總：任一 retrying 優先於 saving，全部完成才 synced", async () => {
		enqueue(200, listBody([[makePlayer("p1"), 3], [makePlayer("p2"), 3]]));
		const { result } = renderRemote({ enabled: true });
		await waitFor(() => expect(result.current.syncStatus).toBe("synced"));

		enqueue(503); // p1 第一次失敗
		const releaseP2 = enqueueDeferred();
		act(() => {
			result.current.updatePlayer("p1", { name: "A" });
			result.current.updatePlayer("p2", { name: "B" });
		});
		await waitFor(() => expect(result.current.syncStatus).toBe("retrying"));
		await waitFor(() => expect(putCalls()).toHaveLength(2));
		expect(result.current.syncStatus).toBe("retrying");

		// p2 完成後 p1 仍在重試，不可提早回報 synced
		await act(async () => {
			releaseP2(200, { data: makePlayer("p2", { name: "B" }), version: 4 });
		});
		await settle();
		expect(result.current.syncStatus).toBe("retrying");

		enqueueEcho(4);
		await waitFor(() => expect(result.current.syncStatus).toBe("synced"), { timeout: 3000 });
		expect(putCalls()).toHaveLength(3);
	});

	it("不同參賽者各有獨立佇列，一位的在途請求不擋另一位", async () => {
		enqueue(200, listBody([[makePlayer("p1"), 3], [makePlayer("p2"), 3]]));
		const { result } = renderRemote({ enabled: true });
		await waitFor(() => expect(result.current.syncStatus).toBe("synced"));

		const releaseP1 = enqueueDeferred();
		act(() => {
			result.current.updatePlayer("p1", { name: "A" });
		});
		await waitFor(() => expect(putCalls()).toHaveLength(1));
		enqueueEcho(4);
		act(() => {
			result.current.updatePlayer("p2", { name: "B" });
		});
		await waitFor(() => expect(putCalls()).toHaveLength(2));
		expect(putCalls()[1][0]).toBe(`${PLAYERS_PATH}/p2`);
		await act(async () => {
			releaseP1(200, { data: makePlayer("p1", { name: "A" }), version: 4 });
		});
		await waitFor(() => expect(result.current.syncStatus).toBe("synced"));
	});

	it("新增後立刻編輯或刪除時，後續請求排在 version 0 的 PUT 之後", async () => {
		vi.spyOn(crypto, "randomUUID")
			.mockReturnValueOnce("00000000-0000-4000-8000-00000000000a")
			.mockReturnValueOnce("00000000-0000-4000-8000-00000000000b");
		enqueue(200, listBody([]));
		const { result } = renderRemote({ enabled: true });
		await waitFor(() => expect(result.current.syncStatus).toBe("synced"));

		// 新增 a 後立刻編輯：先 v0 再 v1
		const releaseA = enqueueDeferred();
		act(() => {
			result.current.addPlayer({ name: "A", gender: "male", rating: 3 });
		});
		await waitFor(() => expect(putCalls()).toHaveLength(1));
		act(() => {
			result.current.updatePlayer("00000000-0000-4000-8000-00000000000a", { name: "A2" });
		});
		await settle();
		expect(putCalls()).toHaveLength(1);
		enqueueEcho(2);
		await act(async () => {
			releaseA(200, {
				data: makePlayer("00000000-0000-4000-8000-00000000000a", { name: "A" }),
				version: 1,
			});
		});
		await waitFor(() => expect(putCalls()).toHaveLength(2));
		await waitFor(() => expect(result.current.syncStatus).toBe("synced"));
		expect(putVersions()).toEqual([0, 1]);

		// 新增 b 後立刻刪除：v0 PUT 完成後才送 DELETE
		const releaseB = enqueueDeferred();
		act(() => {
			result.current.addPlayer({ name: "B", gender: "male", rating: 3 });
		});
		await waitFor(() => expect(putCalls()).toHaveLength(3));
		act(() => {
			result.current.removePlayer("00000000-0000-4000-8000-00000000000b");
		});
		await settle();
		expect(callsOf("DELETE")).toHaveLength(0);
		enqueue(204);
		await act(async () => {
			releaseB(200, {
				data: makePlayer("00000000-0000-4000-8000-00000000000b", { name: "B" }),
				version: 1,
			});
		});
		await waitFor(() => expect(callsOf("DELETE")).toHaveLength(1));
		expect(callsOf("DELETE")[0][0]).toBe(`${PLAYERS_PATH}/00000000-0000-4000-8000-00000000000b`);
		expect(putCalls()).toHaveLength(3);
		await waitFor(() => expect(result.current.syncStatus).toBe("synced"));
	});

	it("衝突重載期間的操作不送出，重載後以雲端版本送出，conflict 維持到下一次儲存成功", async () => {
		enqueue(200, listBody([[makePlayer("p1"), 3], [makePlayer("p2"), 3]]));
		const { result } = renderRemote({ enabled: true });
		await waitFor(() => expect(result.current.syncStatus).toBe("synced"));

		enqueue(409);
		const releaseReload = enqueueDeferred();
		act(() => {
			result.current.updatePlayer("p1", { name: "本機" });
		});
		await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));

		// 重載在途：重載用的 GET 不切到 loading，使用者動作不送出
		expect(result.current.syncStatus).not.toBe("loading");
		act(() => {
			result.current.updatePlayer("p2", { name: "重載中" });
		});
		await settle();
		expect(putCalls()).toHaveLength(1);

		await act(async () => {
			releaseReload(200, listBody([[makePlayer("p1"), 5], [makePlayer("p2"), 7]]));
		});
		await waitFor(() => expect(result.current.syncStatus).toBe("conflict"));
		expect(result.current.players.find((player) => player.id === "p2")?.name).toBe("球員p2");

		const releaseSecond = enqueueDeferred();
		act(() => {
			result.current.updatePlayer("p2", { name: "重載後" });
		});
		await waitFor(() => expect(putCalls()).toHaveLength(2));
		expect(putVersions()).toEqual([3, 7]);
		expect(result.current.syncStatus).toBe("conflict");
		await act(async () => {
			releaseSecond(200, { data: makePlayer("p2", { name: "重載後" }), version: 8 });
		});
		await waitFor(() => expect(result.current.syncStatus).toBe("synced"));
	});

	it("衝突後重新 GET 失敗時回報 load-failed，之後不再送出", async () => {
		enqueue(200, listBody([[makePlayer("p1"), 3]]));
		const { result } = renderRemote({ enabled: true });
		await waitFor(() => expect(result.current.syncStatus).toBe("synced"));

		enqueue(409);
		enqueue(500);
		act(() => {
			result.current.updatePlayer("p1", { name: "x" });
		});
		await waitFor(() => expect(result.current.syncStatus).toBe("load-failed"));
		const callsBefore = fetchMock.mock.calls.length;
		act(() => {
			result.current.updatePlayer("p1", { name: "y" });
			result.current.removePlayer("p1");
		});
		await settle();
		expect(fetchMock).toHaveBeenCalledTimes(callsBefore);
	});

	it("StrictMode 下舊的在途 GET 結果被忽略，且不重複送出寫入", async () => {
		const releaseStale = enqueueDeferred();
		enqueue(200, listBody([[makePlayer("p1"), 3]]));
		const { result } = renderRemote({ enabled: true, strict: true });
		await waitFor(() => expect(result.current.syncStatus).toBe("synced"));

		await act(async () => {
			releaseStale(200, listBody([[makePlayer("stale"), 1]]));
		});
		await settle();
		expect(result.current.players.map((player) => player.id)).toEqual(["p1"]);
		expect(callsOf("GET")).toHaveLength(2);

		enqueueEcho(4);
		act(() => {
			result.current.updatePlayer("p1", { name: "x" });
		});
		await waitFor(() => expect(result.current.syncStatus).toBe("synced"));
		expect(putCalls()).toHaveLength(1);
	});

	it("enabled 由 true 切到 false 再切回 true 時，新一輪載入以雲端結果取代名單（含空清單）", async () => {
		enqueue(200, listBody([[makePlayer("p1"), 3]]));
		enqueue(200, listBody([]));
		const rendered = renderHook(
			({ enabled }) => useRemoteRosterStore({ enabled, onUnauthorized: vi.fn() }),
			{ initialProps: { enabled: true } },
		);
		await waitFor(() => expect(rendered.result.current.players).toHaveLength(1));
		await waitFor(() => expect(rendered.result.current.syncStatus).toBe("synced"));

		rendered.rerender({ enabled: false });
		expect(rendered.result.current.syncStatus).toBe("local");
		rendered.rerender({ enabled: true });
		await waitFor(() => expect(queue).toHaveLength(0));
		await waitFor(() => expect(rendered.result.current.syncStatus).toBe("synced"));
		expect(rendered.result.current.players).toEqual([]);
	});

	it("卸載與停用時釋放所有佇列，等待中的重試不再送出", async () => {
		enqueue(200, listBody([[makePlayer("p1"), 3]]));
		const first = renderRemote({ enabled: true });
		await waitFor(() => expect(first.result.current.syncStatus).toBe("synced"));
		enqueue(503);
		act(() => {
			first.result.current.updatePlayer("p1", { name: "x" });
		});
		await waitFor(() => expect(first.result.current.syncStatus).toBe("retrying"));
		const callsAtUnmount = fetchMock.mock.calls.length;
		first.unmount();
		await settle(1300);
		expect(fetchMock).toHaveBeenCalledTimes(callsAtUnmount);

		fetchMock.mockClear();
		enqueue(200, listBody([[makePlayer("p1"), 3]]));
		const rendered = renderHook(
			({ enabled }) => useRemoteRosterStore({ enabled, onUnauthorized: vi.fn() }),
			{ initialProps: { enabled: true } },
		);
		await waitFor(() => expect(rendered.result.current.syncStatus).toBe("synced"));
		enqueue(503);
		act(() => {
			rendered.result.current.updatePlayer("p1", { name: "x" });
		});
		await waitFor(() => expect(rendered.result.current.syncStatus).toBe("retrying"));
		const callsAtDisable = fetchMock.mock.calls.length;
		rendered.rerender({ enabled: false });
		await settle(1300);
		expect(fetchMock).toHaveBeenCalledTimes(callsAtDisable);
	});
});
