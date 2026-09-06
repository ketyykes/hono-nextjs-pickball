// app/matchmaker/stats/page.tsx
"use client";

import { useState } from "react";
import { EmptyHistory } from "@/components/matchmaker/EmptyHistory";
import { HistoryRangeFilter } from "@/components/matchmaker/HistoryRangeFilter";
import { PlayerStatsTable } from "@/components/matchmaker/PlayerStatsTable";
import { useRosterStore } from "@/hooks/useRosterStore";
import { useRoundStore } from "@/hooks/useRoundStore";
import { filterHistoryByRange } from "@/lib/matchmaker/history-range";
import type { HistoryRange } from "@/lib/matchmaker/history-range";
import { computePlayerStats } from "@/lib/matchmaker/player-stats";

// 統計頁（球員排行榜）。本檔標 "use client" 並直接持有 useRosterStore 與 useRoundStore
// 兩個既有 store（design Decision 1，形態比照 app/matchmaker/page.tsx）：不另呼叫
// readRoster()／readHistory()，否則會在兩個 hook 之外長出第三、第四份 hydration 邏輯，
// 各自的 droppedCount 也得再接一次。本頁只做 store 接線與條件渲染，統計計算與區間
// 篩選全數委派 computePlayerStats／filterHistoryByRange。
//
// updatePlayer 是 useRoundStore 的必填注入埠（見該 hook 的 UseRoundStoreOptions）：
// 本頁不觸發任何會變動狀態的動作，仍必須原樣傳入才符合既有介面的形狀。
export default function MatchmakerStatsPage() {
	const { players, updatePlayer } = useRosterStore();
	const { history } = useRoundStore({ players, updatePlayer });

	// 初次開啟預設選中今日，與歷史頁一致（spec「統計依區間篩選」、prd.md 13.4）。
	const [selectedRange, setSelectedRange] = useState<HistoryRange>("today");

	// 在 render 期間取「現在」不會造成 hydration mismatch：首次伺服器輸出與 hydration
	// 當下的 history 皆為空陣列（useRoundStore 於 effect 內才灌入資料），兩邊都走下方
	// 的空狀態分支，時鐘取值根本不影響輸出。tests/e2e/specs/player-stats.spec.ts 的
	// 「統計頁載入後無 console error」即為此推論的實證。
	const filteredHistory = filterHistoryByRange(history, selectedRange, new Date());
	// 目前強度不受區間篩選影響（spec「目前強度與已離開名單球員的標示」）：那是由
	// players 的 rating 決定的，篩選只改變出場數／勝負／淨變化／搭檔對手等期間內統計。
	const stats = computePlayerStats(filteredHistory, players);

	return (
		<main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8">
			<div>
				<h1 className="text-2xl font-bold">球員統計</h1>
				<p className="text-sm text-muted-foreground">依區間排名每位球員的表現與強度消長。</p>
			</div>

			{history.length === 0 ? (
				// 整份歷史完全沒有資料：引導型空狀態，SHALL NOT 顯示只有標題列的空表格
				// （spec「空狀態的呈現」）——排行榜在完全沒有資料時沒有任何可排序的意義。
				<EmptyHistory range={null} />
			) : (
				// 外層不加自己的 padding／grid：橫向捲動由 components/ui/table.tsx 內建的
				// overflow-x-auto 容器提供（design Decision 7），額外的水平內距會把捲動
				// 容器撐破而讓窄螢幕溢出。
				<>
					<HistoryRangeFilter value={selectedRange} onChange={setSelectedRange} />
					<PlayerStatsTable stats={stats} />
				</>
			)}
		</main>
	);
}
