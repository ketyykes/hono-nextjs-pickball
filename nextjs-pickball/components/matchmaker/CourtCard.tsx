// components/matchmaker/CourtCard.tsx
"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { buildCourtTiles } from "@/lib/matchmaker/stage-layout";
import { DOUBLES_COMPOSITION_LABEL, TEAM_LABELS } from "@/lib/matchmaker/labels";
import type { CourtTileSource } from "@/lib/matchmaker/stage-layout";
import type { Player } from "@/lib/matchmaker/types";
import type { Round, RoundMatch } from "@/lib/matchmaker/round-types";
import { buildMatchSlotSeed, ensureMatchSlot, mapTeamScores } from "@/lib/matchmaker/scoreboard-binding";
import type { ScoreboardState } from "@/lib/scoreboard/types";
import { PlayerTile } from "./PlayerTile";
import { ScoreEntry } from "./ScoreEntry";

export interface CourtCardProps {
	match: RoundMatch;
	players: readonly Player[];
	// round 為必填（非 optional）：計分板入口的 seed 建立需要該輪的 targetScore／format，
	// CourtCard 在實際的 MatchStage 版面下必然伴隨 round 存在，沒有理由把型別放寬成
	// optional 只為了遷就舊測試（見 CourtCard.test.tsx 的 buildProps 已同步補上預設值）。
	round: Round;
	// 該場次目前的計分板槽，null 代表尚未開始場邊計分（spec「計分中場次的標示與返回後呈現」）。
	matchSlot: ScoreboardState | null;
	onSubmitScore: (matchId: string, rawScoreA: string, rawScoreB: string) => void;
	submitError: string | null;
}

// RoundMatch 只存 playerIds（design Open Questions 2b）：回合與名單同時活著，內嵌整個
// Player 會產生兩個互相矛盾的真相。顯示與版面推導都要靠 players 名單查表補全為完整 Player。
// 查無此人（該員已被移除，roster.ts 的 removePlayer 不禁止移除仍在場次中的人）時直接
// 從陣列中略過，不拋錯——結果是該格不渲染，而非讓整張場地卡片崩潰。
function resolveTeamPlayers(playerIds: readonly string[], players: readonly Player[]): Player[] {
	return playerIds
		.map((id) => players.find((player) => player.id === id))
		.filter((player): player is Player => player !== undefined);
}

// 完成時間格式化為 HH:mm（design Open Questions 3）：直接讀本地時區的時／分，不切片
// ISO 字串——切片取到的是 UTC 而非本地時區，與歷史紀錄「對戰時間」的顯示基準不一致。
// 沒有第二個消費者前不抽為共用格式化函式（design Open Questions 3 的刻意決定）。
function formatCompletedTime(completedAt: string): string {
	const date = new Date(completedAt);
	const hours = String(date.getHours()).padStart(2, "0");
	const minutes = String(date.getMinutes()).padStart(2, "0");
	return `${hours}:${minutes}`;
}

// 單一場地：色塊網格＋比分送出＋完成資訊（design Decision 2）。CourtCard 只做組裝——
// 版面推導只用 buildCourtTiles、樣式推導只用 playerTileStyle（於 PlayerTile 內），
// 本檔不得另寫一份 row／column 或漸層計算。tileGridRow／scoreEntryGridRow 只是把
// buildCourtTiles 已推導好的邏輯座標（0 起算）翻譯成本檔選定版面下的 CSS grid 列號，
// 不是重新決定「誰在第幾排」。
export function CourtCard({ match, players, round, matchSlot, onSubmitScore, submitError }: CourtCardProps) {
	const completed = match.status === "completed";
	const isDoubles = match.format === "doubles";
	const [teamA, teamB] = match.teams;

	// 計分中判定：只要有槽即視為「計分中」（spec「計分中場次的標示與返回後呈現」）。
	// 槽為 finished 但該場尚未完成的短暫過渡（回填 effect 尚未跑完）仍歸在此分支——
	// effect 一旦完成會清槽並讓 match.status 轉為 completed，不需要在本元件另外特判。
	const inProgress = matchSlot !== null;
	const liveScore = matchSlot ? mapTeamScores(matchSlot.scores, "round") : null;
	const entryLabel = inProgress ? "繼續計分" : "進入計分板";

	// 進入計分板：先寫 seed 再導向（spec「場地區塊的計分板入口」明訂順序不可對調）。
	// Next.js Link 會先呼叫這裡傳入的 onClick，再執行自身的導航邏輯，故本函式同步
	// 完成 ensureMatchSlot（寫入 localStorage）之後，Link 才會開始換頁。
	function handleEnterScoreboard() {
		ensureMatchSlot(buildMatchSlotSeed(round, match));
	}

	const tileSource: CourtTileSource = {
		format: match.format,
		teams: [
			{ players: resolveTeamPlayers(teamA.playerIds, players) },
			{ players: resolveTeamPlayers(teamB.playerIds, players) },
		],
	};
	const tiles = buildCourtTiles(tileSource);

	// 雙打上下分排（design Decision 4）：色塊列 0／1 分別落在 grid 第 2、4 列，
	// 讓第 1、5 列可以貼隊伍標籤、第 3 列放比分區這個「網」；單打只有一排色塊，
	// 直接排第 1 列，標籤改用格線外的左右並列（單打左右分置本就正確，不受本次調整影響）。
	function tileGridRow(tileRow: number): number {
		if (!isDoubles) {
			return 1;
		}
		return tileRow === 0 ? 2 : 4;
	}
	const scoreEntryGridRow = isDoubles ? 3 : 2;

	function handleScoreSubmit(rawScoreA: string, rawScoreB: string) {
		onSubmitScore(match.id, rawScoreA, rawScoreB);
	}

	// 隊伍標籤＋勝方文字標籤：色彩不得作為唯一資訊來源，勝方 MUST 以文字而非僅顏色標示
	// （prd.md 12.5）。標籤位置必須與色塊排列對應：單打左右分置，故作為 grid 外的並列標頭；
	// 雙打上下分排（design Decision 4），故貼在各自那一排旁——若沿用單打的左右並列，
	// 「第二隊」會落在第一隊色塊的正上方，讀者仍得靠顏色把標籤連回色塊。
	function renderTeamLabel(team: "a" | "b") {
		const index = team === "a" ? 0 : 1;
		const winnerKey = team === "a" ? "teamA" : "teamB";
		return (
			<div
				data-testid={`court-${match.id}-team-${team}`}
				className="flex items-center gap-1 text-xs text-muted-foreground"
			>
				<span>{TEAM_LABELS[index]}</span>
				{completed && match.winner === winnerKey && (
					<Badge variant="outline" className="border-current bg-transparent text-current">
						勝
					</Badge>
				)}
			</div>
		);
	}

	return (
		<Card className="gap-3 py-4" data-testid={`court-${match.id}`}>
			<CardContent className="flex flex-col gap-3 px-4">
				<div className="flex items-center justify-between gap-2">
					<h3 className="text-sm font-semibold">第 {match.courtNumber} 場地</h3>
					{isDoubles && match.doublesComposition && (
						<Badge variant="secondary">{DOUBLES_COMPOSITION_LABEL[match.doublesComposition]}</Badge>
					)}
				</div>

				{/* 計分板入口與計分中標示（spec「場地區塊的計分板入口」「計分中場次的標示與
				    返回後呈現」）：已完成場次 SHALL NOT 提供入口（prd.md 6.5），本區塊整段不渲染。
				    「計分中」MUST 併同文字而非只靠顏色（prd.md 12.5），故與 Badge 同時顯示比分文字。 */}
				{!completed && (
					<div className="flex items-center justify-between gap-2 text-sm">
						{inProgress && liveScore ? (
							<div className="flex items-center gap-2">
								<Badge variant="secondary">計分中</Badge>
								<span className="font-semibold">{`${liveScore.first}:${liveScore.second}`}</span>
							</div>
						) : (
							<span />
						)}
						<Button asChild variant="outline" size="sm">
							<Link href={`/scoreboard?match=${match.id}`} onClick={handleEnterScoreboard}>
								{entryLabel}
							</Link>
						</Button>
					</div>
				)}

				{!isDoubles && (
					<div className="flex items-center justify-between">
						{renderTeamLabel("a")}
						{renderTeamLabel("b")}
					</div>
				)}

				<div
					data-testid={`court-${match.id}-grid`}
					className="grid gap-2"
					style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}
				>
					{isDoubles && <div style={{ gridColumn: "1 / 3", gridRow: 1 }}>{renderTeamLabel("a")}</div>}
					{tiles.map((tile) => (
						<div
							key={tile.player.id}
							style={{ gridColumn: tile.column + 1, gridRow: tileGridRow(tile.row) }}
						>
							<PlayerTile player={tile.player} completed={completed} />
						</div>
					))}
					{/* 比分與送出控制區位於上排與下排之間，同時扮演雙打版面「網」的分隔角色
					    （design Decision 4）；單打只有一排色塊，此區塊自然落在下方。 */}
					<div
						data-testid={`court-${match.id}-score-entry`}
						style={{ gridColumn: "1 / 3", gridRow: scoreEntryGridRow }}
					>
						<ScoreEntry
							teamALabel={TEAM_LABELS[0]}
							teamBLabel={TEAM_LABELS[1]}
							disabled={completed}
							onSubmitScore={handleScoreSubmit}
							submitError={submitError}
						/>
					</div>
					{isDoubles && <div style={{ gridColumn: "1 / 3", gridRow: 5 }}>{renderTeamLabel("b")}</div>}
				</div>

				{/* 完成場次的關鍵資訊顯示在色塊外的場次資訊列，不受色塊減弱不透明度／飽和度
				    影響（design Decision 8 的緩解）。比分與完成時間各自獨立判斷是否顯示——
				    兩者理論上不會缺一（RoundMatchSchema 的 superRefine 保證 completed 場次
				    scores／completedAt 同時存在），但不應讓其中一個欄位的損壞連坐拖累另一個
				    仍然合法的欄位。 */}
				{completed && (
					<>
						<Separator />
						<div className="flex items-center justify-between text-sm">
							{match.scores && (
								<div
									data-testid={`court-${match.id}-score`}
									className="flex items-center gap-1 font-semibold"
								>
									<span>{match.scores.teamA}</span>
									<span>:</span>
									<span>{match.scores.teamB}</span>
								</div>
							)}
							{match.completedAt && (
								<span
									data-testid={`court-${match.id}-completed-at`}
									className="text-xs text-muted-foreground"
								>
									{formatCompletedTime(match.completedAt)}
								</span>
							)}
						</div>
					</>
				)}
			</CardContent>
		</Card>
	);
}
