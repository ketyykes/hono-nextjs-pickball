import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { OrientationHint } from "./OrientationHint";

describe("OrientationHint", () => {
	it("提示橫幅以轉向符號取代燈泡 emoji", () => {
		render(<OrientationHint visible />);

		const status = screen.getByRole("status");
		expect(status.textContent).toContain("建議橫向使用，體驗更好");
		expect(status.textContent).not.toContain("\u{1F4A1}");
		const hidden = status.querySelectorAll("svg[aria-hidden='true']");
		const outsideButton = [...hidden].filter((svg) => !svg.closest("button"));
		expect(outsideButton.length).toBe(1);
	});
});
