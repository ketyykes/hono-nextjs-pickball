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
		vi.clearAllMocks();
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
});
