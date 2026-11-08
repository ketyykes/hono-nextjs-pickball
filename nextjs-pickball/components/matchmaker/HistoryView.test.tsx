// components/matchmaker/HistoryView.test.tsx
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, it, expect } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { HISTORY_STORAGE_KEY } from "@/lib/matchmaker/storage-keys";
import { HistoryView } from "./HistoryView";

function todayIso(): string {
	const now = new Date();
	return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 10, 0, 0).toISOString();
}

function todayEntry() {
	return {
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
}

function seedTodayHistory(): void {
	localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify({ version: 1, entries: [todayEntry()] }));
}

beforeEach(() => {
	localStorage.clear();
});

afterEach(() => {
	cleanup();
});

describe("HistoryView", () => {
	it("伺服器端輸出為等待中提示而非空狀態，讀入後顯示本機紀錄", () => {
		seedTodayHistory();

		const serverHtml = renderToString(<HistoryView />);
		expect(serverHtml).toContain("正在載入資料…");
		expect(serverHtml).toContain('data-sync-status="pending"');
		expect(serverHtml).not.toContain("還沒有任何對戰紀錄");
		expect(serverHtml).not.toContain("歷史區間");

		const { container } = render(<HistoryView />);
		expect(screen.getByText("本機甲")).not.toBeNull();
		expect(container.querySelector("[data-sync-status]")).toBeNull();
	});

	it("StrictMode 重跑 effect 時仍保留第一次偵測到的損毀筆數提示", () => {
		localStorage.setItem(
			HISTORY_STORAGE_KEY,
			JSON.stringify({ version: 1, entries: [{ broken: 1 }, { broken: 2 }, todayEntry()] }),
		);

		render(
			<StrictMode>
				<HistoryView />
			</StrictMode>,
		);

		const alert = screen.getByRole("alert");
		expect(alert.textContent).toContain("有 2 筆損毀的歷史紀錄");
		expect(screen.getByText("本機甲")).not.toBeNull();
	});
});
