// components/scoreboard/Scoreboard.tsx
"use client";

import { useState } from "react";
import { useScoreboardStore } from "@/hooks/useScoreboardStore";
import { useOrientation } from "@/hooks/useOrientation";
import { useFullscreen } from "@/hooks/useFullscreen";
import { ScoreboardSetup } from "@/components/scoreboard/ScoreboardSetup";
import { TeamPanel } from "@/components/scoreboard/TeamPanel";
import { ActionBar } from "@/components/scoreboard/ActionBar";
import { OrientationHint } from "@/components/scoreboard/OrientationHint";
import { GameOverDialog } from "@/components/scoreboard/GameOverDialog";
import { cn } from "@/lib/utils";
import type { ScoreboardState } from "@/lib/scoreboard/types";

// 偵測 RALLY_WON 後 state 的轉換類型，回傳要顯示的 toast 訊息。
// - 加分（既有分數動畫已夠）→ 不顯示
// - side-out（servingTeam 換邊）→ 提示換發
// - server-switch（雙打 serverNumber 1↔2）→ 提示換發球員
function deriveRallyFeedback(
	prev: ScoreboardState,
	next: ScoreboardState,
): string | null {
	// 僅關注 RALLY_WON 造成的轉換（history 長度 +1）；UNDO / RESET / HYDRATE 跳過
	if (next.history.length !== prev.history.length + 1) return null;

	// 加分 → 不發 toast（讓分數本身的視覺變化做主角）
	if (prev.scores.us !== next.scores.us || prev.scores.them !== next.scores.them) {
		return null;
	}

	// servingTeam 換邊 → side-out
	if (prev.servingTeam !== next.servingTeam) {
		const target = next.servingTeam === "us" ? "我方" : "對方";
		return `Side Out · 換${target}發球`;
	}

	// 同隊但發球員編號變了 → 雙打 #1 → #2
	if (prev.serverNumber !== next.serverNumber) {
		return `換發球員 #${next.serverNumber}`;
	}

	return null;
}

// 計分器主容器：組合所有子元件，依 orientation 切換橫/直式排版
export function Scoreboard() {
	const [state, dispatch] = useScoreboardStore();
	const orientation = useOrientation();
	const { isSupported, isFullscreen, toggle } = useFullscreen();

	// 用 React 認可的 "previous render state" pattern 偵測轉換，無需 useEffect
	const [prevState, setPrevState] = useState(state);
	const [feedback, setFeedback] = useState<{ msg: string; key: number } | null>(
		null,
	);

	if (prevState !== state) {
		const msg = deriveRallyFeedback(prevState, state);
		setPrevState(state);
		if (msg !== null) {
			setFeedback({ msg, key: (feedback?.key ?? 0) + 1 });
		}
	}

	const locked = state.status !== "setup";
	const buttonsDisabled = state.status === "finished";
	const isLandscape = orientation === "landscape";

	return (
		<div className="flex min-h-screen flex-col bg-background pt-14">
			<OrientationHint visible={!isLandscape} />
			<ScoreboardSetup
				mode={state.mode}
				firstServer={state.firstServer}
				locked={locked}
				fullscreenSupported={isSupported}
				isFullscreen={isFullscreen}
				onModeChange={(mode) => dispatch({ type: "SET_MODE", mode })}
				onFirstServerChange={(team) => dispatch({ type: "SET_FIRST_SERVER", team })}
				onToggleFullscreen={toggle}
			/>
			<div
				className={cn(
					"flex flex-1",
					isLandscape ? "flex-row divide-x" : "flex-col divide-y",
					"divide-border",
				)}
			>
				<TeamPanel
					team="us"
					label="我方"
					state={state}
					disabled={buttonsDisabled}
					onWinRally={() => dispatch({ type: "RALLY_WON", winner: "us" })}
				/>
				<TeamPanel
					team="them"
					label="對方"
					state={state}
					disabled={buttonsDisabled}
					onWinRally={() => dispatch({ type: "RALLY_WON", winner: "them" })}
				/>
			</div>
			<ActionBar
				canUndo={state.history.length > 0}
				onUndo={() => dispatch({ type: "UNDO" })}
				onReset={() => dispatch({ type: "RESET" })}
			/>
			<GameOverDialog state={state} onPlayAgain={() => dispatch({ type: "RESET" })} />
			{feedback && (
				<div
					key={feedback.key}
					role="status"
					aria-live="polite"
					className="pointer-events-none fixed top-20 left-1/2 z-[120] animate-rally-feedback rounded-full bg-lime-400 px-6 py-2 font-outfit text-sm font-bold tracking-wider text-slate-900 uppercase shadow-lg"
				>
					{feedback.msg}
				</div>
			)}
		</div>
	);
}
