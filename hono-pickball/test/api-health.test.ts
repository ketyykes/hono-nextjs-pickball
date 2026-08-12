import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import "../src/index";

// 性質：characterization test。端點早已實作且行為正確，
// 這裡是把「前端 lib/health.ts 依賴的回應形狀」釘住，避免日後改壞而無人察覺。
describe("GET /api/health", () => {
	async function fetchHealth(url = "http://localhost/api/health") {
		const response = await exports.default.fetch(new Request(url));
		return { response, body: (await response.json()) as Record<string, unknown> };
	}

	it("應回傳 HTTP 200 與 application/json", async () => {
		const { response } = await fetchHealth();

		expect(response.status).toBe(200);
		expect(response.headers.get("content-type")).toContain("application/json");
	});

	it("status 應為 ok", async () => {
		const { body } = await fetchHealth();

		expect(body.status).toBe("ok");
	});

	it("service 應為 hono-pickball", async () => {
		const { body } = await fetchHealth();

		expect(body.service).toBe("hono-pickball");
	});

	it("timestamp 應為可被 Date 解析的 ISO 8601 字串", async () => {
		const { body } = await fetchHealth();

		expect(typeof body.timestamp).toBe("string");
		// 不對固定字串做快照——時間每次都不同，只驗可解析性。
		expect(Number.isNaN(Date.parse(body.timestamp as string))).toBe(false);
	});

	it("requestUrl 應原樣反映請求的 URL 而未被改寫", async () => {
		const url = "http://localhost/api/health?probe=1";
		const { body } = await fetchHealth(url);

		// 這是 service binding 轉發時 host 未被改寫的證據來源。
		expect(body.requestUrl).toBe(url);
	});
});
