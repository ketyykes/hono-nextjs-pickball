import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchSession, signInWithEmail, signOut } from "./session-client";

const DISABLED = { authEnabled: false, user: null };
const USER = { id: "u1", email: "a@example.com", name: "A" };

function stubFetch(impl: () => Promise<Response>) {
	const mock = vi.fn(impl);
	vi.stubGlobal("fetch", mock);
	return mock;
}

function jsonResponse(body: unknown, status = 200) {
	return new Response(JSON.stringify(body), { status });
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("fetchSession", () => {
	it("fetchSession 於 200 且形狀正確時回傳 authEnabled 與 user", async () => {
		const mock = stubFetch(async () =>
			jsonResponse({ authEnabled: true, user: USER }),
		);
		await expect(fetchSession()).resolves.toEqual({
			authEnabled: true,
			user: USER,
		});
		expect(mock).toHaveBeenCalledTimes(1);
		expect((mock.mock.calls[0] as unknown[])[0]).toBe("/api/session");
		// 未傳 init 時 fetch 預設為 GET；明確斷言是為了擋住日後誤加其他 method
		const init = (mock.mock.calls[0] as unknown[])[1] as RequestInit | undefined;
		expect(init?.method ?? "GET").toBe("GET");

		stubFetch(async () => jsonResponse({ authEnabled: true, user: null }));
		await expect(fetchSession()).resolves.toEqual({
			authEnabled: true,
			user: null,
		});

		stubFetch(async () => jsonResponse({ authEnabled: false, user: null }));
		await expect(fetchSession()).resolves.toEqual(DISABLED);
	});

	it("fetchSession 於非 200、形狀不符或網路錯誤時回傳未啟用且不拋錯", async () => {
		const failures: Array<() => Promise<Response>> = [
			// 非 200：即使 body 形狀正確也不採信
			async () =>
				jsonResponse({ authEnabled: true, user: USER }, 500),
			async () =>
				jsonResponse({ authEnabled: true, user: USER }, 404),
			// JSON 解析失敗
			async () => new Response("not json", { status: 200 }),
			// 根層形狀
			async () => jsonResponse(null),
			async () => jsonResponse("yes"),
			// authEnabled 型別
			async () => jsonResponse({ authEnabled: "yes", user: null }),
			async () => jsonResponse({ user: null }),
			// user 形狀
			async () => jsonResponse({ authEnabled: true }),
			async () => jsonResponse({ authEnabled: true, user: "u1" }),
			async () =>
				jsonResponse({ authEnabled: true, user: { ...USER, id: 1 } }),
			async () =>
				jsonResponse({ authEnabled: true, user: { ...USER, email: null } }),
			async () =>
				jsonResponse({ authEnabled: true, user: { ...USER, name: 5 } }),
			async () =>
				jsonResponse({
					authEnabled: true,
					user: { id: "u1", name: "A" },
				}),
			async () =>
				jsonResponse({
					authEnabled: true,
					user: { id: "u1", email: "a@example.com" },
				}),
			async () =>
				jsonResponse({
					authEnabled: true,
					user: { email: "a@example.com", name: "A" },
				}),
			// 網路錯誤
			async () => {
				throw new TypeError("network down");
			},
		];

		for (const failure of failures) {
			stubFetch(failure);
			await expect(fetchSession()).resolves.toEqual(DISABLED);
		}
	});

	// 整頁導覽開始後才發出的一般 fetch 會被 WebKit 擋下並記成 console 錯誤；
	// keepalive 請求不受導覽影響，訪客換頁時才不會多出錯誤訊息。
	it("fetchSession 以 keepalive 發出請求", async () => {
		const mock = stubFetch(async () =>
			jsonResponse({ authEnabled: true, user: null }),
		);
		await fetchSession();
		const init = (mock.mock.calls[0] as unknown[])[1] as RequestInit | undefined;
		expect(init?.keepalive).toBe(true);
	});
});

describe("signInWithEmail", () => {
	it("signInWithEmail 以 JSON POST 至 /api/auth/sign-in/email", async () => {
		const mock = stubFetch(async () => new Response("{}", { status: 200 }));
		await signInWithEmail("a@example.com", "pw");

		expect(mock).toHaveBeenCalledTimes(1);
		const [url, init] = mock.mock.calls[0] as unknown as [string, RequestInit];
		expect(url).toBe("/api/auth/sign-in/email");
		expect(init.method).toBe("POST");
		expect(new Headers(init.headers).get("Content-Type")).toBe(
			"application/json",
		);
		expect(JSON.parse(init.body as string)).toEqual({
			email: "a@example.com",
			password: "pw",
		});
	});

	it("signInWithEmail 依狀態碼回傳 ok、invalid-credentials、unavailable 或 failed", async () => {
		const cases: Array<[number | "reject", unknown]> = [
			[200, { ok: true }],
			[401, { ok: false, reason: "invalid-credentials" }],
			[404, { ok: false, reason: "unavailable" }],
			[500, { ok: false, reason: "failed" }],
			[403, { ok: false, reason: "failed" }],
			["reject", { ok: false, reason: "failed" }],
		];

		for (const [status, expected] of cases) {
			stubFetch(async () => {
				if (status === "reject") throw new TypeError("network down");
				return new Response("{}", { status });
			});
			await expect(signInWithEmail("a@example.com", "pw")).resolves.toEqual(
				expected,
			);
		}
	});
});

describe("signOut", () => {
	it("signOut 以 POST 呼叫 /api/auth/sign-out 並回傳是否成功", async () => {
		const ok = stubFetch(async () => new Response("{}", { status: 200 }));
		await expect(signOut()).resolves.toBe(true);
		expect(ok).toHaveBeenCalledTimes(1);
		const [url, init] = ok.mock.calls[0] as unknown as [string, RequestInit];
		expect(url).toBe("/api/auth/sign-out");
		expect(init.method).toBe("POST");
		expect(new Headers(init.headers).get("Content-Type")).toBe(
			"application/json",
		);
		expect(JSON.parse(init.body as string)).toEqual({});

		stubFetch(async () => new Response(null, { status: 204 }));
		await expect(signOut()).resolves.toBe(true);

		stubFetch(async () => new Response("{}", { status: 500 }));
		await expect(signOut()).resolves.toBe(false);

		stubFetch(async () => new Response("{}", { status: 401 }));
		await expect(signOut()).resolves.toBe(false);

		stubFetch(async () => {
			throw new TypeError("network down");
		});
		await expect(signOut()).resolves.toBe(false);
	});
});
