// components/sync/SyncStatusNotice.tsx
"use client";

import { Button } from "@/components/ui/button";
import { chooseLocalFallback } from "@/lib/auth/session-store";
import {
	DATA_PENDING_MESSAGE,
	LOCAL_FALLBACK_ACTION_LABEL,
	syncStatusMessage,
	type DataStatus,
} from "@/lib/sync/sync-status";
import { cn } from "@/lib/utils";

export interface SyncStatusNoticeProps {
	status: DataStatus;
	className?: string;
}

const NOTICE_CLASS =
	"rounded-lg border border-border bg-card px-4 py-2 text-center text-sm font-medium text-foreground shadow-md";

// 同步狀態提示：只有需要使用者注意的狀態才有文案；沒有文案（含本機模式）時
// 不渲染任何元素，讓訪客的 DOM 與雲端同步功能加入前相同。
// unavailable（session 無法確認）沿用載入失敗文案，另附一顆讓使用者改用本機資料的按鈕；
// 按鈕放在 role="status" 之外，避免 live region 更新時重複朗讀互動元素。
// 此時 className 套在包住提示與按鈕的外層容器；其他狀態則套在 role="status" 本體。
export function SyncStatusNotice({ status, className }: SyncStatusNoticeProps) {
	if (status === "unavailable") {
		return (
			<div className={cn("flex flex-col items-center gap-3", className)}>
				<div role="status" className={NOTICE_CLASS}>
					{syncStatusMessage("load-failed")}
				</div>
				<Button type="button" onClick={() => chooseLocalFallback()}>
					{LOCAL_FALLBACK_ACTION_LABEL}
				</Button>
			</div>
		);
	}

	const message = status === "pending" ? DATA_PENDING_MESSAGE : syncStatusMessage(status);
	if (message === null) return null;

	return (
		<div role="status" className={cn(NOTICE_CLASS, className)}>
			{message}
		</div>
	);
}
