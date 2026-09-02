import { describe, it, expect, vi } from "vitest";

import { requestPrint, PRINT_BLOCKED_MESSAGE } from "./print-guard";

describe("requestPrint", () => {
	it("列印函式拋錯時判定為被阻擋並回傳繁體中文訊息", () => {
		const throwingPrinter = vi.fn(() => {
			throw new Error("blocked");
		});

		const outcome = requestPrint(throwingPrinter);

		expect(outcome.ok).toBe(false);
		if (outcome.ok) {
			throw new Error("預期 outcome.ok 為 false，收窄型別失敗");
		}
		expect(outcome.message).toContain("彈出視窗");
		expect(throwingPrinter).toHaveBeenCalledTimes(1);
	});

	it("環境未提供列印函式時判定為被阻擋", () => {
		const undefinedOutcome = requestPrint(undefined);
		const nonFunctionOutcome = requestPrint("not-a-function");

		expect(undefinedOutcome.ok).toBe(false);
		expect(nonFunctionOutcome.ok).toBe(false);
		if (undefinedOutcome.ok || nonFunctionOutcome.ok) {
			throw new Error("預期兩個 outcome 的 ok 皆為 false，收窄型別失敗");
		}
		expect(undefinedOutcome.message).toBe(nonFunctionOutcome.message);
	});

	it("列印成功時回報 ok 且不帶訊息", () => {
		const printer = vi.fn();

		const outcome = requestPrint(printer);

		expect(outcome.ok).toBe(true);
		expect(outcome).toEqual({ ok: true });
		expect("message" in outcome).toBe(false);
		expect(printer).toHaveBeenCalledTimes(1);
	});

	// --- 以下為額外補充的 it，目的是縮小 mutation 測試的存活空間（非 spec 錨點）。---

	it("拋錯與非函式兩條路徑的訊息完全相同（逐字比對，非各自 toContain）", () => {
		const throwingPrinter = () => {
			throw new Error("blocked");
		};

		const throwOutcome = requestPrint(throwingPrinter);
		const nonFunctionOutcome = requestPrint(null);

		if (throwOutcome.ok || nonFunctionOutcome.ok) {
			throw new Error("預期兩個 outcome 的 ok 皆為 false，收窄型別失敗");
		}
		expect(throwOutcome.message).toBe(nonFunctionOutcome.message);
	});

	it("被擋訊息同時提供開啟彈出視窗權限與瀏覽器選單列印兩條退路", () => {
		const outcome = requestPrint(undefined);

		if (outcome.ok) {
			throw new Error("預期 outcome.ok 為 false，收窄型別失敗");
		}
		expect(outcome.message).toContain("彈出視窗");
		expect(outcome.message).toMatch(/Ctrl.*P|Cmd.*P/);
	});

	it("兩條失敗路徑回傳的訊息逐字等於 PRINT_BLOCKED_MESSAGE 常數", () => {
		// 只用 toContain("彈出視窗") 與 /Ctrl.*P/ 兩個 substring 斷言時，
		// 「整句改簡體但保留『彈出視窗』四字」與「退化成『彈出視窗 Ctrl P』關鍵字堆砌」
		// 都能通過（Stage 2 實測三個此類 mutant 全部存活）。改為逐字比對常數本身，
		// 訊息一旦退化即轉紅；文案要調整時只需改常數，測試不必跟著改字面量。
		const throwingPrinter = () => {
			throw new Error("blocked");
		};

		const throwOutcome = requestPrint(throwingPrinter);
		const nonFunctionOutcome = requestPrint(undefined);

		if (throwOutcome.ok || nonFunctionOutcome.ok) {
			throw new Error("預期兩個 outcome 的 ok 皆為 false，收窄型別失敗");
		}
		expect(throwOutcome.message).toBe(PRINT_BLOCKED_MESSAGE);
		expect(nonFunctionOutcome.message).toBe(PRINT_BLOCKED_MESSAGE);
	});

	it("被擋訊息為繁體中文且以可執行的指引句型撰寫", () => {
		// 對照既有訊息慣例（round.ts 的 EMPTY_ROSTER_MESSAGE 等）：以「請」提出可採取的
		// 動作、以全形句號結尾。這條擋的是「關鍵字都在但讀起來不成句」的退化。
		expect(PRINT_BLOCKED_MESSAGE).toContain("請");
		expect(PRINT_BLOCKED_MESSAGE.endsWith("。")).toBe(true);
		// 簡體字檢查：取訊息中實際使用到、且簡繁不同形的字。
		expect(PRINT_BLOCKED_MESSAGE).not.toMatch(/[览览单择开览试览]/);
		expect(PRINT_BLOCKED_MESSAGE).toContain("覽");
	});

	it("被擋訊息不包含未轉譯的原始技術錯誤碼", () => {
		const throwingPrinter = () => {
			throw new Error("SOME_TECHNICAL_ERROR_CODE");
		};

		const outcome = requestPrint(throwingPrinter);

		if (outcome.ok) {
			throw new Error("預期 outcome.ok 為 false，收窄型別失敗");
		}
		expect(outcome.message).not.toContain("SOME_TECHNICAL_ERROR_CODE");
		expect(outcome.message).not.toContain("Error");
	});

	// 用 [標籤, 值] 配對而非直接展開值：vitest 的 %p 在本 repo 實測不會被代換，
	// 四個 case 會顯示成完全相同的名稱，紅燈時無從辨識是哪一種輸入
	// （沿用 history-csv.test.ts 的 %s + 顯式標籤慣例）。
	it.each([
		["null", null],
		["字串", "not-a-function"],
		["數字", 42],
		["物件", {}],
		["陣列", []],
		["布林值", true],
	])("非函式輸入（%s）時判定為被阻擋", (_label, value) => {
		const outcome = requestPrint(value);

		expect(outcome.ok).toBe(false);
	});
});
