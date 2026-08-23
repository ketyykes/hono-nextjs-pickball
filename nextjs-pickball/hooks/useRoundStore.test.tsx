import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useRoundStore } from "./useRoundStore";
import { createRound, submitScore } from "@/lib/matchmaker/round";
import { readRound, writeRound, writeHistory } from "@/lib/matchmaker/round-storage";
import type { CreateRoundResult } from "@/lib/matchmaker/round";
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

	// regression guard（非 TDD 紅燈，行為在寫入本 it 之前已成立）。
	//
	// 補這條的理由：spec「休息次數於產生新一輪時結算」的「實作位於」同時列了 round.ts
	// 與本 hook，但該 Requirement 五個 Scenario 的驗收全部指向 round.test.ts——那些只驗
	// createRound 回傳值裡的 restSettlements 算得對不對，驗不到 hook 有沒有把它套用出去。
	// 審查時實測把 hook 內整段 restSettlements → updatePlayer 的接線刪光，全套測試仍然全綠，
	// 等於這條 MUST 的唯一實作處毫無保護。做法採 design Decision 7 尾段預告的方式：
	// 以受控的 players 陣列與 updatePlayer spy 直接斷言被套用的 patch。
	it("產生新一輪時把上一輪的休息結算交給 roster port，並以上一輪為基準遞增輪次", () => {
		// GIVEN：localStorage 已有第 1 輪（6 人單打 1 場，故有 4 人休息）與一筆歷史。
		// 歷史刻意先寫入而非留空——留空的話「產生新一輪時順手清掉歷史」這個 bug
		// 會與正確行為得到同樣的空陣列，斷言就分辨不出來。
		const players: Player[] = Array.from({ length: 6 }, (_, index) =>
			makePlayer({ id: `p${index + 1}` }),
		);

		const firstRound = createRound({
			players,
			format: "singles",
			courtCount: 1,
			previousRound: null,
			now: "2026-08-23T00:00:00.000Z",
			newMatchId: () => "match-1",
		});
		if (!firstRound.ok) {
			throw new Error("測試前置失敗：createRound 未成功");
		}

		const submitted = submitScore({
			round: firstRound.round,
			players,
			matchId: firstRound.round.matches[0].id,
			rawScoreA: "11",
			rawScoreB: "7",
			now: "2026-08-23T00:05:00.000Z",
		});
		if (!submitted.ok) {
			throw new Error("測試前置失敗：submitScore 未成功");
		}
		writeRound(submitted.round);
		writeHistory([submitted.historyEntry]);

		const playedIds = new Set(
			firstRound.round.matches.flatMap((match) =>
				match.teams.flatMap((team) => team.playerIds),
			),
		);
		const restingIds = players.map((player) => player.id).filter((id) => !playedIds.has(id));
		expect(restingIds).toHaveLength(4);

		const updatePlayer = vi.fn();
		const { result } = renderHook(() => useRoundStore({ players, updatePlayer }));

		// WHEN：產生第 2 輪。
		let generateResult: CreateRoundResult | undefined;
		act(() => {
			generateResult = result.current.generateRound({ format: "singles", courtCount: 1 });
		});

		// THEN：以第 1 輪為基準遞增輪次（previousRound 若誤傳 null，這裡會是 1）。
		expect(generateResult?.ok).toBe(true);
		expect(result.current.round?.roundNumber).toBe(2);

		// AND：四位休息者的 restCount 各 +1，且只有他們被套用。
		expect(updatePlayer).toHaveBeenCalledTimes(4);
		const patchedIds = updatePlayer.mock.calls.map(([id]) => id);
		expect(patchedIds.slice().sort()).toEqual(restingIds.slice().sort());
		for (const [, patch] of updatePlayer.mock.calls) {
			expect(patch).toEqual({ restCount: 1 });
		}

		// AND：產生新一輪不得動到歷史，且新回合要真的被持久化（重整後才回得來）。
		expect(result.current.history).toEqual([submitted.historyEntry]);
		expect(readRound()?.roundNumber).toBe(2);
	});
});
