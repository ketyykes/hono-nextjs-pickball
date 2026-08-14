"use client";

import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Maximize, Minimize } from "lucide-react";
import type { Mode, Team, TargetScore } from "@/lib/scoreboard/types";

// 2026 USA Pickleball 的三種官方分制，皆為 win by 2
const TARGET_SCORE_OPTIONS = [11, 15, 21] as const;

interface ScoreboardSetupProps {
	mode: Mode;
	firstServer: Team;
	targetScore: TargetScore;
	locked: boolean;
	isFocusMode: boolean;
	onModeChange: (mode: Mode) => void;
	onFirstServerChange: (team: Team) => void;
	onTargetScoreChange: (targetScore: TargetScore) => void;
	onToggleFocus: () => void;
}

// 頂部設定列：mode、firstServer 兩個 Select 與 targetScore radiogroup，比賽中三者皆為
// disabled（賽中變更設定會使已累積的分數失去意義，見 scoreboard spec）；右側專注模式按鈕。
// targetScore 以 role="radio" on button 實作而非 Radix ToggleGroup，代價是沒有 APG 慣用的
// 方向鍵導覽——鍵盤仍可 Tab 逐顆抵達並以 Enter/Space 選取，WCAG 2.1.1／4.1.2 皆滿足。
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
	onModeChange,
	onFirstServerChange,
	onTargetScoreChange,
	onToggleFocus,
}: ScoreboardSetupProps) {
	return (
		<div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
			<Select
				value={mode}
				onValueChange={(v) => onModeChange(v as Mode)}
				disabled={locked}
			>
				<SelectTrigger className="w-32" aria-label="比賽形式">
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="doubles">雙打</SelectItem>
					<SelectItem value="singles">單打</SelectItem>
				</SelectContent>
			</Select>
			<Select
				value={firstServer}
				onValueChange={(v) => onFirstServerChange(v as Team)}
				disabled={locked}
			>
				<SelectTrigger className="w-36" aria-label="先發球方">
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="us">先發：我方</SelectItem>
					<SelectItem value="them">先發：對方</SelectItem>
				</SelectContent>
			</Select>
			<div
				role="radiogroup"
				aria-label="目標分數"
				className="flex items-center gap-1 rounded-md border border-input p-1"
			>
				{TARGET_SCORE_OPTIONS.map((score) => (
					<Button
						key={score}
						type="button"
						role="radio"
						aria-checked={targetScore === score}
						disabled={locked}
						variant={targetScore === score ? "default" : "ghost"}
						size="sm"
						onClick={() => onTargetScoreChange(score)}
					>
						{score}
					</Button>
				))}
			</div>
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
