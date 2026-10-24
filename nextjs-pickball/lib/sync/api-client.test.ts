import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { EXPECTED_USER_ID_HEADER } from "@pickball/core/api/headers";
import { requestJson } from "./api-client";

// 防線：requestJson 若偷讀 session store，這個 mock 會把快照指向使用者 B。
vi.mock("@/lib/auth/session-store", () => ({
	getSnapshot: vi.fn(() => ({
		status: "ready",
		authEnabled: true,
		user: { id: "user-b" },
	})),
	getServerSnapshot: vi.fn(() => ({ status: "loading" })),
	subscribe: vi.fn(() => () => {}),
	refresh: vi.fn(),
}));

const schema = z.object({ n: z.number() });

function stubFetch(impl: () => Promise<Response>) {
	const mock = vi.fn(impl);
	vi.stubGlobal("fetch", mock);
	return mock;
}

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("requestJson", () => {
	it("2xx 且回應符合 schema 時為 ok", async () => {
		stubFetch(async () => jsonResponse({ n: 1 }));
		await expect(requestJson("GET", "/api/x", { schema })).resolves.toEqual({
			kind: "ok",
			value: { n: 1 },
		});

		// value 是 schema 解析後的值：未定義的 key 會被剝除
		stubFetch(async () => jsonResponse({ n: 1, extra: true }));
		await expect(requestJson("GET", "/api/x", { schema })).resolves.toEqual({
			kind: "ok",
			value: { n: 1 },
		});

		// 204 不驗證，value 為 undefined
		stubFetch(async () => new Response(null, { status: 204 }));
		const result = await requestJson("PUT", "/api/x", {
			body: { a: 1 },
			schema,
		});
		expect(result).toEqual({ kind: "ok", value: undefined });
	});

	it("409 為 conflict、401 為 unauthorized", async () => {
		stubFetch(async () => jsonResponse({ error: "x" }, 409));
		await expect(requestJson("GET", "/api/x", { schema })).resolves.toEqual({
			kind: "conflict",
		});

		stubFetch(async () => jsonResponse({ error: "x" }, 401));
		await expect(requestJson("GET", "/api/x", { schema })).resolves.toEqual({
			kind: "unauthorized",
		});
	});

	it("其餘 4xx 為 rejected 並帶狀態碼", async () => {
		for (const status of [400, 404]) {
			stubFetch(async () => jsonResponse({ error: "x" }, status));
			await expect(requestJson("GET", "/api/x", { schema })).resolves.toEqual({
				kind: "rejected",
				status,
			});
		}
	});

	it("5xx、網路錯誤或回應不符 schema 時為 failed 且不 throw", async () => {
		const failures: Array<() => Promise<Response>> = [
			async () => jsonResponse({ error: "x" }, 500),
			async () => {
				throw new TypeError("network down");
			},
			async () =>
				new Response("not json", {
					status: 200,
					headers: { "Content-Type": "text/plain" },
				}),
			async () => jsonResponse({ n: "not a number" }),
		];

		for (const failure of failures) {
			stubFetch(failure);
			await expect(requestJson("GET", "/api/x", { schema })).resolves.toEqual({
				kind: "failed",
			});
		}
	});

	it("GET 帶 keepalive，有 body 時帶 JSON content-type，皆為 same-origin 憑證", async () => {
		const getMock = stubFetch(async () => jsonResponse({ n: 1 }));
		await requestJson("GET", "/api/x", { schema });
		const [getUrl, getInit] = getMock.mock.calls[0] as unknown as [
			string,
			RequestInit,
		];
		expect(getUrl).toBe("/api/x");
		expect(getInit.method).toBe("GET");
		expect(getInit.keepalive).toBe(true);
		expect(getInit.credentials).toBe("same-origin");
		expect(getInit.body).toBeUndefined();

		const putMock = stubFetch(async () => jsonResponse({ n: 1 }));
		await requestJson("PUT", "/api/x", { body: { a: 1 }, schema });
		const [, putInit] = putMock.mock.calls[0] as unknown as [string, RequestInit];
		expect(putInit.method).toBe("PUT");
		expect(putInit.credentials).toBe("same-origin");
		expect(putInit.body).toBe(JSON.stringify({ a: 1 }));
		expect(new Headers(putInit.headers).get("Content-Type")).toBe(
			"application/json",
		);
		// body 可能很大，keepalive 有 64 KiB 上限，PUT 不得帶
		expect(putInit.keepalive).not.toBe(true);
	});
	it("每個請求帶 X-Expected-User-Id 標頭，有 body 時與 Content-Type 並存", async () => {
		const getMock = stubFetch(async () => jsonResponse({ n: 1 }));
		await requestJson("GET", "/api/x", { schema, expectedUserId: "user-a" });
		const [, getInit] = getMock.mock.calls[0] as unknown as [string, RequestInit];
		expect(new Headers(getInit.headers).get(EXPECTED_USER_ID_HEADER)).toBe("user-a");

		const putMock = stubFetch(async () => jsonResponse({ n: 1 }));
		await requestJson("PUT", "/api/x", {
			body: { a: 1 },
			schema,
			expectedUserId: "user-a",
		});
		const [, putInit] = putMock.mock.calls[0] as unknown as [string, RequestInit];
		const putHeaders = new Headers(putInit.headers);
		expect(putHeaders.get(EXPECTED_USER_ID_HEADER)).toBe("user-a");
		expect(putHeaders.get("Content-Type")).toBe("application/json");
	});

	it("requestJson 只使用呼叫端給的 expectedUserId，不讀 session store", async () => {
		const mock = stubFetch(async () => jsonResponse({ n: 1 }));
		await requestJson("GET", "/api/x", { schema, expectedUserId: "user-a" });
		const [, init] = mock.mock.calls[0] as unknown as [string, RequestInit];
		expect(new Headers(init.headers).get(EXPECTED_USER_ID_HEADER)).toBe("user-a");
	});

	// regression guard：既有 401 分類不看 body，本測試在實作前就會綠
	it("401 ACCOUNT_MISMATCH 同樣分類為 unauthorized", async () => {
		stubFetch(async () => jsonResponse({ error: "ACCOUNT_MISMATCH" }, 401));
		await expect(
			requestJson("GET", "/api/x", { schema, expectedUserId: "user-a" }),
		).resolves.toEqual({ kind: "unauthorized" });
	});
});
