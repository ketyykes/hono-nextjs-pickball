"use client";

import { useEffect, useState } from "react";
import {
	remainingSeconds as computeRemainingSeconds,
	isExpired as computeIsExpired,
} from "@/lib/matchmaker/round-timer";
import type { RoundTimer } from "@pickball/core/matchmaker/round-types";

interface UseRoundTimerResult {
	remainingSeconds: number | null;
	expired: boolean;
}

// 每秒 tick 的計時 hook——本專案唯一以 setInterval 持續取樣目前時間的位置
// （見 openspec/specs/match-stage/spec.md「計時器顯示與時間到提示」）。
// startTimer 的一次性 now 由 useRoundStore 注入（比照既有 generateRound／submitScore），
// 不在此清單內。
// 倒數與到期判定委派給 lib/matchmaker/round-timer.ts 的純函式，本檔只負責
// 「現在時間」的取樣與驅動 React 重新 render，SHALL NOT 自行判斷到期或格式化。
export function useRoundTimer(timer: RoundTimer): UseRoundTimerResult {
	// 每次 tick 都重新取樣「絕對時間」，而不是把剩餘秒數做成累加式計數器（remaining -= 1）：
	// 剩餘秒數永遠由 startedAt 與當下時間現算，因此背景分頁被瀏覽器節流（setInterval 被
	// 拉長到數秒甚至一分鐘一次）、或 setInterval 本身不保證精確 1000ms 的漂移，都只影響
	// 「畫面多久更新一次」，不影響「更新時算出的值對不對」——切回前景的第一次 tick 就會
	// 自我校正回正確秒數。累加式計數器則會把每一次被跳過或延遲的 tick 累積成永久誤差，
	// 那才需要 requestAnimationFrame 或自我校正的 setTimeout 鏈，本實作不需要。
	//
	// 初始值必須是「現在」而非任何固定值：計時已開始一段時間後才掛載本 hook 時，
	// 第一次 render 就得算出正確的剩餘秒數。用固定的過去時間會被 remainingSeconds 的
	// 上限夾值夾成完整長度，錯得很像正常值，且要等第一次 tick（最多一秒後）才修正。
	const [nowIso, setNowIso] = useState<string>(() => new Date().toISOString());

	// 依賴陣列只放 startedAt 這個原始值，不放整個 timer 物件——呼叫端多半是每次 render
	// 都建立新的 timer 物件參考（例如 round?.timer ?? null 這種寫法），用物件本身當依賴
	// 會讓 interval 反覆清除又重建。durationMinutes 同樣刻意不列入：effect 內部不讀它，
	// 而剩餘秒數是每次 render 以當下的 timer 現算，改變計時長度時畫面靠 re-render 就會
	// 更新，不需要連帶清除並重建 interval。
	const startedAt = timer?.startedAt ?? null;

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
	}, [startedAt]);

	return {
		remainingSeconds: computeRemainingSeconds(timer, nowIso),
		expired: computeIsExpired(timer, nowIso),
	};
}
