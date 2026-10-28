// components/matchmaker/HistoryModeSwitch.tsx
"use client";

import { useSession } from "@/hooks/useSession";
import { resolveStorageMode } from "@/lib/sync/storage-mode";
import { HistoryView } from "./HistoryView";
import { RemoteHistoryView } from "./RemoteHistoryView";

// 歷史頁的模式分支：讓 app/matchmaker/history/page.tsx 維持 server component，
// client 邊界只放在這個小元件。雲端元件只在 remote 時掛載——RemoteHistoryView 在
// userId 為 null 時會顯示引導型空狀態，不該在 session 載入中或訪客時出現。
export function HistoryModeSwitch() {
	const mode = resolveStorageMode(useSession());
	return mode === "remote" ? <RemoteHistoryView /> : <HistoryView />;
}
