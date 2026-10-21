import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./session-client", () => ({
	fetchSession: vi.fn(),
}));

import { fetchSession } from "./session-client";
import {
	getServerSnapshot,
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

	it("第一次請求進行中呼叫 refresh 會共用同一次請求", async () => {
		let resolve: (value: { authEnabled: boolean; user: null }) => void = () => {};
		mockedFetchSession.mockReturnValue(
			new Promise((r) => {
				resolve = r;
			}),
		);

		subscribe(vi.fn());
		const pending = refresh();
		expect(mockedFetchSession).toHaveBeenCalledTimes(1);

		resolve({ authEnabled: true, user: null });
		await pending;
		expect(getSnapshot().status).toBe("ready");
	});

	it("模組剛載入時為 loading，第一次訂閱才請求", async () => {
		// 不呼叫 reset：直接驗證宣告處的初始值，否則 beforeEach 的 reset 會遮蔽它
		vi.resetModules();
		const freshClient = await import("./session-client");
		const freshStore = await import("./session-store");
		const freshFetch = vi.mocked(freshClient.fetchSession);
		freshFetch.mockResolvedValue({ authEnabled: true, user: null });

		expect(freshStore.getSnapshot()).toEqual({ status: "loading" });
		expect(freshFetch).toHaveBeenCalledTimes(0);

		freshStore.subscribe(vi.fn());
		expect(freshFetch).toHaveBeenCalledTimes(1);
		await vi.waitFor(() => {
			expect(freshStore.getSnapshot().status).toBe("ready");
		});
	});

	it("authEnabled 為 false 時快照如實反映", async () => {
		mockedFetchSession.mockResolvedValue({ authEnabled: false, user: null });
		subscribe(vi.fn());
		await vi.waitFor(() => {
			expect(getSnapshot().status).toBe("ready");
		});
		expect(getSnapshot()).toEqual({
			status: "ready",
			authEnabled: false,
			user: null,
		});
	});

	it("ready 之後新增訂閱者不再發請求", async () => {
		subscribe(vi.fn());
		await vi.waitFor(() => {
			expect(getSnapshot().status).toBe("ready");
		});
		subscribe(vi.fn());
		expect(mockedFetchSession).toHaveBeenCalledTimes(1);
	});

	it("getServerSnapshot 在 store 已為 ready 後仍固定為 loading", async () => {
		subscribe(vi.fn());
		await vi.waitFor(() => {
			expect(getSnapshot().status).toBe("ready");
		});
		expect(getServerSnapshot()).toEqual({ status: "loading" });
	});
});
