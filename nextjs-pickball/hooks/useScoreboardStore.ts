// hooks/useScoreboardStore.ts
"use client";

import { useEffect, useReducer, useRef, type Dispatch } from "react";
import { createInitialState, scoreboardReducer } from "@pickball/core/scoreboard/reducer";
import { readScoreboard, writeScoreboard } from "@/lib/scoreboard/storage";
import { useSession } from "@/hooks/useSession";
import { useRemoteScoreboardStore } from "@/hooks/useRemoteScoreboardStore";
import { useRemoteMatchSlotStore } from "@/hooks/useRemoteMatchSlotStore";
import { resolveStorageMode } from "@/lib/sync/storage-mode";
import type { DataStatus } from "@/lib/sync/sync-status";
import type { Action, ScoreboardState } from "@pickball/core/scoreboard/types";

// 對戰場次綁定狀態：
// - standalone：未帶 matchId，沿用獨立計分板（scoreboard:current:v1）
// - pending：帶 matchId 但尚未判定（read effect 尚未執行完成的暫定值）——
//   若省略此態直接以 missing 起手，合法綁定場次會在 read effect 判定完成前
//   先閃一幀「場次已失效」畫面
// - bound：帶 matchId 且分槽（scoreboard:matches:v1）內有對應條目
// - missing：帶 matchId 但分槽內無對應條目，場次已失效（重排或刪除）
export type ScoreboardBindingStatus = "standalone" | "pending" | "bound" | "missing";

// 等待中的 dispatch：不改變狀態、不寫入本機。
function doNothingDispatch(): void {}

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
function useLocalScoreboardStore(matchIdParam?: string | null): readonly [
	ScoreboardState,
	Dispatch<Action>,
	ScoreboardBindingStatus,
	boolean,
] {
	// 空字串（如 `/scoreboard?match=`）正規化為 null，視為未綁定——
	// 正規化交給呼叫端邊界，reducer 不處理這件事。
	const matchId = matchIdParam === "" || matchIdParam === undefined ? null : matchIdParam;

	const [state, dispatch] = useReducer(
		scoreboardReducer,
		undefined,
		(_arg: undefined) => createInitialState(),
	);
	const hasHydratedRef = useRef(false);
	// 本機計分是否已讀入：交給選擇器決定 syncStatus 要回 pending 還是 local。
	// 與 bindingStatus 同理用 useReducer（react-hooks/set-state-in-effect 不適用於 dispatch）；
	// 無資料時不 dispatch HYDRATE，旗標獨立於 state，不會讓寫入 effect 多跑。
	const [hydrated, markHydrated] = useReducer(() => true, false);
	// 未帶 matchId 時綁定狀態在 mount 前就確定為 standalone；帶 matchId 時
	// 初值為 pending（尚未判定），實際結果（bound／missing）留給 read effect 判定，
	// 讀取完成前不寫入任何槽（write effect 另外受 hasHydratedRef 守門，
	// 故此預設值不影響 mount 前的寫入行為）。
	// 用 useReducer 而非 useState 存放 bindingStatus：ESLint 的
	// react-hooks/set-state-in-effect 規則會擋下「在 effect 內同步呼叫 useState
	// setter」，但不適用於 useReducer 的 dispatch（與下方 HYDRATE 的既有寫法一致）。
	const [bindingStatus, setBindingStatus] = useReducer(
		(_current: ScoreboardBindingStatus, next: ScoreboardBindingStatus) => next,
		matchId === null ? "standalone" : "pending",
	);

	useEffect(() => {
		if (!hasHydratedRef.current) return;
		// pending／missing 狀態下尚未判定或場次已失效，SHALL NOT 建立新條目，
		// 也 SHALL NOT 寫入獨立槽（spec 的 SHALL NOT 條款）——這個 guard 必須在
		// hook 層，storage.ts 的 writeScoreboard 只看 state.matchId，
		// 無法得知分槽是否存在或是否已判定完成。
		if (bindingStatus === "pending" || bindingStatus === "missing") return;
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
		// 無論有沒有本機資料都標記，讀入後選擇器才會從 pending 轉為 local
		markHydrated();
		return () => {
			// Strict Mode 在 dev 下會 unmount 再重新 mount，重置 ref 使下一次 mount
			// 的 write effect 不會以初始 state 覆蓋 localStorage。
			hasHydratedRef.current = false;
		};
		// 頁面以 key={matchId ?? "standalone"} 強制 remount（app/scoreboard/page.tsx），
		// matchId 在單一 mount 生命週期內不可能變動，列入 deps 只會多一次無意義的重讀。
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	return [state, dispatch, bindingStatus, hydrated] as const;
}

// 儲存模式選擇器：三個 hook 每次 render 都呼叫（hooks 規則），未被選用的一方不發請求。
// 已登入時：未綁定場次走獨立計分板的雲端實作，帶 matchId 走雲端分槽。
// 儲存模式未定（pending）時不交出本機計分，也不啟用雲端；本機模式在本機計分讀入前同樣回報 pending。
export function useScoreboardStore(matchIdParam?: string | null): readonly [
	ScoreboardState,
	Dispatch<Action>,
	ScoreboardBindingStatus,
	DataStatus,
] {
	const session = useSession();
	const matchId = matchIdParam === "" || matchIdParam === undefined ? null : matchIdParam;
	const local = useLocalScoreboardStore(matchIdParam);
	const mode = resolveStorageMode(session);
	const isRemoteMode = mode === "remote";
	// 雲端 store 以這個帳號為世代界線；loading 或訪客時為 null（此時也不會啟用雲端）
	const userId = session.status === "ready" ? (session.user?.id ?? null) : null;
	const remote = useRemoteScoreboardStore({
		enabled: isRemoteMode && matchId === null,
		userId,
		onUnauthorized: session.refresh,
	});
	// matchId 為 null 時 enabled 恆為 false，傳入的字串不會被使用
	const remoteSlot = useRemoteMatchSlotStore({
		enabled: isRemoteMode && matchId !== null,
		matchId: matchId ?? "",
		userId,
		onUnauthorized: session.refresh,
	});

	if (mode === "pending") {
		// 不沿用未啟用的雲端計分板 hook：它在未啟用時回傳的是真正的 dispatch。
		// 綁定狀態用 pending 而非 missing，否則帶 ?match= 的已登入者會先閃「場次已失效」。
		let pendingBinding: ScoreboardBindingStatus = "pending";
		if (matchId === null) {
			pendingBinding = "standalone";
		}
		return [createInitialState(), doNothingDispatch, pendingBinding, "pending"] as const;
	}
	if (mode === "remote") {
		if (matchId === null) {
			return [remote[0], remote[1], "standalone", remote[2]] as const;
		}
		return remoteSlot;
	}
	const [localState, localDispatch, localBinding, hydrated] = local;
	let localStatus: DataStatus = "local";
	if (!hydrated) {
		localStatus = "pending";
	}
	return [localState, localDispatch, localBinding, localStatus] as const;
}
