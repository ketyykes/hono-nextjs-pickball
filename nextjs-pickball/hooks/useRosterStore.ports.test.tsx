import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { Player } from "@pickball/core/matchmaker/types";
import { useSession } from "@/hooks/useSession";
import { useRosterStore } from "./useRosterStore";

vi.mock("@/hooks/useSession", () => ({
	useSession: vi.fn(() => ({
		status: "ready",
		authEnabled: false,
		user: null,
		refresh: vi.fn(),
	})),
}));

function makePlayer(id: string, overrides: Partial<Player> = {}): Player {
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
		...overrides,
	};
}

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
	localStorage.clear();
	fetchMock.mockReset();
	vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.mocked(useSession).mockReturnValue({
		status: "ready",
		authEnabled: false,
		user: null,
		refresh: vi.fn(),
	});
});

describe("useRosterStore 的回合 port（applyRemotePlayers／reloadRemotePlayers）", () => {
	it("本機模式的兩個 port 是不做任何事的函式", async () => {
		const { result } = renderHook(() => useRosterStore());
		act(() => {
			result.current.addPlayer({ name: "訪客", gender: "male", rating: 3 });
		});
		const before = result.current.players;

		act(() => {
			result.current.applyRemotePlayers([{ data: makePlayer("zz", { rating: 7 }), version: 9 }]);
			result.current.reloadRemotePlayers();
		});

		expect(result.current.players).toEqual(before);
		expect(result.current.syncStatus).toBe("local");
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("雲端模式的兩個 port 轉交給雲端實作", async () => {
		vi.mocked(useSession).mockReturnValue({
			status: "ready",
			authEnabled: true,
			user: { id: "u1", email: "a@example.com", name: "A" },
			refresh: vi.fn(),
		});
		const p1 = makePlayer("p1");
		fetchMock.mockImplementation(() =>
			Promise.resolve(
				new Response(JSON.stringify({ items: [{ data: p1, version: 2 }] }), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				}),
			),
		);
		const { result } = renderHook(() => useRosterStore());
		await waitFor(() => expect(result.current.syncStatus).toBe("synced"));

		act(() => {
			result.current.applyRemotePlayers([{ data: makePlayer("p1", { rating: 4.2 }), version: 3 }]);
		});
		expect(result.current.players[0].rating).toBe(4.2);

		const getsBefore = fetchMock.mock.calls.length;
		act(() => {
			result.current.reloadRemotePlayers();
		});
		await waitFor(() => expect(fetchMock.mock.calls.length).toBe(getsBefore + 1));
		await waitFor(() => expect(result.current.players[0].rating).toBe(3));
	});
});
