import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./session-client", () => ({
	fetchSession: vi.fn(),
}));

import { fetchSession } from "./session-client";
import {
	getSnapshot,
	refresh,
	resetSessionStoreForTests,
	subscribe,
} from "./session-store";

const mockedFetchSession = vi.mocked(fetchSession);

const USER = { id: "u1", email: "tester@example.com", name: "測試員" };

describe("session-store", () => {
	beforeEach(() => {
		resetSessionStoreForTests();
		mockedFetchSession.mockReset();
		mockedFetchSession.mockResolvedValue({ authEnabled: true, user: null });
	});

	it("初始為 loading，第一次訂閱後取得 session 並轉為 ready", async () => {
		const listener = vi.fn();
		expect(getSnapshot()).toEqual({ status: "loading" });
		expect(mockedFetchSession).not.toHaveBeenCalled();

		subscribe(listener);
		await vi.waitFor(() => {
			expect(getSnapshot()).toEqual({
				status: "ready",
				authEnabled: true,
				user: null,
			});
		});
		expect(listener).toHaveBeenCalled();
	});

	it("請求完成前的多個訂閱者只觸發一次請求", async () => {
		subscribe(vi.fn());
		subscribe(vi.fn());
		subscribe(vi.fn());
		expect(mockedFetchSession).toHaveBeenCalledTimes(1);
		await vi.waitFor(() => {
			expect(getSnapshot().status).toBe("ready");
		});
		expect(mockedFetchSession).toHaveBeenCalledTimes(1);
	});

	it("refresh 重新取得 session 並通知所有訂閱者", async () => {
		const first = vi.fn();
		const second = vi.fn();
		subscribe(first);
		subscribe(second);
		await vi.waitFor(() => {
			expect(getSnapshot().status).toBe("ready");
		});
		first.mockClear();
		second.mockClear();

		mockedFetchSession.mockResolvedValue({ authEnabled: true, user: USER });
		await refresh();

		expect(mockedFetchSession).toHaveBeenCalledTimes(2);
		expect(first).toHaveBeenCalled();
		expect(second).toHaveBeenCalled();
		expect(getSnapshot()).toEqual({
			status: "ready",
			authEnabled: true,
			user: USER,
		});
	});

	it("取消訂閱後不再收到通知", async () => {
		const listener = vi.fn();
		const unsubscribe = subscribe(listener);
		await vi.waitFor(() => {
			expect(getSnapshot().status).toBe("ready");
		});
		unsubscribe();
		listener.mockClear();

		await refresh();
		expect(listener).not.toHaveBeenCalled();
	});

	it("未變更時 getSnapshot 回傳同一個參考", async () => {
		const loading = getSnapshot();
		expect(getSnapshot()).toBe(loading);
		subscribe(vi.fn());
		await vi.waitFor(() => {
			expect(getSnapshot().status).toBe("ready");
		});
		expect(getSnapshot()).toBe(getSnapshot());
	});
});
