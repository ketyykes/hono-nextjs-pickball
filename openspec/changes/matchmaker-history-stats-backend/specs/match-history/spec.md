## MODIFIED Requirements

### Requirement: 歷史頁唯讀消費既有紀錄

歷史頁 SHALL 只**讀取**歷史，SHALL NOT 寫入、修改、刪除或回寫任何歷史紀錄，亦 SHALL NOT 觸發評分更新或回合狀態變更。

**本機模式**下讀取來源為 `matchmaker:history:v1`（本 Requirement 以下各段）；**雲端模式**（`user-data-sync`「前端依 session 選擇儲存模式」）下讀取來源為 `GET /api/matchmaker/history`（見「登入時歷史以雲端為準」），歷史頁 MUST 只發出該 GET，SHALL NOT 發出任何寫入請求，也 SHALL NOT 讀寫 `matchmaker:history:v1`。

讀取 MUST 透過 M4 的 `readHistory()`（`nextjs-pickball/lib/matchmaker/round-storage.ts`）進行，SHALL NOT 自行 `JSON.parse(localStorage.getItem(...))`，也 SHALL NOT 於本 capability 重複寫死 key 字串（key 常數由 `nextjs-pickball/lib/matchmaker/storage-keys.ts` 單一來源匯出）——繞過 reader 會讓損壞資料的逐筆降級規則出現第二套實作，兩套一旦不一致就是資料靜默漏失。

讀取 MUST 在 client 端的 effect 中進行，首次伺服器輸出 SHALL 為空狀態；SHALL NOT 於 render 期間直接讀 LocalStorage 或取用系統時鐘，否則 SSR 與 CSR 的輸出必然不一致而產生 hydration 錯誤（沿用 `player-roster` 的 HYDRATE 模式）。

LocalStorage 不可用（SSR、私密模式）或無資料時 SHALL 顯示空狀態，SHALL NOT 拋出例外中斷畫面。

實作位於 `nextjs-pickball/components/matchmaker/HistoryView.tsx`（本機）與 `nextjs-pickball/components/matchmaker/RemoteHistoryView.tsx`（雲端）；`nextjs-pickball/app/matchmaker/history/page.tsx` 依儲存模式擇一渲染。

#### Scenario: 瀏覽與切換區間不改動持久化資料

- **GIVEN** `matchmaker:history:v1` 中已有數筆紀錄
- **WHEN** 開啟歷史頁並依序切換五個區間
- **THEN** `matchmaker:history:v1` 的內容與操作前逐字相同
- **驗收**：`nextjs-pickball/tests/e2e/specs/matchmaker-history.spec.ts`，test 名稱「瀏覽與切換區間後 matchmaker:history:v1 內容不變」

#### Scenario: 紀錄於 hydration 後才出現且無 console error

- **GIVEN** `matchmaker:history:v1` 中已有今日的紀錄
- **WHEN** 開啟 `/matchmaker/history` 並等待載入完成
- **THEN** 紀錄正確顯示
- **AND** 整個載入過程沒有任何 console error（含 hydration mismatch 警告）
- **驗收**：`nextjs-pickball/tests/e2e/specs/matchmaker-history.spec.ts`，test 名稱「紀錄於 hydration 後顯示且無 console error」

#### Scenario: 登入時瀏覽歷史頁只發出 GET 且不寫入本機

- **GIVEN** 以測試帳號登入，雲端已有一筆今日的歷史；本機 `matchmaker:history:v1` 有一份訪客歷史
- **WHEN** 開啟 `/matchmaker/history` 並依序切換五個區間
- **THEN** 對 `/api/matchmaker/*` 的請求全部為 GET；本機 `matchmaker:history:v1` 的內容與操作前逐字相同
- **驗收**：`nextjs-pickball/tests/e2e/user-data/history-sync.spec.ts`，test 名稱「登入時瀏覽歷史頁只發出 GET 且不改動本機歷史」

### Requirement: 損毀歷史紀錄的可見提示

歷史頁 SHALL 在 `readHistory()`（`nextjs-pickball/lib/matchmaker/round-storage.ts`）回傳的 `droppedCount` 大於 0 時，顯示非阻斷的繁體中文提示，告知使用者有歷史紀錄因損毀被略過，且其餘紀錄不受影響，SHALL NOT 靜默處理（`prd.md` 第 11 節）。提示 MUST 不阻斷正常紀錄的瀏覽——合法紀錄仍照常顯示，五個時間區間篩選仍可正常操作。

`droppedCount` MUST 直接取自 `readHistory()` 既有的回傳欄位，SHALL NOT 於本 capability 重複解析 LocalStorage 或另行計算——該欄位在回合與歷史的持久化與損壞降級機制中已存在（`round-storage.ts` 的逐筆降級：外層合法但個別紀錄不合法時保留合法者、捨棄不合法者並回報丟棄筆數），只是此前尚無任何畫面消費它。

提示樣式與文字語彙 MUST 與 `player-roster` capability 既有的損毀提示一致（`nextjs-pickball/app/matchmaker/players/page.tsx` 的 `droppedCount > 0` 區塊）：帶 `role="alert"`，內容為「有 N 筆損毀的歷史紀錄已略過，其餘歷史紀錄不受影響。」，SHALL NOT 另創第二種樣式或語彙——全站對「本機資料損毀」使用同一套視覺與文案，使用者不必重新學習第二種提示的意思。

`droppedCount` 為 0 時 SHALL NOT 顯示任何損毀提示。

**雲端模式**下 `droppedCount` MUST 取自 `GET /api/matchmaker/history` 回應的同名欄位（後端逐列驗證後略過的筆數，見「登入時歷史以雲端為準」），提示的樣式與文案 MUST 與本機模式相同；後端 SHALL NOT 因此刪除或改寫任何列——雲端沒有「回寫清理」的對應行為，損毀列保留以便日後以新版 schema 救回。

實作位於 `nextjs-pickball/components/matchmaker/HistoryView.tsx` 與 `nextjs-pickball/components/matchmaker/RemoteHistoryView.tsx`。

#### Scenario: 有損毀歷史紀錄時顯示提示

- **WHEN** 開啟歷史頁時 `readHistory()` 回傳的 `droppedCount` 大於 0
- **THEN** 畫面顯示帶 `role="alert"` 的繁體中文提示，內容含損毀筆數且說明其餘紀錄不受影響
- **AND** 合法的歷史紀錄仍正常顯示
- **驗收**：`nextjs-pickball/tests/e2e/specs/matchmaker-history.spec.ts`，test 名稱「有損毀歷史紀錄時顯示提示且其餘紀錄正常顯示」

#### Scenario: 沒有損毀歷史紀錄時不顯示提示

- **WHEN** `droppedCount` 為 0
- **THEN** 畫面不出現任何損毀提示
- **驗收**：`nextjs-pickball/tests/e2e/specs/matchmaker-history.spec.ts`，test 名稱「沒有損毀歷史紀錄時不顯示損毀提示」

#### Scenario: 雲端回應的 droppedCount 大於 0 時顯示相同提示

- **GIVEN** 雲端模式，`GET /api/matchmaker/history` 回 `{ items: [一筆合法紀錄], total: 3, droppedCount: 2 }`
- **WHEN** 渲染 `RemoteHistoryView`
- **THEN** 畫面有 `role="alert"` 且內容為「有 2 筆損毀的歷史紀錄已略過，其餘歷史紀錄不受影響。」；那一筆合法紀錄仍顯示
- **驗收**：`nextjs-pickball/components/matchmaker/RemoteHistoryView.test.tsx`，it 名稱「雲端回應的 droppedCount 大於 0 時顯示與本機相同的損毀提示」

## ADDED Requirements

### Requirement: 登入時歷史以雲端為準

後端 SHALL 於 `/api/matchmaker/*` sub-app 提供 `GET /api/matchmaker/history`（授權、停用閘門與錯誤碼依 `user-data-sync`；SQL MUST 帶 `user_id = c.var.user.id`）。
歷史只增不改：本端點是 `user-data-sync`「多筆使用者資料的逐筆版本化契約」的**列出子集**，SHALL NOT 提供 PUT、DELETE 或批次附加。

查詢參數（皆選填，以核心 `@pickball/core/api/history` 的 `HistoryQuerySchema` 驗證；不合法時回 `400 INVALID_BODY`）：

| 參數 | 規格 |
|---|---|
| `from` | 非負整數毫秒；只回 `played_at >= from` 的列 |
| `to` | 非負整數毫秒；只回 `played_at < to` 的列；同時給 `from` 時 MUST `from < to` |
| `order` | `desc`（預設）或 `asc` |

回應 MUST 為 `200 { items: [{ data: MatchHistoryEntry, version: 1 }], total: <本人全部歷史列數>, droppedCount: <本次範圍內略過的列數> }`。
`desc` MUST 依 `played_at` 由新到舊、同一 `played_at` 依插入順序（`rowid` 遞增）排列——與 `filterHistoryByRange` 對追加順序做穩定排序的結果相同；
`asc` MUST 依 `played_at` 由舊到新、同一 `played_at` 依插入順序（等同完成順序，供匯出使用）。
每一列的 `data` MUST 以 `MatchHistoryEntrySchema` 驗證：不合法者 SHALL NOT 出現在 `items`、MUST 計入 `droppedCount`，且 SHALL NOT 被刪除或改寫。

**區間界線在前端計算**：核心 `history-range.ts` SHALL 新增純函式 `rangeBounds(range, now)`，回傳 `{ from: number | null, to: number | null }`（`null` 表示無界）：
`today` 為 `[c0, ∞)`、`thisWeek` 為 `[c1, c0)`、`thisMonth` 為 `[c2, c1)`、`lastMonth` 為 `[c3, c2)`、`earlier` 為 `(-∞, c3)`，其中 `c0..c3` 為既有 `computeRangeCutoffs(now)` 的切點。
對任何時間 `t`，`rangeOfTime(t, now) === r` MUST 等價於 `t` 落在 `rangeBounds(r, now)` 內——五個區間的定義仍只有一份（「歷史區間切點計算」「五個區間互斥且完整覆蓋」）。
後端 SHALL NOT 自行計算區間切點：Workers runtime 以 UTC 執行，與使用者裝置的本地時區不同（design Decision 1）。

前端 `hooks/useRemoteHistory.ts`（`{ enabled, range, onUnauthorized }` → `{ items, total, droppedCount, syncStatus }`）MUST：
在 effect 中取一次 `new Date()`、以 `rangeBounds` 算出界線並 `GET`（`loading` → `synced`）；`range` 改變時重新 GET，且只採用**最後一次**請求的結果；
失敗為 `load-failed`；401 呼叫 `onUnauthorized`；`enabled` 為 false 時不發請求。請求 MUST 經 `nextjs-pickball/lib/sync/history-api.ts`（一律經 `requestJson`）。

`RemoteHistoryView` 與 `RemoteStatsContent` 在 `syncStatus` 為 `loading`／`load-failed` 時以 `SyncStatusNotice` 取代內容；`total === 0` 時顯示引導型空狀態（`EmptyHistory range={null}`），
`total > 0` 但 `items` 為空時顯示該區間的空狀態（`EmptyHistory range={range}`）。根元素帶 `data-sync-status`。

#### Scenario: auth 停用時歷史端點回 404

- **WHEN** 以 auth 停用且無 DB binding 的 env 呼叫 `GET /api/matchmaker/history`
- **THEN** 回 404
- **驗收**：`hono-pickball/test/matchmaker-history.test.ts`，it 名稱「auth 停用且無 DB binding 時歷史端點回 404」

#### Scenario: 未登入時歷史端點回 401

- **WHEN** 未帶 session 呼叫 `GET /api/matchmaker/history`
- **THEN** 回 `401 { "error": "UNAUTHORIZED" }`
- **驗收**：`hono-pickball/test/matchmaker-history.test.ts`，it 名稱「未登入呼叫歷史端點回 401」

#### Scenario: 他人的歷史不可見

- **GIVEN** 使用者 A 有兩筆歷史
- **WHEN** 使用者 B 呼叫 `GET /api/matchmaker/history`
- **THEN** B 得到 `{ items: [], total: 0, droppedCount: 0 }`
- **驗收**：`hono-pickball/test/matchmaker-history.test.ts`，it 名稱「B 看不到 A 的歷史且 total 為 0」

#### Scenario: 預設由新到舊、同時間依插入順序

- **GIVEN** 依序插入 `played_at` 為 100、300、300、200 的四筆（第二、三筆同時間）
- **WHEN** 不帶參數 GET
- **THEN** `items` 的順序為 300（第二筆）、300（第三筆）、200、100；`total` 為 4
- **AND** `order=asc` 時順序為 100、200、300（第二筆）、300（第三筆）
- **驗收**：`hono-pickball/test/matchmaker-history.test.ts`，it 名稱「預設依 played_at 由新到舊且同時間依插入順序，asc 為由舊到新」

#### Scenario: 依 from 與 to 篩選且 total 不受篩選影響

- **GIVEN** `played_at` 為 100、200、300 的三筆
- **WHEN** 以 `from=200&to=300` GET
- **THEN** `items` 只有 200 那筆（`from` 含、`to` 不含）；`total` 為 3
- **驗收**：`hono-pickball/test/matchmaker-history.test.ts`，it 名稱「from 含、to 不含地篩選 played_at，total 仍為全部筆數」

#### Scenario: 不合法的查詢參數

- **WHEN** 分別以 `from=abc`、`from=-1`、`from=300&to=200`、`order=random` GET
- **THEN** 四者皆回 400 `INVALID_BODY`
- **驗收**：`hono-pickball/test/matchmaker-history.test.ts`，it 名稱「from、to 或 order 不合法時回 400」

#### Scenario: 損毀列被略過並計數但不刪除

- **GIVEN** 以 SQL 直接插入一筆 `data` 缺少 `winner` 的列與一筆合法列
- **WHEN** GET 兩次
- **THEN** 兩次皆只回合法那筆、`droppedCount` 為 1、`total` 為 2；資料表仍有兩列
- **驗收**：`hono-pickball/test/matchmaker-history.test.ts`，it 名稱「不合 schema 的歷史列被略過並計入 droppedCount 且不被刪除」

#### Scenario: rangeBounds 與 rangeOfTime 對任意時間判定一致

- **GIVEN** 固定的 `now`（含跨月週與月初的情境）與涵蓋五個區間及各切點前後 1 毫秒的時間樣本
- **WHEN** 對每個樣本 `t` 與每個區間 `r` 比較「`rangeOfTime(t, now) === r`」與「`t` 落在 `rangeBounds(r, now)`」
- **THEN** 兩者全部一致
- **驗收**：`packages/pickball-core/test/matchmaker/history-range-bounds.test.ts`，it 名稱「rangeBounds 與 rangeOfTime 對任意時間判定一致」

#### Scenario: 五個區間的界線首尾相接

- **WHEN** 對同一個 `now` 取五個區間的 `rangeBounds`
- **THEN** `today.from === thisWeek.to`、`thisWeek.from === thisMonth.to`、`thisMonth.from === lastMonth.to`、`lastMonth.from === earlier.to`；`today.to` 與 `earlier.from` 為 `null`
- **驗收**：`packages/pickball-core/test/matchmaker/history-range-bounds.test.ts`，it 名稱「五個區間的 rangeBounds 首尾相接且兩端無界」

#### Scenario: 共用的歷史查詢與回應 schema

- **WHEN** 以 `HistoryQuerySchema` 解析 `{ from: "300", to: "200" }` 與 `{ from: "100", order: "asc" }`，以 `HistoryListResponseSchema` 解析含 `winner: "draw"` 的回應
- **THEN** 前者失敗；後兩者通過且 `from` 轉為數字 100
- **驗收**：`packages/pickball-core/test/api/history.test.ts`，it 名稱「HistoryQuerySchema 要求 from 小於 to 且 HistoryListResponseSchema 接受平局紀錄」

#### Scenario: 歷史 API 包裝的請求形狀

- **WHEN** 以 `{ from: 1, to: 2 }`、`{ order: "asc" }` 與 `{}` 呼叫 `fetchRemoteHistory`
- **THEN** `requestJson` 依序收到 `GET /api/matchmaker/history?from=1&to=2`、`?order=asc`、無查詢字串的路徑，且帶回應 schema
- **驗收**：`nextjs-pickball/lib/sync/history-api.test.ts`，it 名稱「歷史 API 包裝以正確的查詢字串呼叫 requestJson」

#### Scenario: 依區間載入雲端歷史

- **GIVEN** `enabled: true`、`range: "today"`，假時鐘固定 `now`
- **WHEN** hook mount，之後 `range` 改為 `"lastMonth"`
- **THEN** 第一次 GET 的 `from`／`to` 等於 `rangeBounds("today", now)`、第二次等於 `rangeBounds("lastMonth", now)`；狀態依序 `loading` → `synced`；回傳 `items`、`total`、`droppedCount` 為最後一次回應
- **驗收**：`nextjs-pickball/hooks/useRemoteHistory.test.tsx`，it 名稱「依 range 以 rangeBounds 的界線載入雲端歷史並在 range 改變時重新載入」

#### Scenario: 只採用最後一次請求的結果

- **GIVEN** `range` 由 `"today"` 快速改為 `"thisWeek"`，第一次請求比第二次晚回應
- **WHEN** 兩個回應都到達
- **THEN** 回傳的 `items` 為第二次（`thisWeek`）的回應
- **驗收**：`nextjs-pickball/hooks/useRemoteHistory.test.tsx`，it 名稱「range 快速切換時只採用最後一次請求的結果」

#### Scenario: 雲端歷史的失敗、401 與停用

- **WHEN** GET 回 500；另一次 mount 時 GET 回 401；再一次以 `enabled: false` mount
- **THEN** 依序為 `load-failed`、呼叫 `onUnauthorized` 一次、fetch 未被呼叫
- **驗收**：`nextjs-pickball/hooks/useRemoteHistory.test.tsx`，it 名稱「GET 失敗時為 load-failed，401 時呼叫 onUnauthorized，停用時不發請求」

#### Scenario: 雲端歷史的兩種空狀態

- **WHEN** 分別以 `{ items: [], total: 0 }` 與 `{ items: [], total: 5 }` 渲染 `RemoteHistoryView`（`range: "thisMonth"`）
- **THEN** 前者顯示引導型空狀態，後者顯示「本月」的區間空狀態
- **驗收**：`nextjs-pickball/components/matchmaker/RemoteHistoryView.test.tsx`，it 名稱「total 為 0 時顯示引導型空狀態，否則顯示區間空狀態」

#### Scenario: 登入後完成的對戰出現在歷史頁

- **GIVEN** 以測試帳號登入、雲端資料已清空，名單有四位
- **WHEN** 產生一輪、送出一場比分、開啟 `/matchmaker/history`
- **THEN** 「今日」區間顯示該場紀錄（姓名、比分與分數變化）；本機 `matchmaker:history:v1` 不存在
- **驗收**：`nextjs-pickball/tests/e2e/user-data/history-sync.spec.ts`，test 名稱「登入後完成的對戰由雲端顯示在歷史頁且不寫入本機」

#### Scenario: 雲端歷史載入失敗時歷史頁顯示錯誤

- **GIVEN** 以 `page.route` 讓 `GET /api/matchmaker/history*` 回 500
- **WHEN** 開啟 `/matchmaker/history`
- **THEN** 顯示「無法載入雲端資料，請重新整理頁面」，區間篩選不存在
- **驗收**：`nextjs-pickball/tests/e2e/user-data/history-sync.spec.ts`，test 名稱「雲端歷史載入失敗時歷史頁顯示錯誤提示」
