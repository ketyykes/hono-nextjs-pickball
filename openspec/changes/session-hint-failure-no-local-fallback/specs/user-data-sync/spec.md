# Specification: user-data-sync

## MODIFIED Requirements

### Requirement: 前端依 session 選擇儲存模式

`nextjs-pickball/lib/sync/storage-mode.ts` SHALL 匯出 `resolveStorageMode(snapshot: SessionSnapshot & { readonly hydrated?: boolean }): "local" | "remote" | "pending"`（呼叫端直接傳入 `useSession()` 的回傳值），
是前端「存本機還是存雲端」的**唯一判斷**：只有 `status === "ready"`、`authEnabled === true` 且 `user !== null` 時回 `"remote"`；
`status === "loading"` 且快照帶 `localFallback: true`（本機備援：使用者在 session 無法確認時選擇先用這台裝置的資料）時回 `"local"`；
否則 `status === "loading"` 且符合下列任一條件時回 `"pending"`（儲存模式未定）：
① 快照帶 `signedInHint: true`（`auth`「全頁共用的 session store 與 useSession」：瀏覽器記得上次確認時為登入狀態——含必帶提示的無法確認快照 `unavailable: true`）；
② `hydrated === false`（伺服器端 render 與 hydration 那次 render，此時無從得知提示）。其餘一律 `"local"`；`hydrated` 未提供時視同 `true`。

hydration 完成後，session 仍在載入且**沒有**上次登入提示時 MUST 為 `"local"`：訪客（含正式站從未登入的使用者、auth 停用）在 hydration 之後的時序 SHALL NOT 因等待 `/api/session` 而改變。
`"pending"` 時 SHALL NOT 交出本機資料、SHALL NOT 啟用雲端 hook，各使用端的呈現見「資料來源確定前的等待中畫面」。
因提示而來的 `"pending"` 在下列兩種情況結束：採用到非 `null` 的 session 回應（轉為 ready），或使用者按下「先用這台裝置的資料」（本機備援，轉為 `"local"`）。
session 請求失敗或帶提示等待逾時 SHALL NOT 結束它（改為無法確認，呈現見「session 無法確認時的阻擋畫面與本機備援」）；已登入使用中 `refresh()` 失敗時，儲存模式也會由 `"remote"` 回到 `"pending"`。

同檔 SHALL 匯出 `pendingDataStatus(snapshot: SessionSnapshot): "pending" | "unavailable"`：快照為無法確認（`status === "loading"` 且 `unavailable === true`）時回 `"unavailable"`，其餘一律回 `"pending"`。
儲存模式為 `"pending"` 的使用端 MUST 以它決定要呈現的顯示狀態（`DataStatus`），SHALL NOT 自行讀取快照的 `unavailable` 欄位。

各資料的 store hook SHALL 以「選擇器」形態接上儲存模式：既有本機實作保留（改名為同檔的 `useLocal<X>Store`），
新增 `hooks/useRemote<X>Store.ts`（參數含 `enabled: boolean` 與 `onUnauthorized: () => void`），對外名稱 `use<X>Store` 依 `useSession()` 與 `resolveStorageMode` 回傳：
`"remote"` 時回傳雲端實作；`"local"` 時回傳本機實作，本機資料讀入前 `syncStatus` 為 `"pending"`、讀入後為 `"local"`；`"pending"` 時回傳等待中結果。
兩個 hook 每次 render 都呼叫（遵守 hooks 規則），未被選用的一方 SHALL NOT 發出請求或寫入 localStorage 以外的副作用。
雲端 hook 收到 401 時 MUST 呼叫 `onUnauthorized`（選擇器傳入 `useSession().refresh`）：session 確認為未登入時自動回到本機模式；session 無法確認時改為無法確認畫面，SHALL NOT 自動回到本機模式。

#### Scenario: 只有就緒、啟用且已登入時為 remote

- **WHEN** 以 `{ status: "loading" }`、`{ status: "ready", authEnabled: false, user: null }`、`{ status: "ready", authEnabled: true, user: null }`、`{ status: "ready", authEnabled: true, user: <使用者> }` 分別呼叫
- **THEN** 只有最後一種回 `"remote"`，其餘皆為 `"local"`
- **驗收**：`nextjs-pickball/lib/sync/storage-mode.test.ts`，it 名稱「只有 session 就緒、auth 啟用且有 user 時為 remote」

#### Scenario: session 載入中且帶上次登入提示時為 pending

- **WHEN** 以 `{ status: "loading", signedInHint: true }` 呼叫，另以不帶 `signedInHint` 的 `{ status: "loading" }`、以及型別轉換硬塞 `signedInHint: true` 的三種 ready 快照（auth 停用、未登入、已登入）呼叫
- **THEN** 第一種回 `"pending"`；不帶提示的 loading 回 `"local"`；三種 ready 快照的結果與不帶提示時相同（依序 `"local"`、`"local"`、`"remote"`），提示只在 `loading` 時有作用
- **驗收**：`nextjs-pickball/lib/sync/storage-mode.test.ts`，it 名稱「session 載入中且帶上次登入提示時為 pending」

#### Scenario: 伺服器端與 hydration 時尚未 hydration 的 session 為 pending

- **WHEN** 以 `{ status: "loading", hydrated: false }`、`{ status: "loading", hydrated: true }`、`{ status: "ready", authEnabled: true, user: <使用者>, hydrated: false }` 分別呼叫
- **THEN** 依序為 `"pending"`、`"local"`、`"remote"`
- **驗收**：`nextjs-pickball/lib/sync/storage-mode.test.ts`，it 名稱「尚未 hydration 的 loading 快照為 pending，hydration 後無提示時為 local」

#### Scenario: 本機備援為 local、無法確認為 pending

- **WHEN** 以 `{ status: "loading", localFallback: true }`、`{ status: "loading", signedInHint: true, unavailable: true }`，以及兩者各加上 `hydrated: true` 分別呼叫
- **THEN** 本機備援兩種皆為 `"local"`；無法確認兩種皆為 `"pending"`
- **驗收**：`nextjs-pickball/lib/sync/storage-mode.test.ts`，it 名稱「本機備援的 loading 快照為 local，無法確認的 loading 快照為 pending」（regression guard）

#### Scenario: 等待中的顯示狀態依快照區分無法確認

- **WHEN** 以無法確認快照、`{ status: "loading", signedInHint: true }`、`{ status: "loading" }`、`{ status: "loading", localFallback: true }` 與三種 ready 快照分別呼叫 `pendingDataStatus`
- **THEN** 只有無法確認快照回 `"unavailable"`，其餘皆回 `"pending"`
- **驗收**：`nextjs-pickball/lib/sync/storage-mode.test.ts`，it 名稱「pendingDataStatus 在無法確認時為 unavailable，其餘為 pending」

### Requirement: 同步狀態與提示

雲端 hook SHALL 對外回報 `SyncStatus`（`nextjs-pickball/lib/sync/sync-status.ts`）：
`local`（本機模式）、`loading`（雲端載入中）、`synced`（已與雲端一致）、`saving`（儲存中）、`retrying`（儲存失敗、等待重試）、
`conflict`（版本衝突，已重新載入）、`load-failed`（載入失敗）、`rejected`（雲端拒絕儲存）。
同檔 SHALL 匯出 `syncStatusMessage(status): string | null`，文案固定如下（MUST 逐字）：

| 狀態 | 文案 |
|---|---|
| `local`、`synced`、`saving` | `null`（不顯示） |
| `loading` | 正在載入雲端資料… |
| `retrying` | 尚未儲存到雲端，將自動重試 |
| `conflict` | 資料已在其他裝置更新，已重新載入最新資料 |
| `load-failed` | 無法載入雲端資料，請重新整理頁面 |
| `rejected` | 雲端拒絕儲存，請重新整理頁面 |

`nextjs-pickball/components/sync/SyncStatusNotice.tsx` SHALL 以 `role="status"` 呈現非 `null` 的文案，文案為 `null` 時不渲染任何元素。
本機模式（`local`）下頁面 SHALL NOT 渲染任何同步相關元素或屬性（含 `data-sync-status`），使訪客的 DOM 與本 change 前相同。
唯一例外是本機備援時 root layout 的本機提示（`LocalFallbackBanner`，見「session 無法確認時的阻擋畫面與本機備援」）：它不帶 `data-sync-status`，只在使用者明確選擇先用這台裝置的資料之後出現；
訪客（未登入、auth 停用、沒有上次登入提示）SHALL NOT 看到它。

`conflict` 的處理 MUST 為：停止儲存佇列 → 重新 `GET` → 以雲端資料取代畫面狀態 → 顯示衝突文案；SHALL NOT 合併兩邊的變更（D3）。
衝突文案維持顯示，直到下一次儲存成功（`synced`）為止。

#### Scenario: 只有需要使用者注意的狀態才有文案

- **WHEN** 對八種狀態逐一呼叫 `syncStatusMessage`
- **THEN** `local`、`synced`、`saving` 回 `null`，其餘五種回上表文案（逐字比對）
- **驗收**：`nextjs-pickball/lib/sync/sync-status.test.ts`，it 名稱「local、synced、saving 不顯示提示，其餘狀態各有固定文案」

#### Scenario: 訪客的計分板不渲染同步元素

- **GIVEN** 未登入（或 auth 停用）
- **WHEN** 開啟 `/scoreboard` 並得分一次
- **THEN** 頁面上不存在 `[data-sync-status]` 元素，也不存在同步提示文案
- **驗收**：`nextjs-pickball/tests/e2e/specs/scoreboard-local-mode.spec.ts`，test 名稱「訪客模式下計分板不渲染同步提示與 data-sync-status」

### Requirement: 資料來源確定前的等待中畫面

資料來源還沒確定時，前端 MUST 只顯示等待中提示，SHALL NOT 顯示空清單、空狀態、預設值（例 0:0）或錯誤一邊的資料，SHALL NOT 讓使用者觸發任何本機寫入或本機與雲端之間的資料互動（匯入、還原、備份匯出、CSV 匯出入），也 SHALL NOT 發出任何使用者資料請求。
「還沒確定」包含：伺服器輸出與 JavaScript 載入前、hydration、儲存模式為 `"pending"`（「前端依 session 選擇儲存模式」），以及儲存模式為 `"local"` 但本機資料尚未讀入。
本機資料讀入與等待中提示消失 MUST 在同一次 render：沒有上次登入提示的訪客在 hydration 後讀入本機資料時直接看到本機資料，中間 SHALL NOT 出現空狀態。
儲存模式為 `"pending"` 而 session 無法確認時，資料與操作的限制與等待中相同，只有顯示狀態改為 `"unavailable"`、提示改為無法載入文案與按鈕（「session 無法確認時的阻擋畫面與本機備援」）。

**顯示狀態與判斷**（`nextjs-pickball/lib/sync/sync-status.ts`）：

- `type DataStatus = SyncStatus | "pending" | "unavailable"`（`unavailable` 見「session 無法確認時的阻擋畫面與本機備援」）；`SyncStatus` 的 8 個值與其固定文案不變。
- `DATA_PENDING_MESSAGE` 為「正在載入資料…」，是等待中唯一的文案（不指涉本機或雲端：伺服器輸出對訪客與登入者相同）。
- `isContentBlocked(status: DataStatus): boolean`：`pending`、`unavailable`、`loading`、`load-failed` 為 true，其餘為 false。所有「以提示取代主要內容」的判斷 MUST 使用它，SHALL NOT 各自內聯比較。唯一例外是 `components/matchmaker/RemoteHistoryView.tsx` 內雲端歷史專屬的那一處（`syncStatus === "loading" || syncStatus === "load-failed"`，test-plan C7 已豁免）：該元件只在雲端模式掛載，狀態來自 `useRemoteHistory`，型別為 `SyncStatus` 而不含 `pending`，不可能出現等待中；本 change 不改該檔（Impact「不改」清單），改用 `isContentBlocked` 也不會改變任何行為。
- `nextjs-pickball/components/sync/SyncStatusNotice.tsx` 的 `status` 型別為 `DataStatus`；`pending` 時以既有 `role="status"` 外觀顯示 `DATA_PENDING_MESSAGE`；`unavailable` 的呈現見「session 無法確認時的阻擋畫面與本機備援」。

**選擇器的等待中結果**：

- 儲存模式為 `"pending"` 時三者皆不啟用雲端 hook（`enabled` 為 false、`userId` 為 `null`），回傳的 `syncStatus` 為 `pendingDataStatus(session)`（`"pending"`，session 無法確認時為 `"unavailable"`；下列「`syncStatus` 為 `"pending"`」皆依此）：
  - `useRosterStore()`：`players` MUST 為空陣列（即使同一個 mount 先前在雲端模式已載入名單——已登入使用中轉為無法確認時，未啟用的雲端名單 hook 仍保有先前的名單，選擇器 SHALL NOT 沿用它）、`droppedCount` 為 0、`syncStatus` 為 `"pending"`；`addPlayer`、`updatePlayer`、`removePlayer`、`togglePlayerActive`、`resetRoster`、`applyRemotePlayers`、`reloadRemotePlayers` 皆不改變回傳的名單、不寫入本機、不發請求。
  - `useRoundStore(options)`：`round` 為 `null`、`history` 為空陣列、`droppedCount` 為 0、`syncStatus` 為 `"pending"`、`remoteMatchSlots` 為 `null`；七個操作皆回傳 `ok: false` 且不改變回合、不寫入本機、不發請求。
    因 `round` 為 `null`，對戰頁的分槽回填 effect 在等待中不會讀取或清除本機分槽、不會把本機比分送進本機歷史。
  - `useScoreboardStore(matchId)`：`state` 為計分板初始狀態（多次 render 間 MUST 為同一個參考：`Scoreboard` 以 state 參考變化在 render 中更新衍生狀態，每次給新物件會無限 re-render）、`dispatch` 不改變狀態也不寫入本機、`syncStatus` 為 `"pending"`；`bindingStatus` 在 `matchId === null` 時為 `"standalone"`，否則為 `"pending"`——SHALL NOT 為 `"missing"`，否則已登入者開啟 `/scoreboard?match=` 會先閃「場次已失效」。
- 儲存模式為 `"local"` 時，三個本機 hook MUST 各自回報本機資料是否已讀入（在既有讀取 effect 內，**無論有沒有本機資料**都標記為已讀入）；讀入前選擇器回傳本機結果、`syncStatus` 為 `"pending"`，讀入後為 `"local"`。既有「沒有本機資料時不 dispatch `HYDRATE`」與寫入守門不變。

本機 hook 依 hooks 規則在等待中仍會 mount：其 mount 時讀取並把**同一份**本機資料寫回的既有行為（雲端模式下同樣發生）不變；等待中 SHALL NOT 有任何會改變本機資料內容的寫入。

**頁面與元件**：

- 參賽者頁、對戰頁、`LocalStatsContent`、`RemoteStatsContent`（名單）與 `Scoreboard` 在 `isContentBlocked(syncStatus)` 時以 `SyncStatusNotice` 取代主要內容，根元素帶 `data-sync-status={syncStatus}`（等待中為 `"pending"`、無法確認為 `"unavailable"`）；`local` 時照舊不輸出任何同步元素或屬性。
- 歷史頁：`HistoryModeSwitch` 在儲存模式為 `"pending"` 時 MUST 渲染帶 `data-sync-status={pendingDataStatus(session)}` 的容器與同一狀態的 `SyncStatusNotice`，SHALL NOT 掛載 `HistoryView` 或 `RemoteHistoryView`；`HistoryView` 在本機歷史讀入前 MUST 渲染同一個等待中容器，SHALL NOT 渲染區間篩選與空狀態。
- 統計頁入口 `nextjs-pickball/app/matchmaker/stats/page.tsx`：`"pending"` 時 MUST 渲染 `LocalStatsContent`（由選擇器的 `pending` 顯示提示），SHALL NOT 掛載 `RemoteStatsContent`——雲端內容只在 `"remote"` 時掛載。
- 資料頁：`JsonBackupSection`、`HistoryCsvSection`、`RosterCsvImportSection` 在 `"pending"` 時保留區塊標題與說明，操作區（帶 `data-sync-status={pendingDataStatus(session)}` 的 `CardContent`）MUST 只渲染同一狀態的 `SyncStatusNotice`——「匯出 JSON」「匯出 CSV」「確認匯入」按鈕與三種選檔（`json-backup-import-input`、`json-backup-cloud-import-input`、`roster-csv-import-input`）皆不渲染；
  `LocalDataImportSection` 在 `"pending"` 時不渲染（與本機模式相同）；`ClearLocalDataSection` 兩種模式語意相同（只清本機 key），不受儲存模式影響。

不在本 Requirement 範圍：首頁導覽列與目錄的捲動樣式、減少動態偏好（不屬資料狀態，伺服器端無從得知）；client 端導覽時本機資料於 effect 讀入前的那一次 render（顯示等待中提示）。

#### Scenario: pending 與 loading、load-failed 同樣取代內容且有獨立文案

- **WHEN** 以 `SyncStatus` 的八個值與 `pending` 分別呼叫 `isContentBlocked`，並讀取 `DATA_PENDING_MESSAGE`（`unavailable` 見「session 無法確認時的阻擋畫面與本機備援」）
- **THEN** 只有 `pending`、`loading`、`load-failed` 為 true；`DATA_PENDING_MESSAGE` 為「正在載入資料…」，與 `loading` 的固定文案不同
- **驗收**：`nextjs-pickball/lib/sync/sync-status.test.ts`，it 名稱「pending、loading、load-failed 取代內容，pending 的文案為正在載入資料」

#### Scenario: 同步提示在等待中顯示正在載入資料

- **WHEN** 分別以 `pending`、`loading`、`local` 渲染 `SyncStatusNotice`
- **THEN** `pending` 時 `role="status"` 的文字為「正在載入資料…」；`loading` 時為「正在載入雲端資料…」；`local` 時不渲染任何元素
- **驗收**：`nextjs-pickball/components/sync/SyncStatusNotice.test.tsx`，it 名稱「pending 顯示正在載入資料，loading 顯示雲端文案，local 不渲染」

#### Scenario: 等待中：名單選擇器不交出本機名單且操作無效

- **GIVEN** `matchmaker:roster:v1` 有一位參賽者；mock `useSession` 為 `{ status: "loading", signedInHint: true, hydrated: true }`
- **WHEN** `useRosterStore()` mount 後呼叫 `addPlayer`
- **THEN** `players` 為空陣列、`syncStatus` 為 `pending`；`matchmaker:roster:v1` 解析後仍只有原本那一位；沒有任何 `fetch`
- **驗收**：`nextjs-pickball/hooks/useRosterStore.test.tsx`，it 名稱「session 等待中時不回傳本機名單、syncStatus 為 pending 且操作不寫入本機也不發請求」
- **驗收**（損壞筆數，regression guard）：同檔，it 名稱「session 等待中時即使本機資料含損壞筆數 droppedCount 仍為 0」——本機資料含一筆損壞資料時，等待中的 `droppedCount` 仍為 0、`players` 為空陣列

#### Scenario: 等待中：確認為未登入後改回本機名單

- **GIVEN** `matchmaker:roster:v1` 有一位參賽者；mock `useSession` 先為 `{ status: "loading", signedInHint: true, hydrated: true }`
- **WHEN** mock 改為 `{ status: "ready", authEnabled: true, user: null }` 並 rerender
- **THEN** 改變前 `players` 為空陣列；改變後 `players` 為本機那一位、`syncStatus` 為 `local`
- **驗收**：`nextjs-pickball/hooks/useRosterStore.test.tsx`，it 名稱「等待中的 session 確認為未登入時改回本機名單」

#### Scenario: 本機名單讀入前為等待中

- **GIVEN** mock `useSession` 為訪客（`{ status: "ready", authEnabled: true, user: null }`）；第一輪 `matchmaker:roster:v1` 有一位參賽者，第二輪沒有任何本機資料
- **WHEN** `useRosterStore()` mount，並在 render 階段同步記錄每次 render 的 `syncStatus`
- **THEN** 兩輪的第一筆皆為 `pending`；兩輪的最終值皆為 `local`；第一輪最終 `players` 為那一位，且沒有任何一次 render 是「`syncStatus` 為 `local` 而 `players` 為空」
- **驗收**：`nextjs-pickball/hooks/useRosterStore.test.tsx`，it 名稱「本機名單讀入前 syncStatus 為 pending，讀入後為 local 且無資料時也會轉為 local」
- **驗收**（三個選擇器共用的判斷，regression guard）：`nextjs-pickball/lib/sync/sync-status.test.ts`，it 名稱「本機資料讀入前為 pending，讀入後為 local」——`localDataStatus(false)` 為 `pending`、`localDataStatus(true)` 為 `local`

#### Scenario: 等待中：回合選擇器不交出本機回合與歷史且操作無效

- **GIVEN** `matchmaker:round:v1` 有一輪、`matchmaker:history:v1` 有一筆；mock `useSession` 為 `{ status: "loading", signedInHint: true, hydrated: true }`
- **WHEN** `useRoundStore(options)` mount 後呼叫 `generateRound`
- **THEN** `round` 為 `null`、`history` 為空陣列、`syncStatus` 為 `pending`、`remoteMatchSlots` 為 `null`；`generateRound` 回傳 `ok: false`；兩個本機 key 解析後與 mount 前相同；沒有任何 `fetch`
- **驗收**：`nextjs-pickball/hooks/useRoundStore.test.tsx`，it 名稱「session 等待中時不回傳本機回合與歷史、syncStatus 為 pending 且操作不生效」

#### Scenario: 本機回合讀入前為等待中

- **GIVEN** mock `useSession` 為訪客；第一輪 `matchmaker:round:v1` 有一輪，第二輪沒有任何本機資料
- **WHEN** `useRoundStore(options)` mount，並在 render 階段同步記錄每次 render 的 `syncStatus` 與 `round`
- **THEN** 兩輪的第一筆 `syncStatus` 皆為 `pending`、最終皆為 `local`；第一輪最終 `round` 非 `null`，且沒有任何一次 render 是「`syncStatus` 為 `local` 而 `round` 為 `null`」
- **驗收**：`nextjs-pickball/hooks/useRoundStore.test.tsx`，it 名稱「本機回合讀入前 syncStatus 為 pending，讀入後為 local 且無資料時也會轉為 local」

#### Scenario: 等待中：計分板選擇器不交出本機計分且綁定場次不顯示為失效

- **GIVEN** `scoreboard:current:v1` 有非初始的比分；`scoreboard:matches:v1` 沒有 `m1`；mock `useSession` 為 `{ status: "loading", signedInHint: true, hydrated: true }`
- **WHEN** `useScoreboardStore(null)` mount 後 dispatch `RALLY_WON`；另以 `useScoreboardStore("m1")` mount
- **THEN** 前者 `state` 等於計分板初始狀態且 dispatch 後不變、`bindingStatus` 為 `standalone`、`syncStatus` 為 `pending`，`scoreboard:current:v1` 解析後與 mount 前相同；後者 `bindingStatus` 為 `pending`（不是 `missing`）、`syncStatus` 為 `pending`；沒有任何 `fetch`
- **驗收**：`nextjs-pickball/hooks/useScoreboardStore.test.tsx`，it 名稱「session 等待中時不回傳本機計分且 syncStatus 為 pending，帶 matchId 時綁定狀態為 pending」

#### Scenario: 等待中：計分板選擇器在多次 render 間回傳同一個 state 參考

- **GIVEN** mock `useSession` 為 `{ status: "loading", signedInHint: true, hydrated: true }`
- **WHEN** `useScoreboardStore(null)` mount 後再 rerender 一次
- **THEN** 兩次回傳的 `state` 為同一個參考（`Object.is`）
- **驗收**：`nextjs-pickball/hooks/useScoreboardStore.test.tsx`，it 名稱「session 等待中時多次 render 回傳同一個 state 參考」

#### Scenario: 本機計分讀入前為等待中

- **GIVEN** mock `useSession` 為訪客；`scoreboard:current:v1` 有比分 5:3；`scoreboard:matches:v1` 沒有 `gone`
- **WHEN** `useScoreboardStore(null)` 與 `useScoreboardStore("gone")` 各自 mount，並在 render 階段同步記錄每次 render 的 `syncStatus`
- **THEN** 兩者第一筆皆為 `pending`、最終皆為 `local`；前者沒有任何一次 render 是「`syncStatus` 為 `local` 而比分為 0:0」；後者最終 `bindingStatus` 為 `missing`
- **驗收**：`nextjs-pickball/hooks/useScoreboardStore.test.tsx`，it 名稱「本機計分讀入前 syncStatus 為 pending，讀入後為 local」

#### Scenario: 等待中：歷史頁顯示等待中且不讀本機歷史

- **GIVEN** `matchmaker:history:v1` 有一筆今日的紀錄；mock `useSession` 為 `{ status: "loading", signedInHint: true, hydrated: true }`
- **WHEN** 渲染 `HistoryModeSwitch`
- **THEN** `role="status"` 的文字為「正在載入資料…」、容器帶 `data-sync-status="pending"`；radiogroup「歷史區間」與該筆紀錄卡片皆不存在；`RemoteHistoryView` 未掛載
- **驗收**：`nextjs-pickball/components/matchmaker/HistoryModeSwitch.test.tsx`，it 名稱「session 等待中時顯示等待中提示且不渲染本機歷史」

#### Scenario: 本機歷史讀入前為等待中而非空狀態

- **GIVEN** `matchmaker:history:v1` 有一筆今日的紀錄
- **WHEN** 以 `renderToString` 渲染 `HistoryView`；另以一般 render 渲染
- **THEN** 伺服器端輸出含「正在載入資料…」與 `data-sync-status="pending"`，不含「還沒有任何對戰紀錄」與「歷史區間」；一般 render 完成後顯示該筆紀錄卡片、`[data-sync-status]` 不存在
- **驗收**：`nextjs-pickball/components/matchmaker/HistoryView.test.tsx`，it 名稱「伺服器端輸出為等待中提示而非空狀態，讀入後顯示本機紀錄」

#### Scenario: 等待中：統計頁顯示等待中且不掛載雲端統計

- **GIVEN** mock `useSession` 為 `{ status: "loading", signedInHint: true, hydrated: true }`
- **WHEN** 渲染 `app/matchmaker/stats/page.tsx` 的頁面元件
- **THEN** `role="status"` 的文字為「正在載入資料…」、`main` 帶 `data-sync-status="pending"`；heading「球員統計」不存在；`RemoteStatsContent` 未掛載；沒有任何 `fetch`
- **驗收**：`nextjs-pickball/app/matchmaker/stats/page.test.tsx`，it 名稱「session 等待中時統計頁顯示等待中提示且不掛載雲端統計內容」

#### Scenario: 等待中：JSON 備份區塊不提供匯出與還原

- **GIVEN** mock `useSession` 為 `{ status: "loading", signedInHint: true, hydrated: true }`
- **WHEN** 渲染 `JsonBackupSection`
- **THEN** heading「JSON 完整備份」存在；`role="status"` 的文字為「正在載入資料…」；按鈕「匯出 JSON」、`json-backup-import-input`、`json-backup-cloud-import-input` 皆不存在
- **驗收**：`nextjs-pickball/components/matchmaker/JsonBackupSection.test.tsx`，it 名稱「session 等待中時以等待中提示取代匯出與還原操作」

#### Scenario: 等待中：歷史 CSV 區塊不提供匯出

- **GIVEN** mock `useSession` 為 `{ status: "loading", signedInHint: true, hydrated: true }`
- **WHEN** 渲染 `HistoryCsvSection`
- **THEN** heading「歷史賽果 CSV 匯出」存在；`role="status"` 的文字為「正在載入資料…」；按鈕「匯出 CSV」不存在
- **驗收**：`nextjs-pickball/components/matchmaker/HistoryCsvSection.test.tsx`，it 名稱「session 等待中時以等待中提示取代匯出操作」

#### Scenario: 等待中：參賽者 CSV 匯入區塊不提供選檔與確認

- **GIVEN** mock `useSession` 為 `{ status: "loading", signedInHint: true, hydrated: true }`
- **WHEN** 渲染 `RosterCsvImportSection`
- **THEN** heading「參賽者名單 CSV 匯入」存在；`role="status"` 的文字為「正在載入資料…」；`roster-csv-import-input` 與按鈕「確認匯入」皆不存在
- **驗收**：`nextjs-pickball/components/matchmaker/RosterCsvImportSection.test.tsx`，it 名稱「session 等待中時以等待中提示取代選檔與確認匯入」

#### Scenario: 等待中：匯入本機資料區塊不渲染

- **GIVEN** 本機有可匯入的名單；mock `useSession` 為 `{ status: "loading", signedInHint: true, hydrated: true }`
- **WHEN** 渲染 `LocalDataImportSection`
- **THEN** `local-import-section` 不存在，且沒有任何 `fetch`
- **驗收**：`nextjs-pickball/components/matchmaker/LocalDataImportSection.test.tsx`，it 名稱「regression guard：session 等待中時不渲染匯入區塊」

#### Scenario: JavaScript 載入前各頁只顯示等待中提示

- **GIVEN** 訪客、停用 JavaScript（`javaScriptEnabled: false`），即只看伺服器輸出
- **WHEN** 依序開啟 `/matchmaker/players`、`/matchmaker`、`/matchmaker/stats`、`/matchmaker/history`、`/matchmaker/data`、`/scoreboard`、`/scoreboard?match=m1`
- **THEN** 每頁皆可見 `[data-sync-status="pending"]` 與「正在載入資料…」；且「目前還沒有參賽者」「共 0 位參賽者」「目前沒有可出場的參賽者」「尚未產生任何回合」「還沒有任何對戰紀錄」「選擇備份檔…」、按鈕「匯出 CSV」「確認匯入」、`[aria-label="我方目前 0 分"]` 皆不存在
- **驗收**：`nextjs-pickball/tests/e2e/specs/data-pending.spec.ts`，test 名稱「JavaScript 載入前各頁只顯示等待中提示而不顯示空狀態或預設值」

#### Scenario: 訪客載入本機資料的過程中從未出現空狀態或預設值

- **GIVEN** 訪客、本機有兩位可出場的參賽者、一輪回合、一筆今日歷史、比分 5:3 的獨立計分板；以閃爍記錄器監看整個載入過程
- **WHEN** 依序開啟 `/matchmaker/players`、`/matchmaker`、`/matchmaker/stats`、`/scoreboard`，各等到本機資料可見
- **THEN** 每頁的記錄皆為空：從未出現「目前還沒有參賽者」「共 0 位參賽者」「目前沒有可出場的參賽者」「尚未產生任何回合」「還沒有任何對戰紀錄」或 `[aria-label="我方目前 0 分"]`；本機資料可見後 `[data-sync-status]` 不存在
- **驗收**：`nextjs-pickball/tests/e2e/specs/data-pending.spec.ts`，test 名稱「訪客載入本機資料的過程中參賽者、對戰、統計與計分板頁從未出現空狀態或預設值」

#### Scenario: 訪客載入本機歷史的過程中從未出現空狀態

- **GIVEN** 訪客、本機有一筆今日歷史；以閃爍記錄器監看整個載入過程
- **WHEN** 開啟 `/matchmaker/history`，等到該筆紀錄可見
- **THEN** 記錄為空：從未出現「還沒有任何對戰紀錄」；紀錄可見後 `[data-sync-status]` 不存在
- **驗收**：`nextjs-pickball/tests/e2e/specs/data-pending.spec.ts`，test 名稱「訪客載入本機歷史的過程中從未出現空狀態」

#### Scenario: 已登入者重新整理時在 session 回應前顯示等待中而非空名單

- **GIVEN** 以測試帳號登入、雲端有一位參賽者、本機名單為空；已開啟過一次 `/matchmaker/players` 並看到 `[data-sync-status="synced"]`（上次登入提示已寫入）；重新整理前注入閃爍記錄器
- **WHEN** 以 `page.route` 暫停 `/api/session` 後重新整理，並在放行前檢查畫面，之後放行
- **THEN** 放行前 `main[data-sync-status="pending"]` 可見、`role="status"` 文字為「正在載入資料…」；放行後 `[data-sync-status="synced"]` 可見且雲端那位參賽者可見；記錄為空：從未出現「目前還沒有參賽者」與「共 0 位參賽者」
- **驗收**：`nextjs-pickball/tests/e2e/user-data/roster-sync.spec.ts`，test 名稱「已登入者重新整理參賽者頁時在 session 回應前顯示等待中而非空名單」

#### Scenario: 訪客重新整理時 session 回應前即顯示本機名單

- **GIVEN** 訪客（無 storage state）、本機名單有一位參賽者、沒有上次登入提示
- **WHEN** 以 `page.route` 暫停 `/api/session` 後重新整理 `/matchmaker/players`，並在放行前檢查畫面，之後放行
- **THEN** 放行前該參賽者可見、`[data-sync-status]` 與 `role="status"` 皆不存在；放行後相同
- **驗收**：`nextjs-pickball/tests/e2e/specs/data-pending.spec.ts`，test 名稱「訪客重新整理參賽者頁時在 session 回應前即顯示本機名單」

#### Scenario: 上次登入提示殘留但已非登入時短暫等待後回到本機

- **GIVEN** 訪客、本機名單有一位參賽者；以 `addInitScript` 讓下一個文件載入前就寫入上次登入提示（模擬 cookie 已過期）
- **WHEN** 以 `page.route` 暫停 `/api/session` 後開啟（或重新整理）`/matchmaker/players`（測試以 `goto` 進入），並在放行前檢查畫面，之後放行
- **THEN** 放行前 `main[data-sync-status="pending"]` 可見且該參賽者不存在；放行後該參賽者可見、`[data-sync-status]` 不存在，且上次登入提示已被清除
- **驗收**：`nextjs-pickball/tests/e2e/specs/data-pending.spec.ts`，test 名稱「上次登入提示殘留但已非登入時先顯示等待中再顯示本機名單並清除提示」

## ADDED Requirements

### Requirement: session 無法確認時的阻擋畫面與本機備援

有上次登入提示的使用者在 session 無法確認時（`auth`「全頁共用的 session store 與 useSession」的無法確認快照：請求失敗或帶提示等待逾時，含已登入使用中重新取得 session 失敗），
前端 MUST 先擋住資料畫面，SHALL NOT 自動改用本機資料、SHALL NOT 交出本機資料、SHALL NOT 發出任何使用者資料請求；只有使用者按下按鈕「先用這台裝置的資料」才進入本機備援。
沒有上次登入提示時 session 請求失敗仍 fail-closed 為 auth 停用（訪客），直接顯示本機資料，SHALL NOT 出現本 Requirement 的提示、按鈕或本機提示。

**顯示狀態與文案**（`nextjs-pickball/lib/sync/sync-status.ts`）：

- `unavailable` 是 `DataStatus` 的值（不是 `SyncStatus`：雲端 hook 不會回報它），`isContentBlocked("unavailable")` 為 true。
- 同檔 SHALL 匯出 `LOCAL_FALLBACK_ACTION_LABEL`（「先用這台裝置的資料」）與 `LOCAL_FALLBACK_NOTICE`（「目前連不上雲端，修改只會存在這台裝置；重新整理頁面可再次連線雲端」），是本 Requirement 唯一新增的兩個文案；
  無法確認時的提示文字 MUST 沿用既有 `syncStatusMessage("load-failed")`（「無法載入雲端資料，請重新整理頁面」），不另立文案。E2E MUST 匯入常數，不抄字面值。
- `SyncStatusNotice` 在 `unavailable` 時以既有 `role="status"` 外觀顯示上述 load-failed 文案，並在該 `role="status"` 元素**之外**渲染一顆 `<button type="button">`，文字為 `LOCAL_FALLBACK_ACTION_LABEL`，按下 MUST 呼叫 `chooseLocalFallback()`。
  按鈕 SHALL NOT 放在 `role="status"` 元素內（live region 內的互動元素會隨內容更新被重複朗讀）。其他狀態 SHALL NOT 渲染此按鈕。

**使用端**：

- 三個選擇器、`HistoryModeSwitch`、資料頁 `JsonBackupSection`、`HistoryCsvSection`、`RosterCsvImportSection` 在儲存模式為 `"pending"` 時以 `pendingDataStatus(session)` 取得顯示狀態（「前端依 session 選擇儲存模式」）；
  無法確認時其 `syncStatus` 與容器 `data-sync-status` 為 `"unavailable"`，資料與操作與等待中相同（「資料來源確定前的等待中畫面」的選擇器等待中結果與元件呈現）。
  參賽者頁、統計頁（`LocalStatsContent`）與 `Scoreboard` 經選擇器取得 `unavailable`，依既有 `isContentBlocked` 分支以 `SyncStatusNotice` 取代內容。資料頁三區塊各自顯示一組提示與按鈕，任一顆按下效果相同。
- 對戰頁（`app/matchmaker/page.tsx`）合併名單與回合的顯示狀態時，`unavailable` MUST 優先於其他所有狀態（`SYNC_STATUS_PRIORITY` 第一位）——漏列時合併結果會落到 `local` 而畫出空舞台。
- `useRoundStore` 傳給雲端回合 hook 的名單狀態（型別為 `SyncStatus`）在名單為 `unavailable` 時與 `pending` 相同，以 `loading` 傳入。

**本機備援**：

- 按下按鈕後快照為 `{ status: "loading", localFallback: true }`，儲存模式為 `"local"`：各頁依本機模式顯示本機資料（本機讀入規則不變），使用者的修改只寫入本機；本次頁面期間不會被晚到的 session 回應切回雲端。
- `nextjs-pickball/components/sync/LocalFallbackBanner.tsx`（client 元件，掛在 `nextjs-pickball/app/layout.tsx` 的 `<body>` 內）MUST 只在本機備援快照時渲染 `role="status"` 的提示，文字為 `LOCAL_FALLBACK_NOTICE`；
  它 MUST 以固定定位呈現、不佔版面（計分板 `h-dvh` 的零垂直捲動版面不受影響）、不攔截指標事件（不擋住下方操作）、列印時隱藏。其他快照（含伺服器輸出與 hydration 那次 render）SHALL NOT 渲染任何元素，因此不影響 hydration。
- 已知取捨：navbar `AccountEntry` 與登入頁 `LoginForm` 只看 `status === "loading"`，在無法確認與本機備援時仍顯示載入中佔位（沒有登入或登出入口）；重新整理頁面即重新確認 session。

#### Scenario: 無法確認的顯示狀態取代內容且新文案為固定值

- **WHEN** 呼叫 `isContentBlocked("unavailable")`，並讀取 `LOCAL_FALLBACK_ACTION_LABEL`、`LOCAL_FALLBACK_NOTICE` 與 `syncStatusMessage("load-failed")`
- **THEN** `isContentBlocked` 為 true；兩個常數依序為「先用這台裝置的資料」與「目前連不上雲端，修改只會存在這台裝置；重新整理頁面可再次連線雲端」；load-failed 文案仍為「無法載入雲端資料，請重新整理頁面」
- **驗收**：`nextjs-pickball/lib/sync/sync-status.test.ts`，it 名稱「unavailable 取代內容，按鈕與本機提示文案為固定值」

#### Scenario: 同步提示在無法確認時顯示載入失敗文案與按鈕

- **GIVEN** `chooseLocalFallback` 被替換為假函式
- **WHEN** 以 `unavailable` 渲染 `SyncStatusNotice` 並按下按鈕；另以 `pending`、`load-failed` 渲染
- **THEN** `unavailable` 時 `role="status"` 的文字為「無法載入雲端資料，請重新整理頁面」、按鈕「先用這台裝置的資料」存在且不在 `role="status"` 元素內，按下後假函式被呼叫一次；`pending` 與 `load-failed` 時沒有任何按鈕
- **驗收**：`nextjs-pickball/components/sync/SyncStatusNotice.test.tsx`，it 名稱「unavailable 顯示無法載入雲端資料與先用這台裝置的資料按鈕，按下後呼叫 chooseLocalFallback」

#### Scenario: 無法確認：名單選擇器回報 unavailable 且不交出本機名單

- **GIVEN** `matchmaker:roster:v1` 有一位參賽者；mock `useSession` 為 `{ status: "loading", signedInHint: true, unavailable: true, hydrated: true }`
- **WHEN** `useRosterStore()` mount 後呼叫 `addPlayer`
- **THEN** `players` 為空陣列、`syncStatus` 為 `unavailable`；`matchmaker:roster:v1` 解析後仍只有原本那一位；沒有任何 `fetch`
- **驗收**：`nextjs-pickball/hooks/useRosterStore.test.tsx`，it 名稱「session 無法確認時 syncStatus 為 unavailable 且不回傳本機名單也不發請求」

#### Scenario: 已登入使用中轉為無法確認時名單選擇器不交出先前的雲端名單

- **GIVEN** mock `useSession` 為已登入；雲端 GET 回一位參賽者，選擇器已為 `synced`
- **WHEN** mock 改為無法確認快照並 rerender，之後呼叫 `addPlayer`
- **THEN** rerender 後 `players` 為空陣列、`syncStatus` 為 `unavailable`；`addPlayer` 之後 `fetch` 的呼叫次數不變
- **驗收**：`nextjs-pickball/hooks/useRosterStore.test.tsx`，it 名稱「已登入使用中 session 轉為無法確認時不交出先前的雲端名單且操作不發請求」

#### Scenario: 本機備援：名單選擇器回傳本機名單

- **GIVEN** `matchmaker:roster:v1` 有一位參賽者；mock `useSession` 為 `{ status: "loading", localFallback: true, hydrated: true }`
- **WHEN** `useRosterStore()` mount
- **THEN** `players` 為本機那一位、`syncStatus` 為 `local`；沒有任何 `fetch`
- **驗收**：`nextjs-pickball/hooks/useRosterStore.test.tsx`，it 名稱「選擇先用這台裝置的資料後回傳本機名單且 syncStatus 為 local」（regression guard）

#### Scenario: 無法確認：回合選擇器回報 unavailable 且不交出本機回合與歷史

- **GIVEN** `matchmaker:round:v1` 有一輪、`matchmaker:history:v1` 有一筆；mock `useSession` 為無法確認快照
- **WHEN** `useRoundStore(options)`（`rosterSyncStatus` 為 `unavailable`）mount 後呼叫 `generateRound`
- **THEN** `round` 為 `null`、`history` 為空陣列、`syncStatus` 為 `unavailable`、`remoteMatchSlots` 為 `null`；`generateRound` 回傳 `ok: false`；兩個本機 key 解析後與 mount 前相同；沒有任何 `fetch`
- **驗收**：`nextjs-pickball/hooks/useRoundStore.test.tsx`，it 名稱「session 無法確認時 syncStatus 為 unavailable 且不回傳本機回合與歷史」

#### Scenario: 無法確認：計分板選擇器回報 unavailable 且不交出本機計分

- **GIVEN** `scoreboard:current:v1` 有非初始的比分；`scoreboard:matches:v1` 沒有 `m1`；mock `useSession` 為無法確認快照
- **WHEN** `useScoreboardStore(null)` mount 後 dispatch `RALLY_WON`；另以 `useScoreboardStore("m1")` mount
- **THEN** 前者 `state` 等於計分板初始狀態且 dispatch 後不變、`bindingStatus` 為 `standalone`、`syncStatus` 為 `unavailable`，`scoreboard:current:v1` 解析後與 mount 前相同；後者 `bindingStatus` 為 `pending`、`syncStatus` 為 `unavailable`；沒有任何 `fetch`
- **驗收**：`nextjs-pickball/hooks/useScoreboardStore.test.tsx`，it 名稱「session 無法確認時 syncStatus 為 unavailable 且不回傳本機計分，帶 matchId 時綁定狀態為 pending」

#### Scenario: 無法確認：歷史頁顯示無法載入提示與按鈕

- **GIVEN** `matchmaker:history:v1` 有一筆今日的紀錄；mock `useSession` 為無法確認快照
- **WHEN** 渲染 `HistoryModeSwitch`
- **THEN** `role="status"` 的文字為「無法載入雲端資料，請重新整理頁面」、按鈕「先用這台裝置的資料」存在、容器帶 `data-sync-status="unavailable"`；radiogroup「歷史區間」與該筆紀錄卡片皆不存在；`RemoteHistoryView` 未掛載
- **驗收**：`nextjs-pickball/components/matchmaker/HistoryModeSwitch.test.tsx`，it 名稱「session 無法確認時顯示無法載入提示與按鈕且不渲染歷史」

#### Scenario: 無法確認：JSON 備份區塊不提供匯出與還原

- **GIVEN** mock `useSession` 為無法確認快照
- **WHEN** 渲染 `JsonBackupSection`
- **THEN** heading「JSON 完整備份」存在；`role="status"` 的文字為「無法載入雲端資料，請重新整理頁面」、按鈕「先用這台裝置的資料」存在、`[data-sync-status="unavailable"]` 存在；按鈕「匯出 JSON」、`json-backup-import-input`、`json-backup-cloud-import-input` 皆不存在
- **驗收**：`nextjs-pickball/components/matchmaker/JsonBackupSection.test.tsx`，it 名稱「session 無法確認時以無法載入提示與按鈕取代匯出與還原操作」

#### Scenario: 無法確認：歷史 CSV 區塊不提供匯出

- **GIVEN** mock `useSession` 為無法確認快照
- **WHEN** 渲染 `HistoryCsvSection`
- **THEN** heading「歷史賽果 CSV 匯出」存在；`role="status"` 的文字為「無法載入雲端資料，請重新整理頁面」、按鈕「先用這台裝置的資料」存在、`[data-sync-status="unavailable"]` 存在；按鈕「匯出 CSV」不存在
- **驗收**：`nextjs-pickball/components/matchmaker/HistoryCsvSection.test.tsx`，it 名稱「session 無法確認時以無法載入提示與按鈕取代匯出操作」

#### Scenario: 無法確認：參賽者 CSV 匯入區塊不提供選檔與確認

- **GIVEN** mock `useSession` 為無法確認快照
- **WHEN** 渲染 `RosterCsvImportSection`
- **THEN** heading「參賽者名單 CSV 匯入」存在；`role="status"` 的文字為「無法載入雲端資料，請重新整理頁面」、按鈕「先用這台裝置的資料」存在、`[data-sync-status="unavailable"]` 存在；`roster-csv-import-input` 與按鈕「確認匯入」皆不存在
- **驗收**：`nextjs-pickball/components/matchmaker/RosterCsvImportSection.test.tsx`，it 名稱「session 無法確認時以無法載入提示與按鈕取代選檔與確認匯入」

#### Scenario: 無法確認：對戰頁以提示與按鈕取代場次舞台

- **GIVEN** 本機名單有兩位可出場的參賽者；mock `useSession` 為無法確認快照
- **WHEN** 渲染 `app/matchmaker/page.tsx` 的頁面元件
- **THEN** `main` 帶 `data-sync-status="unavailable"`；`role="status"` 的文字為「無法載入雲端資料，請重新整理頁面」、按鈕「先用這台裝置的資料」存在；「目前沒有可出場的參賽者」與「尚未產生任何回合」皆不存在；沒有任何 `fetch`
- **驗收**：`nextjs-pickball/app/matchmaker/page.test.tsx`，it 名稱「session 無法確認時對戰頁以無法載入提示與按鈕取代場次舞台」

#### Scenario: 本機提示只在本機備援時出現

- **WHEN** mock `useSession` 依序為本機備援快照、無法確認快照、`{ status: "loading", signedInHint: true }`、`{ status: "loading" }`、訪客的 ready、已登入的 ready，各自渲染 `LocalFallbackBanner`
- **THEN** 只有本機備援時渲染 `role="status"`、文字為「目前連不上雲端，修改只會存在這台裝置；重新整理頁面可再次連線雲端」；其餘五種 `container` 皆為空
- **驗收**：`nextjs-pickball/components/sync/LocalFallbackBanner.test.tsx`，it 名稱「只在本機備援時顯示修改只存在這台裝置的提示，其餘快照不渲染」

#### Scenario: 有上次登入提示而 session 請求失敗時先擋住畫面，選擇後改用本機名單

- **GIVEN** 訪客、本機名單有一位參賽者；以 `addInitScript` 讓下一個文件載入前就寫入上次登入提示；`/api/session` 一律回 500
- **WHEN** 開啟 `/matchmaker/players`，等到提示出現後按下「先用這台裝置的資料」
- **THEN** 按下前 `main[data-sync-status="unavailable"]` 可見、`role="status"` 文字為「無法載入雲端資料，請重新整理頁面」、按鈕可見、該參賽者不存在、上次登入提示仍為 `"1"`；
  按下後該參賽者可見、本機提示「目前連不上雲端，修改只會存在這台裝置；重新整理頁面可再次連線雲端」可見、`[data-sync-status]` 不存在、上次登入提示仍為 `"1"`
- **驗收**：`nextjs-pickball/tests/e2e/specs/data-pending.spec.ts`，test 名稱「有上次登入提示而 session 請求失敗時先擋住畫面，按下先用這台裝置的資料後顯示本機名單與本機提示」

#### Scenario: 有上次登入提示而 session 請求網路中斷時同樣先擋住畫面

- **GIVEN** 同上，但 `/api/session` 的請求一律以 `route.abort()` 中斷
- **WHEN** 開啟 `/matchmaker/players`
- **THEN** `main[data-sync-status="unavailable"]` 可見、`role="status"` 文字為「無法載入雲端資料，請重新整理頁面」、按鈕「先用這台裝置的資料」可見、該參賽者不存在
- **驗收**：`nextjs-pickball/tests/e2e/specs/data-pending.spec.ts`，test 名稱「有上次登入提示而 session 請求網路中斷時顯示無法載入提示與按鈕」
