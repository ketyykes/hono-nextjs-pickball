// 回合計時器的倒數與到期判定——純函式（M14，spec round-lifecycle「回合計時器」）。
// 「現在時間」一律由呼叫端以 ISO 字串（nowIso）注入，本檔 SHALL NOT 呼叫
// new Date()／Date.now()／setInterval：高頻率（每秒）呼叫端才能各自決定何時取樣，
// 且同一組輸入必須產生同一份輸出以利測試（design Decision 5、6）。
//
// 三個函式的參數只有 timer／nowIso／seconds，刻意不接受 Round 或 RoundMatch[]——
// 「時間到不自動結束任何場次」是 spec 的 MUST NOT 條款，讓型別簽章上就沒有 matches
// 可碰，比「寫測試斷言沒有被改動」更強的保證（design Decision 5）。

import type { RoundTimer } from "./round-types";

/**
 * 剩餘秒數。timer 為 null 或尚未開始（startedAt 為 null）時回傳 null，
 * 代表「無法計算剩餘時間」而非「剩餘 0 秒」——0 秒有「已到期」的語意，
 * 兩者不應共用同一個回傳值。
 *
 * 取整採 Math.ceil(剩餘毫秒 / 1000)：使倒數在跨過整秒之前維持前一秒的顯示
 * （例如剛好經過 0.4 秒時仍顯示剩餘 600 秒而非提前跳成 599），避免計時器顯示
 * 在毫秒級的取樣時間點上不必要地跳動。
 *
 * nowIso 早於 startedAt（時鐘倒退或呼叫端注入錯誤時間）時，計算出的剩餘毫秒會
 * 超過 durationMinutes * 60 * 1000；spec 未規定此情況的行為，這裡選擇夾在
 * durationMinutes * 60（與正常路徑的「不為負」夾值同一種防禦性做法：兩端都夾，
 * 讓本函式的回傳值永遠落在合法的剩餘秒數值域內，呼叫端不必再自行防呆一次）。
 */
export function remainingSeconds(
	timer: RoundTimer,
	nowIso: string,
): number | null {
	if (timer === null || timer.startedAt === null) {
		return null;
	}
	const durationSeconds = timer.durationMinutes * 60;
	const startedAtMs = new Date(timer.startedAt).getTime();
	const nowMs = new Date(nowIso).getTime();
	const remainingMs = timer.durationMinutes * 60 * 1000 - (nowMs - startedAtMs);
	const remaining = Math.ceil(remainingMs / 1000);
	return Math.max(0, Math.min(durationSeconds, remaining));
}

/**
 * 是否已到期（剩餘秒數為 0）。timer 為 null 或尚未開始時回傳 false——尚未開始的
 * 計時器談不上「到期」。內部重用 remainingSeconds 而非另寫一份剩餘時間計算，
 * 避免兩處各自實作後在邊界（剛好到期）產生不一致的判定。
 */
export function isExpired(timer: RoundTimer, nowIso: string): boolean {
	return remainingSeconds(timer, nowIso) === 0;
}

/**
 * 剩餘秒數格式化為兩位數的 mm:ss。padStart 只保證兩位數，未防禦 minutes 超過
 * 99 的情況——本 change 的計時長度上限為 20 分鐘（ROUND_TIMER_DURATION_OPTIONS），
 * 呼叫端（remainingSeconds）的回傳值必落在 [0, 1200] 秒內，不會產生三位數分鐘，
 * 額外防呆屬於臆測需求（working-principles Rule 2：不做超出範圍的推測性功能）。
 */
export function formatRemaining(seconds: number): string {
	const minutes = Math.floor(seconds / 60);
	const secs = seconds % 60;
	return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}
