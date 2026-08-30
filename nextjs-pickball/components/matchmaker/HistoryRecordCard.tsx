// components/matchmaker/HistoryRecordCard.tsx
"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import type { HistoryTeam, MatchHistoryEntry } from "@/lib/matchmaker/history";

// 隊伍文字標籤：色彩不得作為唯一資訊來源（prd.md 12.5），與 CourtCard.tsx 既有寫法相同。
const TEAM_LABELS: readonly [string, string] = ["第一隊", "第二隊"];

// 對戰方式的顯示文字。
const FORMAT_LABEL: Record<MatchHistoryEntry["format"], string> = {
	singles: "單打",
	doubles: "雙打",
};

// 雙打組成的中文標示，MUST 與 CourtCard.tsx 各自持有的同名對照表逐字相同
// （design Open Question 4 的結案裁決）。刻意不抽成共用模組：僅 4 個項目的穩定對照表，
// 抽出需連動修改本 change 範圍外的 CourtCard.tsx，風險與收益不成比例。
const DOUBLES_COMPOSITION_LABEL = {
	mixed: "混雙",
	mens: "男雙",
	womens: "女雙",
	general: "一般雙打",
} as const;

export interface HistoryRecordCardProps {
	entry: MatchHistoryEntry;
}

// 對戰時間格式化為在地時區的 YYYY/MM/DD HH:mm，供人眼閱讀；<time dateTime> 另外保留
// 原始 ISO 字串供機器可讀與測試斷言。比照 CourtCard.tsx 的 formatCompletedTime 做法，
// 直接讀本地時區的年月日時分，不切片 ISO 字串（切片取到的是 UTC）。
function formatPlayedAt(playedAt: string): string {
	const date = new Date(playedAt);
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	const hours = String(date.getHours()).padStart(2, "0");
	const minutes = String(date.getMinutes()).padStart(2, "0");
	return `${year}/${month}/${day} ${hours}:${minutes}`;
}

// 單一隊伍區塊：球員姓名一律取自紀錄內的姓名快照（team.players[].name），SHALL NOT
// 以 id 回查目前名單——參賽者可能已被刪除或改名，回查會讓過去的賽果變成空白
// （spec「歷史紀錄的顯示欄位」）。賽前／賽後分數逐位球員呈現，兩者同時顯示。
function TeamBlock({
	team,
	label,
	isWinner,
	testId,
}: {
	team: HistoryTeam;
	label: string;
	isWinner: boolean;
	testId: string;
}) {
	return (
		<div data-testid={testId} className="flex flex-col gap-1">
			<div className="flex items-center gap-1 text-xs text-muted-foreground">
				<span>{label}</span>
				{isWinner && (
					<Badge variant="outline" className="border-current bg-transparent text-current">
						勝
					</Badge>
				)}
			</div>
			{team.players.map((player) => (
				<div key={player.id} className="text-sm">
					<span className="font-medium">{player.name}</span>{" "}
					<span className="text-xs text-muted-foreground">
						{player.ratingBefore.toFixed(2)} → {player.ratingAfter.toFixed(2)}
					</span>
				</div>
			))}
		</div>
	);
}

// 單筆歷史紀錄卡片：呈現 prd.md 8.2 全部欄位（spec「歷史紀錄的顯示欄位」）。
// 分數（賽前／賽後、比分）與勝方一律照 M4 寫入值原樣顯示，本元件不重新計算。
export function HistoryRecordCard({ entry }: HistoryRecordCardProps) {
	return (
		<Card data-testid={`history-record-${entry.matchId}`} className="gap-3 py-4">
			<CardContent className="flex flex-col gap-3 px-4">
				<div className="flex flex-wrap items-center justify-between gap-2 text-sm">
					<div className="flex flex-wrap items-center gap-2">
						<span className="font-semibold">第 {entry.courtNumber} 場地</span>
						<Badge variant="secondary">{FORMAT_LABEL[entry.format]}</Badge>
						{/* 雙打組成標示只在雙打時渲染，單打 SHALL NOT 顯示（spec「歷史紀錄的顯示欄位」）。
						    以 entry.format === "doubles" 直接判斷而非額外 isDoubles 變數，讓 discriminated
						    union 在此分支內把 entry 收窄為雙打分支，doublesComposition 才存在。 */}
						{entry.format === "doubles" && (
							<Badge variant="secondary">{DOUBLES_COMPOSITION_LABEL[entry.doublesComposition]}</Badge>
						)}
					</div>
					<time dateTime={entry.playedAt} className="text-xs text-muted-foreground">
						{formatPlayedAt(entry.playedAt)}
					</time>
				</div>

				<div className="grid grid-cols-2 gap-3">
					<TeamBlock
						team={entry.teamA}
						label={TEAM_LABELS[0]}
						isWinner={entry.winner === "teamA"}
						testId={`history-record-${entry.matchId}-team-a`}
					/>
					<TeamBlock
						team={entry.teamB}
						label={TEAM_LABELS[1]}
						isWinner={entry.winner === "teamB"}
						testId={`history-record-${entry.matchId}-team-b`}
					/>
				</div>

				<Separator />
				<div className="flex items-center justify-between text-sm">
					<div
						data-testid={`history-record-${entry.matchId}-score`}
						className="flex items-center gap-1 font-semibold"
					>
						<span>{entry.scoreA}</span>
						<span>:</span>
						<span>{entry.scoreB}</span>
					</div>
					<span className="text-xs text-muted-foreground">對戰 ID：{entry.matchId}</span>
				</div>
			</CardContent>
		</Card>
	);
}
