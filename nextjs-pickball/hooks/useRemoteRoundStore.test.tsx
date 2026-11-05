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
				userId: "user-a",
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

/** 假計時器下推進時間；waitFor 在 vitest 假計時器下會卡住，因此需要等退避計時器的測試用它。 */
async function advance(ms: number): Promise<void> {
	await act(async () => {
		await vi.advanceTimersByTimeAsync(ms);
	});
}

function expectedUserOf(init: RequestInit | undefined): string | null {
	return new Headers(init?.headers).get("X-Expected-User-Id");
}

interface AccountProps {
	userId: string | null;
	players: Player[];
}

function renderAccount(initialProps: AccountProps) {
	const updatePlayer = vi.fn();
	const applyRemotePlayers = vi.fn();
	const reloadRemotePlayers = vi.fn();
	const renders: Array<ReturnType<typeof useRemoteRoundStore>> = [];
	const rendered = renderHook(
		(props: AccountProps) => {
			const value = useRemoteRoundStore({
				enabled: true,
				userId: props.userId,
				players: props.players,
				updatePlayer,
				applyRemotePlayers,
				reloadRemotePlayers,
				onUnauthorized: vi.fn(),
			});
			renders.push(value);
			return value;
		},
		{ initialProps },
	);
	return { ...rendered, updatePlayer, applyRemotePlayers, reloadRemotePlayers, renders };
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
		// 樂觀顯示該場完成，不必等 POST 回來
		expect(result.current.round?.matches[0].status).toBe("completed");
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
		// 在途的送出仍在佇列中，所以是「重複送出」而不是「場次已完成」
		expect(second.ok).toBe(false);
		if (!second.ok) expect(second.code).toBe("scoring-failed");
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
		if (!blocked.ok) expect(blocked.code).toBe("scoring-failed");
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

	it("雲端回合 setTimerDuration(null) 以 timer 為 null 寫入回合", async () => {
		const players = makePlayers(4);
		const round: Round = {
			...buildRound(players, "doubles", 1),
			timer: { durationMinutes: 10, startedAt: null },
		};
		const { result } = await mountSynced(round, 2, [], { players });

		onPutEcho(3);
		let outcome: { ok: boolean } | undefined;
		act(() => {
			outcome = result.current.setTimerDuration(null);
		});

		expect(outcome?.ok).toBe(true);
		await waitFor(() => expect(callsOf("PUT", ROUND_PATH)).toHaveLength(1));
		expect(bodiesOf("PUT", ROUND_PATH)[0].data.timer).toBeNull();
		expect(result.current.round?.timer).toBeNull();
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
		const deferredRetry = onDeferred("PUT", ROUND_PATH);
		deferred.release(500, {});
		await waitFor(() => expect(result.current.syncStatus).toBe("retrying"));
		await waitFor(() => expect(callsOf("PUT", ROUND_PATH)).toHaveLength(2), { timeout: 3000 });
		await settle();
		// 重送在途期間的 saving 不蓋掉 retrying
		expect(result.current.syncStatus).toBe("retrying");
		deferredRetry.release(200, (body: { data: Round }) => ({ data: body.data, version: 4 }));
		await waitFor(() => expect(result.current.syncStatus).toBe("synced"));
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
		const { result, statusLog } = await mountSynced(buildRound(players, "doubles", 1), 2, [], { players });

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
		const tail = statusLog.slice(statusLog.indexOf("rejected"));
		expect(tail.slice(0, tail.indexOf("synced"))).not.toContain("saving");
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
		const { result, statusLog } = await mountSynced(round, 3, [], { players });

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
		await waitFor(() => expect(result.current.syncStatus).toBe("synced"));
		// 衝突文案維持到下一次儲存成功為止，重送時的 saving 不蓋掉它
		const tail = statusLog.slice(statusLog.indexOf("conflict"));
		expect(tail.slice(0, tail.indexOf("synced"))).not.toContain("saving");
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

	it("送出比分成功後畫面以回應的回合為基礎，重新套用排隊中的回合變更", async () => {
		const players = makePlayers(4);
		const base = buildRound(players, "doubles", 1);
		const round = { ...base, timer: { durationMinutes: 10 as const, startedAt: null } };
		const { result } = await mountSynced(round, 3, [], { players });

		const response = buildSubmitResponse(round, players, "m1", 3);
		const deferredPost = onDeferred("POST", SCORE_PATH);
		const deferredPut = onDeferred("PUT", ROUND_PATH);
		act(() => {
			result.current.submitScore("m1", "11", "7");
			result.current.startTimer();
		});
		await waitFor(() => expect(callsOf("POST", SCORE_PATH)).toHaveLength(1));
		deferredPost.release(200, response);
		await waitFor(() => expect(callsOf("PUT", ROUND_PATH)).toHaveLength(1));

		// PUT 還在途：畫面 = 回應的回合（伺服器算出的完成時間）+ 排隊中的變更
		expect(result.current.round?.matches[0].completedAt).toBe(LATER);
		expect(result.current.round?.timer?.startedAt).not.toBeNull();
		expect(bodiesOf("PUT", ROUND_PATH)[0].version).toBe(4);
		expect(bodiesOf("PUT", ROUND_PATH)[0].data.matches[0].completedAt).toBe(LATER);
		deferredPut.release(200, (body: { data: Round }) => ({ data: body.data, version: 5 }));
		await waitFor(() => expect(result.current.syncStatus).toBe("synced"));
	});

	it("不同場次的送出各自排入，依序各送出一次", async () => {
		const players = makePlayers(4);
		const round = buildRound(players, "singles", 2);
		const { result } = await mountSynced(round, 3, [], { players });

		const first = buildSubmitResponse(round, players, "m1", 3);
		const deferredFirst = onDeferred("POST", SCORE_PATH);
		let second!: ReturnType<typeof result.current.submitScore>;
		act(() => {
			result.current.submitScore("m1", "11", "7");
			second = result.current.submitScore("m2", "11", "9");
		});
		expect(second.ok).toBe(true);
		await waitFor(() => expect(callsOf("POST", SCORE_PATH)).toHaveLength(1));
		on("POST", "/api/matchmaker/round/matches/m2/score", 200, buildSubmitResponse(first.round.data, players, "m2", 4));
		deferredFirst.release(200, first);
		await waitFor(() =>
			expect(callsOf("POST", "/api/matchmaker/round/matches/m2/score")).toHaveLength(1),
		);
		expect(bodiesOf("POST", "/api/matchmaker/round/matches/m2/score")[0].roundVersion).toBe(4);
		await waitFor(() => expect(result.current.syncStatus).toBe("synced"));
	});

	it("startTimer 的開始時間在操作當下決定，重新套用與送出時沿用同一個值", async () => {
		const players = makePlayers(4);
		const round = buildRound(players, "doubles", 1);
		const { result } = await mountSynced({ ...round, timer: { durationMinutes: 10, startedAt: null } }, 2, [], {
			players,
		});

		vi.useFakeTimers({ toFake: ["Date"] });
		try {
			vi.setSystemTime(new Date("2026-10-23T01:00:00.000Z"));
			const deferred = onDeferred("PUT", ROUND_PATH);
			act(() => {
				result.current.setTargetScore(15);
			});
			await waitFor(() => expect(callsOf("PUT", ROUND_PATH)).toHaveLength(1));
			act(() => {
				result.current.startTimer();
			});
			expect(result.current.round?.timer?.startedAt).toBe("2026-10-23T01:00:00.000Z");

			vi.setSystemTime(new Date("2026-10-23T01:00:09.000Z"));
			onPutEcho(5);
			deferred.release(200, (body: { data: Round }) => ({ data: body.data, version: 3 }));
			await waitFor(() => expect(callsOf("PUT", ROUND_PATH)).toHaveLength(2));
			expect(bodiesOf("PUT", ROUND_PATH)[1].data.timer.startedAt).toBe("2026-10-23T01:00:00.000Z");
		} finally {
			vi.useRealTimers();
		}
	});

	// ---- mutation 發現缺口後補的 regression guard（寫入即綠） ----

	function buildTimedRound(players: Player[]): Round {
		return {
			...buildRound(players, "singles", 2),
			timer: { durationMinutes: 10 as const, startedAt: null },
		};
	}

	it("401 之後與衝突重載期間，七個操作皆不送出也不改變畫面", async () => {
		const players = makePlayers(6);
		const round = buildTimedRound(players);
		const leaving = round.matches[1].teams[0].playerIds[0];
		const resting = round.restingPlayerIds[0];

		async function expectAllBlocked(current: Rendered) {
			const callsBefore = fetchMock.mock.calls.length;
			const shown = current.result.current.round;
			let outcomes: Array<{ ok: boolean }> = [];
			act(() => {
				const store = current.result.current;
				outcomes = [
					store.generateRound({ format: "singles", courtCount: 2 }),
					store.resetIncompleteMatches(),
					store.submitScore("m1", "11", "7"),
					store.setTargetScore(15),
					store.setTimerDuration(15),
					store.startTimer(),
					store.swapMatchPlayer("m2", leaving, resting),
				];
			});
			expect(outcomes).toHaveLength(7);
			expect(outcomes.every((outcome) => !outcome.ok)).toBe(true);
			await settle();
			expect(fetchMock.mock.calls.length).toBe(callsBefore);
			expect(current.result.current.round).toBe(shown);
		}

		// 401 之後
		const stopped = await mountSynced(round, 3, [], { players });
		on("PUT", ROUND_PATH, 401);
		act(() => {
			stopped.result.current.setTargetScore(15);
		});
		await waitFor(() => expect(stopped.onUnauthorized).toHaveBeenCalledTimes(1));
		await expectAllBlocked(stopped);

		// 衝突重載期間
		const reloading = await mountSynced(round, 3, [], { players });
		on("PUT", ROUND_PATH, 409);
		const reload = onDeferred("GET", ROUND_PATH);
		on("GET", SLOTS_PATH, 200, { items: [] });
		act(() => {
			reloading.result.current.setTargetScore(15);
		});
		await waitFor(() => expect(callsOf("GET", ROUND_PATH).length).toBeGreaterThanOrEqual(3));
		await expectAllBlocked(reloading);
		reload.release(200, { data: round, version: 6 });
		await waitFor(() => expect(reloading.result.current.syncStatus).toBe("conflict"));
	});

	it("排在送出比分後面的場次調整以回應的回合重新套用，不覆蓋伺服器算出的完成時間", async () => {
		for (const kind of ["swap", "reset"] as const) {
			fetchMock.mockClear();
			const players = makePlayers(6);
			const round = buildTimedRound(players);
			const leaving = round.matches[1].teams[0].playerIds[0];
			const resting = round.restingPlayerIds[0];
			const { result } = await mountSynced(round, 3, [], { players });

			const response = buildSubmitResponse(round, players, "m1", 3);
			const deferredPost = onDeferred("POST", SCORE_PATH);
			act(() => {
				result.current.submitScore("m1", "11", "7");
			});
			await waitFor(() => expect(callsOf("POST", SCORE_PATH)).toHaveLength(1));
			let outcome!: { ok: boolean };
			act(() => {
				outcome =
					kind === "swap"
						? result.current.swapMatchPlayer("m2", leaving, resting)
						: result.current.resetIncompleteMatches();
			});
			expect(outcome.ok).toBe(true);
			onPutEcho(5);
			deferredPost.release(200, response);
			await waitFor(() => expect(callsOf("PUT", ROUND_PATH)).toHaveLength(1));

			const body = bodiesOf("PUT", ROUND_PATH)[0];
			expect(body.version).toBe(4);
			const sent = body.data.matches as Array<{ id: string; completedAt: string | null }>;
			expect(sent.find((match) => match.id === "m1")?.completedAt).toBe(LATER);
			// 場次 id 不重複（穩定 id 來源要逐次前進）
			expect(new Set(sent.map((match) => match.id)).size).toBe(sent.length);
			const shown = result.current.round?.matches.map((match) => match.id) ?? [];
			expect(new Set(shown).size).toBe(shown.length);
			if (kind === "swap") {
				expect(body.data.matches[1].teams[0].playerIds).toEqual([resting]);
			}
			await waitFor(() => expect(result.current.syncStatus).toBe("synced"));
		}
	});

	it("排隊中的回合變更以伺服器回應的回合為基礎，保留伺服器改過的欄位", async () => {
		const cases = ["timer", "swap", "reset", "start"] as const;
		for (const kind of cases) {
			fetchMock.mockClear();
			const players = makePlayers(6);
			const round = buildTimedRound(players);
			const leaving = round.matches[1].teams[0].playerIds[0];
			const resting = round.restingPlayerIds[0];
			const { result } = await mountSynced(round, 2, [], { players });

			const deferredPut = onDeferred("PUT", ROUND_PATH);
			act(() => {
				result.current.setTargetScore(15);
			});
			await waitFor(() => expect(callsOf("PUT", ROUND_PATH)).toHaveLength(1));
			act(() => {
				if (kind === "timer") result.current.setTimerDuration(15);
				if (kind === "swap") result.current.swapMatchPlayer("m2", leaving, resting);
				if (kind === "reset") result.current.resetIncompleteMatches();
				if (kind === "start") result.current.startTimer();
			});
			onPutEcho(6);
			// 伺服器把目標分數改成 21
			deferredPut.release(200, (body: { data: Round }) => ({
				data: { ...body.data, targetScore: 21 },
				version: 3,
			}));
			await waitFor(() => expect(callsOf("PUT", ROUND_PATH)).toHaveLength(2));
			const second = bodiesOf("PUT", ROUND_PATH)[1];
			expect(second.version).toBe(3);
			expect(second.data.targetScore).toBe(21);
			if (kind === "timer") expect(second.data.timer.durationMinutes).toBe(15);
			if (kind === "start") expect(second.data.timer.startedAt).not.toBeNull();
			if (kind === "swap") expect(second.data.matches[1].teams[0].playerIds).toEqual([resting]);
			await waitFor(() => expect(result.current.syncStatus).toBe("synced"));
		}

		// 反向：先改計時長度，伺服器改成 20 分鐘，之後排入的目標分數保留 20
		fetchMock.mockClear();
		const players = makePlayers(6);
		const { result } = await mountSynced(buildTimedRound(players), 2, [], { players });
		const deferredPut = onDeferred("PUT", ROUND_PATH);
		act(() => {
			result.current.setTimerDuration(15);
		});
		await waitFor(() => expect(callsOf("PUT", ROUND_PATH)).toHaveLength(1));
		act(() => {
			result.current.setTargetScore(15);
		});
		onPutEcho(6);
		deferredPut.release(200, (body: { data: Round }) => ({
			data: { ...body.data, timer: { durationMinutes: 20, startedAt: null } },
			version: 3,
		}));
		await waitFor(() => expect(callsOf("PUT", ROUND_PATH)).toHaveLength(2));
		expect(bodiesOf("PUT", ROUND_PATH)[1].data.timer.durationMinutes).toBe(20);
		expect(bodiesOf("PUT", ROUND_PATH)[1].data.targetScore).toBe(15);
	});

	it("回應的回合中換入的球員已不在休息名單時，排隊的換人被丟棄且畫面等於已確認回合", async () => {
		const players = makePlayers(6);
		const round = buildTimedRound(players);
		const leaving = round.matches[1].teams[0].playerIds[0];
		const resting = round.restingPlayerIds[0];
		const { result } = await mountSynced(round, 2, [], { players });

		const deferredPut = onDeferred("PUT", ROUND_PATH);
		act(() => {
			result.current.setTargetScore(15);
		});
		await waitFor(() => expect(callsOf("PUT", ROUND_PATH)).toHaveLength(1));
		let swapped!: { ok: boolean };
		act(() => {
			swapped = result.current.swapMatchPlayer("m2", leaving, resting);
		});
		expect(swapped.ok).toBe(true);

		let confirmed: Round | null = null;
		deferredPut.release(200, (body: { data: Round }) => {
			confirmed = {
				...body.data,
				restingPlayerIds: body.data.restingPlayerIds.filter((id) => id !== resting),
			};
			return { data: confirmed, version: 3 };
		});
		await waitFor(() => expect(result.current.syncStatus).toBe("synced"));
		await settle();
		expect(callsOf("PUT", ROUND_PATH)).toHaveLength(1);
		expect(result.current.round).toEqual(confirmed);
	});

	it("排隊中的送出會被預測進畫面：前一個 PUT 回來後、POST 回來前，該場仍顯示完成", async () => {
		const players = makePlayers(6);
		const round = buildTimedRound(players);
		const leaving = round.matches[1].teams[0].playerIds[0];
		const resting = round.restingPlayerIds[0];
		const { result } = await mountSynced(round, 3, [], { players });

		const deferredPut = onDeferred("PUT", ROUND_PATH);
		act(() => {
			result.current.swapMatchPlayer("m2", leaving, resting);
		});
		await waitFor(() => expect(callsOf("PUT", ROUND_PATH)).toHaveLength(1));
		act(() => {
			result.current.submitScore("m1", "11", "7");
		});
		onDeferred("POST", SCORE_PATH);
		deferredPut.release(200, (body: { data: Round }) => ({ data: body.data, version: 4 }));
		await waitFor(() => expect(callsOf("POST", SCORE_PATH)).toHaveLength(1));
		expect(result.current.round?.matches[0].status).toBe("completed");
	});

	it("重排產生多個新場次時，場次 id 彼此不重複", async () => {
		const players = makePlayers(8);
		const round = buildRound(players, "singles", 4);
		const { result } = await mountSynced(round, 2, [], { players });

		onPutEcho(3);
		let outcome!: { ok: boolean };
		act(() => {
			outcome = result.current.resetIncompleteMatches();
		});
		expect(outcome.ok).toBe(true);
		const shown = result.current.round?.matches.map((match) => match.id) ?? [];
		expect(shown).toHaveLength(4);
		expect(new Set(shown).size).toBe(4);
		await waitFor(() => expect(callsOf("PUT", ROUND_PATH)).toHaveLength(1));
		const sent = bodiesOf("PUT", ROUND_PATH)[0].data.matches.map((match: { id: string }) => match.id);
		expect(new Set(sent).size).toBe(4);
	});

	it("排在送出比分後面、已無法套用的換人不會清空畫面，也不會被預測進畫面", async () => {
		const players = makePlayers(6);
		const round = buildTimedRound(players);
		const leaving = round.matches[1].teams[0].playerIds[0];
		const resting = round.restingPlayerIds[0];
		const { result } = await mountSynced(round, 2, [], { players });

		const deferredPut = onDeferred("PUT", ROUND_PATH);
		act(() => {
			result.current.setTargetScore(15);
		});
		await waitFor(() => expect(callsOf("PUT", ROUND_PATH)).toHaveLength(1));
		act(() => {
			result.current.submitScore("m1", "11", "7");
			result.current.swapMatchPlayer("m2", leaving, resting);
		});
		onDeferred("POST", SCORE_PATH);
		deferredPut.release(200, (body: { data: Round }) => ({
			data: {
				...body.data,
				restingPlayerIds: body.data.restingPlayerIds.filter((id) => id !== resting),
			},
			version: 3,
		}));
		await waitFor(() => expect(callsOf("POST", SCORE_PATH)).toHaveLength(1));
		expect(result.current.round).not.toBeNull();
		expect(result.current.round?.matches[0].status).toBe("completed");
		expect(result.current.round?.matches[1].teams[0].playerIds).toEqual([leaving]);
	});

	it("名單從空變成六人之後，generateRound 以新名單排出回合", async () => {
		onLoad(null, 0);
		const { result, rerender } = renderRound({ players: [] });
		await waitFor(() => expect(result.current.syncStatus).toBe("synced"));

		const six = makePlayers(6);
		rerender({ enabled: true, players: six });
		onPutEcho(1);
		let outcome!: { ok: boolean };
		act(() => {
			outcome = result.current.generateRound({ format: "singles", courtCount: 1 });
		});
		expect(outcome.ok).toBe(true);
		await waitFor(() => expect(callsOf("PUT", ROUND_PATH)).toHaveLength(1));
		const body = bodiesOf("PUT", ROUND_PATH)[0];
		const used = [
			...body.data.matches.flatMap((match: { teams: Array<{ playerIds: string[] }> }) =>
				match.teams.flatMap((team) => team.playerIds),
			),
			...body.data.restingPlayerIds,
		];
		expect([...used].sort()).toEqual(six.map((player) => player.id).sort());
	});

	it("enabled 反覆切換時，舊一輪較晚回來的載入結果被忽略", async () => {
		const players = makePlayers(4);
		const oldRound = buildRound(players, "doubles", 1);
		const newRound = { ...buildRound(players, "doubles", 1), roundNumber: 8 };

		const oldRoundGet = onDeferred("GET", ROUND_PATH);
		const oldSlotsGet = onDeferred("GET", SLOTS_PATH);
		const { result, rerender } = renderRound({ players });
		await waitFor(() => expect(callsOf("GET", ROUND_PATH)).toHaveLength(1));
		rerender({ enabled: false, players });
		const newRoundGet = onDeferred("GET", ROUND_PATH);
		const newSlotsGet = onDeferred("GET", SLOTS_PATH);
		rerender({ enabled: true, players });
		await waitFor(() => expect(callsOf("GET", ROUND_PATH)).toHaveLength(2));

		// 重新啟用的當下是載入中，不殘留任何回合
		expect(result.current.syncStatus).toBe("loading");
		expect(result.current.round).toBeNull();

		newRoundGet.release(200, { data: newRound, version: 7 });
		newSlotsGet.release(200, { items: [] });
		await waitFor(() => expect(result.current.syncStatus).toBe("synced"));
		oldRoundGet.release(200, { data: oldRound, version: 2 });
		oldSlotsGet.release(200, { items: [{ data: makeSlot("m1"), version: 1 }] });
		await settle();
		expect(result.current.round).toEqual(newRound);
		expect(result.current.remoteMatchSlots).toEqual({});

		onPutEcho(8);
		act(() => {
			result.current.setTargetScore(15);
		});
		await waitFor(() => expect(callsOf("PUT", ROUND_PATH)).toHaveLength(1));
		expect(bodiesOf("PUT", ROUND_PATH)[0].version).toBe(7);
	});

	it("已載入之後 enabled 關閉再開啟，重新載入前回到 loading 且清空回合", async () => {
		const players = makePlayers(4);
		const first = buildRound(players, "doubles", 1);
		const second = { ...buildRound(players, "doubles", 1), roundNumber: 5 };
		const { result, rerender } = await mountSynced(first, 2, [makeSlot("m1")], { players });

		rerender({ enabled: false, players });
		const roundGet = onDeferred("GET", ROUND_PATH);
		const slotsGet = onDeferred("GET", SLOTS_PATH);
		rerender({ enabled: true, players });
		expect(result.current.syncStatus).toBe("loading");
		expect(result.current.round).toBeNull();
		expect(result.current.remoteMatchSlots).toEqual({});

		roundGet.release(200, { data: second, version: 4 });
		slotsGet.release(200, { items: [] });
		await waitFor(() => expect(result.current.syncStatus).toBe("synced"));
		expect(result.current.round).toEqual(second);
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

	it("userId 變更時丟棄前一帳號的命令佇列並以新帳號重新載入", async () => {
		vi.useFakeTimers();
		try {
			const players = makePlayers(4);
			onLoad(buildRound(players, "doubles", 1), 2);
			const { result, rerender, updatePlayer } = renderAccount({ userId: "user-a", players });
			await advance(0);
			expect(result.current.syncStatus).toBe("synced");

			on("PUT", ROUND_PATH, 500);
			act(() => {
				result.current.setTargetScore(15);
			});
			await advance(0);
			expect(callsOf("PUT", ROUND_PATH)).toHaveLength(1);
			const before = fetchMock.mock.calls.length;

			const roundB = buildRound(players, "singles", 1);
			onLoad(roundB, 5, [makeSlot("m1")]);
			rerender({ userId: "user-b", players });
			await advance(30_000);

			const after = fetchMock.mock.calls.slice(before);
			expect(after).toHaveLength(2);
			expect(after.map(([, init]) => init?.method ?? "GET")).toEqual(["GET", "GET"]);
			expect(after.map(([, init]) => expectedUserOf(init))).toEqual(["user-b", "user-b"]);
			expect(callsOf("PUT", ROUND_PATH)).toHaveLength(1);
			expect(result.current.round).toEqual(roundB);
			expect(result.current.remoteMatchSlots).toEqual({ m1: makeSlot("m1") });
			expect(updatePlayer).not.toHaveBeenCalled();
		} finally {
			vi.useRealTimers();
		}
	});

	it("userId 變更的那一次 render 起不回傳前一帳號的資料", async () => {
		const players = makePlayers(4);
		const roundA = buildRound(players, "doubles", 1);
		onLoad(roundA, 2, [makeSlot("m1")]);
		const { result, rerender, renders } = renderAccount({ userId: "user-a", players });
		await waitFor(() => expect(result.current.syncStatus).toBe("synced"));
		expect(result.current.round).toEqual(roundA);

		const rendersBefore = renders.length;
		onDeferred("GET", ROUND_PATH);
		onDeferred("GET", SLOTS_PATH);
		rerender({ userId: "user-b", players });

		// 換帳號後的第一次 render（effect 尚未重設任何狀態的那一幀）
		const firstFrame = renders[rendersBefore];
		expect(firstFrame.round).toBeNull();
		expect(firstFrame.remoteMatchSlots).toEqual({});
		expect(firstFrame.syncStatus).toBe("loading");

		let outcome!: ReturnType<typeof firstFrame.setTargetScore>;
		act(() => {
			outcome = firstFrame.setTargetScore(15);
		});
		expect(outcome.ok).toBe(false);
		await settle();
		expect(callsOf("PUT", ROUND_PATH)).toHaveLength(0);
		expect(result.current.round).toBeNull();
	});

	it("enabled 為 true 但 userId 為 null 時不發出任何請求", async () => {
		const players = makePlayers(4);
		const { result } = renderAccount({ userId: null, players });
		act(() => {
			result.current.generateRound({ format: "doubles", courtCount: 1 });
			result.current.setTargetScore(15);
			result.current.submitScore("m1", "11", "7");
		});
		await settle();
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("換帳號後才回來的送出比分結果不呼叫 applyRemotePlayers", async () => {
		const players = makePlayers(4);
		const roundA = buildRound(players, "doubles", 1);
		onLoad(roundA, 3);
		const { result, rerender, applyRemotePlayers, reloadRemotePlayers } = renderAccount({
			userId: "user-a",
			players,
		});
		await waitFor(() => expect(result.current.syncStatus).toBe("synced"));

		const deferred = onDeferred("POST", SCORE_PATH);
		act(() => {
			result.current.submitScore("m1", "11", "7");
		});
		await waitFor(() => expect(callsOf("POST", SCORE_PATH)).toHaveLength(1));

		const roundB = buildRound(players, "singles", 1);
		onLoad(roundB, 5);
		rerender({ userId: "user-b", players });
		await waitFor(() => expect(result.current.syncStatus).toBe("synced"));

		await act(async () => {
			deferred.release(200, buildSubmitResponse(roundA, players, "m1", 3));
		});
		await settle();
		expect(applyRemotePlayers).not.toHaveBeenCalled();
		expect(reloadRemotePlayers).not.toHaveBeenCalled();
		expect(result.current.round).toEqual(roundB);
	});
});
