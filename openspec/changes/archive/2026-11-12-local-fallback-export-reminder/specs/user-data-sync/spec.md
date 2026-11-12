# Specification: user-data-sync

## MODIFIED Requirements

### Requirement: session 無法確認時的阻擋畫面與本機備援

有上次登入提示的使用者在 session 無法確認時（`auth`「全頁共用的 session store 與 useSession」的無法確認快照：請求失敗或帶提示等待逾時，含已登入使用中重新取得 session 失敗），
前端 MUST 先擋住資料畫面，SHALL NOT 自動改用本機資料、SHALL NOT 交出本機資料、SHALL NOT 發出任何使用者資料請求；只有使用者按下按鈕「先用這台裝置的資料」才進入本機備援。
沒有上次登入提示時 session 請求失敗仍 fail-closed 為 auth 停用（訪客），直接顯示本機資料，SHALL NOT 出現本 Requirement 的提示、按鈕或本機提示。

**顯示狀態與文案**（`nextjs-pickball/lib/sync/sync-status.ts`）：

- `unavailable` 是 `DataStatus` 的值（不是 `SyncStatus`：雲端 hook 不會回報它），`isContentBlocked("unavailable")` 為 true。
- 同檔 SHALL 匯出 `LOCAL_FALLBACK_ACTION_LABEL`（「先用這台裝置的資料」）與 `LOCAL_FALLBACK_NOTICE`（「目前連不上雲端，修改只會存在這台裝置。重新整理會再次連線雲端，請先到「資料」頁匯出 JSON 備份，連線後再選擇備份檔匯入雲端」），是本 Requirement 唯一新增的兩個文案；
  無法確認時的提示文字 MUST 沿用既有 `syncStatusMessage("load-failed")`（「無法載入雲端資料，請重新整理頁面」），不另立文案。E2E MUST 匯入常數，不抄字面值。
  `LOCAL_FALLBACK_NOTICE` 同時是備援期間的備份提醒：重新整理並連上雲端後，資料頁「匯出 JSON」匯出的是雲端資料、本機資料沒有任何匯出入口，且「匯入本機資料到雲端」在雲端已有資料時會被拒絕，
  所以文案 MUST 提醒使用者在重新整理**之前**先到「資料」頁（導覽名稱，見 `lib/matchmaker/section-nav.ts`）匯出 JSON 備份，連線後再於同頁「JSON 完整備份」區塊選擇備份檔匯入雲端（雲端已有資料時走附加流程）。
  本機備援期間儲存模式為 `"local"`，「匯出 JSON」匯出本機資料；提示只改文字，SHALL NOT 加連結或按鈕。
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
  它 MUST 以固定定位呈現、不佔版面（計分板 `h-dvh` 的零垂直捲動版面不受影響）、不攔截指標事件（不擋住下方操作）、列印時隱藏，且層級 MUST 低於計分板專注模式操作列（`z-40`）與對話框遮罩（`z-50`）——不得蓋住計分操作列或浮在對話框之上；計分板專注模式（`html` 帶 `sb-focus`）時 MUST 移到浮動操作列上方，文字不被操作列遮住。其他快照（含伺服器輸出與 hydration 那次 render）SHALL NOT 渲染任何元素，因此不影響 hydration。
- 已知取捨：navbar `AccountEntry` 與登入頁 `LoginForm` 只看 `status === "loading"`，在無法確認與本機備援時仍顯示載入中佔位（沒有登入或登出入口）；重新整理頁面即重新確認 session。

#### Scenario: 無法確認的顯示狀態取代內容且新文案為固定值

- **WHEN** 呼叫 `isContentBlocked("unavailable")`，並讀取 `LOCAL_FALLBACK_ACTION_LABEL`、`LOCAL_FALLBACK_NOTICE` 與 `syncStatusMessage("load-failed")`
- **THEN** `isContentBlocked` 為 true；兩個常數依序為「先用這台裝置的資料」與「目前連不上雲端，修改只會存在這台裝置。重新整理會再次連線雲端，請先到「資料」頁匯出 JSON 備份，連線後再選擇備份檔匯入雲端」；load-failed 文案仍為「無法載入雲端資料，請重新整理頁面」
- **驗收**：`nextjs-pickball/lib/sync/sync-status.test.ts`，it 名稱「unavailable 取代內容，按鈕與本機提示文案為固定值」

#### Scenario: 同步提示在無法確認時顯示載入失敗文案與按鈕

- **GIVEN** `chooseLocalFallback` 被替換為假函式
- **WHEN** 以 `unavailable` 渲染 `SyncStatusNotice` 並按下按鈕；另以 `pending`、`load-failed` 渲染
- **THEN** `unavailable` 時 `role="status"` 的文字為「無法載入雲端資料，請重新整理頁面」、按鈕「先用這台裝置的資料」存在、不在 `role="status"` 元素內且 `type` 為 `button`，按下後假函式被呼叫一次；`pending` 與 `load-failed` 時沒有任何按鈕
- **驗收**：`nextjs-pickball/components/sync/SyncStatusNotice.test.tsx`，it 名稱「unavailable 顯示無法載入雲端資料與先用這台裝置的資料按鈕，按下後呼叫 chooseLocalFallback」

#### Scenario: 無法確認：名單選擇器回報 unavailable 且不交出本機名單

- **GIVEN** `matchmaker:roster:v1` 有一位參賽者；mock `useSession` 為 `{ status: "loading", signedInHint: true, unavailable: true, hydrated: true }`
- **WHEN** `useRosterStore()` mount 後呼叫 `addPlayer`
- **THEN** `players` 為空陣列、`droppedCount` 為 0、`syncStatus` 為 `unavailable`；`matchmaker:roster:v1` 解析後仍只有原本那一位；沒有任何 `fetch`
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

- **WHEN** mock `useSession` 依序為本機備援快照、無法確認快照、`{ status: "loading", signedInHint: true }`、`{ status: "loading" }`、訪客的 ready、auth 停用的 ready、已登入的 ready，各自渲染 `LocalFallbackBanner`
- **THEN** 只有本機備援時渲染 `role="status"`、文字為「目前連不上雲端，修改只會存在這台裝置。重新整理會再次連線雲端，請先到「資料」頁匯出 JSON 備份，連線後再選擇備份檔匯入雲端」，且最外層元素的 class 含 `fixed`、`pointer-events-none`、`print:hidden`、`z-30` 與 `[.sb-focus_&]:bottom-16`；其餘六種 `container` 皆為空
- **驗收**：`nextjs-pickball/components/sync/LocalFallbackBanner.test.tsx`，it 名稱「只在本機備援時顯示修改只存在這台裝置的提示，其餘快照不渲染」

#### Scenario: 有上次登入提示而 session 請求失敗時先擋住畫面，選擇後改用本機名單

- **GIVEN** 訪客、本機名單有一位參賽者；以 `addInitScript` 讓下一個文件載入前就寫入上次登入提示；`/api/session` 一律回 500
- **WHEN** 開啟 `/matchmaker/players`，等到提示出現後按下「先用這台裝置的資料」
- **THEN** 按下前 `main[data-sync-status="unavailable"]` 可見、`role="status"` 文字為「無法載入雲端資料，請重新整理頁面」、按鈕可見、該參賽者不存在、上次登入提示仍為 `"1"`；
  按下後該參賽者可見、本機提示「目前連不上雲端，修改只會存在這台裝置。重新整理會再次連線雲端，請先到「資料」頁匯出 JSON 備份，連線後再選擇備份檔匯入雲端」可見、`[data-sync-status]` 不存在、上次登入提示仍為 `"1"`
- **驗收**：`nextjs-pickball/tests/e2e/specs/data-pending.spec.ts`，test 名稱「有上次登入提示而 session 請求失敗時先擋住畫面，按下先用這台裝置的資料後顯示本機名單與本機提示」

#### Scenario: 有上次登入提示而 session 請求網路中斷時同樣先擋住畫面

- **GIVEN** 同上，但 `/api/session` 的請求一律以 `route.abort()` 中斷
- **WHEN** 開啟 `/matchmaker/players`
- **THEN** `main[data-sync-status="unavailable"]` 可見、`role="status"` 文字為「無法載入雲端資料，請重新整理頁面」、按鈕「先用這台裝置的資料」可見、該參賽者不存在
- **驗收**：`nextjs-pickball/tests/e2e/specs/data-pending.spec.ts`，test 名稱「有上次登入提示而 session 請求網路中斷時顯示無法載入提示與按鈕」
