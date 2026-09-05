// components/matchmaker/EmptyMatches.tsx
"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

const TITLE = "本輪目前沒有任何場次";
const DESCRIPTION = "候選人數不足以組成任何一場比賽，請前往參賽者名單調整出場狀態或補充人數。";

// 本輪場次為空的說明（spec Requirement「本輪場次為空時的畫面說明」）：`round`
// 已存在但 `matches` 為空陣列——與「空白球場狀態」（EmptyStage，`round` 為 null，
// 代表「尚未產生任何回合」）不同：本狀態是「回合已存在，但這一輪排不出任何一場」，
// 成因、文案與下一步皆不同，因此不沿用 EmptyStage 的元件、data-testid 或文案
// （design Decision 1），只沿用其版面形狀（虛線邊框卡片＋標題＋說明＋一個入口）。
export function EmptyMatches() {
	return (
		<div
			data-testid="empty-matches"
			className="flex flex-col items-center gap-4 rounded-lg border border-dashed border-border px-6 py-16 text-center"
		>
			<div className="space-y-1">
				<p className="text-lg font-semibold">{TITLE}</p>
				<p className="text-sm text-muted-foreground">{DESCRIPTION}</p>
			</div>
			<Button asChild>
				<Link href="/matchmaker/players">前往參賽者名單</Link>
			</Button>
		</div>
	);
}
