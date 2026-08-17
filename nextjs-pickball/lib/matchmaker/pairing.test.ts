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

// 給定任意順序的 4 位球員，回傳「分兩隊、兩隊各 2 人」三種分法的隊伍分差（絕對值）。
// 分法差從實際回傳的 teams 反推，而非依賴 hardcode 的 ratings 陣列重算——後者只驗證了
// 特定公式，把 pairDoubles 換成回傳硬編隊伍的 stub 也會全綠（reviewer 指出的恆真斷言問題）。
// 4 人任兩兩分組只有 3 種分法，且此公式與輸入順序無關（重排入參只會讓 3 種分法互換位置，
// 回傳的集合不變）。
function computeAllSplitDiffs(fourPlayers: readonly Player[]): readonly [number, number, number] {
	const [p0, p1, p2, p3] = fourPlayers;
	return [
		Math.abs(p0.rating + p1.rating - (p2.rating + p3.rating)),
		Math.abs(p0.rating + p2.rating - (p1.rating + p3.rating)),
		Math.abs(p0.rating + p3.rating - (p1.rating + p2.rating)),
	];
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
		// courtNumber 初值為 0（placeholder，代表「尚未指派」），實際編號由 allocateRound
		// 的步驟 4 指派；pairSingles 本身不知道、也不假裝知道最終場地編號（reviewer M3）。
		expect(matches.map((m) => m.courtNumber)).toEqual([0, 0]);

		// PRD 5.4「盡量接近」缺乏絕對閾值，故用相對比較：4 人分兩隊只有 3 種分法，
		// 逐一算出分差總和，驗證相鄰配對法為最小值。
		const [a, b, c, d] = [8.0, 7.5, 4.0, 3.5];
		const adjacentSum = Math.abs(a - b) + Math.abs(c - d);
		const otherSum1 = Math.abs(a - c) + Math.abs(b - d);
		const otherSum2 = Math.abs(a - d) + Math.abs(b - c);
		expect(adjacentSum).toBeLessThanOrEqual(otherSum1);
		expect(adjacentSum).toBeLessThanOrEqual(otherSum2);

		// 排序不得原地改動輸入（design Decision 8：先 slice() 複製，同 candidates.test.ts:63 的作法）。
		expect(playing.map((p) => p.id)).toEqual(["p4", "p8", "p35", "p75"]);
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

	it("單打人數為奇數時，最後一人略過且不產生殘缺隊伍", () => {
		// spec「任何情況下 MUST NOT 產生不完整隊伍」是全域承諾，pairDoubles 已有對應防呆測試，
		// 這裡補上對稱的一個：3 人只湊出 1 場，剩 1 人略過，不 throw、不產生
		// players 含 undefined／rating 為 NaN 的殘缺隊伍。
		const players = [
			makePlayer({ id: "p1", rating: 8.0 }),
			makePlayer({ id: "p2", rating: 6.0 }),
			makePlayer({ id: "p3", rating: 4.0 }),
		];

		expect(() => pairSingles(players)).not.toThrow();
		const matches = pairSingles(players);
		expect(matches).toHaveLength(1);
		expect(
			matches.every((m) => m.teams.every((t) => t.players.length === 1 && !Number.isNaN(t.rating))),
		).toBe(true);
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

		// 排序不得原地改動輸入（design Decision 8）。
		expect(playing.map((p) => p.id)).toEqual(["p5", "p2", "p8", "p6"]);
	});

	it("雙打組隊方式的兩隊總和差不大於其餘分隊方式", () => {
		// table-driven：涵蓋頂端差距 x（第 1、2 高之差）與底端差距 z（第 3、4 高之差）
		// 的三種相對關係，以及含重複 rating 值的情形。原本的測試只取單一組合
		// （x=1.0、z=2.5，即 x<z）的順風局，未涵蓋 x>z、x=z 與重複值。
		const cases: { readonly name: string; readonly ratings: readonly [number, number, number, number] }[] = [
			{ name: "x>z：頂端差距大於底端差距", ratings: [8.0, 5.0, 4.0, 3.0] },
			{ name: "x<z：頂端差距小於底端差距（原始順風局）", ratings: [7.5, 6.5, 5.5, 3.0] },
			{ name: "x=z：頂端與底端差距相等", ratings: [8.0, 6.0, 4.0, 2.0] },
			{ name: "含重複 rating 值", ratings: [8.0, 8.0, 2.0, 2.0] },
		];

		for (const { ratings } of cases) {
			const players = ratings.map((rating, i) => makePlayer({ id: `p${i}`, rating }));

			const matches = pairDoubles(players);

			const [team1, team2] = matches[0].teams;
			const actualDiff = Math.abs(team1.rating - team2.rating);

			// 分法差從實際回傳的 teams 反推，而非重算 hardcode 的 ratings 陣列。
			const allPlayers = [...team1.players, ...team2.players];
			const [diffA, diffB, diffC] = computeAllSplitDiffs(allPlayers);

			// 實作採用的分法必為三種分法之一，PRD 5.5「盡量平衡」要求它不大於其餘兩種。
			expect([diffA, diffB, diffC]).toContain(actualDiff);
			expect(actualDiff).toBeLessThanOrEqual(diffA);
			expect(actualDiff).toBeLessThanOrEqual(diffB);
			expect(actualDiff).toBeLessThanOrEqual(diffC);
		}
	});

	it("多組雙打依強度由高到低每 4 人切分", () => {
		const ratings = [8.0, 7.5, 7.0, 6.5, 5.0, 4.5, 4.0, 3.5];
		const players = ratings.map((rating, i) => makePlayer({ id: `p${i}`, rating }));
		// 打亂輸入順序，確認函式自行依 rating 由高到低排序後再切分。
		const shuffled = [
			players[3],
			players[0],
			players[7],
			players[1],
			players[5],
			players[2],
			players[6],
			players[4],
		];

		const matches = pairDoubles(shuffled);

		expect(matches).toHaveLength(2);
		const firstMatchIds = matches[0].teams.flatMap((t) => t.players.map((p) => p.id)).sort();
		const secondMatchIds = matches[1].teams.flatMap((t) => t.players.map((p) => p.id)).sort();
		expect(firstMatchIds).toEqual(["p0", "p1", "p2", "p3"]);
		expect(secondMatchIds).toEqual(["p4", "p5", "p6", "p7"]);
		// courtNumber 初值為 0（placeholder，代表「尚未指派」），實際編號由 allocateRound
		// 的步驟 4 指派；pairDoubles 本身不知道、也不假裝知道最終場地編號（reviewer M3）。
		expect(matches.map((m) => m.courtNumber)).toEqual([0, 0]);
	});

	it("雙打人數非 4 的倍數時，剩餘不足 4 人不產生殘缺隊伍且不崩潰", () => {
		// 此為 tasks 4.3 的防呆驗證，非 spec 驗收錨點——人數已於選人階段（§2）保證為 4 的倍數，
		// 這裡驗的是「萬一收到非 4 的倍數也不崩潰」的防呆行為，日後若改成入口驗證（throw）
		// 而非靜默略過，須連同這個 it 一起檢視是否仍適用。
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

	it("四人 rating 全相同時，配對順序等同輸入順序，且重複呼叫結果一致", () => {
		// 新建名單時常見全員 rating 相同（PRD 預設值），此時配對結果完全由上游 selectPlaying
		// 的 restCount 排序決定。sortByRatingDesc 使用 Array.prototype.sort，ES2019 起保證
		// 穩定排序，故 rating 全相同時會保留輸入的相對次序。刻意不加 id tiebreak：
		// 那會蓋掉上游 restCount 排序意圖（reviewer 提醒），這裡只用測試 + 註解把依賴釘住。
		const players = [
			makePlayer({ id: "p1", rating: 4 }),
			makePlayer({ id: "p2", rating: 4 }),
			makePlayer({ id: "p3", rating: 4 }),
			makePlayer({ id: "p4", rating: 4 }),
		];

		const matches = pairDoubles(players);
		const orderedIds = matches[0].teams.flatMap((t) => t.players.map((p) => p.id));
		// 最高＋最低＝輸入第 1、4 人；第 2 高＋第 3 高＝輸入第 2、3 人。
		expect(orderedIds).toEqual(["p1", "p4", "p2", "p3"]);

		// 對同一份輸入重複呼叫 MUST 得到相同結果。
		const matchesAgain = pairDoubles(players);
		expect(matchesAgain[0].teams.flatMap((t) => t.players.map((p) => p.id))).toEqual(orderedIds);
	});

	it("隊伍分數加總後四捨五入至小數第 2 位，避免浮點誤差污染分差比較", () => {
		// 反例（reviewer 實測）：2.02 + 1.00 與 2.01 + 1.01 數學上同為 3.02，
		// 但直接 reduce 加總會得到 3.02 與 3.0199999999999996，使原本應為 0 的分差
		// 變成 4.44e-16。Match 會被第 3 段持久化進 LocalStorage，且 design Decision 5
		// 刻意選 ratingSpread(調整後) <= ratingSpread(調整前) 而非 < ——浮點噪音會讓
		// 數學上相等的比較被誤判為 >，等同悄悄退化成 < 的行為，且是否發生取決於
		// rating 的十進位尾數，不可預測、不可解釋。故 buildTeam 內就近四捨五入
		// （與 roster.ts 的 roundRating 慣例一致）。
		const players = [
			makePlayer({ id: "p1", rating: 2.02 }),
			makePlayer({ id: "p2", rating: 2.01 }),
			makePlayer({ id: "p3", rating: 1.01 }),
			makePlayer({ id: "p4", rating: 1.0 }),
		];

		const matches = pairDoubles(players);

		const [team1, team2] = matches[0].teams;
		expect(team1.rating).toBe(3.02);
		expect(team2.rating).toBe(3.02);
	});
});

describe("labelDoublesComposition", () => {
	it("雙打四人同性別時標示男雙或女雙", () => {
		const men: [Player, Player, Player, Player] = [
			makePlayer({ id: "m1", gender: "male" }),
			makePlayer({ id: "m2", gender: "male" }),
			makePlayer({ id: "m3", gender: "male" }),
			makePlayer({ id: "m4", gender: "male" }),
		];
		const women: [Player, Player, Player, Player] = [
			makePlayer({ id: "w1", gender: "female" }),
			makePlayer({ id: "w2", gender: "female" }),
			makePlayer({ id: "w3", gender: "female" }),
			makePlayer({ id: "w4", gender: "female" }),
		];

		expect(labelDoublesComposition(men)).toBe("mens");
		expect(labelDoublesComposition(women)).toBe("womens");
	});

	it("雙打兼有男女且無其他時標示混雙", () => {
		const fourPlayers: [Player, Player, Player, Player] = [
			makePlayer({ id: "m1", gender: "male" }),
			makePlayer({ id: "w1", gender: "female" }),
			makePlayer({ id: "m2", gender: "male" }),
			makePlayer({ id: "w2", gender: "female" }),
		];

		expect(labelDoublesComposition(fourPlayers)).toBe("mixed");
	});

	it("雙打含其他不指定時標示一般雙打", () => {
		const fourPlayers: [Player, Player, Player, Player] = [
			makePlayer({ id: "m1", gender: "male" }),
			makePlayer({ id: "w1", gender: "female" }),
			makePlayer({ id: "o1", gender: "other" }),
			makePlayer({ id: "m2", gender: "male" }),
		];

		expect(labelDoublesComposition(fourPlayers)).toBe("general");
	});
});
