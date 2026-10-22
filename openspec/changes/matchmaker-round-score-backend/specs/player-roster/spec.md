## MODIFIED Requirements

### Requirement: 重置名單與二次確認

參賽者頁 SHALL 提供「重置名單」操作，按下後 MUST 顯示明確確認提示，載明資料無法復原。

使用者確認後，系統 SHALL 清除本機所有屬於重置範圍的資料並回到空白初始狀態；使用者取消時 SHALL NOT 改變任何資料。

重置範圍 MUST 以**列舉的 key 清單**實作，SHALL NOT 使用 `matchmaker:` 前綴掃描 —— 前綴掃描會誤刪未來加入且不該被重置的使用者偏好，而列舉清單強制在新增資料域時主動決定它是否屬於重置範圍（見 design Decision 6）。前綴掃描在本次變更後另有一個更硬的理由不可用：重置範圍已跨出 `matchmaker:` 前綴（見下）。

目前的清單為四個 key：`matchmaker:roster:v1`（參賽者名單）、`matchmaker:round:v1`（目前回合）、`matchmaker:history:v1`（歷史賽果）與 `scoreboard:matches:v1`（對戰場次的計分板分槽），對應 `prd.md` 4.1.5 與第 10 節要求清除的「全部參賽者、目前回合與歷史賽果」。回合與歷史屬於重置範圍是產品明文決策，SHALL NOT 只清名單而讓上一場活動的回合與賽果殘留 —— 使用者按下重置的語意是「重新開始一場活動」，殘留的回合會在下一次產生對戰時被當成上一輪納入重複比對基準，而那些人可能已經不在名單裡。

`scoreboard:matches:v1` 於本次變更納入清單：該 key 的每個條目都以某個對戰場次的 id 為索引，回合被清掉後那些條目即成孤兒——使用者從舊分頁或書籤回到 `/scoreboard?match=<舊 id>` 會看到一個仍可計分、但分數永遠回填不到任何地方的計分板，且孤兒條目會無界累積在 LocalStorage 中（見 `round-lifecycle` capability 的「重排本輪或重置名單時清除對應計分板進度」Requirement）。

四個 key 的名稱 MUST 取自同一個來源模組，SHALL NOT 在本檔重複寫死字串 —— key 名稱多一處來源就多一處漏改，而漏改的失敗模式是**沉默的**：重置看起來成功了，殘留的資料要到下一輪產生對戰時才顯現。`scoreboard:matches:v1` 的字面值 MUST 取自 `nextjs-pickball/lib/scoreboard/` 的分槽 key 具名匯出（`match-slots.ts` 的 `MATCH_SLOTS_KEY`，見本 change 的 `scoreboard` delta），由 matchmaker 側的 key 清單模組 import 後併入，SHALL NOT 在 matchmaker 側再寫一次字串——同一個 key 出現兩份字面值時，改版（`:v2`）只會改到其中一份。

`scoreboard:current:v1` **不**在重置範圍內：獨立計分板的進度與分配機的活動無關，一併清掉會讓使用者正在進行的個人比賽無故歸零。重置範圍涵蓋分槽 key 而不涵蓋獨立槽，正是「一場一槽」與「全站唯一一場」兩種語意的分界所在。

**登入時（雲端模式，`user-data-sync`「前端依 session 選擇儲存模式」）**：確認後系統 MUST 呼叫 `POST /api/matchmaker/reset`
（後端在單一 batch 內刪除雲端的名單、回合、分槽與歷史，見 `round-lifecycle`「回合與送出比分的雲端 API」），
**成功後**才清空畫面上的名單，並以 `resetLocalMatchProgress()` 只清除本機的 `matchmaker:history:v1`
（B7～B8 之間，登入時的歷史頁與統計頁仍讀本機歷史；不清除會讓重置後的登入畫面仍顯示上一場活動的賽果。B8 把歷史讀取搬上雲後刪除此函式）。
SHALL NOT 清除本機的 `matchmaker:roster:v1`、`matchmaker:round:v1` 與 `scoreboard:matches:v1`——雲端模式不讀寫這三者，它們是訪客時期的資料，
清掉會讓之後的「匯入本機資料」無資料可匯。呼叫失敗時（`requestJson` 結果為 `failed`、`rejected` 或 `conflict` 皆同；重置不可逆，SHALL NOT 自動重試）名單 MUST 保持不變並回報 `rejected`（顯示「雲端拒絕儲存，請重新整理頁面」）；結果為 `unauthorized` 時改為呼叫 `onUnauthorized`。
`resetLocalMatchProgress()` 移除的 key MUST 取自與 `RESET_KEYS` 相同的來源常數，SHALL NOT 另寫字面值。

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
- **THEN** 只有 `matchmaker:history:v1` 被移除；其餘四個 key 不受影響
- **驗收**：`nextjs-pickball/lib/matchmaker/storage.test.ts`，it 名稱「resetLocalMatchProgress 只移除本機歷史，保留名單、回合、分槽與獨立計分板」

#### Scenario: 登入時重置名單

- **GIVEN** 雲端模式，名單已載入 3 位，`POST /api/matchmaker/reset` 回 204
- **WHEN** 呼叫 `resetRoster()`
- **THEN** 該 POST 被呼叫一次；名單變為空、`syncStatus` 為 `synced`；本機只有歷史 key 被移除，本機 `matchmaker:roster:v1`、`matchmaker:round:v1` 與 `scoreboard:matches:v1` 保留
- **驗收**：`nextjs-pickball/hooks/useRemoteRosterStore.test.tsx`，it 名稱「resetRoster 成功後清空名單並只清除本機歷史」

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

#### Scenario: 登入時重置名單後對戰頁沒有回合

- **GIVEN** 以測試帳號登入，已產生一輪並完成一場
- **WHEN** 在參賽者頁確認重置名單後開啟 `/matchmaker`
- **THEN** 對戰頁沒有任何場地卡；`GET /api/matchmaker/round` 回 `{ data: null, version: 0 }`、`GET /api/matchmaker/slots` 回空清單
- **驗收**：`nextjs-pickball/tests/e2e/user-data/round-sync.spec.ts`，test 名稱「登入時重置名單後雲端回合與分槽一併清除」

### Requirement: 登入時名單以雲端為準

`useRosterStore()` SHALL 為選擇器（`user-data-sync`「前端依 session 選擇儲存模式」）：`resolveStorageMode(useSession())` 為 `"remote"` 時回傳
`hooks/useRemoteRosterStore.ts` 的結果，否則回傳本機實作 `useLocalRosterStore`。回傳物件 MUST 保留既有的 `players`、`droppedCount`、`addPlayer`、`updatePlayer`、
`removePlayer`、`togglePlayerActive`、`resetRoster`（簽章不變），另加 `syncStatus`（本機模式恆為 `"local"`）、`applyRemotePlayers` 與 `reloadRemotePlayers`（本機模式皆為不做任何事的函式）。
呼叫端（含 `useRoundStore` 經 `updatePlayer` port 寫入的休息次數）不需要知道目前模式；送出比分的評分在雲端模式改由後端寫入，前端以 `applyRemotePlayers` 接收（見下方第 9 點）。

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
9. `applyRemotePlayers(items)` MUST 以 `items` 中每筆的 `data` 與 `version` 取代名單中同 id 的參賽者，SHALL NOT 送出任何請求（資料已由後端寫入）。
   若其中任一 id 有尚未送出或在途的變更，MUST 視同衝突：停止所有佇列、重新 GET、以雲端名單取代並回報 `conflict`——
   否則待送的 PUT 會帶著舊 version 得到 409，或覆蓋後端剛寫入的評分。
10. `reloadRemotePlayers()` MUST 停止所有佇列、重新 GET 並以雲端名單取代；狀態轉為 `synced`（呼叫端已自行回報衝突），失敗時為 `load-failed`。

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
- **THEN** 勝方兩位的強度分數高於送出前、敗方兩位低於送出前（評分由後端在送出比分的 batch 內寫入，前端不逐人 PUT）
- **驗收**：`nextjs-pickball/tests/e2e/user-data/roster-sync.spec.ts`，test 名稱「登入時送出比分後評分寫入雲端名單」

#### Scenario: applyRemotePlayers 只取代畫面上的參賽者且不送出請求

- **GIVEN** `enabled: true`，名單有 p1（version 2）與 p2，沒有待送變更
- **WHEN** `applyRemotePlayers([{ data: <p1 的 rating 為 4.2>, version: 3 }])`，之後 `updatePlayer("p1", { name: "改名" })`
- **THEN** `applyRemotePlayers` 後沒有任何請求、p1 的 rating 為 4.2；之後的 PUT 帶 `version: 3`
- **驗收**：`nextjs-pickball/hooks/useRemoteRosterStore.test.tsx`，it 名稱「applyRemotePlayers 以回應取代參賽者與 version 且不送出請求」

#### Scenario: applyRemotePlayers 遇到待送變更時整份重新載入

- **GIVEN** p1 的 PUT 在途
- **WHEN** `applyRemotePlayers([{ data: <p1>, version: 3 }])`，重新 GET 回雲端名單
- **THEN** 在途與待送的變更不再送出；`players` 為重新載入的名單、`syncStatus` 為 `conflict`
- **驗收**：`nextjs-pickball/hooks/useRemoteRosterStore.test.tsx`，it 名稱「applyRemotePlayers 遇到該參賽者有待送或在途變更時視同衝突並整份重新載入」

#### Scenario: reloadRemotePlayers 重新載入雲端名單

- **WHEN** 呼叫 `reloadRemotePlayers()`，GET 回另一份名單
- **THEN** `players` 為該名單、`syncStatus` 為 `synced`
- **驗收**：`nextjs-pickball/hooks/useRemoteRosterStore.test.tsx`，it 名稱「reloadRemotePlayers 停止佇列並以雲端名單取代」

#### Scenario: 雲端名單載入失敗

- **GIVEN** 以 `page.route` 讓 `GET /api/matchmaker/players` 回 500
- **WHEN** 開啟 `/matchmaker/players`
- **THEN** 顯示「無法載入雲端資料，請重新整理頁面」，新增參賽者的表單不存在
- **驗收**：`nextjs-pickball/tests/e2e/user-data/roster-sync.spec.ts`，test 名稱「雲端名單載入失敗時參賽者頁顯示錯誤提示」

