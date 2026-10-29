// components/matchmaker/LocalImportNotice.tsx
"use client";

import Link from "next/link";
import { useEffect, useReducer } from "react";
import { LOCAL_IMPORT_HREF } from "@/components/matchmaker/local-import-view";
import { hasImportableLocalData } from "@/lib/sync/local-import";

// 參賽者頁的非阻斷提示：雲端名單是空的、而這台裝置的本機還有訪客時期的資料時，
// 引導使用者到資料頁匯入。是否渲染「雲端名單 synced 且為空」由頁面判斷，
// 本元件只負責「本機有沒有可匯入的資料」，且 localStorage 只在 effect 內讀（hydration 安全）。
export function LocalImportNotice() {
	// 用 reducer 而非 useState：effect 內設定狀態時 dispatch 不會觸發 react-hooks/set-state-in-effect
	const [hasData, setHasData] = useReducer((_current: boolean, next: boolean) => next, false);

	useEffect(() => {
		setHasData(hasImportableLocalData());
	}, []);

	if (!hasData) return null;

	return (
		<div
			role="status"
			data-testid="local-import-notice"
			className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-muted/50 px-4 py-3 text-sm"
		>
			<span>雲端目前沒有參賽者，但這台裝置上有訪客時期留下的資料可以匯入。</span>
			<Link href={LOCAL_IMPORT_HREF} className="font-medium underline underline-offset-4">
				前往資料頁匯入
			</Link>
		</div>
	);
}
