// 雙色漸層文字對比：依 WCAG 相對亮度與對比度公式，為漸層背景選出可讀的前景文字色。
// 本模組只處理 hex 色碼字串，不依賴參賽者資料模型（types.ts），刻意保持獨立。

/**
 * 淺色前景常數。對應 app/globals.css 的 `--background` token（`oklch(1 0 0)`，即純白），
 * 兩者皆為 sRGB #FFFFFF，無需近似換算。
 */
export const LIGHT_FOREGROUND = "#FFFFFF";

/**
 * 深色前景常數。近似對應 app/globals.css 的 `--foreground` token
 * （`oklch(0.129 0.042 264.695)`，換算 sRGB 約為 #030712，即 Tailwind gray-950）。
 * OKLCH → sRGB 的精確轉換需 OKLab 矩陣運算，對本模組是不成比例的複雜度，故採近似值；
 * 若日後調整此 design token，請同步檢查此常數是否仍相近。
 */
export const DARK_FOREGROUND = "#030712";

// 將 0～255 的 sRGB 分量轉為線性光值（WCAG 定義的 gamma 校正，低於 0.03928 走線性分支）。
function channelToLinear(value: number): number {
	const c = value / 255;
	return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
	return {
		r: parseInt(hex.slice(1, 3), 16),
		g: parseInt(hex.slice(3, 5), 16),
		b: parseInt(hex.slice(5, 7), 16),
	};
}

/** WCAG 相對亮度（0～1）。 */
export function relativeLuminance(hex: string): number {
	const { r, g, b } = hexToRgb(hex);
	return 0.2126 * channelToLinear(r) + 0.7152 * channelToLinear(g) + 0.0722 * channelToLinear(b);
}

/** WCAG 對比度（1:1～21:1）。 */
export function contrastRatio(a: string, b: string): number {
	const la = relativeLuminance(a);
	const lb = relativeLuminance(b);
	const lighter = Math.max(la, lb);
	const darker = Math.min(la, lb);
	return (lighter + 0.05) / (darker + 0.05);
}

/**
 * 依漸層兩端點色，選出可讀的前景文字色（design Decision 5）。
 * 不採「兩端平均亮度」判斷深淺——一深一淺的漸層（如 #0E1A1A → #E8F5F0）平均會落在
 * 中間，選深或選淺都可能讓某一端不可讀。改為分別計算兩端點對深色／淺色前景的
 * WCAG 對比度，取「兩端最小對比較高」者：
 *   foreground = argmax( min( contrast(colorFrom, fg), contrast(colorTo, fg) ) )
 * 即使兩者的最小對比皆低於 4.5:1，仍取較高者並允許使用者使用該配色，不阻擋或
 * 強制改色（prd.md 12.5：色彩不得作為唯一資訊來源）。
 */
export function pickTextColor(colorFrom: string, colorTo: string): string {
	const minContrastFor = (fg: string) =>
		Math.min(contrastRatio(colorFrom, fg), contrastRatio(colorTo, fg));

	const darkScore = minContrastFor(DARK_FOREGROUND);
	const lightScore = minContrastFor(LIGHT_FOREGROUND);

	return lightScore >= darkScore ? LIGHT_FOREGROUND : DARK_FOREGROUND;
}

/** 一組雙色漸層端點，格式與 `PlayerSchema` 的 `colorFrom`／`colorTo` 一致。 */
export interface GradientPreset {
	colorFrom: string;
	colorTo: string;
}

// 固定的預設調色盤，供新增參賽者時依序取用，相鄰項目彼此色相不同。
const DEFAULT_GRADIENTS: readonly GradientPreset[] = [
	{ colorFrom: "#0E6B63", colorTo: "#134E4A" },
	{ colorFrom: "#7C3AED", colorTo: "#4C1D95" },
	{ colorFrom: "#DB2777", colorTo: "#831843" },
	{ colorFrom: "#2563EB", colorTo: "#1E3A8A" },
	{ colorFrom: "#EA580C", colorTo: "#7C2D12" },
	{ colorFrom: "#059669", colorTo: "#064E3B" },
];

/** 依 index 於固定調色盤取模，提供不重複（相鄰不同）的預設漸層。 */
export function defaultGradient(index: number): GradientPreset {
	const length = DEFAULT_GRADIENTS.length;
	const normalizedIndex = ((index % length) + length) % length;
	return DEFAULT_GRADIENTS[normalizedIndex];
}
