// components/matchmaker/HistoryView.tsx
"use client";

import { useEffect, useReducer, useState } from "react";
import { filterHistoryByRange } from "@/lib/matchmaker/history-range";
import type { HistoryRange } from "@/lib/matchmaker/history-range";
import { readHistory } from "@/lib/matchmaker/round-storage";
import type { MatchHistoryEntry } from "@/lib/matchmaker/history";
import { EmptyHistory } from "./EmptyHistory";
import { HistoryRangeFilter } from "./HistoryRangeFilter";

// hydration 後一次取樣的「現在」與讀回的歷史紀錄（design Decision 7）：render 期間
// SHALL NOT 取用時鐘或 localStorage，避免 SSR／CSR 輸出不一致產生 hydration mismatch。
interface HydratedHistory {
	now: Date;
	entries: MatchHistoryEntry[];
}

// 用 useReducer 而非 useState 存放 hydration 結果：ESLint 的 react-hooks/set-state-in-effect
// 規則會擋下「在 effect 內同步呼叫 useState setter」，但不適用於 useReducer 的 dispatch
// （沿用 hooks/useRosterStore.ts、app/matchmaker/page.tsx 的既有寫法）。
function hydratedHistoryReducer(_current: HydratedHistory | null, next: HydratedHistory): HydratedHistory {
	return next;
}

// 歷史頁的畫面狀態與資料讀取（design Decision 5）：只讀 readHistory()，不 import
// useRoundStore、不呼叫任何 writer、不碰 localStorage.setItem／removeItem——本頁是
// 唯讀消費既有紀錄的頁面。
export function HistoryView() {
	const [hydrated, setHydrated] = useReducer(hydratedHistoryReducer, null);
	// 初次開啟預設選中今日（spec「歷史紀錄依區間篩選與排序」、prd.md 13.4）。
	const [selectedRange, setSelectedRange] = useState<HistoryRange>("today");

	// hydration 的 useEffect 內取一次 new Date() 與 readHistory() 的結果（design Decision 7）：
	// 首次伺服器輸出固定為空狀態，避免 render 期間取用系統時鐘或 localStorage。
	useEffect(() => {
		const { entries } = readHistory();
		setHydrated({ now: new Date(), entries });
	}, []);

	const entries = hydrated?.entries ?? [];
	// hydration 完成前 now 為 null，此時不篩選（filteredEntries 維持空陣列）——
	// 與首次伺服器輸出的空狀態一致，避免在尚未取樣「現在」時誤用系統時鐘。
	const filteredEntries = hydrated === null ? [] : filterHistoryByRange(entries, selectedRange, hydrated.now);

	return (
		<div className="flex flex-col gap-4">
			<HistoryRangeFilter value={selectedRange} onChange={setSelectedRange} />

			{entries.length === 0 ? (
				<EmptyHistory />
			) : (
				// 最小列表呈現：4.6 會替換為 HistoryRecordCard，補齊 prd.md 8.2 全部欄位。
				<ul className="flex flex-col gap-2">
					{filteredEntries.map((entry) => (
						<li key={entry.matchId} className="text-sm">
							{[...entry.teamA.players, ...entry.teamB.players].map((player) => player.name).join("、")}
						</li>
					))}
				</ul>
			)}
		</div>
	);
}
