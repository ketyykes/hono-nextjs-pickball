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

/**
 * 排行榜（PlayerStatsTable）標示「已離開目前名單」球員的文字標籤。色彩不得作為唯一
 * 資訊來源（prd.md 12.5），此文字標籤才是可靠依據，SHALL NOT 在元件內寫死字面量。
 */
export const PLAYER_NOT_ON_ROSTER_LABEL = "已不在名單";

/**
 * CourtCard 換人操作（Select 觸發器）候選人不為空時的顯示文案（M13
 * matchmaker-player-swap change，design Decision 7）。
 */
export const SWAP_PLAYER_LABEL = "換人";

/**
 * CourtCard 換人操作候選人為空時的顯示文案，操作 MUST 同時以 disabled 表達
 * （prd.md 12.3：disabled 要解釋自己），SHALL NOT 只隱藏操作（M13
 * matchmaker-player-swap change，design Decision 7）。
 */
export const SWAP_PLAYER_NO_CANDIDATE_LABEL = "無可換之人";

/**
 * 計時控制項「不計時」選項的顯示文案（M14 matchmaker-round-timer change）。資料層以
 * Round.timer 為 null 表示不計時，此文字標籤是使用者端唯一可讀的表達方式，
 * SHALL NOT 在元件內寫死字面量——其餘計時長度選項的「N 分鐘」由長度值推導，不入本檔
 * （比照 FORMAT_OPTIONS：清單由呼叫端推導，固定文案才收斂到這裡）。
 */
export const ROUND_TIMER_OFF_LABEL = "不計時";

/**
 * 計時控制項因本輪已開始計分而鎖定時顯示的原因文案（M14 matchmaker-round-timer change，
 * design Decision 2）。鎖定與否重用 isTargetScoreLocked 的 locked 布林值，但文案**不重用**
 * 它回傳的 reason——該字串固定提及「目標分數」，顯示在計時控制項旁會讓使用者誤以為看錯
 * 區塊，因此本常數 SHALL NOT 提及「目標分數」。
 */
export const ROUND_TIMER_LOCKED_REASON = "本輪已開始計分，計時設定不可更改。";

/**
 * 計時器時間到時顯示的繁體中文提示文案（M14 matchmaker-round-timer change，
 * spec「計時器顯示與時間到提示」逐字指定）。顯示於 RoundTimerBanner.tsx 的
 * `role="alert"` 區塊，SHALL NOT 在元件內寫死字面量。
 */
export const ROUND_TIMER_EXPIRED_MESSAGE = "時間到：領先者勝，平手請再打一球";

/**
 * 平手的顯示文案，計時回合平局時使用（M15 matchmaker-timed-draw change）。
 * history-csv.ts（勝方欄）、export-scene.ts（buildStatusText）、CourtCard.tsx、
 * HistoryRecordCard.tsx 四處平手顯示皆改用此常數，SHALL NOT 各自寫死字面量
 * （design Decision 7）。
 */
export const DRAW_LABEL = "平手";
