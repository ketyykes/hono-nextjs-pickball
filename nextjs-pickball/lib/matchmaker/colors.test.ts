import { describe, it, expect } from "vitest";
import { pickTextColor, contrastRatio, defaultGradient, LIGHT_FOREGROUND, DARK_FOREGROUND } from "./colors";

// Hex 色碼格式檢查，與 lib/matchmaker/types.ts 的 HexColorSchema 規則相同，
// 但刻意不 import 該檔案，保持 colors.ts／colors.test.ts 與資料模型的獨立性。
const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

/**
 * 將 6 碼 hex 色碼字串轉為 HSL 色相角度（0～360）。
 * 僅供本測試檔驗證調色盤「視覺上可區分」使用，刻意不搬進 colors.ts——
 * 該檔的公開 API 不該為了測試判準而膨脹（見 spec Requirement「雙色漸層與文字對比」）。
 */
function hexToHue(hex: string): number {
	const r = parseInt(hex.slice(1, 3), 16) / 255;
	const g = parseInt(hex.slice(3, 5), 16) / 255;
	const b = parseInt(hex.slice(5, 7), 16) / 255;
	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);
	const delta = max - min;

	let hue: number;
	if (delta === 0) {
		hue = 0;
	} else if (max === r) {
		hue = 60 * (((g - b) / delta) % 6);
	} else if (max === g) {
		hue = 60 * ((b - r) / delta + 2);
	} else {
		hue = 60 * ((r - g) / delta + 4);
	}

	return hue < 0 ? hue + 360 : hue;
}

/** 兩色相角度的環狀距離（0～180），取 min(d, 360-d)。 */
function circularHueDistance(a: number, b: number): number {
	const diff = Math.abs(a - b);
	return Math.min(diff, 360 - diff);
}

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
	it("defaultGradient 依序提供不重複的預設漸層", () => {
		const results = Array.from({ length: 6 }, (_, index) => defaultGradient(index));

		for (let i = 1; i < results.length; i++) {
			expect(results[i]).not.toEqual(results[i - 1]);
		}

		for (const gradient of results) {
			expect(gradient.colorFrom).toMatch(HEX_COLOR_PATTERN);
			expect(gradient.colorTo).toMatch(HEX_COLOR_PATTERN);
		}
	});

	it("defaultGradient 提供 16 組互異漸層並循環取用", () => {
		const results = Array.from({ length: 16 }, (_, index) => defaultGradient(index));
		const serialized = new Set(results.map((gradient) => `${gradient.colorFrom}|${gradient.colorTo}`));

		expect(serialized.size).toBe(16);
		expect(defaultGradient(16)).toEqual(defaultGradient(0));
		expect(defaultGradient(-1)).toMatchObject({
			colorFrom: expect.stringMatching(HEX_COLOR_PATTERN),
			colorTo: expect.stringMatching(HEX_COLOR_PATTERN),
		});
	});

	it("調色盤任兩組色相差至少 13 度且不共用 colorTo", () => {
		const results = Array.from({ length: 16 }, (_, index) => defaultGradient(index));
		const hues = results.map((gradient) => hexToHue(gradient.colorFrom));

		// 兩兩比對（16 組共 120 個 pair），收集所有色相差 < 13 度的違規配對，
		// 一次性列出而非在第一個違規就中斷，避免掩蓋其餘違規、誤導修正範圍。
		// 門檻取 13 度而非更高：既有 6 組中 teal 與 emerald 相差 13.46 度，是既有調色盤的
		// 實際下限——訂在更高會等於要求改動既有色（見 spec Requirement「雙色漸層與文字對比」）。
		const hueViolations: string[] = [];
		for (let i = 0; i < results.length; i++) {
			for (let j = i + 1; j < results.length; j++) {
				const distance = circularHueDistance(hues[i], hues[j]);
				if (distance < 13) {
					hueViolations.push(
						`index ${i}（${results[i].colorFrom}）與 index ${j}（${results[j].colorFrom}）色相差僅 ${distance.toFixed(2)} 度`,
					);
				}
			}
		}
		expect(hueViolations, hueViolations.join("\n")).toEqual([]);

		const colorTos = results.map((gradient) => gradient.colorTo);
		expect(new Set(colorTos).size, "16 組 colorTo 須全部互異").toBe(colorTos.length);
	});
});
