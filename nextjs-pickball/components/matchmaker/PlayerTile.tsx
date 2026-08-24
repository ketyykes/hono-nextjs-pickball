// components/matchmaker/PlayerTile.tsx
"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ratingBoundState } from "@/lib/matchmaker/rating-bounds";
import type { RatingBoundState } from "@/lib/matchmaker/rating-bounds";
import { playerTileStyle } from "@/lib/matchmaker/tile-style";
import type { Player } from "@/lib/matchmaker/types";

const GENDER_LABEL: Record<Player["gender"], string> = {
	male: "男",
	female: "女",
	other: "其他",
};

// 觸頂／觸底標示文字：比照 PlayerCard.tsx 既有的「暫停出場」Badge 做法，以文字＋圖示表達，
// 不倚賴顏色辨識（prd.md 12.5、6.4.6）。within-bounds 不在此表中——該狀態不顯示任何標示。
const BOUND_LABEL: Record<Exclude<RatingBoundState, "within-bounds">, string> = {
	"at-upper-bound": "已達上限",
	"at-lower-bound": "已達下限",
};

export interface PlayerTileProps {
	player: Player;
	completed: boolean;
}

// 單一 1x1 色塊：單打與雙打共用同一份實作，差異只在於 CourtCard 如何排版——
// 本元件不知道自己身處單打或雙打對戰，樣式推導全部委派 playerTileStyle。
export function PlayerTile({ player, completed }: PlayerTileProps) {
	const style = playerTileStyle(player, { completed });
	const boundState = ratingBoundState(player.rating);

	return (
		<div
			data-testid={`player-tile-${player.id}`}
			className="flex aspect-square min-h-24 flex-col justify-between gap-1 overflow-hidden rounded-md p-2"
			// 展開成物件字面量而非用 as 轉型：PlayerTileStyle（tile-style.ts）的欄位語意
			// 與 CSSProperties 完全相容，展開後可自然取得 style 屬性要求的隱式索引簽章，
			// 不需要繞過型別檢查；換掉這裡的欄位型別仍會被 tsc 擋下（如塞進非 CSS 欄位）。
			style={{ ...style }}
		>
			<div className="min-w-0">
				<p className="truncate text-sm font-semibold">{player.name}</p>
				<p className="text-xs font-normal">
					{GENDER_LABEL[player.gender]} · 強度 {player.rating.toFixed(2)}
				</p>
			</div>
			{boundState !== "within-bounds" && (
				<Badge
					variant="outline"
					className="w-fit gap-1 border-current bg-transparent text-current"
				>
					{boundState === "at-upper-bound" ? (
						<ArrowUp className="size-3" aria-hidden="true" />
					) : (
						<ArrowDown className="size-3" aria-hidden="true" />
					)}
					{BOUND_LABEL[boundState]}
				</Badge>
			)}
		</div>
	);
}
