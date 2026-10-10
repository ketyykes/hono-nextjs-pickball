import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { GameOverDialog } from "./GameOverDialog";
import { createInitialState } from "@/lib/scoreboard/reducer";

describe("GameOverDialog", () => {
	it("獲勝標題為純文字不含獎盃 emoji", () => {
		const state = {
			...createInitialState(),
			status: "finished" as const,
			winner: "us" as const,
			scores: { us: 11, them: 0 },
		};

		render(<GameOverDialog state={state} onPlayAgain={vi.fn()} />);

		expect(screen.getByRole("heading", { name: "我方獲勝" }).textContent).toBe(
			"我方獲勝",
		);
	});
});
