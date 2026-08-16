// components/matchmaker/PlayerCard.tsx
"use client";

import { Pause } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { pickTextColor } from "@/lib/matchmaker/colors";
import type { Player } from "@/lib/matchmaker/types";

const GENDER_LABEL: Record<Player["gender"], string> = {
	male: "男",
	female: "女",
	other: "其他",
};

interface PlayerCardProps {
	player: Player;
	onEdit: () => void;
	onToggleActive: () => void;
	onDeleteRequest: () => void;
}

// 單筆參賽者卡片：背景為使用者自訂的雙色漸層（colorFrom → colorTo），屬動態值
// 必須用 inline style——Tailwind class 只能表達預先定義好的固定色階，無法涵蓋
// 使用者任意選取的 hex 組合。前景色由 pickTextColor 依 WCAG 對比度公式計算，
// 確保漸層背景上的文字維持可讀。
//
// 暫停出場者除了會顯示的文字徽章外不改變卡片底色本身：spec／prd.md 12.5 要求
// 色彩不得作為唯一資訊來源，因此用「文字＋圖示」的 Badge 標示狀態，而不是單純
// 把卡片變灰——那樣色弱使用者或黑白螢幕仍看不出差異。
export function PlayerCard({ player, onEdit, onToggleActive, onDeleteRequest }: PlayerCardProps) {
	const foreground = pickTextColor(player.colorFrom, player.colorTo);

	return (
		<Card
			className="gap-3 overflow-hidden border-0 py-0"
			style={{
				background: `linear-gradient(135deg, ${player.colorFrom}, ${player.colorTo})`,
				color: foreground,
			}}
		>
			<CardContent className="flex flex-col gap-3 p-4">
				<div className="flex items-start justify-between gap-2">
					<div className="min-w-0">
						<p className="truncate text-lg font-semibold">{player.name}</p>
						<p className="text-sm opacity-90">
							{GENDER_LABEL[player.gender]} · 強度 {player.rating.toFixed(2)}
						</p>
					</div>
					{/* 非顏色的狀態標示：文字「暫停出場」+ Pause 圖示，不倚賴顏色辨識 */}
					{!player.isActive && (
						<Badge
							variant="outline"
							className="shrink-0 gap-1 border-current bg-transparent text-current"
						>
							<Pause className="size-3" aria-hidden="true" />
							暫停出場
						</Badge>
					)}
				</div>
				<div className="flex flex-wrap gap-2">
					<Button variant="secondary" size="sm" onClick={onToggleActive}>
						{player.isActive ? "設為暫停" : "恢復出場"}
					</Button>
					<Button variant="secondary" size="sm" onClick={onEdit}>
						編輯
					</Button>
					<Button variant="destructive" size="sm" onClick={onDeleteRequest}>
						刪除
					</Button>
				</div>
			</CardContent>
		</Card>
	);
}
