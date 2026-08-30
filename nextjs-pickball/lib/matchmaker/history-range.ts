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
 * 此版本先各自獨立計算四個切點，尚未套用 min() —— 跨月週時 c2（當月 1 日）
 * 可能晚於 c1（本週一），單調性由後續步驟補上（design Decision 1）。
 */
export function computeRangeCutoffs(now: Date): RangeCutoffs {
	const c0 = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
	const mondayOffset = now.getDay() - 1;
	const c1 = new Date(now.getFullYear(), now.getMonth(), now.getDate() - mondayOffset).getTime();
	const c2 = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
	const c3 = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();

	return { c0, c1, c2, c3 };
}
