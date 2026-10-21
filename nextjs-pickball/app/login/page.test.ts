import { describe, it, expect } from "vitest";
import { metadata } from "./page";

// 此檔只驗模組層的 metadata 匯出；表單行為在 LoginForm.test.tsx。
describe("/login 路由設定", () => {
	it("/login 匯出 metadata 且 robots.index 為 false", () => {
		expect(metadata).toBeDefined();
		expect(metadata.robots).toMatchObject({ index: false });
		expect(typeof metadata.title).toBe("string");
		expect((metadata.title as string).length).toBeGreaterThan(0);
	});
});
