import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
// 官方要求：import main 模組，src/ 改動時測試才會自動重跑。
import "../src/index";

// 工具鏈冒煙測試：確認測試確實跑在 workerd runtime 中，且能取得 Hono app 的回應。
// 用 exports.default.fetch()，不要用 SELF / env —— 兩者在
// @cloudflare/vitest-pool-workers/types 的 cloudflare-test.d.ts 皆已標 @deprecated。
describe("測試工具鏈", () => {
	it("可在 workerd runtime 中執行並存取 Hono worker", () => {
		expect(typeof exports.default.fetch).toBe("function");
	});

	it("exports.default.fetch 能取得 Hono app 的回應", async () => {
		const response = await exports.default.fetch(
			new Request("http://localhost/api/health"),
		);

		expect(response.status).toBe(200);
	});
});
