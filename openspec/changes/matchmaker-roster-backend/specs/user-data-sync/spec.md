## ADDED Requirements

### Requirement: 多筆使用者資料的逐筆版本化契約

每位使用者有多筆、以 id 區分的資料（本 change：對戰分配機參賽者；之後的 change 沿用於同型資料）SHALL 以「逐筆版本化」契約讀寫，
其餘規則（路由、授權、停用閘門、400／401／404／409 的錯誤碼）與「版本化讀寫契約」及「使用者資料 API 的路由、授權與停用閘門」相同：

- **列出**：`GET /api/<feature>/<items>` MUST 回 `200 { "items": [{ "data": <T>, "version": <正整數> }] }`，依建立順序（`sort_order` 遞增）排列；沒有資料時 `items` 為空陣列。
- **建立或更新單筆**：`PUT /api/<feature>/<items>/:id`，body `{ "data": <T>, "version": <非負整數> }`。`data.id` MUST 等於 path 的 `:id`，否則 400。
  版本規則同單筆契約（0 為建立、等於目前版本才更新並回 `version + 1`、其餘 409 且資料不變）；新建立的那筆 `sort_order` 為該使用者現有最大值加一。
- **刪除單筆**：`DELETE /api/<feature>/<items>/:id` MUST 回 `204`，不比對版本、**冪等**（不存在也回 204）。刪除表達的是使用者明確意圖；
  與另一裝置的編輯同時發生時以刪除為準，對方下一次 PUT 會因資料不存在（`version > 0`）而得到 409 並重新載入。
- **批次附加**：`POST /api/<feature>/<items>/import`，body `{ "<items>": [<T>, ...] }`（至少一筆、id 互不重複，否則 400），
  MUST 以單一 D1 `batch()` 依序插入（`sort_order` 接續現有最大值），任一筆 id 已存在時**整份不寫入**並回 409；成功回 `200 { "items": [{ data, version: 1 }, ...] }`。
  原子性來自 D1 batch：任一陳述式失敗時整批回滾（design 的 Context7 查證）。
- **重置**：`POST /api/<feature>/reset` MUST 以單一 `batch()` 刪除該使用者在此 feature 的所有使用者資料表的列並回 `204`；之後的 change 為同一 feature 新增資料表時 MUST 把該表加進這個 batch。

前端對多筆資料 MUST 採樂觀更新，並以**每筆一個**最新優先儲存佇列（`createLatestWinsSaver`）送出 PUT／DELETE；任一筆收到 409 時 MUST 停止所有佇列、
丟棄待送值、重新 `GET` 整份清單取代畫面狀態，並回報 `conflict`——SHALL NOT 嘗試逐筆合併（D3）。多個佇列的狀態彙總為單一 `SyncStatus`：
任一在重試中為 `retrying`、否則任一在途為 `saving`、否則 `synced`。

#### Scenario: 共用的清單與匯入 schema

- **WHEN** 以 `PlayerImportRequestSchema` 解析「空陣列」「含兩筆相同 id」「兩筆合法且 id 相異」，以 `PlayerListResponseSchema` 解析「含一筆 `rating` 為 99」的回應
- **THEN** 只有「兩筆合法且 id 相異」通過；清單回應因該筆不合 `PlayerSchema` 而失敗
- **驗收**：`packages/pickball-core/test/api/players.test.ts`，it 名稱「PlayerImportRequestSchema 要求至少一位且 id 不重複」與「PlayerListResponseSchema 以 PlayerSchema 驗證每一筆」
