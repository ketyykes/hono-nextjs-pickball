// app/matchmaker/data/page.tsx
import { ClearLocalDataSection } from "@/components/matchmaker/ClearLocalDataSection";
import { HistoryCsvSection } from "@/components/matchmaker/HistoryCsvSection";
import { JsonBackupSection } from "@/components/matchmaker/JsonBackupSection";
import { RosterCsvImportSection } from "@/components/matchmaker/RosterCsvImportSection";

// 資料工具頁入口（M8 §8.2）：集中放置 JSON 完整備份、歷史賽果 CSV 匯出、
// 參賽者名單 CSV 匯入與清除本機資料四個功能區塊
// （spec「資料工具頁與其導覽入口」，`openspec/changes/matchmaker-data-transfer/specs/data-transfer/spec.md`）。
// 導覽入口由 app/matchmaker/layout.tsx 掛的 MatchmakerTabs 提供，讀
// lib/matchmaker/section-nav.ts 的同一份常數，本檔不另寫路徑字面值。
// 本檔屬例外層（純入口，design Decision 1），不含邏輯——四個區塊的實際接線
// 由 §8.3～8.9 補上。
//
// 頂部的不對稱說明為 prd.md 9.3 前言明列的使用者誤解風險：CSV 匯出的是歷史賽果、
// 匯入的是參賽者名單，兩者不構成 round-trip；完整還原需使用 JSON 備份。
export default function MatchmakerDataPage() {
	return (
		<main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8">
			<div className="flex flex-col gap-2">
				<h1 className="text-2xl font-bold">資料匯入匯出</h1>
				<p className="text-sm text-muted-foreground">
					CSV 匯出的是歷史賽果、匯入的是參賽者名單，兩者不構成 round-trip。需要完整還原請使用
					JSON。
				</p>
			</div>
			<JsonBackupSection />
			<HistoryCsvSection />
			<RosterCsvImportSection />
			<ClearLocalDataSection />
		</main>
	);
}
