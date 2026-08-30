// app/matchmaker/page.tsx
"use client";

import { useEffect, useReducer, useState } from "react";
import { EmptyStage } from "@/components/matchmaker/EmptyStage";
import { MatchStage } from "@/components/matchmaker/MatchStage";
import type { MatchStageSubmitError } from "@/components/matchmaker/MatchStage";
import { RoundControls } from "@/components/matchmaker/RoundControls";
import { useRosterStore } from "@/hooks/useRosterStore";
import { useRoundStore } from "@/hooks/useRoundStore";
import { createRoundSettings } from "@/lib/matchmaker/round-settings";
import type { RoundSettings } from "@/lib/matchmaker/round-settings";
import { collectFinishedSubmissions, toSubmitScoreInput } from "@/lib/matchmaker/scoreboard-binding";
import { readMatchSlots, clearMatchSlots } from "@/lib/scoreboard/match-slots";
import type { MatchSlots } from "@/lib/scoreboard/match-slots";

// 對戰頁（場次舞台）。本檔為 matchmaker 對戰引擎（useRoundStore）唯一的 import 點
// （design Decision 9）：頁面層持有 useRosterStore 與 useRoundStore 兩個 store，
// 把前者的 updatePlayer 當 port 傳給後者，理由見 hooks/useRoundStore.ts 頂端註解。
export default function MatchmakerPage() {
	const { players, updatePlayer } = useRosterStore();
	const { round, generateRound, resetIncompleteMatches, submitScore, setTargetScore } = useRoundStore({
		players,
		updatePlayer,
	});

	const [settings, setSettings] = useState<RoundSettings>(() => createRoundSettings());
	const [roundError, setRoundError] = useState<string | null>(null);
	const [submitError, setSubmitError] = useState<MatchStageSubmitError | null>(null);
	// 用 useReducer 而非 useState 存放 matchSlots：ESLint 的 react-hooks/set-state-in-effect
	// 規則會擋下「在 effect 內同步呼叫 useState setter」，但不適用於 useReducer 的
	// dispatch（與 hooks/useScoreboardStore.ts 的 bindingStatus 既有寫法一致）。
	const [matchSlots, setMatchSlots] = useReducer(
		(_current: MatchSlots, next: MatchSlots) => next,
		{} as MatchSlots,
	);

	const activePlayerCount = players.filter((player) => player.isActive).length;
	const hasActivePlayers = activePlayerCount > 0;

	// 回填 reconcile（design Decision 5、Risks 第 1 條）：以「回合已 hydrate」為觸發條件
	// （依賴陣列只放 round），而非獨立的 mount effect——mount 當下 round 可能仍是
	// useRoundStore hydrate 前的 null，此時讀到的計分板槽無法比對出「該場是否仍在回合中」。
	//
	// 一次只回填一筆：submitScore 讀取的是 render-scope 的 state.round（useRoundStore
	// 已知限制，見該檔頂端註解），同一次呼叫內連續送出多筆會讓後面呼叫的結果覆蓋前面
	// 的——因此每次 effect 只處理待送出清單的第一筆，dispatch 成功後 round 變動會觸發
	// 本 effect 重新執行，逐筆收斂直到 collectFinishedSubmissions 回傳空清單為止。
	useEffect(() => {
		if (round === null) return;

		const { slots } = readMatchSlots();
		const finished = collectFinishedSubmissions(round, slots);
		if (finished.length === 0) {
			setMatchSlots(slots);
			return;
		}

		const [first] = finished;
		const input = toSubmitScoreInput(first, { round, players, now: new Date().toISOString() });
		const result = submitScore(input.matchId, input.rawScoreA, input.rawScoreB);
		if (result.ok) {
			clearMatchSlots([first.matchId]);
		}
		// 其餘待送出項目留給下一次 effect 執行（round 因本次 dispatch 而變動後）處理，
		// 這裡先反映目前讀到的槽（含尚未處理的那些），避免畫面短暫顯示錯誤的計分中狀態。
		//
		// 依賴陣列刻意只放 round：players／submitScore 每次 render 都換新參考，
		// 列入 deps 會讓本 effect 在每次 render 後都重跑，而非只在「回合資料就緒
		// 或變動」時才觸發。
		setMatchSlots(slots);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [round]);

	// generateRound 一次互動只呼叫一次（useRoundStore 的已知限制，見該檔註解）：
	// 本函式是 RoundControls／EmptyStage 兩個入口共用的唯一呼叫點。
	function handleGenerate(nextSettings: RoundSettings) {
		const result = generateRound(nextSettings);
		setRoundError(result.ok ? null : result.message);
	}

	function handleReset() {
		const result = resetIncompleteMatches();
		setRoundError(result.ok ? null : result.message);
	}

	function handleSubmitScore(matchId: string, rawScoreA: string, rawScoreB: string) {
		const result = submitScore(matchId, rawScoreA, rawScoreB);
		setSubmitError(result.ok ? null : { matchId, message: result.message });
	}

	return (
		<main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8">
			<div>
				<h1 className="text-2xl font-bold">對戰分配</h1>
				<p className="text-sm text-muted-foreground">安排場地、產生本輪對戰並記錄比分。</p>
			</div>

			{roundError !== null && (
				<div
					role="alert"
					className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive"
				>
					{roundError}
				</div>
			)}

			{/* tasks 11 裁決 3：「產生本輪對戰」與「重設／再排」是 spec 明訂的主要操作
			    入口，手機斷點 MUST ≥44px；場地數加減與對戰方式／目標分數的 radio
			    是次要控制項，本 change 刻意不擴大範圍（leader 裁決）。RoundControls.tsx
			    不在可動檔案清單內，改由本層以 CSS 選擇器精準只挑出「無 role 也無
			    aria-label」的按鈕——這正好排除所有 radio（帶 role="radio"）與圖示按鈕
			    （帶 aria-label），只命中「產生本輪對戰」「重設／再排」這兩顆。 */}
			<div className="max-md:[&_button:not([role]):not([aria-label])]:min-h-11">
				<RoundControls
					settings={settings}
					onSettingsChange={setSettings}
					round={round}
					matchSlots={matchSlots}
					activePlayerCount={activePlayerCount}
					onGenerate={handleGenerate}
					onReset={handleReset}
					setTargetScore={setTargetScore}
				/>
			</div>

			<div data-testid="match-stage-region">
				{round === null ? (
					<EmptyStage hasActivePlayers={hasActivePlayers} onGenerate={() => handleGenerate(settings)} />
				) : (
					<MatchStage
						round={round}
						players={players}
						hasActivePlayers={hasActivePlayers}
						matchSlots={matchSlots}
						onSubmitScore={handleSubmitScore}
						submitError={submitError}
					/>
				)}
			</div>
		</main>
	);
}
