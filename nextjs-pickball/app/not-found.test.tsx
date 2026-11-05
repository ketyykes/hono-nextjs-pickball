import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";

import NotFound, { metadata } from "./not-found";

describe("全站 404 頁", () => {
	it("404 頁匯出中文 metadata 標題", () => {
		expect(metadata.title).toBe("找不到頁面 | 匹克球指南");
	});

	it("404 頁顯示中文標題、說明與回首頁、前往對戰分配兩個連結", () => {
		render(<NotFound />);

		const heading = screen.getByRole("heading", {
			level: 1,
			name: "找不到這個頁面",
		});
		expect(heading).toBeTruthy();

		// navbar 也有「首頁」「對戰分配」連結，導回連結一律在 main 內查找。
		const main = screen.getByRole("main");
		const paragraphs = Array.from(main.querySelectorAll("p"));
		const hasDescription = paragraphs.some(
			(p) => /[一-鿿]/.test(p.textContent ?? ""),
		);
		expect(hasDescription).toBe(true);

		const home = within(main).getByRole("link", { name: "回首頁" });
		expect(home.getAttribute("href")).toBe("/");
		expect(home.getAttribute("data-slot")).toBe("button");

		const matchmaker = within(main).getByRole("link", { name: "前往對戰分配" });
		expect(matchmaker.getAttribute("href")).toBe("/matchmaker");
		expect(matchmaker.getAttribute("data-slot")).toBe("button");

		expect(main.className.split(/\s+/)).toContain("pt-(--site-nav-h)");
	});
});
