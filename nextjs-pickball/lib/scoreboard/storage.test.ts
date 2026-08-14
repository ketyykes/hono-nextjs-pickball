import { describe, it, expect, beforeEach, vi } from "vitest";
import { readScoreboard, writeScoreboard, clearScoreboard, STORAGE_KEY } from "./storage";
import { createInitialState } from "./reducer";

describe("storage", () => {
	beforeEach(() => {
		localStorage.clear();
	});

	it("write 後 read 可取回相同 state", () => {
		const state = createInitialState();
		writeScoreboard(state);
		expect(readScoreboard()).toEqual(state);
	});

	it("無資料時 read 回 null", () => {
		expect(readScoreboard()).toBeNull();
	});

	it("資料為非 JSON 時 read 回 null 並清 key，且 warn", () => {
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
		localStorage.setItem(STORAGE_KEY, "not-json");
		expect(readScoreboard()).toBeNull();
		expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
		expect(warnSpy).toHaveBeenCalledOnce();
		warnSpy.mockRestore();
	});

	it("資料 schema 不合法時 read 回 null 並清 key，且 warn", () => {
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
		localStorage.setItem(STORAGE_KEY, JSON.stringify({ mode: "invalid" }));
		expect(readScoreboard()).toBeNull();
		expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
		expect(warnSpy).toHaveBeenCalledOnce();
		warnSpy.mockRestore();
	});

	it("舊版資料缺 targetScore 時補為 11 且不清除 key", () => {
		// 模擬本次變更前寫入的資料：欄位皆合法，但沒有 targetScore
		const legacyState = {
			mode: "doubles",
			scores: { us: 7, them: 5 },
			servingTeam: "us",
			serverNumber: 1,
			isFirstServiceOfGame: false,
			history: [{ type: "RALLY_WON", winner: "us" }],
			status: "playing",
			winner: null,
			firstServer: "us",
		};
		localStorage.setItem(STORAGE_KEY, JSON.stringify(legacyState));

		const loaded = readScoreboard();

		// 缺欄位應由 schema 預設值補上，而非被當成損壞資料
		expect(loaded?.targetScore).toBe(11);
		// 舊資料不得被清除——否則使用者進行中的比賽會在重整後歸零
		expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull();
		expect(loaded?.scores).toEqual({ us: 7, them: 5 });
		expect(loaded?.history).toHaveLength(1);
	});

	it("clearScoreboard 移除 key", () => {
		writeScoreboard(createInitialState());
		clearScoreboard();
		expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
	});

	it("writeScoreboard localStorage 拋例外時不 throw，僅 warn", () => {
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
		const setItemSpy = vi
			.spyOn(localStorage, "setItem")
			.mockImplementationOnce(() => {
				throw new DOMException("QuotaExceededError");
			});
		expect(() => writeScoreboard(createInitialState())).not.toThrow();
		expect(warnSpy).toHaveBeenCalledOnce();
		warnSpy.mockRestore();
		setItemSpy.mockRestore();
	});
});
