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

/**
 * 將 6 碼 hex 色碼字串轉為 sRGB 分量。
 * 輸入需為合法 6 碼 hex（由呼叫端經 `PlayerSchema` 保證），否則行為未定義。
 * 本函式不做格式驗證——`colors.ts` 刻意不 import `types.ts`（見檔頭註解），
 * 在此重複驗證 hex 格式會製造與 `PlayerSchema`／`HexColorSchema` 不同步的第二個真相來源。
 */
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

	// 平手（lightScore === darkScore）時取淺色前景，是刻意決定，spec 未規範此邊界。
	// 這不是純理論邊界：存在一個中性灰亮度（relativeLuminance ≈ 0.1791，約 rgb(119,119,119)）
	// 使雙色漸層對深／淺前景的最小對比恰好相等，是可實際觸發的情況。
	return lightScore >= darkScore ? LIGHT_FOREGROUND : DARK_FOREGROUND;
}

/** 一組雙色漸層端點，格式與 `PlayerSchema` 的 `colorFrom`／`colorTo` 一致。 */
export interface GradientPreset {
	colorFrom: string;
	colorTo: string;
}

// 固定的預設調色盤，供新增參賽者時依序取用，相鄰項目彼此色相不同。
// prd.md 12.1 的使用規模為 8～40 人，4.1.1 明訂漸層目的是「讓使用者快速辨識球場位置」，
// 故調色盤 MUST 至少涵蓋 16 組互異漸層（見 spec Requirement「雙色漸層與文字對比」）。
// 前 6 組（teal／violet／pink／blue／orange／emerald）為既有行為，保留原順序，
// 避免既有使用者的既有參賽者因調色盤重排而換色；新增的 10 組接在後面。
//
// 「互異」不是序列化字串不同即可，而是視覺上可區分：spec 要求任兩組 colorFrom 的 HSL
// 色相角度差（環狀距離，取 min(d, 360-d)）MUST ≥ 13 度，且任兩組不得共用相同 colorTo；
// 兩者皆由 colors.test.ts 的「調色盤任兩組色相差至少 13 度且不共用 colorTo」把關。
// 16 組實際色相並非均勻每 36 度分散一色（環狀均分 16 組理論上每組約 22.5 度，且原始
// 6 組色相本就不均），而是在既有 6 組色相之間找出足夠寬（≥13 度雙邊留白）的空隙置入新色。
// 門檻定為 13 度而非更高：既有 6 組中 teal（約 175°）與 emerald（約 161°）本身相差僅
// 13.46 度，是既有調色盤的實際下限——訂更高即等於要求改動既有色，代價是既有使用者的
// 既有參賽者換色，故不採。
// 沿用「中等～深色端點」風格，使 pickTextColor 對這 16 組皆穩定回傳淺色前景。
const DEFAULT_GRADIENTS: readonly GradientPreset[] = [
	{ colorFrom: "#0E6B63", colorTo: "#134E4A" }, // teal（既有）
	{ colorFrom: "#7C3AED", colorTo: "#4C1D95" }, // violet（既有）
	{ colorFrom: "#DB2777", colorTo: "#831843" }, // pink（既有）
	{ colorFrom: "#2563EB", colorTo: "#1E3A8A" }, // blue（既有）
	{ colorFrom: "#EA580C", colorTo: "#7C2D12" }, // orange（既有）
	{ colorFrom: "#059669", colorTo: "#064E3B" }, // emerald（既有）
	{ colorFrom: "#DC2626", colorTo: "#7F1D1D" }, // red，補在 orange 與 pink 之間的色相缺口
	{ colorFrom: "#CA8A04", colorTo: "#713F12" }, // amber/yellow，與 orange 區隔開的暖色
	{ colorFrom: "#65A30D", colorTo: "#365314" }, // lime，介於 yellow 與 emerald 之間
	{ colorFrom: "#898F14", colorTo: "#474908" }, // olive，色相約 63°，介於 amber 與 lime 間的缺口（原 cyan-teal 與既有 teal 幾乎重合，改置於此）
	{ colorFrom: "#0284C7", colorTo: "#0C4A6E" }, // sky，介於 cyan 與 blue 之間
	{ colorFrom: "#4F46E5", colorTo: "#312E81" }, // indigo，介於 blue 與 violet 之間
	{ colorFrom: "#148F1B", colorTo: "#08490B" }, // green，色相約 123°，介於 lime 與 emerald 間的缺口（原 purple 與既有 violet 過近，改置於此）
	{ colorFrom: "#C026D3", colorTo: "#701A75" }, // fuchsia，介於 purple 與 pink 之間
	{ colorFrom: "#E11D48", colorTo: "#881337" }, // rose，介於 pink 與 red 之間
	{ colorFrom: "#8F1473", colorTo: "#49083B" }, // magenta，色相約 314°，介於 fuchsia 與 pink 間的缺口（原 slate 與既有 blue 過近，改置於此）
];

/** 依 index 於固定調色盤取模，提供不重複（相鄰不同）的預設漸層。 */
export function defaultGradient(index: number): GradientPreset {
	const length = DEFAULT_GRADIENTS.length;
	const normalizedIndex = ((index % length) + length) % length;
	return DEFAULT_GRADIENTS[normalizedIndex];
}

/**
 * 在 `DEFAULT_GRADIENTS` 中反查指定漸層組合的 index，找不到回 `-1`。
 * 供 `roster.ts` 的 `addPlayer` 掃描目前名單已佔用的 palette index，
 * 藉此取「最小未使用值」而非依賴 `roster.length`（後者在有刪除操作時會與已用
 * index 脫鉤，導致刪除後新增撞色，見 spec「雙色漸層與文字對比」）。
 */
export function paletteIndexOf(colorFrom: string, colorTo: string): number {
	return DEFAULT_GRADIENTS.findIndex((g) => g.colorFrom === colorFrom && g.colorTo === colorTo);
}
