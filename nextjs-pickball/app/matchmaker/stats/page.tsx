// app/matchmaker/stats/page.tsx
"use client";

import { LocalStatsContent } from "@/components/matchmaker/LocalStatsContent";
import { RemoteStatsContent } from "@/components/matchmaker/RemoteStatsContent";
import { useSession } from "@/hooks/useSession";
import { resolveStorageMode } from "@/lib/sync/storage-mode";

// 統計頁入口：依儲存模式擇一渲染本機或雲端內容。
// hooks 不能條件式呼叫，所以兩條路徑各自是獨立元件；本機內容原樣搬到 LocalStatsContent，
// 訪客路徑一行未改。儲存模式未定（pending）時也渲染本機內容：它的選擇器會回報 pending，
// 由 LocalStatsContent 顯示等待中提示，不會交出本機資料。
// 雲端內容只在 remote 時掛載：其 hook 在 userId 為 null 時不發請求，但元件本身不該在其他路徑出現。
export default function MatchmakerStatsPage() {
	const session = useSession();

	const mode = resolveStorageMode(session);
	if (mode === "remote") {
		return (
			<main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8">
				<RemoteStatsContent />
			</main>
		);
	}

	return <LocalStatsContent />;
}
