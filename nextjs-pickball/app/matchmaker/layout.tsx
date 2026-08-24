// app/matchmaker/layout.tsx
import type { ReactNode } from "react";
import { MatchmakerTabs } from "@/components/matchmaker/MatchmakerTabs";

// matchmaker 區段外框：對戰頁（/matchmaker）與參賽者名單頁（/matchmaker/players）
// 共用同一份區段導覽，兩頁因此都能互相切換（spec「對戰頁路由與 matchmaker 區段
// 動線」，SHALL NOT 只在對戰頁提供單向連結）。本檔屬例外層（純入口，design
// Decision 1），不含邏輯——邏輯全數下放 MatchmakerTabs／section-nav.ts。
// pt-14 對齊全站固定 navbar 高度（--site-nav-h，見 app/globals.css），
// 沿用 app/quiz/page.tsx 既有的做法。
export default function MatchmakerLayout({ children }: Readonly<{ children: ReactNode }>) {
	return (
		<div className="min-h-screen bg-background pt-14">
			<MatchmakerTabs />
			{children}
		</div>
	);
}
