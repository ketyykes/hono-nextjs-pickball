// components/sync/SyncStatusNotice.tsx
import { syncStatusMessage, type SyncStatus } from "@/lib/sync/sync-status";
import { cn } from "@/lib/utils";

export interface SyncStatusNoticeProps {
	status: SyncStatus;
	className?: string;
}

// 同步狀態提示：只有需要使用者注意的狀態才有文案；沒有文案（含本機模式）時
// 不渲染任何元素，讓訪客的 DOM 與雲端同步功能加入前相同。
export function SyncStatusNotice({ status, className }: SyncStatusNoticeProps) {
	const message = syncStatusMessage(status);
	if (message === null) return null;

	return (
		<div
			role="status"
			className={cn(
				"rounded-lg border border-border bg-card px-4 py-2 text-center text-sm font-medium text-foreground shadow-md",
				className,
			)}
		>
			{message}
		</div>
	);
}
