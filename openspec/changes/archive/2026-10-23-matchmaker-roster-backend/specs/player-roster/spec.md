## MODIFIED Requirements

### Requirement: 重置名單與二次確認

參賽者頁 SHALL 提供「重置名單」操作，按下後 MUST 顯示明確確認提示，載明資料無法復原。

使用者確認後，系統 SHALL 清除本機所有屬於重置範圍的資料並回到空白初始狀態；使用者取消時 SHALL NOT 改變任何資料。

重置範圍 MUST 以**列舉的 key 清單**實作，SHALL NOT 使用 `matchmaker:` 前綴掃描 —— 前綴掃描會誤刪未來加入且不該被重置的使用者偏好，而列舉清單強制在新增資料域時主動決定它是否屬於重置範圍（見 design Decision 6）。前綴掃描在本次變更後另有一個更硬的理由不可用：重置範圍已跨出 `matchmaker:` 前綴（見下）。

目前的清單為四個 key：`matchmaker:roster:v1`（參賽者名單）、`matchmaker:round:v1`（目前回合）、`matchmaker:history:v1`（歷史賽果）與 `scoreboard:matches:v1`（對戰場次的計分板分槽），對應 `prd.md` 4.1.5 與第 10 節要求清除的「全部參賽者、目前回合與歷史賽果」。回合與歷史屬於重置範圍是產品明文決策，SHALL NOT 只清名單而讓上一場活動的回合與賽果殘留 —— 使用者按下重置的語意是「重新開始一場活動」，殘留的回合會在下一次產生對戰時被當成上一輪納入重複比對基準，而那些人可能已經不在名單裡。

`scoreboard:matches:v1` 於本次變更納入清單：該 key 的每個條目都以某個對戰場次的 id 為索引，回合被清掉後那些條目即成孤兒——使用者從舊分頁或書籤回到 `/scoreboard?match=<舊 id>` 會看到一個仍可計分、但分數永遠回填不到任何地方的計分板，且孤兒條目會無界累積在 LocalStorage 中（見 `round-lifecycle` capability 的「重排本輪或重置名單時清除對應計分板進度」Requirement）。

四個 key 的名稱 MUST 取自同一個來源模組，SHALL NOT 在本檔重複寫死字串 —— key 名稱多一處來源就多一處漏改，而漏改的失敗模式是**沉默的**：重置看起來成功了，殘留的資料要到下一輪產生對戰時才顯現。`scoreboard:matches:v1` 的字面值 MUST 取自 `nextjs-pickball/lib/scoreboard/` 的分槽 key 具名匯出（`match-slots.ts` 的 `MATCH_SLOTS_KEY`，見本 change 的 `scoreboard` delta），由 matchmaker 側的 key 清單模組 import 後併入，SHALL NOT 在 matchmaker 側再寫一次字串——同一個 key 出現兩份字面值時，改版（`:v2`）只會改到其中一份。

`scoreboard:current:v1` **不**在重置範圍內：獨立計分板的進度與分配機的活動無關，一併清掉會讓使用者正在進行的個人比賽無故歸零。重置範圍涵蓋分槽 key 而不涵蓋獨立槽，正是「一場一槽」與「全站唯一一場」兩種語意的分界所在。

**登入時（雲端模式，`user-data-sync`「前端依 session 選擇儲存模式」）**：確認後系統 MUST 呼叫 `POST /api/matchmaker/reset`，
**成功後**才清空畫面上的名單，並以 `resetLocalMatchProgress()` 只清除本機的 `matchmaker:round:v1`、`matchmaker:history:v1` 與 `scoreboard:matches:v1`
（這三者在回合與歷史上雲之前仍存於本機，屬於本次活動）；SHALL NOT 清除本機的 `matchmaker:roster:v1`——登入時畫面上的名單來自雲端，
本機那份是訪客時期的名單，清掉會讓之後的「匯入本機資料」無資料可匯。呼叫失敗時（`requestJson` 結果為 `failed`、`rejected` 或 `conflict` 皆同；重置不可逆，SHALL NOT 自動重試）名單 MUST 保持不變並回報 `rejected`（顯示「雲端拒絕儲存，請重新整理頁面」）；結果為 `unauthorized` 時改為呼叫 `onUnauthorized`。
`resetLocalMatchProgress()` 的三個 key MUST 取自與 `RESET_KEYS` 相同的來源常數，SHALL NOT 另寫字面值。

實作位於 `nextjs-pickball/lib/matchmaker/storage.ts`、`nextjs-pickball/lib/matchmaker/storage-keys.ts` 與 `nextjs-pickball/components/matchmaker/ResetRosterDialog.tsx`。`resetLocalMatchProgress()` 位於 `nextjs-pickball/lib/matchmaker/storage.ts`；雲端分支位於 `nextjs-pickball/hooks/useRemoteRosterStore.ts`。

#### Scenario: 確認重置後名單清空

- **GIVEN** 名單中已有數位參賽者
- **WHEN** 按下「重置名單」並於確認提示中確認
- **THEN** 名單回到空白狀態，且 `matchmaker:roster:v1` 已從 LocalStorage 移除
- **驗收**：`nextjs-pickball/tests/e2e/specs/player-roster.spec.ts`，test 名稱「確認重置後名單清空且持久化資料被移除」

#### Scenario: 取消重置不動任何資料

- **GIVEN** 名單中已有數位參賽者
- **WHEN** 按下「重置名單」後於確認提示中取消
- **THEN** 名單內容與重置前完全相同
- **驗收**：`nextjs-pickball/tests/e2e/specs/player-roster.spec.ts`，test 名稱「取消重置後名單維持不變」

#### Scenario: 重置只清除列舉範圍內的 key

- **GIVEN** LocalStorage 同時存在 `matchmaker:roster:v1`、`matchmaker:round:v1`、`matchmaker:history:v1`、`scoreboard:matches:v1` 與 `scoreboard:current:v1`
- **WHEN** 呼叫 `resetMatchmakerData()`
- **THEN** 三個 `matchmaker:` key 與 `scoreboard:matches:v1` 皆被移除
- **AND** `scoreboard:current:v1` **不受影響**
- **驗收**：`nextjs-pickball/lib/matchmaker/storage.test.ts`，it 名稱「重置只移除列舉的四個 key，不影響獨立計分板資料」

#### Scenario: resetLocalMatchProgress 只清除本次活動的進度

- **GIVEN** LocalStorage 同時存在 `matchmaker:roster:v1`、`matchmaker:round:v1`、`matchmaker:history:v1`、`scoreboard:matches:v1` 與 `scoreboard:current:v1`
- **WHEN** 呼叫 `resetLocalMatchProgress()`
- **THEN** `matchmaker:round:v1`、`matchmaker:history:v1`、`scoreboard:matches:v1` 被移除；`matchmaker:roster:v1` 與 `scoreboard:current:v1` 不受影響
- **驗收**：`nextjs-pickball/lib/matchmaker/storage.test.ts`，it 名稱「resetLocalMatchProgress 只移除回合、歷史與分槽，保留名單與獨立計分板」

#### Scenario: 登入時重置名單

- **GIVEN** 雲端模式，名單已載入 3 位，`POST /api/matchmaker/reset` 回 204
- **WHEN** 呼叫 `resetRoster()`
- **THEN** 該 POST 被呼叫一次；名單變為空、`syncStatus` 為 `synced`；本機的回合、歷史與分槽 key 被移除，本機 `matchmaker:roster:v1` 保留
- **驗收**：`nextjs-pickball/hooks/useRemoteRosterStore.test.tsx`，it 名稱「resetRoster 成功後清空名單並只清除本機回合、歷史與分槽」

#### Scenario: 登入時重置失敗不動名單

- **GIVEN** 雲端模式，名單已載入 3 位，`POST /api/matchmaker/reset` 回 500
- **WHEN** 呼叫 `resetRoster()`
- **THEN** 名單仍為 3 位、`syncStatus` 為 `rejected`；本機任何 key 皆未被移除
- **驗收**：`nextjs-pickball/hooks/useRemoteRosterStore.test.tsx`，it 名稱「resetRoster 失敗時名單不變並回報 rejected」

#### Scenario: 登入時重置名單清空雲端並保留本機訪客名單

- **GIVEN** 以測試帳號登入，雲端名單有 2 位；瀏覽器的本機 `matchmaker:roster:v1` 有一份訪客名單
- **WHEN** 在參賽者頁按「重置名單」並確認，之後重新整理
- **THEN** 參賽者頁為空白狀態；本機 `matchmaker:roster:v1` 內容與重置前相同
- **驗收**：`nextjs-pickball/tests/e2e/user-data/roster-sync.spec.ts`，test 名稱「登入時重置名單清空雲端名單並保留本機訪客名單」

### Requirement: LocalStorage 持久化與逐筆降級

系統 SHALL 將名單保存於 LocalStorage key `matchmaker:roster:v1`，並在重新整理後還原。

`hasLocalStorage()` 的 SSR／私密模式防護 MUST 比照 `nextjs-pickball/lib/scoreboard/storage.ts` 既有模式；LocalStorage 不可用或寫入超出配額時 SHALL NOT 拋出例外中斷操作。

損壞資料的處理 MUST 採**逐筆降級**，SHALL NOT 比照 scoreboard 整份清除 —— 計分板的資料是一場比賽，清掉重開即可；名單是使用者逐筆手建的數十筆資料，因單筆不合法而清空整團人，損失不成比例（見 design Decision 3）：

- 外層 JSON 解析失敗，或外層容器結構不合法 → 清除 key，回空名單（無筆可救）。
- 外層合法但個別 `player` 驗證失敗 → **保留合法者、丟棄不合法者**，回傳丟棄筆數，並將清理後的名單寫回，使損壞不再累積。

丟棄筆數大於 0 時，UI SHALL 提示使用者有資料損毀被略過，SHALL NOT 靜默處理。

重置後 SHALL NOT 把空名單寫回，否則剛移除的 key 會立即復活。此「跳過寫入」的意圖 MUST 保存在 **reducer state** 中，SHALL NOT 以一次性的 ref 旗標實作 —— React automatic batching 會把同一個 handler 內連續呼叫的 `resetRoster()` 與 `addPlayer()` 合併為單次 render，一次性旗標被重置設下後不會被後續 action 復位，該次寫入因此被整批跳過：記憶體中有新參賽者、LocalStorage 卻是空的，使用者此刻重新整理即**靜默遺失資料**。折進 state 後，批次內的多個 action 會依序 reduce，最後一個 action 的決定自然覆蓋前面的，不需另外處理批次合併。

**儲存模式**：本 Requirement 規範**本機模式**（訪客、auth 停用、session 載入中）的名單持久化。雲端模式下名單改由「登入時名單以雲端為準」Requirement 規範，
使用者在雲端模式下的操作 SHALL NOT 改變 `matchmaker:roster:v1` 的內容（該 key 保留訪客時期的名單）；本機實作在雲端模式下仍會掛載，依既有逐筆降級規則讀取並回寫該 key（不含使用者在雲端模式下的任何變更）。本機實作位於 `useRosterStore.ts` 內的 `useLocalRosterStore`，程式碼與本 change 前的 `useRosterStore` 相同。

實作位於 `nextjs-pickball/lib/matchmaker/storage.ts` 與 `nextjs-pickball/hooks/useRosterStore.ts`。

#### Scenario: 重整後還原名單

- **GIVEN** 已新增數位參賽者
- **WHEN** 重新整理頁面
- **THEN** 名單內容與重整前相同
- **驗收**：`nextjs-pickball/tests/e2e/specs/player-roster.spec.ts`，test 名稱「重整後名單仍在」

#### Scenario: JSON 解析失敗時清除並回空名單

- **GIVEN** `matchmaker:roster:v1` 的內容為 `"{ 不是合法 JSON"`
- **WHEN** 呼叫 `readRoster()`
- **THEN** 回傳空名單，且該 key 已被移除
- **驗收**：`nextjs-pickball/lib/matchmaker/storage.test.ts`，it 名稱「JSON 解析失敗時清除 key 並回空名單」

#### Scenario: 單筆損壞時保留其餘參賽者

- **GIVEN** 持久化資料含 3 筆參賽者，其中 1 筆的 `rating` 為 `99`（超出範圍）
- **WHEN** 呼叫 `readRoster()`
- **THEN** 回傳另外 2 筆合法參賽者，`droppedCount` 為 1，且**不清除**整份資料
- **AND** 回寫後再次讀取時，MUST 同時斷言 `players` 的**筆數與內容**仍為那 2 筆，SHALL NOT 只斷言 `droppedCount` 為 0 —— 「回寫正確」與「回寫時把名單整個寫丟」兩種情況的 `droppedCount` 皆為 0（後者是空陣列沒東西可壞），該訊號無法區分兩者，只驗它會讓「整份名單靜默消失」的 regression 溜過測試
- **驗收**：`nextjs-pickball/lib/matchmaker/storage.test.ts`，it 名稱「單筆不合法時保留其餘 2 筆並回報 droppedCount 為 1」

#### Scenario: 外層結構不合法時整份清除

- **GIVEN** `matchmaker:roster:v1` 的內容為合法 JSON 但非預期結構（如 `[1, 2, 3]`）
- **WHEN** 呼叫 `readRoster()`
- **THEN** 回傳空名單，且該 key 已被移除
- **驗收**：`nextjs-pickball/lib/matchmaker/storage.test.ts`，it 名稱「外層結構不合法時清除 key 並回空名單」

#### Scenario: 版本號不符時整份清除

- **GIVEN** `matchmaker:roster:v1` 的內容為 `{ version: 2, players: [三筆合法參賽者] }`
- **WHEN** 呼叫 `readRoster()`
- **THEN** 回傳空名單、`droppedCount` 為 0，且該 key 已被移除
- **AND** SHALL NOT 走逐筆降級路徑 —— 版本不符屬**結構層級**損壞，即使每一筆 `player` 都合法也不得保留（見 design Decision 9）
- **驗收**：`nextjs-pickball/lib/matchmaker/storage.test.ts`，it 名稱「version 不符時整份清除，不走逐筆降級」

#### Scenario: LocalStorage 不可用時不拋出例外

- **GIVEN** `window.localStorage` 存取會拋出例外
- **WHEN** 呼叫 `readRoster()` 與 `writeRoster()`
- **THEN** 兩者皆不拋出，`readRoster()` 回空名單
- **驗收**：`nextjs-pickball/lib/matchmaker/storage.test.ts`，it 名稱「localStorage 不可用時不拋出例外」

#### Scenario: 名單變更後自動寫回

- **GIVEN** 已初始化的 `useRosterStore`
- **WHEN** 透過 store 新增一位參賽者
- **THEN** `matchmaker:roster:v1` 的內容包含該筆參賽者
- **驗收**：`nextjs-pickball/hooks/useRosterStore.test.tsx`，it 名稱「新增參賽者後自動寫回 localStorage」

#### Scenario: 同批次內重置後緊接新增仍正確持久化

- **GIVEN** 名單中已有參賽者且已寫入 LocalStorage
- **WHEN** 於同一個 handler 內連續呼叫 `resetRoster()` 與 `addPlayer()`（React 會合併為單次 render）
- **THEN** 記憶體中的名單含該新參賽者，**且** `matchmaker:roster:v1` 的內容同樣含該筆
- **AND** SHALL NOT 出現「state 有資料但 LocalStorage 為空」的狀態
- **驗收**：`nextjs-pickball/hooks/useRosterStore.test.tsx`，it 名稱「同一批次內 resetRoster 後緊接 addPlayer 仍正確持久化」

#### Scenario: 雲端模式不寫入本機名單

- **GIVEN** mock `useSession` 為已登入，雲端 GET 回空清單
- **WHEN** 透過 `useRosterStore()` 新增一位參賽者
- **THEN** `localStorage.getItem("matchmaker:roster:v1")` 為 `null`
- **驗收**：`nextjs-pickball/hooks/useRosterStore.test.tsx`，it 名稱「雲端模式下變更名單不寫入 matchmaker:roster:v1」

## ADDED Requirements

### Requirement: 登入時名單以雲端為準

`useRosterStore()` SHALL 為選擇器（`user-data-sync`「前端依 session 選擇儲存模式」）：`resolveStorageMode(useSession())` 為 `"remote"` 時回傳
`hooks/useRemoteRosterStore.ts` 的結果，否則回傳本機實作 `useLocalRosterStore`。回傳物件 MUST 保留既有的 `players`、`droppedCount`、`addPlayer`、`updatePlayer`、
`removePlayer`、`togglePlayerActive`、`resetRoster`（簽章不變），另加 `syncStatus`（本機模式恆為 `"local"`）。呼叫端（含 `useRoundStore` 的 `updatePlayer` port）不需要知道目前模式。

雲端實作 `useRemoteRosterStore({ enabled, onUnauthorized })` MUST 依 `user-data-sync`「多筆使用者資料的逐筆版本化契約」：

1. `enabled` 由 false 變 true 時 `GET /api/matchmaker/players`（`loading`）；成功後以回應取代名單、記下每位參賽者的 `version`（`synced`），SHALL NOT 立即寫回。
   `droppedCount` 在雲端模式恆為 0（後端寫入前已以 `PlayerSchema` 驗證）。
2. `addPlayer` 比照本機實作在呼叫端注入 `crypto.randomUUID()` 與目前時間，以既有純函式 `addPlayer` 產生參賽者後樂觀加入，並以 `version: 0` PUT。
3. `updatePlayer`、`togglePlayerActive` 以既有純函式計算變更後的參賽者並樂觀更新，以該參賽者目前的 `version` PUT；成功後採用回應的 `version`。
4. `removePlayer` 樂觀移除並送出 `DELETE`。
5. 同一參賽者的連續變更只保留最新一份（每位參賽者一個最新優先佇列；刪除也進同一個佇列，後到者勝）。
6. 任一請求回 409 → 停止所有佇列、重新 GET、以雲端名單取代、`conflict`；回 401 → 呼叫 `onUnauthorized` 並停止送出。
7. 載入失敗時為 `load-failed`，此時所有變更操作 MUST 不送出請求、不改變名單。
8. `resetRoster` 見「重置名單與二次確認」的登入分支。

使用 `useRosterStore` 的頁面（`app/matchmaker/page.tsx`、`app/matchmaker/players/page.tsx`、`app/matchmaker/stats/page.tsx`）在 `syncStatus` 為 `loading` 或 `load-failed` 時
MUST 以 `SyncStatusNotice` 取代頁面主要內容（此時沒有可信的名單可供產生對戰或統計），其餘非 `local` 狀態照常顯示並疊加 `SyncStatusNotice`，
頁面主要內容的根元素 MUST 帶 `data-sync-status`；`local` 時 SHALL NOT 渲染任何同步元素或屬性。

名單 API 的請求 MUST 經 `nextjs-pickball/lib/sync/roster-api.ts` 的薄包裝（`fetchRemotePlayers`、`putRemotePlayer`、`deleteRemotePlayer`、`importRemotePlayers`、`resetRemoteMatchmaker`），
包裝只負責方法、路徑、body 與回應 schema，一律經 `requestJson`。

#### Scenario: 名單 API 包裝的請求形狀

- **WHEN** 分別呼叫五個包裝函式
- **THEN** `requestJson` 依序收到 `GET /api/matchmaker/players`、`PUT /api/matchmaker/players/<id>`（body `{ data, version }`）、`DELETE /api/matchmaker/players/<id>`、
  `POST /api/matchmaker/players/import`（body `{ players }`）、`POST /api/matchmaker/reset`，且各自帶對應的回應 schema
- **驗收**：`nextjs-pickball/lib/sync/roster-api.test.ts`，it 名稱「名單 API 包裝以正確的方法、路徑與 body 呼叫 requestJson」

#### Scenario: 選擇器在已登入時改用雲端名單

- **GIVEN** mock `useSession` 為已登入，GET 回兩位參賽者
- **WHEN** `useRosterStore()` mount
- **THEN** `players` 為那兩位、`syncStatus` 為 `synced`
- **驗收**：`nextjs-pickball/hooks/useRosterStore.test.tsx`，it 名稱「已登入時改用雲端名單並回傳 syncStatus」

#### Scenario: 訪客或 session 載入中時走本機

- **GIVEN** mock `useSession` 分別為 `loading` 與 `ready`／`authEnabled: false`
- **WHEN** `useRosterStore()` mount 並新增一位參賽者
- **THEN** `syncStatus` 為 `local`；`matchmaker:roster:v1` 含該參賽者；沒有任何對 `/api/matchmaker/*` 的請求
- **驗收**：`nextjs-pickball/hooks/useRosterStore.test.tsx`，it 名稱「session 載入中或訪客時走本機且 syncStatus 為 local」

#### Scenario: 雲端名單載入後不立即寫回

- **GIVEN** `enabled: true`，GET 回兩位參賽者（version 皆為 3）
- **WHEN** hook mount 並等待載入完成
- **THEN** `players` 為那兩位、狀態依序經過 `loading` 到 `synced`；沒有任何 PUT 或 DELETE
- **驗收**：`nextjs-pickball/hooks/useRemoteRosterStore.test.tsx`，it 名稱「啟用後 GET 成功即載入名單並回報 synced，且不立即寫回」

#### Scenario: 新增參賽者以 version 0 建立

- **WHEN** 呼叫 `addPlayer({ name: "新球員", ... })`
- **THEN** 名單立即多一位；送出 `PUT /api/matchmaker/players/<新 id>`，body 的 `data.id` 等於該 id、`version` 為 0
- **驗收**：`nextjs-pickball/hooks/useRemoteRosterStore.test.tsx`，it 名稱「addPlayer 以注入的 id 送出 version 0 的 PUT」

#### Scenario: 編輯與切換出場以目前版本儲存

- **GIVEN** 參賽者 p1 的 version 為 3
- **WHEN** `updatePlayer("p1", { name: "改名" })`，PUT 回 `version: 4` 後再 `togglePlayerActive("p1")`
- **THEN** 兩次 PUT 的 `version` 依序為 3、4，畫面即時反映變更
- **驗收**：`nextjs-pickball/hooks/useRemoteRosterStore.test.tsx`，it 名稱「updatePlayer 與 togglePlayerActive 以該參賽者目前 version 送出 PUT，成功後沿用回應的 version」

#### Scenario: 刪除參賽者

- **WHEN** `removePlayer("p1")`
- **THEN** p1 立即自名單移除；送出 `DELETE /api/matchmaker/players/p1`
- **驗收**：`nextjs-pickball/hooks/useRemoteRosterStore.test.tsx`，it 名稱「removePlayer 送出 DELETE 並立即自畫面移除」

#### Scenario: 同一參賽者連續變更只送最新

- **GIVEN** p1 的第一次 PUT 尚未完成
- **WHEN** 連續兩次 `updatePlayer("p1", …)`，接著讓第一次 PUT 回 ok
- **THEN** PUT 總共兩次，第二次的 `data` 為最後一次變更後的參賽者
- **驗收**：`nextjs-pickball/hooks/useRemoteRosterStore.test.tsx`，it 名稱「同一參賽者連續變更時只送最新一份」

#### Scenario: 任一筆衝突時整份重新載入

- **GIVEN** 名單有 p1、p2
- **WHEN** p1 的 PUT 回 409，重新 GET 回 p1（雲端版本）與 p3
- **THEN** `players` 為雲端的 p1 與 p3、`syncStatus` 為 `conflict`；p2 的待送變更不再送出
- **驗收**：`nextjs-pickball/hooks/useRemoteRosterStore.test.tsx`，it 名稱「任一 PUT 回 409 時停止所有儲存、重新載入名單並回報 conflict」

#### Scenario: 載入失敗時不送出變更

- **GIVEN** GET 回 500
- **WHEN** 呼叫 `addPlayer`、`updatePlayer`、`removePlayer`
- **THEN** `syncStatus` 為 `load-failed`；名單不變；沒有任何 PUT 或 DELETE
- **驗收**：`nextjs-pickball/hooks/useRemoteRosterStore.test.tsx`，it 名稱「GET 失敗時回報 load-failed 且變更操作不送出請求」

#### Scenario: 401 交回 session 處理

- **WHEN** 分別在 GET 與 PUT 收到 401
- **THEN** `onUnauthorized` 各被呼叫一次，之後不再送出請求
- **驗收**：`nextjs-pickball/hooks/useRemoteRosterStore.test.tsx`，it 名稱「GET 或寫入回 401 時呼叫 onUnauthorized」

#### Scenario: 停用時不發請求

- **WHEN** 以 `enabled: false` mount 並呼叫各操作
- **THEN** fetch 未被呼叫
- **驗收**：`nextjs-pickball/hooks/useRemoteRosterStore.test.tsx`，it 名稱「enabled 為 false 時不發出任何請求」

#### Scenario: 登入後新增的參賽者由雲端還原

- **GIVEN** 以測試帳號的 storage state 開啟 `/matchmaker/players`，雲端資料已清空
- **WHEN** 新增兩位參賽者、等到 `[data-sync-status="synced"]`、重新整理
- **THEN** 兩位仍在；本機 `matchmaker:roster:v1` 不存在
- **驗收**：`nextjs-pickball/tests/e2e/user-data/roster-sync.spec.ts`，test 名稱「登入後新增的參賽者在重新整理後由雲端還原且不寫入本機」

#### Scenario: 另一個裝置看到相同名單

- **GIVEN** context A 已新增兩位參賽者並同步完成
- **WHEN** 以同一 storage state 開 context B 進入參賽者頁
- **THEN** B 看到相同兩位
- **驗收**：`nextjs-pickball/tests/e2e/user-data/roster-sync.spec.ts`，test 名稱「另一個瀏覽器 context 看到相同名單」

#### Scenario: 另一裝置先編輯同一位參賽者

- **GIVEN** A 與 B 都已載入含 p1 的名單
- **WHEN** A 把 p1 改名並同步完成，之後 B 也把 p1 改成另一個名字
- **THEN** B 顯示「資料已在其他裝置更新，已重新載入最新資料」，p1 的名字為 A 改的那個
- **驗收**：`nextjs-pickball/tests/e2e/user-data/roster-sync.spec.ts`，test 名稱「另一裝置先編輯同一位參賽者時顯示衝突提示並載入最新名單」

#### Scenario: 刪除後重新整理不再出現

- **WHEN** 刪除一位參賽者、等到同步完成、重新整理
- **THEN** 該參賽者不在名單中
- **驗收**：`nextjs-pickball/tests/e2e/user-data/roster-sync.spec.ts`，test 名稱「刪除參賽者後重新整理不再出現」

#### Scenario: 送出比分的評分寫回雲端名單

- **GIVEN** 雲端名單有四位參賽者
- **WHEN** 在對戰頁產生對戰、輸入比分並送出，等到同步完成後重新整理參賽者頁
- **THEN** 勝方兩位的強度分數高於送出前、敗方兩位低於送出前（評分經 `updatePlayer` port 寫入雲端）
- **驗收**：`nextjs-pickball/tests/e2e/user-data/roster-sync.spec.ts`，test 名稱「登入時送出比分後評分寫入雲端名單」

#### Scenario: 雲端名單載入失敗

- **GIVEN** 以 `page.route` 讓 `GET /api/matchmaker/players` 回 500
- **WHEN** 開啟 `/matchmaker/players`
- **THEN** 顯示「無法載入雲端資料，請重新整理頁面」，新增參賽者的表單不存在
- **驗收**：`nextjs-pickball/tests/e2e/user-data/roster-sync.spec.ts`，test 名稱「雲端名單載入失敗時參賽者頁顯示錯誤提示」

### Requirement: 參賽者雲端 API

`hono-pickball/src/routes/matchmaker.ts` SHALL 以 `/api/matchmaker` sub-app 提供下列端點（`user-data-sync`「多筆使用者資料的逐筆版本化契約」的第一個實作），
`data` 一律以核心套件的 `PlayerSchema` 驗證：

| 方法與路徑 | 行為 |
|---|---|
| `GET /api/matchmaker/players` | `200 { items }`，依 `sort_order` |
| `PUT /api/matchmaker/players/:id` | 建立（`version: 0`）或依版本更新；path id ≠ `data.id` → 400 |
| `DELETE /api/matchmaker/players/:id` | `204`，冪等 |
| `POST /api/matchmaker/players/import` | `{ players }` 整份附加（D1 `batch()`）；任一 id 已存在 → 409 且不寫入 |
| `POST /api/matchmaker/reset` | `204`，以 `batch()` 刪除本人的對戰分配機資料（本 change：`matchmaker_players`） |

資料存取 SHALL 位於 `hono-pickball/src/matchmaker/players-repository.ts`。所有查詢 MUST 以 `user_id = c.var.user.id` 為條件。

#### Scenario: auth 停用時所有端點回 404

- **GIVEN** env 不含 `ENVIRONMENT` 也不含 `DB`
- **WHEN** 分別呼叫上表五個端點（合法 body）
- **THEN** 皆回 404
- **驗收**：`hono-pickball/test/matchmaker-players.test.ts`，it 名稱「auth 停用且無 DB binding 時所有 /api/matchmaker 端點皆回 404」

#### Scenario: 未登入時所有端點回 401

- **WHEN** 不帶 cookie 分別呼叫上表五個端點
- **THEN** 皆回 401 與 `{ "error": "UNAUTHORIZED" }`
- **驗收**：`hono-pickball/test/matchmaker-players.test.ts`，it 名稱「未登入呼叫所有 /api/matchmaker 端點皆回 401」

#### Scenario: 他人的參賽者不可見也不可改

- **GIVEN** A 有參賽者 p1（version 1）
- **WHEN** B 呼叫 GET、以 `version: 1` PUT p1、DELETE p1
- **THEN** B 的 GET 不含 p1；B 的 PUT 回 409（B 沒有 p1）；B 的 DELETE 回 204；之後 A 的 GET 仍有 p1 且 version 為 1
- **驗收**：`hono-pickball/test/matchmaker-players.test.ts`，it 名稱「B 看不到 A 的參賽者，且以相同 id 的 PUT 與 DELETE 不影響 A」

#### Scenario: 他人的匯入與重置不影響本人

- **GIVEN** A 有兩位參賽者
- **WHEN** B 以與 A 相同的 id 匯入兩位參賽者，再呼叫重置
- **THEN** B 的匯入成功（id 只在使用者內唯一）；B 重置後 A 的 GET 仍為原本兩位
- **驗收**：`hono-pickball/test/matchmaker-players.test.ts`，it 名稱「B 的匯入與重置不影響 A 的名單」

#### Scenario: 尚無參賽者時回空清單

- **WHEN** 已登入、從未寫入時 GET
- **THEN** 200，`{ "items": [] }`
- **驗收**：`hono-pickball/test/matchmaker-players.test.ts`，it 名稱「尚無參賽者時 GET 回空的 items」

#### Scenario: 建立參賽者並依建立順序列出

- **WHEN** 依序以 `version: 0` PUT p2、p1
- **THEN** 兩者皆回 `version: 1`；GET 的順序為 p2、p1
- **驗收**：`hono-pickball/test/matchmaker-players.test.ts`，it 名稱「以 version 0 建立參賽者並依建立順序列出」

#### Scenario: 依版本更新參賽者

- **GIVEN** p1 的 version 為 1
- **WHEN** 以 `version: 1` PUT 改名後的 p1
- **THEN** 回 `version: 2`；GET 取回新名字，且順序不變
- **驗收**：`hono-pickball/test/matchmaker-players.test.ts`，it 名稱「以目前 version 更新參賽者並遞增 version」

#### Scenario: 參賽者版本不符

- **GIVEN** p1 的 version 為 2
- **WHEN** 分別以 `version: 1`、`version: 3` PUT
- **THEN** 皆回 409 `{ "error": "VERSION_CONFLICT" }`；GET 仍為 version 2 的資料
- **驗收**：`hono-pickball/test/matchmaker-players.test.ts`，it 名稱「參賽者 version 不符時回 409 且資料不變」

#### Scenario: 參賽者已存在時以 version 0 寫入

- **GIVEN** p1 已存在
- **WHEN** 以 `version: 0` PUT p1
- **THEN** 回 409；資料不變
- **驗收**：`hono-pickball/test/matchmaker-players.test.ts`，it 名稱「參賽者已存在時以 version 0 寫入回 409」

#### Scenario: 不合法的參賽者寫入

- **WHEN** 以 path `p1`、`data.id` 為 `p2` PUT；以 `rating` 為 99 的資料 PUT；以 `Content-Type: text/plain` PUT
- **THEN** 皆回 400 `{ "error": "INVALID_BODY" }`，且沒有任何資料被建立
- **驗收**：`hono-pickball/test/matchmaker-players.test.ts`，it 名稱「path id 與 data.id 不一致或資料不合 PlayerSchema 時回 400」

#### Scenario: 刪除冪等

- **GIVEN** p1 存在
- **WHEN** 連續兩次 DELETE p1
- **THEN** 兩次皆回 204；GET 不含 p1
- **驗收**：`hono-pickball/test/matchmaker-players.test.ts`，it 名稱「刪除參賽者回 204 且重複刪除仍回 204」

#### Scenario: 匯入附加在既有名單之後

- **GIVEN** 已有 p1
- **WHEN** POST import `[p2, p3]`
- **THEN** 200，回應 `items` 為 p2、p3 且 version 皆為 1；GET 順序為 p1、p2、p3
- **驗收**：`hono-pickball/test/matchmaker-players.test.ts`，it 名稱「匯入的參賽者附加在既有名單之後並各自為 version 1」

#### Scenario: 匯入整份原子性

- **GIVEN** 已有 p1
- **WHEN** POST import `[p4, p1, p5]`
- **THEN** 回 409；GET 只有 p1（p4、p5 皆未寫入）
- **驗收**：`hono-pickball/test/matchmaker-players.test.ts`，it 名稱「匯入時任一 id 已存在則整份不寫入並回 409」

#### Scenario: 不合法的匯入請求

- **WHEN** POST import `{ players: [] }` 與含兩筆相同 id 的清單
- **THEN** 皆回 400 `{ "error": "INVALID_BODY" }`，沒有任何資料被寫入
- **驗收**：`hono-pickball/test/matchmaker-players.test.ts`，it 名稱「匯入清單為空或含重複 id 時回 400」

#### Scenario: 重置刪除本人全部參賽者

- **GIVEN** 本人有三位參賽者
- **WHEN** POST reset
- **THEN** 回 204；GET 為空清單
- **驗收**：`hono-pickball/test/matchmaker-players.test.ts`，it 名稱「重置刪除本人全部參賽者並回 204」
