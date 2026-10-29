## MODIFIED Requirements

### Requirement: 前端依 session 選擇儲存模式

`nextjs-pickball/lib/sync/storage-mode.ts` SHALL 匯出 `resolveStorageMode(snapshot: SessionSnapshot): "local" | "remote"`，
是前端「存本機還是存雲端」的**唯一判斷**：只有 `status === "ready"`、`authEnabled === true` 且 `user !== null` 時回 `"remote"`，其餘一律 `"local"`。

session 仍在載入時 MUST 為 `"local"`：訪客（含正式站，auth 停用）的首屏時序 SHALL NOT 因等待 `/api/session` 而改變——訪客行為與既有 E2E 須零迴歸。
代價是已登入使用者在 session 回應前會先看到本機資料一瞬間，之後切換為雲端載入中——此為刻意取捨，SHALL NOT 以「等 session 就緒才渲染」改變訪客時序。

各資料的 store hook SHALL 以「選擇器」形態接上儲存模式：既有本機實作原封不動保留（改名為同檔的 `useLocal<X>Store`），
新增 `hooks/useRemote<X>Store.ts`（參數含 `enabled: boolean` 與 `onUnauthorized: () => void`），對外名稱 `use<X>Store` 依 `useSession()` 與 `resolveStorageMode` 擇一回傳。
兩個 hook 每次 render 都呼叫（遵守 hooks 規則），未被選用的一方 SHALL NOT 發出請求或寫入 localStorage 以外的副作用。
雲端 hook 收到 401 時 MUST 呼叫 `onUnauthorized`（選擇器傳入 `useSession().refresh`），使 session 更新後自動回到本機模式。

#### Scenario: 只有就緒、啟用且已登入時為 remote

- **WHEN** 以 `{ status: "loading" }`、`{ status: "ready", authEnabled: false, user: null }`、`{ status: "ready", authEnabled: true, user: null }`、`{ status: "ready", authEnabled: true, user: <使用者> }` 分別呼叫
- **THEN** 只有最後一種回 `"remote"`，其餘皆為 `"local"`
- **驗收**：`nextjs-pickball/lib/sync/storage-mode.test.ts`，it 名稱「只有 session 就緒、auth 啟用且有 user 時為 remote」

### Requirement: 後端多表寫入以單一 batch 與整批守衛完成

同一個請求需要寫入多張使用者資料表（或同一張表的多列），且其中任一寫入以版本或存在性為前提時，後端 SHALL 以**單一** D1 `batch()` 完成全部寫入，
SHALL NOT 拆成多次 `run()`／`batch()`、SHALL NOT 以「先寫、失敗再手動補償」的方式達成原子性——D1 沒有互動式 transaction，
多次呼叫之間的失敗會留下部分寫入。

batch 中**影響 0 列的 UPDATE／DELETE 不是錯誤**，不會讓整批回滾（D1 文件查證，並由下方 characterization 測試守住）。因此版本條件 SHALL NOT 只寫在各 UPDATE 的 `WHERE` 中；
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
