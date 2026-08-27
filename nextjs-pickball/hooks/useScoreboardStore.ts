// hooks/useScoreboardStore.ts
"use client";

import { useEffect, useReducer, useRef, useState, type Dispatch } from "react";
import { createInitialState, scoreboardReducer } from "@/lib/scoreboard/reducer";
import { readScoreboard, writeScoreboard } from "@/lib/scoreboard/storage";
import type { Action, ScoreboardState } from "@/lib/scoreboard/types";

// 對戰場次綁定狀態：
// - standalone：未帶 matchId，沿用獨立計分板（scoreboard:current:v1）
// - bound：帶 matchId 且分槽（scoreboard:matches:v1）內有對應條目
// - missing：帶 matchId 但分槽內無對應條目，場次已失效（重排或刪除）
export type ScoreboardBindingStatus = "standalone" | "bound" | "missing";

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
export function useScoreboardStore(matchIdParam?: string | null): readonly [
	ScoreboardState,
	Dispatch<Action>,
	ScoreboardBindingStatus,
] {
	// 空字串（如 `/scoreboard?match=`）正規化為 null，視為未綁定——
	// 正規化交給呼叫端邊界，reducer 不處理這件事（見 design 8-D）。
	const matchId = matchIdParam === "" || matchIdParam === undefined ? null : matchIdParam;

	const [state, dispatch] = useReducer(
		scoreboardReducer,
		undefined,
		(_arg: undefined) => createInitialState(),
	);
	const hasHydratedRef = useRef(false);
	// 未帶 matchId 時綁定狀態在 mount 前就確定為 standalone；帶 matchId 時
	// 保守預設為 missing，實際結果留給 read effect 判定，讀取完成前不寫入任何槽
	// （write effect 另外受 hasHydratedRef 守門，故此預設值不影響 mount 前的寫入行為）。
	const [bindingStatus, setBindingStatus] = useState<ScoreboardBindingStatus>(
		matchId === null ? "standalone" : "missing",
	);

	useEffect(() => {
		if (!hasHydratedRef.current) return;
		// missing 狀態下場次已失效，SHALL NOT 建立新條目，也 SHALL NOT 寫入獨立槽
		// （spec 的 SHALL NOT 條款）——這個 guard 必須在 hook 層，storage.ts 的
		// writeScoreboard 只看 state.matchId，無法得知分槽是否存在。
		if (bindingStatus === "missing") return;
		writeScoreboard(state);
	}, [state, bindingStatus]);

	useEffect(() => {
		// matchId 依賴陣列刻意留空：matchId 在單一頁面生命週期內不會變動
		// （由頁面 mount 時的 URL search param 決定），故只需在 mount 時判定一次。
		if (matchId === null) {
			const loaded = readScoreboard(null);
			if (loaded) dispatch({ type: "HYDRATE", state: loaded });
			setBindingStatus("standalone");
		} else {
			const loaded = readScoreboard(matchId);
			if (loaded) {
				dispatch({ type: "HYDRATE", state: loaded });
				setBindingStatus("bound");
			} else {
				setBindingStatus("missing");
			}
		}
		hasHydratedRef.current = true;
		return () => {
			// Strict Mode 在 dev 下會 unmount 再重新 mount，重置 ref 使下一次 mount
			// 的 write effect 不會以初始 state 覆蓋 localStorage。
			hasHydratedRef.current = false;
		};
	}, []);

	return [state, dispatch, bindingStatus] as const;
}
