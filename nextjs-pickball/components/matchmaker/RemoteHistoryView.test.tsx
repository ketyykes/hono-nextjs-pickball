// components/matchmaker/RemoteHistoryView.test.tsx
import { afterEach, describe, it, expect, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { MatchHistoryEntry } from "@pickball/core/matchmaker/history";
import { useRemoteHistory } from "@/hooks/useRemoteHistory";
import type { UseRemoteHistoryResult } from "@/hooks/useRemoteHistory";
import { useSession } from "@/hooks/useSession";
import type { UseSessionResult } from "@/hooks/useSession";
import { RemoteHistoryView } from "./RemoteHistoryView";

vi.mock("@/hooks/useRemoteHistory", () => ({ useRemoteHistory: vi.fn() }));
vi.mock("@/hooks/useSession", () => ({ useSession: vi.fn() }));

// MatchHistoryEntry 是依 format 分流的聯集，spread 整個 Partial 會讓 format 對不上；只開放本檔會覆寫的欄位
type EntryOverrides = Partial<Pick<MatchHistoryEntry, "scoreA" | "scoreB" | "winner" | "teamA">>;

function buildEntry(matchId: string, overrides: EntryOverrides = {}): MatchHistoryEntry {
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
		...overrides,
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

	// 以下為 regression guard：元件實作已存在，加入即綠（非 RED），用來鎖住 mutation 殺不掉的分支。
	describe("useRemoteHistory 的參數", () => {
		it("以 ready 快照的 user id 與 refresh 啟用雲端歷史並預設今日區間", () => {
			const refresh = vi.fn();
			vi.mocked(useSession).mockReturnValue({
				status: "ready",
				authEnabled: true,
				user: { id: "user-a", email: "a@example.com", name: "A" },
				refresh,
			});
			mockHistory();

			render(<RemoteHistoryView />);

			expect(vi.mocked(useRemoteHistory)).toHaveBeenLastCalledWith({
				enabled: true,
				userId: "user-a",
				range: "today",
				onUnauthorized: refresh,
			});
		});

		it("session 尚未 ready 或沒有 user 時 userId 為 null", () => {
			mockHistory();
			// 刻意塞入帶 user 的 loading 快照（型別上不會出現）：鎖住「只認 ready」的判定
			vi.mocked(useSession).mockReturnValue({
				status: "loading",
				user: { id: "user-a", email: "a@example.com", name: "A" },
				refresh: vi.fn(),
			} as unknown as UseSessionResult);
			const { rerender } = render(<RemoteHistoryView />);
			expect(vi.mocked(useRemoteHistory).mock.lastCall?.[0].userId).toBeNull();

			vi.mocked(useSession).mockReturnValue({
				status: "ready",
				authEnabled: true,
				user: null,
				refresh: vi.fn(),
			});
			rerender(<RemoteHistoryView />);
			expect(vi.mocked(useRemoteHistory).mock.lastCall?.[0].userId).toBeNull();
		});

		it("切換區間後把新區間傳給 useRemoteHistory", async () => {
			const user = userEvent.setup();
			mockReadySession();
			mockHistory({ items: [], total: 5 });
			render(<RemoteHistoryView />);

			await user.click(screen.getByRole("radio", { name: "上月" }));

			expect(vi.mocked(useRemoteHistory).mock.lastCall?.[0].range).toBe("lastMonth");
		});
	});

	describe("同步狀態", () => {
		it.each([
			["loading", "正在載入雲端資料…"],
			["load-failed", "無法載入雲端資料，請重新整理頁面"],
		] as const)("syncStatus 為 %s 時以提示取代內容並標示 data-sync-status", (status, message) => {
			mockReadySession();
			mockHistory({ syncStatus: status, items: [{ data: buildEntry("m1"), version: 1 }], total: 3, droppedCount: 2 });

			const { container } = render(<RemoteHistoryView />);

			expect(screen.getByRole("status").textContent).toBe(message);
			expect(container.firstElementChild?.getAttribute("data-sync-status")).toBe(status);
			expect(screen.queryByRole("alert")).toBeNull();
			expect(screen.queryByTestId("history-record-m1")).toBeNull();
		});

		it("syncStatus 為 synced 時顯示內容並標示 data-sync-status", () => {
			mockReadySession();
			mockHistory({ syncStatus: "synced", items: [{ data: buildEntry("m1"), version: 1 }], total: 1 });

			const { container } = render(<RemoteHistoryView />);

			expect(container.firstElementChild?.getAttribute("data-sync-status")).toBe("synced");
			expect(screen.getByRole("radiogroup", { name: "歷史區間" })).not.toBeNull();
			expect(screen.getByTestId("history-record-m1")).not.toBeNull();
		});
	});

	describe("歷史頁保留篩選器", () => {
		const FILTER_RANGE_LABELS = ["今日", "本週", "本月", "上月", "更早"] as const;

		it.each([
			["loading", "正在載入雲端資料…"],
			["load-failed", "無法載入雲端資料，請重新整理頁面"],
		] as const)("載入中與載入失敗時保留區間篩選並只以提示取代紀錄區塊", (status, message) => {
			mockReadySession();
			mockHistory({ syncStatus: status, items: [{ data: buildEntry("m1"), version: 1 }], total: 3, droppedCount: 2 });

			const { container } = render(<RemoteHistoryView />);

			const group = screen.getByRole("radiogroup", { name: "歷史區間" });
			const radios = within(group).getAllByRole("radio");
			expect(radios.map((radio) => radio.textContent)).toEqual([...FILTER_RANGE_LABELS]);
			expect(screen.getByRole("radio", { name: "今日" }).getAttribute("aria-checked")).toBe("true");
			expect(screen.getByRole("status").textContent).toBe(message);
			expect(container.firstElementChild?.getAttribute("data-sync-status")).toBe(status);
			expect(screen.queryByTestId("history-record-m1")).toBeNull();
			expect(screen.queryByTestId("empty-history")).toBeNull();
			expect(screen.queryByTestId("empty-history-range")).toBeNull();
			expect(screen.queryByRole("alert")).toBeNull();
		});

		it("以鍵盤切換區間時焦點在載入中、載入完成與載入失敗後都留在被選取的區間選項", async () => {
			const user = userEvent.setup();
			mockReadySession();
			const blockedResult: UseRemoteHistoryResult = {
				items: [],
				total: 0,
				droppedCount: 0,
				syncStatus: "loading",
			};
			const syncedResult: UseRemoteHistoryResult = {
				items: [{ data: buildEntry("m1"), version: 1 }],
				total: 1,
				droppedCount: 0,
				syncStatus: "synced",
			};
			let weekResult: UseRemoteHistoryResult = blockedResult;
			let monthResult: UseRemoteHistoryResult = blockedResult;
			vi.mocked(useRemoteHistory).mockReset();
			vi.mocked(useRemoteHistory).mockImplementation(({ range }) => {
				if (range === "thisWeek") return weekResult;
				if (range === "thisMonth") return monthResult;
				return syncedResult;
			});

			try {
				const { rerender } = render(<RemoteHistoryView />);

				// 取得選項的 DOM 參照後，每個階段都斷言焦點仍在同一個節點上（篩選器從未卸載）
				const week = screen.getByRole("radio", { name: "本週" });
				week.focus();
				await user.keyboard("{Enter}");
				expect(document.activeElement).toBe(week);
				expect(week.getAttribute("aria-checked")).toBe("true");

				weekResult = syncedResult;
				rerender(<RemoteHistoryView />);
				expect(document.activeElement).toBe(week);
				expect(week.getAttribute("aria-checked")).toBe("true");

				const month = screen.getByRole("radio", { name: "本月" });
				monthResult = { ...blockedResult, syncStatus: "load-failed" };
				month.focus();
				await user.keyboard("{Enter}");
				expect(document.activeElement).toBe(month);
				expect(month.getAttribute("aria-checked")).toBe("true");
			} finally {
				vi.mocked(useRemoteHistory).mockReset();
			}
		});

		it("載入失敗後改選其他區間會以新區間重新載入並顯示紀錄", async () => {
			const user = userEvent.setup();
			mockReadySession();
			vi.mocked(useRemoteHistory).mockReset();
			vi.mocked(useRemoteHistory).mockImplementation(({ range }) => {
				if (range === "thisWeek") {
					return {
						items: [{ data: buildEntry("m1"), version: 1 }],
						total: 1,
						droppedCount: 0,
						syncStatus: "synced",
					};
				}
				return { items: [], total: 0, droppedCount: 0, syncStatus: "load-failed" };
			});

			try {
				render(<RemoteHistoryView />);
				expect(screen.getByRole("status").textContent).toBe("無法載入雲端資料，請重新整理頁面");

				await user.click(screen.getByRole("radio", { name: "本週" }));

				expect(vi.mocked(useRemoteHistory).mock.lastCall?.[0].range).toBe("thisWeek");
				expect(screen.getByTestId("history-record-m1")).not.toBeNull();
				expect(screen.queryByRole("status")).toBeNull();
				expect(screen.getByRole("radiogroup", { name: "歷史區間" })).not.toBeNull();
				expect(screen.getByRole("radio", { name: "本週" }).getAttribute("aria-checked")).toBe("true");
			} finally {
				vi.mocked(useRemoteHistory).mockReset();
			}
		});
	});

	// 以下為補上的 regression guard：元件實作已存在，加入即綠（非 RED），用來殺 mutation 存活的分支。
	describe("regression guard：紀錄卡片、提示樣式與同步狀態", () => {
		it("regression guard：每筆雲端紀錄各自渲染一張卡片且保留後端順序", () => {
			mockReadySession();
			mockHistory({
				items: [
					{ data: buildEntry("m1"), version: 1 },
					{
						data: buildEntry("m2", {
							scoreA: 5,
							scoreB: 11,
							winner: "teamB",
							teamA: { players: [{ id: "p3", name: "丙", ratingBefore: 3, ratingAfter: 2.9 }], rating: 3 },
						}),
						version: 1,
					},
				],
				total: 2,
			});

			render(<RemoteHistoryView />);

			// 每張卡片必須吃自己那筆資料：只渲染第一筆、或每張都傳第一筆都會在此失敗
			expect(screen.getByTestId("history-record-m1-score").textContent).toBe("11:7");
			expect(screen.getByTestId("history-record-m2-score").textContent).toBe("5:11");
			expect(within(screen.getByTestId("history-record-m2-team-a")).getByText("丙")).not.toBeNull();
			const ids = screen.getAllByTestId(/^history-record-m\d$/).map((el) => el.dataset.testid);
			expect(ids).toEqual(["history-record-m1", "history-record-m2"]);
		});

		it("regression guard：損毀提示的樣式 class 與本機相同", () => {
			mockReadySession();
			mockHistory({ items: [], total: 3, droppedCount: 2 });

			render(<RemoteHistoryView />);

			// spec 要求樣式與文案須與本機逐字相同；只驗文案抓不到 class 被改掉
			expect(screen.getByRole("alert").className).toBe(
				"rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive",
			);
		});

		it("regression guard：切換區間後篩選的選取狀態跟著走", async () => {
			const user = userEvent.setup();
			mockReadySession();
			mockHistory({ items: [], total: 5 });
			render(<RemoteHistoryView />);

			await user.click(screen.getByRole("radio", { name: "本月" }));

			// 篩選的 value 若寫死為今日，點擊後選取狀態不會移動
			expect(screen.getByRole("radio", { name: "本月" }).getAttribute("aria-checked")).toBe("true");
			expect(screen.getByRole("radio", { name: "今日" }).getAttribute("aria-checked")).toBe("false");
		});

		it("regression guard：hook 回報非阻斷的 local 狀態時內容分支如實標示 data-sync-status", () => {
			// session 尚未 ready（型別上 loading 不帶 user，這裡只借它表達「非 ready」）
			vi.mocked(useSession).mockReturnValue({ status: "loading", refresh: vi.fn() } as unknown as UseSessionResult);
			mockHistory({ syncStatus: "local", items: [{ data: buildEntry("m1"), version: 1 }], total: 1 });

			const { container } = render(<RemoteHistoryView />);

			expect(container.firstElementChild?.getAttribute("data-sync-status")).toBe("local");
			expect(screen.getByTestId("history-record-m1")).not.toBeNull();
		});
	});
});
