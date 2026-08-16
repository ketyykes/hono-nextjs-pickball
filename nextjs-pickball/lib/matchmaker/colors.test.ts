import { describe, it, expect } from "vitest";
import { pickTextColor, contrastRatio, defaultGradient, LIGHT_FOREGROUND, DARK_FOREGROUND } from "./colors";

// Hex 色碼格式檢查，與 lib/matchmaker/types.ts 的 HexColorSchema 規則相同，
// 但刻意不 import 該檔案，保持 colors.ts／colors.test.ts 與資料模型的獨立性。
const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

describe("pickTextColor", () => {
	it("深色漸層回傳淺色前景", () => {
		const result = pickTextColor("#0E6B63", "#134E4A");
		expect(result).toBe(LIGHT_FOREGROUND);
	});

	it("淺色漸層回傳深色前景", () => {
		const result = pickTextColor("#E8F5F0", "#A7F3D0");
		expect(result).toBe(DARK_FOREGROUND);
	});

	it("一深一淺漸層取兩端最小對比較高的前景色", () => {
		const colorFrom = "#0E1A1A";
		const colorTo = "#E8F5F0";
		const result = pickTextColor(colorFrom, colorTo);
		const other = result === LIGHT_FOREGROUND ? DARK_FOREGROUND : LIGHT_FOREGROUND;

		const resultMinContrast = Math.min(contrastRatio(colorFrom, result), contrastRatio(colorTo, result));
		const otherMinContrast = Math.min(contrastRatio(colorFrom, other), contrastRatio(colorTo, other));

		expect(resultMinContrast).toBeGreaterThanOrEqual(otherMinContrast);
	});
});

describe("defaultGradient", () => {
	it("依序提供不重複的預設漸層", () => {
		const results = Array.from({ length: 6 }, (_, index) => defaultGradient(index));

		for (let i = 1; i < results.length; i++) {
			expect(results[i]).not.toEqual(results[i - 1]);
		}

		for (const gradient of results) {
			expect(gradient.colorFrom).toMatch(HEX_COLOR_PATTERN);
			expect(gradient.colorTo).toMatch(HEX_COLOR_PATTERN);
		}
	});
});
