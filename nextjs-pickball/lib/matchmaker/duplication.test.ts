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

	it("一場同時命中隊友與對手組合仍只算一次重複", () => {
		// countRepeats 回傳的是「有命中的場次數」，不是「命中次數」——一場對戰即使同時命中
		// 隊友、交叉對手（甚至完整比賽）三類簽章，也只算 1 場重複，不是 2 或 3
		// （第 3 批 code review D5，避免計數語意被誤讀成命中次數的加總）。
		const a = makePlayer({ id: "a" });
		const b = makePlayer({ id: "b" });
		const c = makePlayer({ id: "c" });
		const d = makePlayer({ id: "d" });

		const historyMatch = makeDoublesMatch(1, [a, b], [c, d]);
		const seen = buildSignatureIndex([historyMatch]);

		// 與歷史完全相同的組合：teammateKeys、opponentKeys、fullMatchKey 三類同時命中。
		const exactRepeat = makeDoublesMatch(1, [a, b], [c, d]);

		expect(countRepeats([exactRepeat], seen)).toBe(1);
	});
});

describe("ratingSpread 的回傳單位", () => {
	// 非 spec 驗收錨點——spec 只要求相對比較行為，本 it 額外 pin 住回傳值的絕對單位是
	// 「分數」而非內部運算用的「分」（cents），避免 `totalCents / CENTS_PER_RATING_UNIT`
	// 這道除回浮點的動作被誤刪或誤改（第 3 批 code review：曾實測拿掉除以 100、直接回傳
	// cents，既有測試因為只做相對比較全部照樣通過）。
	it("單打分差為兩隊 rating 差的絕對值，回傳單位為分數而非分", () => {
		const a = makePlayer({ id: "a", rating: 8 });
		const b = makePlayer({ id: "b", rating: 6 });

		expect(ratingSpread([makeSinglesMatch(1, a, b)])).toBe(2);
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

	it("強度差距總和完全不變時仍接受交換", () => {
		// design Decision 5：判準取 `調整後總和 <= 調整前總和`（含相等），而非 `<`——
		// 「相等代表強度品質未劣化，此時若能減少重複就該接受；用 `<` 會讓大量『零成本』的
		// 迴避機會被白白放棄」。前一個 it（分差從 7.9 降到 4.1）只驗證了嚴格變小的情況，
		// 沒有任何 fixture 逼出「相等也要接受」這條分支——`spread <= current.spread` 改成
		// `spread < current.spread` 一樣能通過既有測試。
		//
		// court1 為 a(5.0) vs b(3.0)（歷史重複），court2 為 c(5.0) vs d(3.0)——與 court1
		// 數值完全相同，只是不同人。交換 a 與 c 後，court1 變成 c vs b（5.0 vs 3.0）、
		// court2 變成 a vs d（5.0 vs 3.0），兩場分差總和前後都是 4.0，完全相等，
		// 但重複數從 1 降到 0。
		const a = makePlayer({ id: "a", rating: 5.0 });
		const b = makePlayer({ id: "b", rating: 3.0 });
		const c = makePlayer({ id: "c", rating: 5.0 });
		const d = makePlayer({ id: "d", rating: 3.0 });

		const before = [makeSinglesMatch(1, a, b), makeSinglesMatch(2, c, d)];
		const seen = buildSignatureIndex([makeSinglesMatch(1, a, b)]);

		const repeatsBefore = countRepeats(before, seen);
		const spreadBefore = ratingSpread(before);

		const after = avoidRepeats(before, seen);

		expect(countRepeats(after, seen)).toBeLessThan(repeatsBefore);
		expect(ratingSpread(after)).toBe(spreadBefore);
	});

	it("雙打隊內換隊友能消除隊友組合重複（受限交換階段②）", () => {
		// 既有兩個 avoidRepeats 測試皆為單打，單打的階段②（intraTeamSwapCandidates）
		// 只是把兩隊標籤互換——簽章與分數皆不變，永遠不會被採納。階段②真正有效的路徑
		// （雙打隊內換隊友）一次都沒被既有測試執行過（第 4 批 code review D4）。
		//
		// 刻意只用「一個場地」：crossCourtSwapCandidates（階段①）需要至少兩個場次才有
		// 跨場地候選，單一場地時階段①產生零候選，確保消除這個重複的唯一途徑是階段②，
		// 不會被階段①提前解決而蓋過階段②本身有沒有效果。
		const a = makePlayer({ id: "a", rating: 5.0 });
		const b = makePlayer({ id: "b", rating: 5.0 });
		const c = makePlayer({ id: "c", rating: 5.0 });
		const d = makePlayer({ id: "d", rating: 5.0 });

		const before = [makeDoublesMatch(1, [a, b], [c, d])];

		// 歷史紀錄的隊友組合與現在相同（a、b 仍是隊友），對手不同（e、f 而非 c、d）——
		// 只命中 teammateKeys，不命中 opponentKeys 或 fullMatchKey，確保重複純粹來自隊友重複。
		const e = makePlayer({ id: "e" });
		const f = makePlayer({ id: "f" });
		const seen = buildSignatureIndex([makeDoublesMatch(99, [a, b], [e, f])]);

		const repeatsBefore = countRepeats(before, seen);
		const spreadBefore = ratingSpread(before);
		expect(repeatsBefore).toBe(1);

		const after = avoidRepeats(before, seen);

		expect(countRepeats(after, seen)).toBeLessThan(repeatsBefore);
		expect(ratingSpread(after)).toBeLessThanOrEqual(spreadBefore);

		// 出場人選不變，只是隊友配對被拆開（不得新增或移除任何人）。
		const idsOf = (matches: readonly Match[]) => matches.flatMap((m) => m.teams.flatMap((t) => t.players.map((p) => p.id))).sort();
		expect(idsOf(after)).toEqual(idsOf(before));

		// 精確斷言重建後的隊伍組成，而非只斷言「重複數下降」——階段②的候選掃描順序固定為
		// team0 第一位（a）優先嘗試與 team1 各位置配對，第一個候選 (a,c) 即滿足採納條件，
		// 故重建後 team0＝[c,b]、team1＝[a,d]。這個組成只有階段②的完整組合掃描
		// （team0×team1 所有配對）才會產生；單純的「相鄰強度重排」（階段③）在本例會用不同的
		// 候選順序找到不同組成（[a,c] / [b,d]）——精確斷言能證明是階段②在起作用，
		// 而非階段③意外覆蓋了同一個修正（已用 mutation 測試驗證，見下方 tasks.md 12.D4 記錄）。
		expect(after[0]?.teams[0]?.players.map((p) => p.id)).toEqual(["c", "b"]);
		expect(after[0]?.teams[1]?.players.map((p) => p.id)).toEqual(["a", "d"]);
	});
});

describe("受限交換後的隊伍分數四捨五入", () => {
	it("交換後的隊伍分數與直接配對產生的隊伍分數表示一致", () => {
		// pairing.ts 的 buildTeam 已於前一批 fix 為 Math.round(sum*100)/100，理由是 PRD 的
		// rating 為兩位小數、浮點加總會產生誤差（實測反例：2.01+1.01 在 IEEE754 下為
		// 3.0199999999999996，而非數學上相等的 3.02）。本檔的 rebuildMatch 換人後重算隊伍分數
		// 若不套用同一四捨五入，會讓「被交換過的隊伍」帶浮點雜訊、「未被交換的隊伍」乾淨，
		// 兩者一起被第 3 段寫進 LocalStorage 時表示法不一致。
		//
		// fixture：p4／p5 的 rating 刻意設為相同值（1.01），使跨場地互換 p4↔p5 時全場強度
		// 差距總和完全不變（滿足 avoidRepeats 的 `<=` 判準），同時清掉歷史紀錄中「p3 對 p4」
		// 這組交叉對手重複（p4 離開 court1 後，court1 不再包含 p4，該重複自然消失）。
		// 交換後 court1 team0 由 rebuildMatch 重建為 [p1(2.01), p5(1.01)]，其 reduce 加總為
		// 3.0199999999999996——若 rebuildMatch 不四捨五入，Team.rating 會帶著這個浮點雜訊，
		// 與 pairing.ts 直接配對產生的隊伍（一律經 buildTeam 四捨五入為 3.02）表示法不一致。
		const p1 = makePlayer({ id: "p1", rating: 2.01 });
		const p2 = makePlayer({ id: "p2", rating: 1.5 });
		const p3 = makePlayer({ id: "p3", rating: 1.2 });
		const p4 = makePlayer({ id: "p4", rating: 1.01 });
		const p5 = makePlayer({ id: "p5", rating: 1.01 });
		const p6 = makePlayer({ id: "p6", rating: 1.0 });
		const p7 = makePlayer({ id: "p7", rating: 0.5 });
		const p8 = makePlayer({ id: "p8", rating: 0.1 });

		const before = [makeDoublesMatch(1, [p1, p4], [p2, p3]), makeDoublesMatch(2, [p5, p8], [p6, p7])];

		// 用不相干的填充球員湊出歷史紀錄，孤立出「p3 對 p4」這一組交叉對手重複，
		// 不會意外命中隊友或完整比賽簽章（與 duplication.test.ts 其餘 fixture 同構）。
		const zA = makePlayer({ id: "zA" });
		const zB = makePlayer({ id: "zB" });
		const historyMatch = makeDoublesMatch(99, [p3, zA], [p4, zB]);
		const seen = buildSignatureIndex([historyMatch]);

		expect(countRepeats(before, seen)).toBe(1);

		const after = avoidRepeats(before, seen);

		expect(countRepeats(after, seen)).toBe(0);

		const court1TeamA = after[0]?.teams[0];
		expect(court1TeamA?.players.map((p) => p.id)).toEqual(["p1", "p5"]);
		// 先證明浮點誤差確實存在，避免這個測試在未來 JS 引擎行為改變時失去意義。
		expect(p1.rating + p5.rating).not.toBe(3.02);
		expect(court1TeamA?.rating).toBe(3.02);
	});
});

describe("ratingSpread 的浮點誤差防護", () => {
	// 此為 duplication.ts 內部防護機制的驗證，非 spec 驗收錨點——spec 只要求
	// ratingSpread 的相對比較行為（見「有可行交換時降低重複數」等 Scenario），
	// 未提及浮點誤差本身。
	it("團隊 rating 加總的浮點誤差在四捨五入到分後不影響強度差距計算", () => {
		// PRD 的 rating 為兩位小數（1.00～8.00），Team.rating 是隊內成員 rating 的加總。
		//
		// ⚠️ fixture 更正記錄：原本用 1.1+2.2 vs 1.0+2.3——兩者的 raw sum 確實不同位元
		// （3.3000000000000003 vs 3.3），但**乘以 100 後兩邊都恰好是 330**，`Math.round`
		// 根本沒有出手機會（實測：拿掉 toRatingCents 的 Math.round，此 fixture 仍全綠，
		// 只證明了「完全不做 cents 換算會壞」，沒證明 Math.round 有在做事）。
		// 改用 2.02+1.00 vs 2.01+1.01：*100 後為 302 vs 301.99999999999994，
		// 差距落在「四捨五入前不相等、四捨五入後才相等」的區間，才是真正驗證 Math.round
		// 有作用的 fixture（見第 4 批 code review D2）。
		const a = makePlayer({ id: "a", rating: 2.02 });
		const b = makePlayer({ id: "b", rating: 1.0 });
		const c = makePlayer({ id: "c", rating: 2.01 });
		const d = makePlayer({ id: "d", rating: 1.01 });

		// 先證明浮點誤差確實存在，避免這個測試在未來 JS 引擎行為改變時失去意義。
		expect(a.rating + b.rating).not.toBe(c.rating + d.rating);

		const match: Match = {
			courtNumber: 1,
			teams: [
				{ players: [a, b], rating: a.rating + b.rating }, // 3.02（位元上乾淨）
				{ players: [c, d], rating: c.rating + d.rating }, // 3.0199999999999996
			],
			format: "doubles",
			doublesComposition: "general",
		};

		// 兩隊分數數學上相等（皆為 3.02），差距 MUST 為 0——若直接比較原始浮點數，
		// 極小的誤差會讓 avoidRepeats「調整後 <= 調整前」的判準在特定名單上
		// 被雜訊誤判為「變大」，導致本該接受的零成本交換被錯誤拒絕。
		expect(ratingSpread([match])).toBe(0);
	});
});
