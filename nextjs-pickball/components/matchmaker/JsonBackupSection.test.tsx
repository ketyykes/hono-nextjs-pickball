// components/matchmaker/JsonBackupSection.test.tsx
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EXPECTED_USER_ID_HEADER } from "@pickball/core/api/headers";
import { useSession } from "@/hooks/useSession";
import type { UseSessionResult } from "@/hooks/useSession";
import { parseBackup } from "@/lib/matchmaker/backup";
import { LOCAL_IMPORT_MESSAGES } from "./local-import-view";
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

function mockPendingSession(): void {
	const session: UseSessionResult = { status: "loading", signedInHint: true, hydrated: true, refresh };
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

// 版本不符的備份：parseBackup 會拒絕，用來走「驗證失敗」分支
function buildUnsupportedVersionFile(): File {
	return new File([JSON.stringify({ version: 2, players: [], currentRound: null, history: [] })], "bad.json", {
		type: "application/json",
	});
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

		// 帳號資料殘缺（取不到 user id）時不送出請求，改顯示未授權訊息。
		// 先卸載再全新 render：第一階段的 401 已留下同文字的 alert，沿用舊元件會讓
		// 「null 防線自己顯示訊息」的斷言被舊 alert 蓋過而失去鑑別力
		cleanup();
		mockSessionWithoutUserId();
		render(<JsonBackupSection />);
		expect(screen.queryByRole("alert")).toBeNull();
		await user.upload(screen.getByTestId("json-backup-cloud-import-input"), buildBackupFile());

		expect((await screen.findByRole("alert")).textContent).toBe(REMOTE_TRANSFER_MESSAGES.unauthorized);
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(snapshotKeys()).toEqual(before);
	});

	it("雲端 JSON 匯入遇到 413 時顯示資料量超過上限且不寫入本機", async () => {
		const user = userEvent.setup();
		localStorage.setItem(ROSTER_STORAGE_KEY, JSON.stringify({ version: 1, players: [] }));
		localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify({ version: 1, entries: [] }));
		const before = snapshotKeys();
		const fetchMock = vi.fn<typeof fetch>();
		fetchMock.mockImplementation(
			async () => new Response(JSON.stringify({ error: "PAYLOAD_TOO_LARGE" }), { status: 413 }),
		);
		vi.stubGlobal("fetch", fetchMock);
		mockRemoteSession("user-a");
		render(<JsonBackupSection />);

		await user.upload(screen.getByTestId("json-backup-cloud-import-input"), buildBackupFile());

		expect((await screen.findByRole("alert")).textContent).toBe(LOCAL_IMPORT_MESSAGES.tooLarge);
		expect(screen.queryByRole("status")).toBeNull();
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(refresh).not.toHaveBeenCalled();
		expect(snapshotKeys()).toEqual(before);
	});

	// regression guard（加入即綠）：雲端分支的 parseBackup 失敗路徑，行為在 5.2 已存在
	it("雲端 JSON 匯入遇到不合法的備份檔時顯示 parseBackup 的訊息且不送出請求", async () => {
		const user = userEvent.setup();
		localStorage.setItem(ROSTER_STORAGE_KEY, JSON.stringify({ version: 1, players: [] }));
		const before = snapshotKeys();
		const fetchMock = vi.fn<typeof fetch>();
		vi.stubGlobal("fetch", fetchMock);
		mockRemoteSession("user-a");
		render(<JsonBackupSection />);

		const badFile = buildUnsupportedVersionFile();
		// 預期訊息由同一段文字呼叫 parseBackup 取得，避免把錯誤字串寫死而與本機分支漂移
		const expected = parseBackup(await badFile.text());
		expect(expected.ok).toBe(false);
		if (expected.ok) return;

		await user.upload(screen.getByTestId("json-backup-cloud-import-input"), badFile);

		expect((await screen.findByRole("alert")).textContent).toBe(expected.message);
		expect(fetchMock).not.toHaveBeenCalled();
		expect(refresh).not.toHaveBeenCalled();
		expect(snapshotKeys()).toEqual(before);
	});

	// regression guard（加入即綠）：先失敗後成功時，成功要清掉舊的錯誤訊息
	it("雲端 JSON 匯入先失敗後成功時成功結果會清除舊的錯誤訊息", async () => {
		const user = userEvent.setup();
		const fetchMock = vi.fn<typeof fetch>();
		fetchMock.mockImplementation(
			async () =>
				new Response(
					JSON.stringify({ imported: { players: 2, round: false, slots: 0, history: 0, scoreboardCurrent: "none" } }),
					{ status: 200 },
				),
		);
		vi.stubGlobal("fetch", fetchMock);
		mockRemoteSession("user-a");
		render(<JsonBackupSection />);

		await user.upload(screen.getByTestId("json-backup-cloud-import-input"), buildUnsupportedVersionFile());
		expect(await screen.findByRole("alert")).not.toBeNull();
		expect(fetchMock).not.toHaveBeenCalled();

		await user.upload(screen.getByTestId("json-backup-cloud-import-input"), buildBackupFile());

		expect((await screen.findByTestId("json-backup-import-message")).textContent).toBe(
			"已匯入 2 位參賽者、0 筆歷史、0 個回合、0 個場次計分板。",
		);
		expect(screen.queryByRole("alert")).toBeNull();
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});
});

describe("JsonBackupSection 等待中", () => {
	it("session 等待中時以等待中提示取代匯出與還原操作", () => {
		mockPendingSession();

		render(<JsonBackupSection />);

		expect(screen.getByRole("heading", { name: "JSON 完整備份" })).not.toBeNull();
		expect(screen.getByRole("status").textContent).toBe("正在載入資料…");
		expect(screen.queryByRole("button", { name: "匯出 JSON" })).toBeNull();
		expect(screen.queryByTestId("json-backup-import-input")).toBeNull();
		expect(screen.queryByTestId("json-backup-cloud-import-input")).toBeNull();
	});
});
