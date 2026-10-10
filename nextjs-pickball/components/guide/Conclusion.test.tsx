import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Conclusion } from "./Conclusion";

describe("Conclusion", () => {
	it("三張結論卡各以一個自繪符號取代 emoji", () => {
		render(<Conclusion />);

		const titles = ["下手發球打對角", "前兩拍必須落地", "廚房裡不能截擊"];
		for (const title of titles) {
			const card = screen.getByText(title).parentElement as HTMLElement;
			expect(card.querySelectorAll("svg").length).toBe(1);
			expect(card.textContent).not.toMatch(/\u{1F3D3}|\u{1F504}|\u{1F373}/u);
		}
	});
});
