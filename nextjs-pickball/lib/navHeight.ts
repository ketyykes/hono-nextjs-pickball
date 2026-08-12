// SiteNavbar 高度的單一事實來源是 app/globals.css 的 --site-nav-h。
// 需要以 px 參與 JS 運算（如捲動門檻）時一律經此換算，不要在各元件散落數值。

/** `--site-nav-h` 讀不到或無法解析時的退路：對應預設的 3.5rem @ 16px。 */
export const NAV_HEIGHT_FALLBACK_PX = 56;

export function getNavHeightPx(): number {
	if (typeof window === "undefined") return NAV_HEIGHT_FALLBACK_PX;

	const raw = getComputedStyle(document.documentElement)
		.getPropertyValue("--site-nav-h")
		.trim();
	if (!raw) return NAV_HEIGHT_FALLBACK_PX;

	const value = Number.parseFloat(raw);
	if (Number.isNaN(value)) return NAV_HEIGHT_FALLBACK_PX;

	if (raw.endsWith("rem")) {
		const rootFontSize = Number.parseFloat(
			getComputedStyle(document.documentElement).fontSize,
		);
		const base = Number.isNaN(rootFontSize) ? 16 : rootFontSize;
		return value * base;
	}

	if (raw.endsWith("px")) return value;

	return NAV_HEIGHT_FALLBACK_PX;
}
