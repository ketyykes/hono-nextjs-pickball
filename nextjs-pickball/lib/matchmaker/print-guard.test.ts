import { describe, it, expect, vi } from "vitest";

import { requestPrint } from "./print-guard";

describe("requestPrint", () => {
	it("列印函式拋錯時判定為被阻擋並回傳繁體中文訊息", () => {
		const throwingPrinter = vi.fn(() => {
			throw new Error("blocked");
		});

		const outcome = requestPrint(throwingPrinter);

		expect(outcome.ok).toBe(false);
		if (outcome.ok) {
			throw new Error("expected outcome.ok to be false");
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
			throw new Error("expected both outcomes to be false");
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
			throw new Error("expected both outcomes to be false");
		}
		expect(throwOutcome.message).toBe(nonFunctionOutcome.message);
	});

	it("被擋訊息同時提供開啟彈出視窗權限與瀏覽器選單列印兩條退路", () => {
		const outcome = requestPrint(undefined);

		if (outcome.ok) {
			throw new Error("expected outcome.ok to be false");
		}
		expect(outcome.message).toContain("彈出視窗");
		expect(outcome.message).toMatch(/Ctrl.*P|Cmd.*P/);
	});

	it("被擋訊息不包含未轉譯的原始技術錯誤碼", () => {
		const throwingPrinter = () => {
			throw new Error("SOME_TECHNICAL_ERROR_CODE");
		};

		const outcome = requestPrint(throwingPrinter);

		if (outcome.ok) {
			throw new Error("expected outcome.ok to be false");
		}
		expect(outcome.message).not.toContain("SOME_TECHNICAL_ERROR_CODE");
		expect(outcome.message).not.toContain("Error");
	});

	it.each([null, "not-a-function", 42, {}])("非函式輸入 %p 時判定為被阻擋", (value) => {
		const outcome = requestPrint(value);

		expect(outcome.ok).toBe(false);
	});
});
