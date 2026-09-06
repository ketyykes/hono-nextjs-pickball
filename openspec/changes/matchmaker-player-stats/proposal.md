# Proposal: matchmaker-player-stats

## Why

本 change 是「對戰分配機」交付序 M10～M15 的 **milestone M11（球員統計與排行榜頁）**，位置如下：

```
M10 已知缺口修補（stage-gaps） → 【M11 球員統計與排行榜頁（本 change）】
   → M12 計分板隊伍標籤 → M13 換人 → M14 回合計時器 → M15 限時抽籤
```

## 執行相依

本 change 的 worktree **從 `main` 開出**，因此下列 change MUST 先合併回 `main`：

| 相依 change | milestone | 本 change 用到什麼 |
|---|---|---|
| `matchmaker-stage-gaps` | M10 | 無直接程式碼相依——M10 不觸及 `lib/matchmaker/section-nav.ts`、`lib/matchmaker/history.ts` 或任何本 change 消費的模組。相依純屬「序列執行」的排程規定：M10～M15 依序合併，本 change 的 worktree 一律從「M10 已合併」的 `main` 開出 |

若 apply 的 Step 0 發現 `main` 上 M10 尚未合併，MUST 停止並回報，SHALL NOT 在本 change 內補做 M10。

## Why（續）

本 change 源自 2026-09-03 的功能探索（項目 A1）：M1～M9 交付的資料模型已完整記錄每一場對戰的
參與球員與分數變化——`nextjs-pickball/lib/matchmaker/history.ts` 的 `HistoryPlayerSchema`
每筆皆帶 `id`／`name`／`ratingBefore`／`ratingAfter`，`MatchHistoryEntrySchema` 另帶
`winner`／隊伍組成。這些欄位齊全到足以回答「誰的勝率最高」「誰最近進步最多」「誰最常跟誰
搭檔」，但目前唯一的消費端是 M7 的歷史頁（`/matchmaker/history`），呈現方式是逐場的紀錄卡片
——使用者必須自己一場一場翻、自己心算加總，才能得到這些答案。資料齊全、只差一頁彙總呈現。

## What Changes

- 新增路由 `/matchmaker/stats`（球員統計與排行榜頁），於 matchmaker 區段導覽新增第五個分頁
  「統計」。分頁清單由 `lib/matchmaker/section-nav.ts` 的 `MATCHMAKER_SECTION_HREFS` 組成，
  沿用既有 `MATCHMAKER_ROUTE` 常數與 `matchmakerSectionTabs()` 的推導方式，不另立第二套判定。
- 新增純函式模組 `nextjs-pickball/lib/matchmaker/player-stats.ts`：輸入目前歷史紀錄
  （`MatchHistoryEntry[]`）與目前參賽者名單（`Player[]`），以 `HistoryPlayer.id` 為鍵計算每位
  球員的出場數、勝、負、勝率、目前強度、強度淨變化、最常搭檔與最常對手，並依固定規則排序為
  排行榜。球員範圍為「目前名單成員」與「歷史紀錄中出現過的球員」的聯集——名單查無其 id 者
  （已被刪除）仍列入結果，目前強度改取其在傳入歷史中最近一筆的 `ratingAfter`，並標示為
  已不在名單。
- 新增元件 `nextjs-pickball/components/matchmaker/PlayerStatsTable.tsx`：純呈現的排行榜表格，
  接收已計算好的統計陣列為 props，欄位為名次、球員（色塊＋姓名）、強度、出場、勝負、勝率、
  淨變化、常搭檔、常對手。
- 新增頁面 `nextjs-pickball/app/matchmaker/stats/page.tsx`：`"use client"`，比照
  `app/matchmaker/page.tsx` 的既有形態直接持有 `useRosterStore()` 與
  `useRoundStore({ players, updatePlayer })` 兩個既有 store（**不新增任何 hook**），取其
  `players` 與 `history` 作為輸入；區間篩選沿用 M7 既有的
  `lib/matchmaker/history-range.ts`／`components/matchmaker/HistoryRangeFilter.tsx`
  五個區間，篩選後的歷史紀錄再交給 `player-stats.ts` 計算。完全沒有歷史紀錄時顯示
  `components/matchmaker/EmptyHistory.tsx` 的引導型空狀態（`range={null}`），不顯示空表格。
- **本頁全程唯讀**：不寫入任何 LocalStorage、不修改回合或名單、不呼叫任何 store 的 setter、
  不發出任何網路請求。

### 明確不做

- **不畫 Elo 走勢圖／任何圖表**。`prd.md` 8.2 只列數值與文字欄位，未要求趨勢視覺化；新增圖表
  相依也會打破 matchmaker 全段自 M1 起「零外部相依」的既有狀態（`nextjs-pickball/package.json`
  的 dependencies 至今未因 matchmaker 新增任何套件，M9 的 design Decision 1 亦是同一立場）。
  若日後確有需求，屬另一個 change 的選型決策，列為本 change 的 Open Question。
- **不做排行榜的 JPG／PDF 匯出**。M9（`matchmaker-visual-export`）的匯出範圍明訂為「目前回合」，
  其 proposal 的「不在本次範圍」已排除歷史與統計相關輸出；排行榜若要匯出需要重新走一輪
  `ExportScene`／`PrintSheet` 等價的設計決策，留待後續 change。
- **不做跨裝置**。`prd.md` §14「後續版本方向」只列一項候選——「資料層由 LocalStorage 改為
  線上版」，且明寫「這些細節待該階段另立文件，不在本 PRD 範圍」；§15 決策摘要「產品形態」一列
  同樣寫明「純線上網頁版，不做原生 App 或離線封裝」。`nextjs-pickball/CLAUDE.md` 已將 matchmaker
  定性為 LocalStorage-only 純前端功能，本 change 不改變這個立場——排行榜只反映**目前這台裝置**
  的歷史與名單。
- **不改歷史 schema**。`lib/matchmaker/history.ts` 的 `HistoryPlayerSchema`（`id`／`name`／
  `ratingBefore`／`ratingAfter`）與 `MatchHistoryEntrySchema`（隊伍、比分、`winner`）已含本
  change 計算統計所需的全部欄位，本 change 是純粹的新唯讀消費端，不新增、不修改任何欄位，
  也不 bump `matchmaker:history:v1` 的 storage key。

## Capabilities

### New Capabilities

- `player-stats`：球員統計與排行榜規格——統計資料的計算範圍與唯讀保證、出場／勝負／勝率的
  計算、目前強度與已離開名單球員的標示、強度淨變化的計算、最常搭檔與最常對手的計算、排行榜
  排序規則、統計依區間篩選、統計頁的路由與呈現、空狀態的呈現，以及統計頁的可用性、無障礙與
  唯讀保證。

### Modified Capabilities

- `match-stage`：「對戰頁路由與 matchmaker 區段動線」新增第五個分頁「統計」
  （`/matchmaker/stats`）納入區段導覽，分頁清單與 active 判定沿用既有
  `lib/matchmaker/section-nav.ts` 的推導方式，不另立第二套邏輯。

> 未列入 Modified 的 capability 與理由：
> - `match-history`：本 change 唯讀消費 `MatchHistoryEntry[]`，不新增、不修改
>   `match-history` 的任何 requirement，也不改動歷史紀錄的欄位或寫入路徑。
> - `player-roster`：本 change 唯讀消費 `Player[]`，不修改參賽者名單的任何 requirement。
> - `round-lifecycle`：本 change 經 `useRoundStore` 取得 `history`，僅唯讀消費，不影響回合
>   生命週期的任何 requirement。
> - `pickleball-guide-page`：本 change **不新增任何 hook**，因此不觸發該 capability 的
>   「互動行為由三支 hooks 提供且各有 smoke test」歸屬清單更新義務。
> - `visual-export`：本 change 不新增匯出路徑，也不修改 `ExportScene`／`PrintSheet` 的任何
>   既有 requirement。

## Impact

- **新增**：
  - `nextjs-pickball/lib/matchmaker/player-stats.ts`（統計計算，純函式）與
    `player-stats.test.ts`
  - `nextjs-pickball/components/matchmaker/PlayerStatsTable.tsx`（排行榜表格，純呈現）與
    `PlayerStatsTable.test.tsx`
  - `nextjs-pickball/app/matchmaker/stats/page.tsx`（**例外層**：頁面組裝與 store 接線，
    以 E2E 驗收）
  - `nextjs-pickball/tests/e2e/specs/player-stats.spec.ts`
- **修改**：
  - `nextjs-pickball/lib/matchmaker/section-nav.ts`（`MATCHMAKER_SECTION_HREFS` 新增
    `/matchmaker/stats`，`MATCHMAKER_SECTION_LABELS` 新增對應的「統計」標籤）——**本 change
    唯一觸碰的既有 match-stage 檔案**
  - `nextjs-pickball/lib/matchmaker/section-nav.test.ts`（既有的分頁清單 regression guard
    需同步改為五筆；詳見 tasks.md「本 change 唯一容許變動的既有測試」）
  - `nextjs-pickball/tests/e2e/specs/match-stage.spec.ts`（新增一條「可由對戰頁的區段導覽
    點擊進入統計頁」）
  - `nextjs-pickball/lib/matchmaker/labels.ts`（新增 `PLAYER_NOT_ON_ROSTER_LABEL` 具名常數，
    供 `PlayerStatsTable.tsx` 顯示「已不在名單」標示，純新增不改動既有匯出）
  - `nextjs-pickball/CLAUDE.md` 的架構總覽（`/matchmaker` 段落補記 `/matchmaker/stats`）
- **重用（唯讀，不修改）**：`hooks/useRosterStore.ts`、`hooks/useRoundStore.ts`（既有 hook，
  本 change 不新增 hook）、`lib/matchmaker/history-range.ts`、
  `components/matchmaker/HistoryRangeFilter.tsx`、`components/matchmaker/EmptyHistory.tsx`、
  `lib/matchmaker/colors.ts` 的 `pickTextColor`、`lib/matchmaker/types.ts` 的 `Player`、
  `lib/matchmaker/history.ts` 的 `MatchHistoryEntry`／`HistoryPlayer`
- **無外部相依**：**不新增任何 npm 套件**。
- **不動**：`hono-pickball/**`（matchmaker 依 `prd.md` 為 LocalStorage-only 純前端功能）、
  `hooks/`（不新增任何 hook）、`lib/matchmaker/history.ts`（歷史 schema 不變）、M5～M9 既有
  元件檔（`MatchStage`／`CourtCard`／`RoundControls`／`RestingPanel`／`ExportActions`／
  `PrintSheet`／`HistoryView`／`HistoryRecordCard` 等皆不改動）。
