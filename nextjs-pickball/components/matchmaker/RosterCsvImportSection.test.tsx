// components/matchmaker/RosterCsvImportSection.test.tsx
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { useSession } from "@/hooks/useSession";
import type { UseSessionResult } from "@/hooks/useSession";
import { RosterCsvImportSection } from "./RosterCsvImportSection";
import { LOCAL_FALLBACK_ACTION_LABEL, syncStatusMessage } from "@/lib/sync/sync-status";

vi.mock("@/hooks/useSession", () => ({ useSession: vi.fn() }));

const refresh = vi.fn<() => Promise<void>>();

function mockPendingSession(): void {
	const session: UseSessionResult = { status: "loading", signedInHint: true, hydrated: true, refresh };
	vi.mocked(useSession).mockReturnValue(session);
}

function mockUnavailableSession(): void {
	const session: UseSessionResult = {
		status: "loading",
		signedInHint: true,
		unavailable: true,
		hydrated: true,
		refresh,
	};
	vi.mocked(useSession).mockReturnValue(session);
}

beforeEach(() => {
	localStorage.clear();
	refresh.mockResolvedValue(undefined);
});

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

describe("RosterCsvImportSection", () => {
	it("session 等待中時以等待中提示取代選檔與確認匯入", () => {
		mockPendingSession();

		render(<RosterCsvImportSection />);

		expect(screen.getByRole("heading", { name: "參賽者名單 CSV 匯入" })).not.toBeNull();
		expect(screen.getByRole("status").textContent).toBe("正在載入資料…");
		expect(screen.queryByTestId("roster-csv-import-input")).toBeNull();
		expect(screen.queryByRole("button", { name: "確認匯入" })).toBeNull();
	});

	it("session 無法確認時以無法載入提示與按鈕取代選檔與確認匯入", () => {
		mockUnavailableSession();

		const { container } = render(<RosterCsvImportSection />);

		expect(screen.getByRole("heading", { name: "參賽者名單 CSV 匯入" })).not.toBeNull();
		expect(screen.getByRole("status").textContent).toBe(syncStatusMessage("load-failed"));
		expect(screen.getByRole("button", { name: LOCAL_FALLBACK_ACTION_LABEL })).not.toBeNull();
		expect(container.querySelector('[data-sync-status="unavailable"]')).not.toBeNull();
		expect(screen.queryByTestId("roster-csv-import-input")).toBeNull();
		expect(screen.queryByRole("button", { name: "確認匯入" })).toBeNull();
	});
});
