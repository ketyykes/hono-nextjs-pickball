import { describe, it, expect, beforeEach, vi } from "vitest";
import { StrictMode } from "react";
import { renderHook, act } from "@testing-library/react";
import { useScoreboardStore, type ScoreboardBindingStatus } from "./useScoreboardStore";
import { STORAGE_KEY } from "@/lib/scoreboard/storage";
import { MATCH_SLOTS_KEY, writeMatchSlot } from "@/lib/scoreboard/match-slots";
import { createInitialState } from "@/lib/scoreboard/reducer";

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
			courtNumber: null,
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
			courtNumber: null,
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

	// §7.0b：帶 matchId 時判定發生在 read effect（paint 之後），若初值直接設為
	// missing，合法綁定場次會先閃一幀「場次已失效」畫面。此 test 在 render 階段
	// （effect 執行前）同步記錄 bindingStatus，藉此驗證首次 render 的暫定值。
	it("帶 matchId 時首次 render 的綁定狀態為 pending 而非 missing", () => {
		writeMatchSlot({ ...createInitialState({ targetScore: 11 }), matchId: "m1" });

		const renderedStatuses: ScoreboardBindingStatus[] = [];
		renderHook(() => {
			const [, , bindingStatus] = useScoreboardStore("m1");
			// 於 render 階段（非 effect）同步記錄，第一筆即為 effect 執行前的暫定值
			renderedStatuses.push(bindingStatus);
			return bindingStatus;
		});

		expect(renderedStatuses[0]).toBe("pending");
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

	// 補充測試（非 test-plan 逐字條目）：Stage 2 mutation 測試發現拿掉 hook 邊界的空字串
	// 正規化後全套仍綠——storage.ts 那一層的正規化只讓「寫哪個槽」正確，bindingStatus
	// 仍會被判成 bound／missing，使 `/scoreboard?match=` 這種空 query param 在 §7 顯示
	// 場次失效畫面。正規化在 hook 與 storage 各做一次，兩處都需要各自的偵測力。
	it("matchId 為空字串時沿用獨立槽並回報 standalone", () => {
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
			courtNumber: null,
		};
		localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));

		const { result } = renderHook(() => useScoreboardStore(""));
		const [state, , bindingStatus] = result.current;

		expect(bindingStatus).toBe("standalone");
		expect(state.scores).toEqual({ us: 5, them: 3 });
		expect(state.matchId).toBeNull();
		expect(localStorage.getItem(MATCH_SLOTS_KEY)).toBeNull();
	});

	// 補充測試（非 test-plan 逐字條目）：Stage 2 mutation 測試發現「綁定模式下打到
	// finished、再 UNDO」這條 hook + storage 端到端路徑零覆蓋——§2 只在 reducer 層驗過
	// UNDO 保留 matchId。兩個 mutation 因此存活／僅由 reducer 單元測試擋下：
	// ① writeMatchSlot 對 finished 狀態誤加早退 guard（§5 的待送出清單全部落空）；
	// ② UNDO replay 掉 matchId（design Decision 6 的洞：同時失去綁定並把整場比賽
	//    寫進獨立槽 scoreboard:current:v1）——hook 層原本沒有第二道防線。
	it("綁定模式下打到結束並 UNDO 後仍只寫回該槽", () => {
		writeMatchSlot({ ...createInitialState({ targetScore: 11 }), matchId: "m1" });

		const { result } = renderHook(() => useScoreboardStore("m1"));
		expect(result.current[2]).toBe("bound");

		// 發球方連得 11 分結束該局（匹克球只有發球方得分）
		for (let i = 0; i < 11; i++) {
			act(() => {
				result.current[1]({ type: "RALLY_WON", winner: "us" });
			});
		}

		const finished = JSON.parse(localStorage.getItem(MATCH_SLOTS_KEY)!);
		expect(result.current[0].status).toBe("finished");
		expect(finished.m1.status).toBe("finished");
		expect(finished.m1.scores).toEqual({ us: 11, them: 0 });
		expect(finished.m1.matchId).toBe("m1");
		expect(localStorage.getItem(STORAGE_KEY)).toBeNull();

		act(() => {
			result.current[1]({ type: "UNDO" });
		});

		const afterUndo = JSON.parse(localStorage.getItem(MATCH_SLOTS_KEY)!);
		expect(afterUndo.m1.scores).toEqual({ us: 10, them: 0 });
		expect(afterUndo.m1.status).toBe("playing");
		// UNDO 以「重建初始 state 後 replay」還原，matchId 必須隨之保留，
		// 否則下一次 write effect 會把整場比賽寫進獨立槽
		expect(afterUndo.m1.matchId).toBe("m1");
		expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
	});

	// 補充測試（非 test-plan 逐字條目）：Stage 2 mutation 測試發現 read effect cleanup 的
	// `hasHydratedRef.current = false` 改成 true 後全套仍綠——那正是 design Context 指名
	// 要守住的 Strict Mode 二次 mount 競態：write effect 會以初始 state（0-0）覆蓋
	// localStorage 中已儲存的進度。既有測試全都在非 Strict Mode 下 render，碰不到這條路徑。
	it("React Strict Mode 二次 mount 不以初始 state 覆蓋既有進度", () => {
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
			courtNumber: null,
		};
		localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));

		const { result } = renderHook(() => useScoreboardStore(), { wrapper: StrictMode });

		expect(result.current[0].scores).toEqual({ us: 5, them: 3 });
		const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
		expect(stored.scores).toEqual({ us: 5, them: 3 });
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
