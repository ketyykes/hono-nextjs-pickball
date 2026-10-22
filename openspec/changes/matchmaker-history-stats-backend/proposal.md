# Proposal: matchmaker-history-stats-backend

## Why

runbook B8：B7 起登入時歷史已由後端在送出比分的 batch 內寫入 `matchmaker_history`，但歷史頁、統計頁、歷史 CSV 與 JSON 匯出的 `history` 仍讀本機（B7 過渡期限制）——
登入的使用者看不到自己剛打完的賽果，統計頁在雲端模式為空。本 change 補上**唯讀**的歷史 API，讓這四處在登入時改讀雲端，並刪除 B6 留下的過渡函式 `resetLocalMatchProgress()`。

歷史**只增不改**：沿用 `user-data-sync`「多筆使用者資料的逐筆版本化契約」的「列出」，不提供 PUT／DELETE／批次附加（寫入只發生在 B7 的送出比分 batch，重置在 B6／B7 的 reset batch）。

**前提**：B4～B7 皆已合併並 archive（`matchmaker_history` 含 `played_at` 與 `(user_id, match_id)` 主鍵、`useRemoteRoundStore`、`sync_batch_guards`）。

## What Changes

**後端**
- `GET /api/matchmaker/history?from=<ms>&to=<ms>&order=<desc|asc>`：`{ items: [{ data, version }], total, droppedCount }`。
  `from`（含）／`to`（不含）以 `played_at` 篩選；預設 `order=desc`（`played_at` 由新到舊、同時間依插入順序），`asc` 為完成順序（匯出用）。
  讀取時逐列以 `MatchHistoryEntrySchema` 驗證：不合法者**略過並計入 `droppedCount`、不刪除**；`total` 為本人全部歷史筆數（區分「完全沒有歷史」與「此區間沒有」）。

**核心套件**：`history-range.ts` 新增純函式 `rangeBounds(range, now)`，回傳 `{ from: number | null, to: number | null }`，以屬性測試證明與既有 `rangeOfTime` 判定一致。
**為什麼不是 runbook 草案的 `?range=`**：區間切點依**使用者裝置的本地時區**計算（`computeRangeCutoffs` 用 `new Date(y, m, d)`），
而 Workers runtime 一律以 UTC 執行（Context7 `/cloudflare/cloudflare-docs`：`wrangler dev` 與正式環境皆 `TZ=UTC`）——伺服器端算「今日」會差 8 小時。
切點仍只有一份實作（核心 `history-range.ts`），由前端算出毫秒界線後傳給後端。

**前端**
- `hooks/useRemoteHistory.ts`（`{ enabled, range, onUnauthorized }` → `{ items, total, droppedCount, syncStatus }`）、`lib/sync/history-api.ts`。
- 歷史頁與統計頁：雲端模式改渲染新的雲端內容元件（`components/matchmaker/RemoteHistoryView.tsx`、`components/matchmaker/RemoteStatsContent.tsx`），本機元件與程式路徑不動。
  損毀提示沿用同一文案；排序、空狀態、平局統計（`2026-09-14-matchmaker-draw-followups`）行為不變。
- 資料頁（登入時）：JSON 匯出的 `history` 與歷史 CSV 匯出改取雲端（`order=asc`）。
- 刪除 `resetLocalMatchProgress()`：登入時重置名單不再清除任何本機 key。

**文件**：兩份 CLAUDE.md 的「歷史讀取待 B8」敘述改寫。

### 明確不做

- 歷史的修改、刪除單筆、批次附加 API（只增不改；匯入屬 B9）。
- 統計在後端計算（統計仍由前端 `computePlayerStats` 以雲端歷史計算，與本機同一份實作）。
- 分頁（單一使用者的歷史量級以千筆計，見 design Risks）。

## Capabilities

### New Capabilities

（無）

### Modified Capabilities

- `match-history`：新增「登入時歷史以雲端為準」；「歷史頁唯讀消費既有紀錄」與「損毀歷史紀錄的可見提示」加入雲端分支。
- `player-stats`：「統計依區間篩選」「空狀態的呈現」「統計頁的可用性、無障礙與唯讀保證」加入雲端分支。
- `player-roster`：「重置名單與二次確認」的登入分支不再清除本機資料（刪除 `resetLocalMatchProgress`）。
- `data-transfer`：「登入時的資料工具頁」的 `history` 與歷史 CSV 改取雲端。
- `pickleball-guide-page`：hooks 歸屬清單加入 `useRemoteHistory → match-history`。

## Impact

- **後端**：`src/routes/matchmaker.ts`（加 `/history`）、新增 `src/matchmaker/history-repository.ts`；測試新增 `test/matchmaker-history.test.ts`。**無 migration**。
- **核心套件**：`src/matchmaker/history-range.ts`（新增 `rangeBounds`，既有函式不改）、`src/api/history.ts`（查詢與回應 schema）；新增測試 `test/matchmaker/history-range-bounds.test.ts`、`test/api/history.test.ts`；`CORE_MODULES` 加 `api/history`。
- **前端**：新增 `hooks/useRemoteHistory.ts`、`lib/sync/history-api.ts`、`components/matchmaker/{RemoteHistoryView,RemoteStatsContent}.tsx`；
  修改 `app/matchmaker/{history,stats}/page.tsx`、`lib/matchmaker/remote-transfer.ts`、`components/matchmaker/HistoryCsvSection.tsx`（雲端分支）、`hooks/useRemoteRosterStore.ts`、`lib/matchmaker/storage.ts`（刪除函式）；
  E2E `tests/e2e/user-data/history-sync.spec.ts`。
- **允許修改的既有測試**：`lib/matchmaker/storage.test.ts` 刪除 B7 改寫的 `resetLocalMatchProgress` it；`hooks/useRemoteRosterStore.test.tsx` 改寫 B7 的「resetRoster 成功後清空名單並只清除本機歷史」；
  `lib/matchmaker/remote-transfer.test.ts` 改寫 B7 的「雲端備份快照…」it（三者名稱與斷言依本 change 的 delta）；其餘既有 it 一律不改。
- **主 spec 例外同步**：依 B3／B5～B7 先例，tasks 授權同步 `pickleball-guide-page` 歸屬清單那一句。
- **相依**：**不新增任何第三方套件**。
- **訪客／正式站**：零變更（本機元件與 `history-range.ts` 既有函式一行不改；auth 停用時新端點回 404）。
