// components/matchmaker/MatchStage.tsx
"use client";

import { CourtCard } from "./CourtCard";
import { RestingPanel } from "./RestingPanel";
import type { Player } from "@/lib/matchmaker/types";
import type { Round } from "@/lib/matchmaker/round-types";
import type { MatchSlots } from "@/lib/scoreboard/match-slots";

/** 送出比分失敗時要顯示在哪一場地卡片上——nested 而非攤平：matchId 決定「哪一格」、
 * message 是要顯示的內容，兩者只在同一次失敗時同時存在，拆成兩個獨立 props 會讓
 * 呼叫端有機會傳出「有 matchId 沒 message」之類不合法的組合。 */
export interface MatchStageSubmitError {
	readonly matchId: string;
	readonly message: string;
}

export interface MatchStageProps {
	round: Round;
	players: readonly Player[];
	hasActivePlayers: boolean;
	// 各場次的計分板槽（matchId → 槽 state），由對戰頁的 reconcile effect 提供，
	// 供各場地區塊呈現「計分中」標示（見 CourtCard 的 matchSlot 用途）。
	matchSlots: MatchSlots;
	onSubmitScore: (matchId: string, rawScoreA: string, rawScoreB: string) => void;
	submitError: MatchStageSubmitError | null;
}

// 舞台版面：場次網格＋休息名單，RWD 三斷點（design Decision 2）。桌面（lg 起）
// 左右並排、平板與手機皆單欄（休息名單移至場地內容下方）——用 flex-col + lg:flex-row
// 一份規則同時滿足平板與手機兩列（design Open Questions 4：桌面欄數細節不寫進 spec，
// 本檔決定手機 1 欄、md 起 2 欄）。
//
// 手機斷點觸控目標（≥44px）：CourtCard／ScoreEntry 屬 tasks 7～9 既有產出，**刻意不改動
// 其原有的 h-8／h-9 尺寸宣告**——那兩個元件在其他斷點與其他消費端維持既有視覺。
// 改由本檔以 Tailwind 的
// arbitrary variant 從外層對其內部 input／button 施加 max-md（<768px）的高度覆寫——
// `[&_input]:min-h-11` 之類的巢狀選擇器 specificity 為 (0,1,1)，高於單一 class
// 選擇器（0,1,0），能可靠覆寫而不需更動 CourtCard／ScoreEntry 本身。只用 min-height
// 而非同時疊加 height：min-height 會在比較後取較大值蓋掉原本較小的固定 height，
// 效果等同又不必同時宣告兩個屬性。作用範圍僅本容器內的 input／button（court 網格），
// 不影響 RoundControls 或 MatchmakerTabs 的按鈕。
export function MatchStage({
	round,
	players,
	hasActivePlayers,
	matchSlots,
	onSubmitScore,
	submitError,
}: MatchStageProps) {
	const resting = round.restingPlayerIds
		.map((id) => players.find((player) => player.id === id))
		.filter((player): player is Player => player !== undefined);

	return (
		<div className="flex flex-col gap-6 lg:flex-row lg:items-start">
			<div
				data-testid="match-stage-courts"
				className="grid flex-1 grid-cols-1 gap-4 md:grid-cols-2 max-md:[&_input]:min-h-11 max-md:[&_button]:min-h-11"
			>
				{round.matches.map((match) => (
					<CourtCard
						key={match.id}
						match={match}
						players={players}
						round={round}
						matchSlot={matchSlots[match.id] ?? null}
						onSubmitScore={onSubmitScore}
						submitError={submitError?.matchId === match.id ? submitError.message : null}
					/>
				))}
			</div>
			<aside data-testid="match-stage-resting" className="flex flex-col gap-2 lg:w-72 lg:shrink-0">
				<h2 className="text-sm font-semibold">休息名單</h2>
				<RestingPanel resting={resting} hasActivePlayers={hasActivePlayers} />
			</aside>
		</div>
	);
}
