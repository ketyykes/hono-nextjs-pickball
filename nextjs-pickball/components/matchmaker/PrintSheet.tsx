// components/matchmaker/PrintSheet.tsx
"use client";

import type { ExportCourt, ExportScene, ExportTile } from "@/lib/matchmaker/export-scene";

/**
 * data-print 屬性值：CSS 檔（app/globals.css 的 @media print 區塊，§8 職責）無法 import
 * TS 常數，兩邊只能靠這裡的具名常數與下方註解「同源」——若日後修改其中一邊的字面量，
 * MUST 同步修改另一邊，型別系統無法強制同步，仰賴人工紀律與 code review。
 * §8 的選擇器 MUST 逐字為 `[data-print="sheet"]` 與 `[data-print="court"]`。
 */
export const PRINT_SHEET_DATA_VALUE = "sheet";
export const PRINT_COURT_DATA_VALUE = "court";

/**
 * 隊伍顯示文案：色彩不得作為唯一資訊來源（prd.md 12.5）。與 export-scene.ts（TEAM_LABELS）、
 * history-csv.ts、HistoryRecordCard.tsx 的同名對照表逐字相同，刻意各自持有一份不抽共用模組
 * （沿用 HistoryRecordCard.tsx 的既有裁決：抽出需連動修改本 change 範圍外的檔案，
 * 風險與收益不成比例）。
 */
const TEAM_LABELS: readonly [string, string] = ["第一隊", "第二隊"];

/**
 * 顏色小標記（色點）的邊長，刻意極小——列印版以文字為主，色彩僅為輔助小標記，
 * SHALL NOT 做大面積漸層背景（design Decision 3；prd.md 12.5 色彩不可為唯一資訊來源）。
 */
const COLOR_DOT_SIZE = "0.5rem";

export interface PrintSheetProps {
	scene: ExportScene;
}

/** 依 teamIndex 把一個場地的球員格分成兩隊，供列印版分隊呈現——這是呈現層的分組，
 * 不是內容重組（`ExportScene` 已提供 `teamIndex`，本函式只是依它分堆）。 */
function groupTilesByTeam(
	tiles: readonly ExportTile[],
): [readonly ExportTile[], readonly ExportTile[]] {
	return [
		tiles.filter((tile) => tile.teamIndex === 0),
		tiles.filter((tile) => tile.teamIndex === 1),
	];
}

/**
 * 單一場地區塊：場地編號、狀態文字（比分／勝方／未完成，逐字取自 scene，SHALL NOT 在此
 * 重組）、兩隊球員姓名。`data-print="court"` 供 §8 的 `break-inside: avoid` 選取。
 */
function PrintCourt({ court }: { court: ExportCourt }) {
	const teamTiles = groupTilesByTeam(court.tiles);

	return (
		<section
			data-print={PRINT_COURT_DATA_VALUE}
			data-testid={`print-court-${court.courtNumber}`}
		>
			<h2>第 {court.courtNumber} 場地</h2>
			<p>{court.statusText}</p>
			{teamTiles.map((tiles, teamIndex) => (
				// key 用 teamIndex：固定為 0／1，兩個區塊本身不會重新排序，index 即語意本身。
				<div
					key={teamIndex}
					data-testid={`print-court-${court.courtNumber}-team-${teamIndex}`}
				>
					<h3>{TEAM_LABELS[teamIndex]}</h3>
					<ul>
						{tiles.map((tile) => (
							<li key={`${tile.row}-${tile.column}`}>
								{/* 色點僅為輔助小標記，姓名文字本身即可辨識球員與隊伍歸屬——即使色點樣式
								    失效，姓名仍可讀（prd.md 12.5：色彩不可作為唯一資訊來源）。 */}
								<span
									aria-hidden="true"
									style={{
										display: "inline-block",
										width: COLOR_DOT_SIZE,
										height: COLOR_DOT_SIZE,
										borderRadius: "9999px",
										backgroundColor: tile.colorFrom,
									}}
								/>{" "}
								<span>{tile.name}</span>
							</li>
						))}
					</ul>
				</div>
			))}
		</section>
	);
}

/**
 * 列印版：內容全部取自 `ExportScene`，SHALL NOT 自行從 `Round`／`Player` 重組任何內容——
 * 比分文字、勝方文字、未完成文字、標題全部已經在 `ExportScene` 裡組好，本元件僅呈現
 * （design Decision 2）。
 *
 * 螢幕上預設隱藏、列印時顯示由 `app/globals.css` 的 `@media print` 區塊負責（§8）；
 * 本元件 SHALL NOT 加 `hidden` 屬性或 inline `display: none` 樣式——那會與 §8 的
 * `display: block !important` 打架，也會讓本檔的 integration 測試查不到內容。
 *
 * 版面刻意做成文字為主（design Decision 3）：場地標題、隊伍、姓名、比分皆為文字，
 * 顏色只以小色點呈現——紙本目的是貼公告板找場地，油墨與瀏覽器背景圖列印限制皆不利於
 * 大面積色塊，且色彩不得作為唯一資訊來源（prd.md 12.5），姓名與隊伍文字才是可靠依據。
 */
export function PrintSheet({ scene }: PrintSheetProps) {
	return (
		<div data-print={PRINT_SHEET_DATA_VALUE}>
			<h1>{scene.title}</h1>
			{scene.courts.map((court) => (
				<PrintCourt key={court.courtNumber} court={court} />
			))}
		</div>
	);
}
