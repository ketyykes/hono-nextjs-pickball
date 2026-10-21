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
};

/** 讀取全頁共用的 session store；登入、登出後由呼叫端觸發 refresh。 */
export function useSession(): UseSessionResult {
	const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
	return { ...snapshot, refresh };
}
