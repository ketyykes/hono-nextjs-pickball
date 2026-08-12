import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/hooks/useScrolledPast", () => ({
	useScrolledPast: vi.fn(),
}));

vi.mock("@/hooks/useScrollSpy", () => ({
	useScrollSpy: vi.fn(),
}));

import { TocBar } from "./TocBar";

async function setScrolledPast(value: boolean) {
	const { useScrolledPast } = await import("@/hooks/useScrolledPast");
	(
		useScrolledPast as unknown as { mockReturnValue: (v: boolean) => void }
	).mockReturnValue(value);
}

async function setActiveSection(id: string | null) {
	const { useScrollSpy } = await import("@/hooks/useScrollSpy");
	(
		useScrollSpy as unknown as { mockReturnValue: (v: string | null) => void }
	).mockReturnValue(id);
}

function tocRoot(container: HTMLElement): HTMLElement {
	const nav = container.querySelector("nav");
	if (!nav) throw new Error("TocBar 未渲染 nav 根元素");
	return nav as HTMLElement;
}

describe("TocBar", () => {
	beforeEach(async () => {
		await setActiveSection(null);
	});

	it("TocBar 在 Hero 範圍內為透明底且不帶 shadow", async () => {
		await setScrolledPast(false);

		const { container } = render(<TocBar />);
		const className = tocRoot(container).className;

		expect(className).toContain("bg-slate-900/30");
		expect(className).toContain("backdrop-blur-sm");
		expect(className).not.toMatch(/shadow-/);
	});

	it("TocBar 在捲離 Hero 後為白底加 shadow-sm", async () => {
		await setScrolledPast(true);

		const { container } = render(<TocBar />);
		const className = tocRoot(container).className;

		expect(className).toContain("bg-background/90");
		expect(className).toContain("shadow-sm");
		expect(className).toContain("backdrop-blur-md");
	});

	it("TOC link 在對應 section 進入視窗時高亮", async () => {
		await setScrolledPast(false);
		await setActiveSection("kitchen");

		render(<TocBar />);
		const activeLink = screen.getByRole("link", { name: "廚房" });
		const inactiveLink = screen.getByRole("link", { name: "場地" });

		expect(activeLink.className).toContain("border-b-lime-400");
		expect(inactiveLink.className).toContain("border-transparent");
	});
});
