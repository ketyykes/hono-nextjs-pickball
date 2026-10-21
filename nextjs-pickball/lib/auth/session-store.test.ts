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

	// WebKit 會把「導覽開始（beforeunload）後才發出」的 fetch 擋下並記成 console 錯誤，
	// 整頁導覽太快、hydration 晚於 beforeunload 時就會發生。
	describe("頁面即將離開時", () => {
		function pageshow(persisted: boolean): Event {
			return Object.assign(new Event("pageshow"), { persisted });
		}

		it("beforeunload 之後才發生的第一次訂閱不發請求，快照維持 loading 且不通知", async () => {
			const listener = vi.fn();
			window.dispatchEvent(new Event("beforeunload"));

			subscribe(listener);
			await Promise.resolve();
			await Promise.resolve();

			expect(mockedFetchSession).not.toHaveBeenCalled();
			expect(getSnapshot()).toEqual({ status: "loading" });
			expect(listener).not.toHaveBeenCalled();
		});

		it("beforeunload 之後的 refresh 不發請求且仍會 resolve", async () => {
			window.dispatchEvent(new Event("beforeunload"));

			await expect(refresh()).resolves.toBeUndefined();
			expect(mockedFetchSession).not.toHaveBeenCalled();
		});

		it("略過請求後頁面自 bfcache 還原時補發請求並轉為 ready", async () => {
			const listener = vi.fn();
			window.dispatchEvent(new Event("beforeunload"));
			subscribe(listener);
			expect(mockedFetchSession).not.toHaveBeenCalled();

			window.dispatchEvent(pageshow(true));

			expect(mockedFetchSession).toHaveBeenCalledTimes(1);
			await vi.waitFor(() => {
				expect(getSnapshot()).toEqual({
					status: "ready",
					authEnabled: true,
					user: null,
				});
			});
			expect(listener).toHaveBeenCalled();
		});

		it("非 bfcache 還原的 pageshow 不補發請求", () => {
			window.dispatchEvent(new Event("beforeunload"));
			subscribe(vi.fn());

			window.dispatchEvent(pageshow(false));

			expect(mockedFetchSession).not.toHaveBeenCalled();
		});

		it("初始請求已發出後不再理會 beforeunload，之後的 refresh 照常請求", async () => {
			subscribe(vi.fn());
			await vi.waitFor(() => {
				expect(getSnapshot().status).toBe("ready");
			});

			window.dispatchEvent(new Event("beforeunload"));
			await refresh();

			expect(mockedFetchSession).toHaveBeenCalledTimes(2);
		});

		it("初始請求已發出後移除 beforeunload 監聽（Firefox 有此監聽的頁面不進 bfcache）", () => {
			const removeSpy = vi.spyOn(window, "removeEventListener");
			subscribe(vi.fn());

			expect(removeSpy).toHaveBeenCalledWith("beforeunload", expect.any(Function));
			removeSpy.mockRestore();
		});
	});
});
