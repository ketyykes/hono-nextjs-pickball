// components/matchmaker/RemoteStatsContent.test.tsx
import { afterEach, describe, it, expect, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { Player } from "@pickball/core/matchmaker/types";
import { useRemoteHistory } from "@/hooks/useRemoteHistory";
import type { UseRemoteHistoryResult } from "@/hooks/useRemoteHistory";
import { useRosterStore } from "@/hooks/useRosterStore";
import type { UseRosterStoreResult } from "@/hooks/useRosterStore";
import { useSession } from "@/hooks/useSession";
import { RemoteStatsContent } from "./RemoteStatsContent";

vi.mock("@/hooks/useRemoteHistory", () => ({ useRemoteHistory: vi.fn() }));
vi.mock("@/hooks/useRosterStore", () => ({ useRosterStore: vi.fn() }));
vi.mock("@/hooks/useSession", () => ({ useSession: vi.fn() }));

function buildPlayer(overrides: Partial<Player> = {}): Player {
	return {
		id: "p1",
		name: "王小明",
		gender: "male",
		colorFrom: "#0E6B63",
		colorTo: "#134E4A",
		rating: 3,
		restCount: 0,
		gamesPlayed: 0,
		isActive: true,
		createdAt: "2026-08-23T00:00:00.000Z",
		...overrides,
	};
}

function mockRoster(overrides: Partial<UseRosterStoreResult> = {}): void {
	vi.mocked(useRosterStore).mockReturnValue({
		players: [],
		droppedCount: 0,
		addPlayer: vi.fn(),
		updatePlayer: vi.fn(),
		removePlayer: vi.fn(),
		togglePlayerActive: vi.fn(),
		resetRoster: vi.fn(),
		syncStatus: "synced",
		applyRemotePlayers: vi.fn(),
		reloadRemotePlayers: vi.fn(),
		...overrides,
	});
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

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

describe("RemoteStatsContent", () => {
	it("雲端 total 為 0 時顯示引導型空狀態，否則顯示排行榜", () => {
		vi.mocked(useSession).mockReturnValue({
			status: "ready",
			authEnabled: true,
			user: { id: "user-a", email: "a@example.com", name: "A" },
			refresh: vi.fn(),
		});
		mockRoster({ players: [buildPlayer({ id: "p1", name: "王小明" }), buildPlayer({ id: "p2", name: "陳小華" })] });
		mockHistory({ items: [], total: 0 });

		const { rerender } = render(<RemoteStatsContent />);

		// 雲端完全沒有紀錄：引導型空狀態，不顯示排行榜表格
		expect(screen.getByTestId("empty-history")).not.toBeNull();
		expect(screen.queryByRole("table")).toBeNull();

		// total 為 5 但目前區間沒有紀錄：不可誤導成「從未打過」，顯示排行榜（名單成員出場皆為 0）
		mockHistory({ items: [], total: 5 });
		rerender(<RemoteStatsContent />);
		expect(screen.queryByTestId("empty-history")).toBeNull();
		expect(screen.getByRole("table", { name: "球員排行榜" })).not.toBeNull();
		expect(screen.getByTestId("player-stat-row-p1")).not.toBeNull();
		expect(screen.getByTestId("player-stat-row-p2")).not.toBeNull();
	});
});
