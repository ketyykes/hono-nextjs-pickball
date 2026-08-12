// @vitest-environment node
// 與 workerd runtime 的語義對齊（stream body + duplex）；happy-dom 也能通過，
// 但 node 環境更貼近實際執行環境，且不會觸發 tests/setup.ts 的 DOM cleanup。

import { describe, it, expect, vi, beforeEach } from "vitest";

const fetchSpy = vi.fn(
	async () => new Response("upstream", { status: 200, statusText: "OK" }),
);

vi.mock("@opennextjs/cloudflare", () => ({
	getCloudflareContext: () => ({ env: { HONO_API: { fetch: fetchSpy } } }),
}));

import {
	GET,
	POST,
	PUT,
	PATCH,
	DELETE,
	OPTIONS,
	HEAD,
} from "./route";

type FetchInit = Record<string, unknown>;

function lastCall(): { input: unknown; init: FetchInit } {
	const call = fetchSpy.mock.calls.at(-1) as unknown as [unknown, FetchInit];
	return { input: call[0], init: call[1] };
}

// 性質：regression guard。proxy 早已實作且行為正確，這裡把「不能改」的三件事釘住：
// 不傳 Request 實例、GET/HEAD 不帶 body 與 duplex、回傳為本 realm 重建的 Response。
describe("/api/* service binding proxy", () => {
	beforeEach(() => {
		fetchSpy.mockClear();
	});

	it("GET 請求不帶 body 也不帶 duplex", async () => {
		await GET(new Request("https://example.com/api/health"));

		const { init } = lastCall();
		// route.ts 是 `body: hasBody ? request.body : undefined`——key 存在但值為 undefined，
		// 因此不能用 not.toHaveProperty("body")，那會誤紅。
		expect(init.body).toBeUndefined();
		expect("duplex" in init).toBe(false);
	});

	it("HEAD 請求不帶 body 也不帶 duplex", async () => {
		await HEAD(new Request("https://example.com/api/health", { method: "HEAD" }));

		const { init } = lastCall();
		expect(init.body).toBeUndefined();
		expect("duplex" in init).toBe(false);
	});

	it("POST 請求帶 request.body 與 duplex: half", async () => {
		await POST(
			new Request("https://example.com/api/thing", {
				method: "POST",
				body: JSON.stringify({ a: 1 }),
			}),
		);

		const { init } = lastCall();
		expect(init.body).toBeDefined();
		expect(init.duplex).toBe("half");
	});

	it("PUT / PATCH / DELETE 皆走同一 proxy handler", async () => {
		expect(PUT).toBe(POST);
		expect(PATCH).toBe(POST);
		expect(DELETE).toBe(POST);
		expect(OPTIONS).toBe(POST);
		expect(GET).toBe(POST);
	});

	it("轉發時第一參數為原始 request.url，host 與 query string 不被改寫", async () => {
		const url = "https://example.com/api/health?probe=1";
		await GET(new Request(url));

		const { input } = lastCall();
		// 必須是 URL 字串而非 Request 實例：next dev 下 miniflare proxy 會把跨 realm
		// 的 Request 字串化成「[object Request]」而拋 Invalid URL。
		expect(typeof input).toBe("string");
		expect(input).toBe(url);
	});

	it("轉發時保留原始 method 與 headers", async () => {
		await POST(
			new Request("https://example.com/api/thing", {
				method: "POST",
				headers: { "x-probe": "1" },
				body: "{}",
			}),
		);

		const { init } = lastCall();
		expect(init.method).toBe("POST");
		expect((init.headers as Headers).get("x-probe")).toBe("1");
	});

	it("回傳的 Response 為新實例且保留 status / statusText / body", async () => {
		const upstream = new Response("payload", {
			status: 201,
			statusText: "Created",
			headers: { "x-upstream": "yes" },
		});
		fetchSpy.mockResolvedValueOnce(upstream);

		const response = await GET(new Request("https://example.com/api/thing"));

		expect(response).not.toBe(upstream);
		expect(response.status).toBe(201);
		expect(response.statusText).toBe("Created");
		expect(response.headers.get("x-upstream")).toBe("yes");
		expect(await response.text()).toBe("payload");
	});
});
