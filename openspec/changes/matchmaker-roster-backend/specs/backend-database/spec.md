## ADDED Requirements

### Requirement: 對戰分配機參賽者資料表由 migration 建立

`hono-pickball/src/db/schema.ts` SHALL 以 drizzle `sqliteTable` 定義 `matchmaker_players`（遵循 `user-data-sync`「使用者資料表的命名與欄位慣例」）：

| 欄位 | 型別 | 約束 |
|---|---|---|
| `user_id` | `text` | not null；foreign key 參照 `user.id`，`on delete cascade` |
| `id` | `text` | not null（參賽者 id，由前端產生的 UUID） |
| `data` | `text`（drizzle `mode: "json"`，型別為核心套件的 `Player`） | not null |
| `sort_order` | `integer` | not null |
| `version` | `integer` | not null |
| `updated_at` | `integer`（`timestamp_ms`） | not null |

主鍵 MUST 為複合主鍵 `(user_id, id)`：參賽者 id 只需在同一位使用者內唯一，不同使用者可以有相同 id（例如兩人各自匯入同一份備份），
SHALL NOT 以 `id` 單獨作為主鍵——那會讓一位使用者的匯入因另一位使用者的資料而失敗，等同洩漏「某 id 已存在」的資訊。

對應的 SQL migration SHALL 由 `pnpm --filter ./hono-pickball db:generate` 產生（`drizzle/0002_*.sql` 與 meta），SHALL NOT 手寫或手改；產生後再執行一次 MUST 不產生新檔案。
`USER_DATA_TABLES` MUST 含 `matchmaker_players`。

#### Scenario: matchmaker_players 可寫入並讀回

- **GIVEN** 測試用 D1 已套用全部 migration，且已有一位使用者
- **WHEN** 以 SQL 插入該使用者的一位參賽者後讀回
- **THEN** 讀回的 `data`、`sort_order`、`version`、`updated_at` 與寫入值相同
- **驗收**：`hono-pickball/test/d1-schema.test.ts`，it 名稱「matchmaker_players 可由 migration 建立並寫入讀回」

#### Scenario: 參賽者 id 只在同一使用者內唯一

- **GIVEN** 使用者 A 已有 id 為 `p1` 的參賽者
- **WHEN** 再為 A 插入 id `p1`，以及為使用者 B 插入 id `p1`
- **THEN** A 的第二筆插入失敗（PRIMARY KEY／UNIQUE constraint）；B 的插入成功
- **驗收**：`hono-pickball/test/d1-schema.test.ts`，it 名稱「同一使用者的參賽者 id 不可重複，不同使用者可使用相同 id」

#### Scenario: user_id 必須參照既有使用者

- **WHEN** 以不存在的 `user_id` 插入一位參賽者
- **THEN** 插入失敗（FOREIGN KEY constraint）
- **驗收**：`hono-pickball/test/d1-schema.test.ts`，it 名稱「matchmaker_players 的 user_id 必須參照既有使用者」

#### Scenario: 刪除使用者時連帶刪除其參賽者

- **GIVEN** 某使用者有兩位參賽者
- **WHEN** 刪除該使用者
- **THEN** `matchmaker_players` 中該 `user_id` 的筆數為 0
- **驗收**：`hono-pickball/test/d1-schema.test.ts`，it 名稱「刪除使用者時其 matchmaker_players 一併刪除」
