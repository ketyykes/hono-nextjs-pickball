import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MythRow } from "./MythRow";

describe("MythRow", () => {
	it("迷思與正確規則標籤以 lucide 叉勾圖示取代字元", () => {
		const { container } = render(<MythRow myth="某個迷思" fact="某個事實" />);

		const mythLabel = screen.getByText("常見迷思");
		const factLabel = screen.getByText("正確規則");
		expect(mythLabel.querySelectorAll("svg").length).toBe(1);
		expect(factLabel.querySelectorAll("svg").length).toBe(1);
		expect(mythLabel.querySelector("svg")?.classList.contains("lucide-x")).toBe(true);
		expect(factLabel.querySelector("svg")?.classList.contains("lucide-check")).toBe(true);
		expect(container.textContent).not.toContain("✕");
		expect(container.textContent).not.toContain("✓");
	});
});
