import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useScoreboardStore } from "./useScoreboardStore";
import { STORAGE_KEY } from "@/lib/scoreboard/storage";

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
});
