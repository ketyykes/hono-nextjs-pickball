// app/matchmaker/stats/page.tsx
"use client";

import { LocalStatsContent } from "@/components/matchmaker/LocalStatsContent";
import { RemoteStatsContent } from "@/components/matchmaker/RemoteStatsContent";
import { useSession } from "@/hooks/useSession";
import { resolveStorageMode } from "@/lib/sync/storage-mode";

// 統計頁入口：依儲存模式擇一渲染本機或雲端內容（B8 design Decision 3）。
// hooks 不能條件式呼叫，所以兩條路徑各自是獨立元件；本機內容原樣搬到 LocalStatsContent，
// 訪客路徑一行未改。session 載入中 resolveStorageMode 回 local，與訪客首屏時序一致。
// 雲端內容只在 remote 時掛載：其 hook 在 userId 為 null 時不發請求，但元件本身不該在訪客路徑出現。
export default function MatchmakerStatsPage() {
	const session = useSession();

	if (resolveStorageMode(session) === "local") {
		return <LocalStatsContent />;
	}

	return (
		<main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8">
			<RemoteStatsContent />
		</main>
	);
}
