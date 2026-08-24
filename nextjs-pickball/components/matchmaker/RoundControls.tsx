// components/matchmaker/RoundControls.tsx
"use client";

import { useRef } from "react";
import type { KeyboardEvent } from "react";
import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { courtCountBounds, changeCourtCount } from "@/lib/matchmaker/round-settings";
import type { RoundSettings } from "@/lib/matchmaker/round-settings";
import { PLAYERS_PER_MATCH } from "@/lib/matchmaker/allocation-types";
import type { MatchFormat } from "@/lib/matchmaker/allocation-types";
import { TARGET_SCORE_OPTIONS } from "@/lib/matchmaker/round-types";
import type { Round, RoundTargetScore } from "@/lib/matchmaker/round-types";
// nextRadioIndex 與 capability 無關，位置為歷史因素（design Decision 6）；
// matchmaker 與 scoreboard 的目標分數選擇器共用同一份 WAI-ARIA radio group 方向鍵索引計算。
import { nextRadioIndex } from "@/lib/scoreboard/radio-navigation";

// 對戰方式的顯示文字，亦作為人數不足說明的措辭來源，避免兩處各自寫一份中文。
const FORMAT_LABEL: Record<MatchFormat, string> = {
	singles: "單打",
	doubles: "雙打",
};

// 選項清單由 FORMAT_LABEL 的 key 推導，不另列一次 singles／doubles——MatchFormat 若擴值，
// Record<MatchFormat, string> 會在 FORMAT_LABEL 缺項時編譯錯誤，兩處因此不會各自漂移。
const FORMAT_OPTIONS: readonly MatchFormat[] = Object.keys(FORMAT_LABEL) as MatchFormat[];

export interface RoundControlsProps {
	settings: RoundSettings;
	onSettingsChange: (settings: RoundSettings) => void;
	round: Round | null;
	activePlayerCount: number;
	onGenerate: (settings: RoundSettings) => void;
	onReset: () => void;
}

// 本輪設定控制項：對戰方式、場地數、目標分數，以及「產生本輪對戰」操作入口。
// settings／onSettingsChange／round／onGenerate 由父層以 props 傳入並在此處呼叫回去
// （design Decision 9）——本元件不持有任何 store，場地數的夾值與邊界判定一律委派
// lib/matchmaker/round-settings.ts。
export function RoundControls({
	settings,
	onSettingsChange,
	round,
	activePlayerCount,
	onGenerate,
	onReset,
}: RoundControlsProps) {
	// 目標分數 radiogroup 的三顆按鈕 DOM 參照，供方向鍵導覽後 .focus() 新選中項。
	const targetScoreButtonRefs = useRef<(HTMLButtonElement | null)[]>([]);
	const courtBounds = courtCountBounds(settings.courtCount);
	// 有回合就鎖（design Decision 5 的嚴格版）：不判斷「是否已開始計分」——
	// 該中間態要等場邊計分（M6）接上才有意義。
	const locked = round !== null;
	const displayedTargetScore: RoundTargetScore = round ? round.targetScore : settings.targetScore;
	// 每場所需人數唯一取自 PLAYERS_PER_MATCH，不得另行寫死 2／4。
	const requiredPlayers = PLAYERS_PER_MATCH[settings.format];
	const insufficientPlayers = activePlayerCount < requiredPlayers;
	// 「未完成」＝非 completed，涵蓋 pending 與 scoring 兩態（design Open Questions 2b）——
	// 場邊計分中的場次仍須算進「有可重排的場次」，不能只看 pending。
	const hasIncompleteMatch =
		round !== null && round.matches.some((match) => match.status !== "completed");

	function handleFormatChange(format: MatchFormat) {
		onSettingsChange({ ...settings, format });
	}

	function handleCourtCountChange(delta: number) {
		onSettingsChange(changeCourtCount(settings, delta).settings);
	}

	function handleTargetScoreChange(targetScore: RoundTargetScore) {
		onSettingsChange({ ...settings, targetScore });
	}

	// WAI-ARIA APG radio group：方向鍵移動即選取，尾端／開頭循環；locked 時方向鍵
	// 不得改變選取（按鈕本身雖已 disabled，但 onKeyDown 掛在容器上仍會收到事件）。
	function handleTargetScoreKeyDown(event: KeyboardEvent<HTMLDivElement>) {
		if (locked) return;
		const currentIndex = TARGET_SCORE_OPTIONS.indexOf(settings.targetScore);
		const nextIndex = nextRadioIndex(currentIndex, TARGET_SCORE_OPTIONS.length, event.key);
		if (nextIndex === null) return;
		event.preventDefault();
		handleTargetScoreChange(TARGET_SCORE_OPTIONS[nextIndex]);
		targetScoreButtonRefs.current[nextIndex]?.focus();
	}

	return (
		<div className="flex flex-col gap-4">
			<div className="flex flex-col gap-2">
				<span className="text-sm font-medium">對戰方式</span>
				<div
					role="radiogroup"
					aria-label="對戰方式"
					className="flex gap-1 rounded-md border border-input p-1"
				>
					{FORMAT_OPTIONS.map((format) => (
						<Button
							key={format}
							type="button"
							role="radio"
							aria-checked={settings.format === format}
							variant={settings.format === format ? "default" : "ghost"}
							size="sm"
							onClick={() => handleFormatChange(format)}
						>
							{FORMAT_LABEL[format]}
						</Button>
					))}
				</div>
			</div>

			<div className="flex items-center gap-2">
				<span className="text-sm font-medium">場地數</span>
				<Button
					type="button"
					variant="outline"
					size="icon-sm"
					aria-label="減少場地數"
					disabled={!courtBounds.canDecrement}
					onClick={() => handleCourtCountChange(-1)}
				>
					<Minus className="size-4" />
				</Button>
				<span aria-live="polite" className="min-w-8 text-center text-sm">
					{settings.courtCount}
				</span>
				<Button
					type="button"
					variant="outline"
					size="icon-sm"
					aria-label="增加場地數"
					disabled={!courtBounds.canIncrement}
					onClick={() => handleCourtCountChange(1)}
				>
					<Plus className="size-4" />
				</Button>
			</div>

			<div className="flex flex-col gap-1">
				<span className="text-sm font-medium">目標分數</span>
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
							aria-checked={displayedTargetScore === score}
							tabIndex={displayedTargetScore === score ? 0 : -1}
							disabled={locked}
							variant={displayedTargetScore === score ? "default" : "ghost"}
							size="sm"
							onClick={() => handleTargetScoreChange(score)}
						>
							{score}
						</Button>
					))}
				</div>
				{locked && (
					<p className="text-xs text-muted-foreground">
						本輪已鎖定，換分制請先產生下一輪。
					</p>
				)}
			</div>

			<div className="flex flex-col gap-1">
				<Button type="button" disabled={insufficientPlayers} onClick={() => onGenerate(settings)}>
					產生本輪對戰
				</Button>
				{insufficientPlayers && (
					<p className="text-xs text-destructive">
						{FORMAT_LABEL[settings.format]}每場所需人數為 {requiredPlayers} 人，目前可出場人數為{" "}
						{activePlayerCount} 人，請至名單頁調整暫停出場狀態或新增參賽者。
					</p>
				)}
			</div>

			{hasIncompleteMatch && (
				<Button type="button" variant="outline" onClick={onReset}>
					重設／再排
				</Button>
			)}
		</div>
	);
}
