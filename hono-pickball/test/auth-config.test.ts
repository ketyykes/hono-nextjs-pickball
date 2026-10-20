import { describe, expect, it } from "vitest";
import "../src/index";
import { isLocalAuthEnabled } from "../src/auth/local-auth";

describe("isLocalAuthEnabled", () => {
	it("isLocalAuthEnabled 只在 ENVIRONMENT 恰為 development 時為真", () => {
		// 反向設計：缺值、空字串、大小寫不同都必須視為停用
		expect(isLocalAuthEnabled({ ENVIRONMENT: undefined })).toBe(false);
		expect(isLocalAuthEnabled({ ENVIRONMENT: "" })).toBe(false);
		expect(isLocalAuthEnabled({ ENVIRONMENT: "production" })).toBe(false);
		expect(isLocalAuthEnabled({ ENVIRONMENT: "Development" })).toBe(false);
		expect(isLocalAuthEnabled({ ENVIRONMENT: "development" })).toBe(true);
	});
});
