import { describe, it, expect } from "vitest";

import { labelDoublesComposition, pairDoubles, pairSingles } from "./pairing";
import type { Player } from "./types";

// 測試用的完整參賽者建構器，與 candidates.test.ts 的 makePlayer 同構，
// 刻意不共用——pairing.test.ts 保持獨立、不依賴其他測試檔。
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

describe("pairSingles", () => {
	it("單打依強度排序後相鄰兩兩配對", () => {
		const p8 = makePlayer({ id: "p8", rating: 8.0 });
		const p75 = makePlayer({ id: "p75", rating: 7.5 });
		const p4 = makePlayer({ id: "p4", rating: 4.0 });
		const p35 = makePlayer({ id: "p35", rating: 3.5 });
		// 刻意打亂輸入順序，確認函式自行依 rating 排序，不依賴呼叫端先排序好。
		const playing = [p4, p8, p35, p75];

		const matches = pairSingles(playing);

		expect(matches).toHaveLength(2);
		expect(matches[0].teams.map((t) => t.players[0].id)).toEqual(["p8", "p75"]);
		expect(matches[1].teams.map((t) => t.players[0].id)).toEqual(["p4", "p35"]);

		// PRD 5.4「盡量接近」缺乏絕對閾值，故用相對比較：4 人分兩隊只有 3 種分法，
		// 逐一算出分差總和，驗證相鄰配對法為最小值。
		const [a, b, c, d] = [8.0, 7.5, 4.0, 3.5];
		const adjacentSum = Math.abs(a - b) + Math.abs(c - d);
		const otherSum1 = Math.abs(a - c) + Math.abs(b - d);
		const otherSum2 = Math.abs(a - d) + Math.abs(b - c);
		expect(adjacentSum).toBeLessThanOrEqual(otherSum1);
		expect(adjacentSum).toBeLessThanOrEqual(otherSum2);
	});

	it("單打每隊一人，隊伍分數等於該員 rating", () => {
		const players = [
			makePlayer({ id: "a", rating: 5.5 }),
			makePlayer({ id: "b", rating: 3.0 }),
			makePlayer({ id: "c", rating: 6.0 }),
			makePlayer({ id: "d", rating: 2.5 }),
		];

		const matches = pairSingles(players);

		expect(matches).toHaveLength(2);
		for (const match of matches) {
			expect(match.format).toBe("singles");
			expect(match.teams).toHaveLength(2);
			for (const team of match.teams) {
				expect(team.players).toHaveLength(1);
				expect(team.rating).toBe(team.players[0].rating);
			}
			// 單打場次不帶雙打組成標示（labelDoublesComposition 只在雙打場次被呼叫）。
			expect(match.doublesComposition).toBeUndefined();
		}
	});
});

describe("pairDoubles", () => {
	it("雙打組內以最高＋最低對第二高＋第三高", () => {
		const p8 = makePlayer({ id: "p8", rating: 8.0 });
		const p6 = makePlayer({ id: "p6", rating: 6.0 });
		const p5 = makePlayer({ id: "p5", rating: 5.0 });
		const p2 = makePlayer({ id: "p2", rating: 2.0 });
		const playing = [p5, p2, p8, p6];

		const matches = pairDoubles(playing);

		expect(matches).toHaveLength(1);
		expect(matches[0].format).toBe("doubles");
		const [team1, team2] = matches[0].teams;
		expect(team1.players.map((p) => p.id)).toEqual(["p8", "p2"]);
		expect(team1.rating).toBe(10.0);
		expect(team2.players.map((p) => p.id)).toEqual(["p6", "p5"]);
		expect(team2.rating).toBe(11.0);
		// 順帶驗證 doublesComposition 已掛上（4 人皆預設 male）——標示邏輯的接線由此確認。
		expect(matches[0].doublesComposition).toBe("mens");
	});

	it("雙打組隊方式的兩隊總和差不大於其餘分隊方式", () => {
		const ratings = [7.5, 6.5, 5.5, 3.0];
		const players = ratings.map((rating, i) => makePlayer({ id: `p${i}`, rating }));

		const matches = pairDoubles(players);

		const [team1, team2] = matches[0].teams;
		const actualDiff = Math.abs(team1.rating - team2.rating);

		// PRD 5.5「盡量平衡」缺乏絕對閾值，故用相對比較：4 人分兩隊只有 3 種分法，逐一算出來比較。
		const [a, b, c, d] = ratings;
		const diffHighLowVsMid = Math.abs(a + d - (b + c)); // 最高+最低 vs 第2高+第3高（實作採用的分法）
		const diffTopTwoVsBottomTwo = Math.abs(a + b - (c + d));
		const diffOuterCrossVsInnerCross = Math.abs(a + c - (b + d));

		expect(actualDiff).toBe(diffHighLowVsMid);
		expect(actualDiff).toBeLessThanOrEqual(diffTopTwoVsBottomTwo);
		expect(actualDiff).toBeLessThanOrEqual(diffOuterCrossVsInnerCross);
	});

	it("多組雙打依強度由高到低每 4 人切分", () => {
		const ratings = [8.0, 7.5, 7.0, 6.5, 5.0, 4.5, 4.0, 3.5];
		const players = ratings.map((rating, i) => makePlayer({ id: `p${i}`, rating }));
		// 打亂輸入順序，確認函式自行依 rating 由高到低排序後再切分。
		const shuffled = [players[3], players[0], players[7], players[1], players[5], players[2], players[6], players[4]];

		const matches = pairDoubles(shuffled);

		expect(matches).toHaveLength(2);
		const firstMatchIds = matches[0].teams.flatMap((t) => t.players.map((p) => p.id)).sort();
		const secondMatchIds = matches[1].teams.flatMap((t) => t.players.map((p) => p.id)).sort();
		expect(firstMatchIds).toEqual(["p0", "p1", "p2", "p3"]);
		expect(secondMatchIds).toEqual(["p4", "p5", "p6", "p7"]);
	});

	it("雙打人數非 4 的倍數時，剩餘不足 4 人不產生殘缺隊伍且不崩潰", () => {
		const players = [
			makePlayer({ id: "p1", rating: 8.0 }),
			makePlayer({ id: "p2", rating: 6.0 }),
			makePlayer({ id: "p3", rating: 5.0 }),
			makePlayer({ id: "p4", rating: 4.0 }),
			makePlayer({ id: "p5", rating: 3.0 }),
		];

		expect(() => pairDoubles(players)).not.toThrow();
		const matches = pairDoubles(players);
		expect(matches).toHaveLength(1);
		expect(matches.every((m) => m.teams.every((t) => t.players.length === 2))).toBe(true);
	});
});

describe("labelDoublesComposition", () => {
	it("雙打四人同性別時標示男雙或女雙", () => {
		const men = [
			makePlayer({ id: "m1", gender: "male" }),
			makePlayer({ id: "m2", gender: "male" }),
			makePlayer({ id: "m3", gender: "male" }),
			makePlayer({ id: "m4", gender: "male" }),
		];
		const women = [
			makePlayer({ id: "w1", gender: "female" }),
			makePlayer({ id: "w2", gender: "female" }),
			makePlayer({ id: "w3", gender: "female" }),
			makePlayer({ id: "w4", gender: "female" }),
		];

		expect(labelDoublesComposition(men)).toBe("mens");
		expect(labelDoublesComposition(women)).toBe("womens");
	});

	it("雙打兼有男女且無其他時標示混雙", () => {
		const fourPlayers = [
			makePlayer({ id: "m1", gender: "male" }),
			makePlayer({ id: "w1", gender: "female" }),
			makePlayer({ id: "m2", gender: "male" }),
			makePlayer({ id: "w2", gender: "female" }),
		];

		expect(labelDoublesComposition(fourPlayers)).toBe("mixed");
	});

	it("雙打含其他不指定時標示一般雙打", () => {
		const fourPlayers = [
			makePlayer({ id: "m1", gender: "male" }),
			makePlayer({ id: "w1", gender: "female" }),
			makePlayer({ id: "o1", gender: "other" }),
			makePlayer({ id: "m2", gender: "male" }),
		];

		expect(labelDoublesComposition(fourPlayers)).toBe("general");
	});
});
