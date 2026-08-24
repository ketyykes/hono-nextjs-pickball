// components/matchmaker/RestingPanel.tsx
"use client";

import { playerTileStyle } from "@/lib/matchmaker/tile-style";
import type { Player } from "@/lib/matchmaker/types";

export interface RestingPanelProps {
	resting: readonly Player[];
	hasActivePlayers: boolean;
}

// 兩段空狀態文案：分配引擎不把暫停出場者列入休息名單（match-allocation 的「暫停出場者不
// 進入候選池」Requirement），因此「全員出場」與「全員暫停出場」兩種情況的休息名單同樣為空，
// 只給一段文案會讓使用者把「全員暫停」誤讀為「大家都上場了」，故依 hasActivePlayers 分流。
const ALL_PLAYING_TEXT = "本輪全員出場";
const ALL_PAUSED_TEXT = "目前沒有任何可出場的參賽者（全員暫停出場）";

// 休息名單輔助區：每筆顯示姓名、該員雙色漸層的顏色標記，以及累計休息次數（prd.md 7.4）。
// resting 已是頁面層查表解析完的 Player（design Open Questions 2b：Round 只存
// restingPlayerIds），本元件不做任何 id 查表，也不對名單做排序或篩選——名單的內容與順序
// 完全由分配引擎決定（design Decision 9）。
export function RestingPanel({ resting, hasActivePlayers }: RestingPanelProps) {
	if (resting.length === 0) {
		return (
			<p className="text-sm text-muted-foreground">
				{hasActivePlayers ? ALL_PLAYING_TEXT : ALL_PAUSED_TEXT}
			</p>
		);
	}

	return (
		<ul className="flex flex-col gap-2">
			{resting.map((player) => {
				// 顏色標記重用 tile-style.ts 的 playerTileStyle，不另寫一份漸層字串（design
				// Decision 8）；休息名單不對應任何場次，completed 恆傳 false。
				const style = playerTileStyle(player, { completed: false });
				return (
					<li
						key={player.id}
						data-testid={`resting-player-${player.id}`}
						className="flex items-center gap-2 text-sm"
					>
						{/* 純裝飾用色塊，故 aria-hidden（prd.md 12.5：色彩僅為輔助線索）；展開完整
						    style 物件比照 PlayerTile.tsx——只取 background 會讓 completed 誤傳
						    在 DOM 上不可觀察。 */}
						<span
							data-testid={`resting-swatch-${player.id}`}
							aria-hidden="true"
							className="size-4 shrink-0 rounded-full"
							style={{ ...style }}
						/>
						<span className="min-w-0 flex-1 truncate">{player.name}</span>
						<span className="text-muted-foreground">休息 {player.restCount} 次</span>
					</li>
				);
			})}
		</ul>
	);
}
