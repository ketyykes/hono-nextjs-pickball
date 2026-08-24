// components/matchmaker/MatchmakerTabs.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { matchmakerSectionTabs } from "@/lib/matchmaker/section-nav";
import { cn } from "@/lib/utils";

// matchmaker 區段導覽（對戰／參賽者）：純呈現，分頁清單與 active 判定完全委派
// lib/matchmaker/section-nav.ts 的 matchmakerSectionTabs（design Decision 1）。
// 為何掛在 layout 而非各頁自己渲染，見 app/matchmaker/layout.tsx 的檔頭註解。
export function MatchmakerTabs() {
	const pathname = usePathname();
	const tabs = matchmakerSectionTabs(pathname);

	return (
		<nav aria-label="對戰分配區段導覽" className="flex gap-1 border-b border-border px-4 sm:px-6">
			{tabs.map((tab) => (
				<Link
					key={tab.href}
					href={tab.href}
					aria-current={tab.active ? "page" : undefined}
					className={cn(
						"border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors",
						tab.active
							? "border-primary text-foreground"
							: "border-transparent text-muted-foreground hover:text-foreground",
					)}
				>
					{tab.label}
				</Link>
			))}
		</nav>
	);
}
