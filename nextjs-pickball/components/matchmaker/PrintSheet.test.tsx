// components/matchmaker/PrintSheet.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { PrintSheet, PRINT_COURT_DATA_VALUE, PRINT_SHEET_DATA_VALUE, COLOR_DOT_SIZE } from "./PrintSheet";
import type { ExportCourt, ExportScene, ExportTile } from "@/lib/matchmaker/export-scene";

// happy-dom／testing-library 的預設文字比對會把 Unicode 全形空白（U+3000）正規化成一般
// 半形空白再比對——查詢字串與節點文字兩邊「各自」正規化後理當一致，但實測（見本 change
// 的紅燈驗證）在含全形空白的字串上仍會判定找不到節點。title／statusText 皆含全形空白
// （TITLE_SEPARATOR／STATUS_SEPARATOR，見 export-scene.ts），故這裡以 identity normalizer
// 停用正規化、要求逐字比對，避免這個環境特有的假陰性。
const EXACT_TEXT_MATCH = { normalizer: (text: string) => text };

// 測試用的 ExportScene fixture：內容為純資料，直接手寫字面量即可（不必組 Round／Player），
// 比照 ExportActions.test.tsx 既有的 fixture 寫法。
function buildTile(overrides: Partial<ExportTile> = {}): ExportTile {
	return {
		name: "王小明",
		teamIndex: 0,
		row: 0,
		column: 0,
		colorFrom: "#0E6B63",
		colorTo: "#134E4A",
		textColor: "#FFFFFF",
		...overrides,
	};
}

function buildCourt(overrides: Partial<ExportCourt> = {}): ExportCourt {
	return {
		courtNumber: 1,
		statusText: "未完成",
		// blockHeight 是給 canvas 版累加 y 座標用的幾何欄位，列印版不使用；
		// 這裡只為滿足 ExportCourt 型別而給一個合法值（單打的實際值，見 export-scene.ts）。
		blockHeight: 144,
		tiles: [
			buildTile({ name: "王小明", teamIndex: 0, row: 0, column: 0 }),
			buildTile({ name: "陳小華", teamIndex: 1, row: 0, column: 1 }),
		],
		...overrides,
	};
}

function buildScene(overrides: Partial<ExportScene> = {}): ExportScene {
	return {
		background: "#FFFFFF",
		width: 800,
		height: 300,
		title: "匹克球對戰分配機　第 1 輪　單打",
		courts: [buildCourt()],
		...overrides,
	};
}

describe("PrintSheet", () => {
	// spec 錨點：nextjs-pickball/components/matchmaker/PrintSheet.test.tsx，
	// it 名稱 MUST 逐字一致（tasks.md §6、test-plan.md）。
	it("列印版顯示回合標題與每個場地的球員與比分", () => {
		// 場地編號刻意選非連續、不從 1 起算的 3 與 7（design Decision 2：courtNumber MUST
		// 取自 ExportScene，不是位置推導）——原本兩個場地剛好是索引 0、1 對應編號 1、2，
		// 「用索引冒充場地編號」（court.courtNumber 改成 index + 1）的實作會完全測不出來。
		const scene = buildScene({
			title: "匹克球對戰分配機　第 3 輪　雙打",
			courts: [
				buildCourt({
					courtNumber: 3,
					statusText: "11 : 7　第一隊獲勝",
					tiles: [
						buildTile({ name: "王小明", teamIndex: 0, row: 0, column: 0 }),
						buildTile({ name: "李小美", teamIndex: 0, row: 1, column: 0 }),
						buildTile({ name: "陳小華", teamIndex: 1, row: 0, column: 1 }),
						buildTile({ name: "張小強", teamIndex: 1, row: 1, column: 1 }),
					],
				}),
				buildCourt({
					courtNumber: 7,
					statusText: "未完成",
					tiles: [
						buildTile({ name: "林小英", teamIndex: 0, row: 0, column: 0 }),
						buildTile({ name: "黃小龍", teamIndex: 1, row: 0, column: 1 }),
					],
				}),
			],
		});

		render(<PrintSheet scene={scene} />);

		// 回合標題
		expect(
			screen.getByText("匹克球對戰分配機　第 3 輪　雙打", EXACT_TEXT_MATCH),
		).not.toBeNull();

		// 兩個場地各自的場地編號，逐字為 3 與 7（非索引推導出的 1、2）
		expect(screen.getByText(/第 3 場地/)).not.toBeNull();
		expect(screen.getByText(/第 7 場地/)).not.toBeNull();

		// 全部球員姓名
		expect(screen.getByText("王小明")).not.toBeNull();
		expect(screen.getByText("李小美")).not.toBeNull();
		expect(screen.getByText("陳小華")).not.toBeNull();
		expect(screen.getByText("張小強")).not.toBeNull();
		expect(screen.getByText("林小英")).not.toBeNull();
		expect(screen.getByText("黃小龍")).not.toBeNull();

		// 各場的比分（含勝方）或未完成狀態
		expect(
			screen.getByText("11 : 7　第一隊獲勝", EXACT_TEXT_MATCH),
		).not.toBeNull();
		expect(screen.getByText("未完成")).not.toBeNull();
	});

	// ---- 以下為本組自行補充的 mutation-killing 測試（規格未逐字要求，用來擋住常見缺陷實作）----

	it("根節點帶 data-print=\"sheet\"，每個場地節點帶 data-print=\"court\" 且數量等於場地數", () => {
		const scene = buildScene({
			courts: [
				buildCourt({ courtNumber: 1 }),
				buildCourt({ courtNumber: 2 }),
				buildCourt({ courtNumber: 3 }),
			],
		});
		const { container } = render(<PrintSheet scene={scene} />);

		const sheetEl = container.querySelector(`[data-print="${PRINT_SHEET_DATA_VALUE}"]`);
		expect(sheetEl).not.toBeNull();

		const courtEls = container.querySelectorAll(`[data-print="${PRINT_COURT_DATA_VALUE}"]`);
		expect(courtEls.length).toBe(3);
	});

	it("data-print 的兩個屬性值逐字為 sheet 與 court（CSS 選擇器無法 import 常數，只能在此釘住）", () => {
		// 上一條測試用常數組查詢字串，因此改掉常數值它仍會全綠——但 app/globals.css 的
		// @media print 區塊寫的是字面量 [data-print="sheet"] 與 [data-print="court"]，
		// 常數一旦漂移，列印樣式會靜默失效且沒有任何測試會亮紅燈。這條就是那道防線。
		expect(PRINT_SHEET_DATA_VALUE).toBe("sheet");
		expect(PRINT_COURT_DATA_VALUE).toBe("court");

		const { container } = render(<PrintSheet scene={buildScene()} />);
		expect(container.querySelector('[data-print="sheet"]')).not.toBeNull();
		expect(container.querySelectorAll('[data-print="court"]').length).toBeGreaterThan(0);
	});

	it("title 逐字等於傳入的 scene.title", () => {
		const scene = buildScene({ title: "測試專用不會被猜到的標題ＸＹＺ９８７" });
		render(<PrintSheet scene={scene} />);
		expect(screen.getByText("測試專用不會被猜到的標題ＸＹＺ９８７")).not.toBeNull();
	});

	it("已完成場次逐字顯示 statusText（含比分與勝方），未完成場次顯示未完成，兩者皆取自 scene", () => {
		const scene = buildScene({
			courts: [
				buildCourt({ courtNumber: 1, statusText: "9 : 11　第二隊獲勝" }),
				buildCourt({ courtNumber: 2, statusText: "未完成" }),
			],
		});
		render(<PrintSheet scene={scene} />);

		expect(
			screen.getByText("9 : 11　第二隊獲勝", EXACT_TEXT_MATCH),
		).not.toBeNull();
		expect(screen.getByText("未完成")).not.toBeNull();
	});

	it("場地數為 3 時渲染 3 個場地區塊而非只有第一個，且場地編號逐字取自 courtNumber、依 scene.courts 原始順序呈現", () => {
		// 場地編號刻意非連續、不從 1 起算、且非遞增排序（5、9、2）——
		// 同時擋住三種存活 mutant：
		// 1. court.courtNumber 改成 index + 1（會得到 1、2、3，與 5、9、2 不符）
		// 2. scene.courts.map 改成 .slice(0, 1).map（只剩 1 個場地，長度不符 3）
		// 3. scene.courts.map 改成 [...scene.courts].reverse().map
		//    （反轉後為 2、9、5，與原始順序 5、9、2 不符，非回文序列可辨別）
		const scene = buildScene({
			courts: [
				buildCourt({ courtNumber: 5, statusText: "未完成" }),
				buildCourt({ courtNumber: 9, statusText: "未完成" }),
				buildCourt({ courtNumber: 2, statusText: "未完成" }),
			],
		});
		const { container } = render(<PrintSheet scene={scene} />);

		expect(screen.getByText(/第 5 場地/)).not.toBeNull();
		expect(screen.getByText(/第 9 場地/)).not.toBeNull();
		expect(screen.getByText(/第 2 場地/)).not.toBeNull();

		// 依文件順序抓出每個場地區塊的編號，斷言與 scene.courts 的原始順序完全一致
		// （有序比對，而非只驗「三個都存在」——這樣才會抓到渲染順序被打亂的 mutant）。
		const courtEls = Array.from(
			container.querySelectorAll(`[data-print="${PRINT_COURT_DATA_VALUE}"]`),
		);
		const renderedOrder = courtEls.map((el) => {
			const match = el.textContent?.match(/第 (\d+) 場地/);
			return match ? Number(match[1]) : null;
		});
		expect(renderedOrder).toEqual([5, 9, 2]);
	});

	it("場地數為 0 時不拋錯", () => {
		const scene = buildScene({ courts: [] });
		expect(() => render(<PrintSheet scene={scene} />)).not.toThrow();
	});

	it("每個場地的全部球員姓名都查得到，且第一隊與第二隊分別可辨識、不會分組錯亂", () => {
		const scene = buildScene({
			courts: [
				buildCourt({
					courtNumber: 1,
					tiles: [
						buildTile({ name: "隊一甲", teamIndex: 0, row: 0, column: 0 }),
						buildTile({ name: "隊一乙", teamIndex: 0, row: 1, column: 0 }),
						buildTile({ name: "隊二甲", teamIndex: 1, row: 0, column: 1 }),
						buildTile({ name: "隊二乙", teamIndex: 1, row: 1, column: 1 }),
					],
				}),
			],
		});
		const { container } = render(<PrintSheet scene={scene} />);
		const courtEl = container.querySelector(
			`[data-print="${PRINT_COURT_DATA_VALUE}"]`,
		) as HTMLElement;

		const teamABlock = within(courtEl).getByTestId("print-court-1-team-0");
		const teamBBlock = within(courtEl).getByTestId("print-court-1-team-1");

		// 第一隊區塊內查得到第一隊球員，查不到第二隊球員；反之亦然。
		expect(within(teamABlock).getByText("隊一甲")).not.toBeNull();
		expect(within(teamABlock).getByText("隊一乙")).not.toBeNull();
		expect(within(teamABlock).queryByText("隊二甲")).toBeNull();
		expect(within(teamABlock).queryByText("隊二乙")).toBeNull();

		expect(within(teamBBlock).getByText("隊二甲")).not.toBeNull();
		expect(within(teamBBlock).getByText("隊二乙")).not.toBeNull();
		expect(within(teamBBlock).queryByText("隊一甲")).toBeNull();
		expect(within(teamBBlock).queryByText("隊一乙")).toBeNull();
	});

	it("色彩不是唯一資訊來源：姓名文字本身可辨識球員與隊伍歸屬，不依附於任何顏色樣式元素", () => {
		const scene = buildScene({
			courts: [
				buildCourt({
					courtNumber: 1,
					tiles: [
						buildTile({ name: "隊一甲", teamIndex: 0, row: 0, column: 0 }),
						buildTile({ name: "隊二甲", teamIndex: 1, row: 0, column: 1 }),
					],
				}),
			],
		});
		render(<PrintSheet scene={scene} />);

		// 姓名文字節點本身（而非其外層色塊容器）不得帶有背景色樣式——色彩只能是文字節點
		// 以外的輔助小標記，姓名本身必須是純文字，即使色點樣式失效仍可讀（prd.md 12.5）。
		const nameNode = screen.getByText("隊一甲");
		expect((nameNode as HTMLElement).style.backgroundColor).toBe("");

		const nameNodeB = screen.getByText("隊二甲");
		expect((nameNodeB as HTMLElement).style.backgroundColor).toBe("");

		// 姓名所在的整列容器（<li>）本身也不得帶有任何樣式——色彩只能落在獨立的小色點
		// 元素上，SHALL NOT 把整格套上大面積漸層背景（design Decision 3 明文否決的做法）。
		const rowContainer = nameNode.closest("li");
		expect(rowContainer?.getAttribute("style")).toBeNull();
	});

	it("隊伍標題文字逐字為「第一隊」與「第二隊」，各自落在正確的分組容器內且互不相同", () => {
		// 擋住四個曾存活的 mutant：兩個字串對調、改成 ["A", "B"]、改成 ["", ""]、
		// TEAM_LABELS[teamIndex] 永遠取 TEAM_LABELS[0]（兩個區塊都顯示「第一隊」）。
		// 用 within(該分組容器) 定位標題，讓「兩隊對調」與「永遠取 [0]」都會轉紅。
		const scene = buildScene({
			courts: [
				buildCourt({
					courtNumber: 1,
					tiles: [
						buildTile({ name: "隊一甲", teamIndex: 0, row: 0, column: 0 }),
						buildTile({ name: "隊二甲", teamIndex: 1, row: 0, column: 1 }),
					],
				}),
			],
		});
		const { container } = render(<PrintSheet scene={scene} />);
		const courtEl = container.querySelector(
			`[data-print="${PRINT_COURT_DATA_VALUE}"]`,
		) as HTMLElement;

		const teamABlock = within(courtEl).getByTestId("print-court-1-team-0");
		const teamBBlock = within(courtEl).getByTestId("print-court-1-team-1");

		const teamALabel = within(teamABlock).getByText("第一隊", EXACT_TEXT_MATCH);
		const teamBLabel = within(teamBBlock).getByText("第二隊", EXACT_TEXT_MATCH);
		expect(teamALabel).not.toBeNull();
		expect(teamBLabel).not.toBeNull();

		// 第一隊分組容器內查不到「第二隊」，反之亦然——擋住「兩隊都取 teamIndex === 0
		// 標題」這種退化（兩個標題都變成同一個字串）。
		expect(within(teamABlock).queryByText("第二隊", EXACT_TEXT_MATCH)).toBeNull();
		expect(within(teamBBlock).queryByText("第一隊", EXACT_TEXT_MATCH)).toBeNull();

		// 兩個標題文字互不相同——擋住 ["", ""] 與任何兩隊同名的退化。
		expect(teamALabel.textContent).not.toBe(teamBLabel.textContent);
	});

	it("色點的 backgroundColor 逐字等於該球員的 tile.colorFrom，不同球員的色點顏色不相同", () => {
		// 擋住色點 backgroundColor 被寫死成固定顏色的 mutant——顏色值從 fixture 取得、
		// 兩個球員刻意給不同的 colorFrom，寫死顏色會讓兩者「相同」這個斷言失敗。
		const colorA = "#111111";
		const colorB = "#222222";
		const scene = buildScene({
			courts: [
				buildCourt({
					courtNumber: 1,
					tiles: [
						buildTile({ name: "隊一甲", teamIndex: 0, row: 0, column: 0, colorFrom: colorA }),
						buildTile({ name: "隊二甲", teamIndex: 1, row: 0, column: 1, colorFrom: colorB }),
					],
				}),
			],
		});
		render(<PrintSheet scene={scene} />);

		const nameNodeA = screen.getByText("隊一甲");
		const nameNodeB = screen.getByText("隊二甲");
		const dotA = nameNodeA.closest("li")?.querySelector("span[aria-hidden=\"true\"]") as HTMLElement;
		const dotB = nameNodeB.closest("li")?.querySelector("span[aria-hidden=\"true\"]") as HTMLElement;

		expect(dotA).not.toBeNull();
		expect(dotB).not.toBeNull();
		expect(dotA.style.backgroundColor).toBe(colorA);
		expect(dotB.style.backgroundColor).toBe(colorB);
		expect(dotA.style.backgroundColor).not.toBe(dotB.style.backgroundColor);

		// 色點是純裝飾，姓名才是資訊來源——擋住 aria-hidden="true" 整行被拿掉的 mutant。
		expect(dotA.getAttribute("aria-hidden")).toBe("true");
		expect(dotB.getAttribute("aria-hidden")).toBe("true");

		// 姓名文字節點與色點是不同的元素（姓名不依附於任何帶背景色的元素上）。
		expect(nameNodeA).not.toBe(dotA);
		expect(nameNodeB).not.toBe(dotB);
	});

	it("COLOR_DOT_SIZE 是固定的小尺寸而非百分比，且元件內零 linear-gradient", () => {
		// 這條擋的是把小色點退化成大面積背景，design Decision 3 明文否決——
		// COLOR_DOT_SIZE 若被改成 "100%"，色點會撐滿整個容器，等同大面積色塊。
		expect(COLOR_DOT_SIZE).not.toContain("%");
		const remValue = Number.parseFloat(COLOR_DOT_SIZE.replace("rem", ""));
		expect(Number.isNaN(remValue)).toBe(false);
		expect(remValue).toBeLessThanOrEqual(1);

		const { container } = render(<PrintSheet scene={buildScene()} />);
		expect(container.innerHTML).not.toMatch(/linear-gradient/);
	});

	it("標題階層 h1／h2／h3 分別對應回合標題、場地編號與隊伍名稱", () => {
		// getByRole("heading", { level, name }) 會同時斷言標籤本身是 heading 且層級正確——
		// 把 <h1>/<h2>/<h3> 改成 <div> 會讓對應層級查不到這個 role，測試轉紅。
		const scene = buildScene({
			title: "階層測試標題",
			courts: [
				buildCourt({
					courtNumber: 4,
					tiles: [
						buildTile({ name: "隊一甲", teamIndex: 0, row: 0, column: 0 }),
						buildTile({ name: "隊二甲", teamIndex: 1, row: 0, column: 1 }),
					],
				}),
			],
		});
		render(<PrintSheet scene={scene} />);

		expect(
			screen.getByRole("heading", { level: 1, name: "階層測試標題" }),
		).not.toBeNull();
		expect(
			screen.getByRole("heading", { level: 2, name: /第 4 場地/ }),
		).not.toBeNull();
		expect(
			screen.getByRole("heading", { level: 3, name: "第一隊" }),
		).not.toBeNull();
		expect(
			screen.getByRole("heading", { level: 3, name: "第二隊" }),
		).not.toBeNull();
	});
});
