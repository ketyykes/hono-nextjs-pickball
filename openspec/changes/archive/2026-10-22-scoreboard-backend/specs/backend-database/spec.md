## ADDED Requirements

### Requirement: 計分板目前比賽資料表由 migration 建立

`hono-pickball/src/db/schema.ts` SHALL 以 drizzle `sqliteTable` 定義 `scoreboard_current`（`user-data-sync`「使用者資料表的命名與欄位慣例」的第一張表）：

| 欄位 | 型別 | 約束 |
|---|---|---|
| `user_id` | `text` | 主鍵；foreign key 參照 `user.id`，`on delete cascade` |
| `data` | `text`（drizzle `mode: "json"`，型別為核心套件的 `ScoreboardState`） | not null |
| `version` | `integer` | not null |
| `updated_at` | `integer`（`timestamp_ms`） | not null |

對應的 SQL migration SHALL 由 `pnpm --filter ./hono-pickball db:generate` 產生（`drizzle/0001_*.sql` 與 `drizzle/meta/` 的 snapshot），
SHALL NOT 手寫或手改產出的 SQL；產生後再執行一次 `db:generate` MUST 不產生新檔案。`USER_DATA_TABLES` MUST 含 `scoreboard_current`。

#### Scenario: scoreboard_current 可寫入並讀回

- **GIVEN** 測試用 D1 已套用全部 migration，且已有一位使用者
- **WHEN** 以 SQL 插入該使用者的一列（`data` 為 JSON 字串、`version` 1）後讀回
- **THEN** 讀回的 `data`、`version`、`updated_at` 與寫入值相同
- **驗收**：`hono-pickball/test/d1-schema.test.ts`，it 名稱「scoreboard_current 可由 migration 建立並寫入讀回」

#### Scenario: 同一使用者只能有一列

- **GIVEN** 某使用者在 `scoreboard_current` 已有一列
- **WHEN** 再插入同一 `user_id` 的一列
- **THEN** 插入失敗（PRIMARY KEY／UNIQUE constraint），該使用者仍只有一列
- **驗收**：`hono-pickball/test/d1-schema.test.ts`，it 名稱「同一使用者在 scoreboard_current 只能有一列」

#### Scenario: user_id 必須參照既有使用者

- **WHEN** 以不存在的 `user_id` 插入一列
- **THEN** 插入失敗（FOREIGN KEY constraint）
- **驗收**：`hono-pickball/test/d1-schema.test.ts`，it 名稱「scoreboard_current 的 user_id 必須參照既有使用者」

#### Scenario: 刪除使用者時連帶刪除其計分板

- **GIVEN** 某使用者在 `scoreboard_current` 有一列
- **WHEN** 刪除該使用者
- **THEN** `scoreboard_current` 中該 `user_id` 的筆數為 0
- **驗收**：`hono-pickball/test/d1-schema.test.ts`，it 名稱「刪除使用者時其 scoreboard_current 一併刪除」
