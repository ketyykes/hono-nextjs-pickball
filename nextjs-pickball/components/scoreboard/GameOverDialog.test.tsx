import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { GameOverDialog } from "./GameOverDialog";
import { createInitialState } from "@/lib/scoreboard/reducer";

describe("GameOverDialog", () => {
	it("獲勝標題以 lucide 獎盃圖示搭配勝方文字", () => {
		const state = {
			...createInitialState(),
			status: "finished" as const,
			winner: "us" as const,
			scores: { us: 11, them: 0 },
		};

		render(<GameOverDialog state={state} onPlayAgain={vi.fn()} />);

		const heading = screen.getByRole("heading", { name: "我方獲勝" });
		expect(heading.textContent).toBe("我方獲勝");
		const svg = heading.querySelector("svg");
		expect(svg).not.toBeNull();
		expect(svg?.classList.contains("lucide-trophy")).toBe(true);
	});
});
