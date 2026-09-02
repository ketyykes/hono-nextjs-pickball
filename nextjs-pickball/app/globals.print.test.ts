// app/globals.print.test.ts
//
// CSS 檔無法 import TS 常數，`app/globals.css` 的 `@media print` 區塊只能以字面量
// 手寫 `[data-print="sheet"]`／`[data-print="court"]` 這兩個選擇器，與
// components/matchmaker/PrintSheet.tsx 匯出的 PRINT_SHEET_DATA_VALUE／
// PRINT_COURT_DATA_VALUE 常數「同源」全靠人工紀律維持，任一邊改了字面量而另一邊沒跟著改，
// 不會有任何編譯錯誤或既有測試轉紅——列印樣式會靜默失效。
//
// 這支測試是唯一能機械保證兩側同源的方式：直接讀 app/globals.css 的原始文字，
// 從 PrintSheet.tsx import 常數組出期望字串後做逐字比對（leader 裁決 2）。
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
	PRINT_COURT_DATA_VALUE,
	PRINT_SHEET_DATA_VALUE,
} from "@/components/matchmaker/PrintSheet";

// 路徑以 process.cwd() 為基準：vitest 的 root 就是本 workspace 目錄，
// 不論從 repo root 跑 `pnpm test`（經 pnpm -r 進到各 workspace）或在本目錄直接跑
// vitest，cwd 都是 nextjs-pickball/。
// （`import.meta.url` 在本 repo 的 vitest 設定下不是 file: scheme，無法用來解析路徑，
//   已實測 `The URL must be of scheme file`。）
// 下方 readGlobalsCss() 會在檔案讀不到時直接拋錯，路徑一旦失效不會靜默通過。
const GLOBALS_CSS_PATH = join(process.cwd(), "app", "globals.css");

function readGlobalsCss(): string {
	return readFileSync(GLOBALS_CSS_PATH, "utf-8");
}

describe("app/globals.css 的 @media print 區塊與 PrintSheet 的 data-print 常數同源", () => {
	it("逐字含有由 PrintSheet 常數組出的 [data-print=\"sheet\"] 選擇器", () => {
		const css = readGlobalsCss();
		expect(css).toContain(`[data-print="${PRINT_SHEET_DATA_VALUE}"]`);
	});

	it("逐字含有由 PrintSheet 常數組出的 [data-print=\"court\"] 選擇器", () => {
		const css = readGlobalsCss();
		expect(css).toContain(`[data-print="${PRINT_COURT_DATA_VALUE}"]`);
	});

	it("逐字含有 [data-print=\"hide\"] 選擇器（page.tsx 的操作控制項包裝屬性值）", () => {
		// "hide" 不是 PrintSheet.tsx 的具名常數（它是 app/matchmaker/page.tsx 自行加在
		// 包裝元素上的屬性值，見該檔），故此處以字面量直接比對，而非 import 常數——
		// 這條連動的是 page.tsx 與 globals.css 兩側，不在本測試的「PrintSheet 常數同源」
		// 範圍內，仍一併釘住是因為它同樣是「CSS 選擇器字面量」失衡就會靜默失效的性質。
		const css = readGlobalsCss();
		expect(css).toContain('[data-print="hide"]');
	});
});
