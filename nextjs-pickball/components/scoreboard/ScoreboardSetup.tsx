"use client";

import { useRef } from "react";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Maximize, Minimize } from "lucide-react";
import { nextRadioIndex } from "@/lib/scoreboard/radio-navigation";
import { MATCHMAKER_ROUTE } from "@/lib/matchmaker/section-nav";
import type { Mode, Team, TargetScore } from "@/lib/scoreboard/types";

// 2026 USA Pickleball 的三種官方分制，皆為 win by 2
const TARGET_SCORE_OPTIONS = [11, 15, 21] as const;

interface ScoreboardSetupProps {
	mode: Mode;
	firstServer: Team;
	targetScore: TargetScore;
	locked: boolean;
	isFocusMode: boolean;
	// 綁定對戰場次時（matchId !== null）設定列改為唯讀目標分數 + 場地標示 + 返回對戰，
	// 不渲染比賽形式下拉與目標分數 radiogroup（design Decision 8、MODIFIED Requirement）。
	matchId: string | null;
	// 綁定模式下顯示的場地標示來源；null 時不渲染場地標示（見 courtNumber 為 null 時
	// 的呈現決策：與其顯示「場地 -」等佔位文字誤導使用者，不如乾脆不顯示這塊）。
	courtNumber: number | null;
	onModeChange: (mode: Mode) => void;
	onFirstServerChange: (team: Team) => void;
	onTargetScoreChange: (targetScore: TargetScore) => void;
	onToggleFocus: () => void;
}

// 頂部設定列：mode、firstServer 兩個 Select 與 targetScore radiogroup，比賽中三者皆為
// disabled（賽中變更設定會使已累積的分數失去意義，見 scoreboard spec）；右側專注模式按鈕。
// targetScore 以 role="radio" on button 實作而非 Radix ToggleGroup，因此自行補上 WAI-ARIA
// APG radio group pattern 的 roving tabindex 與方向鍵導覽（見下方 onKeyDown 與
// lib/scoreboard/radio-navigation.ts）：Tab 進入群組落在選中項，方向鍵在選項間移動並選取。
// 專注模式按鈕永遠渲染（不依 Fullscreen API 支援與否隱藏）——
// 是否附帶 requestFullscreen 由父層（Scoreboard）決定。
// aria-pressed／label／icon 皆綁 isFocusMode：目前專注模式下整列不渲染
// （實際只會看到「進入」態），但綁定讓未來改為保留設定列時不需回頭修。
export function ScoreboardSetup({
	mode,
	firstServer,
	targetScore,
	locked,
	isFocusMode,
	matchId,
	courtNumber,
	onModeChange,
	onFirstServerChange,
	onTargetScoreChange,
	onToggleFocus,
}: ScoreboardSetupProps) {
	const isBound = matchId !== null;

	// 目標分數 radiogroup 的三顆按鈕 DOM 參照，供方向鍵導覽後 .focus() 新選中項
	const targetScoreButtonRefs = useRef<(HTMLButtonElement | null)[]>([]);

	// WAI-ARIA APG radio group：方向鍵移動即選取，尾端／開頭循環；locked 時比賽進行中，
	// 方向鍵不得改變選取（按鈕本身雖已 disabled，但 onKeyDown 掛在容器上仍會收到事件）
	function handleTargetScoreKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
		if (locked) return;
		const currentIndex = TARGET_SCORE_OPTIONS.indexOf(targetScore);
		const nextIndex = nextRadioIndex(
			currentIndex,
			TARGET_SCORE_OPTIONS.length,
			event.key,
		);
		if (nextIndex === null) return;
		event.preventDefault();
		onTargetScoreChange(TARGET_SCORE_OPTIONS[nextIndex]);
		targetScoreButtonRefs.current[nextIndex]?.focus();
	}

	return (
		<div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-2">
			{isBound ? (
				<>
					{/* courtNumber 為 null 時不渲染此段——見 props 註解的呈現決策 */}
					{courtNumber !== null && (
						<span className="text-sm font-medium">場地 {courtNumber}</span>
					)}
					{/* 目標分數由該輪統一決定，UI MUST NOT 提供切換入口（MODIFIED Requirement），
					故綁定模式不渲染比賽形式下拉，直接略過 */}
				</>
			) : (
				<Select
					value={mode}
					onValueChange={(v) => onModeChange(v as Mode)}
					disabled={locked}
				>
					<SelectTrigger className="w-32" aria-label="比賽形式">
						<SelectValue />
					</SelectTrigger>
					{/* position="popper"：shadcn 預設的 "item-aligned" 會把面板上移、讓目前
					選中項對齊觸發器——設定列緊貼在 navbar 下方，選到第二個選項時面板上緣會
					壓進 navbar 而把第一個選項切掉一半（實測面板 top 33.8 < navbar bottom 56）。
					popper 固定在觸發器下方展開並自帶碰撞偵測，不會被上方元素吃掉。 */}
					<SelectContent position="popper">
						<SelectItem value="doubles">雙打</SelectItem>
						<SelectItem value="singles">單打</SelectItem>
					</SelectContent>
				</Select>
			)}
			<Select
				value={firstServer}
				onValueChange={(v) => onFirstServerChange(v as Team)}
				disabled={locked}
			>
				<SelectTrigger className="w-36" aria-label="先發球方">
					<SelectValue />
				</SelectTrigger>
				{/* 同上：先發球方選到第二項時會有相同的上移遮擋問題 */}
				<SelectContent position="popper">
					<SelectItem value="us">先發：我方</SelectItem>
					<SelectItem value="them">先發：對方</SelectItem>
				</SelectContent>
			</Select>
			{isBound ? (
				// 唯讀文字取代 radiogroup：disabled 的互動控制項會暗示「這裡本來可以改」，
				// 但綁定模式下永遠不會解鎖，唯讀文字才誠實（design Decision 8）
				<span className="text-sm font-medium">本輪 {targetScore} 分制</span>
			) : (
				<div
					role="radiogroup"
					aria-label="目標分數"
					className="flex items-center gap-1 rounded-md border border-input p-1"
					onKeyDown={handleTargetScoreKeyDown}
				>
					{TARGET_SCORE_OPTIONS.map((score, index) => (
						<Button
							key={score}
							ref={(el) => {
								targetScoreButtonRefs.current[index] = el;
							}}
							type="button"
							role="radio"
							aria-checked={targetScore === score}
							tabIndex={targetScore === score ? 0 : -1}
							disabled={locked}
							variant={targetScore === score ? "default" : "ghost"}
							size="sm"
							onClick={() => onTargetScoreChange(score)}
						>
							{score}
						</Button>
					))}
				</div>
			)}
			{isBound && (
				<Button asChild variant="outline" size="sm">
					<Link href={MATCHMAKER_ROUTE}>返回對戰</Link>
				</Button>
			)}
			<div className="ml-auto">
				<Button
					variant="outline"
					size="icon"
					onClick={onToggleFocus}
					aria-pressed={isFocusMode}
					aria-label={isFocusMode ? "退出專注模式" : "進入專注模式"}
				>
					{isFocusMode ? (
						<Minimize className="size-4" />
					) : (
						<Maximize className="size-4" />
					)}
				</Button>
			</div>
		</div>
	);
}
