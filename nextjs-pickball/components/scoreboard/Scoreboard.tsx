// components/scoreboard/Scoreboard.tsx
"use client";

import { useState } from "react";
import { useScoreboardStore } from "@/hooks/useScoreboardStore";
import { useOrientation } from "@/hooks/useOrientation";
import { useFullscreen } from "@/hooks/useFullscreen";
import { useFocusMode } from "@/hooks/useFocusMode";
import { Button } from "@/components/ui/button";
import { Minimize } from "lucide-react";
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
	const { focusMode, toggleFocusMode } = useFocusMode({ isFullscreen });

	// 專注模式切換：版面永遠切；瀏覽器支援 Fullscreen API 時附帶全螢幕
	// 作 progressive enhancement（iPhone Safari 不支援時只切版面）。
	// 只在「目標方向」與當前 fullscreen 狀態不一致時才呼叫 toggle——
	// 若先前 requestFullscreen 曾失敗（focusMode=true 但 isFullscreen=false），
	// 按退出鈕時盲目 toggle 會反而發出 request，進入全螢幕。
	const handleToggleFocus = () => {
		const entering = !focusMode;
		toggleFocusMode();
		if (isSupported && entering !== isFullscreen) {
			void toggle();
		}
	};

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
		// 頁面鎖高（h-dvh + overflow-hidden）：任何 viewport 零垂直捲動。
		// 此容器「不可長高」——往盒內加新內容不會撐出捲軸，只會被裁切，
		// 需重新分配高度預算。dvh 而非 vh：行動瀏覽器工具列展開時 100vh 大於可視高。
		// 專注模式時 navbar 已隱藏（sb-focus），頂部 padding 歸零讓分數吃滿。
		<div
			className={cn(
				"flex h-dvh flex-col overflow-hidden bg-background",
				!focusMode && "pt-(--site-nav-h)",
				// 直向的浮動 ActionBar 與下面板按鈕同一水平中線，保留底部空間避免重疊；
				// 橫向兩顆按鈕在左右半場中央，浮動列落在中間空帶，不需讓位
				focusMode && "portrait:pb-16",
			)}
		>
			<OrientationHint visible={!isLandscape} />
			{focusMode ? (
				// 浮動退出鈕：z-40 低於 portal dialog（z-50），不會蓋住確認框
				<Button
					variant="outline"
					size="icon"
					onClick={handleToggleFocus}
					aria-pressed={focusMode}
					aria-label="退出專注模式"
					className="fixed top-2 right-2 z-40"
				>
					<Minimize className="size-4" />
				</Button>
			) : (
				<ScoreboardSetup
					mode={state.mode}
					firstServer={state.firstServer}
					locked={locked}
					isFocusMode={focusMode}
					onModeChange={(mode) => dispatch({ type: "SET_MODE", mode })}
					onFirstServerChange={(team) => dispatch({ type: "SET_FIRST_SERVER", team })}
					onToggleFocus={handleToggleFocus}
				/>
			)}
			<div
				className={cn(
					// min-h-0 讓此 flex item 可縮到內容尺寸以下，缺了它大字級會撐破鎖高
					"flex min-h-0 flex-1",
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
				focusMode={focusMode}
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
