import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import MatchmakerStatsPage from "./page";
import { useSession } from "@/hooks/useSession";

vi.mock("@/hooks/useSession", () => ({
	useSession: vi.fn(),
}));

// 雲端統計內容以 stub 取代：本檔只驗證入口「何時掛載它」，不驗證它的內容
vi.mock("@/components/matchmaker/RemoteStatsContent", () => ({
	RemoteStatsContent: () => <div data-testid="remote-stats-stub" />,
}));

describe("統計頁入口", () => {
	const fetchMock = vi.fn<typeof fetch>();

	beforeEach(() => {
		localStorage.clear();
		fetchMock.mockReset();
		vi.stubGlobal("fetch", fetchMock);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("session 等待中時統計頁顯示等待中提示且不掛載雲端統計內容", () => {
		vi.mocked(useSession).mockReturnValue({
			status: "loading",
			signedInHint: true,
			hydrated: true,
			refresh: vi.fn(),
		});

		const { container } = render(<MatchmakerStatsPage />);

		expect(screen.getByRole("status").textContent).toBe("正在載入資料…");
		expect(container.querySelector('main[data-sync-status="pending"]')).not.toBeNull();
		expect(screen.queryByRole("heading", { name: "球員統計" })).toBeNull();
		expect(screen.queryByTestId("remote-stats-stub")).toBeNull();
		expect(fetchMock).not.toHaveBeenCalled();
	});
});
