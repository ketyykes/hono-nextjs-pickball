"use client";

import { Button } from "@/components/ui/button";
import { ServeIndicator } from "@/components/scoreboard/ServeIndicator";
import { cn } from "@/lib/utils";
import type { ScoreboardState, Team } from "@/lib/scoreboard/types";

interface TeamPanelProps {
	team: Team;
	label: string;
	state: ScoreboardState;
	disabled: boolean;
	onWinRally: () => void;
}

// 單隊面板：分數、發球指示（僅當該隊在發球時顯示）、「贏這球+」按鈕
export function TeamPanel({ team, label, state, disabled, onWinRally }: TeamPanelProps) {
	const score = state.scores[team];
	const isServing = state.servingTeam === team;
	return (
		<div className="flex flex-1 flex-col items-center justify-center gap-6 p-6">
			<div className="font-outfit text-sm uppercase tracking-[3px] text-muted-foreground">
				{label}
			</div>
			<div
				aria-live="polite"
				aria-label={`${label}目前 ${score} 分`}
				className={cn(
					"font-bebas text-[10rem] leading-none md:text-[14rem]",
					isServing ? "text-lime-400" : "text-foreground",
				)}
			>
				{score}
			</div>
			{/* 永遠保留 indicator slot 佔位（含上下 gap）；非發球方用 invisible 隱藏內容但保留版面，避免「贏這球+」按鈕在發球權切換時上下跳動。aria-hidden 讓讀屏不重複讀出隱藏字串 */}
			<div className={cn(!isServing && "invisible")} aria-hidden={!isServing}>
				<ServeIndicator
					servingTeamScore={score}
					serverNumber={state.serverNumber}
					showServerNumber={state.mode === "doubles"}
				/>
			</div>
			<Button
				size="lg"
				disabled={disabled}
				onClick={onWinRally}
				aria-label={`${label}贏這一球，當前 ${score} 分`}
				className="bg-lime-400 text-slate-900 hover:bg-lime-300"
			>
				贏這球 +
			</Button>
		</div>
	);
}
