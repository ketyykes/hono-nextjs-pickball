import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useRoundStore } from "./useRoundStore";
import { createRound, submitScore, SUBMIT_SCORE_FAILURE_CODE } from "@/lib/matchmaker/round";
import { readRound, readHistory, writeRound, writeHistory } from "@/lib/matchmaker/round-storage";
import type {
	CreateRoundResult,
	ResetIncompleteMatchesResult,
	SubmitScoreResult,
	SetTargetScoreResult,
} from "@/lib/matchmaker/round";
import type { Player } from "@/lib/matchmaker/types";
import { writeMatchSlot, readMatchSlot } from "@/lib/scoreboard/match-slots";
import { createInitialState } from "@/lib/scoreboard/reducer";

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
		// 不透過 hook 產生：這裡要測的是 hydrate 路徑本身（mount 時讀回既有
		// 資料），刻意不經過 hook 的 generateRound／submitScore 產生初始狀態，
		// 避免把「產生／送出邏輯是否正確」與「讀回邏輯是否正確」混在同一條測試裡。
		// submitScore／generateRound／resetIncompleteMatches 的接線各自另有專屬
		// 測試覆蓋（見下方）。
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

	// regression guard：Stage 2 對本檔跑 mutation testing，11/12 存活——tasks 11.6 接上的
	// submitScore／resetIncompleteMatches／history 持久化 effect 除了既有的 hydration
	// 測試外完全無保護。以下補五組，逐條對應存活的變異點（見各 it 內註解殺的是哪一種）。
	it("submitScore 成功時把新回合、比分與球員 patch 正確套用到 roster port（殺不 dispatch／只套一位球員／patch 值算錯等變異）", () => {
		const players: Player[] = [makePlayer({ id: "p1", rating: 3 }), makePlayer({ id: "p2", rating: 3 })];
		const updatePlayer = vi.fn();
		const { result } = renderHook(() => useRoundStore({ players, updatePlayer }));

		let generateResult: CreateRoundResult | undefined;
		act(() => {
			generateResult = result.current.generateRound({ format: "singles", courtCount: 1 });
		});
		if (!generateResult?.ok) {
			throw new Error("測試前置失敗：generateRound 未成功");
		}
		// 首輪 previousRound 為 null，理論上不會有休息結算呼叫 updatePlayer；
		// 仍保險清空一次，確保後續次數斷言只計入 submitScore 造成的呼叫。
		updatePlayer.mockClear();

		const matchId = generateResult.round.matches[0].id;
		const matchPlayerIds = generateResult.round.matches[0].teams.flatMap((team) => team.playerIds);

		let submitResult: SubmitScoreResult | undefined;
		act(() => {
			submitResult = result.current.submitScore(matchId, "11", "7");
		});
		if (!submitResult?.ok) {
			throw new Error("測試前置失敗：submitScore 未成功");
		}

		// round 確實被 dispatch 為 submitScore 回傳的新回合（殺「成功時不 dispatch」）
		expect(result.current.round).toEqual(submitResult.round);
		const completedMatch = result.current.round?.matches.find((match) => match.id === matchId);
		expect(completedMatch?.status).toBe("completed");
		expect(completedMatch?.scores).toEqual({ teamA: 11, teamB: 7 });
		expect(completedMatch?.winner).toBe("teamA");

		// updatePlayer 呼叫次數等於該場人數（單打 2 人），不是「有呼叫就好」（殺「只套一位」）
		expect(updatePlayer).toHaveBeenCalledTimes(2);

		// 被 patch 的 id 集合等於該場的 playerIds（殺「patch 到不相干的人」）
		const patchedIds = updatePlayer.mock.calls.map(([id]) => id);
		expect(patchedIds.slice().sort()).toEqual(matchPlayerIds.slice().sort());

		// patch 內容與 submitScore 回傳的 playerPatches 逐筆一致（殺「patch 值算錯」）
		const appliedPatches = updatePlayer.mock.calls.map(([id, patch]) => ({ id, patch }));
		const expectedPatches = submitResult.playerPatches.map((patch) => ({
			id: patch.id,
			patch: { rating: patch.rating, gamesPlayed: patch.gamesPlayed },
		}));
		expect(appliedPatches).toEqual(expectedPatches);
	});

	it("連續送出兩場比分時 history 依序附加而非覆蓋（殺覆蓋變異：單場送出時 [...[], e] 與 [e] 結果相同，測不出覆蓋）", () => {
		const players: Player[] = Array.from({ length: 4 }, (_, index) => makePlayer({ id: `p${index + 1}` }));
		const updatePlayer = vi.fn();
		const { result } = renderHook(() => useRoundStore({ players, updatePlayer }));

		let generateResult: CreateRoundResult | undefined;
		act(() => {
			generateResult = result.current.generateRound({ format: "singles", courtCount: 2 });
		});
		if (!generateResult?.ok) {
			throw new Error("測試前置失敗：generateRound 未成功");
		}
		const [matchA, matchB] = generateResult.round.matches;

		let firstSubmit: SubmitScoreResult | undefined;
		act(() => {
			firstSubmit = result.current.submitScore(matchA.id, "11", "3");
		});
		if (!firstSubmit?.ok) {
			throw new Error("測試前置失敗：第一場 submitScore 未成功");
		}

		let secondSubmit: SubmitScoreResult | undefined;
		act(() => {
			secondSubmit = result.current.submitScore(matchB.id, "5", "11");
		});
		if (!secondSubmit?.ok) {
			throw new Error("測試前置失敗：第二場 submitScore 未成功");
		}

		expect(result.current.history).toHaveLength(2);
		expect(result.current.history[0]).toEqual(firstSubmit.historyEntry);
		expect(result.current.history[1]).toEqual(secondSubmit.historyEntry);
	});

	it("submitScore 失敗時不套用任何變動（round 參考不變、history 不變、updatePlayer 未被呼叫，殺「失敗仍套用」變異）", () => {
		const players: Player[] = [makePlayer({ id: "p1" }), makePlayer({ id: "p2" })];
		const updatePlayer = vi.fn();
		const { result } = renderHook(() => useRoundStore({ players, updatePlayer }));

		act(() => {
			result.current.generateRound({ format: "singles", courtCount: 1 });
		});
		const matchId = result.current.round!.matches[0].id;
		const roundBefore = result.current.round;

		let failResult: SubmitScoreResult | undefined;
		act(() => {
			// 空白比分：validateScoreInput 的 EMPTY_FIELD 失敗路徑。
			failResult = result.current.submitScore(matchId, "", "5");
		});

		expect(failResult?.ok).toBe(false);
		// 用 toBe 而非 toEqual：偵測「換了一個內容相同的新物件」這種變異，
		// 只有 toBe（參考相等）能證明 reducer 真的沒有 dispatch。
		expect(result.current.round).toBe(roundBefore);
		expect(result.current.history).toEqual([]);
		expect(updatePlayer).not.toHaveBeenCalled();
	});

	it("尚無目前回合時呼叫 submitScore 回傳 MATCH_NOT_FOUND 且不觸碰名單（殺 state.round === null 防線被移除的變異）", () => {
		const updatePlayer = vi.fn();
		const { result } = renderHook(() => useRoundStore({ players: [], updatePlayer }));

		let failResult: SubmitScoreResult | undefined;
		act(() => {
			failResult = result.current.submitScore("nonexistent-match", "11", "7");
		});

		expect(failResult?.ok).toBe(false);
		if (failResult?.ok) {
			throw new Error("測試前置錯誤：預期失敗，但回傳成功");
		}
		expect(failResult?.code).toBe(SUBMIT_SCORE_FAILURE_CODE.MATCH_NOT_FOUND);
		expect(result.current.round).toBeNull();
		expect(updatePlayer).not.toHaveBeenCalled();
	});

	it("resetIncompleteMatches 成功時套用新回合、失敗時（尚無回合／無 pending 場次）round 參考不變（殺不 dispatch／失敗仍 dispatch 兩類變異）", () => {
		const players: Player[] = [makePlayer({ id: "p1" }), makePlayer({ id: "p2" })];
		const updatePlayer = vi.fn();
		const { result } = renderHook(() => useRoundStore({ players, updatePlayer }));

		// 失敗情境 1：尚無回合時呼叫，round 應維持 null（殺「失敗仍 dispatch」）
		let noRoundResult: ResetIncompleteMatchesResult | undefined;
		act(() => {
			noRoundResult = result.current.resetIncompleteMatches();
		});
		expect(noRoundResult?.ok).toBe(false);
		expect(result.current.round).toBeNull();

		// 建立第 1 輪（1 場、pending）
		act(() => {
			result.current.generateRound({ format: "singles", courtCount: 1 });
		});
		const originalMatchId = result.current.round!.matches[0].id;

		// 成功情境：重排產生新場次 id，round 真的被 dispatch（殺「成功時不 dispatch」）
		let resetResult: ResetIncompleteMatchesResult | undefined;
		act(() => {
			resetResult = result.current.resetIncompleteMatches();
		});
		expect(resetResult?.ok).toBe(true);
		if (!resetResult?.ok) {
			throw new Error("測試前置失敗：resetIncompleteMatches 未成功");
		}
		expect(result.current.round?.matches[0].id).not.toBe(originalMatchId);
		expect(result.current.round).toEqual(resetResult.round);

		// 失敗情境 2：完成該場後已無 pending 場次可重排，round 參考不變（toBe，非 toEqual）
		act(() => {
			result.current.submitScore(result.current.round!.matches[0].id, "11", "3");
		});
		const roundAfterComplete = result.current.round;
		let failAllCompletedResult: ResetIncompleteMatchesResult | undefined;
		act(() => {
			failAllCompletedResult = result.current.resetIncompleteMatches();
		});
		expect(failAllCompletedResult?.ok).toBe(false);
		expect(result.current.round).toBe(roundAfterComplete);
	});

	// 不在 test-plan 內：本 repo TDD 規範要求 hooks/** 的行為邏輯模組另有 hook 層把關
	// （round-lifecycle 的清槽驗收錨點在 lib/matchmaker/scoreboard-binding.test.ts，
	// 此處只驗證 useRoundStore 是否真的把重排前後的回合接線進 clearDiscardedMatchSlots，
	// 殺「清槽呼叫被拿掉」或「忘記在 dispatch 前保留重排前的回合參考」兩類變異）。
	it("resetIncompleteMatches 成功時清除被丟棄場次的計分板槽（殺清槽呼叫被拿掉的變異）", () => {
		const players: Player[] = [makePlayer({ id: "p1" }), makePlayer({ id: "p2" })];
		const updatePlayer = vi.fn();
		const { result } = renderHook(() => useRoundStore({ players, updatePlayer }));

		act(() => {
			result.current.generateRound({ format: "singles", courtCount: 1 });
		});
		const originalMatchId = result.current.round!.matches[0].id;
		writeMatchSlot({
			...createInitialState({ matchId: originalMatchId }),
			matchId: originalMatchId,
			status: "playing",
		});
		expect(readMatchSlot(originalMatchId)).not.toBeNull();

		act(() => {
			result.current.resetIncompleteMatches();
		});

		expect(readMatchSlot(originalMatchId)).toBeNull();
	});

	// 8.6：setTargetScore 是 M4 早已存在但全庫零非測試呼叫端的懸空純函式，本 change
	// 首次接上 hook 層——比照 resetIncompleteMatches 的「呼叫純函式 → 判 ok → dispatch」
	// 形態。失敗情境用「已完成一場」（已開始計分）觸發 round.ts 的 SCORING_STARTED 拒絕，
	// round 參考需維持不變（toBe，非 toEqual，殺「失敗仍 dispatch」變異）。
	it("setTargetScore 成功時套用新目標分數、已開始計分時拒絕且 round 參考不變", () => {
		const players: Player[] = [makePlayer({ id: "p1" }), makePlayer({ id: "p2" })];
		const updatePlayer = vi.fn();
		const { result } = renderHook(() => useRoundStore({ players, updatePlayer }));

		act(() => {
			result.current.generateRound({ format: "singles", courtCount: 1 });
		});
		expect(result.current.round?.targetScore).toBe(11);

		let successResult: SetTargetScoreResult | undefined;
		act(() => {
			successResult = result.current.setTargetScore(21);
		});
		expect(successResult?.ok).toBe(true);
		expect(result.current.round?.targetScore).toBe(21);

		// 完成該場後已開始計分，變更應被拒絕，round 參考不變。
		act(() => {
			result.current.submitScore(result.current.round!.matches[0].id, "21", "10");
		});
		const roundAfterComplete = result.current.round;
		let failResult: SetTargetScoreResult | undefined;
		act(() => {
			failResult = result.current.setTargetScore(15);
		});
		expect(failResult?.ok).toBe(false);
		expect(result.current.round).toBe(roundAfterComplete);
	});

	it("尚無目前回合時呼叫 setTargetScore 回傳失敗且不 dispatch（殺 state.round === null 防線被移除的變異）", () => {
		const players: Player[] = [makePlayer({ id: "p1" }), makePlayer({ id: "p2" })];
		const updatePlayer = vi.fn();
		const { result } = renderHook(() => useRoundStore({ players, updatePlayer }));

		let failResult: SetTargetScoreResult | undefined;
		act(() => {
			failResult = result.current.setTargetScore(15);
		});
		expect(failResult?.ok).toBe(false);
		expect(result.current.round).toBeNull();
	});

	it("送出比分後 history 確實持久化到 localStorage（殺 write effect 依賴陣列改 [] 或整個 effect 被刪除的變異）", () => {
		const players: Player[] = [makePlayer({ id: "p1" }), makePlayer({ id: "p2" })];
		const updatePlayer = vi.fn();
		const { result } = renderHook(() => useRoundStore({ players, updatePlayer }));

		act(() => {
			result.current.generateRound({ format: "singles", courtCount: 1 });
		});
		const matchId = result.current.round!.matches[0].id;

		let submitResult: SubmitScoreResult | undefined;
		act(() => {
			submitResult = result.current.submitScore(matchId, "11", "4");
		});
		if (!submitResult?.ok) {
			throw new Error("測試前置失敗：submitScore 未成功");
		}

		// 直接讀 localStorage（繞過 hook 的 in-memory state），證明是 effect 真的寫入，
		// 不是 reducer 更新了記憶體內的 history 就以為完事。
		const { entries, droppedCount } = readHistory();
		expect(droppedCount).toBe(0);
		expect(entries).toHaveLength(1);
		expect(entries[0]).toEqual(submitResult.historyEntry);
	});
});
