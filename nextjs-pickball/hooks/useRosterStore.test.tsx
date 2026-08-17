import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useRosterStore } from "./useRosterStore";
import { STORAGE_KEY } from "@/lib/matchmaker/storage";
import type { Player } from "@/lib/matchmaker/types";

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
