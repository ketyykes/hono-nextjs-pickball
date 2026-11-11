# Proposal: session-hint-failure-no-local-fallback

## Why

上一個 change（`session-pending-loading`）讓帶「上次登入提示」的使用者在 session 確認前只看到等待中，但留下兩條**悄悄退回本機**的路徑：
① `fetchSession()` 失敗（非 200、形狀不符、網路錯誤）一律 fail-closed 為 `{ authEnabled: false, user: null }`，store 採用後清除提示、改走本機；
② 帶提示等待 10 秒（`SIGNED_IN_HINT_WAIT_MS`）逾時後，快照改回不帶提示的 `loading`，同樣改走本機。
兩者都讓登入者在不知情的情況下改看、改寫本機資料——修改不會上雲端，下次在其他裝置也看不到。使用者已定案改為「先擋住、讓使用者自己選」。

## What Changes

- **session 取不到時不再假裝是「未啟用」**（`lib/auth/session-client.ts`）：`fetchSession()` 的回傳型別改為 `Promise<SessionState | null>`，任何失敗回 `null`，仍絕不 throw。唯一呼叫端是 session store。
- **session store 新增兩種 loading 快照**（`lib/auth/session-store.ts`）：
  - 「無法確認」`{ status: "loading", signedInHint: true, unavailable: true }`：有上次登入提示時，採用到 `null`（含已登入使用中 `refresh()` 失敗）或帶提示等待逾時，一律改為此快照，**不清除提示**；之後晚到的成功回應照常採用。
  - 「本機備援」`{ status: "loading", localFallback: true }`：使用者按下「先用這台裝置的資料」（新匯出 `chooseLocalFallback()`）後才進入；丟棄進行中請求的結果，本次頁面期間不再被晚到的回應切走，只有明確的 `refresh()` 會再改變快照；不清除提示。
  - 沒有提示時採用到 `null` → `{ status: "ready", authEnabled: false, user: null }`（現行 fail-closed，訪客行為不變）。
- **提示清除規則收斂**：只有採用「200 且形狀正確」且非登入的結果才清除；請求失敗、等待逾時、按下按鈕都不清除。`signOut()` 2xx 清除不變。
- **儲存模式**（`lib/sync/storage-mode.ts`）：本機備援 → `"local"`；無法確認仍帶提示 → `"pending"`（不交出本機資料、不啟用雲端，是沒處理新狀態的使用端的安全預設）。新增 `pendingDataStatus(snapshot)`：等待中結果應呈現 `"pending"` 或 `"unavailable"`。
- **顯示狀態**（`lib/sync/sync-status.ts`）：`DataStatus` 新增 `"unavailable"`（不是 `SyncStatus`），`isContentBlocked` 含它；新增兩個文案常數——按鈕「先用這台裝置的資料」與本機提示「目前連不上雲端，修改只會存在這台裝置；重新整理頁面可再次連線雲端」。
- **`SyncStatusNotice`**：`unavailable` 時顯示既有 load-failed 文案「無法載入雲端資料，請重新整理頁面」＋按鈕「先用這台裝置的資料」，按下呼叫 `chooseLocalFallback()`。
- **使用端**：三個選擇器的等待中分支、`HistoryModeSwitch`、資料頁三區塊改用 `pendingDataStatus`，容器 `data-sync-status` 隨之為 `"unavailable"`；對戰頁 `SYNC_STATUS_PRIORITY` 把 `unavailable` 放最前；`useRoundStore` 把名單的 `unavailable` 與 `pending` 一樣以 `loading` 傳給雲端 hook。
  名單選擇器的等待中分支明確回傳空名單（已登入使用中轉為無法確認時，未啟用的雲端 hook 仍保有先前的雲端名單）。
- **本機提示**（新元件 `components/sync/LocalFallbackBanner.tsx`）：掛在 root layout，只在本機備援快照時以 `role="status"`、固定定位、不擋操作的方式顯示；伺服器輸出不含它。
- **BREAKING（規格層）**：`auth`「任何失敗都降級為未啟用」改為回傳 `null`；「帶提示等待逾時後回到不帶提示的 loading」改為改成無法確認；`user-data-sync` 的 `DataStatus`、`isContentBlocked` 定義與「本機模式不渲染任何同步元素」加入新狀態與例外。

### 明確不做

- 自動重試 session 請求、把本機備援期間的修改合併或上傳到雲端。
- 改後端、改 `/api/session` 契約。
- 改 navbar 帳號入口（`AccountEntry`）與登入頁（`LoginForm`）：兩者只看 `status === "loading"`，新快照下仍顯示載入中佔位（design 記為已知取捨）。
- 新增 hook、新增 npm 相依、migration。

## Capabilities

### New Capabilities

（無）

### Modified Capabilities

- `auth`：MODIFIED「前端以 /api/session 作為登入狀態的唯一來源」（失敗回 `null`）、「全頁共用的 session store 與 useSession」（無法確認、本機備援、逾時改為無法確認、`chooseLocalFallback`）、「上次登入提示的儲存與清除」（失敗、逾時、按鈕不清除）。
- `user-data-sync`：MODIFIED「前端依 session 選擇儲存模式」（本機備援為 `local`、`pendingDataStatus`）、「同步狀態與提示」（本機提示為唯一例外）、「資料來源確定前的等待中畫面」（`DataStatus`、`isContentBlocked`、選擇器與元件改用等待中顯示狀態）；ADDED「session 無法確認時的阻擋畫面與本機備援」。
- `player-roster`：MODIFIED「登入時名單以雲端為準」——等待中結果的 `syncStatus` 為 `pending` 或 `unavailable`、`isContentBlocked` 列舉含 `unavailable`，其餘全文不變。
- `round-lifecycle`：MODIFIED「登入時回合與場次分槽以雲端為準」——同上。
- `scoreboard`：MODIFIED「登入時獨立計分板以雲端為準」——同上。

逐一查核但**不修改**：`match-history`（`HistoryView` 本機讀入前的等待中不受影響；`HistoryModeSwitch` 規範在 `user-data-sync`）、`data-transfer`（提示「確認未登入時清除」的敘述仍成立）、`site-navbar`（帳號入口「載入中為隱形佔位」仍成立）、`player-stats`（`RemoteStatsContent` 只在 `remote` 掛載，看不到 `unavailable`）。

## Impact

- **前端產品程式碼**（皆在 `nextjs-pickball/`，共 15 個檔案）：
  - 新增（1）：`components/sync/LocalFallbackBanner.tsx`。
  - 修改（14）：`lib/auth/session-client.ts`、`lib/auth/session-store.ts`、`lib/sync/storage-mode.ts`、`lib/sync/sync-status.ts`、`components/sync/SyncStatusNotice.tsx`、
    `hooks/useRosterStore.ts`、`hooks/useRoundStore.ts`、`hooks/useScoreboardStore.ts`、`app/matchmaker/page.tsx`、`app/layout.tsx`、
    `components/matchmaker/HistoryModeSwitch.tsx`、`components/matchmaker/JsonBackupSection.tsx`、`components/matchmaker/HistoryCsvSection.tsx`、`components/matchmaker/RosterCsvImportSection.tsx`。
  - 不改：`hooks/useSession.ts`（型別由 `SessionSnapshot` 推導）、`lib/auth/session-hint.ts`、雲端 hook（`hooks/useRemote*.ts`）、`components/layout/**`（含 `AccountEntry`）、`components/auth/**`（含 `LoginForm`）、
    `app/matchmaker/players/page.tsx`、`app/matchmaker/stats/page.tsx`、`components/matchmaker/{LocalStatsContent,RemoteStatsContent,HistoryView,RemoteHistoryView,LocalDataImportSection,ClearLocalDataSection,LocalImportNotice}.tsx`、`components/scoreboard/**`、`lib/matchmaker/transfer-storage.ts`、quiz／tour／guide、其他 `page.tsx`。
- **測試**：
  - 新增檔（2）：`components/sync/LocalFallbackBanner.test.tsx`、`app/matchmaker/page.test.tsx`。
  - 新增 it 的既有檔：`lib/auth/session-store.test.ts`、`lib/sync/storage-mode.test.ts`、`lib/sync/sync-status.test.ts`、`components/sync/SyncStatusNotice.test.tsx`、`hooks/useRosterStore.test.tsx`、`hooks/useRoundStore.test.tsx`、`hooks/useScoreboardStore.test.tsx`、
    `components/matchmaker/{HistoryModeSwitch,JsonBackupSection,HistoryCsvSection,RosterCsvImportSection}.test.tsx`、`tests/e2e/specs/data-pending.spec.ts`。
  - 新 it 共 21 個（真紅 19、regression guard 2）；新 E2E 2 條（`data-pending.spec.ts`，五個 browser project 各跑一次）。
  - **授權改寫的既有測試（僅限下列三個 it；改名與改斷言，其餘既有 it／test 一律不得修改）**：
    `lib/auth/session-client.test.ts` 的「fetchSession 於非 200、形狀不符或網路錯誤時回傳未啟用且不拋錯」「signInMethods 形狀不符時 fetchSession 回傳未啟用」改為期望 `null`；
    `lib/auth/session-store.test.ts` 的「帶提示等待逾時仍未取得 session 時快照改回不帶提示的 loading」改為期望無法確認快照。三者對應的主 spec Scenario 在 delta spec 以 MODIFIED 改寫。
- **文件**：`nextjs-pickball/CLAUDE.md` 的儲存三態、歷史頁與統計頁條目、`isContentBlocked` 列舉、`lib/auth`／`lib/sync` 目錄說明（apply §5 改）。
- **相依**：不新增。**migration**：無。**後端／核心套件**：零變更。
- **使用者可見**：有上次登入提示的使用者遇到 session 請求失敗或 10 秒未回應時，資料頁面顯示「無法載入雲端資料，請重新整理頁面」與按鈕「先用這台裝置的資料」；按下後看到本機資料，畫面下方常駐「目前連不上雲端，修改只會存在這台裝置；重新整理頁面可再次連線雲端」。訪客（沒有提示）完全不變。
