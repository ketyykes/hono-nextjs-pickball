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
	fullscreenSupported: boolean;
	isFullscreen: boolean;
	onModeChange: (mode: Mode) => void;
	onFirstServerChange: (team: Team) => void;
	onToggleFullscreen: () => void;
}

// 頂部設定列：mode 與 firstServer toggle，比賽中為 disabled；右側全螢幕按鈕
export function ScoreboardSetup({
	mode,
	firstServer,
	locked,
	fullscreenSupported,
	isFullscreen,
	onModeChange,
	onFirstServerChange,
	onToggleFullscreen,
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
				{fullscreenSupported && (
					<Button
						variant="outline"
						size="icon"
						onClick={onToggleFullscreen}
						aria-pressed={isFullscreen}
						aria-label={isFullscreen ? "退出全螢幕" : "進入全螢幕"}
					>
						{isFullscreen ? <Minimize className="size-4" /> : <Maximize className="size-4" />}
					</Button>
				)}
			</div>
		</div>
	);
}
