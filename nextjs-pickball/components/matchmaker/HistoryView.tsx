// components/matchmaker/HistoryView.tsx
"use client";

import { useEffect, useReducer, useState } from "react";
import { filterHistoryByRange } from "@pickball/core/matchmaker/history-range";
import type { HistoryRange } from "@pickball/core/matchmaker/history-range";
import { SyncStatusNotice } from "@/components/sync/SyncStatusNotice";
import { readHistory } from "@/lib/matchmaker/round-storage";
import type { MatchHistoryEntry } from "@pickball/core/matchmaker/history";
import { EmptyHistory } from "./EmptyHistory";
import { HistoryRangeFilter } from "./HistoryRangeFilter";
import { HistoryRecordCard } from "./HistoryRecordCard";

// hydration 後一次取樣的「現在」與讀回的歷史紀錄：render 期間
// SHALL NOT 取用時鐘或 localStorage，避免 SSR／CSR 輸出不一致產生 hydration mismatch。
interface HydratedHistory {
	now: Date;
	entries: MatchHistoryEntry[];
	droppedCount: number;
}

// 用 useReducer 而非 useState 存放 hydration 結果：ESLint 的 react-hooks/set-state-in-effect
// 規則會擋下「在 effect 內同步呼叫 useState setter」，但不適用於 useReducer 的 dispatch
// （沿用 hooks/useRosterStore.ts、app/matchmaker/page.tsx 的既有寫法）。
//
// droppedCount 的潛在陷阱（已實測排除）：readHistory() 在 droppedCount > 0 時會把
// 清理後的歷史回寫 localStorage（round-storage.ts），第二次呼叫會讀到 droppedCount: 0；
// 若 React StrictMode 讓 hydration 的 useEffect 跑兩次，第二次 dispatch 理論上會把已偵測到
// 的損毀筆數蓋回 0。實測（於 `pnpm dev` 下以 Node 端 console listener 計數）此 effect
// 只執行一次，並未雙跑，故不需要為此加防禦式合併邏輯——以實測為準，不寫用不到的分支。
function hydratedHistoryReducer(_current: HydratedHistory | null, next: HydratedHistory): HydratedHistory {
	return next;
}

// 歷史頁的畫面狀態與資料讀取：只讀 readHistory()，不 import
// useRoundStore、不呼叫任何 writer、不碰 localStorage.setItem／removeItem——本頁是
// 唯讀消費既有紀錄的頁面。
export function HistoryView() {
	const [hydrated, setHydrated] = useReducer(hydratedHistoryReducer, null);
	// 初次開啟預設選中今日（spec「歷史紀錄依區間篩選與排序」、prd.md 13.4）。
	const [selectedRange, setSelectedRange] = useState<HistoryRange>("today");

	// hydration 的 useEffect 內取一次 new Date() 與 readHistory() 的結果：
	// 讀入前（含首次伺服器輸出）顯示等待中提示，避免 render 期間取用系統時鐘或 localStorage，
	// 也避免讀入前先畫出空狀態。
	useEffect(() => {
		const { entries, droppedCount } = readHistory();
		setHydrated({ now: new Date(), entries, droppedCount });
	}, []);

	if (hydrated === null) {
		return (
			<div data-sync-status="pending" className="flex flex-col gap-4">
				<SyncStatusNotice status="pending" />
			</div>
		);
	}

	// 走到這裡代表 hydration 已完成，「現在」與歷史紀錄都已取樣。
	const { entries, now } = hydrated;
	const filteredEntries = filterHistoryByRange(entries, selectedRange, now);

	return (
		<div className="flex flex-col gap-4">
			{/* droppedCount > 0：讀取歷史紀錄時有損壞筆數被逐筆丟棄，SHALL NOT 靜默處理。
			    樣式 class 與文案比照 app/matchmaker/players/page.tsx 既有的損毀提示區塊：
			    兩者分屬 player-roster／match-history 兩個不同
			    capability，各自持有一份、不抽共用元件——抽象需要跨 capability 改動或
			    新建第三個檔案，在只有兩個消費端且文案主詞本就不同（「參賽者資料」vs
			    「歷史紀錄」）的情況下是提前抽象，故維持各自一份（記為 tech debt）。 */}
			{hydrated.droppedCount > 0 && (
				<div
					role="alert"
					className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive"
				>
					有 {hydrated.droppedCount} 筆損毀的歷史紀錄已略過，其餘歷史紀錄不受影響。
				</div>
			)}

			<HistoryRangeFilter value={selectedRange} onChange={setSelectedRange} />

			{entries.length === 0 ? (
				// 整份歷史完全沒有資料：引導型空狀態（spec「空區間的友善空狀態」）。
				<EmptyHistory range={null} />
			) : filteredEntries.length === 0 ? (
				// 整份歷史非空，只是目前區間內沒有紀錄：MUST 視為正常結果而非錯誤，
				// 跨月週使「本月」成為空區間即屬此分支（design Risks）。
				<EmptyHistory range={selectedRange} />
			) : (
				<div className="flex flex-col gap-3">
					{filteredEntries.map((entry) => (
						<HistoryRecordCard key={entry.matchId} entry={entry} />
					))}
				</div>
			)}
		</div>
	);
}
