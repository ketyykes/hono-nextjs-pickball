# Specification: round-lifecycle

## MODIFIED Requirements

### Requirement: 登入時回合與場次分槽以雲端為準

`useRoundStore(options)` SHALL 為選擇器：`resolveStorageMode(useSession())` 為 `"remote"` 時回傳 `hooks/useRemoteRoundStore.ts` 的結果，為 `"local"` 時回傳本機實作
`useLocalRoundStore`（同檔，函式本體與本 change 前的 `useRoundStore` 相同），為 `"pending"` 時回傳等待中結果（`round` 為 `null`、`history` 為空陣列、`syncStatus` 為 `"pending"`、`remoteMatchSlots` 為 `null`、操作皆回傳 `ok: false`，見 `user-data-sync`「資料來源確定前的等待中畫面」）。回傳物件 MUST 保留既有的 `round`、`history`、`droppedCount` 與七個操作（簽章不變），另加：

- `syncStatus: DataStatus`（本機模式在本機回合讀入前為 `"pending"`、讀入後恆為 `"local"`）。
- `remoteMatchSlots: Record<string, ScoreboardState> | null`：雲端模式為雲端目前回合的分槽；本機模式恆為 `null`（呼叫端沿用既有的 `readMatchSlots()`）。

`UseRoundStoreOptions` 加入 `applyRemotePlayers: (items: { data: Player; version: number }[]) => void` 與 `reloadRemotePlayers: () => void`（皆由 `useRosterStore` 提供，見 `player-roster`）。

雲端實作 `useRemoteRoundStore({ enabled, players, updatePlayer, applyRemotePlayers, reloadRemotePlayers, onUnauthorized })` MUST：

1. `enabled` 由 false 變 true 時同時 `GET /api/matchmaker/round` 與 `GET /api/matchmaker/slots`（`loading`）；兩者皆成功後以回應取代狀態（`synced`），SHALL NOT 立即寫回。任一失敗為 `load-failed`，之後所有操作 MUST 不送出請求、不改變狀態。
2. `history` 恆為空陣列、`droppedCount` 恆為 0（歷史的讀取上雲屬 B8）。
3. 回合變更操作（`generateRound`、`resetIncompleteMatches`、`setTargetScore`、`setTimerDuration`、`startTimer`、`swapMatchPlayer`）MUST 以既有純函式在目前顯示的回合上計算並**同步**回傳結果；
   成功時樂觀更新畫面，並把「對回合套用此操作」的**命令**排入命令佇列（`lib/sync/round-command-queue.ts`），SHALL NOT 直接排入計算好的回合資料。
4. 命令佇列 MUST 單一在途、先進先出；送出時以**最新已確認的雲端回合**重新套用命令（連續的回合變更命令合併為一次 `PUT /api/matchmaker/round`，帶已確認的 version）——
   因此送出比分回應中的回合不會被其後排隊的回合 PUT 以舊資料覆蓋。重新套用失敗（例：換人對象已不在休息名單）的命令 MUST 被丟棄。
   `generateRound` 的休息次數結算（`restSettlements`）MUST 在該次回合 PUT 成功後才經 `updatePlayer` 套用；回合 PUT 衝突時丟棄。
5. `submitScore(matchId, rawScoreA, rawScoreB)` MUST 先以核心 `submitScore` 在目前顯示的回合與名單上預先驗證並同步回傳結果；失敗時不排入佇列。
   成功時排入**不合併**的送出命令（同一 `matchId` 已在佇列中時不重複排入），樂觀顯示該場完成；送出時以 `POST /api/matchmaker/round/matches/:matchId/score` 帶已確認的回合 version。
   回應成功後 MUST 以回應的回合取代已確認回合、從 `remoteMatchSlots` 移除該場，並以 `applyRemotePlayers(response.players)` 寫入名單——SHALL NOT 經 `updatePlayer` 逐人 PUT 評分。
6. 任一命令收到 409 → 清空佇列、重新載入回合與分槽、`conflict`，並 MUST 呼叫 `reloadRemotePlayers()`（另一裝置送出比分時評分也已改變）；401 → `onUnauthorized` 並停止；
   `failed` 依 `createLatestWinsSaver` 相同的退避表重試（`retrying`）；`rejected` 停止並回報 `rejected`。
7. 回合 PUT 成功後 MUST 從 `remoteMatchSlots` 移除不屬於新回合的場次（與伺服器 batch 的清理一致）。

對戰頁（`app/matchmaker/page.tsx`）在雲端模式 MUST 以 `remoteMatchSlots` 作為自動回填與目標分數鎖定（`isTargetScoreLocked`）的分槽來源；
自動回填 MUST 呼叫 `submitScore`（同一入口），SHALL NOT 呼叫 `clearMatchSlots`——伺服器已在送出比分的 batch 內刪除該分槽（滿足「計分板結果的自動回填共用送出 pipeline」的「回填成功後清除分槽」）。
`isContentBlocked(syncStatus)`（`pending`、`loading`／`load-failed`）時以 `SyncStatusNotice` 取代主要內容，其餘非 `local` 狀態疊加提示；`local` 時不渲染任何同步元素（與 B6 相同）。

`CourtCard` 在雲端模式導向 `/scoreboard?match=<id>` 前 MUST 先以 `PUT /api/matchmaker/slots/:matchId`（version 0，種子資料沿用 `buildMatchSlotSeed`）建立分槽並等待結果：
成功或 409（分槽已存在）即導向；其他結果 MUST 顯示繁體中文錯誤且不導向。本機模式沿用既有 `ensureMatchSlot`。

回合、分槽與送出比分的請求 MUST 經 `nextjs-pickball/lib/sync/round-api.ts` 的薄包裝（一律經 `requestJson`）。

#### Scenario: 回合 API 包裝的請求形狀

- **WHEN** 分別呼叫回合、分槽與送出比分的包裝函式
- **THEN** `requestJson` 依序收到正確的方法、路徑（`/api/matchmaker/round`、`/api/matchmaker/slots`、`/api/matchmaker/slots/<id>`、`/api/matchmaker/round/matches/<id>/score`）、body 與回應 schema
- **驗收**：`nextjs-pickball/lib/sync/round-api.test.ts`，it 名稱「回合 API 包裝以正確的方法、路徑與 body 呼叫 requestJson」

#### Scenario: 命令佇列單一在途並合併連續的回合變更

- **GIVEN** 一個 PUT 在途
- **WHEN** 依序排入回合變更 A、B 與送出比分 S，之後在途的 PUT 成功
- **THEN** 下一個請求為一次 PUT，其資料為「已確認回合依序套用 A、B」的結果；之後才送出 S
- **驗收**：`nextjs-pickball/lib/sync/round-command-queue.test.ts`，it 名稱「單一在途且連續的回合變更合併為一次 PUT，送出比分不合併」

#### Scenario: 命令以最新已確認回合重新套用

- **GIVEN** 佇列為 [送出比分 S（`m1`）, 回合變更 T（改計時長度）]
- **WHEN** S 成功，回應的回合中 `m1` 為 `completed`
- **THEN** T 的 PUT 資料以該回應回合為基礎（`m1` 仍為 `completed`），version 為回應的 version
- **驗收**：`nextjs-pickball/lib/sync/round-command-queue.test.ts`，it 名稱「排隊中的回合變更以最新已確認回合重新套用，不覆蓋送出比分的結果」

#### Scenario: 命令佇列的失敗分類

- **WHEN** 分別讓請求回 `conflict`、`unauthorized`、`rejected`、`failed`
- **THEN** 前三者清空佇列並各自回報；`failed` 依退避表重試同一請求
- **驗收**：`nextjs-pickball/lib/sync/round-command-queue.test.ts`，it 名稱「衝突、未授權與拒絕時清空佇列，網路失敗時依退避表重試」

#### Scenario: 已登入時改用雲端回合

- **GIVEN** mock `useSession` 為已登入，GET 回合回 version 2 的回合、GET 分槽回一筆
- **WHEN** `useRoundStore()` mount
- **THEN** `round` 為雲端回合、`remoteMatchSlots` 含該分槽、`syncStatus` 為 `synced`、`history` 為空陣列
- **驗收**：`nextjs-pickball/hooks/useRoundStore.test.tsx`，it 名稱「已登入時改用雲端回合並回傳 syncStatus 與雲端分槽」

#### Scenario: 訪客或 session 載入中時走本機回合

- **GIVEN** mock `useSession` 為 `loading` 或訪客
- **WHEN** `useRoundStore()` mount 並產生一輪
- **THEN** `syncStatus` 為 `local`、`remoteMatchSlots` 為 `null`；`matchmaker:round:v1` 有資料；沒有任何 `/api/matchmaker/*` 請求
- **驗收**：`nextjs-pickball/hooks/useRoundStore.test.tsx`，it 名稱「session 載入中或訪客時走本機回合且 syncStatus 為 local」

#### Scenario: 雲端產生對戰後休息次數在回合儲存成功後才結算

- **GIVEN** `enabled: true`，雲端無回合
- **WHEN** `generateRound(...)`，回合 PUT 回 ok
- **THEN** `generateRound` 同步回傳成功並立即顯示新回合；`updatePlayer` 只在 PUT 成功後才以休息次數被呼叫
- **AND** 若 PUT 回 409，`updatePlayer` 不被呼叫
- **驗收**：`nextjs-pickball/hooks/useRemoteRoundStore.test.tsx`，it 名稱「generateRound 樂觀顯示並在回合 PUT 成功後才結算休息次數」

#### Scenario: 雲端送出比分以回應更新回合與名單且不逐人 PUT

- **GIVEN** `enabled: true`，回合 version 3 有 `pending` 的 `m1`
- **WHEN** `submitScore("m1", "11", "7")`，POST 回 200（version 4、四位球員）
- **THEN** 同步回傳 `ok: true`；POST body 為 `{ scoreA: "11", scoreB: "7", roundVersion: 3 }`；`applyRemotePlayers` 以回應的四位被呼叫一次；`updatePlayer` 未被呼叫；沒有任何對 `/api/matchmaker/players` 的 PUT
- **驗收**：`nextjs-pickball/hooks/useRemoteRoundStore.test.tsx`，it 名稱「submitScore 以 POST 送出並以回應更新回合與名單，不逐人 PUT 評分」

#### Scenario: 雲端送出比分的預先驗證失敗時不送出

- **WHEN** `submitScore("m1", "", "7")`
- **THEN** 同步回傳 `ok: false`、`code` 為 `empty-field`；沒有任何 POST
- **驗收**：`nextjs-pickball/hooks/useRemoteRoundStore.test.tsx`，it 名稱「submitScore 預先驗證失敗時同步回傳錯誤且不送出請求」

#### Scenario: 同一場次重複送出只排入一次

- **WHEN** POST 尚在途時再次 `submitScore("m1", "11", "7")`
- **THEN** POST 只被呼叫一次
- **驗收**：`nextjs-pickball/hooks/useRemoteRoundStore.test.tsx`，it 名稱「同一場次的送出在佇列中時不重複排入」

#### Scenario: 雲端回合衝突時整份重新載入

- **WHEN** 回合 PUT 回 409，重新 GET 回另一份回合與分槽
- **THEN** `round` 與 `remoteMatchSlots` 為重新載入的值、`syncStatus` 為 `conflict`、`reloadRemotePlayers` 被呼叫一次；佇列中其餘命令不再送出
- **驗收**：`nextjs-pickball/hooks/useRemoteRoundStore.test.tsx`，it 名稱「回合 PUT 或送出比分回 409 時清空佇列、重新載入並回報 conflict」

#### Scenario: 雲端回合載入失敗與 401

- **WHEN** GET 回 500；另一次 mount 時 GET 回 401
- **THEN** 前者 `load-failed` 且之後的操作不送出請求；後者 `onUnauthorized` 被呼叫一次
- **驗收**：`nextjs-pickball/hooks/useRemoteRoundStore.test.tsx`，it 名稱「載入失敗時回報 load-failed 且不送出，401 時呼叫 onUnauthorized」

#### Scenario: 停用時不發回合請求

- **WHEN** 以 `enabled: false` mount 並呼叫各操作
- **THEN** fetch 未被呼叫
- **驗收**：`nextjs-pickball/hooks/useRemoteRoundStore.test.tsx`，it 名稱「enabled 為 false 時不發出任何回合請求」

#### Scenario: 登入後產生的回合由雲端還原且另一裝置看到相同回合

- **GIVEN** 以測試帳號登入、雲端資料已清空，名單有四位
- **WHEN** 在對戰頁產生一輪、等到 `[data-sync-status="synced"]`、重新整理；再以同一 storage state 開另一個 context
- **THEN** 兩者都看到相同的場次組合；本機 `matchmaker:round:v1` 不存在
- **驗收**：`nextjs-pickball/tests/e2e/user-data/round-sync.spec.ts`，test 名稱「登入後產生的回合在重新整理與另一個 context 中由雲端還原」

#### Scenario: 登入時經計分板完成的場次寫入雲端並清除分槽

- **GIVEN** 以測試帳號登入，已產生一輪
- **WHEN** 從場地卡進入計分板、打到一方獲勝、回到對戰頁並等到同步完成
- **THEN** 該場顯示為已完成；參賽者頁中勝方的強度高於送出前；`GET /api/matchmaker/slots` 不含該場
- **驗收**：`nextjs-pickball/tests/e2e/user-data/round-sync.spec.ts`，test 名稱「登入時經計分板完成的場次由雲端寫入評分並清除分槽」

#### Scenario: 另一裝置先送出同一場比分時顯示衝突提示

- **GIVEN** context A 與 B 都已載入同一回合
- **WHEN** A 對 `m1` 送出比分並同步完成，之後 B 也對 `m1` 送出不同比分
- **THEN** B 顯示「資料已在其他裝置更新，已重新載入最新資料」，`m1` 的比分為 A 送出的那個
- **驗收**：`nextjs-pickball/tests/e2e/user-data/round-sync.spec.ts`，test 名稱「另一裝置先送出同一場比分時顯示衝突提示並載入最新回合」

#### Scenario: 雲端回合載入失敗時對戰頁顯示錯誤

- **GIVEN** 以 `page.route` 讓 `GET /api/matchmaker/round` 回 500
- **WHEN** 開啟 `/matchmaker`
- **THEN** 顯示「無法載入雲端資料，請重新整理頁面」，產生對戰的按鈕不存在
- **驗收**：`nextjs-pickball/tests/e2e/user-data/round-sync.spec.ts`，test 名稱「雲端回合載入失敗時對戰頁顯示錯誤提示」
