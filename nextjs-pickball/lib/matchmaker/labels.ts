// lib/matchmaker/labels.ts
// 對戰文案常數的單一來源。TEAM_LABELS／FORMAT_LABEL／DOUBLES_COMPOSITION_LABEL 原本
// 分散在 CourtCard、HistoryRecordCard、PrintSheet、RoundControls、history-csv、round、
// rating、export-scene 各自持有一份（M9 Final Review F-5 實測 TEAM_LABELS 5 份、
// FORMAT_LABEL 6 份）。歷次「刻意各自持有、不抽共用」的裁決都是為了避免單一 change
// 連動修改自身範圍外的檔案；M3～M9 全數合併後該顧慮已消失，2026-09-03 收斂至本檔。

import type { DoublesComposition, MatchFormat } from "./allocation-types";

/** 隊伍顯示文案。色彩不得作為唯一資訊來源（prd.md 12.5），此文字標籤才是可靠依據。 */
export const TEAM_LABELS: readonly [string, string] = ["第一隊", "第二隊"];

/** 同一份隊伍文案的 winner key 形狀（歷史紀錄與 ExportScene 以 teamA／teamB 表示勝方）。 */
export const TEAM_LABELS_BY_KEY: Record<"teamA" | "teamB", string> = {
	teamA: TEAM_LABELS[0],
	teamB: TEAM_LABELS[1],
};

/** 對戰方式顯示文案，沿用畫面既有用語（單打／雙打）。 */
export const FORMAT_LABEL: Record<MatchFormat, string> = {
	singles: "單打",
	doubles: "雙打",
};

/** 雙打組成的事後顯示標示，純顯示用途，不參與選人或配對決策（prd.md 7.3）。 */
export const DOUBLES_COMPOSITION_LABEL: Record<DoublesComposition, string> = {
	mixed: "混雙",
	mens: "男雙",
	womens: "女雙",
	general: "一般雙打",
};
