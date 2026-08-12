import { describe, it, expect, afterEach } from "vitest";
import { getNavHeightPx, NAV_HEIGHT_FALLBACK_PX } from "./navHeight";

function setNavHeight(value: string) {
	document.documentElement.style.setProperty("--site-nav-h", value);
}

describe("getNavHeightPx", () => {
	afterEach(() => {
		document.documentElement.style.removeProperty("--site-nav-h");
		document.documentElement.style.removeProperty("font-size");
	});

	it("以 rem 宣告時依 root font-size 換算為 px", () => {
		document.documentElement.style.fontSize = "16px";
		setNavHeight("3.5rem");

		expect(getNavHeightPx()).toBe(56);
	});

	it("以 px 宣告時直接取用數值", () => {
		setNavHeight("72px");

		expect(getNavHeightPx()).toBe(72);
	});

	it("root font-size 非 16px 時 rem 換算跟著改變", () => {
		document.documentElement.style.fontSize = "20px";
		setNavHeight("3.5rem");

		expect(getNavHeightPx()).toBe(70);
	});

	it("變數未定義時回傳 fallback", () => {
		expect(getNavHeightPx()).toBe(NAV_HEIGHT_FALLBACK_PX);
	});

	it("變數為無法解析的值時回傳 fallback", () => {
		setNavHeight("not-a-length");

		expect(getNavHeightPx()).toBe(NAV_HEIGHT_FALLBACK_PX);
	});
});
