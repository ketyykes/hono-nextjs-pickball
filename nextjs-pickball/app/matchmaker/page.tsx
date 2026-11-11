// app/matchmaker/page.tsx
"use client";

import { useEffect, useMemo, useReducer, useState } from "react";
import { useRouter } from "next/navigation";
import { EmptyStage } from "@/components/matchmaker/EmptyStage";
import { ExportActions } from "@/components/matchmaker/ExportActions";
import { MatchStage } from "@/components/matchmaker/MatchStage";
import type { MatchStageSubmitError, MatchStageSwapError } from "@/components/matchmaker/MatchStage";
import { PrintSheet } from "@/components/matchmaker/PrintSheet";
import { RoundControls } from "@/components/matchmaker/RoundControls";
import { RoundTimerBanner } from "@/components/matchmaker/RoundTimerBanner";
import { SyncStatusNotice } from "@/components/sync/SyncStatusNotice";
import { useRosterStore } from "@/hooks/useRosterStore";
import { useRoundStore } from "@/hooks/useRoundStore";
import { isContentBlocked } from "@/lib/sync/sync-status";
import type { DataStatus } from "@/lib/sync/sync-status";
import { buildExportScene } from "@/lib/matchmaker/export-scene";
import type { ExportScene } from "@/lib/matchmaker/export-scene";
import { jpgExportFileName } from "@/lib/matchmaker/export-filename";
import { resolveRoundSettings } from "@/lib/matchmaker/round-settings";
import type { RoundSettings } from "@/lib/matchmaker/round-settings";
import { collectFinishedSubmissions, toSubmitScoreInput } from "@/lib/matchmaker/scoreboard-binding";
import { downloadSceneAsJpeg } from "@/lib/matchmaker/scene-canvas";
import { readMatchSlots, clearMatchSlots } from "@/lib/scoreboard/match-slots";
import type { MatchSlots } from "@/lib/scoreboard/match-slots";

// round 為 null 時 ExportActions 的兩顆按鈕皆為 disabled（見該元件 hasNoRound 判定），
// 此時 fileName prop 不會被實際使用到；仍給一個型別合法的常數值，而非空字串或 undefined，
// 避免這個「反正用不到」的角落被誤讀成尚未處理。
// 值刻意取不含品牌前綴的中性字串（Minor-5）：舊值 "matchmaker-round-export.jpg" 手寫重複了
// export-filename.ts 的前綴與副檔名字面值，日後那邊調整會靜默漂移而沒有測試示警
// （這個值本來就用不到，不會有測試比對它）。中性字串讓「這是佔位不是真檔名」一望即知。
const NO_ROUND_FILE_NAME_PLACEHOLDER = "export.jpg";

// 名單與回合各有自己的同步狀態，頁面只顯示一個：取最需要使用者注意的那個。
// local 排在最後，兩者皆為 local（訪客）時才會是 local。
// unavailable 必須排第一：沒列出的值會落到 local 而畫出空舞台。
const SYNC_STATUS_PRIORITY: readonly DataStatus[] = [
	"unavailable",
	"load-failed",
	"loading",
	"pending",
	"rejected",
	"conflict",
	"retrying",
	"saving",
	"synced",
	"local",
];

function mergeSyncStatus(first: DataStatus, second: DataStatus): DataStatus {
	const found = SYNC_STATUS_PRIORITY.find((status) => status === first || status === second);
	return found ?? "local";
}

// 對戰頁（場次舞台）。本檔為 matchmaker 對戰引擎（useRoundStore）唯一的 import 點：
// 頁面層持有 useRosterStore 與 useRoundStore 兩個 store，
// 把前者的 updatePlayer 當 port 傳給後者，理由見 hooks/useRoundStore.ts 頂端註解。
export default function MatchmakerPage() {
	const router = useRouter();
	const {
		players,
		updatePlayer,
		syncStatus: rosterSyncStatus,
		applyRemotePlayers,
		reloadRemotePlayers,
	} = useRosterStore();
	// 雲端模式下評分由後端權威寫入：applyRemotePlayers 漏傳會使評分靜默不更新
	const {
		round,
		generateRound,
		resetIncompleteMatches,
		submitScore,
		setTargetScore,
		setTimerDuration,
		startTimer,
		swapMatchPlayer,
		syncStatus: roundSyncStatus,
		remoteMatchSlots,
	} = useRoundStore({
		players,
		updatePlayer,
		applyRemotePlayers,
		reloadRemotePlayers,
		rosterSyncStatus,
	});
	const syncStatus = mergeSyncStatus(rosterSyncStatus, roundSyncStatus);
	// 名單等待中、載入中或失敗時前端沒有可信的名單可預測評分，雲端模式的回填要等名單就緒
	const isRosterReady = !isContentBlocked(rosterSyncStatus);

	// draft 只記錄使用者於本次進入對戰頁後變更過的設定（null 為尚未變更）；
	// 實際使用的設定由 draft 與目前回合在 render 中解析，離開再回來時才會跟隨回合而非回到預設值。
	const [draft, setDraft] = useState<RoundSettings | null>(null);
	const settings = resolveRoundSettings(draft, round);
	const [roundError, setRoundError] = useState<string | null>(null);
	const [submitError, setSubmitError] = useState<MatchStageSubmitError | null>(null);
	const [swapError, setSwapError] = useState<MatchStageSwapError | null>(null);
	// 用 useReducer 而非 useState 存放 matchSlots：ESLint 的 react-hooks/set-state-in-effect
	// 規則會擋下「在 effect 內同步呼叫 useState setter」，但不適用於 useReducer 的
	// dispatch（與 hooks/useScoreboardStore.ts 的 bindingStatus 既有寫法一致）。
	const [matchSlots, setMatchSlots] = useReducer(
		(_current: MatchSlots, next: MatchSlots) => next,
		{} as MatchSlots,
	);

	const activePlayerCount = players.filter((player) => player.isActive).length;
	const hasActivePlayers = activePlayerCount > 0;

	// 回填 reconcile：以「回合已 hydrate」為觸發條件
	// （依賴陣列只放 round），而非獨立的 mount effect——mount 當下 round 可能仍是
	// useRoundStore hydrate 前的 null，此時讀到的計分板槽無法比對出「該場是否仍在回合中」。
	//
	// 一次只回填一筆：submitScore 讀取的是 render-scope 的 state.round（useRoundStore
	// 已知限制，見該檔頂端註解），同一次呼叫內連續送出多筆會讓後面呼叫的結果覆蓋前面
	// 的——因此每次 effect 只處理待送出清單的第一筆，dispatch 成功後 round 變動會觸發
	// 本 effect 重新執行，逐筆收斂直到 collectFinishedSubmissions 回傳空清單為止。
	useEffect(() => {
		if (round === null) return;

		// 雲端模式：分槽來源為 remoteMatchSlots，送出走同一個 submitScore 入口。
		// 不呼叫 clearMatchSlots——後端已在送出比分的 batch 內刪除該分槽。
		// submitScore 回 scoring-failed 可能只是名單未就緒或同場正在送出，不當成永久失敗：
		// 下一次 round／remoteMatchSlots／名單就緒變動時本 effect 會重跑。
		if (remoteMatchSlots !== null) {
			if (!isRosterReady) return;
			const [firstRemote] = collectFinishedSubmissions(round, remoteMatchSlots);
			if (firstRemote === undefined) return;
			const remoteInput = toSubmitScoreInput(firstRemote, { round, players, now: new Date().toISOString() });
			submitScore(remoteInput.matchId, remoteInput.rawScoreA, remoteInput.rawScoreB);
			return;
		}

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
		// 依賴陣列刻意不放 players／submitScore：它們每次 render 都換新參考，
		// 列入 deps 會讓本 effect 在每次 render 後都重跑，而非只在「回合資料就緒
		// 或變動」時才觸發。本機模式下 remoteMatchSlots 恆為 null；名單就緒
		// 只會在本機資料讀入的同一次 render 由 false 轉 true，與 round 讀入同時發生，
		// 不影響訪客的觸發時機。
		setMatchSlots(slots);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [round, remoteMatchSlots, isRosterReady]);

	// 雲端模式的場地卡在導向計分板前要先建立分槽，導向交給 router（CourtCard 不直接依賴 router）
	const remoteNavigate = remoteMatchSlots === null ? undefined : (href: string) => router.push(href);
	const stageSlots = remoteMatchSlots ?? matchSlots;

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

	// swapMatchPlayer 一次互動只呼叫一次（useRoundStore 的已知限制，見該檔註解）：
	// 本函式是 CourtCard 換人操作的唯一呼叫點。swapError 與 submitError 為各自獨立的
	// state，互不清除對方（design 換人風險第 1 條）。
	function handleSwapPlayer(matchId: string, outPlayerId: string, inPlayerId: string) {
		const result = swapMatchPlayer(matchId, outPlayerId, inPlayerId);
		setSwapError(result.ok ? null : { matchId, message: result.message });
	}

	// buildExportScene 的唯一呼叫點：JPG 與列印稿共用
	// 同一份內容真相來源，不各自組裝。round／players 變動時才重算。
	const exportScene: ExportScene | null = useMemo(
		() => (round === null ? null : buildExportScene(round, players)),
		[round, players],
	);

	// 傳給 ExportActions 的 fileName prop。exportedAt 取 round.createdAt（本輪產生的時間）
	// 而非 new Date()，有兩個理由：
	// ① 在 render 期間呼叫 new Date() 會讓 render 變成不純函式，同一份 props 在不同時刻
	//    render 出不同結果，是 SSR／hydration 不一致的典型成因；
	// ② 檔名日期的用途是「排序與辨識」，而「這一輪是哪天排的」比
	//    「我哪一刻按下匯出」更貼近使用者辨識檔案的心智模型——跨午夜才匯出時，
	//    round.createdAt 給的是這一輪實際發生的日期，反而比點擊時間正確。
	// 由於 exportedAt 不再依賴當下時間，fileName 完全由 round 決定，useMemo 依 round
	// 重算即可，也不再需要在點擊當下重組檔名的包裝函式。
	const exportFileName = useMemo(
		() =>
			round === null
				? NO_ROUND_FILE_NAME_PLACEHOLDER
				: jpgExportFileName({ roundNumber: round.roundNumber, exportedAt: round.createdAt }),
		[round],
	);

	// 資料等待中、雲端名單載入中或失敗時沒有可信的名單；顯示空名單會誤導使用者重新建立，
	// 所以以提示取代主要內容。須排在所有 hook 之後，避免條件式呼叫 hook。
	if (isContentBlocked(syncStatus)) {
		return (
			<main
				data-sync-status={syncStatus}
				className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8"
			>
				<SyncStatusNotice status={syncStatus} />
			</main>
		);
	}

	return (
		<main
			// 本機模式為 undefined，React 不輸出屬性，訪客 DOM 不變
			data-sync-status={syncStatus === "local" ? undefined : syncStatus}
			className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8"
		>
			<SyncStatusNotice status={syncStatus} />
			{/* 頁面標題區在列印時隱藏——PrintSheet 已自帶一個 <h1>{scene.title}</h1>，
			    若不隱藏會讓紙本同頁出現兩個 <h1>。 */}
			<div data-print="hide">
				<h1 className="text-2xl font-bold">對戰分配</h1>
				<p className="text-sm text-muted-foreground">安排場地、產生本輪對戰並記錄比分。</p>
			</div>

			{/* 匯出入口是操作控制項，列印時應隱藏，改由紙本自己的列印版取代。
			    ExportActions 本身不接受 className／data 屬性，故以包裝 div 承載
			    data-print="hide"，而非改動 ExportActions.tsx。 */}
			<div data-print="hide">
				<ExportActions scene={exportScene} fileName={exportFileName} exportJpg={downloadSceneAsJpeg} />
			</div>

			{roundError !== null && (
				<div
					role="alert"
					data-print="hide"
					className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive"
				>
					{roundError}
				</div>
			)}

			{/* 「產生本輪對戰」與「重設／再排」是 spec 明訂的主要操作
			    入口，手機斷點 MUST ≥44px；場地數加減與對戰方式／目標分數的 radio
			    是次要控制項，刻意不擴大範圍。RoundControls.tsx 不為此加 className，
			    改由本層以 CSS 選擇器精準只挑出「無 role 也無
			    aria-label」的按鈕——這正好排除所有 radio（帶 role="radio"）與圖示按鈕
			    （帶 aria-label），只命中「產生本輪對戰」「重設／再排」這兩顆。
			    「開始計時」同樣無 role 也無 aria-label，因此一併被命中而取得
			    ≥44px 觸控目標——它是一次性主要操作，這個順帶結果符合原意，故不調整選擇器。
			    這顆包裝 div 同時也是 RoundControls 的操作控制項容器，列印時隱藏。 */}
			<div
				data-print="hide"
				className="max-md:[&_button:not([role]):not([aria-label])]:min-h-11"
			>
				<RoundControls
					settings={settings}
					onSettingsChange={setDraft}
					round={round}
					matchSlots={stageSlots}
					activePlayerCount={activePlayerCount}
					onGenerate={handleGenerate}
					onReset={handleReset}
					setTargetScore={setTargetScore}
					setTimerDuration={setTimerDuration}
					startTimer={startTimer}
				/>
			</div>

			{/* 倒數是「整輪共用的單一計時」，不屬於任何一張場地卡片，
			    故獨立掛載於本層而非塞進 MatchStage／CourtCard（與 ExportActions／
			    PrintSheet 同一條理由）。本層只負責掛載與傳值：倒數取樣、到期判定與提示音
			    去重全在 RoundTimerBanner 與其委派的 hook／純函式內，SHALL NOT 在頁面層
			    重複一份。
			    不包一層 `round !== null &&` 條件式：RoundTimerBanner 自行處理 timer 為 null
			    與尚未開始兩種早退並回傳 null（畫面結果相同），而包了條件式會在回合有無之間
			    製造 unmount／remount，把「同一次到期只播一次」所倚賴的 useRef 旗標清掉。
			    倒數是螢幕上的操作輔助資訊，列印時隱藏，包裝方式比照上下兩區。 */}
			<div data-print="hide">
				<RoundTimerBanner timer={round?.timer ?? null} />
			</div>

			{/* 舞台區是螢幕版的對戰畫面（比分輸入等互動），列印時由下方的 PrintSheet
			    取代，故隱藏。 */}
			<div data-testid="match-stage-region" data-print="hide">
				{round === null ? (
					<EmptyStage hasActivePlayers={hasActivePlayers} onGenerate={() => handleGenerate(settings)} />
				) : (
					<MatchStage
						round={round}
						players={players}
						hasActivePlayers={hasActivePlayers}
						matchSlots={stageSlots}
						remoteNavigate={remoteNavigate}
						onSubmitScore={handleSubmitScore}
						submitError={submitError}
						onSwapPlayer={handleSwapPlayer}
						swapError={swapError}
					/>
				)}
			</div>

			{/* 列印版內容，與 JPG 匯出共用同一份 exportScene。
			    螢幕上預設隱藏、列印時顯示，由 app/globals.css 的 @media print 區塊負責。
			    exportScene 為 null（尚無回合）時 PrintSheet 的 scene prop 為必填，故此處
			    不掛入。 */}
			{exportScene !== null && <PrintSheet scene={exportScene} />}
		</main>
	);
}
