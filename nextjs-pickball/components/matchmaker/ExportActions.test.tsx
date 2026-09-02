// components/matchmaker/ExportActions.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ExportActions } from "./ExportActions";
import { PRINT_BLOCKED_MESSAGE } from "@/lib/matchmaker/print-guard";
import type { ExportScene } from "@/lib/matchmaker/export-scene";

// 測試用的 ExportScene fixture：內容為純資料，直接手寫字面量即可（不必組 Round／Player）。
function buildScene(overrides: Partial<ExportScene> = {}): ExportScene {
	return {
		background: "#FFFFFF",
		width: 800,
		height: 300,
		title: "匹克球對戰分配機　第 1 輪　單打",
		courts: [
			{
				courtNumber: 1,
				statusText: "未完成",
				// blockHeight 是給 canvas 版累加 y 座標用的幾何欄位，本元件不使用；
				// 這裡只為滿足 ExportCourt 型別而給一個合法值（單打的實際值）。
				blockHeight: 144,
				tiles: [
					{ name: "王小明", teamIndex: 0, row: 0, column: 0, colorFrom: "#0E6B63", colorTo: "#134E4A", textColor: "#FFFFFF" },
					{ name: "陳小華", teamIndex: 1, row: 0, column: 1, colorFrom: "#7C2D12", colorTo: "#F97316", textColor: "#FFFFFF" },
				],
			},
		],
		...overrides,
	};
}

describe("ExportActions", () => {
	it("尚無目前回合時匯出 JPG 與列印 PDF 皆為 disabled 並顯示繁體中文說明", () => {
		render(
			<ExportActions scene={null} fileName="round-1.jpg" exportJpg={vi.fn()} />,
		);

		const exportButton = screen.getByRole("button", { name: "匯出 JPG" }) as HTMLButtonElement;
		const printButton = screen.getByRole("button", { name: "列印 PDF" }) as HTMLButtonElement;
		expect(exportButton.disabled).toBe(true);
		expect(printButton.disabled).toBe(true);
		// 需要指出「需先產生本輪對戰」，不只是視覺變淡（design Decision 5）。
		expect(screen.getByText(/需先產生本輪對戰/)).not.toBeNull();
	});

	it("目前回合存在時匯出 JPG 與列印 PDF 皆可點擊", () => {
		render(
			<ExportActions scene={buildScene()} fileName="round-1.jpg" exportJpg={vi.fn()} />,
		);

		const exportButton = screen.getByRole("button", { name: "匯出 JPG" }) as HTMLButtonElement;
		const printButton = screen.getByRole("button", { name: "列印 PDF" }) as HTMLButtonElement;
		expect(exportButton.disabled).toBe(false);
		expect(printButton.disabled).toBe(false);
		// 反向對照：只驗「停用時有說明」的話，「說明文字恆顯示」的實作也會通過，
		// 而那會在功能可用時誤導使用者（design Decision 5）。
		expect(screen.queryByText(/需先產生本輪對戰/)).toBeNull();
	});

	it("點擊列印 PDF 會呼叫注入的列印函式一次", async () => {
		const printer = vi.fn();
		const user = userEvent.setup();
		render(
			<ExportActions scene={buildScene()} fileName="round-1.jpg" exportJpg={vi.fn()} printer={printer} />,
		);

		await user.click(screen.getByRole("button", { name: "列印 PDF" }));
		expect(printer).toHaveBeenCalledTimes(1);
	});

	it("列印被阻擋時以 role alert 顯示繁體中文提示", async () => {
		const printer = vi.fn(() => {
			throw new Error("blocked");
		});
		const user = userEvent.setup();
		render(
			<ExportActions scene={buildScene()} fileName="round-1.jpg" exportJpg={vi.fn()} printer={printer} />,
		);

		await user.click(screen.getByRole("button", { name: "列印 PDF" }));
		const alert = screen.getByRole("alert");
		// 訊息逐字等於 print-guard 匯出的常數，不寫死字面量——擋下「元件內另寫訊息文案」
		// 這類 mutation，也擋下「訊息拼字被改動仍過關」的弱斷言。
		expect(alert.textContent).toBe(PRINT_BLOCKED_MESSAGE);
	});

	it("匯出進行中時匯出 JPG 入口暫時停用避免重複觸發", async () => {
		// 用物件包一層而非裸變數：裸變數若只在巢狀 closure 內被賦值，TS 的控制流窄化
		// 會在外層讀取點把型別窄化回宣告初始值 null，導致排除 null 後型別變成 never
		// （無法呼叫）。物件屬性不受這條窄化規則影響。
		const holder: { resolve: (() => void) | null } = { resolve: null };
		const exportJpg = vi.fn(
			() =>
				new Promise<void>((resolve) => {
					holder.resolve = resolve;
				}),
		);
		const user = userEvent.setup();
		render(
			<ExportActions scene={buildScene()} fileName="round-1.jpg" exportJpg={exportJpg} />,
		);

		const exportButton = screen.getByRole("button", { name: "匯出 JPG" }) as HTMLButtonElement;
		await user.click(exportButton);
		expect(exportButton.disabled).toBe(true);

		if (holder.resolve === null) {
			throw new Error("holder.resolve 未被賦值：exportJpg mock 未被呼叫");
		}
		// resolve 後恢復可用；用 waitFor 等待非同步的 state 更新反映到 DOM
		// （按鈕本身不會重新掛載，findByRole 對「屬性變化」不會觸發重新查詢，故用 waitFor）。
		holder.resolve();
		await waitFor(() => {
			expect(exportButton.disabled).toBe(false);
		});
	});

	// ---- 以下為本組自行補充的 mutation-killing 測試（規格未逐字要求，但用來擋住常見缺陷實作）----

	it("匯出 JPG 點擊時 exportJpg 恰被呼叫一次且參數為傳入的 scene 與 fileName", async () => {
		const scene = buildScene();
		const exportJpg = vi.fn(() => Promise.resolve());
		const user = userEvent.setup();
		render(<ExportActions scene={scene} fileName="round-7.jpg" exportJpg={exportJpg} />);

		await user.click(screen.getByRole("button", { name: "匯出 JPG" }));
		expect(exportJpg).toHaveBeenCalledTimes(1);
		expect(exportJpg).toHaveBeenCalledWith(scene, "round-7.jpg");
	});

	it("先注入會拋錯的列印函式點擊出現提示後，改注入正常列印函式點擊則提示消失", async () => {
		const badPrinter = vi.fn(() => {
			throw new Error("blocked");
		});
		const user = userEvent.setup();
		const view = render(
			<ExportActions scene={buildScene()} fileName="round-1.jpg" exportJpg={vi.fn()} printer={badPrinter} />,
		);

		await user.click(screen.getByRole("button", { name: "列印 PDF" }));
		expect(screen.getByRole("alert")).not.toBeNull();

		const goodPrinter = vi.fn();
		view.rerender(
			<ExportActions scene={buildScene()} fileName="round-1.jpg" exportJpg={vi.fn()} printer={goodPrinter} />,
		);
		await user.click(screen.getByRole("button", { name: "列印 PDF" }));
		expect(screen.queryByRole("alert")).toBeNull();
	});

	it("一開始未點擊任何按鈕時畫面上沒有 role alert 元素", () => {
		render(
			<ExportActions scene={buildScene()} fileName="round-1.jpg" exportJpg={vi.fn()} printer={vi.fn()} />,
		);
		expect(screen.queryByRole("alert")).toBeNull();
	});

	it("匯出 JPG 進行中時列印 PDF 入口仍可點擊（停用範圍只限匯出 JPG 本身）", async () => {
		// 同上一個測試的理由：用物件包一層避免 TS 控制流窄化把型別窄化回 null。
		const holder: { resolve: (() => void) | null } = { resolve: null };
		const exportJpg = vi.fn(
			() =>
				new Promise<void>((resolve) => {
					holder.resolve = resolve;
				}),
		);
		const printer = vi.fn();
		const user = userEvent.setup();
		render(
			<ExportActions scene={buildScene()} fileName="round-1.jpg" exportJpg={exportJpg} printer={printer} />,
		);

		await user.click(screen.getByRole("button", { name: "匯出 JPG" }));
		const printButton = screen.getByRole("button", { name: "列印 PDF" }) as HTMLButtonElement;
		expect(printButton.disabled).toBe(false);
		await user.click(printButton);
		expect(printer).toHaveBeenCalledTimes(1);

		if (holder.resolve === null) {
			throw new Error("holder.resolve 未被賦值：exportJpg mock 未被呼叫");
		}
		holder.resolve();
	});

	it("目前回合為 null 時點擊兩顆按鈕都不會呼叫 exportJpg 或 printer（disabled 真的擋住行為）", async () => {
		const exportJpg = vi.fn(() => Promise.resolve());
		const printer = vi.fn();
		const user = userEvent.setup();
		render(<ExportActions scene={null} fileName="round-1.jpg" exportJpg={exportJpg} printer={printer} />);

		// userEvent 對帶 disabled 屬性的元素點擊本就是 no-op，不需要任何額外選項；
		// 這條驗的是「停用以屬性表達」真的擋住了行為，而不只是視覺變淡。
		await user.click(screen.getByRole("button", { name: "匯出 JPG" }));
		await user.click(screen.getByRole("button", { name: "列印 PDF" }));
		expect(exportJpg).not.toHaveBeenCalled();
		expect(printer).not.toHaveBeenCalled();
	});

	it("兩顆按鈕的可存取名稱皆非空且可由 role 查得", () => {
		render(
			<ExportActions scene={buildScene()} fileName="round-1.jpg" exportJpg={vi.fn()} />,
		);
		expect(screen.getByRole("button", { name: "匯出 JPG" })).not.toBeNull();
		expect(screen.getByRole("button", { name: "列印 PDF" })).not.toBeNull();
	});
});
