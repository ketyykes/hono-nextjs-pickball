import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./session-client", () => ({
	fetchSession: vi.fn(),
}));

import { fetchSession } from "./session-client";
import {
	SIGNED_IN_HINT_STORAGE_KEY,
	readSignedInHint,
	writeSignedInHint,
} from "./session-hint";
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
		localStorage.clear();
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

	it("進行中呼叫 refresh 會重新請求，且以最後一次結果為準", async () => {
		type State = { authEnabled: boolean; user: typeof USER | null };
		let resolveA: (value: State) => void = () => {};
		let resolveB: (value: State) => void = () => {};
		mockedFetchSession
			.mockReturnValueOnce(
				new Promise<State>((r) => {
					resolveA = r;
				}),
			)
			.mockReturnValueOnce(
				new Promise<State>((r) => {
					resolveB = r;
				}),
			);

		subscribe(vi.fn());
		const pending = refresh();
		expect(mockedFetchSession).toHaveBeenCalledTimes(2);

		// 亂序到達：較新的請求 B 先完成，較舊的 A 後到不得蓋掉 B
		resolveB({ authEnabled: true, user: USER });
		await pending;
		resolveA({ authEnabled: true, user: null });
		await Promise.resolve();
		await Promise.resolve();

		expect(getSnapshot()).toEqual({
			status: "ready",
			authEnabled: true,
			user: USER,
		});
	});

	it("進行中呼叫 refresh 時，依序到達的結果同樣以後發請求為準", async () => {
		type State = { authEnabled: boolean; user: typeof USER | null };
		let resolveA: (value: State) => void = () => {};
		let resolveB: (value: State) => void = () => {};
		mockedFetchSession
			.mockReturnValueOnce(
				new Promise<State>((r) => {
					resolveA = r;
				}),
			)
			.mockReturnValueOnce(
				new Promise<State>((r) => {
					resolveB = r;
				}),
			);

		subscribe(vi.fn());
		const pending = refresh();

		resolveA({ authEnabled: true, user: null });
		resolveB({ authEnabled: true, user: USER });
		await pending;

		expect(getSnapshot()).toEqual({
			status: "ready",
			authEnabled: true,
			user: USER,
		});
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

	it("fetchSession 回傳 signInMethods 時快照保留同一份 signInMethods", async () => {
		mockedFetchSession.mockResolvedValue({
			authEnabled: true,
			user: null,
			signInMethods: { google: true, emailPassword: false },
		});
		subscribe(vi.fn());
		await vi.waitFor(() => {
			expect(getSnapshot().status).toBe("ready");
		});
		expect(getSnapshot()).toEqual({
			status: "ready",
			authEnabled: true,
			user: null,
			signInMethods: { google: true, emailPassword: false },
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

describe("session-store 上次登入提示", () => {
	type State = { authEnabled: boolean; user: typeof USER | null };

	beforeEach(() => {
		localStorage.clear();
		resetSessionStoreForTests();
		mockedFetchSession.mockReset();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("有上次登入提示時 client 初始快照帶 signedInHint 而伺服器端快照不帶", () => {
		localStorage.setItem(SIGNED_IN_HINT_STORAGE_KEY, "1");
		resetSessionStoreForTests();
		mockedFetchSession.mockReturnValue(new Promise<State>(() => {}));

		const first = getSnapshot();
		expect(first).toEqual({ status: "loading", signedInHint: true });
		expect(getSnapshot()).toBe(first);
		expect(getServerSnapshot()).toEqual({ status: "loading" });
		expect(mockedFetchSession).not.toHaveBeenCalled();
	});

	it("session 確認為已登入時寫入提示，確認為未登入或 auth 停用時清除提示", async () => {
		mockedFetchSession
			.mockResolvedValueOnce({ authEnabled: true, user: USER })
			.mockResolvedValueOnce({ authEnabled: true, user: null })
			.mockResolvedValueOnce({ authEnabled: true, user: USER })
			.mockResolvedValueOnce({ authEnabled: false, user: null });

		subscribe(vi.fn());
		await vi.waitFor(() => {
			expect(getSnapshot().status).toBe("ready");
		});
		expect(readSignedInHint()).toBe(true);

		await refresh();
		expect(readSignedInHint()).toBe(false);
		await refresh();
		expect(readSignedInHint()).toBe(true);
		await refresh();
		expect(readSignedInHint()).toBe(false);

		// auth 停用卻帶 user 的不一致 payload：先讓提示為 true，再確認會被清除
		mockedFetchSession
			.mockResolvedValueOnce({ authEnabled: true, user: USER })
			.mockResolvedValueOnce({ authEnabled: false, user: USER });
		await refresh();
		expect(readSignedInHint()).toBe(true);
		await refresh();
		expect(readSignedInHint()).toBe(false);
	});

	it("被丟棄的過時 session 回應不改變提示", async () => {
		let resolveA: (value: State) => void = () => {};
		let resolveB: (value: State) => void = () => {};
		mockedFetchSession
			.mockReturnValueOnce(
				new Promise<State>((r) => {
					resolveA = r;
				}),
			)
			.mockReturnValueOnce(
				new Promise<State>((r) => {
					resolveB = r;
				}),
			);

		subscribe(vi.fn());
		const pending = refresh();

		resolveB({ authEnabled: true, user: USER });
		await pending;
		resolveA({ authEnabled: true, user: null });
		await Promise.resolve();
		await Promise.resolve();

		expect(readSignedInHint()).toBe(true);
		expect(getSnapshot()).toMatchObject({ status: "ready", user: USER });
	});

	it("帶提示等待逾時仍未取得 session 時快照改回不帶提示的 loading", async () => {
		vi.useFakeTimers();
		try {
			writeSignedInHint();
			resetSessionStoreForTests();
			mockedFetchSession.mockReturnValue(new Promise<State>(() => {}));

			const listener = vi.fn();
			subscribe(listener);
			expect(getSnapshot()).toEqual({ status: "loading", signedInHint: true });

			vi.advanceTimersByTime(9_999);
			expect(getSnapshot()).toEqual({ status: "loading", signedInHint: true });
			expect(listener).not.toHaveBeenCalled();

			vi.advanceTimersByTime(1);
			expect(getSnapshot()).toEqual({ status: "loading" });
			expect(listener).toHaveBeenCalled();

			// 第二輪：逾時前已回應已登入，逾時不得改變 ready 快照
			resetSessionStoreForTests();
			writeSignedInHint();
			mockedFetchSession.mockReset();
			mockedFetchSession.mockResolvedValue({ authEnabled: true, user: USER });
			subscribe(vi.fn());
			await vi.advanceTimersByTimeAsync(0);
			expect(getSnapshot().status).toBe("ready");

			vi.advanceTimersByTime(10_001);
			expect(getSnapshot()).toEqual({
				status: "ready",
				authEnabled: true,
				user: USER,
			});
		} finally {
			vi.useRealTimers();
		}
	});
});
