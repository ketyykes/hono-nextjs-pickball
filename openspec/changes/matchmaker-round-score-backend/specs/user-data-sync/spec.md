## MODIFIED Requirements

### Requirement: 多筆使用者資料的逐筆版本化契約

每位使用者有多筆、以 id 區分的資料（B6：對戰分配機參賽者；B7：對戰場次的計分板分槽；之後的 change 沿用於同型資料）SHALL 以「逐筆版本化」契約讀寫，
其餘規則（路由、授權、停用閘門、400／401／404／409 的錯誤碼）與「版本化讀寫契約」及「使用者資料 API 的路由、授權與停用閘門」相同：

- **列出**：`GET /api/<feature>/<items>` MUST 回 `200 { "items": [{ "data": <T>, "version": <正整數> }] }`；沒有資料時 `items` 為空陣列。
  排列順序 MUST 由該資料的 Requirement 定義；未另行定義時依建立順序（`sort_order` 遞增）。
- **建立或更新單筆**：`PUT /api/<feature>/<items>/:id`，body `{ "data": <T>, "version": <非負整數> }`。`data` 中代表 id 的欄位 MUST 等於 path 的 `:id`，否則 400。
  版本規則同單筆契約（0 為建立、等於目前版本才更新並回 `version + 1`、其餘 409 且資料不變）；資料有 `sort_order` 時，新建立的那筆為該使用者現有最大值加一。
  資料的 Requirement 可以為「建立」再加前置條件（例：分槽的場次必須屬於目前回合），條件不成立時 MUST 回 409 且不寫入。
- **刪除單筆**：`DELETE /api/<feature>/<items>/:id` MUST 回 `204`，不比對版本、**冪等**（不存在也回 204）。刪除表達的是使用者明確意圖；
  與另一裝置的編輯同時發生時以刪除為準，對方下一次 PUT 會因資料不存在（`version > 0`）而得到 409 並重新載入。
- **批次附加**：`POST /api/<feature>/<items>/import`，body `{ "<items>": [<T>, ...] }`（至少一筆、id 互不重複，否則 400），
  MUST 以單一 D1 `batch()` 依序插入（`sort_order` 接續現有最大值），任一筆 id 已存在時**整份不寫入**並回 409；成功回 `200 { "items": [{ data, version: 1 }, ...] }`。
  原子性來自 D1 batch：任一陳述式失敗時整批回滾（design 的 Context7 查證）。
- **重置**：`POST /api/<feature>/reset` MUST 以單一 `batch()` 刪除該使用者在此 feature 的所有使用者資料表的列並回 `204`；之後的 change 為同一 feature 新增資料表時 MUST 把該表加進這個 batch。

各資料 MAY 只提供上列端點的**子集**（例：分槽不提供批次附加；歷史只增不改，不提供 PUT），但提供的端點 MUST 依上列語意；子集與排序 MUST 在該資料的 Requirement 中明列。

前端對多筆資料 MUST 採樂觀更新，並以**每筆一個**最新優先儲存佇列（`createLatestWinsSaver`）送出 PUT／DELETE；任一筆收到 409 時 MUST 停止所有佇列、
丟棄待送值、重新 `GET` 整份清單取代畫面狀態，並回報 `conflict`——SHALL NOT 嘗試逐筆合併（D3）。多個佇列的狀態彙總為單一 `SyncStatus`：
任一在重試中為 `retrying`、否則任一在途為 `saving`、否則 `synced`。

#### Scenario: 共用的清單與匯入 schema

- **WHEN** 以 `PlayerImportRequestSchema` 解析「空陣列」「含兩筆相同 id」「兩筆合法且 id 相異」，以 `PlayerListResponseSchema` 解析「含一筆 `rating` 為 99」的回應
- **THEN** 只有「兩筆合法且 id 相異」通過；清單回應因該筆不合 `PlayerSchema` 而失敗
- **驗收**：`packages/pickball-core/test/api/players.test.ts`，it 名稱「PlayerImportRequestSchema 要求至少一位且 id 不重複」與「PlayerListResponseSchema 以 PlayerSchema 驗證每一筆」

#### Scenario: 分槽清單 schema 要求 matchId 非 null

- **WHEN** 以 `MatchSlotListResponseSchema` 解析「一筆 `data.matchId` 為 `null`」與「兩筆 `matchId` 皆為字串」的回應
- **THEN** 前者失敗、後者通過
- **驗收**：`packages/pickball-core/test/api/round.test.ts`，it 名稱「MatchSlotListResponseSchema 要求每筆分槽的 matchId 為字串」

## ADDED Requirements

### Requirement: 後端多表寫入以單一 batch 與整批守衛完成

同一個請求需要寫入多張使用者資料表（或同一張表的多列），且其中任一寫入以版本或存在性為前提時，後端 SHALL 以**單一** D1 `batch()` 完成全部寫入，
SHALL NOT 拆成多次 `run()`／`batch()`、SHALL NOT 以「先寫、失敗再手動補償」的方式達成原子性——D1 沒有互動式 transaction（runbook R2），
多次呼叫之間的失敗會留下部分寫入。

batch 中**影響 0 列的 UPDATE／DELETE 不是錯誤**，不會讓整批回滾（design Decision 2 的 Context7 查證與 characterization 測試）。因此版本條件 SHALL NOT 只寫在各 UPDATE 的 `WHERE` 中；
MUST 以**整批守衛**表達：batch 的第一條陳述式為

```sql
INSERT INTO sync_batch_guards (user_id, version, updated_at)
VALUES (?, CASE WHEN <全部前提成立> THEN 1 END, ?)
```

前提不成立時 `CASE` 得到 `NULL`、違反 `version` 的 NOT NULL 約束，該陳述式失敗並使整批回滾；batch 的最後一條陳述式 MUST 刪除這一列，使 `sync_batch_guards` 在任何 batch 結束後恆為空。
守衛陳述式 SHALL NOT 使用 `INSERT OR IGNORE`、`INSERT OR REPLACE` 或改變 NOT NULL 衝突處理的寫法——`OR IGNORE` 會把違反約束的列靜默略過，使守衛失效。
`<全部前提成立>` MUST 是只讀取資料庫目前內容的純 SQL 條件（例：`(SELECT version FROM matchmaker_round WHERE user_id = ?) = ?`），SHALL NOT 依賴 batch 外先讀到的值——
先讀後寫之間的競態正是守衛要消除的。

守衛失敗的錯誤 MUST 被分類為 `409 { "error": "VERSION_CONFLICT" }`；其他資料庫錯誤 SHALL NOT 被吞成 409，MUST 照常回 500。分類邏輯集中在
`hono-pickball/src/matchmaker/batch-guard.ts`，以錯誤訊息是否指向 `sync_batch_guards.version`（或該 Requirement 明列的唯一性約束）判定。

#### Scenario: batch 中影響 0 列的 UPDATE 不會使整批回滾

- **GIVEN** 測試用 D1 已套用全部 migration，有一位使用者
- **WHEN** 執行 `batch([插入一列 matchmaker_round, 對不存在的 user_id 執行 UPDATE matchmaker_players])`
- **THEN** batch 不拋出，`matchmaker_round` 的那一列已寫入
- **驗收**：`hono-pickball/test/d1-batch-guard.test.ts`，it 名稱「batch 中影響 0 列的 UPDATE 不會使整批回滾」

#### Scenario: 整批守衛的條件不成立時整批回滾

- **GIVEN** 同上
- **WHEN** 執行 `batch([守衛（條件為假）, 插入一列 matchmaker_round, 刪除守衛列])`
- **THEN** batch 拋出且錯誤被 `batch-guard.ts` 分類為版本衝突；`matchmaker_round` 與 `sync_batch_guards` 皆無該使用者的列
- **AND** 條件為真時同一組陳述式成功，`matchmaker_round` 有一列、`sync_batch_guards` 為空
- **驗收**：`hono-pickball/test/d1-batch-guard.test.ts`，it 名稱「整批守衛的條件不成立時整批回滾且被分類為版本衝突」

#### Scenario: 非守衛的資料庫錯誤不被分類為版本衝突

- **WHEN** 以一個 foreign key 違反的錯誤（不存在的 `user_id`）呼叫分類函式
- **THEN** 分類結果不是版本衝突
- **驗收**：`hono-pickball/test/d1-batch-guard.test.ts`，it 名稱「非守衛的資料庫錯誤不被分類為版本衝突」
