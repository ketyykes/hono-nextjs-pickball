"use client";

import { useSyncExternalStore } from "react";
import {
	getServerSnapshot,
	getSnapshot,
	refresh,
	subscribe,
	type SessionSnapshot,
} from "@/lib/auth/session-store";

export type UseSessionResult = SessionSnapshot & {
	refresh: () => Promise<void>;
	/**
	 * 伺服器端 render 與 hydration 那次 render 為 false，之後為 true。
	 * 型別為可省略：既有測試以不含此欄位的物件 mock useSession，省略視同 true。
	 */
	hydrated?: boolean;
};

// 不訂閱任何來源：只借 useSyncExternalStore 的 server／client 快照差異判斷是否已 hydration
function subscribeNever(): () => void {
	return () => {};
}

function getHydratedSnapshot(): boolean {
	return true;
}

function getHydratedServerSnapshot(): boolean {
	return false;
}

/** 讀取全頁共用的 session store；登入、登出後由呼叫端觸發 refresh。 */
export function useSession(): UseSessionResult {
	const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
	const hydrated = useSyncExternalStore(
		subscribeNever,
		getHydratedSnapshot,
		getHydratedServerSnapshot,
	);
	return { ...snapshot, refresh, hydrated };
}
