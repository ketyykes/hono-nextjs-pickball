import { describe, expect, it } from "vitest";
import type { SessionSnapshot } from "@/lib/auth/session-store";
import { pendingDataStatus, resolveStorageMode } from "./storage-mode";

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

	it("session 載入中且帶上次登入提示時為 pending", () => {
		const hinted: SessionSnapshot = { status: "loading", signedInHint: true };
		const plain: SessionSnapshot = { status: "loading" };
		// 提示只在 loading 時有作用：型別上不會出現，這裡硬塞以鎖住行為
		const disabledWithHint = {
			status: "ready",
			authEnabled: false,
			user: null,
			signedInHint: true,
		} as unknown as SessionSnapshot;
		const guestWithHint = {
			status: "ready",
			authEnabled: true,
			user: null,
			signedInHint: true,
		} as unknown as SessionSnapshot;
		const signedInWithHint = {
			status: "ready",
			authEnabled: true,
			user: USER,
			signedInHint: true,
		} as unknown as SessionSnapshot;

		expect(resolveStorageMode(hinted)).toBe("pending");
		expect(resolveStorageMode(plain)).toBe("local");
		expect(resolveStorageMode(disabledWithHint)).toBe("local");
		expect(resolveStorageMode(guestWithHint)).toBe("local");
		expect(resolveStorageMode(signedInWithHint)).toBe("remote");
	});

	it("尚未 hydration 的 loading 快照為 pending，hydration 後無提示時為 local", () => {
		expect(resolveStorageMode({ status: "loading", hydrated: false })).toBe(
			"pending",
		);
		expect(resolveStorageMode({ status: "loading", hydrated: true })).toBe(
			"local",
		);
		expect(
			resolveStorageMode({
				status: "ready",
				authEnabled: true,
				user: USER,
				hydrated: false,
			}),
		).toBe("remote");
	});

	it("本機備援的 loading 快照為 local，無法確認的 loading 快照為 pending", () => {
		const localFallback: SessionSnapshot = {
			status: "loading",
			localFallback: true,
		};
		const unavailable: SessionSnapshot = {
			status: "loading",
			signedInHint: true,
			unavailable: true,
		};

		expect(resolveStorageMode(localFallback)).toBe("local");
		expect(resolveStorageMode({ ...localFallback, hydrated: true })).toBe(
			"local",
		);
		expect(resolveStorageMode(unavailable)).toBe("pending");
		expect(resolveStorageMode({ ...unavailable, hydrated: true })).toBe(
			"pending",
		);
	});
});

describe("pendingDataStatus", () => {
	it("pendingDataStatus 在無法確認時為 unavailable，其餘為 pending", () => {
		const unavailable: SessionSnapshot = {
			status: "loading",
			signedInHint: true,
			unavailable: true,
		};
		const others: SessionSnapshot[] = [
			{ status: "loading", signedInHint: true },
			{ status: "loading" },
			{ status: "loading", localFallback: true },
			{ status: "ready", authEnabled: false, user: null },
			{ status: "ready", authEnabled: true, user: null },
			{ status: "ready", authEnabled: true, user: USER },
		];

		expect(pendingDataStatus(unavailable)).toBe("unavailable");
		for (const snapshot of others) {
			expect(pendingDataStatus(snapshot)).toBe("pending");
		}
	});
});
