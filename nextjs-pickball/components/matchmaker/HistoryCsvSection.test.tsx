// components/matchmaker/HistoryCsvSection.test.tsx
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useSession } from "@/hooks/useSession";
import type { UseSessionResult } from "@/hooks/useSession";
import { REMOTE_TRANSFER_MESSAGES, buildRemoteHistoryCsv } from "@/lib/matchmaker/remote-transfer";
import type { RemoteHistoryCsvResult } from "@/lib/matchmaker/remote-transfer";
import { downloadTextFile } from "./downloadTextFile";
import { HistoryCsvSection } from "./HistoryCsvSection";

vi.mock("@/hooks/useSession", () => ({ useSession: vi.fn() }));
vi.mock("./downloadTextFile", () => ({ downloadTextFile: vi.fn() }));
// 只替換 buildRemoteHistoryCsv，訊息常數保留實值，斷言才會跟著文案走
vi.mock("@/lib/matchmaker/remote-transfer", async () => {
	const actual = await vi.importActual<typeof import("@/lib/matchmaker/remote-transfer")>(
		"@/lib/matchmaker/remote-transfer",
	);
	return { ...actual, buildRemoteHistoryCsv: vi.fn() };
});

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

// 與真實 unauthorizedFailure() 相同：unauthorized 是不可列舉屬性，元件仍須讀得到
function buildUnauthorizedFailure(): RemoteHistoryCsvResult {
	const failure = { ok: false, message: REMOTE_TRANSFER_MESSAGES.unauthorized };
	return Object.defineProperty(failure, "unauthorized", {
		value: true,
		enumerable: false,
	}) as RemoteHistoryCsvResult;
}

beforeEach(() => {
	refresh.mockResolvedValue(undefined);
});

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

describe("HistoryCsvSection 雲端分支", () => {
	it("regression guard：雲端回未授權失敗時刷新 session、不下載並顯示訊息", async () => {
		const user = userEvent.setup();
		mockRemoteSession("user-a");
		vi.mocked(buildRemoteHistoryCsv).mockResolvedValue(buildUnauthorizedFailure());

		render(<HistoryCsvSection />);
		await user.click(screen.getByRole("button", { name: "匯出 CSV" }));

		expect((await screen.findByRole("alert")).textContent).toBe(REMOTE_TRANSFER_MESSAGES.unauthorized);
		expect(refresh).toHaveBeenCalledTimes(1);
		expect(downloadTextFile).not.toHaveBeenCalled();
	});

	it("regression guard：雲端讀取失敗（非未授權）時不下載、不刷新 session 並顯示訊息", async () => {
		const user = userEvent.setup();
		mockRemoteSession("user-a");
		vi.mocked(buildRemoteHistoryCsv).mockResolvedValue({
			ok: false,
			message: REMOTE_TRANSFER_MESSAGES.historyCsvFetchFailed,
		});

		render(<HistoryCsvSection />);
		await user.click(screen.getByRole("button", { name: "匯出 CSV" }));

		expect((await screen.findByRole("alert")).textContent).toBe(
			REMOTE_TRANSFER_MESSAGES.historyCsvFetchFailed,
		);
		expect(downloadTextFile).not.toHaveBeenCalled();
		expect(refresh).not.toHaveBeenCalled();
	});

	it("regression guard：雲端成功時以點擊當下的帳號請求並下載回傳的 CSV", async () => {
		const user = userEvent.setup();
		mockRemoteSession("user-a");
		vi.mocked(buildRemoteHistoryCsv).mockResolvedValue({ ok: true, csv: "cloud-csv-content" });

		const { rerender } = render(<HistoryCsvSection />);
		// 點擊前才換帳號，證明送出的是點擊當下的 session 而非 mount 時的
		mockRemoteSession("user-b");
		rerender(<HistoryCsvSection />);
		await user.click(screen.getByRole("button", { name: "匯出 CSV" }));

		expect(buildRemoteHistoryCsv).toHaveBeenCalledTimes(1);
		expect(buildRemoteHistoryCsv).toHaveBeenCalledWith("user-b");
		expect(downloadTextFile).toHaveBeenCalledTimes(1);
		expect(vi.mocked(downloadTextFile).mock.calls[0][0]).toBe("cloud-csv-content");
		expect(screen.queryByRole("alert")).toBeNull();
	});

	it("regression guard：本機模式不呼叫雲端 CSV 組裝", async () => {
		const user = userEvent.setup();
		mockGuestSession();

		render(<HistoryCsvSection />);
		await user.click(screen.getByRole("button", { name: "匯出 CSV" }));

		expect(buildRemoteHistoryCsv).not.toHaveBeenCalled();
	});
});

describe("HistoryCsvSection 等待中", () => {
	it("session 等待中時以等待中提示取代匯出操作", () => {
		mockPendingSession();

		render(<HistoryCsvSection />);

		expect(screen.getByRole("heading", { name: "歷史賽果 CSV 匯出" })).not.toBeNull();
		expect(screen.getByRole("status").textContent).toBe("正在載入資料…");
		expect(screen.queryByRole("button", { name: "匯出 CSV" })).toBeNull();
	});
});
