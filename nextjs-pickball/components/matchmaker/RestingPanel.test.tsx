// components/matchmaker/RestingPanel.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { RestingPanel } from "./RestingPanel";
import { playerTileStyle } from "@/lib/matchmaker/tile-style";
import type { Player } from "@/lib/matchmaker/types";

// 測試用的完整參賽者建構器，與 CourtCard.test.tsx 等同構，刻意不共用——本檔保持獨立、
// 不依賴其他測試檔（比照既有測試檔慣例）。
function buildPlayer(overrides: Partial<Player> = {}): Player {
	return {
		id: "p1",
		name: "王小明",
		gender: "male",
		colorFrom: "#0E6B63",
		colorTo: "#134E4A",
		rating: 3,
		restCount: 0,
		gamesPlayed: 0,
		isActive: true,
		createdAt: "2026-08-23T00:00:00.000Z",
		...overrides,
	};
}

describe("RestingPanel", () => {
	it("休息名單顯示姓名顏色標記與累計休息次數", () => {
		// 三筆休息者的漸層配色刻意互不相同，restCount 刻意在清單順序上兩個方向皆非單調
		// （5 → 0 → 3：遞增排序會變成 p2,p3,p1，遞減排序會變成 p1,p3,p2，反轉會變成
		// p3,p2,p1，三者皆與原始清單順序不同）——分配引擎的真實輸出是 restCount 遞減
		// （lib/matchmaker/candidates.ts 的 compareCandidates），三筆的存在同時擋住
		// 「元件內加了排序」與「只驗兩筆測不出的錯位」兩類 mutation。姓名的字首（林／王／
		// 陳）在 code point 順序上也與這個順序不同，連帶擋住「依姓名排序」的 mutation。
		// p2 的 restCount 特意為 0：第一輪休息者的 restCount 恆為 0（round.ts 的
		// createRound 只回填「上一輪」休息者的 restSettlements，本輪休息者要等下一輪
		// 產生才 +1），這是所有生產環境休息名單都必然出現的真實資料，藉此擋下
		// 「restCount > 0 才顯示」或「restCount 為 0 時整筆被濾掉」這類 mutation。
		const p1 = buildPlayer({
			id: "p1",
			name: "王小明",
			colorFrom: "#0E6B63",
			colorTo: "#134E4A",
			restCount: 5,
		});
		const p2 = buildPlayer({
			id: "p2",
			name: "陳小華",
			gender: "female",
			colorFrom: "#7C2D12",
			colorTo: "#F97316",
			restCount: 0,
		});
		const p3 = buildPlayer({
			id: "p3",
			name: "林大同",
			colorFrom: "#1E3A8A",
			colorTo: "#93C5FD",
			restCount: 3,
		});
		const multi = render(<RestingPanel resting={[p1, p2, p3]} hasActivePlayers={true} />);

		// 逐筆用 testid 取得該員所在的整個行容器，三項資訊都從同一個 within() 範圍查詢——
		// 避免用集合式 screen.getByText() 各自查找，那樣測不出「姓名、顏色、休息次數
		// 三者被錯誤地交叉配對」的 mutation。
		const rowP1 = screen.getByTestId("resting-player-p1");
		expect(within(rowP1).getByText("王小明")).not.toBeNull();
		expect(within(rowP1).getByText("休息 5 次")).not.toBeNull();
		const swatchP1 = within(rowP1).getByTestId("resting-swatch-p1");
		expect(swatchP1.style.background).toBe(
			playerTileStyle(p1, { completed: false }).background,
		);
		// 休息名單不對應任何場次，playerTileStyle 的 completed 選項恆須傳 false——
		// 擋下「completed 誤傳 true」這類 mutation（該選項為 true 時色塊會被減弱不透明度
		// 與飽和度，見 tile-style.ts）。
		expect(swatchP1.style.opacity).toBe("");
		expect(swatchP1.style.filter).toBe("");
		// 裝飾用色塊不得讓讀屏念出無意義節點（design 相關規範句：色彩不得作為唯一資訊
		// 來源，顏色標記僅為輔助線索，姓名與「休息 N 次」才是主要資訊）。
		expect(swatchP1.getAttribute("aria-hidden")).toBe("true");

		// restCount 為 0 的一筆（p2）：文字須精確為「休息 0 次」，且色塊／aria-hidden
		// 不得因 restCount 為 0 而被特殊處理或省略——擋下「restCount 為 0 的那筆被
		// 特別對待」這類 mutation。
		const rowP2 = screen.getByTestId("resting-player-p2");
		expect(within(rowP2).getByText("陳小華")).not.toBeNull();
		expect(within(rowP2).getByText("休息 0 次")).not.toBeNull();
		const swatchP2 = within(rowP2).getByTestId("resting-swatch-p2");
		expect(swatchP2.style.background).toBe(
			playerTileStyle(p2, { completed: false }).background,
		);
		expect(swatchP2.getAttribute("aria-hidden")).toBe("true");

		const rowP3 = screen.getByTestId("resting-player-p3");
		expect(within(rowP3).getByText("林大同")).not.toBeNull();
		expect(within(rowP3).getByText("休息 3 次")).not.toBeNull();
		const swatchP3 = within(rowP3).getByTestId("resting-swatch-p3");
		expect(swatchP3.style.background).toBe(
			playerTileStyle(p3, { completed: false }).background,
		);

		// 三人的顏色標記背景兩兩不得相同（擋下「全部套用同一位的漸層」或「相鄰兩筆的
		// 顏色被交換」這類 mutation，光靠上面各自與自己期望值比對的斷言仍可能被巧合的
		// 實作值繞過）。
		expect(swatchP1.style.background).not.toBe(swatchP2.style.background);
		expect(swatchP2.style.background).not.toBe(swatchP3.style.background);
		expect(swatchP1.style.background).not.toBe(swatchP3.style.background);

		// 元件不得重排或篩選清單（tasks 9.3）：清單順序須與傳入的 resting 陣列一致，
		// 用 DOM 順序驗證（若實作反轉清單或依 restCount／姓名排序，這裡的順序會不同）。
		const rows = screen.getAllByTestId(/^resting-player-/);
		expect(rows.map((row) => row.getAttribute("data-testid"))).toStrictEqual([
			"resting-player-p1",
			"resting-player-p2",
			"resting-player-p3",
		]);

		// 空狀態的兩段文案在有休息者時皆不得出現。
		expect(screen.queryByText("本輪全員出場")).toBeNull();
		expect(screen.queryByText(/全員暫停出場/)).toBeNull();

		// 補「只有一人休息」的案例：奇數可出場人數（例如 3 人單打、1 場地）必然只休息
		// 1 人，這是真實可達的生產狀態。若空狀態的判斷門檻寫成 resting.length < 2 之類
		// 的 off-by-one，這唯一一人會被整個吞掉、誤顯示成空狀態文案——擋下這類 mutation。
		// 先 unmount 上面三人份的畫面，避免 p1 的 testid 在文件中同時存在兩份。
		multi.unmount();
		const single = render(<RestingPanel resting={[p1]} hasActivePlayers={true} />);
		const singleRow = single.getByTestId("resting-player-p1");
		expect(within(singleRow).getByText("王小明")).not.toBeNull();
		expect(within(singleRow).getByText("休息 5 次")).not.toBeNull();
		expect(single.queryByText("本輪全員出場")).toBeNull();
		expect(single.queryByText(/全員暫停出場/)).toBeNull();
		single.unmount();
	});

	it("休息名單為空時區分本輪全員出場與全員暫停出場兩種文案", () => {
		// 分配引擎不把暫停出場者列入休息名單，兩種情況的 resting 陣列同樣是空陣列——
		// 唯一能分辨的線索是 hasActivePlayers，這條測試專門驗證這條分流。
		const allPlaying = render(<RestingPanel resting={[]} hasActivePlayers={true} />);
		const playingText = screen.getByText("本輪全員出場").textContent;
		expect(playingText).toBe("本輪全員出場");
		// 「全員暫停出場」的文案這時不得出現。
		expect(screen.queryByText(/全員暫停出場/)).toBeNull();
		// 空狀態時不得渲染任何休息者列項（防止「resting.length === 0 判斷寫反」或
		// 「有休息者時仍額外渲染空狀態文案」這類 mutation）。
		expect(screen.queryAllByTestId(/^resting-player-/).length).toBe(0);
		allPlaying.unmount();

		const allPaused = render(<RestingPanel resting={[]} hasActivePlayers={false} />);
		const pausedText = screen.getByText(/全員暫停出場/).textContent;
		expect(pausedText).toBe("目前沒有任何可出場的參賽者（全員暫停出場）");
		// 「本輪全員出場」的文案這時不得出現。
		expect(screen.queryByText("本輪全員出場")).toBeNull();
		expect(screen.queryAllByTestId(/^resting-player-/).length).toBe(0);
		allPaused.unmount();

		// 兩段文案本身不得相等——若實作把兩個分支寫成同一段文字，上面各自的關鍵字斷言
		// 仍可能被巧合繞過（例如把兩段都改成同時含「全員出場」與「全員暫停出場」的
		// 混合文字），這裡額外釘住兩段文案的絕對值必須不同。
		expect(playingText).not.toBe(pausedText);
	});
});
