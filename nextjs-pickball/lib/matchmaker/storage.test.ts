import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readRoster, writeRoster, resetMatchmakerData, STORAGE_KEY } from "./storage";
import { STORAGE_KEY as SCOREBOARD_STORAGE_KEY } from "../scoreboard/storage";
import type { Player } from "./types";

/** 建立一份合法的測試用 Player 資料，可透過 overrides 覆寫特定欄位。 */
function makePlayer(overrides: Partial<Player> = {}): Player {
	return {
		id: "p1",
		name: "Alice",
		gender: "female",
		colorFrom: "#ff0000",
		colorTo: "#00ff00",
		rating: 3,
		restCount: 0,
		gamesPlayed: 0,
		isActive: true,
		createdAt: "2026-08-15T00:00:00.000Z",
		...overrides,
	};
}

describe("storage", () => {
	beforeEach(() => {
		localStorage.clear();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("JSON 解析失敗時清除 key 並回空名單", () => {
		localStorage.setItem(STORAGE_KEY, "{ 不是合法 JSON");

		const result = readRoster();

		expect(result.players).toEqual([]);
		expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
	});

	it("外層結構不合法時清除 key 並回空名單", () => {
		localStorage.setItem(STORAGE_KEY, JSON.stringify([1, 2, 3]));

		const result = readRoster();

		expect(result.players).toEqual([]);
		expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
	});

	it("單筆不合法時保留其餘 2 筆並回報 droppedCount 為 1", () => {
		const roster = {
			version: 1,
			players: [
				makePlayer({ id: "p1" }),
				makePlayer({ id: "p2", rating: 99 }), // 不合法：超出 1~8 範圍
				makePlayer({ id: "p3" }),
			],
		};
		localStorage.setItem(STORAGE_KEY, JSON.stringify(roster));

		const result = readRoster();

		expect(result.players.length).toBe(2);
		expect(result.droppedCount).toBe(1);
		expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull();

		// 再讀一次：損壞資料已於上次讀取時被清理並回寫，這次不應再有 dropped 筆數。
		const secondResult = readRoster();
		expect(secondResult.droppedCount).toBe(0);
	});

	it("localStorage 不可用時不拋出例外", () => {
		vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
			throw new Error("localStorage 不可用（例如私密模式）");
		});

		expect(() => readRoster()).not.toThrow();
		expect(readRoster()).toEqual({ players: [], droppedCount: 0 });
		expect(() => writeRoster([])).not.toThrow();
	});

	it("重置只移除列舉的 key，不影響 scoreboard 資料", () => {
		const roster = { version: 1, players: [makePlayer()] };
		localStorage.setItem(STORAGE_KEY, JSON.stringify(roster));
		localStorage.setItem(SCOREBOARD_STORAGE_KEY, JSON.stringify({ untouched: true }));

		resetMatchmakerData();

		expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
		expect(localStorage.getItem(SCOREBOARD_STORAGE_KEY)).toBe(JSON.stringify({ untouched: true }));
	});
});
