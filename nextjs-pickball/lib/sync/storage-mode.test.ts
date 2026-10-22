import { describe, expect, it } from "vitest";
import type { SessionSnapshot } from "@/lib/auth/session-store";
import { resolveStorageMode } from "./storage-mode";

const USER = { id: "u1", email: "a@example.com", name: "A" };

describe("resolveStorageMode", () => {
	it("只有 session 就緒、auth 啟用且有 user 時為 remote", () => {
		const loading: SessionSnapshot = { status: "loading" };
		const disabled: SessionSnapshot = {
			status: "ready",
			authEnabled: false,
			user: null,
		};
		const guest: SessionSnapshot = {
			status: "ready",
			authEnabled: true,
			user: null,
		};
		const signedIn: SessionSnapshot = {
			status: "ready",
			authEnabled: true,
			user: USER,
		};
		// 停用 auth 卻帶 user 的不一致快照也不可走雲端
		const disabledWithUser: SessionSnapshot = {
			status: "ready",
			authEnabled: false,
			user: USER,
		};

		// 載入中即使（不應出現地）帶著啟用與 user，也必須是本機
		const loadingWithFields = {
			status: "loading",
			authEnabled: true,
			user: USER,
		} as unknown as SessionSnapshot;

		expect(resolveStorageMode(loading)).toBe("local");
		expect(resolveStorageMode(loadingWithFields)).toBe("local");
		expect(resolveStorageMode(disabled)).toBe("local");
		expect(resolveStorageMode(guest)).toBe("local");
		expect(resolveStorageMode(disabledWithUser)).toBe("local");
		expect(resolveStorageMode(signedIn)).toBe("remote");
	});
});
