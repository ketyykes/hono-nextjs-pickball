// components/matchmaker/JsonBackupSection.test.tsx
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EXPECTED_USER_ID_HEADER } from "@pickball/core/api/headers";
import { useSession } from "@/hooks/useSession";
import type { UseSessionResult } from "@/hooks/useSession";
import { REMOTE_TRANSFER_MESSAGES } from "@/lib/matchmaker/remote-transfer";
import { HISTORY_STORAGE_KEY, ROSTER_STORAGE_KEY, ROUND_STORAGE_KEY } from "@/lib/matchmaker/storage-keys";
import { MATCH_SLOTS_KEY, STORAGE_KEY as SCOREBOARD_CURRENT_KEY } from "@/lib/scoreboard/storage-keys";
import { JsonBackupSection } from "./JsonBackupSection";

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

// 合法備份：兩位參賽者、無回合、無歷史
function buildBackupFile(): File {
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
	const backup = { version: 1, players: [player("b1", "備份甲"), player("b2", "備份乙")], currentRound: null, history: [] };
	return new File([JSON.stringify(backup)], "backup.json", { type: "application/json" });
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

describe("JsonBackupSection 雲端分支", () => {
	it("雲端 JSON 匯入以點擊當下的帳號送出且未授權時刷新 session", async () => {
		const user = userEvent.setup();
		// 本機放一份與備份不同的訪客資料，供「匯入不動本機」比對
		localStorage.setItem(ROSTER_STORAGE_KEY, JSON.stringify({ version: 1, players: [] }));
		localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify({ version: 1, entries: [] }));
		const before = snapshotKeys();
		const fetchMock = vi.fn<typeof fetch>();
		fetchMock.mockImplementation(async () => new Response(JSON.stringify({ error: "UNAUTHORIZED" }), { status: 401 }));
		vi.stubGlobal("fetch", fetchMock);

		// 訪客維持本機的覆寫式還原選檔，沒有雲端匯入選檔
		mockGuestSession();
		const { rerender } = render(<JsonBackupSection />);
		expect(screen.queryByTestId("json-backup-import-input")).not.toBeNull();
		expect(screen.queryByTestId("json-backup-cloud-import-input")).toBeNull();

		// 登入後相反：本機覆寫式還原不渲染，改渲染雲端匯入選檔
		mockRemoteSession("user-a");
		rerender(<JsonBackupSection />);
		expect(screen.queryByTestId("json-backup-import-input")).toBeNull();
		expect(screen.queryByTestId("json-backup-cloud-import-input")).not.toBeNull();
		// 點擊（選檔）前才換帳號，證明送出的是當下的 session 而非 mount 時的
		mockRemoteSession("user-b");
		rerender(<JsonBackupSection />);
		await user.upload(screen.getByTestId("json-backup-cloud-import-input"), buildBackupFile());

		expect((await screen.findByRole("alert")).textContent).toBe(REMOTE_TRANSFER_MESSAGES.unauthorized);
		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toBe("/api/import");
		expect(init?.method).toBe("POST");
		expect((init?.headers as Record<string, string>)[EXPECTED_USER_ID_HEADER]).toBe("user-b");
		expect(refresh).toHaveBeenCalledTimes(1);
		expect(snapshotKeys()).toEqual(before);

		// 帳號資料殘缺（取不到 user id）時不送出請求，改顯示未授權訊息
		mockSessionWithoutUserId();
		rerender(<JsonBackupSection />);
		await user.upload(screen.getByTestId("json-backup-cloud-import-input"), buildBackupFile());

		expect((await screen.findByRole("alert")).textContent).toBe(REMOTE_TRANSFER_MESSAGES.unauthorized);
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(snapshotKeys()).toEqual(before);
	});
});
