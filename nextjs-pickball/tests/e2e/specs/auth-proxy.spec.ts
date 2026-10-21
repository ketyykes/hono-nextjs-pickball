import { test, expect } from "@playwright/test";
import {
	ensureTestAccountSeeded,
	readTestAccountResult,
} from "../helpers/test-account";

// 驗證 better-auth 的 session cookie 經 Next.js proxy → service binding → Hono 原樣穿透。
// 只用 request fixture、不開頁面；通路與瀏覽器無關，只需在 chromium 執行一次。
// mobile-chrome 的 browserName 也是 chromium，需另行排除，否則多個 worker 會並行 seed 互相干擾。
// 依賴 hono-pickball/.dev.vars 的測試帳密與本機 D1。
test.describe("auth proxy 穿透", () => {
	// serial 讓兩條 test 同一 worker，beforeAll 只 seed 一次（seed 會重建 user，並行會讓 session 失效）
	test.describe.configure({ mode: "serial" });

	test.skip(
		({ browserName, isMobile }) => browserName !== "chromium" || isMobile,
		"auth 通路測試只需在 chromium 執行一次",
	);

	const accountResult = readTestAccountResult();

	test.beforeAll(() => {
		if (accountResult.ok) {
			ensureTestAccountSeeded();
		}
	});

	test("經 proxy 登入後 session cookie 落在前端 origin 並可取得 /api/me", async ({
		request,
	}) => {
		// 缺帳密一律 skip 並寫明缺哪個變數，不得靜默通過
		test.skip(
			!accountResult.ok,
			`.dev.vars 缺少：${accountResult.ok ? "" : accountResult.missing.join(", ")}`,
		);
		if (!accountResult.ok) return;
		const { account } = accountResult;

		const signIn = await request.post("/api/auth/sign-in/email", {
			// better-auth 會檢查 Origin，不帶時經 proxy 會回 403；此 header 模擬瀏覽器同源請求，
			// 並驗證 proxy 原樣轉發 Origin
			headers: { Origin: "http://localhost:3005" },
			data: { email: account.email, password: account.password },
		});
		expect(signIn.status()).toBe(200);

		const setCookies = signIn
			.headersArray()
			.filter((header) => header.name.toLowerCase() === "set-cookie")
			.map((header) => header.value);
		const sessionCookie = setCookies.find((value) =>
			value.includes("better-auth.session_token="),
		);
		expect(sessionCookie).toBeDefined();
		expect(sessionCookie).toContain("HttpOnly");

		// 同一 request context 會保存 cookie，/api/me 能取得本人代表 cookie 落在前端 origin
		const me = await request.get("/api/me");
		expect(me.status()).toBe(200);
		const body = await me.json();
		expect(
			body.user.email === account.email,
			"user.email 與測試帳號不符",
		).toBe(true);
	});

	test("經 proxy 呼叫 /api/session 未登入時回 200 與 user null", async ({
		playwright,
	}) => {
		// 全新 context 確保沒有任何 cookie
		const anonymous = await playwright.request.newContext({
			baseURL: "http://localhost:3005",
		});
		try {
			const res = await anonymous.get("/api/session");
			expect(res.status()).toBe(200);
			const body = await res.json();
			expect(typeof body.authEnabled).toBe("boolean");
			expect(body.user).toBeNull();
		} finally {
			await anonymous.dispose();
		}
	});
});
