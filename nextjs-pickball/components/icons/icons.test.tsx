import { render } from "@testing-library/react";
import type { ComponentType } from "react";
import { describe, expect, it } from "vitest";
import {
	DoubleBounceIcon,
	KitchenZoneIcon,
	LogoMark,
	RotateToLandscapeIcon,
	ServeDiagonalIcon,
} from "./index";

interface SymbolEntry {
	name: string;
	Component: ComponentType<{ className?: string }>;
}

const SYMBOLS: SymbolEntry[] = [
	{ name: "LogoMark", Component: LogoMark },
	{ name: "ServeDiagonalIcon", Component: ServeDiagonalIcon },
	{ name: "DoubleBounceIcon", Component: DoubleBounceIcon },
	{ name: "KitchenZoneIcon", Component: KitchenZoneIcon },
	{ name: "RotateToLandscapeIcon", Component: RotateToLandscapeIcon },
];

describe("components/icons 符號元件", () => {
	it("每個符號元件預設渲染對輔助科技隱藏的單一 svg", () => {
		for (const { name, Component } of SYMBOLS) {
			const { container, unmount } = render(<Component />);
			const svgs = container.querySelectorAll("svg");
			expect(svgs.length, name).toBe(1);
			expect(svgs[0].getAttribute("aria-hidden"), name).toBe("true");
			expect(svgs[0].getAttribute("focusable"), name).toBe("false");
			unmount();
		}
	});

	it("符號元件只使用 currentColor 且不含漸層", () => {
		for (const { name, Component } of SYMBOLS) {
			const { container, unmount } = render(<Component />);
			const svg = container.querySelector("svg");
			const html = svg?.outerHTML ?? "";
			expect(html, name).not.toMatch(/(?<![\w(])#[0-9a-f]{3,8}\b/i);
			expect(html, name).not.toContain("rgb(");
			expect(html, name).not.toContain("Gradient");

			const allowed = ["currentColor", "none"];
			const elements = [svg, ...Array.from(svg?.querySelectorAll("*") ?? [])];
			for (const element of elements) {
				for (const attr of ["stroke", "fill"]) {
					const value = element?.getAttribute(attr);
					if (value !== null && value !== undefined) {
						expect(allowed, `${name} ${attr}`).toContain(value);
					}
				}
			}
			unmount();
		}
	});

	it("className 會傳遞到 svg 根元素", () => {
		for (const { name, Component } of SYMBOLS) {
			const { container, unmount } = render(<Component className="size-6" />);
			const svg = container.querySelector("svg");
			expect(svg?.classList.contains("size-6"), name).toBe(true);
			unmount();
		}
	});

	it("自繪符號只涵蓋球場與品牌專屬圖形", async () => {
		const exported = Object.keys(await import("./index")).sort();
		expect(exported).toEqual([
			"DoubleBounceIcon",
			"KitchenZoneIcon",
			"LogoMark",
			"RotateToLandscapeIcon",
			"ServeDiagonalIcon",
		]);
	});
});
