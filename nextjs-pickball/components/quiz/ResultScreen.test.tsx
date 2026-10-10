import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ResultScreen } from "./ResultScreen";

describe("ResultScreen", () => {
	it("三個分數區間的鼓勵文字各搭配對應的 lucide 圖示", () => {
		const cases: [number, string, string][] = [
			[9, "太強了！你已經是規則達人了", "lucide-trophy"],
			[6, "不錯！再練習幾次就能完全掌握規則", "lucide-biceps-flexed"],
			[2, "繼續加油，回去再讀一次指南吧！", "lucide-book-open"],
		];
		for (const [correctCount, text, iconClass] of cases) {
			const { unmount } = render(
				<ResultScreen correctCount={correctCount} total={10} onRestart={vi.fn()} />,
			);
			const paragraph = screen.getByText(text, { exact: true });
			const svgs = paragraph.querySelectorAll("svg");
			expect(svgs).toHaveLength(1);
			expect(svgs[0].getAttribute("class")).toContain(iconClass);
			unmount();
		}
	});
});
