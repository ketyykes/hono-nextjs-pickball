import { describe, it, expect } from "vitest";
import { matchmakerSectionTabs } from "./section-nav";

// matchmaker 區段導覽（對戰／參賽者）的 active 判定——純函式，元件層
// （app/matchmaker/layout.tsx）以 E2E 驗收，見 tests/e2e/specs/match-stage.spec.ts。
describe("matchmakerSectionTabs", () => {
	it("目前路徑對應的分頁為 active，其餘分頁為非 active", () => {
		const onMatchesPage = matchmakerSectionTabs("/matchmaker");
		const matchesTabOnMatchesPage = onMatchesPage.find(
			(tab) => tab.href === "/matchmaker",
		);
		const playersTabOnMatchesPage = onMatchesPage.find(
			(tab) => tab.href === "/matchmaker/players",
		);
		expect(matchesTabOnMatchesPage?.active).toBe(true);
		expect(playersTabOnMatchesPage?.active).toBe(false);

		const onPlayersPage = matchmakerSectionTabs("/matchmaker/players");
		const matchesTabOnPlayersPage = onPlayersPage.find(
			(tab) => tab.href === "/matchmaker",
		);
		const playersTabOnPlayersPage = onPlayersPage.find(
			(tab) => tab.href === "/matchmaker/players",
		);
		expect(matchesTabOnPlayersPage?.active).toBe(false);
		expect(playersTabOnPlayersPage?.active).toBe(true);
	});

	// regression guard：釘住 label／href／順序，避免分頁互換或多混入一筆
	// 仍被既有斷言（只挑 active 欄位）放過。
	it("分頁清單依序為對戰、參賽者、歷史、資料與統計五筆", () => {
		expect(matchmakerSectionTabs("/matchmaker")).toEqual([
			{ label: "對戰", href: "/matchmaker", active: true },
			{ label: "參賽者", href: "/matchmaker/players", active: false },
			{ label: "歷史", href: "/matchmaker/history", active: false },
			{ label: "資料", href: "/matchmaker/data", active: false },
			{ label: "統計", href: "/matchmaker/stats", active: false },
		]);
	});

	// 統計頁的路徑以對戰頁路徑為前綴（/matchmaker/stats vs /matchmaker），若 active
	// 判定被改成前綴比對，開統計頁時「對戰」也會同時亮起；本 it 從統計頁這一側正面
	// 鎖住「恰好一個分頁 active」，上面兩個 it 的路徑都無法覆蓋這個方向。
	it("統計頁路徑下只有統計分頁為 active", () => {
		const onStatsPage = matchmakerSectionTabs("/matchmaker/stats");
		expect(onStatsPage.filter((tab) => tab.active)).toEqual([
			{ label: "統計", href: "/matchmaker/stats", active: true },
		]);
	});
});
