import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	createLatestWinsSaver,
	type SaveOutcome,
	type SaverEvent,
} from "./latest-wins-saver";

beforeEach(() => {
	vi.useFakeTimers();
});

afterEach(() => {
	vi.useRealTimers();
});

/** 可由測試手動決定何時、以何種結果完成的 send。 */
function createManualSend() {
	const resolvers: Array<(outcome: SaveOutcome) => void> = [];
	const send = vi.fn(
		(payload: string) =>
			new Promise<SaveOutcome>((resolve) => {
				void payload;
				resolvers.push(resolve);
			}),
	);
	return { send, resolvers };
}

function createEventLog() {
	const events: SaverEvent[] = [];
	const onResult = vi.fn((event: SaverEvent) => {
		events.push(event);
	});
	return { events, onResult };
}

describe("createLatestWinsSaver", () => {
	it("同時只送一個請求，在途期間再存只保留最新一份", async () => {
		const { send, resolvers } = createManualSend();
		const { events, onResult } = createEventLog();
		const saver = createLatestWinsSaver<string>({ send, onResult });

		saver.save("A");
		saver.save("B");
		saver.save("C");
		expect(send).toHaveBeenCalledTimes(1);
		expect(send).toHaveBeenLastCalledWith("A");

		resolvers[0]("ok");
		await vi.advanceTimersByTimeAsync(0);
		expect(send).toHaveBeenCalledTimes(2);
		expect(send).toHaveBeenLastCalledWith("C");
		// 有待送值時 ok 之後直接接著送，不會先回報 saved
		expect(events).toEqual(["saving", "saving"]);

		resolvers[1]("ok");
		await vi.advanceTimersByTimeAsync(0);
		expect(send).toHaveBeenCalledTimes(2);
		expect(events).toEqual(["saving", "saving", "saved"]);
	});

	it("failed 時依 1、2、4、8 秒後每 8 秒重試，成功後停止", async () => {
		const send = vi.fn(async (payload: string): Promise<SaveOutcome> => {
			void payload;
			return "failed";
		});
		const { events, onResult } = createEventLog();
		const saver = createLatestWinsSaver<string>({ send, onResult });

		saver.save("A");
		await vi.advanceTimersByTimeAsync(0);
		expect(send).toHaveBeenCalledTimes(1);
		expect(events).toEqual(["saving", "retrying"]);

		const delays = [1000, 2000, 4000, 8000, 8000, 8000];
		let expectedCalls = 1;
		for (const delay of delays) {
			await vi.advanceTimersByTimeAsync(delay - 1);
			expect(send).toHaveBeenCalledTimes(expectedCalls);
			await vi.advanceTimersByTimeAsync(1);
			expectedCalls += 1;
			expect(send).toHaveBeenCalledTimes(expectedCalls);
			expect(send).toHaveBeenLastCalledWith("A");
		}
		expect(events.filter((event) => event === "retrying")).toHaveLength(7);

		// 某次回 ok：回報 saved 並停止重試
		send.mockImplementation(async () => "ok");
		await vi.advanceTimersByTimeAsync(8000);
		expect(send).toHaveBeenCalledTimes(8);
		expect(events.at(-1)).toBe("saved");
		await vi.advanceTimersByTimeAsync(100_000);
		expect(send).toHaveBeenCalledTimes(8);

		// 成功後退避重設：下一次失敗從 1 秒重來
		send.mockImplementation(async () => "failed");
		saver.save("B");
		await vi.advanceTimersByTimeAsync(0);
		expect(send).toHaveBeenCalledTimes(9);
		await vi.advanceTimersByTimeAsync(999);
		expect(send).toHaveBeenCalledTimes(9);
		await vi.advanceTimersByTimeAsync(1);
		expect(send).toHaveBeenCalledTimes(10);
		saver.dispose();

		// send 自己 reject 時視同 failed，仍走重試而不是卡死
		const rejecting = vi
			.fn<(payload: string) => Promise<SaveOutcome>>()
			.mockRejectedValueOnce(new Error("boom"))
			.mockResolvedValue("ok");
		const rejectLog = createEventLog();
		const rejectSaver = createLatestWinsSaver<string>({
			send: rejecting,
			onResult: rejectLog.onResult,
		});
		rejectSaver.save("R");
		await vi.advanceTimersByTimeAsync(1000);
		expect(rejecting).toHaveBeenCalledTimes(2);
		expect(rejectLog.events).toEqual(["saving", "retrying", "saving", "saved"]);
		rejectSaver.dispose();
	});

	it("conflict、unauthorized、rejected 時停止並丟棄待送資料", async () => {
		const outcomes = ["conflict", "unauthorized", "rejected"] as const;
		for (const outcome of outcomes) {
			const { send, resolvers } = createManualSend();
			const { events, onResult } = createEventLog();
			const saver = createLatestWinsSaver<string>({ send, onResult });

			saver.save("A");
			saver.save("B");
			resolvers[0](outcome);
			await vi.advanceTimersByTimeAsync(0);

			expect(events).toEqual(["saving", outcome]);
			await vi.advanceTimersByTimeAsync(100_000);
			expect(send).toHaveBeenCalledTimes(1);

			// 停止後的佇列可以重新開始
			saver.save("C");
			expect(send).toHaveBeenCalledTimes(2);
			expect(send).toHaveBeenLastCalledWith("C");
			saver.dispose();
		}

		// 重試等待中也要能被這三種結果停止：先 failed 再回 conflict
		const sequence: SaveOutcome[] = ["failed", "conflict"];
		const send = vi.fn(async (payload: string): Promise<SaveOutcome> => {
			void payload;
			return sequence.shift() ?? "ok";
		});
		const { events, onResult } = createEventLog();
		const saver = createLatestWinsSaver<string>({ send, onResult });
		saver.save("A");
		await vi.advanceTimersByTimeAsync(1000);
		expect(events).toEqual(["saving", "retrying", "saving", "conflict"]);
		await vi.advanceTimersByTimeAsync(100_000);
		expect(send).toHaveBeenCalledTimes(2);
		saver.dispose();
	});

	it("重試等待期間的新資料取代待送值且不重置等待時間", async () => {
		const sequence: SaveOutcome[] = ["failed"];
		const send = vi.fn(async (payload: string): Promise<SaveOutcome> => {
			void payload;
			return sequence.shift() ?? "ok";
		});
		const { onResult } = createEventLog();
		const saver = createLatestWinsSaver<string>({ send, onResult });

		saver.save("A");
		await vi.advanceTimersByTimeAsync(0);
		expect(send).toHaveBeenCalledTimes(1);

		await vi.advanceTimersByTimeAsync(600);
		saver.save("B");
		// 等待期間不立即送出
		expect(send).toHaveBeenCalledTimes(1);

		await vi.advanceTimersByTimeAsync(399);
		expect(send).toHaveBeenCalledTimes(1);
		await vi.advanceTimersByTimeAsync(1);
		expect(send).toHaveBeenCalledTimes(2);
		expect(send).toHaveBeenLastCalledWith("B");
		saver.dispose();
	});

	it("dispose 後取消重試並忽略在途結果", async () => {
		// 情境一：等待重試時 dispose
		const failing = vi.fn(async (payload: string): Promise<SaveOutcome> => {
			void payload;
			return "failed";
		});
		const first = createEventLog();
		const waiting = createLatestWinsSaver<string>({
			send: failing,
			onResult: first.onResult,
		});
		waiting.save("A");
		await vi.advanceTimersByTimeAsync(0);
		const callsBefore = first.onResult.mock.calls.length;
		waiting.dispose();
		await vi.advanceTimersByTimeAsync(100_000);
		expect(failing).toHaveBeenCalledTimes(1);
		expect(first.onResult.mock.calls.length).toBe(callsBefore);

		// 情境二：在途 send 於 dispose 後才回 ok，且還有待送值
		const { send, resolvers } = createManualSend();
		const second = createEventLog();
		const inFlight = createLatestWinsSaver<string>({
			send,
			onResult: second.onResult,
		});
		inFlight.save("A");
		inFlight.save("B");
		const eventsBefore = second.onResult.mock.calls.length;
		inFlight.dispose();
		resolvers[0]("ok");
		await vi.advanceTimersByTimeAsync(100_000);
		expect(send).toHaveBeenCalledTimes(1);
		expect(second.onResult.mock.calls.length).toBe(eventsBefore);

		// 情境三：在途 send 於 dispose 後回 failed，不得排程重試
		const third = createManualSend();
		const failedAfter = createEventLog();
		const lateFail = createLatestWinsSaver<string>({
			send: third.send,
			onResult: failedAfter.onResult,
		});
		lateFail.save("A");
		lateFail.dispose();
		third.resolvers[0]("failed");
		await vi.advanceTimersByTimeAsync(100_000);
		expect(third.send).toHaveBeenCalledTimes(1);
		expect(failedAfter.events).toEqual(["saving"]);

		// dispose 後的 save 也不送出（全新、閒置的佇列）
		const idle = createManualSend();
		const idleLog = createEventLog();
		const idleSaver = createLatestWinsSaver<string>({
			send: idle.send,
			onResult: idleLog.onResult,
		});
		idleSaver.dispose();
		idleSaver.save("Z");
		expect(idle.send).not.toHaveBeenCalled();
		expect(idleLog.events).toEqual([]);
	});
});
