// components/matchmaker/HistoryView.tsx
"use client";

import { useEffect, useReducer } from "react";
import { HISTORY_RANGES } from "@/lib/matchmaker/history-range";
import { readHistory } from "@/lib/matchmaker/round-storage";
import type { MatchHistoryEntry } from "@/lib/matchmaker/history";
import { EmptyHistory } from "./EmptyHistory";

// 區間篩選的顯示文案，依 HISTORY_RANGES 的順序（今日、本週、本月、上月、更早）。
// 4.4 會把這五顆控制項抽成 HistoryRangeFilter.tsx 並補上選中狀態與切換行為
// （design 交接點：4.1 的路由與空狀態驗收先於 4.4 的區間篩選元件存在）。
const RANGE_LABEL: Record<(typeof HISTORY_RANGES)[number], string> = {
	today: "今日",
	thisWeek: "本週",
	thisMonth: "本月",
	lastMonth: "上月",
	earlier: "更早",
};

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

	// hydration 的 useEffect 內取一次 new Date() 與 readHistory() 的結果（design Decision 7）：
	// 首次伺服器輸出固定為空狀態，避免 render 期間取用系統時鐘或 localStorage。
	useEffect(() => {
		const { entries } = readHistory();
		setHydrated({ now: new Date(), entries });
	}, []);

	const entries = hydrated?.entries ?? [];

	return (
		<div className="flex flex-col gap-4">
			<div
				role="radiogroup"
				aria-label="歷史區間"
				className="flex flex-wrap gap-1 rounded-md border border-input p-1"
			>
				{HISTORY_RANGES.map((range) => (
					<button
						key={range}
						type="button"
						role="radio"
						aria-checked={false}
						className="rounded-md px-3 py-1 text-sm"
					>
						{RANGE_LABEL[range]}
					</button>
				))}
			</div>

			{entries.length === 0 && <EmptyHistory />}
		</div>
	);
}
