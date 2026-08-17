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
});
