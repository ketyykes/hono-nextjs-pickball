// components/matchmaker/LocalDataImportSection.test.tsx
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EXPECTED_USER_ID_HEADER } from "@pickball/core/api/headers";
import { createInitialState } from "@pickball/core/scoreboard/reducer";
import { useSession } from "@/hooks/useSession";
import type { UseSessionResult } from "@/hooks/useSession";
import { REMOTE_TRANSFER_MESSAGES } from "@/lib/matchmaker/remote-transfer";
import { HISTORY_STORAGE_KEY, ROSTER_STORAGE_KEY, ROUND_STORAGE_KEY } from "@/lib/matchmaker/storage-keys";
import { MATCH_SLOTS_KEY, STORAGE_KEY as SCOREBOARD_CURRENT_KEY } from "@/lib/scoreboard/storage-keys";
import { LocalDataImportSection } from "./LocalDataImportSection";

vi.mock("@/hooks/useSession", () => ({ useSession: vi.fn() }));

const ALL_KEYS = [
	ROSTER_STORAGE_KEY,
	ROUND_STORAGE_KEY,
	HISTORY_STORAGE_KEY,
	MATCH_SLOTS_KEY,
	SCOREBOARD_CURRENT_KEY,
] as const;

const refresh = vi.fn<() => Promise<void>>();

function mockRemoteSession(userId: string): void {
	const session: UseSessionResult = {
		status: "ready",
		authEnabled: true,
		user: { id: userId, email: `${userId}@example.com`, name: userId },
		refresh,
	};
	vi.mocked(useSession).mockReturnValue(session);
}

function mockGuestSession(): void {
	const session: UseSessionResult = { status: "ready", authEnabled: true, user: null, refresh };
	vi.mocked(useSession).mockReturnValue(session);
}

// 模擬「session 資料殘缺」：已登入但 user 沒有 id。元件的 null 防線只有在這種輸入下才走得到
function mockSessionWithoutUserId(): void {
	const session = {
		status: "ready",
		authEnabled: true,
		user: { id: undefined, email: "broken@example.com", name: "broken" },
		refresh,
	} as unknown as UseSessionResult;
	vi.mocked(useSession).mockReturnValue(session);
}

function seedLocalData(): void {
	const player = (id: string, name: string) => ({
		id,
		name,
		gender: "other",
		colorFrom: "#4f46e5",
		colorTo: "#818cf8",
		rating: 3,
		restCount: 0,
		gamesPlayed: 0,
		isActive: true,
		createdAt: "2026-01-01T00:00:00.000Z",
	});
	const round = {
		roundNumber: 1,
		createdAt: "2026-01-01T00:00:00.000Z",
		format: "singles",
		courtCount: 1,
		targetScore: 11,
		matches: [
			{
				id: "m1",
				courtNumber: 1,
				format: "singles",
				teams: [
					{ playerIds: ["p1"], rating: 3 },
					{ playerIds: ["p2"], rating: 3 },
				],
				status: "pending",
				scores: null,
				winner: null,
				completedAt: null,
				playerRatings: [
					{ playerId: "p1", before: 3, after: null },
					{ playerId: "p2", before: 3, after: null },
				],
			},
		],
		restingPlayerIds: [],
		seenSignatures: { teammateKeys: [], opponentKeys: [], fullMatchKeys: [] },
		timer: null,
	};
	const entry = {
		format: "singles",
		matchId: "h1",
		courtNumber: 1,
		playedAt: "2026-01-01T01:00:00.000Z",
		teamA: { rating: 3, players: [{ id: "p1", name: "甲", ratingBefore: 3, ratingAfter: 3.2 }] },
		teamB: { rating: 3, players: [{ id: "p2", name: "乙", ratingBefore: 3, ratingAfter: 2.8 }] },
		scoreA: 11,
		scoreB: 4,
		winner: "teamA",
	};
	localStorage.setItem(ROSTER_STORAGE_KEY, JSON.stringify({ version: 1, players: [player("p1", "甲"), player("p2", "乙")] }));
	localStorage.setItem(ROUND_STORAGE_KEY, JSON.stringify({ version: 1, round }));
	localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify({ version: 1, entries: [entry] }));
	localStorage.setItem(
		MATCH_SLOTS_KEY,
		JSON.stringify({ m1: { ...createInitialState({ mode: "singles" }), matchId: "m1" } }),
	);
	localStorage.setItem(SCOREBOARD_CURRENT_KEY, JSON.stringify(createInitialState({ mode: "singles" })));
}

function snapshotKeys(): Record<string, string | null> {
	return Object.fromEntries(ALL_KEYS.map((key) => [key, localStorage.getItem(key)]));
}

beforeEach(() => {
	localStorage.clear();
	refresh.mockResolvedValue(undefined);
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	vi.clearAllMocks();
});

describe("LocalDataImportSection", () => {
	it("匯入以點擊當下的帳號送出且未授權時刷新 session", async () => {
		const user = userEvent.setup();
		seedLocalData();
		const before = snapshotKeys();
		const fetchMock = vi.fn<typeof fetch>();
		fetchMock.mockImplementation(async () => new Response(JSON.stringify({ error: "UNAUTHORIZED" }), { status: 401 }));
		vi.stubGlobal("fetch", fetchMock);

		// 訪客（本機模式）不渲染任何東西，即使本機有可匯入的資料
		mockGuestSession();
		const { container, rerender } = render(<LocalDataImportSection />);
		expect(container.firstChild).toBeNull();

		mockRemoteSession("user-a");
		rerender(<LocalDataImportSection />);
		const button = await screen.findByRole("button", { name: "匯入本機資料到雲端" });
		// 點擊前才換帳號，證明送出的是點擊當下的 session 而非 mount 時的
		mockRemoteSession("user-b");
		rerender(<LocalDataImportSection />);
		await user.click(button);

		expect((await screen.findByRole("alert")).textContent).toBe(REMOTE_TRANSFER_MESSAGES.unauthorized);
		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toBe("/api/import");
		expect(init?.method).toBe("POST");
		expect((init?.headers as Record<string, string>)[EXPECTED_USER_ID_HEADER]).toBe("user-b");
		expect(refresh).toHaveBeenCalledTimes(1);
		expect(snapshotKeys()).toEqual(before);

		// 帳號資料殘缺（取不到 user id）時不送出請求，改顯示未授權訊息。
		// 先卸載再全新 render：第一階段的 401 已留下同文字的 alert，沿用舊元件會讓
		// 「null 防線自己顯示訊息」的斷言被舊 alert 蓋過而失去鑑別力
		cleanup();
		mockSessionWithoutUserId();
		render(<LocalDataImportSection />);
		expect(screen.queryByRole("alert")).toBeNull();
		await user.click(await screen.findByRole("button", { name: "匯入本機資料到雲端" }));

		expect((await screen.findByRole("alert")).textContent).toBe(REMOTE_TRANSFER_MESSAGES.unauthorized);
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(snapshotKeys()).toEqual(before);
	});
});
