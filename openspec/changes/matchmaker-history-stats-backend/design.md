# Design: matchmaker-history-stats-backend

## Context

- 前提：B4～B7 已合併並 archive。B7 建立 `matchmaker_history(user_id, match_id PK, played_at ms, data, version=1, updated_at)`，由送出比分的 batch 寫入；
  雲端模式的 `useRemoteRoundStore` 的 `history` 恆為空陣列；`resetLocalMatchProgress()` 只剩清本機歷史（B7 過渡）。
- 歷史頁：`app/matchmaker/history/page.tsx` → `HistoryView`（effect 內 `readHistory()`＋`new Date()`，`filterHistoryByRange`，`droppedCount` 提示，`EmptyHistory range={null|range}`）。
- 統計頁：`useRosterStore`＋`useRoundStore().history` → `computePlayerStats(filterHistoryByRange(...), players)`；`history.length === 0` 時引導型空狀態。
- 資料頁：`JsonBackupSection` 雲端分支經 `buildRemoteBackupSnapshot()`（B7：players／currentRound 雲端、history 本機）；`HistoryCsvSection` 以 `readSnapshot().history`＋`historyToCsv`。
- 核心 `history-range.ts`：`computeRangeCutoffs(now)` 以 `new Date(y, m, d)` 取**本地時區**的日／週／月起點；`rangeOfTime(time, now)`；`filterHistoryByRange`（以穩定排序依時間由新到舊）。

## Goals

- 登入時歷史頁、統計頁、歷史 CSV、JSON 匯出的 `history` 讀雲端；行為（排序、區間、空狀態、損毀提示、平局統計）與本機一致。
- 區間定義仍只有一份實作；不因伺服器時區產生偏移。
- 刪除過渡函式 `resetLocalMatchProgress()`。

## Non-Goals

- 歷史寫入 API（只增不改）；後端統計；分頁；匯入（B9）。

## Decisions

### Decision 1：區間界線由前端以核心 `rangeBounds` 計算，API 收毫秒界線

**Choice**：核心新增 `rangeBounds(range, now) → { from, to }`（以 `computeRangeCutoffs` 的 `c0..c3` 組出半開區間）；`GET /api/matchmaker/history?from=&to=` 以 `played_at` 篩選。

**Rationale**：
- Context7（`/cloudflare/cloudflare-docs`，`workers/local-development` 與 `wrangler/commands/workers#dev`）：「The local workerd runtime runs with `TZ=UTC` … matching the production Cloudflare runtime」——
  伺服器上 `new Date(y, m, d)` 是 UTC 午夜，台灣使用者的「今日」會從早上 8 點才開始。
- 讓後端接 `range` 再另收時區參數，等於在後端重寫一份切點計算（且 Workers 的 `Intl` 時區支援範圍需要另外查證）；前端算毫秒界線則切點只有核心一份實作。
- `rangeBounds` 與 `rangeOfTime` 的等價以屬性式樣本測試守住（含切點前後 1 毫秒、跨月週）。

**Alternatives considered**：
- `?range=today&tz=Asia/Taipei`：後端需依時區計算週一與月初，與核心 `computeRangeCutoffs` 成為兩份實作。不選。
- 一次取回全部歷史、前端沿用 `filterHistoryByRange`：最簡單，但每切一次區間都傳全部資料，且 `total` 與 `droppedCount` 仍要另算。歷史是持續累積的資料，不選；
  匯出功能則確實需要全部（`order=asc`、不帶界線）。

### Decision 2：排序與 `total`、`droppedCount`

**Choice**：`desc` = `ORDER BY played_at DESC, rowid ASC`；`asc` = `ORDER BY played_at ASC, rowid ASC`。`total` = `SELECT COUNT(*) … WHERE user_id = ?`（不受界線影響）。
讀出後逐列 `MatchHistoryEntrySchema.safeParse`，失敗者略過並計數，不刪除。

**Rationale**：
- `filterHistoryByRange` 以穩定排序把同時間的紀錄維持在追加順序；`rowid ASC` 是雲端的追加順序（B7 以插入順序保存），兩者結果相同。
- `total` 讓前端區分「完全沒有歷史」（引導型空狀態）與「此區間沒有」（區間空狀態），對應既有 `EmptyHistory` 的兩種 `range`。
- 本機的逐筆降級會「回寫清理」；雲端不刪：寫入前已驗證，損毀只可能來自未來的 schema 變更，保留原列才有機會以新版 schema 救回。

### Decision 3：前端——`useRemoteHistory` 與雲端內容元件，本機元件不動

**Choice**：`hooks/useRemoteHistory.ts`（只採用最後一次請求：以遞增的請求序號比對）；`components/matchmaker/RemoteHistoryView.tsx`、`RemoteStatsContent.tsx`；
兩個頁面以 `resolveStorageMode(useSession())` 擇一渲染本機或雲端元件。`RemoteStatsContent` 只掛 `useRosterStore` 與 `useRemoteHistory`，不掛 `useRoundStore`。

**Rationale**：React hooks 不能條件呼叫；把雲端路徑放進獨立元件，本機的 `HistoryView` 與統計頁本機內容一行不動，訪客零迴歸可由 `git diff` 直接證明。
統計頁不再掛回合 store，也順便消除「看統計卻讀回合與分槽」的多餘請求（`player-stats` 唯讀保證 MODIFIED）。

**Alternatives considered**：在 `HistoryView` 內加分支：需要同時呼叫本機 effect 與雲端 hook 並以 `enabled` 關閉其中一個，本機元件被改動。不選。

### Decision 4：資料頁改讀雲端歷史

**Choice**：`remote-transfer.ts` 新增 `fetchRemoteHistoryForExport()`（`order=asc`）與 `buildRemoteHistoryCsv()`；`buildRemoteBackupSnapshot()` 的 `history` 改取雲端；
`HistoryCsvSection` 依模式分支（本機分支不動）。

**Rationale**：匯出要的是「全部、完成順序」，與本機 `matchmaker:history:v1` 的追加順序一致，`historyToCsv`／`buildBackup` 不需要任何改動。

### Decision 5：刪除 `resetLocalMatchProgress()`

**Choice**：雲端重置成功後不清除任何本機 key；刪除函式與其 it（B7 改寫過的那個）。

**Rationale**：B8 起雲端模式完全不讀寫本機的名單、回合、分槽與歷史；本機資料只剩「訪客時期的資料」一種意義，是 B9 匯入的來源，不應因登入時的重置而消失。

### Decision 6：核心 `api/history.ts`

**Choice**：`HistoryQuerySchema`（`from`／`to` 以 `z.coerce.number().int().nonnegative()`、`order` 列舉、`from < to` 的 refine）、`HistoryListResponseSchema`；`CORE_MODULES` 加一項。

## Risks / Trade-offs

- [Risk] 單一使用者的歷史筆數成長後，匯出（不帶界線）一次回傳全部 → 以千筆計約數百 KB，在 Worker 回應與前端記憶體的合理範圍內；若日後超過，再加分頁（不影響本 change 的契約，`order` 已固定）。
- [Risk] `playedAt` 自 B7 起為伺服器時間；B9 匯入的本機歷史則是裝置時間——兩者混在同一張表中排序，若裝置時鐘偏差很大，排序會與實際先後不同。屬資料本身的限制，不處理。
- [Risk] `range` 快速切換的競態 → 只採用最後一次請求（有測試）。
- [Trade-off] 雲端不做損毀列的回寫清理（Decision 2）。
- [Trade-off] 統計仍在前端計算：歷史以區間取回後量級小，且平局等統計語意只維護一份。

## Migration Plan

- 無 migration（B7 已建表）。合併後無需額外步驟。正式站零變更（auth 停用）。**不 push**（D4）。回滾：revert 合併 commit。

## 交接給 B9

1. 匯入的歷史 MUST 寫入 `played_at`（`Date.parse(playedAt)`），否則 B8 的區間查詢會漏掉。
2. 匯入的歷史以 `asc` 讀回時，順序為 `played_at`＋插入順序；匯入時 MUST 依本機的追加順序插入，才能讓同時間的紀錄維持原順序。
3. `resetLocalMatchProgress()` 已刪除；登入時重置不碰本機，本機五個 key 皆可作為匯入來源。

## Open Questions

1. `z.coerce.number()` 對空字串會轉成 0（`?from=` 被視為 0），§1 決定是否以 `z.string().regex(/^\d+$/)` 再轉數字（建議後者，並把「空字串」加入 400 的測試樣本）。
2. `RemoteStatsContent` 在名單 `load-failed`、歷史 `synced` 時的呈現：沿用 B6「名單載入失敗以 `SyncStatusNotice` 取代內容」，§7 E2E 驗證。
