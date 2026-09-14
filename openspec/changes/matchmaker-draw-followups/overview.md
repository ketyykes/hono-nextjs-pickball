# Overview: matchmaker-draw-followups

## Scope

M15（`matchmaker-timed-draw`）合併後的兩項收尾缺陷修正，共觸及 **3 個實作檔、4 個測試檔**：

| 缺陷 | capability | 實作檔 | 症狀 |
|---|---|---|---|
| 平局被記成雙方各一敗場 | `player-stats` | `lib/matchmaker/player-stats.ts`、`components/matchmaker/PlayerStatsTable.tsx` | `/matchmaker/stats` 的敗場數字偏高 |
| 到期文案要求「再打一球」 | `match-stage` | `lib/matchmaker/labels.ts` | 提示與 M15 之後的實際行為矛盾 |

**不在範圍內**：勝率公式、排行榜欄位總數、既有歷史的重算或遷移、`round-lifecycle`／
`match-rating`／`scoreboard` 的任何改動、M14 design.md 的 Open Questions 第 7／11 條。
完整清單見 proposal.md 的「明確不做」。

## What Changes

### 1. `player-stats.ts`：二分改三分

`tallyGamesAndResults` 目前對每一隊各做一次「所屬隊伍是不是 `winner`」的二元判斷：

```
                    現行（錯）                        修正後
  winner = "teamA"  teamA → wins   teamB → losses    teamA → wins   teamB → losses
  winner = "teamB"  teamA → losses teamB → wins      teamA → losses teamB → wins
  winner = "draw"   teamA → losses teamB → losses    teamA → draws  teamB → draws
                    ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^   雙方各被誤記一敗
```

`PlayerStat` 與內部 `MutableStat` 隨之新增 `draws: number`（初值 0），
不變式為 `wins + losses + draws === gamesPlayed`。

### 2. `PlayerStatsTable.tsx`：勝負欄擴為勝負和欄

欄位總數不變（仍九欄），只有第五欄的標題與內容改變。

### 3. `labels.ts`：一行字串

```diff
- export const ROUND_TIMER_EXPIRED_MESSAGE = "時間到：領先者勝，平手請再打一球";
+ export const ROUND_TIMER_EXPIRED_MESSAGE = "時間到：領先者勝，同分可直接送出平手";
```

## UI Mockups

### 排行榜第五欄（`/matchmaker/stats`）

```
現行                                    修正後
┌──────┬──────┬──────┬──────┐          ┌──────┬──────┬────────┬──────┐
│ 強度 │ 出場 │ 勝負 │ 勝率 │          │ 強度 │ 出場 │ 勝負和 │ 勝率 │
├──────┼──────┼──────┼──────┤          ├──────┼──────┼────────┼──────┤
│ 5.20 │  4   │ 2 - 2│ 50%  │  ←錯     │ 5.20 │  4   │ 2 - 1 - 1│ 50%│
│ 4.80 │  3   │ 0 - 3│  0%  │  ←錯     │ 4.80 │  3   │ 0 - 2 - 1│  0%│
└──────┴──────┴──────┴──────┘          └──────┴──────┴────────┴──────┘
        和局被算進敗場                  和局獨立成第三個數字，恆常顯示
```

勝率欄的數字**前後相同**——`winRate` 讀 `wins ÷ gamesPlayed`，本來就不受 `losses` 影響
（design Context 證據二）。

### 計時到期橫幅（`/matchmaker`）

```
┌────────────────────────────────────────┐   ┌────────────────────────────────────────┐
│           時間到                       │   │           時間到                       │
│  時間到：領先者勝，平手請再打一球      │ → │  時間到：領先者勝，同分可直接送出平手  │
└────────────────────────────────────────┘   └────────────────────────────────────────┘
  role="alert"，大字與提示文案兩個節點          結構、role、樣式全部不變，只換字串值
```

## Architecture

```
  歷史紀錄（matchmaker:history:v1）
   MatchHistoryEntry.winner: "teamA" | "teamB" | "draw"   ← M15 擴增
              │
              ▼
  lib/matchmaker/player-stats.ts
   computePlayerStats(history, players)
     ├─ buildRosterUnion        （新增 draws: 0 初值）        ★本 change
     ├─ tallyGamesAndResults    （二分 → 三分）              ★本 change
     ├─ tallyRatingDelta        （不動，本來就含平局場次）
     ├─ winRateOf               （不動，不讀 losses）
     └─ comparePlayerStatsForRanking（不動，不讀 draws）
              │  PlayerStat[]（新增 draws 欄位）
              ▼
  components/matchmaker/PlayerStatsTable.tsx（第五欄標題與內容）  ★本 change


  lib/matchmaker/labels.ts
   ROUND_TIMER_EXPIRED_MESSAGE（字串值）                        ★本 change
              │
              ▼
  components/matchmaker/RoundTimerBanner.tsx（渲染常數，零改動）
```

三個 ★ 之間**沒有相依**：`player-stats.ts` 與 `labels.ts` 分屬兩個 capability、兩個缺陷；
`PlayerStatsTable.tsx` 只相依 `player-stats.ts` 的 `draws` 欄位存在。

## Sequence Diagram

```
使用者          /matchmaker/stats     computePlayerStats     PlayerStatsTable
  │                    │                      │                     │
  ├─ 開啟頁面 ────────▶│                      │                     │
  │                    ├─ 讀 history ─────────▶│                     │
  │                    │                      ├─ 逐筆判定 winner    │
  │                    │                      │   "teamA"→wins      │
  │                    │                      │   "teamB"→losses    │
  │                    │                      │   "draw" →draws ★   │
  │                    │                      ├─ winRate = wins÷games（不受 draws 影響）
  │                    │◀── PlayerStat[] ─────┤                     │
  │                    ├─ 渲染 ───────────────────────────────────▶│
  │                    │                      │        勝負和欄：2 - 1 - 1 ★
  │◀─ 看到正確的敗場數 ┤                      │                     │
```

## Task Tree

```
§1 前置確認（不寫產品程式碼）
   └─ 核對 main 已含 M15、盤點 PlayerStat 的所有建構點、確認既有測試的釘法

§2 player-stats.ts 的和局計數                        [unit]
   ├─ RED  平局紀錄計為和局而非雙方各一敗場
   ├─ GREEN PlayerStat/MutableStat 新增 draws、tallyGamesAndResults 三分支
   └─ REFACTOR

§3 PlayerStatsTable 的勝負和欄                       [integration + e2e]
   ├─ RED  勝負和欄依序顯示勝場敗場與和局三個數字
   ├─ GREEN 標題改「勝負和」、內容改三數字
   ├─ E2E 欄名陣列同步（regression guard，加入即綠）
   └─ REFACTOR

§4 到期提示文案                                       [integration]
   ├─ RED  時間到提示文案說明同分可直接送出平手而非再打一球
   ├─ GREEN 換 ROUND_TIMER_EXPIRED_MESSAGE 字串值與其註解
   └─ REFACTOR

§5 收尾驗證
   └─ tsc / lint / 全套單元測試 / player-stats 與 round-timer 兩支 E2E / 機械盤點
```

§2 → §3 有相依（`draws` 欄位必須先存在）。§4 與前兩組**無相依**，但仍依序執行——
本 repo 共用單一工作樹，SHALL NOT 並行派發（見 execution-plan.md）。

## Cross-Cutting Impact

| 面向 | 影響 |
|---|---|
| **持久化資料** | 零。統計為純計算、不落地；`ROUND_TIMER_EXPIRED_MESSAGE` 不落地。三個 LocalStorage key 的 schema 與內容皆不變 |
| **既有歷史** | 修正即回溯生效。`computePlayerStats` 每次載入都重算，使用者不需做任何事 |
| **無障礙** | 勝負和欄仍為純文字數字，未以顏色表達；到期橫幅的 `role="alert"` 與節點結構不變 |
| **響應式** | 勝負和欄多一個數字與一組分隔號，390px 溢出的既有 E2E MUST 實跑（design Risks） |
| **後端** | 零。`hono-pickball/**` 不動 |
| **相依套件** | 零。不新增任何 npm 套件 |
| **型別安全** | `draws` 為必填新欄位，所有以物件字面量建構 `PlayerStat` 的測試 helper 會被 `tsc` 逐一點名——這是刻意的編譯期安全網 |
