import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GameOverDialog } from "./GameOverDialog";
import { createInitialState } from "@pickball/core/scoreboard/reducer";

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

	const finishedState = {
		...createInitialState(),
		status: "finished" as const,
		winner: "us" as const,
		scores: { us: 11, them: 0 },
	};

	it("綁定模式顯示返回對戰連結且不顯示再來一局", () => {
		render(<GameOverDialog state={finishedState} onPlayAgain={vi.fn()} matchId="m1" />);

		const dialog = screen.getByRole("dialog");
		const link = within(dialog).getByRole("link", { name: "返回對戰" });
		expect(link.getAttribute("href")).toBe("/matchmaker");
		expect(within(dialog).getByRole("button", { name: "關閉" })).toBeTruthy();
		expect(within(dialog).queryByRole("button", { name: "再來一局" })).toBeNull();
	});

	it("綁定模式按關閉後對話框關閉且不呼叫 onPlayAgain", async () => {
		const user = userEvent.setup();
		const onPlayAgain = vi.fn();
		render(<GameOverDialog state={finishedState} onPlayAgain={onPlayAgain} matchId="m1" />);

		const dialog = screen.getByRole("dialog");
		await user.click(within(dialog).getByRole("button", { name: "關閉" }));

		expect(screen.queryByRole("dialog")).toBeNull();
		expect(onPlayAgain).toHaveBeenCalledTimes(0);
	});

	it("獨立模式顯示再來一局且點擊即呼叫 onPlayAgain 而不經二次確認", async () => {
		const user = userEvent.setup();
		const onPlayAgain = vi.fn();
		render(<GameOverDialog state={finishedState} onPlayAgain={onPlayAgain} />);

		const dialog = screen.getByRole("dialog");
		expect(within(dialog).getByRole("button", { name: "關閉" })).toBeTruthy();
		expect(within(dialog).getByRole("button", { name: "再來一局" })).toBeTruthy();
		expect(within(dialog).queryByRole("link", { name: "返回對戰" })).toBeNull();

		await user.click(within(dialog).getByRole("button", { name: "再來一局" }));

		expect(onPlayAgain).toHaveBeenCalledTimes(1);
		expect(screen.queryByRole("alertdialog")).toBeNull();
	});
});
