import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { requireSession, type AuthAppEnv, type SessionAppEnv } from "../src/auth/require-session";

// 型別測試：由 `pnpm --filter ./hono-pickball typecheck` 驗證（vitest 不檢查型別）。
// 鎖住「未經 requireSession 的 handler 讀 c.var.user 是型別錯誤」，避免漏掛授權 middleware 時 tsc 無感。

export const withoutGuard = new Hono<AuthAppEnv>().get("/", (c) => {
	// @ts-expect-error 未掛 requireSession，c.var 沒有 user
	return c.json({ id: c.var.user.id });
});

export const withGuard = new Hono<SessionAppEnv>().use("*", requireSession).get("/", (c) => {
	return c.json({ id: c.var.user.id });
});

describe("auth 型別測試", () => {
	it("auth 型別測試檔可載入", () => {
		expect(withoutGuard).toBeDefined();
		expect(withGuard).toBeDefined();
	});
});
