// 歷史區間切點計算。「現在」一律由呼叫端注入，本模組 SHALL NOT 呼叫 new Date()（無參數）
// 或 Date.now()，理由見 spec「歷史區間切點計算」——PRD 驗算例皆綁定特定日期，
// 函式若自行取系統時鐘就無法被決定性地驗證。

/** `computeRangeCutoffs()` 的回傳形狀：由近至遠的四個切點（毫秒時間戳）。 */
export interface RangeCutoffs {
	c0: number;
	c1: number;
	c2: number;
	c3: number;
}

/**
 * 歷史頁五個區間的具名鍵值，由近至遠排列，供 `rangeOfTime()` 回傳型別、
 * 以及 UI 端逐一渲染分頁時共用同一份順序（design Decision 8）。
 *
 * 順序本身有語意：`rangeOfTime()` 以索引對應切點序列，調整排列會改變區間判定結果。
 */
export const HISTORY_RANGES = ["today", "thisWeek", "thisMonth", "lastMonth", "earlier"] as const;

/** `HISTORY_RANGES` 的元素型別，供 `rangeOfTime()` 作為回傳型別。 */
export type HistoryRange = (typeof HISTORY_RANGES)[number];

/**
 * 取得某年月日在當地時區的 00:00 時間戳。四個切點（今天、本週一、當月 1 日、
 * 上月 1 日）皆是「當地某一天的起點」，抽成單一 helper 讓正規化路徑只有一條——
 * 避免四處各自呼叫 `new Date(y, m, d)` 而在其中一處誤用 `Date.UTC` 或漏寫某個分量。
 */
function startOfLocalDay(year: number, month: number, day: number): number {
	return new Date(year, month, day).getTime();
}

/**
 * 依 prd.md 8.1 由近至遠計算四個區間切點。
 *
 * 四個候選切點（今天、本週一、當月 1 日、上月 1 日）逐層套用 min()：
 * c1 = min(本週一, c0)、c2 = min(當月 1 日, c1)、c3 = min(上月 1 日, c2)。
 * 少了任一層 min()，跨月週會讓「本月」變成左端大於右端的空洞區間，
 * 且與「本週」重疊（design Decision 1）。
 */
export function computeRangeCutoffs(now: Date): RangeCutoffs {
	const year = now.getFullYear();
	const month = now.getMonth();
	const date = now.getDate();

	const c0 = startOfLocalDay(year, month, date);

	// getDay() 以週日為 0，直接減 1 會在週日算出負偏移（日期反而往後推）；
	// (getDay() + 6) % 7 把週一映射為 0、週日映射為 6，讓週日正確歸入六天前的本週一。
	const mondayOffset = (now.getDay() + 6) % 7;
	const monday = startOfLocalDay(year, month, date - mondayOffset);
	const c1 = Math.min(monday, c0);

	const firstOfMonth = startOfLocalDay(year, month, 1);
	const c2 = Math.min(firstOfMonth, c1);

	// month - 1 天然處理跨年：1 月（month === 0）時 month - 1 = -1，
	// new Date() 會自動正規化成去年 12 月（design Decision 2）。
	const firstOfLastMonth = startOfLocalDay(year, month - 1, 1);
	const c3 = Math.min(firstOfLastMonth, c2);

	return { c0, c1, c2, c3 };
}

/**
 * 判定某時間點所屬的歷史區間。由新到遠單向掃描：一旦命中即回傳，
 * 最後一個分支無條件回傳 "earlier"，因此不存在 undefined 或 throw 的路徑，
 * 完整覆蓋是控制流的必然結果而非額外保證（design Decision 8）。
 *
 * 今日刻意不設上界（`>= c0` 即成立），SHALL NOT 改用「現在」當上界——
 * 裝置時鐘超前或紀錄時間有毫秒級誤差時，會讓晚於「現在」的紀錄找不到區間，
 * 違反「完整覆蓋」的硬性要求（design Decision 3）。
 */
export function rangeOfTime(time: number, now: Date): HistoryRange {
	const { c0, c1, c2, c3 } = computeRangeCutoffs(now);

	// 切點依 HISTORY_RANGES 由近至遠的順序排列，逐一比對其左端點；
	// 最末的 "earlier" 沒有對應切點（左端為 -∞），故不列入此陣列，
	// 迴圈找不到命中時直接落到迴圈外的無條件回傳。
	const cutoffs = [c0, c1, c2, c3];

	for (let i = 0; i < cutoffs.length; i++) {
		if (time >= cutoffs[i]) {
			return HISTORY_RANGES[i];
		}
	}

	return HISTORY_RANGES[4];
}
