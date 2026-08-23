import { describe, it, expect } from "vitest";
import { ROSTER_STORAGE_KEY, ROUND_STORAGE_KEY, HISTORY_STORAGE_KEY } from "./storage-keys";

describe("round-storage", () => {
	// 唯一允許出現 key 字面字串的地方——這裡就是在驗證 storage-keys.ts 是否真的
	// 匯出了 spec 要求的那三個值，其餘檔案一律改 import 這三個常數。
	it("三個 LocalStorage key 名稱由 storage-keys 單一來源匯出", () => {
		expect(ROSTER_STORAGE_KEY).toBe("matchmaker:roster:v1");
		expect(ROUND_STORAGE_KEY).toBe("matchmaker:round:v1");
		expect(HISTORY_STORAGE_KEY).toBe("matchmaker:history:v1");
	});
});
