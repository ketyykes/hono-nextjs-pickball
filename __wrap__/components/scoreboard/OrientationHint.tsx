// components/scoreboard/OrientationHint.tsx
"use client";

import { useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

const DISMISS_KEY = "scoreboard:hint-dismissed";

// sessionStorage 沒有跨 tab event；本元件透過 listener Set 自行通知 React
const listeners = new Set<() => void>();

function subscribe(callback: () => void): () => void {
	listeners.add(callback);
	return () => {
		listeners.delete(callback);
	};
}

function getClientSnapshot(): boolean {
	return sessionStorage.getItem(DISMISS_KEY) === "1";
}

// server 端永遠回 false，與 client first render 對齊以避免 hydration mismatch
function getServerSnapshot(): boolean {
	return false;
}

function dismiss(): void {
	sessionStorage.setItem(DISMISS_KEY, "1");
	for (const cb of listeners) cb();
}

interface OrientationHintProps {
	visible: boolean; // 由父層依 orientation 決定
}

// 直式時顯示的提示橫幅；關閉狀態存 sessionStorage，分頁存活期間不再顯示。
// 用 useSyncExternalStore 而非 useEffect+setState，避免 cascading render 並保留 SSR 安全
export function OrientationHint({ visible }: OrientationHintProps) {
	const dismissed = useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot);

	if (!visible || dismissed) return null;

	return (
		<div
			role="status"
			className="flex items-center justify-between gap-2 border-b border-lime-500/20 bg-lime-500/10 px-4 py-2 text-sm"
		>
			<span>💡 建議橫向使用，體驗更好</span>
			<Button variant="ghost" size="icon" aria-label="關閉提示" onClick={dismiss}>
				<X className="size-4" />
			</Button>
		</div>
	);
}
