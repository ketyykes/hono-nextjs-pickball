# Proposal: session-pending-loading

## Why

正式站登入後重新整理 `/matchmaker/players`，畫面會先閃一下空名單、再顯示「載入中」、最後才出現雲端資料（使用者回報，coordinator 已診斷）。閃的來源有兩段：

1. **hydration 前**：頁面是預先渲染的 client component，本機資料要到 effect 才讀入，伺服器輸出（JS 載入前的畫面）一律是空名單、空舞台、0:0、空歷史——訪客與登入者都會先看到。
2. **session 確認前**：`resolveStorageMode` 在 `/api/session` 回應前一律回 `"local"`，選擇器交出本機（常為空的）資料；資料頁的本機匯入、還原、匯出按鈕在這段時間甚至可以對本機資料動手。

使用者定案採**方案 B**（瀏覽器記住「上次確認時是登入狀態」的提示，不做伺服器端判斷），並決定擴大範圍：盤點全站同類閃爍一併處理，且認可「SSR／hydration 前一律先顯示載入中，hydration 後訪客立刻顯示本機資料」。
全站盤點（design「盤點清單」）查證後需處理 9 項（參賽者、對戰、統計、歷史、獨立與綁定計分板、資料頁三個區塊），不處理 8 項（6 項查證不會閃，2 項不屬資料狀態且方案 C 也無解）。

## What Changes

- **統一的「資料就緒」判斷**（design Decision 1）：資料來源未定分兩層——**儲存模式未定**（伺服器輸出、hydration、有提示時的 session 等待中）與**本機資料尚未讀入**——兩層都以同一個顯示狀態 `"pending"` 呈現，頁面一律以 `isContentBlocked(status)` 決定是否以提示取代內容。
- **顯示狀態與文案**（`lib/sync/sync-status.ts`）：新增 `DataStatus = SyncStatus | "pending"`、`DATA_PENDING_MESSAGE`（「正在載入資料…」，唯一新增文案，不指涉本機或雲端）、`isContentBlocked`；`SyncStatusNotice` 支援 `pending`。`SyncStatus` 的 8 個值與文案不變。
- **上次登入提示**（新模組 `lib/auth/session-hint.ts`）：localStorage key `auth:signed-in-hint:v1`，只存固定值 `"1"`，不存任何個資；session 確認為已登入時寫入，其餘結果清除；`signOut()` 成功時立即清除；有提示的等待最多 10 秒。
- **session**：client 端在 session 尚未回應且有提示時，初始快照為 `{ status: "loading", signedInHint: true }`，server snapshot 仍為 `{ status: "loading" }`；`useSession()` 另回傳 `hydrated`（伺服器端與 hydration 時為 false）。
- **儲存模式第三態**：`resolveStorageMode` 回傳 `"local" | "remote" | "pending"`；loading 且（有提示或 `hydrated === false`）時為 `"pending"`。
- **選擇器**：`useRosterStore`、`useRoundStore`、`useScoreboardStore` 在 `"pending"` 時回傳空資料＋`syncStatus: "pending"`＋操作不生效（不交出本機資料、不啟用雲端 hook；綁定計分板為 `pending`，不閃「場次已失效」）；在 `"local"` 但本機尚未讀入時 `syncStatus` 為 `"pending"`，讀入的同一次 render 轉為 `"local"`。
- **頁面與元件**：參賽者頁、對戰頁、`LocalStatsContent`、`RemoteStatsContent`、`Scoreboard` 改用 `isContentBlocked`；`HistoryModeSwitch` 與 `HistoryView` 在未定時顯示等待中；統計頁入口在未定時不掛雲端內容；資料頁 JSON 備份、歷史 CSV、名單 CSV 三區塊在未定時以提示取代操作區。
- **訪客**：JS 載入前看到「正在載入資料…」，hydration 後本機資料讀入即直接顯示本機資料，中間不出現空狀態；`local` 時 DOM 與 `data-sync-status` 與現在相同。
- **BREAKING（規格層）**：`user-data-sync`「前端依 session 選擇儲存模式」由兩態改為三態並刪除「已登入者先看到本機資料一瞬間」的取捨；`match-history`「首次伺服器輸出 SHALL 為空狀態」改為等待中提示；選擇器與頁面在 `player-roster`、`round-lifecycle`、`scoreboard` 的「本機模式 `syncStatus` 恆為 `local`」「`loading`／`load-failed` 時取代」改為含 `pending`。

### 明確不做

- 伺服器端判斷登入狀態（方案 C）、改後端、改 `/api/session` 契約。
- 首頁導覽列與目錄的捲動樣式、減少動態偏好在 hydration 前的預設值（不屬資料狀態，伺服器端也無從得知，只能靠 inline script；design Non-Goals）。
- 登入入口改顯示頭像、本機資料自動匯入雲端、session 失敗的重試或等待中以外的新文案。
- 新增 hook（hydration 旗標與提示都經既有 `useSession` 帶出）、新增 npm 相依、migration。

## Capabilities

### New Capabilities

（無）

### Modified Capabilities

- `user-data-sync`：MODIFIED「前端依 session 選擇儲存模式」（三態、兩個 `pending` 條件、選擇器的本機讀入前狀態）；ADDED「資料來源確定前的等待中畫面」（顯示狀態與判斷、選擇器、頁面與元件、六條 E2E）。
- `auth`：MODIFIED「全頁共用的 session store 與 useSession」（帶提示的初始快照、10 秒逾時、`useSession().hydrated`）；ADDED「上次登入提示的儲存與清除」。
- `player-roster`：MODIFIED「登入時名單以雲端為準」——選擇器三態分流、本機 `syncStatus` 讀入前為 `pending`、頁面以 `isContentBlocked` 取代內容，其餘全文不變。
- `round-lifecycle`：MODIFIED「登入時回合與場次分槽以雲端為準」——同上。
- `scoreboard`：MODIFIED「登入時獨立計分板以雲端為準」——選擇器 `pending` 結果、本機 `syncStatus` 讀入前為 `pending`、`Scoreboard` 以 `isContentBlocked` 取代畫面，其餘全文不變。
- `match-history`：MODIFIED「歷史頁唯讀消費既有紀錄」——伺服器輸出與讀取完成前為等待中提示，不再是空狀態。
- `data-transfer`：MODIFIED「清除本機資料與其確認流程」——明定上次登入提示 key 不屬清除範圍，新增一個 regression guard Scenario。

## Impact

- **前端產品程式碼**（皆在 `nextjs-pickball/`，共 21 個檔案）：
  - 新增（1）：`lib/auth/session-hint.ts`。
  - 修改（20）：`lib/auth/session-store.ts`、`lib/auth/session-client.ts`（`signOut`）、`hooks/useSession.ts`、`lib/sync/storage-mode.ts`、`lib/sync/sync-status.ts`、`components/sync/SyncStatusNotice.tsx`、
    `hooks/useRosterStore.ts`、`hooks/useRoundStore.ts`、`hooks/useScoreboardStore.ts`、
    `app/matchmaker/players/page.tsx`、`app/matchmaker/page.tsx`、`app/matchmaker/stats/page.tsx`、`components/matchmaker/LocalStatsContent.tsx`、`components/matchmaker/RemoteStatsContent.tsx`、`components/scoreboard/Scoreboard.tsx`、
    `components/matchmaker/HistoryModeSwitch.tsx`、`components/matchmaker/HistoryView.tsx`、`components/matchmaker/JsonBackupSection.tsx`、`components/matchmaker/HistoryCsvSection.tsx`、`components/matchmaker/RosterCsvImportSection.tsx`。
  - 不改：雲端 hook（`hooks/useRemote*.ts`）、`components/matchmaker/LocalDataImportSection.tsx`、`ClearLocalDataSection.tsx`、`LocalImportNotice.tsx`、`RemoteHistoryView.tsx`、`lib/matchmaker/transfer-storage.ts`、`components/layout/**`、`components/auth/**`、quiz／tour／guide 全部、其他 `page.tsx`。
- **測試**：
  - 新增檔（7）：`lib/auth/session-hint.test.ts`、`components/sync/SyncStatusNotice.test.tsx`、`components/matchmaker/HistoryModeSwitch.test.tsx`、`components/matchmaker/HistoryView.test.tsx`、`components/matchmaker/RosterCsvImportSection.test.tsx`、`app/matchmaker/stats/page.test.tsx`、`tests/e2e/specs/data-pending.spec.ts`；
    E2E 輔助新檔 `tests/e2e/helpers/flash-recorder.ts`、`tests/e2e/helpers/hold-session.ts`（暫停與放行 `/api/session` 回應）。
  - 新增 it 的既有檔：`lib/sync/storage-mode.test.ts`、`lib/sync/sync-status.test.ts`、`lib/auth/session-store.test.ts`、`lib/auth/session-client.test.ts`、`hooks/useSession.test.ts`、`hooks/useRosterStore.test.tsx`、`hooks/useRoundStore.test.tsx`、`hooks/useScoreboardStore.test.tsx`、
    `components/matchmaker/JsonBackupSection.test.tsx`、`components/matchmaker/HistoryCsvSection.test.tsx`、`components/matchmaker/LocalDataImportSection.test.tsx`、`lib/matchmaker/transfer-storage.test.ts`、`tests/e2e/user-data/roster-sync.spec.ts`。
  - 新 it 共 33 個（其中 4 個 regression guard：transfer-storage、LocalDataImport、droppedCount、localDataStatus，後兩個為 §3 審查追加；另 2 個真紅 it 為追加：apply 時的計分板等待中 state 參考穩定性，以及合併前驗收發現的歷史頁 StrictMode 損毀筆數提示），前端新測試檔 6 個；新 E2E 6 條（`data-pending.spec.ts` 5 條在五個 browser project 各跑一次、`roster-sync.spec.ts` 1 條在 `user-data`）。
  - **授權修改的既有測試（僅限下列兩處，皆為測試隔離，不改任何 it 名稱與斷言）**：`lib/auth/session-store.test.ts` 與 `hooks/useSession.test.ts` 既有 `describe` 的 `beforeEach` 各加一行 `localStorage.clear()`——store 現在會把提示寫進 localStorage，前一個 it 寫入的提示會讓後面 it 的初始快照多出 `signedInHint`。
- **文件**：`nextjs-pickball/CLAUDE.md` 中「訪客（含 auth 停用、session 載入中）仍全走 LocalStorage」、統計頁「訪客與 session 載入中為 `LocalStatsContent`」、「對戰、參賽者、統計三頁在 loading／load-failed 時」、`lib/sync/`／`lib/auth/` 目錄說明（apply 階段改）。
- **相依**：不新增。**migration**：無。**後端／核心套件**：零變更。
- **使用者可見**：所有人重新整理上述頁面時，JS 載入前看到「正在載入資料…」而非空名單或 0:0；訪客在本機資料讀入時直接看到資料；登入者在 session 與雲端資料到達前只看到等待中提示；提示殘留（例如 cookie 過期）時第一次重新整理短暫等待後回到本機畫面。
