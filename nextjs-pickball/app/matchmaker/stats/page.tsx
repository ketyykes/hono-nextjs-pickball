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
	//
	// 與 HistoryView.tsx 的差異是刻意留下的、而非疏漏（Stage 2 review 裁決）：該元件
	// 自己呼叫 readHistory()，故 M7 design Decision 7 要求它把「現在」在 hydration
	// 取樣一次並存進 state，matchmaker-history.spec.ts 也以 page.clock 實測鎖住那個
	// 「只取樣一次」的保證。本頁的 history 由 store 注入，不需要那條保證，因此每次
	// render 重取時鐘——代價是本頁跨午夜後的下一次 render 會把「今日」重新判定，
	// 歷史頁則維持開頁當下的判定。兩者皆未被 spec 規範，此處記下以免被誤讀為不一致。
	//
	// 這裡不包 useMemo：現有依賴（history／selectedRange）本來就是唯一會觸發 render 的
	// 輸入，省不下實質重算；而 useMemo 一旦把 new Date() 關進依賴陣列，等於改變時鐘的
	// 取樣時機，那是行為變更而非最佳化。
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
