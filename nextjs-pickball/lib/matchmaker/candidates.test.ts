import { describe, it, expect } from "vitest";

import { countPlaying, selectPlaying, sortCandidates } from "./candidates";
import { DEFAULT_COURT_COUNT, DEFAULT_FORMAT, MAX_COURT_COUNT } from "./allocation-types";
import type { Player } from "./types";

// 測試用的完整參賽者建構器，預設值皆為合法值，呼叫端可用 overrides 覆寫個別欄位。
// 與 roster.test.ts 的 makePlayer 同構，刻意不共用——candidates.test.ts 保持獨立、不依賴其他測試檔。
function makePlayer(overrides: Partial<Player> = {}): Player {
	return {
		id: "p1",
		name: "小明",
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

describe("sortCandidates", () => {
	it("休息次數多者優先出場", () => {
		const a = makePlayer({ id: "a", restCount: 3 });
		const b = makePlayer({ id: "b", restCount: 2 });
		const c = makePlayer({ id: "c", restCount: 1 });
		const d = makePlayer({ id: "d", restCount: 0 });

		const sorted = sortCandidates([d, b, a, c]);

		expect(sorted.map((p) => p.id)).toEqual(["a", "b", "c", "d"]);
	});

	it("同休息次數時強度分數高者優先", () => {
		const players = [
			makePlayer({ id: "a", restCount: 2, rating: 3.0 }),
			makePlayer({ id: "b", restCount: 2, rating: 5.0 }),
			makePlayer({ id: "c", restCount: 2, rating: 7.0 }),
			makePlayer({ id: "d", restCount: 2, rating: 4.0 }),
		];

		const sorted = sortCandidates(players);

		expect(sorted.map((p) => p.id)).toEqual(["c", "b", "d", "a"]);
	});

	it("休息次數與強度皆相同時維持輸入的相對次序", () => {
		const players = [
			makePlayer({ id: "a", restCount: 1, rating: 5 }),
			makePlayer({ id: "b", restCount: 1, rating: 5 }),
			makePlayer({ id: "c", restCount: 1, rating: 5 }),
		];

		const sorted = sortCandidates(players);

		expect(sorted.map((p) => p.id)).toEqual(["a", "b", "c"]);
		// 對同一份輸入重複呼叫 MUST 得到相同結果。
		expect(sortCandidates(players).map((p) => p.id)).toEqual(["a", "b", "c"]);
		// 排序不得原地改動輸入（design Decision 8：先 slice() 複製）。
		expect(players.map((p) => p.id)).toEqual(["a", "b", "c"]);
	});
});

describe("預設值與場地數範圍", () => {
	it("預設為單打與 1 個場地，場地數範圍為 1～8", () => {
		expect(DEFAULT_FORMAT).toBe("singles");
		expect(DEFAULT_COURT_COUNT).toBe(1);
		expect(MAX_COURT_COUNT).toBe(8);
	});
});

describe("countPlaying", () => {
	it("出場人數取 min(可用人數, 場地數×每場人數) 後向下取整至每場人數的倍數", () => {
		// 雙打、2 個場地、可用人數為 7：min(7, 8) = 7，向下取整至 4 的倍數 = 4。
		expect(countPlaying(7, "doubles", 2)).toBe(4);
		// 單打、2 個場地、可用人數為 7：min(7, 4) = 4。
		expect(countPlaying(7, "singles", 2)).toBe(4);
	});
});

describe("selectPlaying", () => {
	it("暫停出場者不進入候選池，既不出場也不列入休息名單", () => {
		// 3 位在場者、單打 1 個場地：出場人數 = min(3, 2) = 2，恰好留 1 人休息，
		// 用來驗證休息名單裡不會混入暫停者。
		const active1 = makePlayer({ id: "a", restCount: 2 });
		const active2 = makePlayer({ id: "b", restCount: 1 });
		const active3 = makePlayer({ id: "c", restCount: 0 });
		// 暫停者的 restCount 為全場最高，若邏輯出錯很容易誤把他排進出場或休息名單。
		const paused = makePlayer({ id: "paused", restCount: 99, isActive: false });

		const result = selectPlaying([paused, active1, active2, active3], "singles", 1);

		const allIds = [...result.playing, ...result.resting].map((p) => p.id);
		expect(allIds).not.toContain("paused");
		expect(result.playing.map((p) => p.id)).toEqual(["a", "b"]);
		expect(result.resting.map((p) => p.id)).toEqual(["c"]);
	});
});
