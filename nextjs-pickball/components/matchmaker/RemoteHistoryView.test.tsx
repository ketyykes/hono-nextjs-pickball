// components/matchmaker/RemoteHistoryView.test.tsx
import { afterEach, describe, it, expect, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { MatchHistoryEntry } from "@pickball/core/matchmaker/history";
import { useRemoteHistory } from "@/hooks/useRemoteHistory";
import type { UseRemoteHistoryResult } from "@/hooks/useRemoteHistory";
import { useSession } from "@/hooks/useSession";
import { RemoteHistoryView } from "./RemoteHistoryView";

vi.mock("@/hooks/useRemoteHistory", () => ({ useRemoteHistory: vi.fn() }));
vi.mock("@/hooks/useSession", () => ({ useSession: vi.fn() }));

function buildEntry(matchId: string): MatchHistoryEntry {
	return {
		matchId,
		courtNumber: 1,
		playedAt: "2026-03-18T01:00:00.000Z",
		format: "singles",
		teamA: { players: [{ id: "p1", name: "甲", ratingBefore: 3, ratingAfter: 3.1 }], rating: 3 },
		teamB: { players: [{ id: "p2", name: "乙", ratingBefore: 3, ratingAfter: 2.9 }], rating: 3 },
		scoreA: 11,
		scoreB: 7,
		winner: "teamA",
	};
}

function mockHistory(overrides: Partial<UseRemoteHistoryResult> = {}): void {
	vi.mocked(useRemoteHistory).mockReturnValue({
		items: [],
		total: 0,
		droppedCount: 0,
		syncStatus: "synced",
		...overrides,
	});
}

function mockReadySession(): void {
	vi.mocked(useSession).mockReturnValue({
		status: "ready",
		authEnabled: true,
		user: { id: "user-a", email: "a@example.com", name: "A" },
		refresh: vi.fn(),
	});
}

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

describe("RemoteHistoryView", () => {
	it("雲端回應的 droppedCount 大於 0 時顯示與本機相同的損毀提示", () => {
		mockReadySession();
		mockHistory({ items: [{ data: buildEntry("m1"), version: 1 }], total: 3, droppedCount: 2 });

		const { rerender } = render(<RemoteHistoryView />);

		// 文案須與本機 HistoryView 逐字相同；合法的那一筆仍照常顯示
		const alert = screen.getByRole("alert");
		expect(alert.textContent).toBe("有 2 筆損毀的歷史紀錄已略過，其餘歷史紀錄不受影響。");
		expect(screen.getByTestId("history-record-m1")).not.toBeNull();

		// droppedCount 為 0 時不得出現任何損毀提示
		mockHistory({ items: [{ data: buildEntry("m1"), version: 1 }], total: 3, droppedCount: 0 });
		rerender(<RemoteHistoryView />);
		expect(screen.queryByRole("alert")).toBeNull();
		expect(screen.getByTestId("history-record-m1")).not.toBeNull();
	});

	it("total 為 0 時顯示引導型空狀態，否則顯示區間空狀態", async () => {
		const user = userEvent.setup();
		mockReadySession();
		mockHistory({ items: [], total: 0 });

		const { rerender } = render(<RemoteHistoryView />);

		// 雲端完全沒有紀錄：引導型空狀態，而非區間空狀態
		expect(screen.getByTestId("empty-history")).not.toBeNull();
		expect(screen.queryByTestId("empty-history-range")).toBeNull();

		// 有紀錄但目前區間為空：預設區間為今日
		mockHistory({ items: [], total: 5 });
		rerender(<RemoteHistoryView />);
		expect(screen.queryByTestId("empty-history")).toBeNull();
		expect(screen.getByTestId("empty-history-range").textContent).toBe("今日目前沒有任何對戰紀錄。");

		// 切到本月後，空狀態文案跟著區間走
		await user.click(screen.getByRole("radio", { name: "本月" }));
		expect(screen.queryByTestId("empty-history")).toBeNull();
		expect(screen.getByTestId("empty-history-range").textContent).toBe("本月目前沒有任何對戰紀錄。");
	});
});
