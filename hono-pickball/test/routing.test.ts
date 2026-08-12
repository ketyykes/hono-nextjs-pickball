import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import "../src/index";

async function get(path: string): Promise<Response> {
	return exports.default.fetch(new Request(`http://localhost${path}`));
}

// 對外 API 一律掛在 /api/* 之下（前端 catch-all proxy 只轉發 /api/*）。
// root path 回 404 是刻意行為，不代表部署失敗。
describe("路由掛載約定", () => {
	it("GET / 應回傳 404（對外路由一律掛在 /api/* 之下）", async () => {
		const response = await get("/");

		expect(response.status).toBe(404);
	});

	it("未定義的 /api/* 路徑應回傳 404", async () => {
		const response = await get("/api/does-not-exist");

		expect(response.status).toBe(404);
	});
});
