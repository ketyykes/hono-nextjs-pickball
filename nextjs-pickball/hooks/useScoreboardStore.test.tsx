import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useScoreboardStore } from "./useScoreboardStore";
import { STORAGE_KEY } from "@/lib/scoreboard/storage";
import { MATCH_SLOTS_KEY, writeMatchSlot } from "@/lib/scoreboard/match-slots";

describe("useScoreboardStore", () => {
	beforeEach(() => {
		localStorage.clear();
	});

	it("初始 state 為 createInitialState 結果", () => {
		const { result } = renderHook(() => useScoreboardStore());
		const [state] = result.current;
		expect(state.mode).toBe("doubles");
		expect(state.scores).toEqual({ us: 0, them: 0 });
	});

	it("dispatch RALLY_WON 後 state 與 localStorage 都更新", () => {
		const { result } = renderHook(() => useScoreboardStore());
		act(() => {
			result.current[1]({ type: "RALLY_WON", winner: "us" });
		});
		expect(result.current[0].scores.us).toBe(1);
		const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
		expect(stored.scores.us).toBe(1);
	});

	it("已存在 localStorage 資料時，mount 後會 hydrate", () => {
		const seed = {
			mode: "singles",
			scores: { us: 5, them: 3 },
			servingTeam: "us",
			serverNumber: 1,
			isFirstServiceOfGame: false,
			history: [
				{ type: "RALLY_WON", winner: "us" },
				{ type: "RALLY_WON", winner: "us" },
			],
			status: "playing",
			winner: null,
			firstServer: "us",
		};
		localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));
		const { result } = renderHook(() => useScoreboardStore());
		// useEffect 在 first render 後 sync 執行
		expect(result.current[0].scores).toEqual({ us: 5, them: 3 });
		expect(result.current[0].status).toBe("playing");
	});

	it("UNDO 後 localStorage 同步退回上一手，不會殘留已撤銷的比分", () => {
		const { result } = renderHook(() => useScoreboardStore());
		act(() => {
			result.current[1]({ type: "RALLY_WON", winner: "us" });
		});
		act(() => {
			result.current[1]({ type: "RALLY_WON", winner: "us" });
		});
		expect(result.current[0].scores.us).toBe(2);

		act(() => {
			result.current[1]({ type: "UNDO" });
		});

		expect(result.current[0].scores.us).toBe(1);
		// write effect 必須跟著 UNDO 重跑：若只在得分時寫入，重整後會讀回已撤銷的 2 分
		const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
		expect(stored.scores.us).toBe(1);
		expect(stored.history).toHaveLength(1);
	});

	it("localStorage 資料 schema 損壞時保持初始 state，並清掉損壞資料", () => {
		const corrupted = JSON.stringify({ mode: "invalid", scores: "nope" });
		localStorage.setItem(STORAGE_KEY, corrupted);
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

		const { result } = renderHook(() => useScoreboardStore());

		// 損壞資料不得被 HYDRATE 進 state
		expect(result.current[0].scores).toEqual({ us: 0, them: 0 });
		expect(result.current[0].status).toBe("setup");
		expect(localStorage.getItem(STORAGE_KEY)).not.toBe(corrupted);
		warnSpy.mockRestore();
	});

	it("未帶 matchId 時沿用獨立槽且不觸碰分槽 key", () => {
		const seed = {
			mode: "singles",
			scores: { us: 5, them: 3 },
			servingTeam: "us",
			serverNumber: 1,
			isFirstServiceOfGame: false,
			history: [{ type: "RALLY_WON", winner: "us" }],
			status: "playing",
			winner: null,
			firstServer: "us",
			targetScore: 11,
			matchId: null,
		};
		localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));

		const getItemSpy = vi.spyOn(localStorage, "getItem");
		const setItemSpy = vi.spyOn(localStorage, "setItem");

		const { result } = renderHook(() => useScoreboardStore());
		const [state, dispatch, bindingStatus] = result.current;

		expect(state.scores).toEqual({ us: 5, them: 3 });
		expect(state.matchId).toBeNull();
		expect(bindingStatus).toBe("standalone");

		act(() => {
			dispatch({ type: "RALLY_WON", winner: "us" });
		});

		// 分槽 key 全程未被讀寫，證明未帶 matchId 時完全不碰分槽儲存區
		expect(getItemSpy.mock.calls.some(([key]) => key === MATCH_SLOTS_KEY)).toBe(false);
		expect(setItemSpy.mock.calls.some(([key]) => key === MATCH_SLOTS_KEY)).toBe(false);

		getItemSpy.mockRestore();
		setItemSpy.mockRestore();
	});

	it("帶 matchId 時 hydrate 自對應槽且只寫回該槽", () => {
		const m1Seed = {
			mode: "doubles" as const,
			scores: { us: 8, them: 5 },
			servingTeam: "us" as const,
			serverNumber: 2 as const,
			isFirstServiceOfGame: false,
			history: [{ type: "RALLY_WON" as const, winner: "us" as const }],
			status: "playing" as const,
			winner: null,
			firstServer: "us" as const,
			targetScore: 15 as const,
			matchId: "m1",
		};
		writeMatchSlot(m1Seed);

		const { result } = renderHook(() => useScoreboardStore("m1"));
		const [state, dispatch, bindingStatus] = result.current;

		expect(state.scores).toEqual({ us: 8, them: 5 });
		expect(state.matchId).toBe("m1");
		expect(bindingStatus).toBe("bound");

		act(() => {
			dispatch({ type: "RALLY_WON", winner: "us" });
		});

		const slots = JSON.parse(localStorage.getItem(MATCH_SLOTS_KEY)!);
		expect(slots.m1.scores).toEqual({ us: 9, them: 5 });
		// 落盤斷言必須到欄位層級：matchId 真的被序列化寫進分槽（見 8-C）
		expect(slots.m1.matchId).toBe("m1");
		expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
	});

	it("matchId 無對應槽時回報 missing 且不建立新條目", () => {
		const { result } = renderHook(() => useScoreboardStore("gone"));
		const [, dispatch, bindingStatus] = result.current;

		expect(bindingStatus).toBe("missing");

		act(() => {
			dispatch({ type: "RALLY_WON", winner: "us" });
		});

		expect(localStorage.getItem(MATCH_SLOTS_KEY)).toBeNull();
		expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
	});

	it("localStorage 不可用（如私密模式）時 hook 不 throw，仍可正常計分", () => {
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
			// 自證：確認存取真的會拋錯，否則本 test 只是在測正常路徑
			expect(() => window.localStorage).toThrow();

			const { result } = renderHook(() => useScoreboardStore());
			expect(result.current[0].scores).toEqual({ us: 0, them: 0 });

			// 持久化失效不應波及記憶體內的計分行為
			// （winner 取初始發球方 us：匹克球只有發球方得分，接發方贏只會換發）
			act(() => {
				result.current[1]({ type: "RALLY_WON", winner: "us" });
			});
			expect(result.current[0].scores.us).toBe(1);
		} finally {
			if (original) {
				Object.defineProperty(globalThis, "localStorage", original);
			} else {
				Reflect.deleteProperty(globalThis, "localStorage");
			}
		}
	});
});
