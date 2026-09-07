"use client";

import { useEffect, useState } from "react";
import {
	remainingSeconds as computeRemainingSeconds,
	isExpired as computeIsExpired,
} from "@/lib/matchmaker/round-timer";
import type { RoundTimer } from "@/lib/matchmaker/round-types";

interface UseRoundTimerResult {
	remainingSeconds: number | null;
	expired: boolean;
}

// 每秒 tick 的計時 hook——本 change 唯一呼叫 setInterval／new Date() 的位置
// （design Decision 5、6；specs/match-stage/spec.md「計時器顯示與時間到提示」）。
// 倒數與到期判定委派給 lib/matchmaker/round-timer.ts 的純函式，本檔只負責
// 「現在時間」的取樣與驅動 React 重新 render，SHALL NOT 自行判斷到期或格式化。
export function useRoundTimer(timer: RoundTimer): UseRoundTimerResult {
	// 初始值就是「現在」而非空字串或固定字串，否則畫面第一秒會沒有剩餘時間可顯示，
	// 要等第一次 tick（最多一秒後）才有值。
	const [nowIso, setNowIso] = useState<string>(() => new Date().toISOString());

	// 依賴陣列拆成 startedAt／durationMinutes 兩個原始值，不放整個 timer 物件——
	// 呼叫端多半是每次 render 都建立新的 timer 物件參考（例如 round?.timer ?? null
	// 這種寫法），用物件本身當依賴會讓 interval 反覆清除又重建。
	const startedAt = timer?.startedAt ?? null;
	const durationMinutes = timer?.durationMinutes ?? null;

	useEffect(() => {
		// timer 為 null 或尚未開始（startedAt 為 null）時沒有「現在時間」可倒數，
		// 啟動 interval 也只會白白佔用一個永遠算出 null 的計時器。
		if (startedAt === null) {
			return;
		}
		const intervalId = setInterval(() => {
			setNowIso(new Date().toISOString());
		}, 1000);
		return () => clearInterval(intervalId);
	}, [startedAt, durationMinutes]);

	return {
		remainingSeconds: computeRemainingSeconds(timer, nowIso),
		expired: computeIsExpired(timer, nowIso),
	};
}
