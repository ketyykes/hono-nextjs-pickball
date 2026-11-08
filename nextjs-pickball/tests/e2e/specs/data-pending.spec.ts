import { test, expect, type Page } from "@playwright/test";
import { SIGNED_IN_HINT_STORAGE_KEY } from "@/lib/auth/session-hint";
import { DATA_PENDING_MESSAGE } from "@/lib/sync/sync-status";
import {
	HISTORY_STORAGE_KEY,
	ROSTER_STORAGE_KEY,
	ROUND_STORAGE_KEY,
} from "@/lib/matchmaker/storage-keys";
import { STORAGE_KEY as SCOREBOARD_STORAGE_KEY } from "@/lib/scoreboard/storage-keys";
import { installFlashRecorder, readFlashHits } from "../helpers/flash-recorder";
import { holdSession } from "../helpers/hold-session";

// 資料來源確定前只能顯示等待中提示：訪客載入本機資料的過程中不可閃出空狀態或預設值，
// 殘留上次登入提示時要先等待、確認非登入後才回到本機名單。
// 本檔不帶 storageState，以訪客身分執行。

const EMPTY_TEXTS = [
	"目前還沒有參賽者",
	"共 0 位參賽者",
	"目前沒有可出場的參賽者",
	"尚未產生任何回合",
	"還沒有任何對戰紀錄",
];
const ZERO_SCORE_SELECTOR = '[aria-label="我方目前 0 分"]';
const PENDING_MAIN = 'main[data-sync-status="pending"]';
const PLAYERS_PAGE = "/matchmaker/players";

function isoToday(hour = 10): string {
	const now = new Date();
	return new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, 0, 0).toISOString();
}

function rosterPlayer(id: string, name: string) {
	return {
		id,
		name,
		gender: "other" as const,
		colorFrom: "#4f46e5",
		colorTo: "#818cf8",
		rating: 3,
		restCount: 0,
		gamesPlayed: 0,
		isActive: true,
		createdAt: "2026-01-01T00:00:00.000Z",
	};
}

// 欄位順序與形狀比照 player-stats.spec.ts 的 buildRound（pending 狀態，避開 completed 的跨欄位檢查）
function buildRound(matchId: string, teamAId: string, teamBId: string) {
	return {
		roundNumber: 1,
		createdAt: isoToday(8),
		format: "singles" as const,
		courtCount: 1,
		targetScore: 11,
		matches: [
			{
				id: matchId,
				courtNumber: 1,
				format: "singles" as const,
				teams: [
					{ playerIds: [teamAId], rating: 3 },
					{ playerIds: [teamBId], rating: 3 },
				],
				status: "pending" as const,
				scores: null,
				winner: null,
				completedAt: null,
				playerRatings: [
					{ playerId: teamAId, before: 3, after: null },
					{ playerId: teamBId, before: 3, after: null },
				],
			},
		],
		restingPlayerIds: [],
		seenSignatures: { teammateKeys: [], opponentKeys: [], fullMatchKeys: [] },
		timer: null,
	};
}

function buildHistoryEntry(matchId: string, nameA: string, nameB: string) {
	return {
		matchId,
		courtNumber: 1,
		playedAt: isoToday(9),
		teamA: { players: [{ id: "p-a", name: nameA, ratingBefore: 3, ratingAfter: 3.1 }], rating: 3 },
		teamB: { players: [{ id: "p-b", name: nameB, ratingBefore: 3, ratingAfter: 2.9 }], rating: 3 },
		scoreA: 11,
		scoreB: 5,
		winner: "teamA" as const,
		format: "singles" as const,
	};
}

function buildScoreboard(us: number, them: number) {
	return {
		mode: "doubles",
		scores: { us, them },
		servingTeam: "us",
		serverNumber: 2,
		isFirstServiceOfGame: false,
		history: [],
		status: "playing",
		winner: null,
		firstServer: "us",
		targetScore: 11,
		matchId: null,
		courtNumber: null,
		teamPlayers: null,
	};
}

async function seedStorage(page: Page, entries: Record<string, string>) {
	// 先進站內頁面才有 localStorage 可寫
	await page.goto("/");
	await page.evaluate((items: Record<string, string>) => {
		for (const [key, value] of Object.entries(items)) {
			window.localStorage.setItem(key, value);
		}
	}, entries);
}

test.describe("資料來源確定前的等待中畫面（訪客）", () => {
	test("訪客載入本機資料的過程中參賽者、對戰、統計與計分板頁從未出現空狀態或預設值", async ({ page }) => {
		await seedStorage(page, {
			[ROSTER_STORAGE_KEY]: JSON.stringify({
				version: 1,
				players: [rosterPlayer("p-a", "本機甲"), rosterPlayer("p-b", "本機乙")],
			}),
			[ROUND_STORAGE_KEY]: JSON.stringify({ version: 1, round: buildRound("m-1", "p-a", "p-b") }),
			[HISTORY_STORAGE_KEY]: JSON.stringify({
				version: 1,
				entries: [buildHistoryEntry("h-1", "本機甲", "本機乙")],
			}),
			[SCOREBOARD_STORAGE_KEY]: JSON.stringify(buildScoreboard(5, 3)),
		});
		await installFlashRecorder(page, { texts: EMPTY_TEXTS, selectors: [ZERO_SCORE_SELECTOR] });

		const visibleLocal = [
			{ path: PLAYERS_PAGE, locator: page.getByText("本機甲").first() },
			{ path: "/matchmaker", locator: page.locator('[data-testid^="court-"][data-testid$="-grid"]') },
			{ path: "/matchmaker/stats", locator: page.getByTestId("player-stat-row-p-a") },
			{ path: "/scoreboard", locator: page.locator('[aria-label="我方目前 5 分"]') },
		];

		for (const { path, locator } of visibleLocal) {
			await page.goto(path);
			await expect(locator, `${path} 本機資料應可見`).toBeVisible();
			expect(await readFlashHits(page), `${path} 的閃爍記錄`).toEqual([]);
			await expect(page.locator("[data-sync-status]"), `${path} 不應有同步屬性`).toHaveCount(0);
		}
	});

	test("訪客重新整理參賽者頁時在 session 回應前即顯示本機名單", async ({ page }) => {
		await seedStorage(page, {
			[ROSTER_STORAGE_KEY]: JSON.stringify({ version: 1, players: [rosterPlayer("p-a", "本機甲")] }),
		});
		await page.goto(PLAYERS_PAGE);
		await expect(page.getByText("本機甲").first()).toBeVisible();

		await installFlashRecorder(page, { texts: EMPTY_TEXTS, selectors: [] });

		const release = await holdSession(page);
		const sessionResponse = page.waitForResponse("**/api/session");
		try {
			await page.reload();
			await expect(page.getByText("本機甲").first()).toBeVisible();
			await expect(page.locator("[data-sync-status]")).toHaveCount(0);
			await expect(page.getByRole("status")).toHaveCount(0);
			release();
			// 等 session 回應到達，放行後的斷言才確實涵蓋回應之後的畫面
			await sessionResponse;
			await expect(page.getByText("本機甲").first()).toBeVisible();
			await expect(page.locator("[data-sync-status]")).toHaveCount(0);
			await expect(page.getByRole("status")).toHaveCount(0);
			expect(await readFlashHits(page), "重新整理過程的閃爍記錄").toEqual([]);
		} finally {
			release();
			await page.unrouteAll({ behavior: "ignoreErrors" });
		}
	});

	test("上次登入提示殘留但已非登入時先顯示等待中再顯示本機名單並清除提示", async ({ page }) => {
		await seedStorage(page, {
			[ROSTER_STORAGE_KEY]: JSON.stringify({ version: 1, players: [rosterPlayer("p-a", "本機甲")] }),
		});
		// 提示改在下一個文件載入前才寫入：seedStorage 開的首頁若還有 session 回應在途，
		// 回應確認為訪客時會清掉提示，先寫入會被它沖掉
		await page.addInitScript((key: string) => {
			window.localStorage.setItem(key, "1");
		}, SIGNED_IN_HINT_STORAGE_KEY);

		const release = await holdSession(page);
		const sessionResponse = page.waitForResponse("**/api/session");
		try {
			await page.goto(PLAYERS_PAGE);
			await expect(page.locator(PENDING_MAIN)).toBeVisible();
			await expect(page.getByText("本機甲")).toHaveCount(0);
			await expect(page.getByRole("status")).toHaveText(DATA_PENDING_MESSAGE);
			await expect(page.getByText("目前還沒有參賽者")).toHaveCount(0);
			release();
			await sessionResponse;
			await expect(page.getByText("本機甲").first()).toBeVisible();
			await expect(page.locator("[data-sync-status]")).toHaveCount(0);
			await expect
				.poll(() => page.evaluate((key) => window.localStorage.getItem(key), SIGNED_IN_HINT_STORAGE_KEY))
				.toBeNull();
		} finally {
			release();
			await page.unrouteAll({ behavior: "ignoreErrors" });
		}
	});
});
