import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SubmitScoreResponse } from "@pickball/core/api/round";
import type { Round } from "@pickball/core/matchmaker/round-types";
import type { Player } from "@pickball/core/matchmaker/types";
import type { SaverEvent } from "./latest-wins-saver";
import type { putRemoteRound, submitRemoteScore } from "./round-api";
import {
	createRoundCommandQueue,
	type RoundCommand,
	type RoundCommandQueue,
} from "./round-command-queue";

// 佇列只搬運回合，不解讀其內容；測試用最小的假回合，以 log 記錄套用過哪些命令
interface FakeRound {
	log: string[];
	m1Completed?: boolean;
	timer?: number;
}

function asRound(fake: FakeRound): Round {
	return fake as unknown as Round;
}

function asFake(round: Round | null): FakeRound {
	return round as unknown as FakeRound;
}

/** 在 log 後面附上 name 的回合變更命令。 */
function step(name: string, afterCommit?: () => void): RoundCommand {
	return {
		kind: "transform",
		apply: (round) => {
			const base = asFake(round);
			return { round: asRound({ ...base, log: [...base.log, name] }), afterCommit };
		},
	};
}

function discard(): RoundCommand {
	return { kind: "transform", apply: () => null };
}

function submit(matchId: string): RoundCommand {
	return { kind: "submit", matchId, scoreA: "11", scoreB: "7" };
}

interface Deferred<T> {
	promise: Promise<T>;
	resolve: (value: T) => void;
}

function deferred<T>(): Deferred<T> {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((r) => {
		resolve = r;
	});
	return { promise, resolve };
}

type PutResult = Awaited<ReturnType<typeof putRemoteRound>>;
type SubmitResult = Awaited<ReturnType<typeof submitRemoteScore>>;

function putOk(round: FakeRound, version: number): PutResult {
	return { kind: "ok", value: { data: asRound(round), version } };
}

function submitOk(round: FakeRound, version: number): SubmitResult {
	return {
		kind: "ok",
		value: {
			round: { data: asRound(round), version },
			players: [],
			historyEntry: {},
			boundaryHits: [],
		} as unknown as SubmitScoreResponse,
	};
}

const PLAYERS = [{ id: "p1" }] as unknown as Player[];

interface Harness {
	queue: RoundCommandQueue;
	putRound: ReturnType<typeof vi.fn<typeof putRemoteRound>>;
	submitScore: ReturnType<typeof vi.fn<typeof submitRemoteScore>>;
	events: SaverEvent[];
	onConfirmed: ReturnType<typeof vi.fn>;
	onSubmitted: ReturnType<typeof vi.fn>;
}

function setup(initial: FakeRound = { log: [] }, version = 1): Harness {
	const putRound = vi.fn<typeof putRemoteRound>();
	const submitScore = vi.fn<typeof submitRemoteScore>();
	const events: SaverEvent[] = [];
	const onConfirmed = vi.fn();
	const onSubmitted = vi.fn();
	const queue = createRoundCommandQueue({
		initial: { round: asRound(initial), version },
		getPlayers: () => PLAYERS,
		putRound,
		submitScore,
		onEvent: (event) => events.push(event),
		onConfirmed,
		onSubmitted,
	});
	return { queue, putRound, submitScore, events, onConfirmed, onSubmitted };
}

async function settle(): Promise<void> {
	await vi.advanceTimersByTimeAsync(0);
}

describe("round-command-queue", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("單一在途且連續的回合變更合併為一次 PUT，送出比分不合併", async () => {
		const h = setup({ log: [] }, 1);
		const first = deferred<PutResult>();
		h.putRound.mockReturnValueOnce(first.promise);
		const second = deferred<PutResult>();
		h.putRound.mockReturnValueOnce(second.promise);
		h.submitScore.mockResolvedValue(submitOk({ log: ["X", "A", "B"] }, 4));

		h.queue.enqueue(step("X"));
		h.queue.enqueue(step("A"));
		h.queue.enqueue(step("B"));
		h.queue.enqueue(submit("m1"));
		await settle();

		// 第一個 PUT 在途時，後面的命令都不得送出
		expect(h.putRound).toHaveBeenCalledTimes(1);
		expect(asFake(h.putRound.mock.calls[0][0]).log).toEqual(["X"]);
		expect(h.putRound.mock.calls[0][1]).toBe(1);

		first.resolve(putOk({ log: ["X"] }, 2));
		await settle();

		// 下一個請求是一次 PUT，A、B 依序套用在已確認回合上；送出比分還在等
		expect(h.putRound).toHaveBeenCalledTimes(2);
		expect(asFake(h.putRound.mock.calls[1][0]).log).toEqual(["X", "A", "B"]);
		expect(h.putRound.mock.calls[1][1]).toBe(2);
		expect(h.submitScore).not.toHaveBeenCalled();

		second.resolve(putOk({ log: ["X", "A", "B"] }, 3));
		await settle();

		expect(h.putRound).toHaveBeenCalledTimes(2);
		expect(h.submitScore).toHaveBeenCalledTimes(1);
		expect(h.submitScore).toHaveBeenCalledWith("m1", "11", "7", 3);
	});

	it("排隊中的回合變更以最新已確認回合重新套用，不覆蓋送出比分的結果", async () => {
		const h = setup({ log: [] }, 2);
		const post = deferred<SubmitResult>();
		h.submitScore.mockReturnValueOnce(post.promise);
		h.putRound.mockResolvedValue(putOk({ log: [] }, 6));

		h.queue.enqueue(submit("m1"));
		h.queue.enqueue({
			kind: "transform",
			apply: (round) => ({ round: asRound({ ...asFake(round), timer: 15 }) }),
		});
		await settle();
		expect(h.putRound).not.toHaveBeenCalled();

		post.resolve(submitOk({ log: ["server"], m1Completed: true }, 5));
		await settle();

		// T 以送出比分回應的回合為基礎：m1 仍為完成，version 為回應值
		expect(h.putRound).toHaveBeenCalledTimes(1);
		expect(asFake(h.putRound.mock.calls[0][0])).toEqual({
			log: ["server"],
			m1Completed: true,
			timer: 15,
		});
		expect(h.putRound.mock.calls[0][1]).toBe(5);
	});

	it("衝突、未授權與拒絕時清空佇列，網路失敗時依退避表重試", async () => {
		for (const outcome of [
			{ kind: "conflict" },
			{ kind: "unauthorized" },
			{ kind: "rejected", status: 400 },
		] as const) {
			const h = setup();
			h.putRound.mockResolvedValue(outcome);
			h.queue.enqueue(step("A"));
			h.queue.enqueue(step("B"));
			h.queue.enqueue(submit("m1"));
			await settle();

			expect(h.events).toEqual(["saving", outcome.kind]);
			expect(h.queue.getPending()).toHaveLength(0);
			await vi.advanceTimersByTimeAsync(60_000);
			expect(h.putRound).toHaveBeenCalledTimes(1);
			expect(h.submitScore).not.toHaveBeenCalled();
		}

		// failed：依 1/2/4/8 秒重試，用完後沿用 8 秒；送的是同一份請求
		const h = setup({ log: [] }, 7);
		h.putRound.mockResolvedValue({ kind: "failed" });
		h.queue.enqueue(step("A"));
		await settle();
		expect(h.putRound).toHaveBeenCalledTimes(1);
		expect(h.events).toEqual(["saving", "retrying"]);

		let expected = 1;
		for (const delay of [1000, 2000, 4000, 8000, 8000]) {
			await vi.advanceTimersByTimeAsync(delay - 1);
			expect(h.putRound).toHaveBeenCalledTimes(expected);
			await vi.advanceTimersByTimeAsync(1);
			expected += 1;
			expect(h.putRound).toHaveBeenCalledTimes(expected);
			expect(asFake(h.putRound.mock.calls[expected - 1][0]).log).toEqual(["A"]);
			expect(h.putRound.mock.calls[expected - 1][1]).toBe(7);
		}
		expect(h.queue.getPending()).toHaveLength(1);

		// 重試成功後佇列清空並回報 saved，且失敗次數歸零（下一次失敗又從 1 秒開始）
		h.putRound.mockResolvedValueOnce(putOk({ log: ["A"] }, 8));
		await vi.advanceTimersByTimeAsync(8000);
		expect(h.events.at(-1)).toBe("saved");
		expect(h.queue.getPending()).toHaveLength(0);

		h.putRound.mockResolvedValue({ kind: "failed" });
		h.queue.enqueue(step("B"));
		await settle();
		const before = h.putRound.mock.calls.length;
		await vi.advanceTimersByTimeAsync(1000);
		expect(h.putRound).toHaveBeenCalledTimes(before + 1);
	});

	it("無法套用的回合變更被丟棄，成功後才執行 afterCommit", async () => {
		const h = setup({ log: [] }, 1);
		const afterX = vi.fn();
		const afterB = vi.fn();
		const first = deferred<PutResult>();
		h.putRound.mockReturnValueOnce(first.promise);
		h.putRound.mockResolvedValue(putOk({ log: [] }, 3));

		h.queue.enqueue(step("X", afterX));
		h.queue.enqueue(discard());
		h.queue.enqueue(step("B", afterB));
		await settle();

		expect(afterX).not.toHaveBeenCalled();
		first.resolve(putOk({ log: ["X"] }, 2));
		await settle();

		// afterCommit 在各自所屬的 PUT 成功後執行；被丟棄的命令不影響其餘命令
		expect(afterX).toHaveBeenCalledTimes(1);
		expect(asFake(h.putRound.mock.calls[1][0]).log).toEqual(["X", "B"]);
		expect(afterB).toHaveBeenCalledTimes(1);
		expect(h.events).toEqual(["saving", "saving", "saved"]);
	});

	it("佇列中的命令全部無法套用時不送出請求", async () => {
		const h = setup();
		h.queue.enqueue(discard());
		await settle();

		expect(h.putRound).not.toHaveBeenCalled();
		expect(h.events).toEqual(["saved"]);
		expect(h.queue.getPending()).toHaveLength(0);
	});

	it("每次送出前以目前名單呼叫命令，且成功後通知已確認回合與送出比分回應", async () => {
		const h = setup({ log: [] }, 1);
		const apply = vi.fn((round: Round | null) => ({
			round: asRound({ ...asFake(round), timer: 9 }),
		}));
		h.putRound.mockResolvedValueOnce(putOk({ log: [], timer: 9 }, 2));
		const response = submitOk({ log: ["s"], m1Completed: true }, 3);
		h.submitScore.mockResolvedValueOnce(response);

		h.queue.enqueue({ kind: "transform", apply });
		h.queue.enqueue(submit("m1"));
		await settle();

		expect(apply).toHaveBeenCalledWith(expect.anything(), PLAYERS);
		expect(h.onConfirmed).toHaveBeenNthCalledWith(1, asRound({ log: [], timer: 9 }), 2);
		expect(h.onConfirmed).toHaveBeenNthCalledWith(2, asRound({ log: ["s"], m1Completed: true }), 3);
		expect(h.onSubmitted).toHaveBeenCalledTimes(1);
		expect(h.onSubmitted).toHaveBeenCalledWith(response.kind === "ok" ? response.value : undefined);
		expect(asFake(h.queue.getConfirmed().round)).toEqual({ log: ["s"], m1Completed: true });
		expect(h.queue.getConfirmed().version).toBe(3);
		expect(h.events).toEqual(["saving", "saving", "saved"]);
	});

	it("成功但沒有回應內容時視為網路失敗並重試", async () => {
		const h = setup();
		h.putRound.mockResolvedValueOnce({ kind: "ok", value: undefined });
		h.queue.enqueue(step("A"));
		await settle();
		expect(h.events).toEqual(["saving", "retrying"]);

		h.submitScore.mockResolvedValueOnce({ kind: "ok", value: undefined });
		const s = setup();
		s.queue.enqueue(submit("m1"));
		await settle();
		expect(s.events).toEqual(["saving", "retrying"]);
		expect(s.onSubmitted).not.toHaveBeenCalled();
	});

	it("dispose 後清除重試計時器並忽略在途結果", async () => {
		const h = setup();
		h.putRound.mockResolvedValue({ kind: "failed" });
		h.queue.enqueue(step("A"));
		await settle();
		h.queue.dispose();
		await vi.advanceTimersByTimeAsync(60_000);
		expect(h.putRound).toHaveBeenCalledTimes(1);

		const inFlight = setup();
		const pending = deferred<PutResult>();
		inFlight.putRound.mockReturnValueOnce(pending.promise);
		inFlight.queue.enqueue(step("A"));
		await settle();
		inFlight.queue.dispose();
		pending.resolve(putOk({ log: ["A"] }, 2));
		await settle();
		expect(inFlight.onConfirmed).not.toHaveBeenCalled();
		expect(inFlight.events).toEqual(["saving"]);

		inFlight.queue.enqueue(step("B"));
		await settle();
		expect(inFlight.putRound).toHaveBeenCalledTimes(1);
	});

	it("getPending 回傳尚未確認的命令，getConfirmed 回傳已確認的回合與版本", async () => {
		const h = setup({ log: [] }, 4);
		const first = deferred<PutResult>();
		h.putRound.mockReturnValueOnce(first.promise);

		const a = step("A");
		const s = submit("m1");
		h.queue.enqueue(a);
		h.queue.enqueue(s);
		await settle();

		expect(h.queue.getPending()).toEqual([a, s]);
		expect(h.queue.getConfirmed().version).toBe(4);
		expect(asFake(h.queue.getConfirmed().round).log).toEqual([]);

		h.submitScore.mockReturnValue(new Promise(() => {}));
		first.resolve(putOk({ log: ["A"] }, 5));
		await settle();
		// 在途的 PUT 成功後只移除它所送出的命令，其餘留在佇列
		expect(h.queue.getConfirmed().version).toBe(5);
		expect(h.queue.getPending()).toEqual([s]);
	});
});
