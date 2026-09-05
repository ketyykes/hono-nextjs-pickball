# Proposal: matchmaker-scoreboard-team-labels

M10～M15 交付序的 **milestone M12（計分板顯示綁定場次的球員姓名與隊色）**，位置如下：

```
M10 場次缺口修補 → M11 球員統計 → 【M12 計分板隊伍標示（本 change）】
   → M13 球員互換 → M14 回合計時器 → M15 限時抽籤
```

**執行相依**：`matchmaker-player-stats`（M11）MUST 已合併回 `main`。本 change 的分支從
`main` 開出，若 `main` 上找不到 M11 的產物，MUST 停止並回報，SHALL NOT 在本 change 內補做
M11。

## Why

出處：`openspec/changes/archive/2026-09-03-matchmaker-scoreboard-binding/design.md` 的
`## Open Questions` 第 1 條：

> 計分板要不要顯示實際球員姓名／隊伍顏色？目前維持「我方／對方」。seed 的結構留有空間
> （可加 `teamLabels`），且由對戰頁寫入不會產生反向相依。本段刻意不做以控制範圍；若使用者
> 測試顯示「不知道自己在計哪一場」仍是痛點（目前的緩解是場地標示），應另開 change。

`matchmaker-scoreboard-binding`（M6）已讓對戰頁的「進入計分板」入口把場次綁定進計分板
（`?match=<matchId>`），並在設定列顯示「場地 N」與唯讀分制作為場次辨識的緩解。但兩隊面板
本身仍只顯示固定的「我方」／「對方」，主持人在多場地並行、輪替代打或臨時換人時，站在計分板
前仍得回頭確認自己正在計哪幾位球員的分——場地標示只回答「哪個場地」，回答不了「這場地上是誰
在打」。本 change 把 Open Questions 第 1 條列出的「痛點若持續存在，應另開 change」的條件
兌現：由對戰頁在建立 seed 時把兩隊球員的姓名與雙色漸層色塊一併寫入，計分板兩隊面板據此顯示，
使「這是哪一場」與「這場上是誰」在同一個畫面上同時可讀。

## What Changes

- 由對戰頁「進入計分板」入口進入計分板（`/scoreboard?match=<matchId>`）時，兩隊面板 SHALL
  顯示該隊球員姓名（單打 1 人、雙打 2 人）與每位球員的雙色漸層色塊；獨立開啟的
  `/scoreboard`（未帶 `match` 參數）SHALL NOT 因本變更而改變任何既有行為，仍顯示「我方」／
  「對方」純文字。
- `lib/matchmaker/scoreboard-binding.ts` 的 `buildMatchSlotSeed` 新增必填的 `players` 參數，
  由該場次兩隊的 `playerIds` 解析出球員姓名與色碼，寫入 seed 的新欄位 `teamPlayers`。
  名單中找不到某 id（該員已被移除）時，該筆 MUST 以可判讀的替代文字與中性色呈現，
  SHALL NOT 拋錯、SHALL NOT 使該隊少一筆。
- `lib/scoreboard/types.ts` 的 `ScoreboardStateSchema` 新增 `teamPlayers` 欄位
  （`.nullable().default(null)`）：既有 `scoreboard` capability「localStorage 持久化」
  Requirement 的向後相容策略已明文授權以 `.default()` 新增欄位且不 bump storage key，
  本次變更沿用同一策略，本次變更前寫入的資料與獨立計分板皆補為 `null`。
- **前景文字色於 seed 建立時預先算好存入**：`teamPlayers` 每筆球員資料的前景文字色 MUST 由
  `lib/matchmaker/colors.ts` 的 `pickTextColor` 於對戰頁（matchmaker 側）計算後存入 seed，
  計分板（`scoreboard` capability）只讀取、不重新計算——`scoreboard` capability 不得 import
  `lib/matchmaker/` 的既有單向相依（`matchmaker-scoreboard-binding` design Decision 2）
  因此不受影響。
- `teamPlayers` MUST 隨 `mode`、`firstServer`、`targetScore`、`matchId`、`courtNumber` 一併
  被視為「重建初始狀態時要原樣帶入」的欄位：UNDO 以「重建初始 state 後 replay」實作、RESET
  亦重建初始狀態，兩者若未帶入 `teamPlayers`，球員顯示會在使用者按下 Undo 或重置的瞬間
  靜默消失。
- 顯示位置 MUST 為 `components/scoreboard/TeamPanel.tsx` 既有的名稱行，SHALL NOT 新增獨立的
  列或區塊——`/scoreboard` 為 `h-dvh` + `overflow-hidden` 鎖高頁面，新增節點會壓縮分數面板
  的高度預算且溢出時為靜默裁切，此為既有「目標分數可見性」Requirement 已建立的同一條原則。
- `tests/e2e/specs/scoreboard-binding.spec.ts` 新增一條「由對戰頁進入時面板顯示球員姓名」。

### 明確不做

以下為相鄰或已否決的方向，SHALL NOT 順手實作：

- **跨分頁即時同步**（`storage` 事件／`BroadcastChannel`）：`matchmaker-scoreboard-binding`
  design Open Questions 第 2 條已列為不做，本 change 不重啟此討論。
- **`firstServer` 改由回合決定**：同上 Open Questions 第 3 條，本 change 不變更此規則。
- **計分規則、Undo、專注模式、獨立計分板的文案**：本 change 不改動計分規則、Undo 撤銷邏輯、
  專注模式行為，也不改變獨立 `/scoreboard`（`matchId === null`）的任何顯示文案。
- **球員互換、統計顯示、計時器等其他 M13～M15 的工作**：不在本 change 範圍，不順手夾帶。
- **舊版 seed 或已在使用中的綁定場次回溯補上 `teamPlayers`**：本次變更前已建立的計分板槽
  沿用向後相容的 `null` 補值，不另寫遷移邏輯去逐筆回填。
- **修改 `components/matchmaker/CourtCard.tsx` 色塊本身的姓名／顏色呈現**：色塊呈現屬
  `match-stage` capability 既有 Requirement 的既定行為，本 change 只讀取該色塊已使用的
  `Player` 欄位（`name`、`colorFrom`、`colorTo`）來組裝 seed，不改變色塊呈現本身。

## Capabilities

### New Capabilities

（無）

### Modified Capabilities

- `scoreboard`：新增 Requirement「綁定場次的隊伍標示」（球員姓名色塊如何顯示、快照語意、
  向後相容），並 MODIFY 既有 Requirement「localStorage 持久化」——schema 欄位表新增
  `teamPlayers`，比照既有 `matchId`／`targetScore` 的向後相容 Scenario 補一條「舊版資料缺少
  `teamPlayers` 時補為 `null`」。
- `match-stage`：MODIFY 既有 Requirement「場地區塊的計分板入口」——seed 內容新增
  `teamPlayers`（球員姓名與雙色漸層），並補上「名單中找不到球員時以替代文字呈現」的判定。

## Impact

- **修改**：
  - `nextjs-pickball/lib/scoreboard/types.ts`（新增 `PlayerBadgeSchema`／`TeamPlayersSchema`、
    `ScoreboardStateSchema` 與 `MatchSettings` 新增 `teamPlayers` 欄位）
  - `nextjs-pickball/lib/scoreboard/reducer.ts`（`createInitialState`／`settingsOf` 帶入
    `teamPlayers`，使其在 UNDO／RESET 後保留）
  - `nextjs-pickball/lib/matchmaker/scoreboard-binding.ts`（`buildMatchSlotSeed` 新增必填
    `players` 參數，新增私有的球員解析與替代文字邏輯）
  - `nextjs-pickball/components/matchmaker/CourtCard.tsx`（呼叫端補上 `players` 參數）
  - `nextjs-pickball/components/scoreboard/TeamPanel.tsx`（既有名稱行渲染球員姓名色塊）
  - `nextjs-pickball/lib/scoreboard/reducer.test.ts`、`storage.test.ts`、
    `lib/matchmaker/scoreboard-binding.test.ts`（既有呼叫點補第三參數／新增測試案例）
  - `nextjs-pickball/tests/e2e/specs/scoreboard-binding.spec.ts`（新增驗收）
- **重用（唯讀，不修改行為）**：`lib/matchmaker/colors.ts` 的 `pickTextColor`、
  `lib/matchmaker/types.ts` 的 `Player`、`lib/matchmaker/round-types.ts` 的
  `RoundTeam.playerIds`
- **無外部相依**：**不新增任何 npm 套件**
- **不動**：`hono-pickball/**`（matchmaker／scoreboard 皆為 LocalStorage-only 純前端功能）、
  `hooks/`（不新增任何 hook）、計分規則（`lib/scoreboard/rules.ts`）、Undo／專注模式
  （`lib/scoreboard/reducer.ts` 的對應 action 分支邏輯本身不變，只多帶一個欄位）、
  `components/matchmaker/CourtCard.tsx` 色塊本身的姓名／顏色呈現邏輯
