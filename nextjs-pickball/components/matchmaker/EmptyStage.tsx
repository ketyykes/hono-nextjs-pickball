// components/matchmaker/EmptyStage.tsx
"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

const NO_PLAYERS_TITLE = "目前沒有可出場的參賽者";
const NO_PLAYERS_DESCRIPTION = "請先前往參賽者名單新增或恢復出場，才能開始安排對戰。";
const READY_TITLE = "尚未產生任何回合";
const READY_DESCRIPTION = "按下「建立第一輪」即可依目前設定產生本輪對戰。";

export interface EmptyStageProps {
	hasActivePlayers: boolean;
	onGenerate: () => void;
}

// 空白球場狀態（spec Requirement「空白球場狀態」）：尚無目前回合時 MUST 顯示，
// SHALL NOT 顯示任何假名單、假比分或假場次——本元件不 import PlayerTile／
// ScoreEntry／CourtCard，結構上就不可能帶出假資料。
//
// 入口依名單狀態分流（design Decision 9 的 EmptyStage 職責）：有可出場參賽者時
// 給「建立第一輪」（onGenerate 由父層注入，等同呼叫「產生本輪對戰」）；名單為空
// （或全員暫停出場）時改給導向 /matchmaker/players 的「加入參賽者」——
// SHALL NOT 只給一顆按不動的「建立第一輪」，那會讓使用者停在死路上。
export function EmptyStage({ hasActivePlayers, onGenerate }: EmptyStageProps) {
	return (
		<div
			data-testid="empty-stage"
			className="flex flex-col items-center gap-4 rounded-lg border border-dashed border-border px-6 py-16 text-center"
		>
			<div className="space-y-1">
				<p className="text-lg font-semibold">{hasActivePlayers ? READY_TITLE : NO_PLAYERS_TITLE}</p>
				<p className="text-sm text-muted-foreground">
					{hasActivePlayers ? READY_DESCRIPTION : NO_PLAYERS_DESCRIPTION}
				</p>
			</div>
			{hasActivePlayers ? (
				<Button type="button" onClick={onGenerate}>
					建立第一輪
				</Button>
			) : (
				<Button asChild>
					<Link href="/matchmaker/players">加入參賽者</Link>
				</Button>
			)}
		</div>
	);
}
