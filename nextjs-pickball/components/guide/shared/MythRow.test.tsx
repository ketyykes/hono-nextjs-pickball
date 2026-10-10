import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MythRow } from "./MythRow";

describe("MythRow", () => {
	it("迷思與正確規則標籤以符號取代叉勾字元", () => {
		const { container } = render(<MythRow myth="某個迷思" fact="某個事實" />);

		const mythLabel = screen.getByText("常見迷思");
		const factLabel = screen.getByText("正確規則");
		expect(mythLabel.querySelectorAll("svg").length).toBe(1);
		expect(factLabel.querySelectorAll("svg").length).toBe(1);
		expect(container.textContent).not.toContain("✕");
		expect(container.textContent).not.toContain("✓");
	});
});
