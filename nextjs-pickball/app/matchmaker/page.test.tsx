import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import MatchmakerPage from "./page";
import { useSession } from "@/hooks/useSession";
import { STORAGE_KEY as ROSTER_KEY } from "@/lib/matchmaker/storage";
import { LOCAL_FALLBACK_ACTION_LABEL, syncStatusMessage } from "@/lib/sync/sync-status";

vi.mock("@/hooks/useSession", () => ({
	useSession: vi.fn(),
}));

vi.mock("next/navigation", () => ({
	useRouter: () => ({ push: vi.fn() }),
}));

function makePlayer(id: string) {
	return {
		id,
		name: `球員${id}`,
		gender: "male",
		colorFrom: "#0E6B63",
		colorTo: "#134E4A",
		rating: 3,
		restCount: 0,
		gamesPlayed: 0,
		isActive: true,
		createdAt: "2026-08-15T00:00:00.000Z",
	};
}

describe("對戰頁", () => {
	const fetchMock = vi.fn<typeof fetch>();

	beforeEach(() => {
		localStorage.clear();
		fetchMock.mockReset();
		vi.stubGlobal("fetch", fetchMock);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("session 無法確認時對戰頁以無法載入提示與按鈕取代場次舞台", () => {
		localStorage.setItem(
			ROSTER_KEY,
			JSON.stringify({ version: 1, players: [makePlayer("p1"), makePlayer("p2")] }),
		);
		vi.mocked(useSession).mockReturnValue({
			status: "loading",
			signedInHint: true,
			unavailable: true,
			hydrated: true,
			refresh: vi.fn(),
		});

		const { container } = render(<MatchmakerPage />);

		expect(container.querySelector('main[data-sync-status="unavailable"]')).not.toBeNull();
		expect(screen.getByRole("status").textContent).toBe(syncStatusMessage("load-failed"));
		expect(screen.getByRole("button", { name: LOCAL_FALLBACK_ACTION_LABEL })).not.toBeNull();
		expect(screen.queryByText("目前沒有可出場的參賽者")).toBeNull();
		expect(screen.queryByText("尚未產生任何回合")).toBeNull();
		expect(fetchMock).not.toHaveBeenCalled();
	});
});
