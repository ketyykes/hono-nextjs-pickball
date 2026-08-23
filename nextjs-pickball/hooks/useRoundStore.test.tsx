import { describe, it, expect, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useRoundStore } from "./useRoundStore";
import { createRound, submitScore } from "@/lib/matchmaker/round";
import { writeRound, writeHistory } from "@/lib/matchmaker/round-storage";
import type { Player } from "@/lib/matchmaker/types";

/** 建立一份合法的測試用 Player，可透過 overrides 覆寫特定欄位（沿用 round.test.ts 的樣板）。 */
function makePlayer(overrides: Partial<Player> = {}): Player {
	return {
		id: "p1",
		name: "測試員",
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

describe("useRoundStore", () => {
	beforeEach(() => {
		localStorage.clear();
	});

	it("重新掛載後還原目前回合與歷史", () => {
		// GIVEN：已產生一個回合並完成一場對戰——直接以 round.ts 的純函式與
		// round-storage.ts 的寫入函式組出「上一個 session 已留下的持久化資料」，
		// 不透過 hook 產生：本組（§8）只把 generateRound 接上 hook，submitScore
		// 尚未接線（見 round-lifecycle delta 的「實作位於」只列 round.ts，
		// 未列 useRoundStore.ts），這裡是在模擬「該資料已經在 localStorage 裡」
		// 的起始狀態，而非測試 hook 本身的送出比分能力。
		const players: Player[] = [makePlayer({ id: "p1" }), makePlayer({ id: "p2" })];

		const createResult = createRound({
			players,
			format: "singles",
			courtCount: 1,
			previousRound: null,
			now: "2026-08-23T00:00:00.000Z",
			newMatchId: () => "match-1",
		});
		if (!createResult.ok) {
			throw new Error("測試前置失敗：createRound 未成功");
		}

		const submitResult = submitScore({
			round: createResult.round,
			players,
			matchId: createResult.round.matches[0].id,
			rawScoreA: "11",
			rawScoreB: "5",
			now: "2026-08-23T00:05:00.000Z",
		});
		if (!submitResult.ok) {
			throw new Error("測試前置失敗：submitScore 未成功");
		}

		writeRound(submitResult.round);
		writeHistory([submitResult.historyEntry]);

		// WHEN：重新讀取持久化資料——即 hook 首次掛載時的 hydrate 路徑，
		// 對應「重新整理頁面後回到這個畫面」的情境。
		const { result } = renderHook(() =>
			useRoundStore({ players, updatePlayer: () => {} }),
		);

		// THEN：回合內容與歷史筆數與寫入前相同。
		expect(result.current.round).toEqual(submitResult.round);
		expect(result.current.history).toHaveLength(1);
		expect(result.current.history[0]).toEqual(submitResult.historyEntry);
	});
});
