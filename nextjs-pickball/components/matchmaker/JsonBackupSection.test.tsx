// components/matchmaker/JsonBackupSection.test.tsx
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EXPECTED_USER_ID_HEADER } from "@pickball/core/api/headers";
import { useSession } from "@/hooks/useSession";
import type { UseSessionResult } from "@/hooks/useSession";
import { parseBackup } from "@/lib/matchmaker/backup";
import {
	APPEND_ACTION_LABEL,
	APPEND_CANCEL_LABEL,
	APPEND_NAME_CHECK_HINT,
	APPEND_RULES,
	LOCAL_IMPORT_MESSAGES,
	describeAppendMatchedPlayers,
	describeAppendNewPlayers,
	describeAppendPreview,
} from "./local-import-view";
import { REMOTE_TRANSFER_MESSAGES } from "@/lib/matchmaker/remote-transfer";
import { HISTORY_STORAGE_KEY, ROSTER_STORAGE_KEY, ROUND_STORAGE_KEY } from "@/lib/matchmaker/storage-keys";
import { MATCH_SLOTS_KEY, STORAGE_KEY as SCOREBOARD_CURRENT_KEY } from "@/lib/scoreboard/storage-keys";
import { JsonBackupSection } from "./JsonBackupSection";
import { LOCAL_FALLBACK_ACTION_LABEL, syncStatusMessage } from "@/lib/sync/sync-status";

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

function mockUnavailableSession(): void {
	const session: UseSessionResult = {
		status: "loading",
		signedInHint: true,
		unavailable: true,
		hydrated: true,
		refresh,
	};
	vi.mocked(useSession).mockReturnValue(session);
}

// 附加流程用的備份與 fetch 夾具。與上方 buildBackupFile 分開：那份備份固定兩位參賽者、無歷史、無回合，
// 附加流程需要自訂名單、歷史與回合。
function makePlayer(id: string, name: string) {
	return {
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
	};
}

function makeHistoryEntry(matchId: string, playerA: { id: string; name: string }, playerB: { id: string; name: string }) {
	return {
		format: "singles",
		matchId,
		courtNumber: 1,
		playedAt: "2026-01-02T00:00:00.000Z",
		teamA: { rating: 3, players: [{ ...playerA, ratingBefore: 3, ratingAfter: 3.2 }] },
		teamB: { rating: 3, players: [{ ...playerB, ratingBefore: 3, ratingAfter: 2.8 }] },
		scoreA: 11,
		scoreB: 4,
		winner: "teamA",
	};
}

function makePendingRound() {
	return {
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
					{ playerIds: ["b1"], rating: 3 },
					{ playerIds: ["b2"], rating: 3 },
				],
				status: "pending",
				scores: null,
				winner: null,
				completedAt: null,
				playerRatings: [
					{ playerId: "b1", before: 3, after: null },
					{ playerId: "b2", before: 3, after: null },
				],
			},
		],
		restingPlayerIds: [],
		seenSignatures: { teammateKeys: [], opponentKeys: [], fullMatchKeys: [] },
		timer: null,
	};
}

interface BackupSpec {
	players: ReturnType<typeof makePlayer>[];
	history: ReturnType<typeof makeHistoryEntry>[];
}

// 一律帶一個進行中回合：附加只取參賽者與歷史，回合是否被丟棄要能從請求 body 看出來
function makeBackupFile({ players, history }: BackupSpec): File {
	const backup = { version: 1, players, currentRound: makePendingRound(), history };
	return new File([JSON.stringify(backup)], "backup.json", { type: "application/json" });
}

// 備份：「甲」「丙」兩位與一筆歷史，id 與下方 cloudPlayersBody 的雲端名單皆不同
function makeAppendBackupFile(): File {
	const jia = makePlayer("b1", "甲");
	const bing = makePlayer("b2", "丙");
	return makeBackupFile({ players: [jia, bing], history: [makeHistoryEntry("bh1", jia, bing)] });
}

function jsonResponse(status: number, body: unknown): Response {
	return new Response(JSON.stringify(body), { status });
}

function cloudPlayersBody(players: ReturnType<typeof makePlayer>[]) {
	return { items: players.map((data) => ({ data, version: 1 })) };
}

const APPENDED_BODY = { appended: { players: { added: 1, skipped: 1 }, history: { added: 1, skipped: 0 } } };

function callsTo(fetchMock: ReturnType<typeof vi.fn<typeof fetch>>, path: string, method: string) {
	return fetchMock.mock.calls.filter(([url, init]) => url === path && init?.method === method);
}

function expectedUserIdOf(init: RequestInit | undefined): string | undefined {
	return (init?.headers as Record<string, string>)[EXPECTED_USER_ID_HEADER];
}

function listItemTexts(testId: string): string[] {
	return within(screen.getByTestId(testId))
		.getAllByRole("listitem")
		.map((item) => item.textContent ?? "");
}

function appendButton(): HTMLElement {
	return screen.getByRole("button", { name: APPEND_ACTION_LABEL });
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

describe("JsonBackupSection 雲端附加流程", () => {
	it("雲端已有資料時顯示附加確認、預覽名單與四條說明，按下附加到雲端才以當下帳號送出附加請求", async () => {
		const user = userEvent.setup();
		localStorage.setItem(ROSTER_STORAGE_KEY, JSON.stringify({ version: 1, players: [] }));
		const before = snapshotKeys();
		let resolveAppend: (response: Response) => void = () => {};
		const appendResponse = new Promise<Response>((resolve) => {
			resolveAppend = resolve;
		});
		const fetchMock = vi.fn<typeof fetch>();
		fetchMock.mockImplementation(async (input) => {
			if (input === "/api/import") return jsonResponse(409, { error: "VERSION_CONFLICT" });
			if (input === "/api/matchmaker/players") return jsonResponse(200, cloudPlayersBody([makePlayer("c1", "甲")]));
			return appendResponse;
		});
		vi.stubGlobal("fetch", fetchMock);
		mockRemoteSession("user-a");
		const { rerender } = render(<JsonBackupSection />);
		const file = makeAppendBackupFile();
		const parsed = parseBackup(await file.text());
		expect(parsed.ok).toBe(true);
		if (!parsed.ok) return;

		await user.upload(screen.getByTestId("json-backup-cloud-import-input"), file);

		const confirm = await screen.findByTestId("json-backup-append-confirm");
		expect(confirm.textContent).toContain(describeAppendPreview(2, 1));
		expect(confirm.textContent).toContain(describeAppendNewPlayers(1));
		expect(confirm.textContent).toContain(describeAppendMatchedPlayers(1));
		expect(confirm.textContent).toContain(APPEND_NAME_CHECK_HINT);
		expect(listItemTexts("json-backup-append-new-players")).toEqual(["丙"]);
		expect(listItemTexts("json-backup-append-matched-players")).toEqual(["甲"]);
		expect(listItemTexts("json-backup-append-rules")).toEqual(APPEND_RULES);
		expect(appendButton().getAttribute("type")).toBe("button");
		expect(screen.getByRole("button", { name: APPEND_CANCEL_LABEL }).getAttribute("type")).toBe("button");
		expect(screen.queryByText(LOCAL_IMPORT_MESSAGES.cloudNotEmpty)).toBeNull();
		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(fetchMock.mock.calls[0][0]).toBe("/api/import");
		expect(fetchMock.mock.calls[0][1]?.method).toBe("POST");
		expect(expectedUserIdOf(fetchMock.mock.calls[0][1])).toBe("user-a");
		expect(fetchMock.mock.calls[1][0]).toBe("/api/matchmaker/players");
		expect(fetchMock.mock.calls[1][1]?.method).toBe("GET");
		expect(expectedUserIdOf(fetchMock.mock.calls[1][1])).toBe("user-a");

		// 按下前才換帳號：附加請求取按下當下的 session，不沿用選檔當下的
		mockRemoteSession("user-b");
		rerender(<JsonBackupSection />);
		await user.click(appendButton());

		await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
		expect((appendButton() as HTMLButtonElement).disabled).toBe(true);
		expect((screen.getByRole("button", { name: APPEND_CANCEL_LABEL }) as HTMLButtonElement).disabled).toBe(true);
		const [url, init] = fetchMock.mock.calls[2];
		expect(url).toBe("/api/import/append");
		expect(init?.method).toBe("POST");
		expect(expectedUserIdOf(init)).toBe("user-b");
		expect(JSON.parse(init?.body as string)).toEqual({ players: parsed.backup.players, history: parsed.backup.history });

		resolveAppend(jsonResponse(200, APPENDED_BODY));

		expect((await screen.findByTestId("json-backup-import-message")).textContent).toBe(
			"已新增 1 位參賽者、1 筆歷史。",
		);
		expect(screen.getByTestId("json-backup-import-message-note").textContent).toBe(
			"略過同名或已在雲端的參賽者 1 位。",
		);
		expect(screen.queryByTestId("json-backup-append-confirm")).toBeNull();
		expect(refresh).not.toHaveBeenCalled();
		expect(snapshotKeys()).toEqual(before);
	});

	it("附加確認按下取消或重新選檔時不送出附加請求並收起確認", async () => {
		const user = userEvent.setup();
		localStorage.setItem(ROSTER_STORAGE_KEY, JSON.stringify({ version: 1, players: [] }));
		const before = snapshotKeys();
		const importStatuses = [409, 409, 200];
		const fetchMock = vi.fn<typeof fetch>();
		fetchMock.mockImplementation(async (input) => {
			if (input === "/api/import") {
				const status = importStatuses.shift() ?? 500;
				if (status === 409) return jsonResponse(409, { error: "VERSION_CONFLICT" });
				return jsonResponse(200, {
					imported: { players: 2, round: false, slots: 0, history: 0, scoreboardCurrent: "none" },
				});
			}
			if (input === "/api/matchmaker/players") return jsonResponse(200, cloudPlayersBody([makePlayer("c1", "甲")]));
			return jsonResponse(500, {});
		});
		vi.stubGlobal("fetch", fetchMock);
		mockRemoteSession("user-a");
		render(<JsonBackupSection />);

		await user.upload(screen.getByTestId("json-backup-cloud-import-input"), makeAppendBackupFile());
		await screen.findByTestId("json-backup-append-confirm");
		await user.click(screen.getByRole("button", { name: APPEND_CANCEL_LABEL }));

		expect(screen.queryByTestId("json-backup-append-confirm")).toBeNull();
		expect(screen.queryByRole("alert")).toBeNull();
		expect(screen.queryByTestId("json-backup-import-message")).toBeNull();

		await user.upload(screen.getByTestId("json-backup-cloud-import-input"), makeAppendBackupFile());
		await screen.findByTestId("json-backup-append-confirm");
		// 改選另一份備份檔：這次雲端回 200，前一份的附加確認必須收起
		await user.upload(screen.getByTestId("json-backup-cloud-import-input"), buildBackupFile());

		expect((await screen.findByTestId("json-backup-import-message")).textContent).toBe(
			"已匯入 2 位參賽者、0 筆歷史、0 個回合、0 個場次計分板。",
		);
		expect(screen.queryByTestId("json-backup-append-confirm")).toBeNull();
		expect(callsTo(fetchMock, "/api/import", "POST")).toHaveLength(3);
		expect(callsTo(fetchMock, "/api/matchmaker/players", "GET")).toHaveLength(2);
		expect(callsTo(fetchMock, "/api/import/append", "POST")).toHaveLength(0);
		expect(snapshotKeys()).toEqual(before);

		// 過期結果（regression guard）：重新選檔後才回應的請求，不得覆寫新一次選檔的狀態。
		// 選檔元素在請求進行中不會停用，所以三種情境都可能發生。
		const IMPORTED_TEXT = "已匯入 2 位參賽者、0 筆歷史、0 個回合、0 個場次計分板。";
		const importedBody = {
			imported: { players: 2, round: false, slots: 0, history: 0, scoreboardCurrent: "none" },
		};
		function deferredResponse() {
			let resolve: (response: Response) => void = () => {};
			const promise = new Promise<Response>((done) => {
				resolve = done;
			});
			return { promise, resolve };
		}
		async function settleLateResponse(resolve: () => void) {
			await act(async () => {
				resolve();
				await new Promise((done) => setTimeout(done, 20));
			});
		}

		// ① 名單 GET 尚未回應時重新選檔：舊 GET 晚到後不得顯示舊確認
		cleanup();
		const lateList = deferredResponse();
		const listImportStatuses = [409, 200];
		const listFetch = vi.fn<typeof fetch>();
		listFetch.mockImplementation(async (input) => {
			if (input === "/api/import") {
				return listImportStatuses.shift() === 409
					? jsonResponse(409, { error: "VERSION_CONFLICT" })
					: jsonResponse(200, importedBody);
			}
			return lateList.promise;
		});
		vi.stubGlobal("fetch", listFetch);
		mockRemoteSession("user-a");
		render(<JsonBackupSection />);
		await user.upload(screen.getByTestId("json-backup-cloud-import-input"), makeAppendBackupFile());
		await waitFor(() => expect(callsTo(listFetch, "/api/matchmaker/players", "GET")).toHaveLength(1));
		await user.upload(screen.getByTestId("json-backup-cloud-import-input"), buildBackupFile());
		expect((await screen.findByTestId("json-backup-import-message")).textContent).toBe(IMPORTED_TEXT);
		await settleLateResponse(() => lateList.resolve(jsonResponse(200, cloudPlayersBody([makePlayer("c1", "甲")]))));
		expect(screen.queryByTestId("json-backup-append-confirm")).toBeNull();
		expect(screen.getByTestId("json-backup-import-message").textContent).toBe(IMPORTED_TEXT);

		// ② 整份匯入 POST 尚未回應時重新選檔：舊 POST 晚到後不得顯示舊確認，也不得再讀名單
		cleanup();
		const lateImport = deferredResponse();
		let importCalls = 0;
		const importFetch = vi.fn<typeof fetch>();
		importFetch.mockImplementation(async (input) => {
			if (input === "/api/import") {
				importCalls += 1;
				return importCalls === 1 ? lateImport.promise : jsonResponse(200, importedBody);
			}
			return jsonResponse(200, cloudPlayersBody([makePlayer("c1", "甲")]));
		});
		vi.stubGlobal("fetch", importFetch);
		mockRemoteSession("user-a");
		render(<JsonBackupSection />);
		await user.upload(screen.getByTestId("json-backup-cloud-import-input"), makeAppendBackupFile());
		await waitFor(() => expect(importCalls).toBe(1));
		await user.upload(screen.getByTestId("json-backup-cloud-import-input"), buildBackupFile());
		expect((await screen.findByTestId("json-backup-import-message")).textContent).toBe(IMPORTED_TEXT);
		await settleLateResponse(() => lateImport.resolve(jsonResponse(409, { error: "VERSION_CONFLICT" })));
		expect(screen.queryByTestId("json-backup-append-confirm")).toBeNull();
		expect(screen.queryByRole("alert")).toBeNull();
		expect(callsTo(importFetch, "/api/matchmaker/players", "GET")).toHaveLength(0);
		expect(screen.getByTestId("json-backup-import-message").textContent).toBe(IMPORTED_TEXT);

		// ③ 附加 POST 尚未回應時重新選檔：舊結果晚到後不得覆寫新狀態（失敗文案不出現）
		cleanup();
		const lateAppend = deferredResponse();
		let thirdImportCalls = 0;
		const appendFetch = vi.fn<typeof fetch>();
		appendFetch.mockImplementation(async (input) => {
			if (input === "/api/import") {
				thirdImportCalls += 1;
				return thirdImportCalls === 1 ? jsonResponse(409, { error: "VERSION_CONFLICT" }) : jsonResponse(200, importedBody);
			}
			if (input === "/api/matchmaker/players") return jsonResponse(200, cloudPlayersBody([makePlayer("c1", "甲")]));
			return lateAppend.promise;
		});
		vi.stubGlobal("fetch", appendFetch);
		mockRemoteSession("user-a");
		render(<JsonBackupSection />);
		await user.upload(screen.getByTestId("json-backup-cloud-import-input"), makeAppendBackupFile());
		await screen.findByTestId("json-backup-append-confirm");
		await user.click(appendButton());
		await waitFor(() => expect(callsTo(appendFetch, "/api/import/append", "POST")).toHaveLength(1));
		await user.upload(screen.getByTestId("json-backup-cloud-import-input"), buildBackupFile());
		expect((await screen.findByTestId("json-backup-import-message")).textContent).toBe(IMPORTED_TEXT);
		await settleLateResponse(() => lateAppend.resolve(jsonResponse(500, { error: "X" })));
		expect(screen.queryByRole("alert")).toBeNull();
		expect(screen.getByTestId("json-backup-import-message").textContent).toBe(IMPORTED_TEXT);
		expect(snapshotKeys()).toEqual(before);
	});

	it("附加請求未授權時刷新 session，資料過大與其他失敗顯示對應文案且不寫入本機", async () => {
		const user = userEvent.setup();
		localStorage.setItem(ROSTER_STORAGE_KEY, JSON.stringify({ version: 1, players: [] }));
		const before = snapshotKeys();
		let appendStatus = 401;
		const fetchMock = vi.fn<typeof fetch>();
		fetchMock.mockImplementation(async (input) => {
			if (input === "/api/import") return jsonResponse(409, { error: "VERSION_CONFLICT" });
			if (input === "/api/matchmaker/players") return jsonResponse(200, cloudPlayersBody([makePlayer("c1", "甲")]));
			return jsonResponse(appendStatus, { error: "X" });
		});
		vi.stubGlobal("fetch", fetchMock);

		async function appendFromFreshRender() {
			cleanup();
			mockRemoteSession("user-a");
			const view = render(<JsonBackupSection />);
			await user.upload(screen.getByTestId("json-backup-cloud-import-input"), makeAppendBackupFile());
			await screen.findByTestId("json-backup-append-confirm");
			return view;
		}

		await appendFromFreshRender();
		await user.click(appendButton());
		expect((await screen.findByRole("alert")).textContent).toBe(REMOTE_TRANSFER_MESSAGES.unauthorized);
		expect(refresh).toHaveBeenCalledTimes(1);
		expect(screen.queryByTestId("json-backup-append-confirm")).toBeNull();
		expect(screen.queryByTestId("json-backup-import-message")).toBeNull();
		expect(snapshotKeys()).toEqual(before);

		appendStatus = 413;
		await appendFromFreshRender();
		await user.click(appendButton());
		expect((await screen.findByRole("alert")).textContent).toBe(LOCAL_IMPORT_MESSAGES.tooLarge);
		expect(refresh).toHaveBeenCalledTimes(1);
		expect(screen.queryByTestId("json-backup-append-confirm")).toBeNull();
		expect(screen.queryByTestId("json-backup-import-message")).toBeNull();
		expect(snapshotKeys()).toEqual(before);

		appendStatus = 500;
		await appendFromFreshRender();
		await user.click(appendButton());
		expect((await screen.findByRole("alert")).textContent).toBe(LOCAL_IMPORT_MESSAGES.failed);
		expect(refresh).toHaveBeenCalledTimes(1);
		expect(screen.queryByTestId("json-backup-append-confirm")).toBeNull();
		expect(screen.queryByTestId("json-backup-import-message")).toBeNull();
		expect(snapshotKeys()).toEqual(before);

		// 確認出現後 session 資料殘缺（取不到 user id）：不送出附加請求，改顯示未授權
		const appendCallsBefore = callsTo(fetchMock, "/api/import/append", "POST").length;
		const { rerender } = await appendFromFreshRender();
		mockSessionWithoutUserId();
		rerender(<JsonBackupSection />);
		await user.click(appendButton());
		expect((await screen.findByRole("alert")).textContent).toBe(REMOTE_TRANSFER_MESSAGES.unauthorized);
		expect(callsTo(fetchMock, "/api/import/append", "POST")).toHaveLength(appendCallsBefore);
		expect(screen.queryByTestId("json-backup-append-confirm")).toBeNull();
		expect(screen.queryByTestId("json-backup-import-message")).toBeNull();
		expect(snapshotKeys()).toEqual(before);
	});

	it("備份沒有可附加的參賽者與歷史時顯示無可附加且不渲染附加按鈕", async () => {
		const user = userEvent.setup();
		localStorage.setItem(ROSTER_STORAGE_KEY, JSON.stringify({ version: 1, players: [] }));
		const before = snapshotKeys();
		const fetchMock = vi.fn<typeof fetch>();
		fetchMock.mockImplementation(async () => jsonResponse(409, { error: "VERSION_CONFLICT" }));
		vi.stubGlobal("fetch", fetchMock);
		mockRemoteSession("user-a");
		render(<JsonBackupSection />);

		await user.upload(screen.getByTestId("json-backup-cloud-import-input"), makeBackupFile({ players: [], history: [] }));

		expect((await screen.findByRole("alert")).textContent).toBe(LOCAL_IMPORT_MESSAGES.appendNothing);
		expect(screen.queryByTestId("json-backup-append-confirm")).toBeNull();
		expect(screen.queryByRole("button", { name: APPEND_ACTION_LABEL })).toBeNull();
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(snapshotKeys()).toEqual(before);
	});

	it("附加確認在沒有會新增的參賽者時顯示提示且仍可附加歷史", async () => {
		const user = userEvent.setup();
		const fetchMock = vi.fn<typeof fetch>();
		fetchMock.mockImplementation(async (input) => {
			if (input === "/api/import") return jsonResponse(409, { error: "VERSION_CONFLICT" });
			return jsonResponse(200, cloudPlayersBody([makePlayer("c1", "甲")]));
		});
		vi.stubGlobal("fetch", fetchMock);
		mockRemoteSession("user-a");
		render(<JsonBackupSection />);
		const jia = makePlayer("b1", "甲");
		const other = makePlayer("z9", "戊");

		await user.upload(
			screen.getByTestId("json-backup-cloud-import-input"),
			makeBackupFile({ players: [jia], history: [makeHistoryEntry("bh1", jia, other)] }),
		);

		expect((await screen.findByTestId("json-backup-append-no-new-players")).textContent).toBe(
			LOCAL_IMPORT_MESSAGES.appendNoNewPlayers,
		);
		expect(screen.queryByTestId("json-backup-append-new-players")).toBeNull();
		expect(screen.queryByText(APPEND_NAME_CHECK_HINT)).toBeNull();
		expect(listItemTexts("json-backup-append-matched-players")).toEqual(["甲"]);
		expect((appendButton() as HTMLButtonElement).disabled).toBe(false);
	});

	it("讀取雲端名單未授權時刷新 session，其他失敗顯示讀取失敗，兩者皆不顯示附加確認", async () => {
		const user = userEvent.setup();
		localStorage.setItem(ROSTER_STORAGE_KEY, JSON.stringify({ version: 1, players: [] }));
		const before = snapshotKeys();
		let playersStatus = 401;
		const fetchMock = vi.fn<typeof fetch>();
		fetchMock.mockImplementation(async (input) => {
			if (input === "/api/import") return jsonResponse(409, { error: "VERSION_CONFLICT" });
			return jsonResponse(playersStatus, { error: "X" });
		});
		vi.stubGlobal("fetch", fetchMock);

		async function expectNoConfirmAfterUpload() {
			cleanup();
			mockRemoteSession("user-a");
			render(<JsonBackupSection />);
			await user.upload(screen.getByTestId("json-backup-cloud-import-input"), makeAppendBackupFile());
		}

		await expectNoConfirmAfterUpload();
		expect((await screen.findByRole("alert")).textContent).toBe(REMOTE_TRANSFER_MESSAGES.unauthorized);
		expect(refresh).toHaveBeenCalledTimes(1);
		expect(screen.queryByTestId("json-backup-append-confirm")).toBeNull();
		expect(screen.queryByRole("button", { name: APPEND_ACTION_LABEL })).toBeNull();
		expect(screen.queryByTestId("json-backup-import-message")).toBeNull();

		playersStatus = 500;
		await expectNoConfirmAfterUpload();
		expect((await screen.findByRole("alert")).textContent).toBe(LOCAL_IMPORT_MESSAGES.appendPreviewFailed);
		expect(refresh).toHaveBeenCalledTimes(1);
		expect(screen.queryByTestId("json-backup-append-confirm")).toBeNull();
		expect(screen.queryByRole("button", { name: APPEND_ACTION_LABEL })).toBeNull();
		expect(screen.queryByTestId("json-backup-import-message")).toBeNull();
		expect(callsTo(fetchMock, "/api/import/append", "POST")).toHaveLength(0);
		expect(snapshotKeys()).toEqual(before);
	});

	// regression guard（加入即綠）：雲端為空時整份匯入的行為在附加流程加入前已存在
	it("雲端沒有資料時照舊整份匯入且不顯示附加確認", async () => {
		const user = userEvent.setup();
		const fetchMock = vi.fn<typeof fetch>();
		fetchMock.mockImplementation(async () =>
			jsonResponse(200, { imported: { players: 2, round: false, slots: 0, history: 0, scoreboardCurrent: "none" } }),
		);
		vi.stubGlobal("fetch", fetchMock);
		mockRemoteSession("user-a");
		render(<JsonBackupSection />);

		await user.upload(screen.getByTestId("json-backup-cloud-import-input"), buildBackupFile());

		expect((await screen.findByTestId("json-backup-import-message")).textContent).toBe(
			"已匯入 2 位參賽者、0 筆歷史、0 個回合、0 個場次計分板。",
		);
		expect(screen.queryByTestId("json-backup-append-confirm")).toBeNull();
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(fetchMock.mock.calls[0][0]).toBe("/api/import");
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

	it("session 無法確認時以無法載入提示與按鈕取代匯出與還原操作", () => {
		mockUnavailableSession();

		const { container } = render(<JsonBackupSection />);

		expect(screen.getByRole("heading", { name: "JSON 完整備份" })).not.toBeNull();
		expect(screen.getByRole("status").textContent).toBe(syncStatusMessage("load-failed"));
		expect(screen.getByRole("button", { name: LOCAL_FALLBACK_ACTION_LABEL })).not.toBeNull();
		expect(container.querySelector('[data-sync-status="unavailable"]')).not.toBeNull();
		expect(screen.queryByRole("button", { name: "匯出 JSON" })).toBeNull();
		expect(screen.queryByTestId("json-backup-import-input")).toBeNull();
		expect(screen.queryByTestId("json-backup-cloud-import-input")).toBeNull();
	});
});
