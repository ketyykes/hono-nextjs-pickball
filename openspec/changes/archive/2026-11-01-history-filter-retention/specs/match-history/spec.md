# Specification: match-history

## MODIFIED Requirements

### Requirement: 登入時歷史以雲端為準

後端 SHALL 於 `/api/matchmaker/*` sub-app 提供 `GET /api/matchmaker/history`（授權、停用閘門與錯誤碼依 `user-data-sync`；SQL MUST 帶 `user_id = c.var.user.id`）。
本端點位於既有 sub-app 之下，因此受 `use("*", localAuth, requireSession, requireExpectedUser)` 保護（`user-data-sync`「使用者資料請求的預期帳號守衛」）：
`X-Expected-User-Id` 缺少、為空或與 session 不符時 MUST 回 `401 { "error": "ACCOUNT_MISMATCH" }` 且不回傳任何歷史；
`hono-pickball/test/expected-user-guard.test.ts` 的樣本表 MUST 補一條 `GET /api/matchmaker/history`，列舉出的使用者資料路由由 13 條變為 14 條。
歷史只增不改：本端點是 `user-data-sync`「多筆使用者資料的逐筆版本化契約」的**列出子集**，SHALL NOT 提供 PUT、DELETE 或批次附加。

查詢參數（皆選填，以核心 `@pickball/core/api/history` 的 `HistoryQuerySchema` 驗證；不合法時回 `400 INVALID_BODY`）。
`from`／`to` MUST 為只含十進位數字的字串（`/^\d+$/`）再轉為數字，且 MUST 為安全整數；SHALL NOT 使用 `z.coerce.number()`——它對空字串得 0、對 `" 12 "`、`"1e3"`、`"0x10"` 亦會轉成數字（design「apply §1 查證紀錄」）：

| 參數 | 規格 |
|---|---|
| `from` | 非負整數毫秒；只回 `played_at >= from` 的列 |
| `to` | 非負整數毫秒；只回 `played_at < to` 的列；同時給 `from` 時 MUST `from <= to`；`from === to` 為合法的空區間（`rangeBounds` 在週一的「本週」、本週一落在上個月時的「本月」會產生），MUST 回 200、`items` 為空、`total` 照算 |
| `order` | `desc`（預設）或 `asc` |

回應 MUST 為 `200 { items: [{ data: MatchHistoryEntry, version: 1 }], total: <本人全部歷史列數>, droppedCount: <本次範圍內略過的列數> }`。
`desc` MUST 依 `played_at` 由新到舊、同一 `played_at` 依插入順序（`rowid` 遞增）排列——與 `filterHistoryByRange` 對追加順序做穩定排序的結果相同；
`asc` MUST 依 `played_at` 由舊到新、同一 `played_at` 依插入順序（等同完成順序，供匯出使用）。
每一列的 `data` MUST 以 `MatchHistoryEntrySchema` 驗證：不合法者 SHALL NOT 出現在 `items`、MUST 計入 `droppedCount`，且 SHALL NOT 被刪除或改寫。

**區間界線在前端計算**：核心 `history-range.ts` SHALL 新增純函式 `rangeBounds(range, now)`，回傳 `{ from: number | null, to: number | null }`（`null` 表示無界）：
`today` 為 `[c0, ∞)`、`thisWeek` 為 `[c1, c0)`、`thisMonth` 為 `[c2, c1)`、`lastMonth` 為 `[c3, c2)`、`earlier` 為 `(-∞, c3)`，其中 `c0..c3` 為既有 `computeRangeCutoffs(now)` 的切點。
對任何時間 `t`，`rangeOfTime(t, now) === r` MUST 等價於 `t` 落在 `rangeBounds(r, now)` 內——五個區間的定義仍只有一份（「歷史區間切點計算」「五個區間互斥且完整覆蓋」）。
後端 SHALL NOT 自行計算區間切點：Workers runtime 以 UTC 執行，與使用者裝置的本地時區不同（design Decision 1）。

前端 `hooks/useRemoteHistory.ts`（`{ enabled, userId, range, onUnauthorized }` → `{ items, total, droppedCount, syncStatus }`）MUST：
在 effect 中取一次 `new Date()`、以 `rangeBounds` 算出界線並 `GET`（`loading` → `synced`）；`range` 改變時重新 GET，且只採用**最後一次**請求的結果；
失敗為 `load-failed`；401（含 `ACCOUNT_MISMATCH`）呼叫 `onUnauthorized`；`enabled` 為 false、或 `enabled` 為 true 而 `userId` 為 `null` 時不發請求。
請求 MUST 經 `nextjs-pickball/lib/sync/history-api.ts`（`fetchRemoteHistory(expectedUserId, query)`，以 `expectedUserId` 為第一參數，一律經 `requestJson`）。

本 hook 是 `user-data-sync`「雲端 store 以登入帳號為界」所稱「之後的 change 新增者」：主 effect 依賴含 `userId`，每次請求以該次 effect 的 `userId` 作為 `expectedUserId`；
hook MUST 記錄目前結果所屬的 `userId`（擁有者標記），render 時若與 options 的 `userId` 不同，MUST 回傳 `{ items: [], total: 0, droppedCount: 0, syncStatus: "loading" }`——
換帳號的那一次 render 起就不顯示前一帳號的歷史；舊帳號在途請求的結果 MUST 被忽略。
`RemoteHistoryView` 與 `RemoteStatsContent` MUST 以 `useSession()` 快照中的 user id（`status` 非 `ready` 或無 user 時為 `null`）作為 `userId`、`refresh` 作為 `onUnauthorized`，比照選擇器 hook 的接線。

`RemoteHistoryView` 在 `syncStatus` 為 `loading`／`load-failed` 時 MUST 保留 `HistoryRangeFilter`，只把紀錄區塊（紀錄卡片與兩種空狀態）換成 `SyncStatusNotice`，且 SHALL NOT 顯示損毀提示（此時沒有可信資料）。
篩選器在 `loading`、`load-failed`、`synced` 之間轉換時 MUST 是同一個持續掛載的元素，SHALL NOT 卸載重建——焦點已在某個區間選項上時（例如以鍵盤選取區間），焦點 MUST 留在該選項上，載入中、載入完成與載入失敗皆然（每次換區間 hook 都會回到 `loading`，卸載篩選器會讓焦點掉回 `body`）。以指標點擊時是否讓按鈕取得焦點由瀏覽器決定，本規則不額外要求。
載入失敗時篩選器 MUST 可操作：改選其他區間即依上述「`range` 改變時重新 GET」的規則以新區間重新載入，成功後顯示該區間的紀錄；失敗文案沿用 `SyncStatusNotice` 的固定文案，不另設重試按鈕。
`RemoteStatsContent` 在載入中與載入失敗時的呈現見 `player-stats`「統計依區間篩選」。
`total === 0` 時顯示引導型空狀態（`EmptyHistory range={null}`），`total > 0` 但 `items` 為空時顯示該區間的空狀態（`EmptyHistory range={range}`）。根元素帶 `data-sync-status`。

#### Scenario: 雲端歷史：auth 停用時歷史端點回 404

- **WHEN** 以 auth 停用且無 DB binding 的 env 呼叫 `GET /api/matchmaker/history`
- **THEN** 回 404
- **驗收**：`hono-pickball/test/matchmaker-history.test.ts`，it 名稱「auth 停用且無 DB binding 時歷史端點回 404」

#### Scenario: 雲端歷史：未登入時歷史端點回 401

- **WHEN** 未帶 session 呼叫 `GET /api/matchmaker/history`
- **THEN** 回 `401 { "error": "UNAUTHORIZED" }`
- **驗收**：`hono-pickball/test/matchmaker-history.test.ts`，it 名稱「未登入呼叫歷史端點回 401」

#### Scenario: 雲端歷史：他人的歷史不可見

- **GIVEN** 使用者 A 有兩筆歷史
- **WHEN** 使用者 B 呼叫 `GET /api/matchmaker/history`
- **THEN** B 得到 `{ items: [], total: 0, droppedCount: 0 }`
- **驗收**：`hono-pickball/test/matchmaker-history.test.ts`，it 名稱「B 看不到 A 的歷史且 total 為 0」

#### Scenario: 雲端歷史：預期帳號缺少或不符時歷史端點回 401 且不回傳歷史

- **GIVEN** 使用者 A、B 各有歷史；以 B 的 cookie 呼叫
- **WHEN** `GET /api/matchmaker/history` 的 `X-Expected-User-Id` 為 A 的 id、B 的 id 加尾碼、缺少或空字串
- **THEN** 皆回 `401 { "error": "ACCOUNT_MISMATCH" }`，回應不含任何歷史；兩人的資料不變
- **AND** `app.routes` 列舉出的使用者資料路由含 `GET /api/matchmaker/history`，與樣本表一致（共 14 條）
- **驗收**：`hono-pickball/test/expected-user-guard.test.ts`（樣本表補 `GET /api/matchmaker/history`），it 名稱「每條使用者資料路由在預期帳號與 session 不符時皆回 401 ACCOUNT_MISMATCH 且資料不變」「缺少或空白的預期帳號標頭使使用者資料路由回 401 ACCOUNT_MISMATCH 且資料不變」「列舉出的使用者資料路由恰與守衛樣本表一致」

#### Scenario: 雲端歷史：預設由新到舊、同時間依插入順序

- **GIVEN** 依序插入 `played_at` 為 100、300、300、200 的四筆（第二、三筆同時間）
- **WHEN** 不帶參數 GET
- **THEN** `items` 的順序為 300（第二筆）、300（第三筆）、200、100；`total` 為 4
- **AND** `order=asc` 時順序為 100、200、300（第二筆）、300（第三筆）
- **驗收**：`hono-pickball/test/matchmaker-history.test.ts`，it 名稱「預設依 played_at 由新到舊且同時間依插入順序，asc 為由舊到新」

#### Scenario: 雲端歷史：依 from 與 to 篩選且 total 不受篩選影響

- **GIVEN** `played_at` 為 100、200、300 的三筆
- **WHEN** 以 `from=200&to=300` GET
- **THEN** `items` 只有 200 那筆（`from` 含、`to` 不含）；`total` 為 3
- **驗收**：`hono-pickball/test/matchmaker-history.test.ts`，it 名稱「from 含、to 不含地篩選 played_at，total 仍為全部筆數」

#### Scenario: 雲端歷史：不合法的查詢參數

- **WHEN** 分別以 `from=abc`、`from=-1`、`from=300&to=200`、`order=random`、`from=`（空字串）GET
- **THEN** 五者皆回 400 `INVALID_BODY`
- **驗收**：`hono-pickball/test/matchmaker-history.test.ts`，it 名稱「from、to 或 order 不合法時回 400」

#### Scenario: 雲端歷史：from 等於 to 時為空區間

- **GIVEN** `played_at` 為 100、200、300 的三筆
- **WHEN** 以 `from=200&to=200` GET
- **THEN** 回 200 `{ items: [], total: 3, droppedCount: 0 }`——與本機在該區間顯示空狀態一致，SHALL NOT 回 400
- **驗收**：`hono-pickball/test/matchmaker-history.test.ts`，it 名稱「from 等於 to 時回 200、items 為空且 total 為全部筆數」

#### Scenario: 雲端歷史：損毀列被略過並計數但不刪除

- **GIVEN** 以 SQL 直接插入一筆 `data` 缺少 `winner` 的列與一筆合法列
- **WHEN** GET 兩次
- **THEN** 兩次皆只回合法那筆、`droppedCount` 為 1、`total` 為 2；資料表仍有兩列
- **驗收**：`hono-pickball/test/matchmaker-history.test.ts`，it 名稱「不合 schema 的歷史列被略過並計入 droppedCount 且不被刪除」

#### Scenario: 雲端歷史：data 不是合法 JSON 的列同樣被略過並計數

- **GIVEN** 以 SQL 直接插入一筆 `data` 為非 JSON 文字（例：`{not json`）的列與一筆合法列
- **WHEN** GET
- **THEN** 回 200、只回合法那筆、`droppedCount` 為 1、`total` 為 2；該列的原始文字未被改寫——單一列損毀 SHALL NOT 使整個端點失敗（否則歷史頁、統計頁與匯出全部無法使用）
- **驗收**：`hono-pickball/test/matchmaker-history.test.ts`，it 名稱「data 不是合法 JSON 的歷史列同樣被略過並計數而不使端點失敗」

#### Scenario: 雲端歷史：rangeBounds 與 rangeOfTime 對任意時間判定一致

- **GIVEN** 固定的 `now`（含跨月週與月初的情境）與涵蓋五個區間及各切點前後 1 毫秒的時間樣本
- **WHEN** 對每個樣本 `t` 與每個區間 `r` 比較「`rangeOfTime(t, now) === r`」與「`t` 落在 `rangeBounds(r, now)`」
- **THEN** 兩者全部一致
- **驗收**：`packages/pickball-core/test/matchmaker/history-range-bounds.test.ts`，it 名稱「rangeBounds 與 rangeOfTime 對任意時間判定一致」

#### Scenario: 雲端歷史：五個區間的界線首尾相接

- **WHEN** 對同一個 `now` 取五個區間的 `rangeBounds`
- **THEN** `today.from === thisWeek.to`、`thisWeek.from === thisMonth.to`、`thisMonth.from === lastMonth.to`、`lastMonth.from === earlier.to`；`today.to` 與 `earlier.from` 為 `null`
- **驗收**：`packages/pickball-core/test/matchmaker/history-range-bounds.test.ts`，it 名稱「五個區間的 rangeBounds 首尾相接且兩端無界」

#### Scenario: 雲端歷史：rangeBounds 產生的界線皆為合法查詢

- **GIVEN** 固定的 `now` 樣本（含週一——本週為空區間——與跨月週——本月為空區間）
- **WHEN** 對每個 `now` 與五個區間，把 `rangeBounds` 的非 `null` 界線轉為十進位字串交給 `HistoryQuerySchema`
- **THEN** 全部解析成功（前端送出的任何區間查詢都不會被後端以 400 拒絕）
- **驗收**：`packages/pickball-core/test/matchmaker/history-range-bounds.test.ts`，it 名稱「rangeBounds 產生的每個區間界線皆通過 HistoryQuerySchema」

#### Scenario: 雲端歷史：共用的歷史查詢與回應 schema

- **WHEN** 以 `HistoryQuerySchema` 解析 `{ from: "300", to: "200" }` 與 `{ from: "100", order: "asc" }`，以 `HistoryListResponseSchema` 解析含 `winner: "draw"` 的回應
- **THEN** 前者失敗；後兩者通過且 `from` 轉為數字 100
- **驗收**：`packages/pickball-core/test/api/history.test.ts`，it 名稱「HistoryQuerySchema 拒絕 from 大於 to 且 HistoryListResponseSchema 接受平局紀錄」

#### Scenario: 雲端歷史：歷史 API 包裝的請求形狀

- **WHEN** 以 `"user-a"` 為第一參數，`{ from: 1, to: 2 }`、`{ order: "asc" }` 與 `{}` 為第二參數呼叫 `fetchRemoteHistory`
- **THEN** `requestJson` 依序收到 `GET /api/matchmaker/history?from=1&to=2`、`?order=asc`、無查詢字串的路徑，且帶回應 schema 與 `expectedUserId: "user-a"`
- **驗收**：`nextjs-pickball/lib/sync/history-api.test.ts`，it 名稱「歷史 API 包裝以正確的查詢字串呼叫 requestJson」

#### Scenario: 雲端歷史：依區間載入雲端歷史

- **GIVEN** `enabled: true`、`userId: "user-a"`、`range: "today"`，假時鐘固定 `now`
- **WHEN** hook mount，之後 `range` 改為 `"lastMonth"`
- **THEN** 第一次 GET 的 `from`／`to` 等於 `rangeBounds("today", now)`、第二次等於 `rangeBounds("lastMonth", now)`；兩次皆帶 `X-Expected-User-Id: user-a`；狀態依序 `loading` → `synced`；回傳 `items`、`total`、`droppedCount` 為最後一次回應
- **驗收**：`nextjs-pickball/hooks/useRemoteHistory.test.tsx`，it 名稱「依 range 以 rangeBounds 的界線載入雲端歷史並在 range 改變時重新載入」

#### Scenario: 雲端歷史：只採用最後一次請求的結果

- **GIVEN** `range` 由 `"today"` 快速改為 `"thisWeek"`，第一次請求比第二次晚回應
- **WHEN** 兩個回應都到達
- **THEN** 回傳的 `items` 為第二次（`thisWeek`）的回應
- **驗收**：`nextjs-pickball/hooks/useRemoteHistory.test.tsx`，it 名稱「range 快速切換時只採用最後一次請求的結果」

#### Scenario: 雲端歷史：載入失敗、401 與停用

- **WHEN** GET 回 500；另一次 mount 時 GET 回 401；再一次以 `enabled: false` mount；再一次以 `enabled: true`、`userId: null` mount
- **THEN** 依序為 `load-failed`、呼叫 `onUnauthorized` 一次、後兩次 fetch 皆未被呼叫
- **驗收**：`nextjs-pickball/hooks/useRemoteHistory.test.tsx`，it 名稱「GET 失敗時為 load-failed，401 時呼叫 onUnauthorized，停用時不發請求」

#### Scenario: 雲端歷史：換帳號時以新帳號重新載入且不顯示前一帳號的歷史

- **GIVEN** `enabled: true`、`userId: "user-a"`、`range: "today"`，已載入 A 的一筆歷史（`total: 1`）
- **WHEN** 以 `userId: "user-b"` rerender，B 的 GET 尚未回應
- **THEN** rerender 後立即讀到 `{ items: [], total: 0, droppedCount: 0, syncStatus: "loading" }`；新 GET 帶 `X-Expected-User-Id: user-b`
- **AND** B 的 GET 回應後 `items` 為 B 的歷史、`syncStatus` 為 `synced`；A 世代晚到的回應不影響結果
- **驗收**：`nextjs-pickball/hooks/useRemoteHistory.test.tsx`，it 名稱「userId 變更時以新帳號重新載入歷史且不顯示前一帳號的歷史」

#### Scenario: 雲端歷史：兩種空狀態

- **WHEN** 分別以 `{ items: [], total: 0 }` 與 `{ items: [], total: 5 }` 渲染 `RemoteHistoryView`（`range: "thisMonth"`）
- **THEN** 前者顯示引導型空狀態，後者顯示「本月」的區間空狀態
- **驗收**：`nextjs-pickball/components/matchmaker/RemoteHistoryView.test.tsx`，it 名稱「total 為 0 時顯示引導型空狀態，否則顯示區間空狀態」

#### Scenario: 雲端歷史：登入後完成的對戰出現在歷史頁

- **GIVEN** 以測試帳號登入、雲端資料已清空，名單有四位
- **WHEN** 產生一輪、送出一場比分、開啟 `/matchmaker/history`
- **THEN** 「今日」區間顯示該場紀錄（姓名、比分與分數變化）；本機 `matchmaker:history:v1` 不存在
- **驗收**：`nextjs-pickball/tests/e2e/user-data/history-sync.spec.ts`，test 名稱「登入後完成的對戰由雲端顯示在歷史頁且不寫入本機」

#### Scenario: 雲端歷史：載入失敗時歷史頁顯示錯誤

- **GIVEN** 以 `page.route` 讓 `GET /api/matchmaker/history*` 回 500
- **WHEN** 開啟 `/matchmaker/history`
- **THEN** 顯示「無法載入雲端資料，請重新整理頁面」，區間篩選仍存在且「今日」為選中狀態
- **驗收**：`nextjs-pickball/tests/e2e/user-data/history-sync.spec.ts`，test 名稱「雲端歷史載入失敗時歷史頁顯示錯誤提示」

#### Scenario: 雲端歷史：載入中與載入失敗時保留區間篩選

- **GIVEN** `useRemoteHistory` 回報 `syncStatus` 為 `loading`（另一次為 `load-failed`），且回傳值帶一筆紀錄、`total: 3`、`droppedCount: 2`
- **WHEN** 渲染 `RemoteHistoryView`
- **THEN** 「歷史區間」radiogroup 存在、五個區間選項皆在且「今日」為選中；`role="status"` 的文字為該狀態的固定文案；根元素的 `data-sync-status` 為該狀態
- **AND** 不顯示紀錄卡片、引導型空狀態、區間空狀態與損毀提示
- **驗收**：`nextjs-pickball/components/matchmaker/RemoteHistoryView.test.tsx`，it 名稱「載入中與載入失敗時保留區間篩選並只以提示取代紀錄區塊」

#### Scenario: 雲端歷史：切換區間時焦點留在篩選器

- **GIVEN** 已登入，「今日」已載入一筆紀錄（`synced`）
- **WHEN** 焦點移到「本週」選項並按 Enter，hook 先回報 `loading`（`items: []`、`total: 0`）、之後回報 `synced`；接著焦點移到「本月」並按 Enter，hook 回報 `load-failed`（`items: []`、`total: 0`）
- **THEN** 「本週」在 `loading` 與 `synced` 兩個階段都是 `document.activeElement`，且與按鍵前取得的是同一個 DOM 節點；「本月」在 `load-failed` 時同樣是 `document.activeElement` 且為同一個節點；被選取的選項 `aria-checked` 為 `true`
- **驗收**：`nextjs-pickball/components/matchmaker/RemoteHistoryView.test.tsx`，it 名稱「以鍵盤切換區間時焦點在載入中、載入完成與載入失敗後都留在被選取的區間選項」

#### Scenario: 雲端歷史：載入失敗後改選其他區間可重新載入

- **GIVEN** 「今日」的載入失敗（`load-failed`）
- **WHEN** 選取「本週」，hook 對 `thisWeek` 回報 `synced` 並帶一筆紀錄
- **THEN** `useRemoteHistory` 最後一次收到的 `range` 為 `thisWeek`；畫面顯示該筆紀錄卡片、不再有失敗提示，篩選器仍在且「本週」為選中
- **驗收**：`nextjs-pickball/components/matchmaker/RemoteHistoryView.test.tsx`，it 名稱「載入失敗後改選其他區間會以新區間重新載入並顯示紀錄」

#### Scenario: 雲端歷史：載入失敗後切換區間重新載入成功且焦點不遺失

- **GIVEN** 以測試帳號登入、雲端已有一筆今日完成的對戰；以 `page.route` 攔截 `GET /api/matchmaker/history*`：測試放行前，「今日」區間的請求（只帶 `from`）回 500、「本週」區間的請求暫不回應；放行後所有請求照常轉給後端（依區間而非請求次數判定，因 dev 模式的 StrictMode 會在 mount 時送出兩次請求）
- **WHEN** 開啟 `/matchmaker/history`，出現失敗提示後以鍵盤選取「本週」，確認載入中後放行，再以鍵盤選取「今日」
- **THEN** 失敗時區間篩選可見且「今日」為選中；「本週」在 `data-sync-status="loading"` 與 `synced` 時皆為焦點所在；最後「今日」顯示那一筆紀錄卡片，焦點在「今日」選項
- **驗收**：`nextjs-pickball/tests/e2e/user-data/history-sync.spec.ts`，test 名稱「雲端歷史載入失敗後切換區間重新載入成功且焦點留在篩選器」
