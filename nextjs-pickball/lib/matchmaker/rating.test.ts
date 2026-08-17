import { describe, it, expect } from "vitest";

import { expectedScore, effectiveK, updateRatings, RATING_D, K_BASE, MIN_RATING, MAX_RATING } from "./rating";
import type { Player } from "./types";

// 測試用的完整參賽者建構器，與 allocation.test.ts／candidates.test.ts 等同構，
// 刻意不共用——本檔保持獨立、不依賴其他測試檔。
function makePlayer(overrides: Partial<Player> = {}): Player {
	return {
		id: "p1",
		name: "小明",
		gender: "male",
		colorFrom: "#0E6B63",
		colorTo: "#134E4A",
		rating: 5,
		restCount: 0,
		gamesPlayed: 0,
		isActive: true,
		createdAt: "2026-08-15T00:00:00.000Z",
		...overrides,
	};
}

describe("expectedScore", () => {
	it("分數相同時預測勝率為 0.5", () => {
		expect(expectedScore(5.0, 5.0)).toBe(0.5);
	});

	it("D 為 3.0 時四個校準點的預測勝率符合規格", () => {
		// PRD 6.4.2 表列的 60/68/82/91% 為四捨五入後的呈現值，容差取 0.01（tasks 2.3）。
		expect(Math.abs(expectedScore(5.5, 5.0) - 0.595)).toBeLessThan(0.01);
		expect(Math.abs(expectedScore(6.0, 5.0) - 0.683)).toBeLessThan(0.01);
		expect(Math.abs(expectedScore(7.0, 5.0) - 0.823)).toBeLessThan(0.01);
		expect(Math.abs(expectedScore(8.0, 5.0) - 0.909)).toBeLessThan(0.01);
	});

	it("交換雙方順序時兩個預測勝率相加為 1", () => {
		const forward = expectedScore(6.2, 4.7);
		const backward = expectedScore(4.7, 6.2);
		expect(forward + backward).toBeCloseTo(1, 10);
	});

	it("D、K_base 與上下限以具名常數匯出且值符合規格", () => {
		expect(RATING_D).toBe(3.0);
		expect(K_BASE).toBe(0.15);
		expect(MIN_RATING).toBe(1.0);
		expect(MAX_RATING).toBe(8.0);
	});
});

describe("effectiveK", () => {
	it("出場 0 場時 K_eff 為 K_base 的兩倍", () => {
		// 浮點運算（0.15 * 2）不保證位元精確等於字面量 0.3，改用容差比較。
		expect(effectiveK(0)).toBeCloseTo(0.3, 10);
	});

	it("出場 20 場時 K_eff 為 K_base 的一點五倍", () => {
		expect(effectiveK(20)).toBeCloseTo(0.225, 10);
	});

	it("K_eff 隨出場次數單調遞減且恆大於 K_base", () => {
		let previous = effectiveK(0);
		for (let gamesPlayed = 1; gamesPlayed <= 200; gamesPlayed += 1) {
			const current = effectiveK(gamesPlayed);
			expect(current).toBeLessThan(previous);
			expect(current).toBeGreaterThan(K_BASE);
			previous = current;
		}
	});
});

describe("updateRatings（單打路徑）", () => {
	it("勢均力敵時單場變動趨近 0.075，新手為 0.15", () => {
		const newbieWinner = makePlayer({ id: "w", rating: 5.0, gamesPlayed: 0 });
		const newbieLoser = makePlayer({ id: "l", rating: 5.0, gamesPlayed: 0 });
		const [newbieWinnerChange, newbieLoserChange] = updateRatings({
			winners: [newbieWinner],
			losers: [newbieLoser],
		});
		expect(newbieWinnerChange.delta).toBeCloseTo(0.15, 6);
		expect(newbieLoserChange.delta).toBeCloseTo(-0.15, 6);

		const veteranWinner = makePlayer({ id: "w2", rating: 5.0, gamesPlayed: 100000 });
		const veteranLoser = makePlayer({ id: "l2", rating: 5.0, gamesPlayed: 100000 });
		const [veteranWinnerChange, veteranLoserChange] = updateRatings({
			winners: [veteranWinner],
			losers: [veteranLoser],
		});
		// K_eff 恆大於 K_base，「±0.075」是極限值而非實際值（design Risks 第 3 點），
		// 用 rawDelta（未四捨五入）判斷落在 0.075～0.076 區間，不斷言等於 0.075（tasks 4.4）。
		expect(veteranWinnerChange.rawDelta).toBeGreaterThan(0.075);
		expect(veteranWinnerChange.rawDelta).toBeLessThan(0.076);
		expect(veteranLoserChange.rawDelta).toBeLessThan(-0.075);
		expect(veteranLoserChange.rawDelta).toBeGreaterThan(-0.076);
	});

	it("爆冷獲勝者的加分明顯大於預期內獲勝者", () => {
		const strong = makePlayer({ id: "strong", rating: 7.0, gamesPlayed: 50 });
		const weak = makePlayer({ id: "weak", rating: 3.0, gamesPlayed: 50 });

		const upsetResult = updateRatings({ winners: [weak], losers: [strong] });
		const favoriteResult = updateRatings({ winners: [strong], losers: [weak] });

		const upsetWinnerGain = upsetResult.find((c) => c.playerId === "weak")!.delta;
		const favoriteWinnerGain = favoriteResult.find((c) => c.playerId === "strong")!.delta;

		expect(upsetWinnerGain).toBeGreaterThan(favoriteWinnerGain * 2);
	});

	it("出場次數少者的評分變動幅度大於出場次數多者", () => {
		const opponent = makePlayer({ id: "opp", rating: 5.0, gamesPlayed: 30 });
		const rookie = makePlayer({ id: "rookie", rating: 5.0, gamesPlayed: 0 });
		const veteran = makePlayer({ id: "veteran", rating: 5.0, gamesPlayed: 80 });

		const [rookieChange] = updateRatings({ winners: [rookie], losers: [opponent] });
		const [veteranChange] = updateRatings({ winners: [veteran], losers: [opponent] });

		expect(Math.abs(rookieChange.delta)).toBeGreaterThan(Math.abs(veteranChange.delta));
	});

	it("勝方分數增加敗方分數減少", () => {
		const winner = makePlayer({ id: "w", rating: 4.2, gamesPlayed: 15 });
		const loser = makePlayer({ id: "l", rating: 4.8, gamesPlayed: 15 });
		const [winnerChange, loserChange] = updateRatings({ winners: [winner], losers: [loser] });
		expect(winnerChange.after).toBeGreaterThan(winner.rating);
		expect(loserChange.after).toBeLessThan(loser.rating);
	});

	// 以下為 4 個必要 it 之外的補強測試，用於防護 mutation 9.8（拿掉 roundRating）——
	// 上面幾個 it 選用的分數多半已是乾淨的兩位小數，即使不 round 也未必能觀察到差異，
	// 需要一個分差不對稱（E ≠ 0.5）的情境，讓未四捨五入的殘留浮點尾數必然可被偵測到。
	it("賽後分數維持兩位小數精度（確保套用 roundRating，不殘留浮點尾數）", () => {
		const winner = makePlayer({ id: "w", rating: 5.3, gamesPlayed: 10 });
		const loser = makePlayer({ id: "l", rating: 4.7, gamesPlayed: 10 });
		const [winnerChange, loserChange] = updateRatings({ winners: [winner], losers: [loser] });
		expect(String(winnerChange.after)).toMatch(/^\d+(\.\d{1,2})?$/);
		expect(String(loserChange.after)).toMatch(/^\d+(\.\d{1,2})?$/);
	});

	// 第 1 批 code review 補強（非 delta spec 逐字錨點）：第 1 批的 fixture 多用同分
	// （E = 0.5），此時敗方正確的 sMinusE（`winnerExpected - 1 = -0.5`）與多種錯誤寫法
	// （`-winnerExpected`、固定 `-0.5`、誤吃勝方 gamesPlayed 等）在同分情境下剛好同值，
	// 4 個對敗方側的 mutation 因此全數存活。本 it 用分差不對稱（E ≠ 0.5）的 fixture，
	// 直接比對敗方 rawDelta 與「以敗方視角重新計算」的理論值，堵住這個缺口。
	it("敗方扣分幅度等於自身 K_eff 乘上其預測勝率", () => {
		const winner = makePlayer({ id: "w", rating: 6.5, gamesPlayed: 12 });
		const loser = makePlayer({ id: "l", rating: 4.0, gamesPlayed: 35 });
		const [, loserChange] = updateRatings({ winners: [winner], losers: [loser] });
		const loserExpected = expectedScore(loser.rating, winner.rating);
		expect(loserChange.rawDelta).toBeCloseTo(-effectiveK(loser.gamesPlayed) * loserExpected, 12);
	});

	// 第 1 批 code review 補強：`delta`（改成 `rawDelta`，或改成 round 順序倒置的
	// `roundRating(rawDelta)`）目前沒有測試鎖住兩者語意不同——一旦被靜默改掉，§7 的
	// 零和斷言就會建立在錯誤的基礎上宣告守恆。
	it("delta 為 round 後的實際生效變動，而非 rawDelta 的理論值", () => {
		const winner = makePlayer({ id: "w", rating: 5.3, gamesPlayed: 10 });
		const loser = makePlayer({ id: "l", rating: 4.7, gamesPlayed: 10 });
		const [winnerChange] = updateRatings({ winners: [winner], losers: [loser] });
		expect(winnerChange.delta).toBeCloseTo(winnerChange.after - winnerChange.before, 12);
		expect(winnerChange.delta).not.toBeCloseTo(winnerChange.rawDelta, 12);
	});
});

describe("updateRatings（雙打路徑）", () => {
	it("雙打以兩隊平均分數計算預測勝率", () => {
		const w1 = makePlayer({ id: "w1", rating: 6.0, gamesPlayed: 0 });
		const w2 = makePlayer({ id: "w2", rating: 4.0, gamesPlayed: 0 });
		const l1 = makePlayer({ id: "l1", rating: 5.5, gamesPlayed: 0 });
		const l2 = makePlayer({ id: "l2", rating: 4.5, gamesPlayed: 0 });
		const changes = updateRatings({ winners: [w1, w2], losers: [l1, l2] });
		// 兩隊平均皆為 5.0，等同於兩位 5.0 的球員對戰：E = 0.5，gamesPlayed 為 0 時
		// K_eff = 0.3，故 rawDelta 應為 ±0.15——與兩隊「平均分數」而非隊伍組成細節有關。
		const w1Change = changes.find((c) => c.playerId === "w1")!;
		const l1Change = changes.find((c) => c.playerId === "l1")!;
		expect(w1Change.rawDelta).toBeCloseTo(0.15, 10);
		expect(l1Change.rawDelta).toBeCloseTo(-0.15, 10);
	});

	// 上面的 it 兩隊平均皆為 5.0，總和（10.0 vs 10.0）也剛好相等，無法區分「取平均」
	// 與「誤用總和」兩種實作（tie-fixture 陷阱）。本 it 刻意讓「隊伍平均」（5.0 vs 3.0，
	// 分差 2.0）、「只取隊伍第一位」（7.0 vs 4.0，分差 3.0）、「誤用總和」（10.0 vs 6.0，
	// 分差 4.0）三種可能誤植的分差彼此不同，任何一種都會被本斷言的容差抓到。
	it("雙打隊伍平均分數不對稱時仍以平均而非總和計算預測勝率", () => {
		const w1 = makePlayer({ id: "w1", rating: 7.0, gamesPlayed: 0 });
		const w2 = makePlayer({ id: "w2", rating: 3.0, gamesPlayed: 0 });
		const l1 = makePlayer({ id: "l1", rating: 4.0, gamesPlayed: 0 });
		const l2 = makePlayer({ id: "l2", rating: 2.0, gamesPlayed: 0 });
		const changes = updateRatings({ winners: [w1, w2], losers: [l1, l2] });
		const w1Change = changes.find((c) => c.playerId === "w1")!;
		const expectedRawDelta = effectiveK(0) * (1 - expectedScore(5.0, 3.0));
		expect(w1Change.rawDelta).toBeCloseTo(expectedRawDelta, 10);
	});

	it("雙打同隊兩人出場次數相同時分數變動相同", () => {
		const w1 = makePlayer({ id: "w1", rating: 5.0, gamesPlayed: 10 });
		const w2 = makePlayer({ id: "w2", rating: 6.0, gamesPlayed: 10 });
		const l1 = makePlayer({ id: "l1", rating: 4.0, gamesPlayed: 10 });
		const l2 = makePlayer({ id: "l2", rating: 4.5, gamesPlayed: 10 });
		const changes = updateRatings({ winners: [w1, w2], losers: [l1, l2] });
		const w1Change = changes.find((c) => c.playerId === "w1")!;
		const w2Change = changes.find((c) => c.playerId === "w2")!;
		// 兩人個人分數不同，但 gamesPlayed 相同——同隊共用同一個 (S − E)，
		// K_eff 只依 gamesPlayed 決定，故變動必須完全相同。
		expect(w1Change.delta).toBe(w2Change.delta);
	});

	it("雙打同隊出場次數不同時變動方向相同但幅度不同", () => {
		const w1 = makePlayer({ id: "w1", rating: 5.0, gamesPlayed: 0 });
		const w2 = makePlayer({ id: "w2", rating: 5.0, gamesPlayed: 40 });
		const l1 = makePlayer({ id: "l1", rating: 5.0, gamesPlayed: 10 });
		const l2 = makePlayer({ id: "l2", rating: 5.0, gamesPlayed: 10 });
		const changes = updateRatings({ winners: [w1, w2], losers: [l1, l2] });
		const w1Change = changes.find((c) => c.playerId === "w1")!;
		const w2Change = changes.find((c) => c.playerId === "w2")!;
		expect(w1Change.delta).toBeGreaterThan(0);
		expect(w2Change.delta).toBeGreaterThan(0);
		expect(w1Change.delta).not.toBe(w2Change.delta);
		expect(w1Change.delta).toBeGreaterThan(w2Change.delta);
	});

	it("雙打回傳四位球員各自的評分變動", () => {
		const w1 = makePlayer({ id: "w1", rating: 5.0, gamesPlayed: 5 });
		const w2 = makePlayer({ id: "w2", rating: 5.5, gamesPlayed: 8 });
		const l1 = makePlayer({ id: "l1", rating: 4.5, gamesPlayed: 3 });
		const l2 = makePlayer({ id: "l2", rating: 4.0, gamesPlayed: 12 });
		const changes = updateRatings({ winners: [w1, w2], losers: [l1, l2] });
		expect(changes).toHaveLength(4);
		expect(changes.map((c) => c.playerId).sort()).toEqual(["l1", "l2", "w1", "w2"]);
		for (const change of changes) {
			expect(typeof change.before).toBe("number");
			expect(typeof change.after).toBe("number");
		}
	});
});

describe("updateRatings（上下限與撞邊界標記）", () => {
	it("分數達上限者獲勝後不再加分且標記已達上限", () => {
		const winner = makePlayer({ id: "w", rating: MAX_RATING, gamesPlayed: 10 });
		const loser = makePlayer({ id: "l", rating: 5.0, gamesPlayed: 10 });
		const [winnerChange] = updateRatings({ winners: [winner], losers: [loser] });
		expect(winnerChange.after).toBe(MAX_RATING);
		expect(winnerChange.clamped).toBe("at-max");
	});

	it("分數達下限者落敗後不再扣分且標記已達下限", () => {
		const winner = makePlayer({ id: "w", rating: 5.0, gamesPlayed: 10 });
		const loser = makePlayer({ id: "l", rating: MIN_RATING, gamesPlayed: 10 });
		const [, loserChange] = updateRatings({ winners: [winner], losers: [loser] });
		expect(loserChange.after).toBe(MIN_RATING);
		expect(loserChange.clamped).toBe("at-min");
	});

	it("賽後分數在範圍內時不帶撞邊界標記", () => {
		const winner = makePlayer({ id: "w", rating: 5.0, gamesPlayed: 10 });
		const loser = makePlayer({ id: "l", rating: 5.0, gamesPlayed: 10 });
		const [winnerChange, loserChange] = updateRatings({ winners: [winner], losers: [loser] });
		expect(winnerChange.clamped).toBe("none");
		expect(loserChange.clamped).toBe("none");
	});

	it("撞邊界者仍照常參與計算不影響對手的扣分", () => {
		const winner = makePlayer({ id: "w", rating: MAX_RATING, gamesPlayed: 10 });
		const loser = makePlayer({ id: "l", rating: 5.0, gamesPlayed: 10 });
		const [winnerChange, loserChange] = updateRatings({ winners: [winner], losers: [loser] });
		// 敗方的扣分只應取決於「勝方分數為 8.00」這個事實本身，不受勝方是否被 clamp 影響——
		// 用公式直接算出理論值比對，證明撞邊界的計算分支沒有回頭改動對手的 sMinusE。
		const expectedE = expectedScore(MAX_RATING, 5.0);
		const expectedLoserRawDelta = effectiveK(10) * (expectedE - 1);
		expect(loserChange.rawDelta).toBeCloseTo(expectedLoserRawDelta, 10);
		expect(loserChange.clamped).toBe("none");
		expect(winnerChange.clamped).toBe("at-max");
	});

	it("接近上限時賽後分數恰好夾至 8.00 不超出", () => {
		const winner = makePlayer({ id: "w", rating: 7.99, gamesPlayed: 0 });
		const loser = makePlayer({ id: "l", rating: 7.0, gamesPlayed: 0 });
		const [winnerChange] = updateRatings({ winners: [winner], losers: [loser] });
		expect(winnerChange.rawDelta).toBeGreaterThan(0.01);
		expect(winnerChange.after).toBe(MAX_RATING);
		expect(winnerChange.clamped).toBe("at-max");
	});

	// 額外補強（非 delta spec 必要 it）：驗證 tasks 6.4 的判定基準——「clamp 是否真的
	// 改變了值」而非「賽後分數是否等於邊界值」。7.85 + 0.15（gamesPlayed 0、E = 0.5 時
	// 的 rawDelta）理論上恰好等於 8.00，未超出邊界，MUST 為 "none"。若誤把判定改成
	// 「賽後分數等於邊界值就標記」，這個情境會被誤判為 "at-max"。
	it("剛好算到上限而未真正超出邊界時不標記已達上限", () => {
		const winner = makePlayer({ id: "w", rating: 7.85, gamesPlayed: 0 });
		const loser = makePlayer({ id: "l", rating: 7.85, gamesPlayed: 0 });
		const [winnerChange] = updateRatings({ winners: [winner], losers: [loser] });
		expect(winnerChange.after).toBe(MAX_RATING);
		expect(winnerChange.clamped).toBe("none");
	});
});

describe("updateRatings（零和的適用範圍）", () => {
	it("出場次數相同且未撞邊界時勝方加分等於敗方扣分", () => {
		const winner = makePlayer({ id: "w", rating: 5.0, gamesPlayed: 10 });
		const loser = makePlayer({ id: "l", rating: 5.3, gamesPlayed: 10 });
		const [winnerChange, loserChange] = updateRatings({ winners: [winner], losers: [loser] });
		// 容差取 0.01（四捨五入殘差），不用 toBe（tasks 7.3）。
		expect(Math.abs(winnerChange.delta + loserChange.delta)).toBeLessThanOrEqual(0.01);
	});

	it("出場次數不同時勝方加分不等於敗方扣分", () => {
		const winner = makePlayer({ id: "w", rating: 5.0, gamesPlayed: 0 });
		const loser = makePlayer({ id: "l", rating: 5.0, gamesPlayed: 40 });
		const [winnerChange, loserChange] = updateRatings({ winners: [winner], losers: [loser] });
		expect(Math.abs(Math.abs(winnerChange.delta) - Math.abs(loserChange.delta))).toBeGreaterThan(0.01);
	});

	it("撞邊界時群體總分不守恆且偏離可由標記觀測", () => {
		const winner = makePlayer({ id: "w", rating: MAX_RATING, gamesPlayed: 10 });
		const loser = makePlayer({ id: "l", rating: 5.0, gamesPlayed: 10 });
		const totalBefore = winner.rating + loser.rating;
		const [winnerChange, loserChange] = updateRatings({ winners: [winner], losers: [loser] });
		const totalAfter = winnerChange.after + loserChange.after;
		expect(totalAfter).toBeLessThan(totalBefore);
		// 偏離可由撞邊界標記觀測，不必靠消費端自行比較總分：
		expect(winnerChange.clamped).toBe("at-max");
	});
});

describe("updateRatings（無狀態與決定性）", () => {
	it("相同輸入產生相同輸出", () => {
		const winner = makePlayer({ id: "w", rating: 5.2, gamesPlayed: 7 });
		const loser = makePlayer({ id: "l", rating: 4.8, gamesPlayed: 13 });
		const input = { winners: [winner], losers: [loser] };
		const first = updateRatings(input);
		const second = updateRatings(input);
		expect(first).toEqual(second);
	});

	it("評分更新不修改輸入的參賽者物件", () => {
		const winner = makePlayer({ id: "w", rating: 5.2, gamesPlayed: 7 });
		const loser = makePlayer({ id: "l", rating: 4.8, gamesPlayed: 13 });
		const winnerSnapshot = structuredClone(winner);
		const loserSnapshot = structuredClone(loser);
		updateRatings({ winners: [winner], losers: [loser] });
		expect(winner.rating).toBe(winnerSnapshot.rating);
		expect(winner.gamesPlayed).toBe(winnerSnapshot.gamesPlayed);
		expect(loser.rating).toBe(loserSnapshot.rating);
		expect(loser.gamesPlayed).toBe(loserSnapshot.gamesPlayed);
	});

	it("手動覆蓋後的分數直接作為輸入且不受過往比賽影響", () => {
		const opponent = makePlayer({ id: "opp", rating: 5.0, gamesPlayed: 10 });
		// 情境一：球員原始比賽路徑走到 rating 4.0。
		const organic = makePlayer({ id: "p", rating: 4.0, gamesPlayed: 10, name: "原始路徑" });
		// 情境二：主持人於參賽者頁手動覆蓋分數為 4.0。過去比賽的細節（此處以不同 name
		// 象徵「不同的歷史」）不應影響計算結果——本 capability 只讀取覆蓋後的
		// rating 與 gamesPlayed 這兩個欄位，不持有、也不查詢任何歷史紀錄。
		const overridden = makePlayer({ id: "p", rating: 4.0, gamesPlayed: 10, name: "手動覆蓋" });
		const [organicChange] = updateRatings({ winners: [organic], losers: [opponent] });
		const [overriddenChange] = updateRatings({ winners: [overridden], losers: [opponent] });
		expect(organicChange.delta).toBe(overriddenChange.delta);
		expect(organicChange.after).toBe(overriddenChange.after);
	});

	it("每筆變動含球員 id 與賽前賽後分數", () => {
		const winner = makePlayer({ id: "w", rating: 5.0, gamesPlayed: 5 });
		const loser = makePlayer({ id: "l", rating: 5.0, gamesPlayed: 5 });
		const [winnerChange, loserChange] = updateRatings({ winners: [winner], losers: [loser] });
		expect(winnerChange.playerId).toBe("w");
		expect(winnerChange.before).toBe(5.0);
		expect(typeof winnerChange.after).toBe("number");
		expect(loserChange.playerId).toBe("l");
		expect(loserChange.before).toBe(5.0);
		expect(typeof loserChange.after).toBe("number");
	});
});
