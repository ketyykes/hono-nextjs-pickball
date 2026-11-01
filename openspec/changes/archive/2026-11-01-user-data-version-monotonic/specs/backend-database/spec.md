## ADDED Requirements

### Requirement: 版本下限資料表由 migration 建立

`hono-pickball/src/db/schema.ts` SHALL 以 drizzle `sqliteTable` 定義 `sync_version_floors`（遵循 `user-data-sync`「使用者資料表的命名與欄位慣例」：
`user_id text not null` 為主鍵，以 foreign key 參照 `user.id` 並 `on delete cascade`；`version integer not null`；`updated_at integer`（`timestamp_ms`）not null）。
`version` 即該使用者的版本下限（`user-data-sync`「刪除後重建的使用者資料版本不得重複」），每位使用者至多一列；沒有列視為下限 0。
`version` 刻意不設 `DEFAULT`：提高下限的陳述式若誤算出 NULL，必須以 NOT NULL 失敗暴露，而不是被預設值靜默取代。

對應的 SQL migration SHALL 由 `pnpm --filter ./hono-pickball db:generate --name sync_version_floors` 產生（`drizzle/0004_sync_version_floors.sql` 與 meta），SHALL NOT 手寫或手改；
產生後再執行一次 `db:generate` MUST 不產生新檔案。`USER_DATA_TABLES` MUST 含 `sync_version_floors`（E2E 清空時一併處理；漏列會使雙向比對轉紅）。

#### Scenario: 版本下限表可寫入並讀回

- **GIVEN** 測試用 D1 已套用全部 migration，且已有一位使用者
- **WHEN** 以 SQL 對 `sync_version_floors` 插入一列後讀回
- **THEN** 讀回的各欄位與寫入值相同
- **驗收**：`hono-pickball/test/d1-schema.test.ts`，it 名稱「sync_version_floors 可由 migration 建立並寫入讀回」

#### Scenario: 版本下限表每位使用者只有一列

- **GIVEN** 使用者 A 已有一列下限
- **WHEN** 再為 A 插入一列，以及為使用者 B 插入一列
- **THEN** A 的第二次插入失敗（PRIMARY KEY／UNIQUE constraint）；B 的插入成功
- **驗收**：`hono-pickball/test/d1-schema.test.ts`，it 名稱「sync_version_floors 每位使用者只能有一列」

#### Scenario: 版本下限表的 version 不可為 NULL

- **WHEN** 以 `version` 為 `NULL` 插入 `sync_version_floors`
- **THEN** 插入失敗（NOT NULL constraint）；且 `pragma_table_info('sync_version_floors')` 中 `version` 的 `dflt_value` 為 NULL（沒有 DEFAULT）
- **驗收**：`hono-pickball/test/d1-schema.test.ts`，it 名稱「sync_version_floors 的 version 不可為 NULL」

#### Scenario: 刪除使用者時連帶刪除其版本下限

- **GIVEN** 某使用者在 `sync_version_floors` 有一列
- **WHEN** 刪除該使用者
- **THEN** `sync_version_floors` 中該 `user_id` 的筆數為 0
- **驗收**：`hono-pickball/test/d1-schema.test.ts`，it 名稱「刪除使用者時其 sync_version_floors 一併刪除」
