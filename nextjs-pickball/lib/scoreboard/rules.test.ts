import { describe, it, expect } from "vitest";
import { getServeSide, isGameWon, applyRallyResult } from "./rules";
import type { ScoreboardState } from "./types";

function singlesInitial(overrides: Partial<ScoreboardState> = {}): ScoreboardState {
	return {
		mode: "singles",
		scores: { us: 0, them: 0 },
		servingTeam: "us",
		serverNumber: 1,
		isFirstServiceOfGame: false,
		history: [],
		status: "setup",
		winner: null,
		firstServer: "us",
		...overrides,
	};
}

describe("getServeSide", () => {
	it("發球方分數偶數時從右場發", () => {
		expect(getServeSide(0)).toBe("right");
		expect(getServeSide(2)).toBe("right");
		expect(getServeSide(10)).toBe("right");
	});

	it("發球方分數奇數時從左場發", () => {
		expect(getServeSide(1)).toBe("left");
		expect(getServeSide(3)).toBe("left");
		expect(getServeSide(9)).toBe("left");
	});
});

describe("isGameWon", () => {
	it("任一方未達 11 → 未贏", () => {
		expect(isGameWon({ us: 10, them: 9 })).toEqual({ won: false, winner: null });
		expect(isGameWon({ us: 0, them: 0 })).toEqual({ won: false, winner: null });
	});

	it("達 11 但差距未滿 2 → 未贏（延長賽，雙方領先皆然）", () => {
		expect(isGameWon({ us: 11, them: 10 })).toEqual({ won: false, winner: null });
		expect(isGameWon({ us: 12, them: 11 })).toEqual({ won: false, winner: null });
		expect(isGameWon({ us: 10, them: 11 })).toEqual({ won: false, winner: null });
		expect(isGameWon({ us: 11, them: 12 })).toEqual({ won: false, winner: null });
	});

	it("達 11 且差距 ≥ 2 → 我方贏", () => {
		expect(isGameWon({ us: 11, them: 9 })).toEqual({ won: true, winner: "us" });
		expect(isGameWon({ us: 13, them: 11 })).toEqual({ won: true, winner: "us" });
	});

	it("對方達 11 且差距 ≥ 2 → 對方贏", () => {
		expect(isGameWon({ us: 7, them: 11 })).toEqual({ won: true, winner: "them" });
		expect(isGameWon({ us: 11, them: 13 })).toEqual({ won: true, winner: "them" });
	});

	it("雙方平局 → 未贏", () => {
		expect(isGameWon({ us: 11, them: 11 })).toEqual({ won: false, winner: null });
		expect(isGameWon({ us: 12, them: 12 })).toEqual({ won: false, winner: null });
	});
});

function doublesPlaying(overrides: Partial<ScoreboardState> = {}): ScoreboardState {
	return {
		mode: "doubles",
		scores: { us: 3, them: 2 },
		servingTeam: "us",
		serverNumber: 1,
		isFirstServiceOfGame: false,
		history: [],
		status: "playing",
		winner: null,
		firstServer: "us",
		...overrides,
	};
}

describe("applyRallyResult — 單打", () => {
	it("發球方贏 → 該方 +1，發球權不變", () => {
		const state = singlesInitial();
		const next = applyRallyResult(state, "us");
		expect(next.scores).toEqual({ us: 1, them: 0 });
		expect(next.servingTeam).toBe("us");
		expect(next.serverNumber).toBe(1);
	});

	it("接發方贏 → side-out，雙方分數不變", () => {
		const state = singlesInitial({ scores: { us: 3, them: 2 } });
		const next = applyRallyResult(state, "them");
		expect(next.scores).toEqual({ us: 3, them: 2 });
		expect(next.servingTeam).toBe("them");
		expect(next.serverNumber).toBe(1);
	});
});

describe("applyRallyResult — 雙打標準輪換", () => {
	it("發球方 #1 輸 → 同隊 #2 接手", () => {
		const state = doublesPlaying({ serverNumber: 1 });
		const next = applyRallyResult(state, "them");
		expect(next.servingTeam).toBe("us");
		expect(next.serverNumber).toBe(2);
		expect(next.scores).toEqual({ us: 3, them: 2 });
	});

	it("發球方 #2 輸 → side-out 給對方，serverNumber 重置為 1", () => {
		const state = doublesPlaying({ serverNumber: 2 });
		const next = applyRallyResult(state, "them");
		expect(next.servingTeam).toBe("them");
		expect(next.serverNumber).toBe(1);
		expect(next.scores).toEqual({ us: 3, them: 2 });
	});

	it("發球方贏 → 該方 +1，serverNumber 不變（左右場由分數奇偶推導）", () => {
		const state = doublesPlaying({ serverNumber: 2 });
		const next = applyRallyResult(state, "us");
		expect(next.scores).toEqual({ us: 4, them: 2 });
		expect(next.servingTeam).toBe("us");
		expect(next.serverNumber).toBe(2);
	});
});

describe("applyRallyResult — 雙打 0-0-2 起手", () => {
	it("開賽方輸（isFirstServiceOfGame=true, serverNumber=2）→ 直接 side-out", () => {
		const state: ScoreboardState = {
			mode: "doubles",
			scores: { us: 0, them: 0 },
			servingTeam: "us",
			serverNumber: 2,
			isFirstServiceOfGame: true,
			history: [],
			status: "setup",
			winner: null,
			firstServer: "us",
		};
		const next = applyRallyResult(state, "them");
		expect(next.servingTeam).toBe("them");
		expect(next.serverNumber).toBe(1);
		expect(next.isFirstServiceOfGame).toBe(false);
	});

	it("開賽方贏 → +1，isFirstServiceOfGame 變 false", () => {
		const state: ScoreboardState = {
			mode: "doubles",
			scores: { us: 0, them: 0 },
			servingTeam: "us",
			serverNumber: 2,
			isFirstServiceOfGame: true,
			history: [],
			status: "setup",
			winner: null,
			firstServer: "us",
		};
		const next = applyRallyResult(state, "us");
		expect(next.scores).toEqual({ us: 1, them: 0 });
		expect(next.serverNumber).toBe(2);
		expect(next.isFirstServiceOfGame).toBe(false);
	});
});
