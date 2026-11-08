# Specification: user-data-sync

## MODIFIED Requirements

### Requirement: 前端依 session 選擇儲存模式

`nextjs-pickball/lib/sync/storage-mode.ts` SHALL 匯出 `resolveStorageMode(snapshot: SessionSnapshot): "local" | "remote" | "pending"`，
是前端「存本機還是存雲端」的**唯一判斷**：只有 `status === "ready"`、`authEnabled === true` 且 `user !== null` 時回 `"remote"`；
`status === "loading"` 且快照帶 `signedInHint: true`（`auth`「全頁共用的 session store 與 useSession」：瀏覽器記得上次確認時為登入狀態，且尚未逾時）時回 `"pending"`（等待中）；其餘一律 `"local"`。

session 仍在載入且**沒有**上次登入提示時 MUST 為 `"local"`：訪客（含正式站從未登入的使用者、auth 停用）的首屏時序 SHALL NOT 因等待 `/api/session` 而改變——訪客行為與既有 E2E 須零迴歸。
`"pending"` 時 SHALL NOT 交出本機資料、SHALL NOT 啟用雲端 hook，各使用端的呈現見「session 確認前的等待中畫面」。
`"pending"` 只會出現在頁面第一次取得 session 之前：session store 取得回應後不會再回到 `loading`（`refresh()` 期間快照維持 ready），逾時後快照也改回不帶提示的 `loading`。

各資料的 store hook SHALL 以「選擇器」形態接上儲存模式：既有本機實作原封不動保留（改名為同檔的 `useLocal<X>Store`），
新增 `hooks/useRemote<X>Store.ts`（參數含 `enabled: boolean` 與 `onUnauthorized: () => void`），對外名稱 `use<X>Store` 依 `useSession()` 與 `resolveStorageMode` 回傳：`"remote"` 時回傳雲端實作、`"local"` 時回傳本機實作、`"pending"` 時回傳等待中結果。
兩個 hook 每次 render 都呼叫（遵守 hooks 規則），未被選用的一方 SHALL NOT 發出請求或寫入 localStorage 以外的副作用。
雲端 hook 收到 401 時 MUST 呼叫 `onUnauthorized`（選擇器傳入 `useSession().refresh`），使 session 更新後自動回到本機模式。

#### Scenario: 只有就緒、啟用且已登入時為 remote

- **WHEN** 以 `{ status: "loading" }`、`{ status: "ready", authEnabled: false, user: null }`、`{ status: "ready", authEnabled: true, user: null }`、`{ status: "ready", authEnabled: true, user: <使用者> }` 分別呼叫
- **THEN** 只有最後一種回 `"remote"`，其餘皆為 `"local"`
- **驗收**：`nextjs-pickball/lib/sync/storage-mode.test.ts`，it 名稱「只有 session 就緒、auth 啟用且有 user 時為 remote」

#### Scenario: session 載入中且帶上次登入提示時為 pending

- **WHEN** 以 `{ status: "loading", signedInHint: true }` 呼叫，另以不帶 `signedInHint` 的 `{ status: "loading" }`、以及型別轉換硬塞 `signedInHint: true` 的三種 ready 快照（auth 停用、未登入、已登入）呼叫
- **THEN** 第一種回 `"pending"`；不帶提示的 loading 回 `"local"`；三種 ready 快照的結果與不帶提示時相同（依序 `"local"`、`"local"`、`"remote"`），提示只在 `loading` 時有作用
- **驗收**：`nextjs-pickball/lib/sync/storage-mode.test.ts`，it 名稱「session 載入中且帶上次登入提示時為 pending」

## ADDED Requirements

### Requirement: session 確認前的等待中畫面

儲存模式為 `"pending"`（「前端依 session 選擇儲存模式」）時，前端 MUST 把畫面視為「雲端載入中」，以既有 `SyncStatusNotice` 的 `loading` 文案「正在載入雲端資料…」提示，
SHALL NOT 顯示本機資料、SHALL NOT 讓使用者觸發任何本機寫入或本機與雲端之間的資料互動（匯入、還原、備份匯出、CSV 匯出入），也 SHALL NOT 發出任何使用者資料請求。
本 Requirement 不新增任何文案。等待中結束後依確認結果切換：已登入 → 雲端模式（雲端 hook 開始載入，畫面延續 `loading` 直到雲端資料到達）；未登入、auth 停用或請求失敗 → 本機模式，與訪客相同。

**選擇器的等待中結果**（三者皆不啟用雲端 hook：`enabled` 為 false、`userId` 為 `null`）：

- `useRosterStore()`：`players` 為空陣列、`droppedCount` 為 0、`syncStatus` 為 `"loading"`；`addPlayer`、`updatePlayer`、`removePlayer`、`togglePlayerActive`、`resetRoster`、`applyRemotePlayers`、`reloadRemotePlayers` 皆不改變回傳的名單、不寫入本機、不發請求。
- `useRoundStore(options)`：`round` 為 `null`、`history` 為空陣列、`droppedCount` 為 0、`syncStatus` 為 `"loading"`、`remoteMatchSlots` 為 `null`；七個操作皆回傳 `ok: false` 且不改變回合、不寫入本機、不發請求。
  因 `round` 為 `null`，對戰頁的分槽回填 effect 在等待中不會讀取或清除本機分槽、不會把本機比分送進本機歷史。
- `useScoreboardStore(matchId)`：`state` 為計分板初始狀態、`dispatch` 不改變狀態也不寫入本機、`syncStatus` 為 `"loading"`；`bindingStatus` 在 `matchId === null` 時為 `"standalone"`，否則為 `"pending"`——SHALL NOT 為 `"missing"`，否則已登入者開啟 `/scoreboard?match=` 會先閃「場次已失效」。

本機 hook 依 hooks 規則在等待中仍會 mount：其 mount 時讀取並把**同一份**本機資料寫回的既有行為（雲端模式下同樣發生）不變；等待中 SHALL NOT 有任何會改變本機資料內容的寫入。

**頁面與元件**：

- 參賽者頁、對戰頁、統計頁的本機內容（`LocalStatsContent`）與計分板（`Scoreboard`）沿用既有「`syncStatus` 為 `loading` 時以 `SyncStatusNotice` 取代主要內容、根元素帶 `data-sync-status="loading"`」的分支，不另寫判斷。
- 歷史頁的 `nextjs-pickball/components/matchmaker/HistoryModeSwitch.tsx`：`"pending"` 時 MUST 渲染帶 `data-sync-status="loading"` 的容器與 `SyncStatusNotice`（`loading`），SHALL NOT 掛載 `HistoryView`（它會讀本機歷史）或 `RemoteHistoryView`。
- 統計頁入口 `nextjs-pickball/app/matchmaker/stats/page.tsx`：`"pending"` 時 MUST 渲染 `LocalStatsContent`（由選擇器的 `loading` 顯示提示），SHALL NOT 掛載 `RemoteStatsContent`——雲端內容只在 `"remote"` 時掛載。
- 資料頁：`JsonBackupSection`、`HistoryCsvSection`、`RosterCsvImportSection` 在 `"pending"` 時保留區塊標題與說明，操作區 MUST 只渲染 `SyncStatusNotice`（`loading`）——「匯出 JSON」「匯出 CSV」「確認匯入」按鈕與三種選檔（`json-backup-import-input`、`json-backup-cloud-import-input`、`roster-csv-import-input`）皆不渲染；
  `LocalDataImportSection` 在 `"pending"` 時不渲染（與本機模式相同）；`ClearLocalDataSection` 兩種模式語意相同（只清本機 key），不受儲存模式影響。

#### Scenario: 等待中：名單選擇器不交出本機名單且操作無效

- **GIVEN** `matchmaker:roster:v1` 有一位參賽者；mock `useSession` 為 `{ status: "loading", signedInHint: true }`
- **WHEN** `useRosterStore()` mount 後呼叫 `addPlayer`
- **THEN** `players` 為空陣列、`syncStatus` 為 `loading`；`matchmaker:roster:v1` 解析後仍只有原本那一位；沒有任何 `fetch`
- **驗收**：`nextjs-pickball/hooks/useRosterStore.test.tsx`，it 名稱「session 等待中時不回傳本機名單、syncStatus 為 loading 且操作不寫入本機也不發請求」

#### Scenario: 等待中：確認為未登入後改回本機名單

- **GIVEN** `matchmaker:roster:v1` 有一位參賽者；mock `useSession` 先為 `{ status: "loading", signedInHint: true }`
- **WHEN** mock 改為 `{ status: "ready", authEnabled: true, user: null }` 並 rerender
- **THEN** 改變前 `players` 為空陣列；改變後 `players` 為本機那一位、`syncStatus` 為 `local`
- **驗收**：`nextjs-pickball/hooks/useRosterStore.test.tsx`，it 名稱「等待中的 session 確認為未登入時改回本機名單」

#### Scenario: 等待中：回合選擇器不交出本機回合與歷史且操作無效

- **GIVEN** `matchmaker:round:v1` 有一輪、`matchmaker:history:v1` 有一筆；mock `useSession` 為 `{ status: "loading", signedInHint: true }`
- **WHEN** `useRoundStore(options)` mount 後呼叫 `generateRound`
- **THEN** `round` 為 `null`、`history` 為空陣列、`syncStatus` 為 `loading`、`remoteMatchSlots` 為 `null`；`generateRound` 回傳 `ok: false`；兩個本機 key 解析後與 mount 前相同；沒有任何 `fetch`
- **驗收**：`nextjs-pickball/hooks/useRoundStore.test.tsx`，it 名稱「session 等待中時不回傳本機回合與歷史、syncStatus 為 loading 且操作不生效」

#### Scenario: 等待中：計分板選擇器不交出本機計分且綁定場次不顯示為失效

- **GIVEN** `scoreboard:current:v1` 有非初始的比分；`scoreboard:matches:v1` 沒有 `m1`；mock `useSession` 為 `{ status: "loading", signedInHint: true }`
- **WHEN** `useScoreboardStore(null)` mount 後 dispatch `RALLY_WON`；另以 `useScoreboardStore("m1")` mount
- **THEN** 前者 `state` 等於計分板初始狀態且 dispatch 後不變、`bindingStatus` 為 `standalone`、`syncStatus` 為 `loading`，`scoreboard:current:v1` 解析後與 mount 前相同；後者 `bindingStatus` 為 `pending`（不是 `missing`）、`syncStatus` 為 `loading`；沒有任何 `fetch`
- **驗收**：`nextjs-pickball/hooks/useScoreboardStore.test.tsx`，it 名稱「session 等待中時不回傳本機計分且 syncStatus 為 loading，帶 matchId 時綁定狀態為 pending」

#### Scenario: 等待中：歷史頁顯示載入中且不讀本機歷史

- **GIVEN** `matchmaker:history:v1` 有一筆今日的紀錄；mock `useSession` 為 `{ status: "loading", signedInHint: true }`
- **WHEN** 渲染 `HistoryModeSwitch`
- **THEN** `role="status"` 的文字為「正在載入雲端資料…」、容器帶 `data-sync-status="loading"`；radiogroup「歷史區間」與該筆紀錄卡片皆不存在；`RemoteHistoryView` 未掛載
- **驗收**：`nextjs-pickball/components/matchmaker/HistoryModeSwitch.test.tsx`，it 名稱「session 等待中時顯示載入中提示且不渲染本機歷史」

#### Scenario: 等待中：統計頁顯示載入中且不掛載雲端統計

- **GIVEN** mock `useSession` 為 `{ status: "loading", signedInHint: true }`
- **WHEN** 渲染 `app/matchmaker/stats/page.tsx` 的頁面元件
- **THEN** `role="status"` 的文字為「正在載入雲端資料…」、`main` 帶 `data-sync-status="loading"`；heading「球員統計」不存在；`RemoteStatsContent` 未掛載；沒有任何 `fetch`
- **驗收**：`nextjs-pickball/app/matchmaker/stats/page.test.tsx`，it 名稱「session 等待中時統計頁顯示載入中提示且不掛載雲端統計內容」

#### Scenario: 等待中：JSON 備份區塊不提供匯出與還原

- **GIVEN** mock `useSession` 為 `{ status: "loading", signedInHint: true }`
- **WHEN** 渲染 `JsonBackupSection`
- **THEN** heading「JSON 完整備份」存在；`role="status"` 的文字為「正在載入雲端資料…」；按鈕「匯出 JSON」、`json-backup-import-input`、`json-backup-cloud-import-input` 皆不存在
- **驗收**：`nextjs-pickball/components/matchmaker/JsonBackupSection.test.tsx`，it 名稱「session 等待中時以載入中提示取代匯出與還原操作」

#### Scenario: 等待中：歷史 CSV 區塊不提供匯出

- **GIVEN** mock `useSession` 為 `{ status: "loading", signedInHint: true }`
- **WHEN** 渲染 `HistoryCsvSection`
- **THEN** heading「歷史賽果 CSV 匯出」存在；`role="status"` 的文字為「正在載入雲端資料…」；按鈕「匯出 CSV」不存在
- **驗收**：`nextjs-pickball/components/matchmaker/HistoryCsvSection.test.tsx`，it 名稱「session 等待中時以載入中提示取代匯出操作」

#### Scenario: 等待中：參賽者 CSV 匯入區塊不提供選檔與確認

- **GIVEN** mock `useSession` 為 `{ status: "loading", signedInHint: true }`
- **WHEN** 渲染 `RosterCsvImportSection`
- **THEN** heading「參賽者名單 CSV 匯入」存在；`role="status"` 的文字為「正在載入雲端資料…」；`roster-csv-import-input` 與按鈕「確認匯入」皆不存在
- **驗收**：`nextjs-pickball/components/matchmaker/RosterCsvImportSection.test.tsx`，it 名稱「session 等待中時以載入中提示取代選檔與確認匯入」

#### Scenario: 等待中：匯入本機資料區塊不渲染

- **GIVEN** 本機有可匯入的名單；mock `useSession` 為 `{ status: "loading", signedInHint: true }`
- **WHEN** 渲染 `LocalDataImportSection`
- **THEN** `local-import-section` 不存在，且沒有任何 `fetch`
- **驗收**：`nextjs-pickball/components/matchmaker/LocalDataImportSection.test.tsx`，it 名稱「regression guard：session 等待中時不渲染匯入區塊」

#### Scenario: 已登入者重新整理時在 session 回應前顯示載入中而非空名單

- **GIVEN** 以測試帳號登入、雲端有一位參賽者、本機名單為空；已開啟過一次 `/matchmaker/players` 並看到 `[data-sync-status="synced"]`（上次登入提示已寫入）
- **WHEN** 以 `page.route` 暫停 `/api/session` 後重新整理，並在放行前檢查畫面，之後放行
- **THEN** 放行前 `main[data-sync-status="loading"]` 可見、`role="status"` 文字為「正在載入雲端資料…」，「目前還沒有參賽者」與「共 0 位參賽者」皆不存在；放行後 `[data-sync-status="synced"]` 可見且雲端那位參賽者可見
- **驗收**：`nextjs-pickball/tests/e2e/user-data/roster-sync.spec.ts`，test 名稱「已登入者重新整理參賽者頁時在 session 回應前顯示載入中而非空名單」

#### Scenario: 訪客重新整理時行為不變

- **GIVEN** 訪客（無 storage state）、本機名單有一位參賽者、沒有上次登入提示
- **WHEN** 以 `page.route` 暫停 `/api/session` 後重新整理 `/matchmaker/players`，並在放行前檢查畫面，之後放行
- **THEN** 放行前該參賽者可見、`[data-sync-status]` 與 `role="status"` 皆不存在；放行後相同
- **驗收**：`nextjs-pickball/tests/e2e/specs/session-pending.spec.ts`，test 名稱「訪客重新整理參賽者頁時在 session 回應前即顯示本機名單」

#### Scenario: 上次登入提示殘留但已非登入時短暫等待後回到本機

- **GIVEN** 訪客、本機名單有一位參賽者，且 localStorage 殘留上次登入提示（模擬 cookie 已過期）
- **WHEN** 以 `page.route` 暫停 `/api/session` 後重新整理 `/matchmaker/players`，並在放行前檢查畫面，之後放行
- **THEN** 放行前 `main[data-sync-status="loading"]` 可見且該參賽者不存在；放行後該參賽者可見、`[data-sync-status]` 不存在，且上次登入提示已被清除
- **驗收**：`nextjs-pickball/tests/e2e/specs/session-pending.spec.ts`，test 名稱「上次登入提示殘留但已非登入時先顯示載入中再顯示本機名單並清除提示」
