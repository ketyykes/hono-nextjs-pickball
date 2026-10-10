import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ResultScreen } from "./ResultScreen";

describe("ResultScreen", () => {
	it("三個分數區間的鼓勵文字皆為純文字", () => {
		const cases: [number, string][] = [
			[9, "太強了！你已經是規則達人了"],
			[6, "不錯！再練習幾次就能完全掌握規則"],
			[2, "繼續加油，回去再讀一次指南吧！"],
		];
		for (const [correctCount, text] of cases) {
			const { unmount } = render(
				<ResultScreen correctCount={correctCount} total={10} onRestart={vi.fn()} />,
			);
			expect(screen.getByText(text, { exact: true })).toBeTruthy();
			unmount();
		}
	});
});
