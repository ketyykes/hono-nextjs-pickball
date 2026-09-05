# matchmaker-player-stats（M11：球員統計與排行榜頁）

## Scope

讓 M1～M9 已經記錄下來的歷史賽果變成一頁排行榜：新增 `/matchmaker` 區段導覽第五個分頁
「統計」，彙總每位球員的出場、勝負、勝率、目前強度、強度淨變化、最常搭檔與最常對手，
並沿用歷史頁既有的五個時間區間篩選。

**Size**: medium — 影響 2 個 capability（`player-stats` 新增、`match-stage` 有 1 個
Requirement 變動），新增一個純函式模組（`lib/matchmaker/player-stats.ts`），符合規模表
「medium：影響 2-3 capabilities…或新增一個模組」的判定條件；未達「≥4 capabilities 或
tasks > 20」的 large 門檻。

**Frontend involved**: yes — 新增路由、新元件（排行榜表格）、新的分頁入口，皆為視覺與互動。

**DB schema touched**: no — 不新增、不修改任何 LocalStorage schema 或 storage key；
純粹是既有 `matchmaker:history:v1`／`matchmaker:roster:v1` 的新唯讀消費端。

**Data migration**: no — 不搬移、不轉換任何既有資料。

**Cross-component flow**: no — 資料流是「hook 提供的即時狀態 → 純函式計算 → 呈現」的
單向同步流程，沒有非同步任務、webhook、排程或多服務協作，不需要獨立的時序圖；
Architecture 圖已足以說明模組間的依賴關係。

---

## What Changes

- matchmaker 區段導覽新增第五個分頁「統計」（`/matchmaker/stats`）
- 新增純函式 `lib/matchmaker/player-stats.ts`：由「目前名單＋歷史紀錄」算出每位球員的
  出場、勝負、勝率、目前強度、強度淨變化、最常搭檔、最常對手，並依固定規則排序
- 新增排行榜表格元件與統計頁，沿用歷史頁既有的區間篩選（五個區間）與空狀態元件
- 全程唯讀：不寫入 LocalStorage、不修改回合或名單、不新增 hook、不新增 npm 相依

前後對照（純文字，不含 UI 細節）：

```
=== Before ===

  matchmaker 區段導覽 : 對戰 / 參賽者 / 歷史 / 資料（四個分頁）
  想知道誰的勝率最高   : 只能到 /matchmaker/history 一場一場翻紀錄卡片，自己心算加總
  歷史資料的彙總呈現   : 無
  package.json         : matchmaker 全段自 M1 起零外部相依

=== After ===

  matchmaker 區段導覽 : 對戰 / 參賽者 / 歷史 / 資料 / 統計（五個分頁）
  想知道誰的勝率最高   : 開啟 /matchmaker/stats 直接看排行榜，可切換五個時間區間
  歷史資料的彙總呈現   : 出場 / 勝負 / 勝率 / 目前強度 / 強度淨變化 / 最常搭檔 / 最常對手
  package.json         : 仍是零外部相依  <- 刻意維持
```

---

## UI Mockups

以下依使用順序列出四個 state。`←` 之後為註解，不是畫面文字。

```
=== State 1: 完全沒有歷史紀錄（引導型空狀態） ===

┌─ /matchmaker/stats ───────────────────────────────────────┐
│ 對戰  參賽者  歷史  資料  [統計]                           │
├───────────────────────────────────────────────────────────┤
│           ┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐                     │
│           :   還沒有任何對戰紀錄     :  ← EmptyHistory     │
│           :  完成對戰後才會有紀錄， :     range=null       │
│           :  請先前往對戰頁安排比賽  :                     │
│           └ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘                     │
└───────────────────────────────────────────────────────────┘

=== State 2: 有歷史紀錄，顯示排行榜（今日區間，預設選中） ===

┌─ /matchmaker/stats ───────────────────────────────────────┐
│ 對戰  參賽者  歷史  資料  [統計]                           │
├───────────────────────────────────────────────────────────┤
│ (●)今日 ( )本週 ( )本月 ( )上月 ( )更早    ← 沿用歷史頁    │
├───────────────────────────────────────────────────────────┤
│名次│球員          │強度│出場│勝-負│勝率│淨變化│常搭檔│常對手│
│ 1  │■王大明       │5.20│ 4  │3-1 │75%│+0.18│陳小美│李小華│
│ 2  │■陳小美       │4.60│ 4  │3-1 │75%│+0.09│王大明│李小華│
│ 3  │■李小華(已不在名單)│4.10│ 2│0-2 │0% │-0.06│—    │王大明│
│                                              ← 灰底色塊    │
└───────────────────────────────────────────────────────────┘
                    │
                    │ 切換區間 ( )本月
                    ▼

=== State 3: 切換到「本月」，統計數字重新計算 ===

┌─ /matchmaker/stats ───────────────────────────────────────┐
│ ( )今日 ( )本週 (●)本月 ( )上月 ( )更早                    │
├───────────────────────────────────────────────────────────┤
│名次│球員          │強度│出場│勝-負│勝率│淨變化│常搭檔│常對手│
│ 1  │■王大明       │5.20│ 9  │6-3 │67%│+0.31│陳小美│李小華│
│                     ← 強度不受區間影響, 出場/勝負/淨變化改變│
└───────────────────────────────────────────────────────────┘

=== State 4: 窄螢幕（390px），表格於自身容器橫向捲動 ===

┌─ 390px ──────────────┐
│ 對戰 參賽 歷史 資料 統計│
├───────────────────────┤
│(●)今日( )本週( )本月…  │
├───────────────────────┤
│名次│球員      │強度│…▶│ ← 表格可左右捲動，頁面本身不橫向溢出
│ 1  │■王大明   │5.20│…│
└───────────────────────┘
```

---

## Architecture

**唯一的統計真相來源是 `computePlayerStats`**：頁面把兩個既有 hook 的輸出接上區間篩選，
再交給這個純函式，最後把結果原樣傳給呈現層。瀏覽器 I/O（LocalStorage 讀取）完全發生在既有
hook 內部，本 change 不新增任何一處。

```
  hooks/useRosterStore.ts (既有)      hooks/useRoundStore.ts (既有)
         │ players                          │ history
         └──────────────┬───────────────────┘
                         ▼
        app/matchmaker/stats/page.tsx  ← 本 change 新增, 例外層
          │  useState(selectedRange)
          │
          ├─uses─► lib/matchmaker/history-range.ts (M7, 唯讀重用)
          │           filterHistoryByRange(history, range, now)
          │           │
          │           ▼
          │        filteredHistory
          │           │
          ├─uses─► lib/matchmaker/player-stats.ts  (新增, 純函式, unit)
          │           computePlayerStats(filteredHistory, players)
          │           │  reuses ─► colors.ts (pickTextColor，元件層引用)
          │           ▼
          │        PlayerStat[]  { id,name,colorFrom,colorTo,onRoster,
          │                        currentRating,gamesPlayed,wins,losses,
          │                        winRate,ratingDelta,
          │                        mostFrequentPartner,mostFrequentOpponent }
          │
          ├── history.length===0 ──► components/matchmaker/EmptyHistory.tsx (M7, 唯讀重用)
          │
          └── 否則 ──► components/matchmaker/PlayerStatsTable.tsx (新增, integration)
                          │ uses colors.ts pickTextColor
                          │ uses labels.ts PLAYER_NOT_ON_ROSTER_LABEL (新增)
                          ▼
                       排行榜表格（components/ui/table.tsx，內建橫向捲動）

  同時掛載：components/matchmaker/HistoryRangeFilter.tsx (M7, 唯讀重用)
           驅動上方 selectedRange

  lib/matchmaker/section-nav.ts (修改)：MATCHMAKER_SECTION_HREFS 新增
    "/matchmaker/stats"，供 components/matchmaker/MatchmakerTabs.tsx (既有) 渲染第五分頁

  npm 相依：零新增
```

