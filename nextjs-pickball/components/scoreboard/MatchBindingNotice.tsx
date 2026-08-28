// components/scoreboard/MatchBindingNotice.tsx
"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { MATCHMAKER_ROUTE } from "@/lib/matchmaker/section-nav";

// 場次失效說明（spec「對戰場次綁定與失效處理」Requirement）：以 ?match=<matchId> 開啟
// 但該 matchId 在 scoreboard:matches:v1 無對應條目時顯示。本元件不含任何判斷邏輯
// （是否顯示由呼叫端依 bindingStatus 決定），純呈現繁體中文說明與兩個出口。
export function MatchBindingNotice() {
	return (
		<div className="flex h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
			<p className="text-lg font-semibold">這場比賽目前無法計分</p>
			<p className="max-w-sm text-sm text-muted-foreground">
				可能是本輪已重新配對，或該場次已被刪除。請回到對戰頁確認，或改用不綁定場次的獨立計分板繼續計分。
			</p>
			<div className="flex gap-3">
				<Button asChild variant="outline">
					<Link href={MATCHMAKER_ROUTE}>回到對戰頁</Link>
				</Button>
				<Button asChild>
					<Link href="/scoreboard">改用獨立計分板</Link>
				</Button>
			</div>
		</div>
	);
}
