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
		// @container-size（需 tailwindcss >= 4.3）：panel 為 size container，
		// 「後代」的 cqh/cqw 以 panel 內容盒為基準——分數字級因此跟隨面板實際
		// 可用高度，直向（panel≈可用高一半）與橫向（panel≈全高）共用同一組參數，
		// 並自動吸收 OrientationHint 顯示/關閉等高度變因。禁用寬度斷點字級
		// （md:text-[14rem] 會讓平板直向、橫向手機誤中大字而溢出）。
		// gap/padding 掛在 panel 自身，cq 單位查不到自己、只會 fallback 到視口，
		// 故明確用 dvh（隨視窗高縮放，與外層 h-dvh 鎖高一致）。
		<div className="@container-size flex min-h-0 min-w-0 flex-1 flex-col items-center justify-center gap-[clamp(0.375rem,2dvh,1.5rem)] p-[clamp(0.375rem,2dvh,1.5rem)]">
			<div className="font-outfit text-sm uppercase tracking-[3px] text-muted-foreground">
				<span>{label}</span>
				<span className="opacity-70"> · {state.targetScore} 分制</span>
			</div>
			<div
				aria-live="polite"
				aria-label={`${label}目前 ${score} 分`}
				className={cn(
					"font-bebas leading-none text-[clamp(2.5rem,min(37cqh,38cqw),14rem)]",
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
