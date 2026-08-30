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
 * 依 prd.md 8.1 由近至遠計算四個區間切點。
 *
 * 四個候選切點（今天、本週一、當月 1 日、上月 1 日）逐層套用 min()：
 * c1 = min(本週一, c0)、c2 = min(當月 1 日, c1)、c3 = min(上月 1 日, c2)。
 * 少了任一層 min()，跨月週會讓「本月」變成左端大於右端的空洞區間，
 * 且與「本週」重疊（design Decision 1）。
 */
export function computeRangeCutoffs(now: Date): RangeCutoffs {
	const c0 = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

	// getDay() 以週日為 0，直接減 1 會在週日算出負偏移（日期反而往後推）；
	// (getDay() + 6) % 7 把週一映射為 0、週日映射為 6，讓週日正確歸入六天前的本週一。
	const mondayOffset = (now.getDay() + 6) % 7;
	const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - mondayOffset).getTime();
	const c1 = Math.min(monday, c0);

	const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
	const c2 = Math.min(firstOfMonth, c1);

	const firstOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();
	const c3 = Math.min(firstOfLastMonth, c2);

	return { c0, c1, c2, c3 };
}
