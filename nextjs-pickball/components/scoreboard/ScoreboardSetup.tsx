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
import type { Mode, Team } from "@/lib/scoreboard/types";

interface ScoreboardSetupProps {
	mode: Mode;
	firstServer: Team;
	locked: boolean;
	isFocusMode: boolean;
	onModeChange: (mode: Mode) => void;
	onFirstServerChange: (team: Team) => void;
	onToggleFocus: () => void;
}

// 頂部設定列：mode 與 firstServer toggle，比賽中為 disabled；右側專注模式按鈕。
// 專注模式按鈕永遠渲染（不依 Fullscreen API 支援與否隱藏）——
// 是否附帶 requestFullscreen 由父層（Scoreboard）決定。
// aria-pressed／label／icon 皆綁 isFocusMode：目前專注模式下整列不渲染
// （實際只會看到「進入」態），但綁定讓未來改為保留設定列時不需回頭修。
export function ScoreboardSetup({
	mode,
	firstServer,
	locked,
	isFocusMode,
	onModeChange,
	onFirstServerChange,
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
