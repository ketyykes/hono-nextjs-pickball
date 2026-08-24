import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/hooks/useScrolledPast", () => ({
	useScrolledPast: vi.fn(() => false),
}));

vi.mock("next/navigation", () => ({
	usePathname: vi.fn(() => "/"),
}));

import { SiteNavbar } from "./SiteNavbar";

async function capturedThreshold(): Promise<() => number> {
	const { useScrolledPast } = await import("@/hooks/useScrolledPast");
	const mock = useScrolledPast as unknown as {
		mock: { calls: [unknown][] };
	};
	const arg = mock.mock.calls.at(-1)?.[0];
	if (typeof arg !== "function") {
		throw new Error("useScrolledPast 未收到 function threshold");
	}
	return arg as () => number;
}

describe("SiteNavbar", () => {
	beforeEach(() => {
		window.innerHeight = 800;
	});

	afterEach(() => {
		document.documentElement.style.removeProperty("--site-nav-h");
		// clearAllMocks 只清 calls，不清 mockReturnValue 覆寫；resetAllMocks 會把
		// usePathname／useScrolledPast 還原成 vi.mock 當初給的 () => "/"、() => false，
		// 避免某測試覆寫的 pathname 洩漏到後續測試。
		vi.resetAllMocks();
	});

	it("捲離 Hero 的門檻讀取 --site-nav-h 而非硬寫數值", async () => {
		// 刻意設成非預設值：若實作硬寫 56，門檻會是 744 而非 700。
		document.documentElement.style.setProperty("--site-nav-h", "100px");

		render(<SiteNavbar />);
		const threshold = await capturedThreshold();

		expect(threshold()).toBe(700);
	});

	it("--site-nav-h 為預設 3.5rem 時門檻為 viewport 高度減 56", async () => {
		document.documentElement.style.setProperty("--site-nav-h", "3.5rem");

		render(<SiteNavbar />);
		const threshold = await capturedThreshold();

		expect(threshold()).toBe(744);
	});

	it("導航列不包含內部診斷路由 /health", () => {
		render(<SiteNavbar />);

		const links = screen.getAllByRole("link");
		const hrefs = links.map((link) => link.getAttribute("href"));

		expect(hrefs).not.toContain("/health");
	});

	it("Navbar 顯示對戰分配連結且指向 /matchmaker", () => {
		render(<SiteNavbar />);

		const link = screen.getByRole("link", { name: "對戰分配" });

		expect(link.getAttribute("href")).toBe("/matchmaker");
	});

	it("路由為 /matchmaker 時對戰分配連結套用 active 樣式", async () => {
		const { usePathname } = await import("next/navigation");
		(
			usePathname as unknown as { mockReturnValue: (v: string) => void }
		).mockReturnValue("/matchmaker");

		render(<SiteNavbar />);

		// twMerge 會讓 active 連結的 base "text-muted-foreground" 被同組的
		// "text-slate-900" 蓋掉，因此以精確 token 比對區分 active／muted，
		// 不能用 substring（"text-slate-900" 是 "hover:text-slate-900" 的子字串）。
		const activeClasses = screen
			.getByRole("link", { name: "對戰分配" })
			.className.split(/\s+/);
		expect(activeClasses).toContain("text-slate-900");
		expect(activeClasses).not.toContain("text-muted-foreground");

		for (const label of ["首頁", "完整體驗", "計分板", "測驗"]) {
			const mutedClasses = screen
				.getByRole("link", { name: label })
				.className.split(/\s+/);
			expect(mutedClasses).toContain("text-muted-foreground");
			expect(mutedClasses).not.toContain("text-slate-900");
		}
	});

	it("路由非 /matchmaker 時對戰分配連結不套用 active 樣式", async () => {
		const { usePathname } = await import("next/navigation");
		(
			usePathname as unknown as { mockReturnValue: (v: string) => void }
		).mockReturnValue("/matchmaker/players");

		render(<SiteNavbar />);

		// /matchmaker/players 是子路徑而非 /matchmaker 本身：若 active 判定誤用
		// 前綴比對（pathname.startsWith(link.href)）或對新連結整段失效，
		// 「對戰分配」會在名單頁誤判為 active，使使用者誤以為自己在對戰頁。
		const classes = screen
			.getByRole("link", { name: "對戰分配" })
			.className.split(/\s+/);
		expect(classes).toContain("text-muted-foreground");
		expect(classes).not.toContain("text-slate-900");
	});

	it("logo 與所有導航連結皆套用 whitespace-nowrap", () => {
		render(<SiteNavbar />);

		// spec 明文：whitespace-nowrap 是窄螢幕不換行的核心保險絲，390px 下餘裕
		// 已從 90px 縮到約 28px，390px 斷點本身的 E2E 高度量測在餘裕為正時測不出
		// 少了這個 class（不會換行），因此在單元層直接驗 class 是否存在。
		const links = screen.getAllByRole("link");
		expect(links.length).toBeGreaterThan(0);
		for (const link of links) {
			expect(link.className.split(/\s+/)).toContain("whitespace-nowrap");
		}
	});
});
