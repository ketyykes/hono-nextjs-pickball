// components/matchmaker/PlayerStatsTable.tsx
// 排行榜表格：純呈現元件，資料由 computePlayerStats 算好並排序完成傳入
// （lib/matchmaker/player-stats.ts design Decision 2），本檔不重新排序、不做任何
// id 回查，也不 import 任何 store——呈現決策（已不在名單的文字標示、null 的佔位符號）
// 集中在這裡，計算邏輯留在 lib/（spec「統計頁的路由與呈現」）。
"use client";

import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { pickTextColor } from "@/lib/matchmaker/colors";
import { PLAYER_NOT_ON_ROSTER_LABEL } from "@/lib/matchmaker/labels";
import type { PlayerStat } from "@/lib/matchmaker/player-stats";

export interface PlayerStatsTableProps {
	stats: readonly PlayerStat[];
}

// 最常搭檔／最常對手為 null（找不到）時的表格佔位符號。單一消費端、純顯示用途，
// 不進 labels.ts（design Decision 2；§4→§5 交棒事項 1：null 的顯示決策留在本檔）。
const NO_FREQUENT_NAME_PLACEHOLDER = "尚無紀錄";

// 漸層角度沿用 lib/matchmaker/tile-style.ts 既有寫法，同一顏色來源在不同呈現位置
// 採一致角度；本元件不重用 playerTileStyle 本身——該函式簽名要求完整 Player
// （含 gender／rating 等排行榜色塊不需要的欄位），且它的 completed 參數在排行榜
// 情境下無意義，直接依 PlayerStat.colorFrom／colorTo 組字串更貼合本檔的資料形狀。
const GRADIENT_ANGLE_DEG = 135;

// 強度淨變化可正可負：正值補上「+」號讓正負一眼可辨，負值本身已帶負號、不重複處理，
// 0 則不補號（design 未規範此邊界，選擇不特殊化零值）。
function formatRatingDelta(delta: number): string {
	const sign = delta > 0 ? "+" : "";
	return `${sign}${delta.toFixed(2)}`;
}

export function PlayerStatsTable({ stats }: PlayerStatsTableProps) {
	return (
		<Table>
			<TableHeader>
				<TableRow>
					<TableHead>名次</TableHead>
					<TableHead>球員</TableHead>
					<TableHead>目前強度</TableHead>
					<TableHead>出場數</TableHead>
					<TableHead>勝負</TableHead>
					<TableHead>勝率</TableHead>
					<TableHead>強度淨變化</TableHead>
					<TableHead>最常搭檔</TableHead>
					<TableHead>最常對手</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{stats.map((stat, index) => {
					// 色塊一律用 stat.colorFrom／colorTo 渲染，不論 onRoster 為何——已離開名單者
					// 的中性灰已由 player-stats.ts 決定好（design Decision 3），本檔不需要另外
					// 判斷「要不要換色」。
					const background = `linear-gradient(${GRADIENT_ANGLE_DEG}deg, ${stat.colorFrom}, ${stat.colorTo})`;
					const color = pickTextColor(stat.colorFrom, stat.colorTo);

					return (
						<TableRow key={stat.id} data-testid={`player-stat-row-${stat.id}`}>
							<TableCell>{index + 1}</TableCell>
							<TableCell>
								<span
									data-testid={`player-stat-badge-${stat.id}`}
									style={{ background, color }}
									className="inline-block rounded px-2 py-1"
								>
									{stat.name}
								</span>
								{!stat.onRoster && (
									<span className="ml-1 text-xs text-muted-foreground">
										{PLAYER_NOT_ON_ROSTER_LABEL}
									</span>
								)}
							</TableCell>
							<TableCell>{stat.currentRating.toFixed(2)}</TableCell>
							<TableCell>{stat.gamesPlayed}</TableCell>
							<TableCell>
								{stat.wins} - {stat.losses}
							</TableCell>
							<TableCell>{Math.round(stat.winRate * 100)}%</TableCell>
							<TableCell>{formatRatingDelta(stat.ratingDelta)}</TableCell>
							<TableCell>{stat.mostFrequentPartner ?? NO_FREQUENT_NAME_PLACEHOLDER}</TableCell>
							<TableCell>{stat.mostFrequentOpponent ?? NO_FREQUENT_NAME_PLACEHOLDER}</TableCell>
						</TableRow>
					);
				})}
			</TableBody>
		</Table>
	);
}
