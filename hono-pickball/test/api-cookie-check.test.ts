import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import "../src/index";

const URL = "http://localhost/api/cookie-check";

async function call(cookieHeader?: string) {
	const headers = cookieHeader ? { Cookie: cookieHeader } : undefined;
	const response = await exports.default.fetch(new Request(URL, { headers }));
	return {
		setCookie: response.headers.get("set-cookie"),
		body: (await response.json()) as {
			cookieSet: boolean;
			receivedPreviousValue: string | null;
		},
	};
}

// 性質：characterization test。未來 better-auth 依賴 Set-Cookie 能經 service binding
// 原樣穿透回瀏覽器，這裡把該契約的屬性與來回行為釘住。
describe("GET /api/cookie-check — cookie 屬性", () => {
	it("應設定名為 pickball-cookie-check 的 cookie", async () => {
		const { setCookie } = await call();

		expect(setCookie).toContain("pickball-cookie-check=");
	});

	it("Set-Cookie 應含 HttpOnly", async () => {
		const { setCookie } = await call();

		expect(setCookie?.toLowerCase()).toContain("httponly");
	});

	it("Set-Cookie 應含 SameSite=Lax", async () => {
		const { setCookie } = await call();

		expect(setCookie?.toLowerCase()).toContain("samesite=lax");
	});

	it("Set-Cookie 應含 Path=/", async () => {
		const { setCookie } = await call();

		expect(setCookie?.toLowerCase()).toContain("path=/");
	});

	// 刻意不斷言 Secure：現行實作沒設，加上去會讓 http://localhost:3005 的 dev 流程收不到 cookie。
	// 是否要加屬產品決策，不該由測試偷渡。
	// 刻意不斷言 Max-Age / Expires：現行為 session cookie，無需求文件支持。
});

describe("GET /api/cookie-check — cookie 來回穿透", () => {
	function issuedValue(setCookie: string | null): string {
		const match = setCookie?.match(/pickball-cookie-check=([^;]+)/);
		if (!match) throw new Error("Set-Cookie 未包含 pickball-cookie-check");
		return match[1];
	}

	it("未帶 cookie 時 receivedPreviousValue 應為 null 且 cookieSet 為 true", async () => {
		const { body } = await call();

		expect(body.cookieSet).toBe(true);
		expect(body.receivedPreviousValue).toBeNull();
	});

	it("帶著前次 cookie 時 receivedPreviousValue 應等於前次寫入的值", async () => {
		const first = await call();
		const issued = issuedValue(first.setCookie);

		const second = await call(`pickball-cookie-check=${issued}`);

		// setCookie 會對 ISO 字串的 ":" 做 percent-encoding，讀回時已解碼，
		// 因此比對前必須先 decodeURIComponent，否則會誤紅。
		expect(second.body.receivedPreviousValue).toBe(decodeURIComponent(issued));
	});

	it("帶著其他名稱的 cookie 時 receivedPreviousValue 仍為 null", async () => {
		const { body } = await call("some-other-cookie=abc");

		expect(body.receivedPreviousValue).toBeNull();
	});
});
