// components/sync/LocalFallbackBanner.tsx
"use client";

import { useSession } from "@/hooks/useSession";
import { LOCAL_FALLBACK_NOTICE } from "@/lib/sync/sync-status";

// 本機備援（使用者在 session 無法確認時選擇先用這台裝置的資料）期間常駐的提示。
// 掛在 root layout，跨頁都看得到；固定定位不佔版面（計分板鎖高版面不受影響），
// pointer-events-none 讓下方操作照常可按，列印時隱藏。
// 層級刻意用 z-30：計分板專注模式的浮動操作列是 z-40、對話框是 z-50，提示不可蓋在它們之上。
// 專注模式的浮動操作列固定在 bottom-2，提示改用 bottom-16 讓到其上方，避免被遮住。
// 本機備援只能由使用者點擊進入，伺服器輸出與 hydration 那次 render 一律為 null。
export function LocalFallbackBanner() {
	const session = useSession();
	if (session.status !== "loading" || session.localFallback !== true) return null;

	return (
		<div className="pointer-events-none fixed inset-x-0 bottom-4 z-30 flex justify-center px-4 print:hidden [.sb-focus_&]:bottom-16">
			<div
				role="status"
				className="rounded-lg border border-border bg-card px-4 py-2 text-center text-sm font-medium text-foreground shadow-md"
			>
				{LOCAL_FALLBACK_NOTICE}
			</div>
		</div>
	);
}
