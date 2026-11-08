import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	SIGNED_IN_HINT_STORAGE_KEY,
	clearSignedInHint,
	readSignedInHint,
	writeSignedInHint,
} from "./session-hint";

describe("session-hint", () => {
	beforeEach(() => {
		localStorage.clear();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("寫入後讀取為 true 且只存固定值，清除後讀取為 false", () => {
		expect(SIGNED_IN_HINT_STORAGE_KEY).toBe("auth:signed-in-hint:v1");
		expect(readSignedInHint()).toBe(false);

		writeSignedInHint();
		expect(localStorage.getItem("auth:signed-in-hint:v1")).toBe("1");
		expect(localStorage.length).toBe(1);
		expect(readSignedInHint()).toBe(true);

		clearSignedInHint();
		expect(localStorage.getItem("auth:signed-in-hint:v1")).toBeNull();
		expect(readSignedInHint()).toBe(false);
	});

	it("值不是固定值或 localStorage 不可用時讀取為 false 且讀寫清除皆不拋錯", () => {
		for (const value of ["true", "0", "u1"]) {
			localStorage.setItem(SIGNED_IN_HINT_STORAGE_KEY, value);
			expect(readSignedInHint()).toBe(false);
		}

		try {
			vi.spyOn(localStorage, "getItem").mockImplementation(() => {
				throw new Error("unavailable");
			});
			vi.spyOn(localStorage, "setItem").mockImplementation(() => {
				throw new Error("unavailable");
			});
			vi.spyOn(localStorage, "removeItem").mockImplementation(() => {
				throw new Error("unavailable");
			});
			expect(() => readSignedInHint()).not.toThrow();
			expect(() => writeSignedInHint()).not.toThrow();
			expect(() => clearSignedInHint()).not.toThrow();
			expect(readSignedInHint()).toBe(false);
		} finally {
			vi.restoreAllMocks();
		}
	});
});
