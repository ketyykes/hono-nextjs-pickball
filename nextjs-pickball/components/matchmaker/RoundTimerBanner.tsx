// components/matchmaker/RoundTimerBanner.tsx
"use client";

import { useEffect, useRef } from "react";
import { useRoundTimer } from "@/hooks/useRoundTimer";
import { formatRemaining } from "@/lib/matchmaker/round-timer";
import { playTimerExpiredChime } from "@/lib/matchmaker/round-timer-sound";
import { ROUND_TIMER_EXPIRED_MESSAGE } from "@pickball/core/matchmaker/labels";
import type { RoundTimer } from "@pickball/core/matchmaker/round-types";

// 欄位不加 readonly（比照 components/matchmaker/ 既有介面，見 ExportActions.tsx）。
export interface RoundTimerBannerProps {
	timer: RoundTimer;
	/**
	 * 時間到提示音的注入點；省略時使用 playTimerExpiredChime（design Decision 6）。
	 *
	 * 「可選注入 prop」這個角色比照 M9 ExportActions 的 `printer?` 先例，但型別刻意收窄為
	 * `() => void` 而非該處的 `unknown`：`printer` 用 `unknown` 是為了讓「呼叫端傳入非函式值」
	 * 這條路徑留在 requestPrint 的執行期判定裡（收窄型別會讓那條路徑變成型別錯誤而測不到），
	 * 本 prop 沒有對應的執行期判定、只是直接呼叫並列入依賴陣列，用精確型別才是同一個先例的
	 * 正確套用而非偏離。
	 *
	 * 預設值直接寫在解構參數上，而非 `playChime ?? playTimerExpiredChime` 這種呼叫端才決議
	 * 的寫法——模組層級具名函式的參考每次 render 都相同，依賴陣列才不會每次都誤判成「變了」。
	 * 注意這只是避免 effect 白跑：真正擋住重複播放的是下方的 useRef 旗標，不是這裡的參考
	 * 穩定性（實測把預設值換成箭頭函式包裝，播放次數不變）。
	 */
	playChime?: () => void;
}

// 對戰頁的倒數顯示與時間到提示（spec「計時器顯示與時間到提示」）：只負責畫面呈現，
// 「現在時間」的取樣與到期判定一律委派 useRoundTimer／round-timer.ts，
// 本檔 SHALL NOT 自行呼叫 setInterval 或讀取當下時間。
export function RoundTimerBanner({
	timer,
	playChime = playTimerExpiredChime,
}: RoundTimerBannerProps) {
	// React hooks 規則：不可在條件式之後才呼叫，故一律先呼叫 useRoundTimer——
	// 該 hook 本身已容許 timer 為 null 或尚未開始（回傳 remainingSeconds: null、
	// expired: false），是否要回傳 null 交給下方的早退判斷。
	const { remainingSeconds, expired } = useRoundTimer(timer);

	// 「同一次到期只播放一次」的去重旗標：記錄「已經為哪一個 startedAt 播放過」，
	// 而不是單純的 boolean。用 startedAt（而非 boolean）當旗標值的理由是
	// 「timer 換成另一個計時器時該不該重置」——答案是該重置：旗標的語意是
	// 「這一次計時器的這一次到期有沒有播過」，同一輪重新產生新計時器（新的
	// startedAt）後再次到期時，仍應該播放一次，不能被上一個計時器留下的
	// 「已播過」狀態永久靜音。用 startedAt 當旗標值等於把「换了新計時器」與
	// 「重置去重狀態」綁在同一個值上，不需要額外一個 useEffect 專門做重置。
	const playedForStartedAtRef = useRef<string | null>(null);

	useEffect(() => {
		if (!expired) {
			return;
		}
		const startedAt = timer?.startedAt ?? null;
		if (playedForStartedAtRef.current === startedAt) {
			return;
		}
		playedForStartedAtRef.current = startedAt;
		playChime();
	}, [expired, timer?.startedAt, playChime]);

	// timer 不存在或尚未開始（startedAt 為 null）時沒有倒數可顯示。
	if (timer === null || timer.startedAt === null) {
		return null;
	}

	if (expired) {
		// 「時間到」大字 MUST 為靜態文字，零任何 CSS 動畫或 animate-* utility
		// （design Decision 7）；role="alert" 隱含 aria-live="assertive"，
		// 已足以讓讀屏即時播報，本區塊 SHALL NOT 另外加 aria-live 屬性。
		return (
			<div role="alert" className="flex flex-col gap-1">
				<p className="text-4xl font-bold">時間到</p>
				<p className="text-sm text-muted-foreground">{ROUND_TIMER_EXPIRED_MESSAGE}</p>
			</div>
		);
	}

	// remainingSeconds 為 null 代表「無法計算」而非「剩餘 0 秒」（round-timer.ts 的既有
	// 語意）。走到這裡 timer 與 startedAt 皆已非 null 且尚未到期，remainingSeconds
	// 理論上不會是 null；`?? 0` 只是型別收斂用的防線（task 11.2 明文如此寫法），
	// 實際執行不會被觸發。
	return <p>{formatRemaining(remainingSeconds ?? 0)}</p>;
}
