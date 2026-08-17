import { describe, it, expect } from "vitest";

import {
	teammateKeys,
	opponentKeys,
	fullMatchKey,
	buildSignatureIndex,
	countRepeats,
	ratingSpread,
	avoidRepeats,
} from "./duplication";
import type { DoublesComposition, Match, Team } from "./allocation-types";
import type { Player } from "./types";

// 測試用的完整參賽者建構器，與 pairing.test.ts／candidates.test.ts 同構，
// 刻意不共用——duplication.test.ts 保持獨立、不依賴其他測試檔。
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

function makeTeam(players: Player[]): Team {
	return { players, rating: players.reduce((sum, p) => sum + p.rating, 0) };
}

function makeSinglesMatch(courtNumber: number, p1: Player, p2: Player): Match {
	return { courtNumber, teams: [makeTeam([p1]), makeTeam([p2])], format: "singles" };
}

function makeDoublesMatch(
	courtNumber: number,
	team1: Player[],
	team2: Player[],
	doublesComposition: DoublesComposition = "general",
): Match {
	return { courtNumber, teams: [makeTeam(team1), makeTeam(team2)], format: "doubles", doublesComposition };
}

describe("三類簽章", () => {
	it("三類簽章與球員排列順序無關", () => {
		const a = makePlayer({ id: "a" });
		const b = makePlayer({ id: "b" });
		const c = makePlayer({ id: "c" });
		const d = makePlayer({ id: "d" });

		const original = makeDoublesMatch(1, [a, b], [c, d]);
		// 隊內互換：team1 內部 a,b 對調、team2 內部 c,d 對調。
		const teamsInternallySwapped = makeDoublesMatch(1, [b, a], [d, c]);
		// 兩隊互換：原本的 team2 變成 team1、team1 變成 team2。
		const sidesSwapped = makeDoublesMatch(1, [c, d], [a, b]);

		expect(teammateKeys(teamsInternallySwapped)).toEqual(teammateKeys(original));
		expect(opponentKeys(teamsInternallySwapped)).toEqual(opponentKeys(original));
		expect(fullMatchKey(teamsInternallySwapped)).toEqual(fullMatchKey(original));

		expect(teammateKeys(sidesSwapped)).toEqual(teammateKeys(original));
		expect(opponentKeys(sidesSwapped)).toEqual(opponentKeys(original));
		expect(fullMatchKey(sidesSwapped)).toEqual(fullMatchKey(original));

		// 單打亦須驗證兩隊互換順序無關（單打隊伍只有 1 人，隊內互換不適用）。
		const singlesOriginal = makeSinglesMatch(1, a, b);
		const singlesSidesSwapped = makeSinglesMatch(1, b, a);
		expect(teammateKeys(singlesSidesSwapped)).toEqual(teammateKeys(singlesOriginal));
		expect(opponentKeys(singlesSidesSwapped)).toEqual(opponentKeys(singlesOriginal));
		expect(fullMatchKey(singlesSidesSwapped)).toEqual(fullMatchKey(singlesOriginal));
	});
});

describe("重複偵測", () => {
	it("與歷史有相同隊友或對手組合時判定為重複", () => {
		const a = makePlayer({ id: "a" });
		const b = makePlayer({ id: "b" });
		const c = makePlayer({ id: "c" });
		const d = makePlayer({ id: "d" });
		const e = makePlayer({ id: "e" });
		const f = makePlayer({ id: "f" });
		const g = makePlayer({ id: "g" });
		const h = makePlayer({ id: "h" });
		const i = makePlayer({ id: "i" });
		const j = makePlayer({ id: "j" });

		// 歷史紀錄：a、b 為隊友，對上 c、d。
		const historyMatch = makeDoublesMatch(1, [a, b], [c, d]);
		const seen = buildSignatureIndex([historyMatch]);

		// 新場次的隊友組合與歷史相同（a、b 仍是隊友），即使對手換成 e、f。
		const sameTeammates = makeDoublesMatch(1, [a, b], [e, f]);
		// 新場次的交叉對手組合與歷史相同（a 對上 c），即使隊友換了。
		const sameOpponent = makeDoublesMatch(1, [a, e], [c, f]);
		// 完全沒有交集：g、h、i、j 皆未出現在歷史紀錄中。
		const noOverlap = makeDoublesMatch(1, [g, h], [i, j]);

		expect(countRepeats([sameTeammates], seen)).toBe(1);
		expect(countRepeats([sameOpponent], seen)).toBe(1);
		expect(countRepeats([noOverlap], seen)).toBe(0);
	});
});

describe("受限交換", () => {
	it("有可行交換時降低重複數且不更動出場名單", () => {
		// 單打、2 個場地。court1 為 a vs b（歷史重複），court2 為 c vs d（無重複）。
		// a、c 的強度非常接近（8.0 / 7.9），跨場地互換能讓 court1 換成 a vs c（分差僅 0.1），
		// 使全場強度差距總和不增反減，是一次「零成本甚至更優」的迴避機會。
		const a = makePlayer({ id: "a", rating: 8.0 });
		const b = makePlayer({ id: "b", rating: 6.0 });
		const c = makePlayer({ id: "c", rating: 7.9 });
		const d = makePlayer({ id: "d", rating: 2.0 });

		const before = [makeSinglesMatch(1, a, b), makeSinglesMatch(2, c, d)];
		const seen = buildSignatureIndex([makeSinglesMatch(1, a, b)]);

		const repeatsBefore = countRepeats(before, seen);
		const spreadBefore = ratingSpread(before);

		const after = avoidRepeats(before, seen);

		expect(countRepeats(after, seen)).toBeLessThan(repeatsBefore);
		expect(ratingSpread(after)).toBeLessThanOrEqual(spreadBefore);

		// avoidRepeats 只能重排既有球員的位置，不得新增或移除任何人——
		// 出場名單（本函式的輸入輸出皆不含休息名單）成員在調整前後必須完全相同（tasks 7.3、7.6）。
		const idsOf = (matches: readonly Match[]) => matches.flatMap((m) => m.teams.flatMap((t) => t.players.map((p) => p.id))).sort();
		expect(idsOf(after)).toEqual(idsOf(before));
	});

	it("迴避會擴大強度差距時保留原配對並接受重複", () => {
		// court1 為 a vs b（強度非常接近，分差 0.1，歷史重複），court2 為 c vs d（分差 3.0）。
		// 兩隊都已經是「強度最接近」的配對方式，任何跨場地交換都會讓分差總和大幅變大，
		// 故所有能消除重複的交換皆不可行，MUST 保留原配對並接受重複。
		const a = makePlayer({ id: "a", rating: 8.0 });
		const b = makePlayer({ id: "b", rating: 7.9 });
		const c = makePlayer({ id: "c", rating: 4.0 });
		const d = makePlayer({ id: "d", rating: 1.0 });

		const before = [makeSinglesMatch(1, a, b), makeSinglesMatch(2, c, d)];
		const seen = buildSignatureIndex([makeSinglesMatch(1, a, b)]);

		const repeatsBefore = countRepeats(before, seen);
		const spreadBefore = ratingSpread(before);

		const after = avoidRepeats(before, seen);

		expect(countRepeats(after, seen)).toBe(repeatsBefore);
		expect(ratingSpread(after)).toBe(spreadBefore);
		expect(after).toEqual(before);
	});
});

describe("ratingSpread 的浮點誤差防護", () => {
	it("團隊 rating 加總的浮點誤差在四捨五入到分後不影響強度差距計算", () => {
		// PRD 的 rating 為兩位小數（1.00～8.00），Team.rating 是隊內成員 rating 的加總，
		// 1.1 + 2.2 在 IEEE754 下會得到 3.3000000000000003 而非數學上相等的 1.0 + 2.3 = 3.3。
		const a = makePlayer({ id: "a", rating: 1.1 });
		const b = makePlayer({ id: "b", rating: 2.2 });
		const c = makePlayer({ id: "c", rating: 1.0 });
		const d = makePlayer({ id: "d", rating: 2.3 });

		// 先證明浮點誤差確實存在，避免這個測試在未來 JS 引擎行為改變時失去意義。
		expect(a.rating + b.rating).not.toBe(c.rating + d.rating);

		const match: Match = {
			courtNumber: 1,
			teams: [
				{ players: [a, b], rating: a.rating + b.rating }, // 3.3000000000000003
				{ players: [c, d], rating: c.rating + d.rating }, // 3.3（位元上乾淨）
			],
			format: "doubles",
			doublesComposition: "general",
		};

		// 兩隊分數數學上相等（皆為 3.3），差距 MUST 為 0——若直接比較原始浮點數，
		// 約 4.44e-16 的誤差會讓 avoidRepeats「調整後 <= 調整前」的判準在特定名單上
		// 被雜訊誤判為「變大」，導致本該接受的零成本交換被錯誤拒絕。
		expect(ratingSpread([match])).toBe(0);
	});
});
