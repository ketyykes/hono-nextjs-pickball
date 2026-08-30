// components/matchmaker/EmptyHistory.tsx
"use client";

// 歷史頁的引導型空狀態（spec「空區間的友善空狀態」）：`matchmaker:history:v1`
// 完全沒有資料時顯示，說明先完成一場對戰才會有紀錄，SHALL NOT 只顯示「無資料」
// 四個字或任何錯誤訊息、技術錯誤碼。
export function EmptyHistory() {
	return (
		<div
			data-testid="empty-history"
			className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border px-6 py-16 text-center"
		>
			<p className="text-lg font-semibold">還沒有任何對戰紀錄</p>
			<p className="text-sm text-muted-foreground">
				完成對戰後才會有紀錄，請先前往對戰頁安排比賽。
			</p>
		</div>
	);
}
