import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { jsonBodyLimit } from "../src/http/body-limit";

const LIMIT = 16;

/** 只掛共用 body 上限 middleware 的測試 app；calls 記錄下一層是否被執行。 */
function makeApp(): { app: Hono; calls: { count: number } } {
	const calls = { count: 0 };
	const app = new Hono().post("/", jsonBodyLimit(LIMIT), (c) => {
		calls.count += 1;
		return c.json({ ok: true });
	});
	return { app, calls };
}

function streamOf(text: string): ReadableStream<Uint8Array> {
	const bytes = new TextEncoder().encode(text);
	return new ReadableStream({
		start(controller) {
			controller.enqueue(bytes);
			controller.close();
		},
	});
}

describe("jsonBodyLimit", () => {
	it("共用 body 上限 middleware 超過上限時回 413 PAYLOAD_TOO_LARGE 且不執行下一層", async () => {
		const atLimit = "a".repeat(LIMIT);
		const overLimit = "a".repeat(LIMIT + 1);

		// 恰等於上限：交給下一層
		const okCase = makeApp();
		const ok = await okCase.app.request("/", { method: "POST", body: atLimit, headers: { "Content-Length": String(LIMIT) } });
		expect(ok.status).toBe(200);
		expect(okCase.calls.count).toBe(1);

		// 字串 body 在 workerd 內不會自動帶 Content-Length，所以明確設定才會走標頭分支
		const withHeader = makeApp();
		const headerRes = await withHeader.app.request("/", {
			method: "POST",
			body: overLimit,
			headers: { "Content-Length": String(LIMIT + 1) },
		});
		expect(headerRes.status).toBe(413);
		expect(await headerRes.json()).toEqual({ error: "PAYLOAD_TOO_LARGE" });
		expect(withHeader.calls.count).toBe(0);

		// 串流 body 沒有 Content-Length，走逐 chunk 計數分支
		const streaming = makeApp();
		const streamRes = await streaming.app.request("/", {
			method: "POST",
			body: streamOf(overLimit),
			duplex: "half",
		} as RequestInit);
		expect(streamRes.status).toBe(413);
		expect(await streamRes.json()).toEqual({ error: "PAYLOAD_TOO_LARGE" });
		expect(streaming.calls.count).toBe(0);

		// 串流且未超過上限：重建後的 request 仍交給下一層
		const streamingOk = makeApp();
		const streamOkRes = await streamingOk.app.request("/", {
			method: "POST",
			body: streamOf(atLimit),
			duplex: "half",
		} as RequestInit);
		expect(streamOkRes.status).toBe(200);
		expect(streamingOk.calls.count).toBe(1);
	});
});
