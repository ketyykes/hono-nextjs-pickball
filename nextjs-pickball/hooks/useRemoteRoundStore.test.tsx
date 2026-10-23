import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { createRound, submitScore as submitScorePure } from "@pickball/core/matchmaker/round";
import type { Round } from "@pickball/core/matchmaker/round-types";
import type { Player } from "@pickball/core/matchmaker/types";
import type { MatchSlot } from "@pickball/core/api/round";
import { createInitialState } from "@pickball/core/scoreboard/reducer";
import { useRemoteRoundStore } from "./useRemoteRoundStore";
import { HISTORY_STORAGE_KEY, ROUND_STORAGE_KEY } from "@/lib/matchmaker/storage-keys";
import type { SyncStatus } from "@/lib/sync/sync-status";

const ROUND_PATH = "/api/matchmaker/round";
const SLOTS_PATH = "/api/matchmaker/slots";
const SCORE_PATH = "/api/matchmaker/round/matches/m1/score";
const NOW = "2026-10-23T00:00:00.000Z";
const LATER = "2026-10-23T00:05:00.000Z";

function makePlayer(id: string, overrides: Partial<Player> = {}): Player {
	return {
		id,
		name: `球員${id}`,
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

function makePlayers(count: number): Player[] {
	return Array.from({ length: count }, (_, index) => makePlayer(`p${index + 1}`));
}

/** 以核心 createRound 建立固定場次 id（m1、m2…）的回合。 */
function buildRound(
	players: Player[],
	format: "singles" | "doubles",
	courtCount: number,
): Round {
	let next = 0;
	const result = createRound({
		players,
		format,
		courtCount,
		previousRound: null,
		now: NOW,
		newMatchId: () => {
			next += 1;
			return `m${next}`;
		},
	});
	if (!result.ok) throw new Error("測試前置失敗：createRound 未成功");
	return result.round;
}

function makeSlot(matchId: string): MatchSlot {
	return { ...createInitialState(), matchId };
}

function jsonResponse(status: number, body: unknown): Response {
	if (status === 204) return new Response(null, { status });
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

type Handler = (init: RequestInit | undefined) => Promise<Response>;

/** 依「方法 + 路徑」分開排隊；沒有預期到的請求記錄下來，afterEach 一律斷言為空。 */
const routes = new Map<string, Handler[]>();
let unexpected: string[] = [];
const fetchMock = vi.fn<typeof fetch>((input, init) => {
	const key = `${init?.method ?? "GET"} ${String(input)}`;
	const handler = routes.get(key)?.shift();
	if (handler === undefined) {
		unexpected.push(key);
		return Promise.reject(new Error(`unexpected fetch: ${key}`));
	}
	return handler(init);
});

function route(method: string, path: string, handler: Handler): void {
	const key = `${method} ${path}`;
	routes.set(key, [...(routes.get(key) ?? []), handler]);
}

function on(method: string, path: string, status: number, body: unknown = {}): void {
	route(method, path, () => Promise.resolve(jsonResponse(status, body)));
}

/** PUT 成功：回傳請求中的 data 與指定 version，模擬後端寫入後的回應。 */
function onPutEcho(version: number): void {
	route("PUT", ROUND_PATH, (init) => {
		const { data } = JSON.parse(String(init?.body));
		return Promise.resolve(jsonResponse(200, { data, version }));
	});
}

/** 手動決定何時回應的請求，用來觀察「在途」期間的狀態。 */
function onDeferred(method: string, path: string): {
	release: (status: number, body: unknown | ((requestBody: never) => unknown)) => void;
} {
	let captured: unknown = null;
	let resolveResponse: (response: Response) => void = () => {};
	route(method, path, (init) => {
		captured = init?.body === undefined ? null : JSON.parse(String(init.body));
		return new Promise<Response>((resolve) => {
			resolveResponse = resolve;
		});
	});
	return {
		release(status, body) {
			const value = typeof body === "function" ? (body as (b: unknown) => unknown)(captured) : body;
			resolveResponse(jsonResponse(status, value));
		},
	};
}

function onLoad(round: Round | null, version: number, slots: MatchSlot[] = []): void {
	on("GET", ROUND_PATH, 200, { data: round, version });
	on("GET", SLOTS_PATH, 200, { items: slots.map((data) => ({ data, version: 1 })) });
}

function callsOf(method: string, path: string) {
	return fetchMock.mock.calls.filter(
		([input, init]) => String(input) === path && (init?.method ?? "GET") === method,
	);
}

function bodiesOf(method: string, path: string) {
	return callsOf(method, path).map(([, init]) => JSON.parse(String(init?.body)));
}

interface RenderProps {
	enabled: boolean;
	players: Player[];
	rosterSyncStatus?: SyncStatus;
}

function renderRound(initial: Partial<RenderProps> = {}) {
	const updatePlayer = vi.fn();
	const applyRemotePlayers = vi.fn();
	const reloadRemotePlayers = vi.fn();
	const onUnauthorized = vi.fn();
	const statusLog: SyncStatus[] = [];
	const initialProps: RenderProps = {
		enabled: true,
		players: makePlayers(4),
		...initial,
	};
	const rendered = renderHook(
		(props: RenderProps) => {
			const value = useRemoteRoundStore({
				enabled: props.enabled,
				players: props.players,
				rosterSyncStatus: props.rosterSyncStatus,
				updatePlayer,
				applyRemotePlayers,
				reloadRemotePlayers,
				onUnauthorized,
			});
			statusLog.push(value.syncStatus);
			return value;
		},
		{ initialProps },
	);
	return { ...rendered, updatePlayer, applyRemotePlayers, reloadRemotePlayers, onUnauthorized, statusLog };
}

type Rendered = ReturnType<typeof renderRound>;

async function mountSynced(
	round: Round | null,
	version: number,
	slots: MatchSlot[] = [],
	initial: Partial<RenderProps> = {},
): Promise<Rendered> {
	onLoad(round, version, slots);
	const rendered = renderRound(initial);
	await waitFor(() => expect(rendered.result.current.syncStatus).toBe("synced"));
	return rendered;
}

/** 讓尚未預期的延遲請求有機會出現，用於斷言「沒有再送出」。 */
async function settle(ms = 50): Promise<void> {
	await act(async () => {
		await new Promise((resolve) => setTimeout(resolve, ms));
	});
}

/** 依核心 submitScore 的結果組出後端送出比分的成功回應。 */
function buildSubmitResponse(round: Round, players: Player[], matchId: string, roundVersion: number) {
	const scored = submitScorePure({
		round,
		players,
		matchId,
		rawScoreA: "11",
		rawScoreB: "7",
		now: LATER,
	});
	if (!scored.ok) throw new Error("測試前置失敗：submitScore 未成功");
	return {
		round: { data: scored.round, version: roundVersion + 1 },
		players: scored.playerPatches.map((patch) => ({
			data: {
				...players.find((player) => player.id === patch.id)!,
				rating: patch.rating,
				gamesPlayed: patch.gamesPlayed,
			},
			version: 2,
		})),
		historyEntry: scored.historyEntry,
		boundaryHits: [],
	};
}

beforeEach(() => {
	routes.clear();
	unexpected = [];
	fetchMock.mockClear();
	localStorage.clear();
	vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
	expect(unexpected).toEqual([]);
});

describe("useRemoteRoundStore", () => {
	it("generateRound 樂觀顯示並在回合 PUT 成功後才結算休息次數", async () => {
		// 休息次數是在「結束上一輪」時結算，因此雲端要先有一個有人休息的上一輪
		const previous = buildRound(makePlayers(6), "singles", 1);
		const first = await mountSynced(previous, 2, [], { players: makePlayers(6) });

		const deferred = onDeferred("PUT", ROUND_PATH);
		let outcome!: ReturnType<typeof first.result.current.generateRound>;
		act(() => {
			outcome = first.result.current.generateRound({ format: "singles", courtCount: 1 });
		});
		if (!outcome.ok) throw new Error("generateRound 應成功");
		const settlements = outcome.restSettlements;
		expect(first.result.current.round).toEqual(outcome.round);
		expect(settlements.length).toBeGreaterThan(0);
		await waitFor(() => expect(callsOf("PUT", ROUND_PATH)).toHaveLength(1));
		expect(first.updatePlayer).not.toHaveBeenCalled();
		// 雲端模式不寫入本機回合與歷史
		expect(localStorage.getItem(ROUND_STORAGE_KEY)).toBeNull();
		expect(localStorage.getItem(HISTORY_STORAGE_KEY)).toBeNull();

		deferred.release(200, (body: { data: Round }) => ({ data: body.data, version: 1 }));
		await waitFor(() => expect(first.updatePlayer).toHaveBeenCalledTimes(settlements.length));
		for (const settlement of settlements) {
			expect(first.updatePlayer).toHaveBeenCalledWith(settlement.id, {
				restCount: settlement.restCount,
			});
		}
		await waitFor(() => expect(first.result.current.syncStatus).toBe("synced"));
		expect(bodiesOf("PUT", ROUND_PATH)[0].version).toBe(2);

		// 409 時丟棄結算
		const second = await mountSynced(previous, 2, [], { players: makePlayers(6) });
		on("PUT", ROUND_PATH, 409);
		onLoad(buildRound(makePlayers(4), "doubles", 1), 5);
		act(() => {
			second.result.current.generateRound({ format: "singles", courtCount: 1 });
		});
		await waitFor(() => expect(second.result.current.syncStatus).toBe("conflict"));
		expect(second.updatePlayer).not.toHaveBeenCalled();
	});

	it("submitScore 以 POST 送出並以回應更新回合與名單，不逐人 PUT 評分", async () => {
		const players = makePlayers(4);
		const round = buildRound(players, "doubles", 1);
		const { result, updatePlayer, applyRemotePlayers } = await mountSynced(round, 3, [], { players });

		const response = buildSubmitResponse(round, players, "m1", 3);
		on("POST", SCORE_PATH, 200, response);
		let outcome!: ReturnType<typeof result.current.submitScore>;
		act(() => {
			outcome = result.current.submitScore("m1", "11", "7");
		});
		expect(outcome.ok).toBe(true);
		await waitFor(() => expect(callsOf("POST", SCORE_PATH)).toHaveLength(1));
		expect(bodiesOf("POST", SCORE_PATH)[0]).toEqual({ scoreA: "11", scoreB: "7", roundVersion: 3 });

		await waitFor(() => expect(applyRemotePlayers).toHaveBeenCalledTimes(1));
		expect(applyRemotePlayers).toHaveBeenCalledWith(response.players);
		expect(response.players).toHaveLength(4);
		expect(updatePlayer).not.toHaveBeenCalled();
		expect(callsOf("PUT", "/api/matchmaker/players/p1")).toHaveLength(0);
		await waitFor(() => expect(result.current.syncStatus).toBe("synced"));
		expect(result.current.round).toEqual(response.round.data);
	});

	it("submitScore 預先驗證失敗時同步回傳錯誤且不送出請求", async () => {
		const players = makePlayers(4);
		const { result } = await mountSynced(buildRound(players, "doubles", 1), 3, [], { players });

		let outcome!: ReturnType<typeof result.current.submitScore>;
		act(() => {
			outcome = result.current.submitScore("m1", "", "7");
		});
		expect(outcome.ok).toBe(false);
		if (!outcome.ok) expect(outcome.code).toBe("empty-field");
		await settle();
		expect(callsOf("POST", SCORE_PATH)).toHaveLength(0);
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it("同一場次的送出在佇列中時不重複排入", async () => {
		const players = makePlayers(4);
		const round = buildRound(players, "doubles", 1);
		const { result } = await mountSynced(round, 3, [], { players });

		const deferred = onDeferred("POST", SCORE_PATH);
		act(() => {
			result.current.submitScore("m1", "11", "7");
		});
		await waitFor(() => expect(callsOf("POST", SCORE_PATH)).toHaveLength(1));
		let second!: ReturnType<typeof result.current.submitScore>;
		act(() => {
			second = result.current.submitScore("m1", "11", "7");
		});
		expect(second.ok).toBe(false);
		await settle();
		expect(callsOf("POST", SCORE_PATH)).toHaveLength(1);

		deferred.release(200, buildSubmitResponse(round, players, "m1", 3));
		await waitFor(() => expect(result.current.syncStatus).toBe("synced"));
		expect(callsOf("POST", SCORE_PATH)).toHaveLength(1);
	});

	it("回合 PUT 或送出比分回 409 時清空佇列、重新載入並回報 conflict", async () => {
		const players = makePlayers(4);
		const round = buildRound(players, "doubles", 1);
		const reloaded = { ...buildRound(players, "doubles", 2), roundNumber: 9 };

		// 回合 PUT 回 409：排在其後的送出比分不再送出
		const putCase = await mountSynced(round, 3, [], { players });
		const deferredPut = onDeferred("PUT", ROUND_PATH);
		act(() => {
			putCase.result.current.setTargetScore(15);
			putCase.result.current.submitScore("m1", "11", "7");
		});
		await waitFor(() => expect(callsOf("PUT", ROUND_PATH)).toHaveLength(1));
		onLoad(reloaded, 7, [makeSlot("m2")]);
		deferredPut.release(409, {});
		await waitFor(() => expect(putCase.result.current.syncStatus).toBe("conflict"));
		expect(putCase.result.current.round).toEqual(reloaded);
		expect(putCase.result.current.remoteMatchSlots).toEqual({ m2: makeSlot("m2") });
		expect(putCase.reloadRemotePlayers).toHaveBeenCalledTimes(1);
		await settle();
		expect(callsOf("POST", SCORE_PATH)).toHaveLength(0);

		// 送出比分回 409
		const postCase = await mountSynced(round, 3, [], { players });
		on("POST", SCORE_PATH, 409);
		onLoad(reloaded, 8);
		act(() => {
			postCase.result.current.submitScore("m1", "11", "7");
		});
		await waitFor(() => expect(postCase.result.current.syncStatus).toBe("conflict"));
		expect(postCase.result.current.round).toEqual(reloaded);
		expect(postCase.result.current.remoteMatchSlots).toEqual({});
		expect(postCase.reloadRemotePlayers).toHaveBeenCalledTimes(1);
		expect(postCase.applyRemotePlayers).not.toHaveBeenCalled();
	});

	it("載入失敗時回報 load-failed 且不送出，401 時呼叫 onUnauthorized", async () => {
		const players = makePlayers(4);
		on("GET", ROUND_PATH, 500);
		on("GET", SLOTS_PATH, 200, { items: [] });
		const failed = renderRound({ players });
		await waitFor(() => expect(failed.result.current.syncStatus).toBe("load-failed"));
		const callsBefore = fetchMock.mock.calls.length;
		let outcomes: Array<{ ok: boolean }> = [];
		act(() => {
			outcomes = [
				failed.result.current.generateRound({ format: "singles", courtCount: 1 }),
				failed.result.current.resetIncompleteMatches(),
				failed.result.current.submitScore("m1", "11", "7"),
				failed.result.current.setTargetScore(15),
				failed.result.current.setTimerDuration(10),
				failed.result.current.startTimer(),
				failed.result.current.swapMatchPlayer("m1", "p1", "p5"),
			];
		});
		expect(outcomes.every((outcome) => !outcome.ok)).toBe(true);
		await settle();
		expect(fetchMock.mock.calls.length).toBe(callsBefore);
		expect(failed.result.current.round).toBeNull();
		expect(failed.result.current.syncStatus).toBe("load-failed");
		expect(failed.onUnauthorized).not.toHaveBeenCalled();

		on("GET", ROUND_PATH, 401);
		on("GET", SLOTS_PATH, 200, { items: [] });
		const unauthorized = renderRound({ players });
		await waitFor(() => expect(unauthorized.onUnauthorized).toHaveBeenCalledTimes(1));
		await settle();
		expect(unauthorized.onUnauthorized).toHaveBeenCalledTimes(1);
	});

	it("enabled 為 false 時不發出任何回合請求", async () => {
		const { result, onUnauthorized } = renderRound({ enabled: false });
		let outcomes: Array<{ ok: boolean }> = [];
		act(() => {
			outcomes = [
				result.current.generateRound({ format: "singles", courtCount: 1 }),
				result.current.resetIncompleteMatches(),
				result.current.submitScore("m1", "11", "7"),
				result.current.setTargetScore(15),
				result.current.setTimerDuration(10),
				result.current.startTimer(),
				result.current.swapMatchPlayer("m1", "p1", "p5"),
			];
		});
		await settle();
		expect(outcomes.every((outcome) => !outcome.ok)).toBe(true);
		expect(fetchMock).not.toHaveBeenCalled();
		expect(result.current.syncStatus).toBe("local");
		expect(result.current.round).toBeNull();
		expect(result.current.remoteMatchSlots).toBeNull();
		expect(onUnauthorized).not.toHaveBeenCalled();
	});

	// ---- 以下為 7 個 spec 錨點之外的守護 ----

	it("載入成功時以回應取代狀態且不寫回；history 恆為空、droppedCount 恆為 0", async () => {
		const players = makePlayers(4);
		const round = buildRound(players, "doubles", 1);
		const { result, statusLog } = await mountSynced(round, 2, [makeSlot("m1")], { players });

		expect(result.current.round).toEqual(round);
		expect(result.current.remoteMatchSlots).toEqual({ m1: makeSlot("m1") });
		expect(result.current.history).toEqual([]);
		expect(result.current.droppedCount).toBe(0);
		expect(statusLog.indexOf("loading")).toBeGreaterThanOrEqual(0);
		expect(statusLog.indexOf("loading")).toBeLessThan(statusLog.indexOf("synced"));
		await settle();
		expect(callsOf("GET", ROUND_PATH)).toHaveLength(1);
		expect(callsOf("GET", SLOTS_PATH)).toHaveLength(1);
		expect(callsOf("PUT", ROUND_PATH)).toHaveLength(0);
	});

	it("回合或分槽任一個 GET 失敗皆為 load-failed", async () => {
		on("GET", ROUND_PATH, 200, { data: null, version: 0 });
		on("GET", SLOTS_PATH, 500);
		const { result } = renderRound();
		await waitFor(() => expect(result.current.syncStatus).toBe("load-failed"));
		expect(result.current.round).toBeNull();
	});

	it("分槽 GET 回 401 時同樣呼叫 onUnauthorized", async () => {
		on("GET", ROUND_PATH, 200, { data: null, version: 0 });
		on("GET", SLOTS_PATH, 401);
		const { onUnauthorized, result } = renderRound();
		await waitFor(() => expect(onUnauthorized).toHaveBeenCalledTimes(1));
		expect(result.current.syncStatus).not.toBe("synced");
	});

	it("名單未就緒時 submitScore 不送出也不改變回合，就緒後才送出", async () => {
		const players = makePlayers(4);
		const round = buildRound(players, "doubles", 1);
		const { result, rerender } = await mountSynced(round, 3, [], {
			players,
			rosterSyncStatus: "loading",
		});

		let blocked!: ReturnType<typeof result.current.submitScore>;
		act(() => {
			blocked = result.current.submitScore("m1", "11", "7");
		});
		expect(blocked.ok).toBe(false);
		await settle();
		expect(callsOf("POST", SCORE_PATH)).toHaveLength(0);
		expect(result.current.round).toEqual(round);

		rerender({ enabled: true, players, rosterSyncStatus: "load-failed" });
		act(() => {
			blocked = result.current.submitScore("m1", "11", "7");
		});
		expect(blocked.ok).toBe(false);
		expect(callsOf("POST", SCORE_PATH)).toHaveLength(0);

		on("POST", SCORE_PATH, 200, buildSubmitResponse(round, players, "m1", 3));
		rerender({ enabled: true, players, rosterSyncStatus: "synced" });
		let allowed!: ReturnType<typeof result.current.submitScore>;
		act(() => {
			allowed = result.current.submitScore("m1", "11", "7");
		});
		expect(allowed.ok).toBe(true);
		await waitFor(() => expect(callsOf("POST", SCORE_PATH)).toHaveLength(1));
		await waitFor(() => expect(result.current.syncStatus).toBe("synced"));
	});

	it("連續的回合變更合併為一次 PUT 並以前一次回應的 version 重新套用", async () => {
		const players = makePlayers(4);
		const round = buildRound(players, "doubles", 1);
		const { result } = await mountSynced(round, 2, [], { players });

		const deferred = onDeferred("PUT", ROUND_PATH);
		act(() => {
			result.current.setTargetScore(15);
		});
		await waitFor(() => expect(callsOf("PUT", ROUND_PATH)).toHaveLength(1));
		let outcomes: Array<{ ok: boolean }> = [];
		act(() => {
			outcomes = [result.current.setTimerDuration(10), result.current.startTimer()];
		});
		expect(outcomes.every((outcome) => outcome.ok)).toBe(true);
		expect(result.current.round?.timer?.durationMinutes).toBe(10);
		expect(result.current.round?.timer?.startedAt).not.toBeNull();

		onPutEcho(5);
		deferred.release(200, (body: { data: Round }) => ({ data: body.data, version: 3 }));
		await waitFor(() => expect(callsOf("PUT", ROUND_PATH)).toHaveLength(2));
		const [first, second] = bodiesOf("PUT", ROUND_PATH);
		expect(first.version).toBe(2);
		expect(first.data.targetScore).toBe(15);
		expect(second.version).toBe(3);
		expect(second.data.targetScore).toBe(15);
		expect(second.data.timer.durationMinutes).toBe(10);
		expect(second.data.timer.startedAt).not.toBeNull();
		await waitFor(() => expect(result.current.syncStatus).toBe("synced"));
		expect(result.current.round?.timer?.durationMinutes).toBe(10);
	});

	it("swapMatchPlayer 成功時樂觀換人並送出回合 PUT", async () => {
		const players = makePlayers(6);
		const round = buildRound(players, "singles", 1);
		const resting = round.restingPlayerIds[0];
		const leaving = round.matches[0].teams[0].playerIds[0];
		const { result } = await mountSynced(round, 2, [], { players });

		onPutEcho(3);
		let outcome!: ReturnType<typeof result.current.swapMatchPlayer>;
		act(() => {
			outcome = result.current.swapMatchPlayer("m1", leaving, resting);
		});
		expect(outcome.ok).toBe(true);
		expect(result.current.round?.matches[0].teams[0].playerIds).toEqual([resting]);
		await waitFor(() => expect(callsOf("PUT", ROUND_PATH)).toHaveLength(1));
		expect(bodiesOf("PUT", ROUND_PATH)[0].data.matches[0].teams[0].playerIds).toEqual([resting]);
		await waitFor(() => expect(result.current.syncStatus).toBe("synced"));
	});

	it("resetIncompleteMatches 成功時送出回合 PUT 並在成功後移除不屬於新回合的分槽", async () => {
		const players = makePlayers(4);
		const round = buildRound(players, "singles", 2);
		let counter = 0;
		vi.spyOn(crypto, "randomUUID").mockImplementation(
			() => `n${(counter += 1)}` as `${string}-${string}-${string}-${string}-${string}`,
		);
		const { result } = await mountSynced(round, 2, [makeSlot("m1"), makeSlot("m2")], { players });

		const deferred = onDeferred("PUT", ROUND_PATH);
		let outcome!: ReturnType<typeof result.current.resetIncompleteMatches>;
		act(() => {
			outcome = result.current.resetIncompleteMatches();
		});
		expect(outcome.ok).toBe(true);
		await waitFor(() => expect(callsOf("PUT", ROUND_PATH)).toHaveLength(1));
		// PUT 成功前分槽維持原樣
		expect(Object.keys(result.current.remoteMatchSlots ?? {}).sort()).toEqual(["m1", "m2"]);

		deferred.release(200, (body: { data: Round }) => ({ data: body.data, version: 3 }));
		await waitFor(() => expect(result.current.remoteMatchSlots).toEqual({}));
	});

	it("送出比分成功後只移除該場的分槽，其餘分槽保留", async () => {
		const players = makePlayers(4);
		const round = buildRound(players, "singles", 2);
		const { result } = await mountSynced(round, 3, [makeSlot("m1"), makeSlot("m2")], { players });

		on("POST", SCORE_PATH, 200, buildSubmitResponse(round, players, "m1", 3));
		act(() => {
			result.current.submitScore("m1", "11", "7");
		});
		await waitFor(() => expect(result.current.syncStatus).toBe("synced"));
		expect(Object.keys(result.current.remoteMatchSlots ?? {})).toEqual(["m2"]);
	});

	it("排入佇列的回合變更可重入：失敗重試時送出的回合與畫面上的回合一致，不重新隨機", async () => {
		const players = makePlayers(4);
		const round = buildRound(players, "singles", 2);
		let counter = 0;
		vi.spyOn(crypto, "randomUUID").mockImplementation(
			() => `r${(counter += 1)}` as `${string}-${string}-${string}-${string}-${string}`,
		);
		const { result } = await mountSynced(round, 2, [], { players });

		on("PUT", ROUND_PATH, 500);
		onPutEcho(3);
		act(() => {
			result.current.resetIncompleteMatches();
		});
		const displayedIds = result.current.round?.matches.map((match) => match.id);
		await waitFor(() => expect(callsOf("PUT", ROUND_PATH)).toHaveLength(2), { timeout: 3000 });
		const [first, second] = bodiesOf("PUT", ROUND_PATH);
		expect(first.data.matches.map((match: { id: string }) => match.id)).toEqual(displayedIds);
		expect(second.data.matches.map((match: { id: string }) => match.id)).toEqual(displayedIds);
		await waitFor(() => expect(result.current.syncStatus).toBe("synced"));
		expect(result.current.round?.matches.map((match) => match.id)).toEqual(displayedIds);
	});

	it("generateRound 失敗重試時送出同一份回合", async () => {
		const players = makePlayers(6);
		onLoad(null, 0);
		const { result } = renderRound({ players });
		await waitFor(() => expect(result.current.syncStatus).toBe("synced"));
		let counter = 0;
		vi.spyOn(crypto, "randomUUID").mockImplementation(
			() => `g${(counter += 1)}` as `${string}-${string}-${string}-${string}-${string}`,
		);

		on("PUT", ROUND_PATH, 500);
		onPutEcho(1);
		act(() => {
			result.current.generateRound({ format: "singles", courtCount: 1 });
		});
		await waitFor(() => expect(callsOf("PUT", ROUND_PATH)).toHaveLength(2), { timeout: 3000 });
		const [first, second] = bodiesOf("PUT", ROUND_PATH);
		expect(second.data).toEqual(first.data);
	});

	it("SyncStatus 轉換：saving、retrying、synced", async () => {
		const players = makePlayers(4);
		const round = buildRound(players, "doubles", 1);
		const { result, statusLog } = await mountSynced(round, 2, [], { players });

		const deferred = onDeferred("PUT", ROUND_PATH);
		act(() => {
			result.current.setTargetScore(15);
		});
		await waitFor(() => expect(result.current.syncStatus).toBe("saving"));
		on("PUT", ROUND_PATH, 500);
		onPutEcho(4);
		deferred.release(500, {});
		await waitFor(() => expect(result.current.syncStatus).toBe("retrying"));
		await waitFor(() => expect(result.current.syncStatus).toBe("synced"), { timeout: 4000 });
		// 重送時的 saving 不蓋掉 retrying
		const afterRetrying = statusLog.slice(statusLog.indexOf("retrying"));
		expect(afterRetrying.slice(0, afterRetrying.indexOf("synced"))).not.toContain("saving");
	});

	it("回合 PUT 回 400 時回報 rejected 並停止重試", async () => {
		const players = makePlayers(4);
		const { result } = await mountSynced(buildRound(players, "doubles", 1), 2, [], { players });

		on("PUT", ROUND_PATH, 400);
		act(() => {
			result.current.setTargetScore(15);
		});
		await waitFor(() => expect(result.current.syncStatus).toBe("rejected"));
		await settle(1200);
		expect(callsOf("PUT", ROUND_PATH)).toHaveLength(1);
	});

	it("rejected 之後下一次儲存成功即回到 synced", async () => {
		const players = makePlayers(4);
		const { result } = await mountSynced(buildRound(players, "doubles", 1), 2, [], { players });

		on("PUT", ROUND_PATH, 400);
		act(() => {
			result.current.setTargetScore(15);
		});
		await waitFor(() => expect(result.current.syncStatus).toBe("rejected"));
		onPutEcho(3);
		act(() => {
			result.current.setTargetScore(21);
		});
		await waitFor(() => expect(result.current.syncStatus).toBe("synced"));
	});

	it("回合 PUT 回 401 時呼叫 onUnauthorized 一次並停止，之後的操作不送出", async () => {
		const players = makePlayers(4);
		const { result, onUnauthorized, reloadRemotePlayers } = await mountSynced(
			buildRound(players, "doubles", 1),
			2,
			[],
			{ players },
		);

		on("PUT", ROUND_PATH, 401);
		act(() => {
			result.current.setTargetScore(15);
		});
		await waitFor(() => expect(onUnauthorized).toHaveBeenCalledTimes(1));
		const callsBefore = fetchMock.mock.calls.length;
		let outcome!: ReturnType<typeof result.current.setTargetScore>;
		act(() => {
			outcome = result.current.setTargetScore(21);
		});
		expect(outcome.ok).toBe(false);
		await settle();
		expect(fetchMock.mock.calls.length).toBe(callsBefore);
		expect(onUnauthorized).toHaveBeenCalledTimes(1);
		expect(reloadRemotePlayers).not.toHaveBeenCalled();
	});

	it("衝突重載期間的操作不送出也不改變畫面，重載完成後恢復", async () => {
		const players = makePlayers(4);
		const round = buildRound(players, "doubles", 1);
		const { result } = await mountSynced(round, 3, [], { players });

		on("PUT", ROUND_PATH, 409);
		const reloadRound = onDeferred("GET", ROUND_PATH);
		on("GET", SLOTS_PATH, 200, { items: [] });
		act(() => {
			result.current.setTargetScore(15);
		});
		await waitFor(() => expect(callsOf("GET", ROUND_PATH)).toHaveLength(2));
		const putsBefore = callsOf("PUT", ROUND_PATH).length;
		const displayed = result.current.round;
		let outcome!: ReturnType<typeof result.current.setTargetScore>;
		act(() => {
			outcome = result.current.setTargetScore(21);
		});
		expect(outcome.ok).toBe(false);
		expect(result.current.round).toBe(displayed);
		await settle();
		expect(callsOf("PUT", ROUND_PATH)).toHaveLength(putsBefore);

		reloadRound.release(200, { data: round, version: 6 });
		await waitFor(() => expect(result.current.syncStatus).toBe("conflict"));
		onPutEcho(7);
		act(() => {
			result.current.setTargetScore(21);
		});
		await waitFor(() => expect(callsOf("PUT", ROUND_PATH)).toHaveLength(putsBefore + 1));
		expect(bodiesOf("PUT", ROUND_PATH).at(-1).version).toBe(6);
	});

	it("衝突重載時收到 401 則呼叫 onUnauthorized 且不呼叫 reloadRemotePlayers", async () => {
		const players = makePlayers(4);
		const { result, onUnauthorized, reloadRemotePlayers } = await mountSynced(
			buildRound(players, "doubles", 1),
			3,
			[],
			{ players },
		);

		on("PUT", ROUND_PATH, 409);
		on("GET", ROUND_PATH, 401);
		on("GET", SLOTS_PATH, 200, { items: [] });
		act(() => {
			result.current.setTargetScore(15);
		});
		await waitFor(() => expect(onUnauthorized).toHaveBeenCalledTimes(1));
		await settle();
		expect(reloadRemotePlayers).not.toHaveBeenCalled();
		expect(result.current.syncStatus).not.toBe("conflict");
	});

	it("衝突重載失敗時回報 load-failed", async () => {
		const players = makePlayers(4);
		const { result, reloadRemotePlayers } = await mountSynced(
			buildRound(players, "doubles", 1),
			3,
			[],
			{ players },
		);

		on("PUT", ROUND_PATH, 409);
		on("GET", ROUND_PATH, 500);
		on("GET", SLOTS_PATH, 200, { items: [] });
		act(() => {
			result.current.setTargetScore(15);
		});
		await waitFor(() => expect(result.current.syncStatus).toBe("load-failed"));
		expect(reloadRemotePlayers).not.toHaveBeenCalled();
	});

	it("卸載時釋放佇列：重試計時器不再送出請求", async () => {
		const players = makePlayers(4);
		const { result, unmount } = await mountSynced(buildRound(players, "doubles", 1), 3, [], {
			players,
		});

		on("PUT", ROUND_PATH, 500);
		act(() => {
			result.current.setTargetScore(15);
		});
		await waitFor(() => expect(callsOf("PUT", ROUND_PATH)).toHaveLength(1));
		await waitFor(() => expect(result.current.syncStatus).toBe("retrying"));
		unmount();
		await settle(1300);
		expect(callsOf("PUT", ROUND_PATH)).toHaveLength(1);
	});

	it("rejected 之外的樂觀操作在回合不存在時回傳失敗且不送出", async () => {
		const { result } = await mountSynced(null, 0);

		let outcomes: Array<{ ok: boolean }> = [];
		act(() => {
			outcomes = [
				result.current.resetIncompleteMatches(),
				result.current.submitScore("m1", "11", "7"),
				result.current.setTargetScore(15),
				result.current.setTimerDuration(10),
				result.current.startTimer(),
				result.current.swapMatchPlayer("m1", "p1", "p2"),
			];
		});
		expect(outcomes.every((outcome) => !outcome.ok)).toBe(true);
		await settle();
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it("enabled 由 true 變 false 時回到 local 且清空回合與分槽", async () => {
		const players = makePlayers(4);
		const { result, rerender } = await mountSynced(
			buildRound(players, "doubles", 1),
			3,
			[makeSlot("m1")],
			{ players },
		);

		rerender({ enabled: false, players });
		expect(result.current.syncStatus).toBe("local");
		expect(result.current.round).toBeNull();
		expect(result.current.remoteMatchSlots).toBeNull();
	});
});
