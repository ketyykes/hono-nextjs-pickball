// app/matchmaker/history/page.tsx
import { HistoryView } from "@/components/matchmaker/HistoryView";

// 歷史頁入口。本檔刻意不標 "use client"：畫面狀態與資料讀取全部委派 HistoryView
// （design Decision 5 否決的替代方案——page.tsx 是 server component 慣例的入口層，
// 塞 "use client" 與狀態會讓路由入口同時承擔兩種角色）。
//
// MUST 可被直接開啟，不相依任何前一畫面留下的記憶體狀態（spec「歷史頁的導覽入口」）。
export default function MatchmakerHistoryPage() {
	return (
		<main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8">
			<div>
				<h1 className="text-2xl font-bold">對戰歷史</h1>
				<p className="text-sm text-muted-foreground">檢視已完成的對戰紀錄與分數變化。</p>
			</div>
			<HistoryView />
		</main>
	);
}
