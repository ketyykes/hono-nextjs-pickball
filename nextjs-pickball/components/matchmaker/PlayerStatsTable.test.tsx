// components/matchmaker/PlayerStatsTable.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";

import { PlayerStatsTable } from "./PlayerStatsTable";
import { pickTextColor } from "@/lib/matchmaker/colors";
import { PLAYER_NOT_ON_ROSTER_LABEL } from "@/lib/matchmaker/labels";
import type { PlayerStat } from "@/lib/matchmaker/player-stats";

// 測試用的預設球員統計：欄位齊全，個別 it 只覆寫需要變動的欄位。
function buildStat(overrides: Partial<PlayerStat> = {}): PlayerStat {
	return {
		id: "p1",
		name: "王小明",
		colorFrom: "#0E6B63",
		colorTo: "#134E4A",
		onRoster: true,
		currentRating: 3.5,
		gamesPlayed: 10,
		wins: 6,
		losses: 4,
		winRate: 0.6,
		ratingDelta: 0.42,
		mostFrequentPartner: "陳小華",
		mostFrequentOpponent: "林大同",
		...overrides,
	};
}

describe("PlayerStatsTable", () => {
	it("球員色塊沿用既有漸層且已不在名單者有文字標示", () => {
		const onRosterStat = buildStat({
			id: "p1",
			name: "王小明",
			onRoster: true,
			colorFrom: "#0E6B63",
			colorTo: "#134E4A",
		});
		const offRosterStat = buildStat({
			id: "p2",
			name: "陳小華",
			onRoster: false,
			colorFrom: "#9CA3AF",
			colorTo: "#6B7280",
		});

		render(<PlayerStatsTable stats={[onRosterStat, offRosterStat]} />);

		// 在名單者：色塊背景為 colorFrom→colorTo 漸層，前景色等於直接呼叫 pickTextColor
		// 的回傳值——不得另寫一套亮度判斷（spec「統計頁的路由與呈現」）。
		const onRosterBadge = screen.getByTestId(`player-stat-badge-${onRosterStat.id}`);
		expect(onRosterBadge.style.background).toBe(
			`linear-gradient(135deg, ${onRosterStat.colorFrom}, ${onRosterStat.colorTo})`,
		);
		expect(onRosterBadge.style.color).toBe(
			pickTextColor(onRosterStat.colorFrom, onRosterStat.colorTo),
		);

		// 在名單者姓名旁不得出現「已不在名單」文字標示（防止「文字標示改成無條件顯示」的變異）。
		const onRosterRow = screen.getByTestId(`player-stat-row-${onRosterStat.id}`);
		expect(within(onRosterRow).queryByText(PLAYER_NOT_ON_ROSTER_LABEL)).toBeNull();

		// 已不在名單者：姓名旁出現可讀的文字標示，且標示文字取自 labels.ts 的具名常數。
		const offRosterRow = screen.getByTestId(`player-stat-row-${offRosterStat.id}`);
		expect(within(offRosterRow).getByText(PLAYER_NOT_ON_ROSTER_LABEL)).not.toBeNull();
	});

	it("表格標題列依序顯示九個欄位名稱", () => {
		render(<PlayerStatsTable stats={[]} />);

		const headerTexts = screen.getAllByRole("columnheader").map((cell) => cell.textContent);

		// 用 toEqual 精確比對含順序的完整陣列：任一欄位標題被刪除、改名或順序調換
		// 都會讓陣列長度或內容不同，逐一涵蓋「九個欄位標題各自刪除一個」的九種變異。
		expect(headerTexts).toEqual([
			"名次",
			"球員",
			"目前強度",
			"出場數",
			"勝負",
			"勝率",
			"強度淨變化",
			"最常搭檔",
			"最常對手",
		]);
	});

	it("名次為傳入陣列的索引加一，不重新排序也不使用索引本身", () => {
		const stats = [
			buildStat({ id: "p1", name: "球員一" }),
			buildStat({ id: "p2", name: "球員二" }),
			buildStat({ id: "p3", name: "球員三" }),
		];
		render(<PlayerStatsTable stats={stats} />);

		const ranks = stats.map((stat) => {
			const row = screen.getByTestId(`player-stat-row-${stat.id}`);
			return within(row).getAllByRole("cell")[0].textContent;
		});

		expect(ranks).toEqual(["1", "2", "3"]);
	});

	it("各欄位如實顯示球員統計資料", () => {
		const stat = buildStat({
			id: "p1",
			currentRating: 3.5,
			gamesPlayed: 10,
			wins: 6,
			losses: 4,
			winRate: 0.6,
			ratingDelta: 0.42,
			mostFrequentPartner: "陳小華",
			mostFrequentOpponent: "林大同",
		});
		render(<PlayerStatsTable stats={[stat]} />);

		const row = screen.getByTestId(`player-stat-row-${stat.id}`);
		const cellTexts = within(row)
			.getAllByRole("cell")
			.map((cell) => cell.textContent);

		expect(cellTexts[2]).toBe("3.50");
		expect(cellTexts[3]).toBe("10");
		expect(cellTexts[4]).toBe("6 - 4");
		expect(cellTexts[5]).toBe("60%");
		expect(cellTexts[6]).toBe("+0.42");
		// 常搭檔／常對手兩欄都要有消費端呈現，不是算了卻不顯示的暗資料（design Decision 6）。
		expect(cellTexts[7]).toBe("陳小華");
		expect(cellTexts[8]).toBe("林大同");
	});

	it("強度淨變化為負值時顯示負號，不強制補上正號", () => {
		const stat = buildStat({ ratingDelta: -0.33 });
		render(<PlayerStatsTable stats={[stat]} />);

		const row = screen.getByTestId(`player-stat-row-${stat.id}`);
		const cellTexts = within(row)
			.getAllByRole("cell")
			.map((cell) => cell.textContent);

		expect(cellTexts[6]).toBe("-0.33");
	});

	it("最常搭檔與最常對手為 null 時顯示佔位符號而非空字串", () => {
		const stat = buildStat({ mostFrequentPartner: null, mostFrequentOpponent: null });
		render(<PlayerStatsTable stats={[stat]} />);

		const row = screen.getByTestId(`player-stat-row-${stat.id}`);
		const cellTexts = within(row)
			.getAllByRole("cell")
			.map((cell) => cell.textContent);

		expect(cellTexts[7]).not.toBe("");
		expect(cellTexts[8]).not.toBe("");
		expect(cellTexts[7]).toBe("尚無紀錄");
		expect(cellTexts[8]).toBe("尚無紀錄");
	});

	it("球員欄的色塊內容為姓名本身", () => {
		const stat = buildStat({ id: "p1", name: "王小明" });
		render(<PlayerStatsTable stats={[stat]} />);

		// 色塊內顯示的必須是姓名，不是 id 或其他欄位——spec「統計頁的路由與呈現」的球員欄
		// 定義為「色塊＋姓名」，只斷言背景／前景色會讓「色塊內容換成 id」的變異存活。
		const badge = screen.getByTestId(`player-stat-badge-${stat.id}`);
		expect(badge.textContent).toBe("王小明");
	});

	it("強度淨變化為零時不補正號", () => {
		const stat = buildStat({ ratingDelta: 0 });
		render(<PlayerStatsTable stats={[stat]} />);

		const row = screen.getByTestId(`player-stat-row-${stat.id}`);
		const cellTexts = within(row)
			.getAllByRole("cell")
			.map((cell) => cell.textContent);

		// 「正值補 +、0 不補」是元件內具名的顯示決策（spec 未規範此邊界），
		// 以斷言鎖住，避免日後改成 delta >= 0 而無人察覺。
		expect(cellTexts[6]).toBe("0.00");
	});

	it("勝率以四捨五入取整數百分比呈現", () => {
		// 兩個值同時涵蓋三種取整方式的差異：2/3（三場兩勝，spec 舉過的實際值）四捨五入為
		// 67%、無條件捨去為 66%；1/3（三場一勝）四捨五入為 33%、無條件進位為 34%。
		const roundsUp = buildStat({ id: "p1", gamesPlayed: 3, wins: 2, losses: 1, winRate: 2 / 3 });
		const roundsDown = buildStat({ id: "p2", gamesPlayed: 3, wins: 1, losses: 2, winRate: 1 / 3 });
		render(<PlayerStatsTable stats={[roundsUp, roundsDown]} />);

		const winRateOf = (id: string) =>
			within(screen.getByTestId(`player-stat-row-${id}`)).getAllByRole("cell")[5].textContent;

		expect(winRateOf("p1")).toBe("67%");
		expect(winRateOf("p2")).toBe("33%");
	});

	it("表格具備可存取名稱", () => {
		render(<PlayerStatsTable stats={[buildStat()]} />);

		// 九欄表格對螢幕閱讀器而言需要一個名稱才能在「表格清單」中被辨識；
		// 標題列本身不構成表格的可存取名稱。
		expect(screen.getByRole("table", { name: "球員排行榜" })).not.toBeNull();
	});
});
