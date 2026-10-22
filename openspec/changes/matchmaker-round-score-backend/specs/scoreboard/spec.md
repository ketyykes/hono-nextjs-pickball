## MODIFIED Requirements

### Requirement: localStorage 持久化

系統 SHALL 於每次 state 變更後把計分狀態寫入 localStorage，並 SHALL 於頁面 mount 後還原。寫入的**槽位**由 state 的 `matchId` 決定：

| `matchId` | 槽位 | 用途 |
|---|---|---|
| `null` | `localStorage["scoreboard:current:v1"]`（單一物件） | 獨立使用 `/scoreboard`，行為與本次變更前逐字相同 |
| 非 `null` | `localStorage["scoreboard:matches:v1"]` 內以 `matchId` 為鍵的條目 | 由對戰場次進入的計分板，一場一槽 |

分槽是**必要**而非最佳化：現行單一場次的設計下，主持人開多個場地並依序進入計分板時，後一場的第一球會覆蓋前一場的進度，且既有的「損壞資料 fallback」機制會讓覆蓋**靜默發生**——使用者只看到分數消失，沒有任何錯誤提示（`prd.md` 6.3.1、13.4）。

寫入的槽位 MUST 由 `state.matchId` 推導，SHALL NOT 由呼叫端另外傳入槽位參數——兩個真實來源會讓「寫錯槽」成為可能的失效模式，而該失效同樣是靜默的。

寫入前與讀取後 MUST 經 zod schema 驗證。`scoreboard:current:v1` 驗證失敗 MUST 清除該 key 並以 `createInitialState()` 起手，SHALL NOT 讓損壞資料使頁面崩潰。`scoreboard:matches:v1` MUST **逐筆降級**：整份不是合法 JSON 或不是物件時清除整個 key；能解析為物件時，僅丟棄無法通過 `ScoreboardStateSchema` 的條目並以 `console.warn` 記錄被丟棄的筆數，其餘場地的進度 MUST 保留——一個場地的損壞資料 SHALL NOT 連坐清空其他正在進行中的場地。

**向後相容策略**：往 `ScoreboardStateSchema` 新增欄位時 MUST 以 zod `.default()` 提供預設值，使既有的 v1 資料在缺少該欄位時被補值而非判定為損壞；SHALL NOT 因新增欄位而 bump storage key —— 兩種做法都會讓已在進行中的比賽在使用者重整頁面時分數歸零，而「清除損壞資料」的既有機制會讓這件事**靜默發生**（`safeParse` 失敗 → `removeItem` → 回 null → 以初始 state 起手），使用者只會看到分數消失，沒有任何錯誤提示。本次新增的 `matchId` 欄位 MUST 為 `z.string().nullable().default(null)`，使本次變更前寫入 `scoreboard:current:v1` 的資料被補為 `null`（即獨立計分板）而非判定為損壞。本次變更新增的 `teamPlayers` 欄位比照 `matchId`／`courtNumber` 的既有先例，同為 `.nullable().default(null)`，使本次變更前寫入的資料與獨立計分板皆被補為 `null`（不顯示球員姓名色塊）而非判定為損壞。

**儲存模式**（`user-data-sync`「前端依 session 選擇儲存模式」）：本 Requirement 只規範**本機模式**的行為。
雲端模式（已登入）下，不論 `matchId` 是否為 `null`，計分狀態皆改由「登入時獨立計分板以雲端為準」Requirement 規範，SHALL NOT 讀取或寫入
`localStorage["scoreboard:current:v1"]` 與 `localStorage["scoreboard:matches:v1"]`——兩個 key 保留的是訪客時期的資料（之後由匯入功能處理），雲端模式寫入它們會讓登出後的訪客看到登入時的比賽。
場次分槽的生命週期與對戰回合綁定（建立、自動送出、鎖定目標分數、清除），分槽 MUST 與回合留在同一個儲存位置：本機模式皆在 LocalStorage，雲端模式皆在後端（`round-lifecycle`「回合與送出比分的雲端 API」）。

實作位於 `nextjs-pickball/lib/scoreboard/storage.ts`（依 `matchId` 分派的唯一對外入口）與 `nextjs-pickball/lib/scoreboard/match-slots.ts`（分槽 key 的 schema、逐筆降級與批次清除），驗收錨點為 `nextjs-pickball/lib/scoreboard/storage.test.ts` 與 `nextjs-pickball/lib/scoreboard/match-slots.test.ts`。

#### Scenario: 分數自動保存

- **WHEN** 使用者更新分數（dispatch RALLY_WON / UNDO / RESET）且 `matchId === null`
- **THEN** 當前 state 寫入 `localStorage["scoreboard:current:v1"]`（zod 驗證後序列化），保存內容含分數、發球狀態、history、`mode`、`firstServer`（起手方設定，UNDO replay 必要）、`targetScore`、`matchId` 與 `teamPlayers`
- **驗收**：`nextjs-pickball/lib/scoreboard/storage.test.ts`，it 名稱「write 後 read 可取回相同 state」

#### Scenario: 頁面重整回復

- **WHEN** 使用者重整頁面，localStorage 有合法的 state
- **THEN** 頁面 mount 後 dispatch HYDRATE，恢復分數、發球狀態與目標分數
- **驗收**：`nextjs-pickball/tests/e2e/specs/scoreboard.spec.ts`，test 名稱「localStorage 持久化：reload 後分數保留」

#### Scenario: 舊版資料缺少 targetScore 時補預設值

- **GIVEN** `localStorage["scoreboard:current:v1"]` 存有本次變更前寫入的資料（不含 `targetScore` 欄位）且其餘欄位合法
- **WHEN** 呼叫 `readScoreboard()`
- **THEN** 回傳的 state 之 `targetScore` 為 `11`，該 key SHALL NOT 被清除，比賽的分數與 history 完整保留
- **驗收**：`nextjs-pickball/lib/scoreboard/storage.test.ts`，it 名稱「舊版資料缺 targetScore 時補為 11 且不清除 key」

#### Scenario: 舊版資料缺少 matchId 時補為 null

- **GIVEN** `localStorage["scoreboard:current:v1"]` 存有本次變更前寫入的資料（不含 `matchId` 欄位）且其餘欄位合法
- **WHEN** 呼叫 `readScoreboard()`
- **THEN** 回傳的 state 之 `matchId` 為 `null`（即獨立計分板），該 key SHALL NOT 被清除，比賽的分數與 history 完整保留
- **驗收**：`nextjs-pickball/lib/scoreboard/storage.test.ts`，it 名稱「舊版資料缺 matchId 時補為 null 且不清除 key」

#### Scenario: 舊版資料缺少 teamPlayers 時補為 null

- **GIVEN** `localStorage["scoreboard:matches:v1"]` 內某條目為本次變更前寫入的資料（不含 `teamPlayers` 欄位）且其餘欄位合法
- **WHEN** 呼叫讀取全部槽位的函式
- **THEN** 該條目的 `teamPlayers` 為 `null`（維持我方／對方純文字呈現），不因缺少此欄位被判為損壞而丟棄
- **驗收**：`nextjs-pickball/lib/scoreboard/match-slots.test.ts`，it 名稱「舊版資料缺 teamPlayers 時補為 null 且不清除該筆」

#### Scenario: 損壞資料 fallback

- **WHEN** `scoreboard:current:v1` 的資料無法通過 zod schema 驗證
- **THEN** 清除 key，以 `createInitialState()` 起手，console.warn 記錄錯誤
- **驗收**：`nextjs-pickball/lib/scoreboard/storage.test.ts`，it 名稱「資料為非 JSON 時 read 回 null 並清 key，且 warn」與「資料 schema 不合法時 read 回 null 並清 key，且 warn」

#### Scenario: 多場地各自存槽互不覆蓋

- **GIVEN** 兩個 `matchId`（`m1`、`m2`）各自有進行中的計分狀態
- **WHEN** 對 `m2` 寫入新的 state
- **THEN** `scoreboard:matches:v1` 內 `m1` 的條目分數、history 與 `targetScore` 完全不變，`scoreboard:current:v1` 亦不被寫入
- **驗收**：`nextjs-pickball/lib/scoreboard/match-slots.test.ts`，it 名稱「寫入某場次的槽不影響其他場次與獨立槽」

#### Scenario: 分槽逐筆降級

- **GIVEN** `scoreboard:matches:v1` 為合法 JSON 物件，其中 `m1` 的條目缺少必要欄位、`m2` 的條目合法
- **WHEN** 呼叫讀取全部槽位的函式
- **THEN** 回傳只含 `m2` 的條目、`droppedCount` 為 1，並 console.warn 記錄；`m2` 的進度 SHALL NOT 被清除
- **驗收**：`nextjs-pickball/lib/scoreboard/match-slots.test.ts`，it 名稱「單筆損壞只丟該筆並回報 droppedCount，其餘場次保留」

#### Scenario: 整份分槽資料非 JSON 時清除整個 key

- **GIVEN** `scoreboard:matches:v1` 的內容不是合法 JSON（或解析後不是物件）
- **WHEN** 呼叫讀取全部槽位的函式
- **THEN** 移除該 key、回傳空的槽位集合並 console.warn；`scoreboard:current:v1` SHALL NOT 被連帶清除
- **驗收**：`nextjs-pickball/lib/scoreboard/match-slots.test.ts`，it 名稱「整份非 JSON 時清除分槽 key 且不動獨立槽」

#### Scenario: 批次清除指定場次的槽

- **GIVEN** `scoreboard:matches:v1` 內有 `m1`、`m2`、`m3` 三個條目
- **WHEN** 以 `["m1", "m3"]` 呼叫批次清除
- **THEN** 只剩 `m2` 的條目；清除不存在的 `matchId` SHALL NOT 拋錯
- **驗收**：`nextjs-pickball/lib/scoreboard/match-slots.test.ts`，it 名稱「批次清除只移除指定場次且忽略不存在的 id」

#### Scenario: 登入且未綁定場次時不寫入本機獨立槽

- **GIVEN** session 為已登入（mock `useSession`），且雲端 GET 回 `{ data: null, version: 0 }`
- **WHEN** `useScoreboardStore(null)` dispatch `RALLY_WON`
- **THEN** `localStorage["scoreboard:current:v1"]` 不存在（未被寫入）
- **驗收**：`nextjs-pickball/hooks/useScoreboardStore.test.tsx`，it 名稱「雲端模式下 dispatch 不寫入 scoreboard:current:v1」

#### Scenario: 登入且帶 matchId 時不寫入本機分槽

- **GIVEN** session 為已登入（mock `useSession`），`GET /api/matchmaker/slots/m1` 回 `m1` 的分槽（version 1）
- **WHEN** `useScoreboardStore("m1")` mount 並 dispatch `RALLY_WON`
- **THEN** `localStorage["scoreboard:matches:v1"]` 不存在（未被寫入）；送出 `PUT /api/matchmaker/slots/m1`
- **驗收**：`nextjs-pickball/hooks/useScoreboardStore.test.tsx`，it 名稱「已登入且帶 matchId 時改用雲端分槽且不寫入 scoreboard:matches:v1」

### Requirement: 登入時獨立計分板以雲端為準

`useScoreboardStore(matchId)` SHALL 為選擇器：`resolveStorageMode(useSession())` 為 `"remote"` 時，`matchId === null` 回傳
`hooks/useRemoteScoreboardStore.ts` 的狀態、`matchId` 非 `null` 回傳 `hooks/useRemoteMatchSlotStore.ts` 的狀態；本機模式回傳本機實作（`hooks/useScoreboardStore.ts` 內的 `useLocalScoreboardStore`，程式碼與 B5 前的
`useScoreboardStore` 相同）。回傳值 MUST 為 `[state, dispatch, bindingStatus, syncStatus]`：前三個元素語意不變，`syncStatus` 在本機模式恆為 `"local"`。

雲端實作 `useRemoteScoreboardStore({ enabled, onUnauthorized })` MUST：

1. `enabled` 由 false 變 true 時 `GET /api/scoreboard/current`（`syncStatus` 為 `loading`）；成功且 `data` 非 `null` 時 dispatch `HYDRATE`，
   `data` 為 `null` 時維持 `createInitialState()`；記下 `version`，狀態轉為 `synced`。載入成功後 SHALL NOT 立即把狀態寫回雲端。
2. 載入失敗（`failed`／`rejected`）時狀態為 `load-failed`，SHALL NOT 送出任何 PUT——在不知道雲端版本的情況下寫入只會得到 409 或覆蓋未知資料。
3. 使用者動作（dispatch）造成的狀態變更，經「最新優先的雲端儲存」以 `{ data: state, version }` PUT；成功後以回應的 `version` 更新記錄。
4. PUT 回 409 時依 `user-data-sync`「同步狀態與提示」處理衝突：重新 GET、以雲端狀態取代（`HYDRATE`；雲端 `data` 為 `null` 時回到初始狀態）、狀態為 `conflict`。
5. GET 或 PUT 回 401 時呼叫 `onUnauthorized` 並停止送出。
6. `enabled` 為 false 時不發出任何請求。

雲端分槽實作 `useRemoteMatchSlotStore({ enabled, matchId, onUnauthorized })` MUST 比照上列 1～6，差異如下：

- 讀取為 `GET /api/matchmaker/slots/:matchId`；`data` 為 `null` 時 `bindingStatus` 為 `missing`（場次已失效、已完成或已被重排），非 `null` 時 dispatch `HYDRATE` 並為 `bound`；
  載入完成前 `bindingStatus` 為 `pending`。`missing` 時 SHALL NOT 送出任何 PUT（與本機分槽「不為失效場次建立條目」一致）。
- 寫入為 `PUT /api/matchmaker/slots/:matchId`，body `{ data: state, version }`。
- 409 時重新 GET：回 `null`（該場已被送出比分或重排）時 `bindingStatus` 轉為 `missing`，畫面顯示既有的失效說明；非 `null` 時以雲端狀態取代並回報 `conflict`。
- 分槽的**建立**不由本 hook 負責：由 `CourtCard` 在導向前完成（`round-lifecycle`「登入時回合與場次分槽以雲端為準」）。

後端 `PUT /api/scoreboard/current` 只存獨立計分板：`data.matchId` 非 `null` 時 MUST 回 `400 { "error": "INVALID_BODY" }`（場次分槽走 `/api/matchmaker/slots/*`，見 `round-lifecycle`「回合與送出比分的雲端 API」）。

`components/scoreboard/Scoreboard.tsx` 在 `syncStatus` 為 `loading` 或 `load-failed` 時 MUST 以 `SyncStatusNotice` 取代計分畫面（此時沒有可信的比分可顯示）；
其餘非 `local` 狀態照常顯示計分畫面，並在畫面上方疊加 `SyncStatusNotice`。非 `local` 時計分板根元素 MUST 帶 `data-sync-status={syncStatus}`（E2E 等待依據），
`local` 時 SHALL NOT 帶此屬性。

#### Scenario: 後端拒絕寫入綁定場次的狀態

- **GIVEN** 已登入
- **WHEN** 以 `{ data: <matchId 為 "m1" 的合法 ScoreboardState>, version: 0 }` 呼叫 `PUT /api/scoreboard/current`
- **THEN** 回 400 與 `{ "error": "INVALID_BODY" }`，之後 GET 仍為 `{ data: null, version: 0 }`
- **驗收**：`hono-pickball/test/scoreboard-current.test.ts`，it 名稱「data.matchId 非 null 時回 400 INVALID_BODY」

#### Scenario: 選擇器在已登入且未綁定場次時改用雲端

- **GIVEN** mock `useSession` 為已登入，fetch 的 GET 回 `{ data: <比分 4:2 的狀態>, version: 3 }`
- **WHEN** `useScoreboardStore(null)` mount
- **THEN** 最終 `state.scores` 為 `{ us: 4, them: 2 }`、`syncStatus` 為 `synced`
- **驗收**：`nextjs-pickball/hooks/useScoreboardStore.test.tsx`，it 名稱「已登入且未帶 matchId 時改用雲端並回傳 syncStatus」

#### Scenario: 訪客或 session 載入中時走本機

- **GIVEN** mock `useSession` 分別為 `loading` 與 `ready`／`authEnabled: false`
- **WHEN** `useScoreboardStore(null)` mount 並 dispatch `RALLY_WON`
- **THEN** `syncStatus` 為 `local`；分數寫入 `localStorage["scoreboard:current:v1"]`；沒有任何對 `/api/scoreboard/*` 的請求
- **驗收**：`nextjs-pickball/hooks/useScoreboardStore.test.tsx`，it 名稱「session 載入中或訪客時走本機且 syncStatus 為 local」

#### Scenario: 雲端載入成功即還原且不立即寫回

- **GIVEN** `enabled: true`，GET 回 `{ data: <比分 7:5 的狀態>, version: 2 }`
- **WHEN** hook mount 並等待載入完成
- **THEN** `state.scores` 為 `{ us: 7, them: 5 }`、`syncStatus` 依序經過 `loading` 到 `synced`；沒有任何 PUT
- **驗收**：`nextjs-pickball/hooks/useRemoteScoreboardStore.test.tsx`，it 名稱「啟用後 GET 成功即 HYDRATE 並回報 synced，且不立即寫回」

#### Scenario: 雲端尚無資料時以初始狀態起手

- **GIVEN** GET 回 `{ data: null, version: 0 }`
- **WHEN** hook mount，之後 dispatch `RALLY_WON`
- **THEN** 載入後 state 等於 `createInitialState()`；dispatch 後送出的 PUT body 之 `version` 為 0
- **驗收**：`nextjs-pickball/hooks/useRemoteScoreboardStore.test.tsx`，it 名稱「雲端無資料時維持初始狀態，第一次儲存帶 version 0」

#### Scenario: 計分後以目前版本儲存

- **GIVEN** 已載入 `version: 2`
- **WHEN** dispatch `RALLY_WON`，PUT 回 `{ data, version: 3 }`，再 dispatch 一次
- **THEN** 第一次 PUT 的 `version` 為 2、第二次為 3；`syncStatus` 最後為 `synced`
- **驗收**：`nextjs-pickball/hooks/useRemoteScoreboardStore.test.tsx`，it 名稱「dispatch 後以目前 version PUT 新狀態，成功後沿用回應的 version」

#### Scenario: 版本衝突時重新載入雲端狀態

- **GIVEN** 已載入 `version: 2`
- **WHEN** dispatch 後 PUT 回 409，接著的 GET 回 `{ data: <比分 9:9 的狀態>, version: 5 }`
- **THEN** `state.scores` 為 `{ us: 9, them: 9 }`、`syncStatus` 為 `conflict`；下一次 dispatch 的 PUT 帶 `version: 5`
- **驗收**：`nextjs-pickball/hooks/useRemoteScoreboardStore.test.tsx`，it 名稱「PUT 回 409 時重新 GET 並以雲端狀態取代，狀態為 conflict」

#### Scenario: 載入失敗時不寫入

- **GIVEN** GET 回 500
- **WHEN** hook mount 後 dispatch `RALLY_WON`
- **THEN** `syncStatus` 為 `load-failed`，沒有任何 PUT
- **驗收**：`nextjs-pickball/hooks/useRemoteScoreboardStore.test.tsx`，it 名稱「GET 失敗時狀態為 load-failed 且不送出任何 PUT」

#### Scenario: 401 時交回 session 處理

- **WHEN** 分別在 GET 與 PUT 收到 401
- **THEN** `onUnauthorized` 各被呼叫一次，之後不再送出請求
- **驗收**：`nextjs-pickball/hooks/useRemoteScoreboardStore.test.tsx`，it 名稱「GET 或 PUT 回 401 時呼叫 onUnauthorized 且不再送出」

#### Scenario: 停用時不發請求

- **WHEN** 以 `enabled: false` mount 並 dispatch
- **THEN** fetch 未被呼叫
- **驗收**：`nextjs-pickball/hooks/useRemoteScoreboardStore.test.tsx`，it 名稱「enabled 為 false 時不發出任何請求」

#### Scenario: 登入後計分可在重新整理後還原

- **GIVEN** 以測試帳號的 storage state 開啟 `/scoreboard`，雲端資料已清空
- **WHEN** 得分三次、等到 `[data-sync-status="synced"]`，重新整理頁面
- **THEN** 比分仍為 3:0；`localStorage["scoreboard:current:v1"]` 不存在
- **驗收**：`nextjs-pickball/tests/e2e/user-data/scoreboard-sync.spec.ts`，test 名稱「登入後計分在重新整理後由雲端還原且不寫入本機」

#### Scenario: 另一個裝置看到同一場比賽

- **GIVEN** context A 已得分兩次並同步完成
- **WHEN** 以同一 storage state 開新的 context B 開啟 `/scoreboard`
- **THEN** B 顯示比分 2:0
- **驗收**：`nextjs-pickball/tests/e2e/user-data/scoreboard-sync.spec.ts`，test 名稱「另一個瀏覽器 context 載入同一份雲端比分」

#### Scenario: 另一裝置先寫入時顯示衝突並載入最新比分

- **GIVEN** context A 與 B 都已載入同一版本
- **WHEN** A 得分一次並同步完成，之後 B 得分一次
- **THEN** B 顯示「資料已在其他裝置更新，已重新載入最新資料」，B 的比分等於 A 的比分
- **驗收**：`nextjs-pickball/tests/e2e/user-data/scoreboard-sync.spec.ts`，test 名稱「另一裝置先寫入時顯示衝突提示並載入最新比分」

#### Scenario: 儲存失敗時提示並自動重試

- **GIVEN** 以 `page.route` 讓第一次 `PUT /api/scoreboard/current` 回 503
- **WHEN** 得分一次
- **THEN** 顯示「尚未儲存到雲端，將自動重試」；解除攔截後提示消失、`data-sync-status` 回到 `synced`，重新整理後比分保留
- **驗收**：`nextjs-pickball/tests/e2e/user-data/scoreboard-sync.spec.ts`，test 名稱「儲存失敗時顯示重試提示並於恢復後自動送出」

#### Scenario: 雲端載入失敗時不顯示計分畫面

- **GIVEN** 以 `page.route` 讓 `GET /api/scoreboard/current` 回 500
- **WHEN** 開啟 `/scoreboard`
- **THEN** 顯示「無法載入雲端資料，請重新整理頁面」，計分按鈕不存在
- **驗收**：`nextjs-pickball/tests/e2e/user-data/scoreboard-sync.spec.ts`，test 名稱「雲端載入失敗時顯示錯誤提示且不顯示計分畫面」

#### Scenario: 雲端分槽載入後為 bound 且以目前版本儲存

- **GIVEN** `enabled: true`，`GET /api/matchmaker/slots/m1` 回 `{ data: <m1 比分 2:1 的狀態>, version: 4 }`
- **WHEN** hook mount 並 dispatch `RALLY_WON`
- **THEN** `bindingStatus` 依序為 `pending`、`bound`；PUT `/api/matchmaker/slots/m1` 的 `version` 為 4；載入後沒有立即寫回
- **驗收**：`nextjs-pickball/hooks/useRemoteMatchSlotStore.test.tsx`，it 名稱「雲端分槽載入後為 bound 並以目前 version 儲存」

#### Scenario: 雲端分槽不存在時為 missing 且不寫入

- **GIVEN** GET 回 `{ data: null, version: 0 }`
- **WHEN** hook mount 並 dispatch `RALLY_WON`
- **THEN** `bindingStatus` 為 `missing`；沒有任何 PUT
- **驗收**：`nextjs-pickball/hooks/useRemoteMatchSlotStore.test.tsx`，it 名稱「雲端分槽不存在時 bindingStatus 為 missing 且不送出 PUT」

#### Scenario: 雲端分槽衝突後已被送出時轉為 missing

- **GIVEN** 已載入 `m1`（version 4）
- **WHEN** PUT 回 409，重新 GET 回 `{ data: null, version: 0 }`
- **THEN** `bindingStatus` 為 `missing`；之後的 dispatch 不送出 PUT
- **AND** 若重新 GET 回非 null 的狀態，則以其取代並回報 `conflict`
- **驗收**：`nextjs-pickball/hooks/useRemoteMatchSlotStore.test.tsx`，it 名稱「分槽 PUT 衝突後依重新載入結果轉為 missing 或 conflict」

#### Scenario: 雲端分槽的 401 與停用

- **WHEN** GET 回 401；另一次以 `enabled: false` mount 並 dispatch
- **THEN** 前者呼叫 `onUnauthorized` 一次；後者 fetch 未被呼叫
- **驗收**：`nextjs-pickball/hooks/useRemoteMatchSlotStore.test.tsx`，it 名稱「分槽 GET 回 401 時呼叫 onUnauthorized，enabled 為 false 時不發請求」

#### Scenario: 登入時場次計分板的進度由雲端還原

- **GIVEN** 以測試帳號登入，已產生一輪
- **WHEN** 從場地 1 的場地卡進入計分板、得分兩次並等到同步完成、重新整理
- **THEN** 比分仍為 2:0；本機 `scoreboard:matches:v1` 不存在
- **驗收**：`nextjs-pickball/tests/e2e/user-data/round-sync.spec.ts`，test 名稱「登入時場次計分板的進度在重新整理後由雲端還原且不寫入本機」
