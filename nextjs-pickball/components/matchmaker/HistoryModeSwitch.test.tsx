// components/matchmaker/HistoryModeSwitch.test.tsx
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { useSession } from "@/hooks/useSession";
import { HISTORY_STORAGE_KEY } from "@/lib/matchmaker/storage-keys";
import { HistoryModeSwitch } from "./HistoryModeSwitch";

vi.mock("@/hooks/useSession", () => ({ useSession: vi.fn() }));

// 雲端歷史以 stub 取代：本檔只驗證入口「何時掛載它」，不驗證它的內容
vi.mock("./RemoteHistoryView", () => ({
	RemoteHistoryView: () => <div data-testid="remote-history-stub" />,
}));

function todayIso(): string {
	const now = new Date();
	return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 10, 0, 0).toISOString();
}

function seedTodayHistory(): void {
	const entry = {
		format: "singles",
		matchId: "h1",
		courtNumber: 1,
		playedAt: todayIso(),
		teamA: { rating: 3, players: [{ id: "p1", name: "本機甲", ratingBefore: 3, ratingAfter: 3.2 }] },
		teamB: { rating: 3, players: [{ id: "p2", name: "本機乙", ratingBefore: 3, ratingAfter: 2.8 }] },
		scoreA: 11,
		scoreB: 4,
		winner: "teamA",
	};
	localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify({ version: 1, entries: [entry] }));
}

beforeEach(() => {
	localStorage.clear();
});

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

describe("HistoryModeSwitch", () => {
	it("session 等待中時顯示等待中提示且不渲染本機歷史", () => {
		seedTodayHistory();
		vi.mocked(useSession).mockReturnValue({
			status: "loading",
			signedInHint: true,
			hydrated: true,
			refresh: vi.fn(),
		});

		const { container } = render(<HistoryModeSwitch />);

		expect(screen.getByRole("status").textContent).toBe("正在載入資料…");
		expect(container.querySelector('[data-sync-status="pending"]')).not.toBeNull();
		expect(screen.queryByRole("radiogroup", { name: "歷史區間" })).toBeNull();
		expect(screen.queryByText("本機甲")).toBeNull();
		expect(screen.queryByTestId("remote-history-stub")).toBeNull();
	});
});
