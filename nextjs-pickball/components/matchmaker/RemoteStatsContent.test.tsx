// components/matchmaker/RemoteStatsContent.test.tsx
import { afterEach, describe, it, expect, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { MatchHistoryEntry } from "@pickball/core/matchmaker/history";
import type { Player } from "@pickball/core/matchmaker/types";
import { useRemoteHistory } from "@/hooks/useRemoteHistory";
import type { UseRemoteHistoryResult } from "@/hooks/useRemoteHistory";
import { useRosterStore } from "@/hooks/useRosterStore";
import type { UseRosterStoreResult } from "@/hooks/useRosterStore";
import { useRoundStore } from "@/hooks/useRoundStore";
import { useSession } from "@/hooks/useSession";
import type { UseSessionResult } from "@/hooks/useSession";
import { RemoteStatsContent } from "./RemoteStatsContent";

vi.mock("@/hooks/useRemoteHistory", () => ({ useRemoteHistory: vi.fn() }));
vi.mock("@/hooks/useRosterStore", () => ({ useRosterStore: vi.fn() }));
vi.mock("@/hooks/useRoundStore", () => ({ useRoundStore: vi.fn() }));
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

function mockReadySession(refresh = vi.fn()): void {
	vi.mocked(useSession).mockReturnValue({
		status: "ready",
		authEnabled: true,
		user: { id: "user-a", email: "a@example.com", name: "A" },
		refresh,
	});
}

function buildDrawEntry(): MatchHistoryEntry {
	return {
		matchId: "m1",
		courtNumber: 1,
		playedAt: "2026-03-18T01:00:00.000Z",
		format: "singles",
		teamA: { players: [{ id: "p1", name: "王小明", ratingBefore: 3, ratingAfter: 3 }], rating: 3 },
		teamB: { players: [{ id: "p2", name: "陳小華", ratingBefore: 3, ratingAfter: 3 }], rating: 3 },
		scoreA: 9,
		scoreB: 9,
		winner: "draw",
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

	// 以下為 regression guard：元件實作已存在，加入即綠（非 RED），用來鎖住 mutation 殺不掉的分支。
	describe("統計內容", () => {
		it("雲端歷史中的平局在排行榜計為和局而非敗場", () => {
			mockReadySession();
			mockRoster({ players: [buildPlayer({ id: "p1", name: "王小明" }), buildPlayer({ id: "p2", name: "陳小華" })] });
			mockHistory({ items: [{ data: buildDrawEntry(), version: 1 }], total: 1 });

			render(<RemoteStatsContent />);

			for (const id of ["p1", "p2"]) {
				const row = screen.getByTestId(`player-stat-row-${id}`);
				expect(within(row).getByText("0 - 0 - 1")).not.toBeNull();
			}
		});

		it("不掛載 useRoundStore", () => {
			mockReadySession();
			mockRoster();
			mockHistory({ items: [], total: 5 });

			render(<RemoteStatsContent />);

			expect(vi.mocked(useRoundStore)).not.toHaveBeenCalled();
		});
	});

	describe("useRemoteHistory 的參數", () => {
		it("以 ready 快照的 user id 與 refresh 啟用雲端歷史並預設今日區間", () => {
			const refresh = vi.fn();
			mockReadySession(refresh);
			mockRoster();
			mockHistory({ items: [], total: 5 });

			render(<RemoteStatsContent />);

			expect(vi.mocked(useRemoteHistory)).toHaveBeenLastCalledWith({
				enabled: true,
				userId: "user-a",
				range: "today",
				onUnauthorized: refresh,
			});
		});

		it("session 尚未 ready 或沒有 user 時 userId 為 null", () => {
			mockRoster();
			mockHistory();
			// 刻意塞入帶 user 的 loading 快照（型別上不會出現）：鎖住「只認 ready」的判定
			vi.mocked(useSession).mockReturnValue({
				status: "loading",
				user: { id: "user-a", email: "a@example.com", name: "A" },
				refresh: vi.fn(),
			} as unknown as UseSessionResult);
			const { rerender } = render(<RemoteStatsContent />);
			expect(vi.mocked(useRemoteHistory).mock.lastCall?.[0].userId).toBeNull();

			vi.mocked(useSession).mockReturnValue({
				status: "ready",
				authEnabled: true,
				user: null,
				refresh: vi.fn(),
			});
			rerender(<RemoteStatsContent />);
			expect(vi.mocked(useRemoteHistory).mock.lastCall?.[0].userId).toBeNull();
		});

		it("切換區間後把新區間傳給 useRemoteHistory", async () => {
			const user = userEvent.setup();
			mockReadySession();
			mockRoster();
			mockHistory({ items: [], total: 5 });
			render(<RemoteStatsContent />);

			await user.click(screen.getByRole("radio", { name: "上月" }));

			expect(vi.mocked(useRemoteHistory).mock.lastCall?.[0].range).toBe("lastMonth");
		});
	});

	describe("同步狀態", () => {
		const LOADING_MESSAGE = "正在載入雲端資料…";
		const LOAD_FAILED_MESSAGE = "無法載入雲端資料，請重新整理頁面";

		it.each([
			["loading", LOADING_MESSAGE],
			["load-failed", LOAD_FAILED_MESSAGE],
		] as const)("歷史 syncStatus 為 %s 時以提示取代內容並標示 data-sync-status", (status, message) => {
			mockReadySession();
			mockRoster({ players: [buildPlayer()] });
			mockHistory({ syncStatus: status, items: [], total: 5 });

			const { container } = render(<RemoteStatsContent />);

			expect(screen.getByRole("status").textContent).toBe(message);
			expect(container.firstElementChild?.getAttribute("data-sync-status")).toBe(status);
			expect(screen.queryByRole("table")).toBeNull();
			expect(screen.queryByRole("radiogroup")).toBeNull();
		});

		it.each([
			["loading", LOADING_MESSAGE],
			["load-failed", LOAD_FAILED_MESSAGE],
		] as const)("名單 syncStatus 為 %s 時以提示取代內容並標示 data-sync-status", (status, message) => {
			mockReadySession();
			mockRoster({ players: [], syncStatus: status });
			mockHistory({ syncStatus: "synced", items: [], total: 5 });

			const { container } = render(<RemoteStatsContent />);

			expect(screen.getByRole("status").textContent).toBe(message);
			expect(container.firstElementChild?.getAttribute("data-sync-status")).toBe(status);
			expect(screen.queryByRole("table")).toBeNull();
			expect(screen.queryByRole("radiogroup")).toBeNull();
		});

		it("名單與歷史皆可用時顯示內容並標示 data-sync-status", () => {
			mockReadySession();
			mockRoster({ players: [buildPlayer()] });
			mockHistory({ syncStatus: "synced", items: [], total: 5 });

			const { container } = render(<RemoteStatsContent />);

			expect(container.firstElementChild?.getAttribute("data-sync-status")).toBe("synced");
			expect(screen.getByRole("radiogroup", { name: "歷史區間" })).not.toBeNull();
			expect(screen.getByRole("table", { name: "球員排行榜" })).not.toBeNull();
		});
	});

	// 以下為補上的 regression guard：元件實作已存在，加入即綠（非 RED），用來殺 mutation 存活的分支。
	describe("regression guard：同步狀態優先序、篩選與空區間", () => {
		it("regression guard：名單 load-failed 而歷史 loading 時以名單狀態為準", () => {
			mockReadySession();
			mockRoster({ players: [], syncStatus: "load-failed" });
			mockHistory({ syncStatus: "loading", items: [], total: 5 });

			const { container } = render(<RemoteStatsContent />);

			// 兩邊都阻斷時名單優先；優先順序對調會顯示「正在載入」而非失敗提示
			expect(screen.getByRole("status").textContent).toBe("無法載入雲端資料，請重新整理頁面");
			expect(container.firstElementChild?.getAttribute("data-sync-status")).toBe("load-failed");
		});

		it("regression guard：名單可用而歷史 load-failed 時以歷史狀態為準", () => {
			mockReadySession();
			mockRoster({ players: [buildPlayer()], syncStatus: "synced" });
			mockHistory({ syncStatus: "load-failed", items: [], total: 5 });

			const { container } = render(<RemoteStatsContent />);

			expect(screen.getByRole("status").textContent).toBe("無法載入雲端資料，請重新整理頁面");
			expect(container.firstElementChild?.getAttribute("data-sync-status")).toBe("load-failed");
		});

		it("regression guard：兩邊皆非阻斷時 data-sync-status 取歷史狀態而非名單狀態", () => {
			mockReadySession();
			mockRoster({ players: [buildPlayer()], syncStatus: "synced" });
			mockHistory({ syncStatus: "local", items: [], total: 5 });

			const { container } = render(<RemoteStatsContent />);

			// 名單為 synced、歷史為 local：取名單狀態或寫死 synced 都會得到 synced
			expect(container.firstElementChild?.getAttribute("data-sync-status")).toBe("local");
			expect(screen.getByRole("table", { name: "球員排行榜" })).not.toBeNull();
		});

		it("regression guard：切換區間後篩選的選取狀態跟著走", async () => {
			const user = userEvent.setup();
			mockReadySession();
			mockRoster({ players: [buildPlayer()] });
			mockHistory({ items: [], total: 5 });
			render(<RemoteStatsContent />);

			await user.click(screen.getByRole("radio", { name: "本月" }));

			// 篩選的 value 若寫死為今日，點擊後選取狀態不會移動
			expect(screen.getByRole("radio", { name: "本月" }).getAttribute("aria-checked")).toBe("true");
			expect(screen.getByRole("radio", { name: "今日" }).getAttribute("aria-checked")).toBe("false");
		});

		it("regression guard：total 為 0 時不顯示區間篩選", () => {
			mockReadySession();
			mockRoster({ players: [buildPlayer()] });
			mockHistory({ items: [], total: 0 });

			render(<RemoteStatsContent />);

			expect(screen.queryByRole("radiogroup")).toBeNull();
		});

		it("regression guard：total 為 5 而 items 為空時名單成員出場為 0、勝負和為 0 - 0 - 0", () => {
			mockReadySession();
			mockRoster({ players: [buildPlayer({ id: "p1", name: "王小明" })] });
			mockHistory({ items: [], total: 5 });

			render(<RemoteStatsContent />);

			// 欄位順序依 PlayerStatsTable：第 4 欄出場、第 5 欄勝負和（以 0 次出場對齊 spec「名單成員皆為出場 0」）
			const cells = within(screen.getByTestId("player-stat-row-p1")).getAllByRole("cell");
			expect(cells[3].textContent).toBe("0");
			expect(cells[4].textContent).toBe("0 - 0 - 0");
		});
	});
});
