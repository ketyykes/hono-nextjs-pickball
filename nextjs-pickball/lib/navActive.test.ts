import { describe, it, expect } from "vitest";
import { isNavLinkActive } from "@/lib/navActive";

describe("isNavLinkActive", () => {
	it("首頁連結只在 pathname 恰為 / 時為 active", () => {
		expect(isNavLinkActive("/", "/")).toBe(true);
		expect(isNavLinkActive("/", "/quiz")).toBe(false);
		expect(isNavLinkActive("/", "/matchmaker/players")).toBe(false);
	});

	it("pathname 與 href 完全相等時為 active", () => {
		expect(isNavLinkActive("/quiz", "/quiz")).toBe(true);
		expect(isNavLinkActive("/matchmaker", "/matchmaker")).toBe(true);
	});

	it("pathname 為 href 的子路由時為 active", () => {
		const subPaths = [
			"/matchmaker/players",
			"/matchmaker/history",
			"/matchmaker/stats",
			"/matchmaker/data",
		];
		for (const pathname of subPaths) {
			expect(isNavLinkActive("/matchmaker", pathname)).toBe(true);
		}
	});

	it("前綴相似但非子路由時不為 active", () => {
		expect(isNavLinkActive("/matchmaker", "/matchmakerx")).toBe(false);
		expect(isNavLinkActive("/matchmaker", "/matchmaker-old")).toBe(false);
		expect(isNavLinkActive("/tour", "/tournament")).toBe(false);
		expect(isNavLinkActive("/quiz", "/scoreboard")).toBe(false);
	});

	it("pathname 帶尾斜線時仍視為同一區段", () => {
		expect(isNavLinkActive("/quiz", "/quiz/")).toBe(true);
		expect(isNavLinkActive("/matchmaker", "/matchmaker/players/")).toBe(true);
	});
});
