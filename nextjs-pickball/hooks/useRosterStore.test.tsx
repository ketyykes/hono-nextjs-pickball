import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useRosterStore } from "./useRosterStore";
import { STORAGE_KEY } from "@/lib/matchmaker/storage";
import type { Player } from "@pickball/core/matchmaker/types";
import { useSession } from "@/hooks/useSession";

// 預設回本機模式的快照（訪客、auth 停用），既有 it 因此不受選擇器影響；
// 雲端選擇器的 it 各自以 mockReturnValue 覆寫。
vi.mock("@/hooks/useSession", () => ({
	useSession: vi.fn(() => ({
		status: "ready",
		authEnabled: false,
		user: null,
		refresh: vi.fn(),
	})),
}));

/** 建立一份合法的持久化 Player 資料，可透過 overrides 覆寫特定欄位。 */
function makePlayer(overrides: Partial<Player> = {}): Player {
	return {
		id: "p1",
		name: "測試員",
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

describe("useRosterStore", () => {
	beforeEach(() => {
		localStorage.clear();
	});

	it("無持久化資料時初始 players 為空陣列", () => {
		const { result } = renderHook(() => useRosterStore());
		expect(result.current.players).toEqual([]);
	});

	it("新增參賽者後自動寫回 localStorage", () => {
		const { result } = renderHook(() => useRosterStore());

		act(() => {
			result.current.addPlayer({
				name: "小明",
				gender: "male",
				rating: 3.5,
			});
		});

		expect(result.current.players).toHaveLength(1);
		const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
		expect(stored.players).toHaveLength(1);
		expect(stored.players[0].name).toBe("小明");
	});

	it("updatePlayer 更新指定欄位並寫回 localStorage", () => {
		const { result } = renderHook(() => useRosterStore());

		act(() => {
			result.current.addPlayer({ name: "小明", gender: "male", rating: 3.5 });
		});
		const id = result.current.players[0].id;

		act(() => {
			result.current.updatePlayer(id, { rating: 4.5 });
		});

		expect(result.current.players[0].rating).toBe(4.5);
		const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
		expect(stored.players[0].rating).toBe(4.5);
	});

	it("removePlayer 移除參賽者並寫回 localStorage", () => {
		const { result } = renderHook(() => useRosterStore());

		act(() => {
			result.current.addPlayer({ name: "小明", gender: "male", rating: 3.5 });
			result.current.addPlayer({ name: "小華", gender: "female", rating: 4 });
		});
		const removedId = result.current.players[0].id;

		act(() => {
			result.current.removePlayer(removedId);
		});

		expect(result.current.players).toHaveLength(1);
		expect(result.current.players[0].name).toBe("小華");
		const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
		expect(stored.players).toHaveLength(1);
		expect(stored.players[0].name).toBe("小華");
	});

	it("togglePlayerActive 切換出場狀態並寫回 localStorage", () => {
		const { result } = renderHook(() => useRosterStore());

		act(() => {
			result.current.addPlayer({ name: "小明", gender: "male", rating: 3.5 });
		});
		const id = result.current.players[0].id;
		expect(result.current.players[0].isActive).toBe(true);

		act(() => {
			result.current.togglePlayerActive(id);
		});

		expect(result.current.players[0].isActive).toBe(false);
		const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
		expect(stored.players[0].isActive).toBe(false);
	});

	it("resetRoster 清空名單且移除持久化資料", () => {
		const { result } = renderHook(() => useRosterStore());

		act(() => {
			result.current.addPlayer({ name: "小明", gender: "male", rating: 3.5 });
		});
		expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull();

		act(() => {
			result.current.resetRoster();
		});

		expect(result.current.players).toEqual([]);
		expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
	});

	it("同一批次內 resetRoster 後緊接 addPlayer 仍正確持久化", () => {
		const { result } = renderHook(() => useRosterStore());

		act(() => {
			result.current.addPlayer({ name: "舊資料", gender: "male", rating: 3 });
		});

		// React automatic batching 會把這兩個 dispatch 合併成單一次 render。
		// 若「跳過寫入」的意圖以一次性旗標實作，RESET 設下的旗標不會被後續的
		// ADD_PLAYER 復位，導致合併後那次 render 的寫入被整批跳過——
		// 記憶體 state 有新參賽者、localStorage 卻是空的，此刻重整即靜默丟資料。
		act(() => {
			result.current.resetRoster();
			result.current.addPlayer({ name: "新資料", gender: "female", rating: 4 });
		});

		expect(result.current.players).toHaveLength(1);
		expect(result.current.players[0].name).toBe("新資料");

		const stored = localStorage.getItem(STORAGE_KEY);
		expect(stored).not.toBeNull();
		expect(JSON.parse(stored!).players[0].name).toBe("新資料");
	});

	it("持久化資料含損壞筆數時 store 回報 droppedCount", () => {
		// 兩筆合法、一筆 rating 超出 1~8 範圍，readRoster 會逐筆降級並回報 droppedCount
		localStorage.setItem(
			STORAGE_KEY,
			JSON.stringify({
				version: 1,
				players: [
					makePlayer({ id: "p1" }),
					makePlayer({ id: "p2", rating: 99 }),
					makePlayer({ id: "p3" }),
				],
			}),
		);

		const { result } = renderHook(() => useRosterStore());

		expect(result.current.players).toHaveLength(2);
		expect(result.current.droppedCount).toBe(1);
	});
});

// 選擇器：依 session 在本機實作與雲端實作之間擇一，並多回傳 syncStatus。
describe("useRosterStore 儲存模式選擇器", () => {
	const loggedIn = {
		status: "ready",
		authEnabled: true,
		user: { id: "u1", email: "a@example.com", name: "A" },
		refresh: vi.fn(),
	} as const;
	const fetchMock = vi.fn<typeof fetch>();

	function jsonResponse(body: unknown): Response {
		return new Response(JSON.stringify(body), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		});
	}

	function matchmakerCalls() {
		return fetchMock.mock.calls.filter(([path]) => String(path).startsWith("/api/matchmaker"));
	}

	beforeEach(() => {
		localStorage.clear();
		fetchMock.mockReset();
		vi.stubGlobal("fetch", fetchMock);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.mocked(useSession).mockReturnValue({
			status: "ready",
			authEnabled: false,
			user: null,
			refresh: vi.fn(),
		});
	});

	it("已登入時改用雲端名單並回傳 syncStatus", async () => {
		vi.mocked(useSession).mockReturnValue(loggedIn);
		const cloudPlayers = [makePlayer({ id: "c1" }), makePlayer({ id: "c2" })];
		// 每次請求都要新的 Response（body 只能讀一次）
		fetchMock.mockImplementation(() =>
			Promise.resolve(
				jsonResponse({ items: cloudPlayers.map((data) => ({ data, version: 3 })) }),
			),
		);

		const { result } = renderHook(() => useRosterStore());

		await waitFor(() => expect(result.current.syncStatus).toBe("synced"));
		expect(result.current.players.map((player) => player.id)).toEqual(["c1", "c2"]);

		// 雲端 GET 回 401 時，選擇器把 session.refresh 交給雲端 hook 呼叫
		const refresh = vi.fn();
		vi.mocked(useSession).mockReturnValue({ ...loggedIn, refresh });
		fetchMock.mockReset();
		fetchMock.mockImplementation(() => Promise.resolve(new Response("{}", { status: 401 })));
		renderHook(() => useRosterStore());
		await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
	});

	it("session 載入中或訪客時走本機且 syncStatus 為 local", () => {
		const snapshots = [
			{ status: "loading", refresh: vi.fn() },
			{ status: "ready", authEnabled: false, user: null, refresh: vi.fn() },
		] as const;

		for (const snapshot of snapshots) {
			localStorage.clear();
			vi.mocked(useSession).mockReturnValue(snapshot);
			const { result, unmount } = renderHook(() => useRosterStore());

			act(() => {
				result.current.addPlayer({ name: "訪客新增", gender: "male", rating: 3 });
			});

			expect(result.current.syncStatus).toBe("local");
			expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).players).toHaveLength(1);
			expect(matchmakerCalls()).toHaveLength(0);
			unmount();
		}
	});

	it("雲端模式下變更名單不寫入 matchmaker:roster:v1", async () => {
		vi.mocked(useSession).mockReturnValue(loggedIn);
		fetchMock.mockImplementation((_input, init) => {
			if (init?.method === "PUT") {
				const { data } = JSON.parse(String(init.body));
				return Promise.resolve(jsonResponse({ data, version: 1 }));
			}
			return Promise.resolve(jsonResponse({ items: [] }));
		});

		const { result } = renderHook(() => useRosterStore());
		await waitFor(() => expect(result.current.syncStatus).toBe("synced"));

		act(() => {
			result.current.addPlayer({ name: "雲端新增", gender: "female", rating: 4 });
		});
		await waitFor(() =>
			expect(fetchMock.mock.calls.some(([, init]) => init?.method === "PUT")).toBe(true),
		);
		await waitFor(() => expect(result.current.syncStatus).toBe("synced"));

		expect(result.current.players).toHaveLength(1);
		expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
	});

	it("選擇器把 session 的 user id 傳給雲端 hook", async () => {
		const sessionOf = (id: string) =>
			({
				status: "ready",
				authEnabled: true,
				user: { id, email: `${id}@example.com`, name: id },
				refresh: vi.fn(),
			}) as const;
		function expectedUsers(): Array<string | null> {
			return matchmakerCalls().map(([, init]) =>
				new Headers(init?.headers).get("X-Expected-User-Id"),
			);
		}
		fetchMock.mockImplementation(() => Promise.resolve(jsonResponse({ items: [] })));

		vi.mocked(useSession).mockReturnValue(sessionOf("user-a"));
		const { result, rerender, unmount } = renderHook(() => useRosterStore());
		await waitFor(() => expect(result.current.syncStatus).toBe("synced"));
		expect(expectedUsers()).toEqual(["user-a"]);
		vi.mocked(useSession).mockReturnValue(sessionOf("user-b"));
		rerender();
		await waitFor(() => expect(expectedUsers()).toEqual(["user-a", "user-b"]));
		unmount();

		// session 載入中與訪客沒有任何使用者資料請求
		fetchMock.mockClear();
		for (const snapshot of [
			{ status: "loading", refresh: vi.fn() },
			{ status: "ready", authEnabled: false, user: null, refresh: vi.fn() },
		] as const) {
			vi.mocked(useSession).mockReturnValue(snapshot);
			renderHook(() => useRosterStore()).unmount();
		}
		expect(fetchMock).not.toHaveBeenCalled();
	});
});
