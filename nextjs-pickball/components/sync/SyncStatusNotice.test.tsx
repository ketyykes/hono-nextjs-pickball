import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { SyncStatusNotice } from "./SyncStatusNotice";
import { chooseLocalFallback } from "@/lib/auth/session-store";
import { LOCAL_FALLBACK_ACTION_LABEL, syncStatusMessage } from "@/lib/sync/sync-status";

// 只替換 chooseLocalFallback，其餘匯出沿用真實實作
vi.mock("@/lib/auth/session-store", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/lib/auth/session-store")>()),
	chooseLocalFallback: vi.fn(),
}));

describe("SyncStatusNotice", () => {
	it("pending 顯示正在載入資料，loading 顯示雲端文案，local 不渲染", () => {
		const pending = render(<SyncStatusNotice status="pending" />);
		expect(screen.getByRole("status").textContent).toBe("正在載入資料…");
		pending.unmount();

		const loading = render(<SyncStatusNotice status="loading" />);
		expect(screen.getByRole("status").textContent).toBe("正在載入雲端資料…");
		loading.unmount();

		const local = render(<SyncStatusNotice status="local" />);
		expect(local.container.innerHTML).toBe("");
	});

	it("unavailable 顯示無法載入雲端資料與先用這台裝置的資料按鈕，按下後呼叫 chooseLocalFallback", () => {
		const unavailable = render(<SyncStatusNotice status="unavailable" />);
		const status = screen.getByRole("status");
		expect(status.textContent).toBe(syncStatusMessage("load-failed"));

		const button = screen.getByRole("button", { name: LOCAL_FALLBACK_ACTION_LABEL });
		expect(status.contains(button)).toBe(false);

		fireEvent.click(button);
		expect(chooseLocalFallback).toHaveBeenCalledTimes(1);
		unavailable.unmount();

		for (const other of ["pending", "load-failed"] as const) {
			const rendered = render(<SyncStatusNotice status={other} />);
			expect(screen.queryByRole("button")).toBeNull();
			rendered.unmount();
		}
	});
});
