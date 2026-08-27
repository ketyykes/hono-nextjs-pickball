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

	it("舊版資料缺 matchId 時補為 null 且不清除 key", () => {
		// 模擬本次變更前寫入的資料：欄位皆合法，但沒有 matchId
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
			targetScore: 11,
		};
		localStorage.setItem(STORAGE_KEY, JSON.stringify(legacyState));

		const loaded = readScoreboard();

		// 缺欄位應由 schema 預設值補上，即視為獨立計分板，而非被當成損壞資料
		expect(loaded?.matchId).toBeNull();
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

	it("clearScoreboard 的 removeItem 拋例外時不 throw，且刻意不 warn", () => {
		// clearScoreboard 與 writeScoreboard 的錯誤處理刻意不同：寫入失敗代表使用者的
		// 比賽進度沒存到（值得 warn），清除失敗只是殘留一份即將被覆蓋的舊資料（靜默即可）。
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
		const removeItemSpy = vi
			.spyOn(localStorage, "removeItem")
			.mockImplementationOnce(() => {
				throw new DOMException("SecurityError");
			});
		expect(() => clearScoreboard()).not.toThrow();
		expect(warnSpy).not.toHaveBeenCalled();
		warnSpy.mockRestore();
		removeItemSpy.mockRestore();
	});

	describe("localStorage 不可用時的降級行為", () => {
		it("SSR（無 window）時 read 回 null、write／clear 皆不寫入也不 throw", () => {
			// 先放一份既有資料，用來證明 write／clear 在 guard 擋下後「真的沒動到」儲存區
			const sentinel = JSON.stringify({ sentinel: true });
			localStorage.setItem(STORAGE_KEY, sentinel);

			vi.stubGlobal("window", undefined);
			try {
				// 自證：確認 stub 真的讓 hasLocalStorage() 的 typeof window 分支為 false，
				// 否則以下三個斷言會因 localStorage 正常運作而假性通過
				expect(typeof window).toBe("undefined");
				expect(readScoreboard()).toBeNull();
				expect(() => writeScoreboard(createInitialState())).not.toThrow();
				expect(() => clearScoreboard()).not.toThrow();
			} finally {
				vi.unstubAllGlobals();
			}

			// guard 生效 → 三個函式都在碰 localStorage 之前就 return
			expect(localStorage.getItem(STORAGE_KEY)).toBe(sentinel);
		});

		it("存取 localStorage 本身即拋例外（如 Firefox 私密模式）時安全降級", () => {
			// hasLocalStorage() 的 try/catch 防的就是這種「屬性 getter 直接 throw」的環境，
			// 與上一個 test 的 typeof window 分支是兩條不同的 guard 路徑。
			const original = Object.getOwnPropertyDescriptor(
				globalThis,
				"localStorage",
			);
			Object.defineProperty(globalThis, "localStorage", {
				configurable: true,
				get() {
					throw new DOMException("localStorage is not available");
				},
			});

			try {
				// 自證：確認 patch 真的讓 hasLocalStorage() 內的 window.localStorage 存取拋錯，
				// 否則以下三個斷言只是在測「storage 正常運作」，變成假防護
				expect(() => window.localStorage).toThrow();
				expect(readScoreboard()).toBeNull();
				expect(() => writeScoreboard(createInitialState())).not.toThrow();
				expect(() => clearScoreboard()).not.toThrow();
			} finally {
				if (original) {
					Object.defineProperty(globalThis, "localStorage", original);
				} else {
					Reflect.deleteProperty(globalThis, "localStorage");
				}
			}
		});
	});
});
