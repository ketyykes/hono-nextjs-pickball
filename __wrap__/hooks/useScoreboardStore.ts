// hooks/useScoreboardStore.ts
"use client";

import { useEffect, useReducer, useRef, type Dispatch } from "react";
import { createInitialState, scoreboardReducer } from "@/lib/scoreboard/reducer";
import { readScoreboard, writeScoreboard } from "@/lib/scoreboard/storage";
import type { Action, ScoreboardState } from "@/lib/scoreboard/types";

// 整合 reducer 與 localStorage：
// - 初始用 createInitialState 避免 SSR/CSR 不一致
// - mount 後讀 localStorage 並 dispatch HYDRATE
// - state 變動時寫回 localStorage
//
// Effect 順序刻意設計：
// write effect 放前面、read effect 放後面，並用 ref 守門。
// 這樣 mount 時：write effect 先跑（ref=false 跳過）→ read effect 後跑（讀儲存值並
// dispatch HYDRATE，最後 ref=true）→ 觸發 re-render → write effect 重跑（ref=true，
// 把已 hydrate 的 state 寫回）。避免 read 前就被 write 用初始 state 覆蓋的競態。
//
// React Strict Mode 處理：
// read effect cleanup 時將 ref reset 為 false，使 Strict Mode 第二次 mount 時
// write effect 正確跳過（Strict Mode 重置 state 為初始值，若此時 write effect 執行
// 會以 us:0 覆蓋 localStorage 中已儲存的值）。
export function useScoreboardStore(): readonly [
	ScoreboardState,
	Dispatch<Action>,
] {
	const [state, dispatch] = useReducer(
		scoreboardReducer,
		undefined,
		(_arg: undefined) => createInitialState(),
	);
	const hasHydratedRef = useRef(false);

	useEffect(() => {
		if (!hasHydratedRef.current) return;
		writeScoreboard(state);
	}, [state]);

	useEffect(() => {
		const loaded = readScoreboard();
		if (loaded) dispatch({ type: "HYDRATE", state: loaded });
		hasHydratedRef.current = true;
		return () => {
			// Strict Mode 在 dev 下會 unmount 再重新 mount，重置 ref 使下一次 mount
			// 的 write effect 不會以初始 state 覆蓋 localStorage。
			hasHydratedRef.current = false;
		};
	}, []);

	return [state, dispatch] as const;
}
