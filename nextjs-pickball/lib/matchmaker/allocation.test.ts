import { describe, it, expect } from "vitest";

import { allocateRound } from "./allocation";
import { EMPTY_SIGNATURE_INDEX } from "./allocation-types";
import { buildSignatureIndex } from "./duplication";
import type { AllocationInput, Match, RoundAllocation } from "./allocation-types";
import type { Player } from "./types";

// 測試用的完整參賽者建構器，與 candidates.test.ts／pairing.test.ts／duplication.test.ts 同構，
// 刻意不共用——allocation.test.ts 保持獨立、不依賴其他測試檔。
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

describe("allocateRound", () => {
	it("輸出包含場地編號、兩隊球員與分數、對戰類型與休息名單", () => {
		const players = [
			makePlayer({ id: "p1", rating: 8.0 }),
			makePlayer({ id: "p2", rating: 7.0 }),
			makePlayer({ id: "p3", rating: 6.0 }),
			makePlayer({ id: "p4", rating: 5.0 }),
			makePlayer({ id: "p5", rating: 4.0 }),
		];

		const result = allocateRound({
			players,
			format: "doubles",
			courtCount: 1,
			seenSignatures: EMPTY_SIGNATURE_INDEX,
		});

		expect(result.matches).toHaveLength(1);
		const [match] = result.matches;
		expect(typeof match?.courtNumber).toBe("number");
		expect(match?.format).toBe("doubles");
		expect(match?.doublesComposition).toBeDefined();
		expect(match?.teams).toHaveLength(2);
		for (const team of match?.teams ?? []) {
			expect(team.players).toHaveLength(2);
			expect(typeof team.rating).toBe("number");
		}

		// 同時回傳休息名單：5 人、雙打 1 場地（容量 4），第 5 人（rating 最低）休息
		expect(result.resting).toHaveLength(1);
		expect(result.resting[0]?.id).toBe("p5");
	});

	it("場地編號由 1 起算且連續指派", () => {
		const players = Array.from({ length: 6 }, (_, i) => makePlayer({ id: `p${i + 1}`, rating: 8 - i }));

		const result = allocateRound({
			players,
			format: "singles",
			courtCount: 3,
			seenSignatures: EMPTY_SIGNATURE_INDEX,
		});

		expect(result.matches).toHaveLength(3);
		expect(result.matches.map((m) => m.courtNumber)).toEqual([1, 2, 3]);
	});

	it("相同輸入產生相同輸出", () => {
		const players = Array.from({ length: 8 }, (_, i) => makePlayer({ id: `p${i + 1}`, rating: 8 - i * 0.5, restCount: i % 3 }));
		const input: AllocationInput = {
			players,
			format: "doubles",
			courtCount: 2,
			seenSignatures: EMPTY_SIGNATURE_INDEX,
		};

		const first = allocateRound(input);
		const second = allocateRound(input);

		expect(second).toEqual(first);
	});

	it("場地無法填滿時只產生可完整組成的場次", () => {
		const players = Array.from({ length: 9 }, (_, i) => makePlayer({ id: `p${i + 1}`, rating: 8 - i * 0.5 }));

		const result = allocateRound({
			players,
			format: "doubles",
			courtCount: 3,
			seenSignatures: EMPTY_SIGNATURE_INDEX,
		});

		// 9 人、雙打 3 場地（容量 12）：只夠組 2 場（8 人出場），第 3 個場地不產生場次
		expect(result.matches).toHaveLength(2);
		expect(result.resting).toHaveLength(1);
	});

	it("分配不修改輸入的參賽者物件", () => {
		const players = Array.from({ length: 6 }, (_, i) => makePlayer({ id: `p${i + 1}`, rating: 8 - i, restCount: i }));
		const before = structuredClone(players);

		allocateRound({
			players,
			format: "singles",
			courtCount: 1,
			seenSignatures: EMPTY_SIGNATURE_INDEX,
		});

		expect(players).toEqual(before);
	});

	it("僅性別不同時出場名單與隊伍組成完全一致", () => {
		const baseOverrides = [
			{ id: "p1", rating: 8.0 },
			{ id: "p2", rating: 7.0 },
			{ id: "p3", rating: 6.0 },
			{ id: "p4", rating: 5.0 },
			{ id: "p5", rating: 4.0 },
		];

		const playersA = baseOverrides.map((o) => makePlayer({ ...o, gender: "male" }));
		const gendersB: Array<Player["gender"]> = ["male", "female", "male", "female", "male"];
		const playersB = baseOverrides.map((o, i) => makePlayer({ ...o, gender: gendersB[i] }));

		const input = {
			format: "doubles" as const,
			courtCount: 1,
			seenSignatures: EMPTY_SIGNATURE_INDEX,
		};

		const resultA = allocateRound({ ...input, players: playersA });
		const resultB = allocateRound({ ...input, players: playersB });

		expect(resultB.resting.map((p) => p.id)).toEqual(resultA.resting.map((p) => p.id));
		expect(resultB.matches).toHaveLength(resultA.matches.length);

		resultB.matches.forEach((matchB, i) => {
			const matchA = resultA.matches[i];
			const teamIdsA = matchA?.teams.map((t) => t.players.map((p) => p.id).sort());
			const teamIdsB = matchB.teams.map((t) => t.players.map((p) => p.id).sort());
			expect(teamIdsB).toEqual(teamIdsA);
			expect(matchB.teams.map((t) => t.rating)).toEqual(matchA?.teams.map((t) => t.rating));
		});
	});

	it("強度差距再大也不得讓休息次數多者繼續休息", () => {
		// a 的休息次數最高，但 rating 與其他出場者差距極大（1.0 vs 8.0／7.9）——
		// 若強度配對推翻休息次數優先，a 會被排除以換取更接近的分差，違反嚴格優先序。
		const players = [makePlayer({ id: "a", restCount: 5, rating: 1.0 }), makePlayer({ id: "p2", restCount: 0, rating: 8.0 }), makePlayer({ id: "p3", restCount: 0, rating: 7.9 })];

		const result = allocateRound({
			players,
			format: "singles",
			courtCount: 1,
			seenSignatures: EMPTY_SIGNATURE_INDEX,
		});

		const playingIds = result.matches.flatMap((m) => m.teams.flatMap((t) => t.players.map((p) => p.id)));
		expect(playingIds).toContain("a");
		expect(result.resting.map((p) => p.id)).toEqual(["p3"]);
	});

	it("避免重複會改變出場人選時接受重複", () => {
		// a、b 休息次數最高，必定出場；c 休息次數最低，理應休息。
		// 歷史紀錄恰好是 a vs b，唯一能避開重複的方式是把 c 換上場——但這會違反出場名單決策，
		// 因此 MUST 接受重複，維持 a、b 出場、c 休息。
		const a = makePlayer({ id: "a", restCount: 5, rating: 5.0 });
		const b = makePlayer({ id: "b", restCount: 4, rating: 4.0 });
		const c = makePlayer({ id: "c", restCount: 0, rating: 4.5 });

		const historyMatch: Match = {
			courtNumber: 1,
			teams: [
				{ players: [a], rating: a.rating },
				{ players: [b], rating: b.rating },
			],
			format: "singles",
		};
		const seenSignatures = buildSignatureIndex([historyMatch]);

		const result = allocateRound({
			players: [a, b, c],
			format: "singles",
			courtCount: 1,
			seenSignatures,
		});

		expect(result.matches).toHaveLength(1);
		const playingIds = result.matches[0]?.teams.flatMap((t) => t.players.map((p) => p.id)).sort();
		expect(playingIds).toEqual(["a", "b"]);
		expect(result.resting.map((p) => p.id)).toEqual(["c"]);
	});

	it("無交換可行時照常產生重複的對戰", () => {
		// 只有剛好一場（2 人）的人數，且與歷史完全重複——單打 1 對 1 無任何可行交換
		// （隊內僅 1 人、僅此一場無其他場地可跨場交換），MUST 照常產生該場次。
		const a = makePlayer({ id: "a", rating: 5.0 });
		const b = makePlayer({ id: "b", rating: 4.0 });

		const historyMatch: Match = {
			courtNumber: 1,
			teams: [
				{ players: [a], rating: a.rating },
				{ players: [b], rating: b.rating },
			],
			format: "singles",
		};
		const seenSignatures = buildSignatureIndex([historyMatch]);

		const result = allocateRound({
			players: [a, b],
			format: "singles",
			courtCount: 1,
			seenSignatures,
		});

		expect(result.matches).toHaveLength(1);
		const playingIds = result.matches[0]?.teams.flatMap((t) => t.players.map((p) => p.id)).sort();
		expect(playingIds).toEqual(["a", "b"]);
	});

	it("avoidRepeats 換人後雙打組成標示會依實際成員重新推導", () => {
		// 這是 §7（duplication.ts）留白、§8 整合責任的補齊項（非 spec 驗收錨點，見
		// duplication.ts 的 rebuildMatch 註解）。
		// p1~p4（皆男性）依 rating 形成 court1（標示 mens），p5~p8（皆女性）形成 court2（標示
		// womens）。歷史紀錄只重現 p3 對 p4 這組交叉對手（用不相干的填充球員 zA/zB 湊出隊伍，
		// 確保不會意外命中隊友或完整比賽簽章）。p4 與 p5 的 rating 刻意設為相同（6.9）：
		// 跨場地互換 p4↔p5 能讓 court1 不再命中歷史（p4 離開後 p3 的對手全換了），且因兩人
		// rating 相同，全場強度差距總和 before／after 完全相等，滿足 `<=` 判準被接受。
		// 換人後 court1 變成男女混合（p1、p2、p3 男 + p5 女），court2 也變成男女混合
		// （p6、p7 女 + p4 男），但 pairDoubles 當初蓋的標示仍是 "mens"／"womens"（舊值）——
		// 若 allocateRound 沒有在 avoidRepeats 之後重算，輸出會帶著與實際成員不符的標示。
		const p1 = makePlayer({ id: "p1", rating: 8.0, gender: "male" });
		const p2 = makePlayer({ id: "p2", rating: 7.9, gender: "male" });
		const p3 = makePlayer({ id: "p3", rating: 7.0, gender: "male" });
		const p4 = makePlayer({ id: "p4", rating: 6.9, gender: "male" });
		const p5 = makePlayer({ id: "p5", rating: 6.9, gender: "female" });
		const p6 = makePlayer({ id: "p6", rating: 6.0, gender: "female" });
		const p7 = makePlayer({ id: "p7", rating: 5.0, gender: "female" });
		const p8 = makePlayer({ id: "p8", rating: 1.0, gender: "female" });
		const players = [p1, p2, p3, p4, p5, p6, p7, p8];

		const zA = makePlayer({ id: "zA" });
		const zB = makePlayer({ id: "zB" });
		const historyMatch: Match = {
			courtNumber: 99,
			teams: [
				{ players: [p3, zA], rating: 0 },
				{ players: [p4, zB], rating: 0 },
			],
			format: "doubles",
			doublesComposition: "general",
		};
		const seenSignatures = buildSignatureIndex([historyMatch]);

		const result = allocateRound({
			players,
			format: "doubles",
			courtCount: 2,
			seenSignatures,
		});

		expect(result.matches).toHaveLength(2);
		for (const match of result.matches) {
			const [teamA, teamB] = match.teams;
			const allGenders = new Set([...teamA.players, ...teamB.players].map((p) => p.gender));
			// 兩場最終都混雜了男女球員，標示 MUST 為混雙，不得殘留 pairDoubles 當初蓋的
			// mens／womens 舊值。
			expect(allGenders.has("male") && allGenders.has("female")).toBe(true);
			expect(match.doublesComposition).toBe("mixed");
		}
	});

	it("連續多輪後出場機會輪轉，累計出場次數差距不超過 1", () => {
		// 6 人、單打 1 個場地（每輪出場 2 人）連續產生多輪。每輪結束後由測試自行對「本輪休息者」
		// 的 restCount 加 1（不在 allocateRound 內累加，符合 spec「本 capability SHALL NOT
		// 修改任何 Player 物件」），模擬 candidates.ts 依「休息次數多者優先」帶來的輪轉效果。
		const ids = ["p1", "p2", "p3", "p4", "p5", "p6"];
		let roster: Player[] = ids.map((id) => makePlayer({ id, rating: 3.0, restCount: 0 }));
		const playCounts = new Map<string, number>(ids.map((id) => [id, 0]));

		const ROUNDS = 12;
		for (let round = 0; round < ROUNDS; round++) {
			const { matches, resting } = allocateRound({
				players: roster,
				format: "singles",
				courtCount: 1,
				seenSignatures: EMPTY_SIGNATURE_INDEX,
			});

			const playingIds = new Set(matches.flatMap((m) => m.teams.flatMap((t) => t.players.map((p) => p.id))));
			for (const id of playingIds) {
				playCounts.set(id, (playCounts.get(id) ?? 0) + 1);
			}

			const restingIds = new Set(resting.map((p) => p.id));
			roster = roster.map((p) => (restingIds.has(p.id) ? { ...p, restCount: p.restCount + 1 } : p));
		}

		const counts = Array.from(playCounts.values());
		const spread = Math.max(...counts) - Math.min(...counts);
		expect(spread).toBeLessThanOrEqual(1);
	});

	describe("邊界條件", () => {
		it("單打可用人數不足 2 時回傳空對戰清單", () => {
			const players = [makePlayer({ id: "p1" })];

			const result = allocateRound({
				players,
				format: "singles",
				courtCount: 1,
				seenSignatures: EMPTY_SIGNATURE_INDEX,
			});

			expect(result.matches).toEqual([]);
			expect(result.resting.map((p) => p.id)).toEqual(["p1"]);
		});

		it("雙打可用人數不足 4 時回傳空對戰清單", () => {
			const players = [makePlayer({ id: "p1" }), makePlayer({ id: "p2" }), makePlayer({ id: "p3" })];

			const result = allocateRound({
				players,
				format: "doubles",
				courtCount: 1,
				seenSignatures: EMPTY_SIGNATURE_INDEX,
			});

			expect(result.matches).toEqual([]);
			expect(result.resting.map((p) => p.id).sort()).toEqual(["p1", "p2", "p3"]);
		});

		it("全員暫停出場時對戰與休息名單皆為空", () => {
			const players = [makePlayer({ id: "p1", isActive: false }), makePlayer({ id: "p2", isActive: false })];

			const result = allocateRound({
				players,
				format: "singles",
				courtCount: 1,
				seenSignatures: EMPTY_SIGNATURE_INDEX,
			});

			expect(result.matches).toEqual([]);
			expect(result.resting).toEqual([]);
		});

		it("名單為空時回傳空結果且不拋錯", () => {
			let result: RoundAllocation | undefined;

			expect(() => {
				result = allocateRound({
					players: [],
					format: "singles",
					courtCount: 1,
					seenSignatures: EMPTY_SIGNATURE_INDEX,
				});
			}).not.toThrow();

			expect(result?.matches).toEqual([]);
			expect(result?.resting).toEqual([]);
		});

		it("場地數超出 1～8 時拒絕輸入而非靜默夾值", () => {
			const players = [makePlayer({ id: "p1" }), makePlayer({ id: "p2" })];

			expect(() =>
				allocateRound({
					players,
					format: "singles",
					courtCount: 0,
					seenSignatures: EMPTY_SIGNATURE_INDEX,
				}),
			).toThrow(/1.*8/);

			expect(() =>
				allocateRound({
					players,
					format: "singles",
					courtCount: 9,
					seenSignatures: EMPTY_SIGNATURE_INDEX,
				}),
			).toThrow(/1.*8/);
		});
	});
});
