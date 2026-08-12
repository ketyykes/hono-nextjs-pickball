import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PriceStars } from "./PriceStars";

describe("PriceStars", () => {
	it("以 aria-label 表達 1~10 星的價位語意", () => {
		render(<PriceStars stars={7} />);

		expect(screen.getByRole("img", { name: "價位 7／10 顆星" })).toBeTruthy();
	});

	it("渲染 10 顆星，其中實心星數量等於 stars", () => {
		const { container } = render(<PriceStars stars={4} />);

		const filled = container.querySelectorAll("[data-star='filled']");
		const empty = container.querySelectorAll("[data-star='empty']");
		expect(filled.length).toBe(4);
		expect(empty.length).toBe(6);
	});

	it("stars 超出範圍時收斂至 1~10 的邊界", () => {
		const { container: over } = render(<PriceStars stars={12} />);
		expect(over.querySelectorAll("[data-star='filled']").length).toBe(10);

		const { container: under } = render(<PriceStars stars={0} />);
		expect(under.querySelectorAll("[data-star='filled']").length).toBe(1);
	});

	it("stars 為 NaN 時仍收斂至最小值，不產生 NaN 標籤", () => {
		render(<PriceStars stars={Number.NaN} />);

		expect(screen.getByRole("img", { name: "價位 1／10 顆星" })).toBeTruthy();
	});
});
