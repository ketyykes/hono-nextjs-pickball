// components/matchmaker/RoundTimerBanner.tsx
"use client";

import { useRoundTimer } from "@/hooks/useRoundTimer";
import { formatRemaining } from "@/lib/matchmaker/round-timer";
import type { RoundTimer } from "@/lib/matchmaker/round-types";

export interface RoundTimerBannerProps {
	timer: RoundTimer;
}

// 對戰頁的倒數顯示（spec「計時器顯示與時間到提示」）：只負責畫面呈現，
// 「現在時間」的取樣與到期判定一律委派 useRoundTimer／round-timer.ts，
// 本檔 SHALL NOT 自行呼叫 setInterval 或讀取當下時間。
export function RoundTimerBanner({ timer }: RoundTimerBannerProps) {
	// React hooks 規則：不可在條件式之後才呼叫，故一律先呼叫 useRoundTimer——
	// 該 hook 本身已容許 timer 為 null 或尚未開始（回傳 remainingSeconds: null、
	// expired: false），是否要回傳 null 交給下方的早退判斷。
	const { remainingSeconds } = useRoundTimer(timer);

	// timer 不存在或尚未開始（startedAt 為 null）時沒有倒數可顯示。
	if (timer === null || timer.startedAt === null) {
		return null;
	}

	// remainingSeconds 為 null 代表「無法計算」而非「剩餘 0 秒」（round-timer.ts 的既有
	// 語意）。走到這裡 timer 與 startedAt 皆已非 null，remainingSeconds 理論上不會是
	// null；`?? 0` 只是型別收斂用的防線（task 11.2 明文如此寫法），實際執行不會被觸發。
	return <p>{formatRemaining(remainingSeconds ?? 0)}</p>;
}
