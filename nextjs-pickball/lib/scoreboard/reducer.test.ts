import { describe, it, expect } from "vitest";
import { scoreboardReducer, createInitialState } from "./reducer";
import type { ScoreboardState } from "./types";

describe("createInitialState", () => {
	it("預設為雙打、我方先發、0-0-2 起手", () => {
		const state = createInitialState();
		expect(state.mode).toBe("doubles");
		expect(state.servingTeam).toBe("us");
		expect(state.serverNumber).toBe(2);
		expect(state.isFirstServiceOfGame).toBe(true);
		expect(state.status).toBe("setup");
		expect(state.scores).toEqual({ us: 0, them: 0 });
		expect(state.history).toEqual([]);
		expect(state.winner).toBeNull();
	});

	it("可傳入 mode 與 firstServer 客製", () => {
		const state = createInitialState({ mode: "singles", firstServer: "them" });
		expect(state.mode).toBe("singles");
		expect(state.servingTeam).toBe("them");
		expect(state.serverNumber).toBe(1);
		expect(state.isFirstServiceOfGame).toBe(false);
		expect(state.firstServer).toBe("them");
	});
});

describe("scoreboardReducer — SET_MODE / SET_FIRST_SERVER", () => {
	it("setup 階段可切換 mode；切換到 singles 時 serverNumber=1、isFirstService=false", () => {
		const state = createInitialState();
		const next = scoreboardReducer(state, { type: "SET_MODE", mode: "singles" });
		expect(next.mode).toBe("singles");
		expect(next.serverNumber).toBe(1);
		expect(next.isFirstServiceOfGame).toBe(false);
	});

	it("setup 階段可切換 firstServer", () => {
		const state = createInitialState();
		const next = scoreboardReducer(state, {
			type: "SET_FIRST_SERVER",
			team: "them",
		});
		expect(next.servingTeam).toBe("them");
	});

	it("playing 階段 ignore SET_MODE", () => {
		const state: ScoreboardState = { ...createInitialState(), status: "playing" };
		const next = scoreboardReducer(state, { type: "SET_MODE", mode: "singles" });
		expect(next).toBe(state);
	});

	it("playing 階段 ignore SET_FIRST_SERVER", () => {
		const state: ScoreboardState = { ...createInitialState(), status: "playing" };
		const next = scoreboardReducer(state, {
			type: "SET_FIRST_SERVER",
			team: "them",
		});
		expect(next).toBe(state);
	});

	it("finished 階段 ignore SET_MODE", () => {
		const state: ScoreboardState = { ...createInitialState(), status: "finished" };
		const next = scoreboardReducer(state, { type: "SET_MODE", mode: "singles" });
		expect(next).toBe(state);
	});

	it("finished 階段 ignore SET_FIRST_SERVER", () => {
		const state: ScoreboardState = { ...createInitialState(), status: "finished" };
		const next = scoreboardReducer(state, {
			type: "SET_FIRST_SERVER",
			team: "them",
		});
		expect(next).toBe(state);
	});
});

describe("scoreboardReducer — RALLY_WON", () => {
	it("首次 RALLY_WON 從 setup → playing 並記錄 history", () => {
		const state = createInitialState();
		const next = scoreboardReducer(state, { type: "RALLY_WON", winner: "us" });
		expect(next.status).toBe("playing");
		expect(next.scores).toEqual({ us: 1, them: 0 });
		expect(next.history).toEqual([{ type: "RALLY_WON", winner: "us" }]);
	});

	it("達到勝利條件時 → status=finished, winner 設定", () => {
		const state: ScoreboardState = {
			...createInitialState({ mode: "singles" }),
			scores: { us: 10, them: 5 },
			status: "playing",
		};
		const next = scoreboardReducer(state, { type: "RALLY_WON", winner: "us" });
		expect(next.status).toBe("finished");
		expect(next.winner).toBe("us");
		expect(next.scores).toEqual({ us: 11, them: 5 });
	});

	it("finished 後 RALLY_WON 被 ignore", () => {
		const state: ScoreboardState = {
			...createInitialState(),
			status: "finished",
			winner: "us",
			scores: { us: 11, them: 7 },
		};
		const next = scoreboardReducer(state, { type: "RALLY_WON", winner: "them" });
		expect(next).toBe(state);
	});
});

describe("scoreboardReducer — UNDO", () => {
	it("空 history 時 UNDO 不變 state", () => {
		const state = createInitialState();
		const next = scoreboardReducer(state, { type: "UNDO" });
		expect(next).toBe(state);
	});

	it("UNDO 後 state 等於少做一次 RALLY_WON 的結果", () => {
		const start = createInitialState();
		const afterOne = scoreboardReducer(start, { type: "RALLY_WON", winner: "us" });
		const afterTwo = scoreboardReducer(afterOne, { type: "RALLY_WON", winner: "us" });
		const undone = scoreboardReducer(afterTwo, { type: "UNDO" });
		expect(undone.scores).toEqual(afterOne.scores);
		expect(undone.servingTeam).toBe(afterOne.servingTeam);
		expect(undone.serverNumber).toBe(afterOne.serverNumber);
		expect(undone.history).toEqual(afterOne.history);
	});

	it("UNDO 退到開賽時 status 回到 setup", () => {
		const start = createInitialState();
		const afterOne = scoreboardReducer(start, { type: "RALLY_WON", winner: "us" });
		const undone = scoreboardReducer(afterOne, { type: "UNDO" });
		expect(undone.status).toBe("setup");
		expect(undone.history).toEqual([]);
	});
});

describe("scoreboardReducer — RESET", () => {
	it("RESET 保留 mode 與 firstServer，清空分數與 history、status 回 setup", () => {
		const state: ScoreboardState = {
			...createInitialState({ mode: "singles", firstServer: "them" }),
			scores: { us: 11, them: 7 },
			status: "finished",
			winner: "us",
			history: [
				{ type: "RALLY_WON", winner: "us" },
				{ type: "RALLY_WON", winner: "us" },
			],
		};
		const next = scoreboardReducer(state, { type: "RESET" });
		expect(next.mode).toBe("singles");
		expect(next.firstServer).toBe("them");
		expect(next.servingTeam).toBe("them");
		expect(next.scores).toEqual({ us: 0, them: 0 });
		expect(next.status).toBe("setup");
		expect(next.winner).toBeNull();
		expect(next.history).toEqual([]);
	});
});
