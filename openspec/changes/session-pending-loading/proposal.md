# Proposal: session-pending-loading

## Why

正式站登入後重新整理 `/matchmaker/players`，畫面會先閃一下空名單、再顯示「載入中」、最後才出現雲端資料（使用者回報，coordinator 已診斷）。
原因是 `resolveStorageMode` 在 `/api/session` 回應前（`status !== "ready"`）一律回 `"local"`，選擇器 store 交出本機（常為空的）資料與 `syncStatus: "local"`；
各頁的載入保護只涵蓋雲端載入階段（`syncStatus === "loading"`），漏了「session 尚未確認」這一段。所有 `resolveStorageMode` 的使用端都有同樣問題，資料頁的本機匯入／還原按鈕在這段時間甚至可以對本機資料動手。
使用者已定案採**方案 B**：在瀏覽器記住「上次確認時是登入狀態」的提示，有提示時把這段時間視為「等待中」，訪客（無提示）完全不變。

## What Changes

- **上次登入提示**（新模組 `nextjs-pickball/lib/auth/session-hint.ts`）：localStorage key `auth:signed-in-hint:v1`，只存固定值 `"1"`，不存 user id、email、name 等任何個資；讀寫清除皆不拋錯。
  - session store 每次採用 `/api/session` 的回應時：已登入（`authEnabled && user !== null`）→ 寫入；其餘（未登入、auth 停用、請求失敗降級為停用）→ 清除；被丟棄的過時回應不動提示。
  - `signOut()` 回 2xx 時立即清除（不等之後的 `refresh`）。
- **session 快照**：client 端在 session 尚未回應且有提示時，初始快照為 `{ status: "loading", signedInHint: true }`；server snapshot 仍固定 `{ status: "loading" }`（`useSyncExternalStore` 既有做法，hydration 不產生不一致）。
  有提示的等待最多 10 秒，逾時快照改回不帶提示的 `{ status: "loading" }`（回到現行行為），不會永遠卡在載入中。
- **儲存模式第三態**：`resolveStorageMode` 回傳 `"local" | "remote" | "pending"`；`status === "loading"` 且帶 `signedInHint` 時為 `"pending"`，其餘規則不變。
- **等待中（`pending`）的呈現**：
  - `useRosterStore`、`useRoundStore`、`useScoreboardStore` 三個選擇器回傳「空資料＋`syncStatus: "loading"`＋操作不生效」，不交出本機資料，也不啟用雲端 hook。參賽者、對戰、統計三頁與計分板沿用既有的 `loading` 分支顯示「正在載入雲端資料…」；帶 `?match=` 的計分板綁定狀態為 `pending`（不閃「場次已失效」）。
  - 歷史頁的 `HistoryModeSwitch` 顯示載入中提示，不渲染本機歷史；統計頁入口不掛載雲端統計內容（改走本機內容，由選擇器的 `loading` 顯示提示）。
  - 資料頁的 `JsonBackupSection`、`HistoryCsvSection`、`RosterCsvImportSection` 以載入中提示取代操作區（匯出、選檔、確認匯入都不渲染）；`LocalDataImportSection` 維持不渲染（現況即如此）；`ClearLocalDataSection` 兩種模式語意相同，不改。
- **訪客（無提示）零變更**：首屏時序、DOM、`data-sync-status` 皆與現在相同。
- **BREAKING（規格層）**：主 spec `user-data-sync`「前端依 session 選擇儲存模式」的回傳型別由兩態改為三態，並刪除「已登入使用者在 session 回應前會先看到本機資料一瞬間……此為刻意取捨」一段；`player-roster`、`round-lifecycle` 選擇器的「否則回傳本機實作」改為「`local` 時回傳本機實作，`pending` 時依等待中規則」。

### 明確不做

- 伺服器端判斷登入狀態（方案 C）、改後端、改 `/api/session` 契約。
- hydration 之前的伺服器輸出：靜態預先渲染的 HTML 對訪客與登入者相同（本機初始狀態），本 change 只消除 hydration 之後到 session 回應之間的本機畫面（見 design Non-Goals 與 Risks）。
- 登入入口改顯示頭像、本機資料自動匯入雲端、session 失敗的重試或新文案。
- 新增 hook（hint 經既有 `useSession` 快照帶出，不需更新 hooks 歸屬清單）、新增 npm 相依、migration。

## Capabilities

### New Capabilities

（無）

### Modified Capabilities

- `user-data-sync`：MODIFIED「前端依 session 選擇儲存模式」（三態、`pending` 規則、刪除舊取捨）；ADDED「session 確認前的等待中畫面」（三個選擇器、歷史與統計入口、資料頁四個區塊的等待中行為，以及三條 E2E）。
- `auth`：MODIFIED「全頁共用的 session store 與 useSession」（帶提示的初始快照、server snapshot 不帶提示、10 秒逾時、hydration 一致）；ADDED「上次登入提示的儲存與清除」。
- `player-roster`：MODIFIED「登入時名單以雲端為準」——選擇器的「否則回傳本機實作」改為依三態分流，其餘全文不變。
- `round-lifecycle`：MODIFIED「登入時回合與場次分槽以雲端為準」——同上。
- `data-transfer`：MODIFIED「清除本機資料與其確認流程」——明定上次登入提示 key 不屬清除範圍（生命週期跟隨 session），新增一個 regression guard Scenario。

## Impact

- **前端產品程式碼**（皆在 `nextjs-pickball/`）：
  - 新增：`lib/auth/session-hint.ts`。
  - 修改：`lib/auth/session-store.ts`、`lib/auth/session-client.ts`（`signOut`）、`lib/sync/storage-mode.ts`、`hooks/useRosterStore.ts`、`hooks/useRoundStore.ts`、`hooks/useScoreboardStore.ts`、
    `components/matchmaker/HistoryModeSwitch.tsx`、`components/matchmaker/JsonBackupSection.tsx`、`components/matchmaker/HistoryCsvSection.tsx`、`components/matchmaker/RosterCsvImportSection.tsx`、`app/matchmaker/stats/page.tsx`。
  - 不改：`hooks/useSession.ts`（型別隨快照擴充自然帶出）、`components/matchmaker/LocalDataImportSection.tsx`、`ClearLocalDataSection.tsx`、`lib/matchmaker/transfer-storage.ts`、各頁 `page.tsx`（統計頁除外）、`Scoreboard.tsx`、雲端 hook、`SyncStatusNotice`、`sync-status.ts`（不新增文案）。
- **測試**：
  - 新增檔：`lib/auth/session-hint.test.ts`、`components/matchmaker/HistoryModeSwitch.test.tsx`、`components/matchmaker/RosterCsvImportSection.test.tsx`、`app/matchmaker/stats/page.test.tsx`、`tests/e2e/specs/session-pending.spec.ts`。
  - 新增 it 的既有檔：`lib/sync/storage-mode.test.ts`、`lib/auth/session-store.test.ts`、`lib/auth/session-client.test.ts`、`hooks/useSession.test.ts`、`hooks/useRosterStore.test.tsx`、`hooks/useRoundStore.test.tsx`、`hooks/useScoreboardStore.test.tsx`、
    `components/matchmaker/JsonBackupSection.test.tsx`、`components/matchmaker/HistoryCsvSection.test.tsx`、`components/matchmaker/LocalDataImportSection.test.tsx`、`lib/matchmaker/transfer-storage.test.ts`、`tests/e2e/user-data/roster-sync.spec.ts`。
  - 新 it 共 20 個（其中 2 個 regression guard）；新 E2E 3 條（`session-pending.spec.ts` 2 條在五個 browser project 各跑一次，`roster-sync.spec.ts` 1 條在 `user-data`）。
  - **授權修改的既有測試（僅限下列兩處，皆為測試隔離，不改任何 it 名稱與斷言）**：`lib/auth/session-store.test.ts` 與 `hooks/useSession.test.ts` 既有 `describe` 的 `beforeEach` 各加一行 `localStorage.clear()`——store 現在會把提示寫進 localStorage，前一個 it 寫入的提示會讓後面 it 的初始快照多出 `signedInHint`（例如「模組剛載入時為 loading，第一次訂閱才請求」）。
- **文件**：`nextjs-pickball/CLAUDE.md` 中「訪客（含 auth 停用、session 載入中）仍全走 LocalStorage」、統計頁「訪客與 session 載入中為 `LocalStatsContent`」、`lib/sync/`／`lib/auth/` 目錄說明（apply 階段改）。
- **相依**：不新增。**migration**：無。**後端／核心套件**：零變更。
- **使用者可見**：登入者重新整理時，hydration 後到 session 回應前顯示「正在載入雲端資料…」而非本機（空）畫面；登出後若提示殘留（例如 cookie 過期），第一次重新整理會短暫顯示載入中再回到本機畫面。
