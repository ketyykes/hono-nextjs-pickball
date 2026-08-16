import { describe, it, expect } from "vitest";

import { addPlayer, removePlayer, togglePlayerActive, updatePlayer } from "./roster";
import type { Player } from "./types";

// 測試用的完整參賽者建構器，預設值皆為合法值，呼叫端可用 overrides 覆寫個別欄位。
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

describe("addPlayer", () => {
	it("addPlayer 回傳新陣列且不修改原陣列，id 與 createdAt 取自注入值", () => {
		const roster: Player[] = [];

		const result = addPlayer(
			roster,
			{ name: "小明", gender: "male", rating: 3 },
			{ id: "p1", now: "2026-08-15T00:00:00.000Z" },
		);

		expect(result).toHaveLength(1);
		expect(result[0].id).toBe("p1");
		expect(result[0].createdAt).toBe("2026-08-15T00:00:00.000Z");
		expect(result[0].restCount).toBe(0);
		expect(result[0].gamesPlayed).toBe(0);
		expect(result[0].isActive).toBe(true);

		// 原陣列不受影響，且回傳值是新的參考。
		expect(roster).toHaveLength(0);
		expect(result).not.toBe(roster);
	});
});

describe("updatePlayer", () => {
	it("updatePlayer 只改指定欄位，其餘欄位與他人不受影響", () => {
		const p1 = makePlayer({ id: "p1", name: "小明" });
		const p2 = makePlayer({ id: "p2", name: "小美", rating: 3 });
		const p3 = makePlayer({ id: "p3", name: "小華" });
		const roster: Player[] = [p1, p2, p3];

		const result = updatePlayer(roster, "p2", { rating: 5 });

		const updatedP2 = result.find((p) => p.id === "p2");
		expect(updatedP2?.rating).toBe(5);
		expect(updatedP2?.name).toBe("小美");
		expect(updatedP2?.gender).toBe(p2.gender);
		expect(updatedP2?.colorFrom).toBe(p2.colorFrom);
		expect(updatedP2?.colorTo).toBe(p2.colorTo);
		expect(updatedP2?.restCount).toBe(p2.restCount);
		expect(updatedP2?.gamesPlayed).toBe(p2.gamesPlayed);
		expect(updatedP2?.isActive).toBe(p2.isActive);
		expect(updatedP2?.createdAt).toBe(p2.createdAt);

		expect(result.find((p) => p.id === "p1")).toEqual(p1);
		expect(result.find((p) => p.id === "p3")).toEqual(p3);
	});

	it("updatePlayer 遇到不存在的 id 時不新增也不改動", () => {
		const roster: Player[] = [makePlayer({ id: "p1" }), makePlayer({ id: "p2" })];

		const result = updatePlayer(roster, "does-not-exist", { rating: 5 });

		expect(result).toHaveLength(roster.length);
		expect(result).toEqual(roster);
	});
});

describe("removePlayer", () => {
	it("removePlayer 移除指定 id 並保持其餘順序", () => {
		const roster: Player[] = [
			makePlayer({ id: "p1" }),
			makePlayer({ id: "p2" }),
			makePlayer({ id: "p3" }),
		];

		const result = removePlayer(roster, "p2");

		expect(result.map((p) => p.id)).toEqual(["p1", "p3"]);
	});
});

describe("rating 的 round 行為", () => {
	it("rating 寫入前 round 至兩位小數", () => {
		const added = addPlayer(
			[],
			{ name: "小明", gender: "male", rating: 3.456 },
			{ id: "p1", now: "2026-08-15T00:00:00.000Z" },
		);
		expect(added[0].rating).toBe(3.46);

		const roster: Player[] = [makePlayer({ id: "p1", rating: 3 })];
		const updated = updatePlayer(roster, "p1", { rating: 5.994 });
		expect(updated[0].rating).toBe(5.99);
	});
});

describe("togglePlayerActive", () => {
	it("togglePlayerActive 切換 isActive 且不影響 restCount", () => {
		const roster: Player[] = [makePlayer({ id: "p1", isActive: true, restCount: 3 })];

		const result = togglePlayerActive(roster, "p1");

		expect(result[0].isActive).toBe(false);
		expect(result[0].restCount).toBe(3);
	});

	it("togglePlayerActive 可來回切換", () => {
		const roster: Player[] = [makePlayer({ id: "p1", isActive: true })];

		const once = togglePlayerActive(roster, "p1");
		const twice = togglePlayerActive(once, "p1");

		expect(twice[0].isActive).toBe(true);
	});
});
