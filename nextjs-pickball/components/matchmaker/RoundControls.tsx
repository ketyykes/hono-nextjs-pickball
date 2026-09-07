// components/matchmaker/RoundControls.tsx
"use client";

import { useRef } from "react";
import type { KeyboardEvent } from "react";
import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { courtCountBounds, changeCourtCount } from "@/lib/matchmaker/round-settings";
import type { RoundSettings } from "@/lib/matchmaker/round-settings";
import { PLAYERS_PER_MATCH } from "@/lib/matchmaker/allocation-types";
import { FORMAT_LABEL, ROUND_TIMER_LOCKED_REASON } from "@/lib/matchmaker/labels";
import type { MatchFormat } from "@/lib/matchmaker/allocation-types";
import { ROUND_TIMER_DURATION_OPTIONS, TARGET_SCORE_OPTIONS } from "@/lib/matchmaker/round-types";
import type {
	Round,
	RoundTargetScore,
	RoundTimer,
	RoundTimerDurationMinutes,
} from "@/lib/matchmaker/round-types";
import type { SetTargetScoreResult, SetTimerDurationResult, StartTimerResult } from "@/lib/matchmaker/round";
import { isTargetScoreLocked } from "@/lib/matchmaker/scoreboard-binding";
// nextRadioIndex 與 capability 無關，位置為歷史因素（design Decision 6）；
// matchmaker 與 scoreboard 的目標分數選擇器共用同一份 WAI-ARIA radio group 方向鍵索引計算。
import { nextRadioIndex } from "@/lib/scoreboard/radio-navigation";
import type { MatchSlots } from "@/lib/scoreboard/match-slots";

// 選項清單由 FORMAT_LABEL 的 key 推導，不另列一次 singles／doubles——MatchFormat 若擴值，
// Record<MatchFormat, string> 會在 FORMAT_LABEL 缺項時編譯錯誤，兩處因此不會各自漂移。
const FORMAT_OPTIONS: readonly MatchFormat[] = Object.keys(FORMAT_LABEL) as MatchFormat[];

// 計時選項為四個，但 round-lifecycle 只匯出三個長度值——第四個「不計時」在資料層就是
// Round.timer 為 null（round-types.ts 的 RoundTimerSchema 註解），因此以 null 當選項值
// 前置於 ROUND_TIMER_DURATION_OPTIONS 之前，而不是另立一個哨兵字面量：null 可以直接
// 拿去和 timer 的顯示值做 === 比對得出 aria-checked，也能原樣交給 onSettingsChange 的
// timerDurationMinutes 欄位（型別同為 RoundTimerDurationMinutes | null）。
// 長度值一律取自 ROUND_TIMER_DURATION_OPTIONS，SHALL NOT 在本檔另寫一份 [10, 15, 20]。
const TIMER_OPTIONS: readonly (RoundTimerDurationMinutes | null)[] = [
	null,
	...ROUND_TIMER_DURATION_OPTIONS,
];

// 「不計時」的顯示文案只有本元件用得到，故留在本檔而不進 labels.ts——該檔收斂的是
// 「同一份文案散落在多個元件」的問題（見該檔頁首），不是所有字串的集中地。
const TIMER_OFF_LABEL = "不計時";

/** 計時選項的顯示文案：null 為「不計時」，其餘由長度值推導，不逐一寫死四個字面量。 */
function timerOptionLabel(option: RoundTimerDurationMinutes | null): string {
	return option === null ? TIMER_OFF_LABEL : `${option} 分鐘`;
}

export interface RoundControlsProps {
	settings: RoundSettings;
	onSettingsChange: (settings: RoundSettings) => void;
	round: Round | null;
	// 該輪各場次的計分板槽，供 isTargetScoreLocked 判定「是否已開始計分」
	// （match-stage 的 MODIFIED「目標分數選擇器」）。
	matchSlots: MatchSlots;
	activePlayerCount: number;
	onGenerate: (settings: RoundSettings) => void;
	onReset: () => void;
	/** 回合存在但尚未開始計分時，變更目標分數委派此入口（round.ts 的 setTargetScore，
	 * 經 useRoundStore 接線）。SHALL NOT 於本元件內直接改寫回合物件。 */
	setTargetScore: (targetScore: RoundTargetScore) => SetTargetScoreResult;
	/** 回合存在但尚未開始計分時，變更計時長度委派此入口（round.ts 的 setTimerDuration，
	 * 經 useRoundStore 接線）。SHALL NOT 於本元件內直接改寫回合物件。 */
	setTimerDuration: (durationMinutes: RoundTimerDurationMinutes) => SetTimerDurationResult;
	/** 開始本輪計時（round.ts 的 startTimer，經 useRoundStore 接線）。零參數：now 已於
	 * hook 層注入，本元件 SHALL NOT 自行取當下時間。 */
	startTimer: () => StartTimerResult;
}

// 本輪設定控制項：對戰方式、場地數、目標分數，以及「產生本輪對戰」操作入口。
// settings／onSettingsChange／round／onGenerate 由父層以 props 傳入並在此處呼叫回去
// （design Decision 9）——本元件不持有任何 store，場地數的夾值與邊界判定一律委派
// lib/matchmaker/round-settings.ts。
export function RoundControls({
	settings,
	onSettingsChange,
	round,
	matchSlots,
	activePlayerCount,
	onGenerate,
	onReset,
	setTargetScore: commitTargetScore,
	setTimerDuration: commitTimerDuration,
	startTimer,
}: RoundControlsProps) {
	// 目標分數 radiogroup 的三顆按鈕 DOM 參照，供方向鍵導覽後 .focus() 新選中項。
	const targetScoreButtonRefs = useRef<(HTMLButtonElement | null)[]>([]);
	// 計時 radiogroup 的四顆按鈕 DOM 參照，用途同上。
	const timerButtonRefs = useRef<(HTMLButtonElement | null)[]>([]);
	const courtBounds = courtCountBounds(settings.courtCount);
	// 鎖定與否 MUST 委派 isTargetScoreLocked（match-stage 的 MODIFIED「目標分數選擇器」），
	// SHALL NOT 在本元件內以「round 是否存在」判斷——round 為 null 時談不上「已開始計分」，
	// 這裡的判斷只是型別安全防線（isTargetScoreLocked 要求非 null 的 Round），不是本元件
	// 自行決定鎖定與否。
	const lockResult = round !== null ? isTargetScoreLocked(round, matchSlots) : { locked: false, reason: null };
	const locked = lockResult.locked;
	const displayedTargetScore: RoundTargetScore = round ? round.targetScore : settings.targetScore;
	// 計時的顯示值比照 displayedTargetScore：回合已產生時以回合為準（設定值只是「產生下
	// 一輪時要用的預備值」），尚無回合時以設定值為準。
	const roundTimer: RoundTimer = round ? round.timer : null;
	const displayedTimerDuration: RoundTimerDurationMinutes | null = round
		? (roundTimer === null ? null : roundTimer.durationMinutes)
		: settings.timerDurationMinutes;
	// 「開始計時」的顯示條件：本輪已設定計時長度（timer !== null）且尚未開始
	// （startedAt === null）。不符合時 MUST 不渲染，SHALL NOT 改成一顆恆為 disabled 的
	// 按鈕——這與同一區塊內「radiogroup 鎖定要 disabled 並解釋原因」的處置刻意相反：
	// 「開始計時」是一次性操作，不計時模式下根本沒有這個動作可做，擺一顆說不出理由的
	// disabled 按鈕只會製造疑惑（spec「計時器顯示與時間到提示」明訂）。
	const canStartTimer = roundTimer !== null && roundTimer.startedAt === null;
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

	// 回合存在時（且未鎖定，見下方 disabled 與 handleTargetScoreKeyDown 的 guard）變更
	// 委派 setTargetScore（round.ts 的純函式，經 useRoundStore 接線），SHALL NOT 直接
	// 改寫回合物件；回合尚不存在時沿用 M4 既有行為，變更僅影響「產生本輪對戰」的預備設定。
	function handleTargetScoreChange(targetScore: RoundTargetScore) {
		if (round !== null) {
			commitTargetScore(targetScore);
			return;
		}
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

	// 計時長度的變更委派方式與目標分數完全相同（回合存在走 capability 入口、尚無回合只改
	// 預備設定），唯一的差別是「不計時」這個選項：round-lifecycle 沒有把已產生的本輪改回
	// 不計時的入口（round.ts 的 setTimerDuration 只接受 10／15／20），而本元件 SHALL NOT
	// 自行改寫回合物件，因此回合已存在時選到「不計時」只能不作為。
	function handleTimerDurationChange(durationMinutes: RoundTimerDurationMinutes | null) {
		if (round !== null) {
			if (durationMinutes === null) return;
			commitTimerDuration(durationMinutes);
			return;
		}
		onSettingsChange({ ...settings, timerDurationMinutes: durationMinutes });
	}

	// 與 handleTargetScoreKeyDown 共用同一套 WAI-ARIA radio group 導覽：兩者都把「按鍵 →
	// 下一個索引」這段唯一的邏輯委派給 nextRadioIndex，本函式只負責把索引換算回自己的
	// 選項清單並管理 focus。刻意不把兩個 handler 抽成一個泛型 helper——那會改寫既有的
	// 目標分數路徑（本組唯一有既有測試釘住的部分），為了消除四行樣板而承擔迴歸風險並不划算。
	//
	// 目前索引取自 displayedTimerDuration 而非 settings：回合已產生時畫面上選中的是回合的
	// 計時長度，若以設定值起算，方向鍵會從一個畫面上看不到的位置開始移動。
	function handleTimerKeyDown(event: KeyboardEvent<HTMLDivElement>) {
		if (locked) return;
		const currentIndex = TIMER_OPTIONS.indexOf(displayedTimerDuration);
		const nextIndex = nextRadioIndex(currentIndex, TIMER_OPTIONS.length, event.key);
		if (nextIndex === null) return;
		event.preventDefault();
		handleTimerDurationChange(TIMER_OPTIONS[nextIndex]);
		timerButtonRefs.current[nextIndex]?.focus();
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
				{lockResult.locked && (
					<p className="text-xs text-muted-foreground">{lockResult.reason}</p>
				)}
			</div>

			<div className="flex flex-col gap-1">
				<span className="text-sm font-medium">計時</span>
				<div
					role="radiogroup"
					aria-label="計時"
					className="flex items-center gap-1 rounded-md border border-input p-1"
					onKeyDown={handleTimerKeyDown}
				>
					{TIMER_OPTIONS.map((option, index) => (
						<Button
							key={timerOptionLabel(option)}
							ref={(el) => {
								timerButtonRefs.current[index] = el;
							}}
							type="button"
							role="radio"
							aria-checked={displayedTimerDuration === option}
							tabIndex={displayedTimerDuration === option ? 0 : -1}
							disabled={locked}
							variant={displayedTimerDuration === option ? "default" : "ghost"}
							size="sm"
							onClick={() => handleTimerDurationChange(option)}
						>
							{timerOptionLabel(option)}
						</Button>
					))}
				</div>
				{/* 鎖定與否重用 isTargetScoreLocked 的 locked 布林值（上方 locked 變數，同一次
				    呼叫的結果），但顯示的原因 MUST 是 ROUND_TIMER_LOCKED_REASON 而非
				    lockResult.reason——後者固定提及「目標分數」，出現在計時區塊會誤導使用者
				    以為看錯區塊（design Decision 2）。 */}
				{locked && <p className="text-xs text-muted-foreground">{ROUND_TIMER_LOCKED_REASON}</p>}
				{canStartTimer && (
					<Button type="button" variant="outline" size="sm" onClick={() => startTimer()}>
						開始計時
					</Button>
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
