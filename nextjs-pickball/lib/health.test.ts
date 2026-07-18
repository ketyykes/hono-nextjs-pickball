import { describe, it, expect } from "vitest";
import { checkHonoHealth } from "./health";

// 用假的 Fetcher 注入不同回應，驗證三種分支。
// respond 若 throw，async fetch 會 reject，交由 checkHonoHealth 的 catch 處理。
function fakeBinding(respond: () => Response): Fetcher {
	return { fetch: async () => respond() } as unknown as Fetcher;
}

describe("checkHonoHealth", () => {
	it("回應 200 且 status=ok 時回傳 ok:true 與各欄位", async () => {
		const binding = fakeBinding(
			() =>
				new Response(
					JSON.stringify({
						status: "ok",
						service: "hono-pickball",
						timestamp: "2026-07-18T00:00:00.000Z",
						requestUrl: "https://hono-pickball.internal/api/health",
					}),
					{ status: 200, headers: { "content-type": "application/json" } },
				),
		);

		const result = await checkHonoHealth(binding);

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.service).toBe("hono-pickball");
			expect(result.timestamp).toBe("2026-07-18T00:00:00.000Z");
			expect(result.requestUrl).toBe(
				"https://hono-pickball.internal/api/health",
			);
			expect(typeof result.latencyMs).toBe("number");
			expect(result.latencyMs).toBeGreaterThanOrEqual(0);
		}
	});

	it("非 2xx 狀態碼時回傳 ok:false 與 HTTP 錯誤", async () => {
		const binding = fakeBinding(() => new Response("boom", { status: 500 }));

		const result = await checkHonoHealth(binding);

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toBe("HTTP 500");
		}
	});

	it("binding.fetch 例外時回傳 ok:false 與例外訊息", async () => {
		const binding = fakeBinding(() => {
			throw new Error("no upstream");
		});

		const result = await checkHonoHealth(binding);

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toBe("no upstream");
		}
	});

	it("回應 200 但 status 不為 ok 時回傳 ok:false 與 unexpected status 錯誤", async () => {
		const binding = fakeBinding(
			() =>
				new Response(
					JSON.stringify({
						status: "degraded",
						service: "hono-pickball",
						timestamp: "2026-07-18T00:00:00.000Z",
						requestUrl: "https://hono-pickball.internal/api/health",
					}),
					{ status: 200, headers: { "content-type": "application/json" } },
				),
		);

		const result = await checkHonoHealth(binding);

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toBe("unexpected status: degraded");
		}
	});

	it("回應 200 但 body 不是合法 JSON 時回傳 ok:false 與解析錯誤", async () => {
		const binding = fakeBinding(
			() => new Response("not json", { status: 200 }),
		);

		const result = await checkHonoHealth(binding);

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toBeTruthy();
		}
	});
});
