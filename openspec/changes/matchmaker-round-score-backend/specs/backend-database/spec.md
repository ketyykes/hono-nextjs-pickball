## ADDED Requirements

### Requirement: 對戰分配機回合、分槽、歷史與整批守衛資料表由 migration 建立

`hono-pickball/src/db/schema.ts` SHALL 以 drizzle `sqliteTable` 定義下列四張表（皆遵循 `user-data-sync`「使用者資料表的命名與欄位慣例」：
`user_id text not null` 以 foreign key 參照 `user.id` 並 `on delete cascade`；`version integer not null`；`updated_at integer`（`timestamp_ms`）not null）：

| 表 | 主鍵 | 其他欄位 | 用途 |
|---|---|---|---|
| `matchmaker_round` | `user_id` | `data text`（json，核心套件 `Round`）not null | 每位使用者一筆目前回合 |
| `matchmaker_match_slots` | `(user_id, match_id)` | `match_id text` not null；`data text`（json，核心套件 `ScoreboardState`）not null | 對戰場次的計分板分槽 |
| `matchmaker_history` | `(user_id, match_id)` | `match_id text` not null；`played_at integer`（`timestamp_ms`）not null；`data text`（json，核心套件 `MatchHistoryEntry`）not null | 歷史賽果；`played_at` 拆欄供 B8 依區間查詢與排序 |
| `sync_batch_guards` | `user_id` | （無） | 整批守衛（`user-data-sync`「後端多表寫入以單一 batch 與整批守衛完成」），平時恆為空 |

`matchmaker_history` 以 `(user_id, match_id)` 為主鍵：場次 id 為前端產生的 UUID，同一場次只會完成一次（`round-lifecycle`「比分送出的完成流程」），
主鍵是重複寫入的第二道防線。`matchmaker_history.version` 恆為 `1`（歷史只增不改），保留此欄是為了符合欄位慣例與 E2E 清空的單一來源。

對應的 SQL migration SHALL 由 `pnpm --filter ./hono-pickball db:generate` 產生（`drizzle/0003_*.sql` 與 meta），SHALL NOT 手寫或手改；產生後再執行一次 MUST 不產生新檔案。
`USER_DATA_TABLES` MUST 含這四張表（`sync_batch_guards` 也列入：它有 `user_id` 且 cascade，E2E 清空時一併處理不會有副作用，漏列則會使雙向守衛轉紅）。

#### Scenario: 四張新表可寫入並讀回

- **GIVEN** 測試用 D1 已套用全部 migration，且已有一位使用者
- **WHEN** 以 SQL 對四張表各插入一列後讀回
- **THEN** 讀回的各欄位與寫入值相同
- **驗收**：`hono-pickball/test/d1-schema.test.ts`，it 名稱「matchmaker_round、matchmaker_match_slots、matchmaker_history 與 sync_batch_guards 可由 migration 建立並寫入讀回」

#### Scenario: 回合每位使用者只有一筆、分槽與歷史的場次 id 只在同一使用者內唯一

- **GIVEN** 使用者 A 已有一筆回合、場次 `m1` 的分槽與歷史
- **WHEN** 再為 A 插入回合、`m1` 的分槽與 `m1` 的歷史，以及為使用者 B 插入相同的三列
- **THEN** A 的三次插入皆失敗（PRIMARY KEY／UNIQUE constraint）；B 的插入皆成功
- **驗收**：`hono-pickball/test/d1-schema.test.ts`，it 名稱「回合每位使用者一筆，分槽與歷史的 match_id 只在同一使用者內唯一」

#### Scenario: 守衛表的 version 不可為 NULL

- **WHEN** 以 `version` 為 `NULL` 插入 `sync_batch_guards`
- **THEN** 插入失敗（NOT NULL constraint）
- **驗收**：`hono-pickball/test/d1-schema.test.ts`，it 名稱「sync_batch_guards 的 version 不可為 NULL」

#### Scenario: 刪除使用者時連帶刪除其回合、分槽與歷史

- **GIVEN** 某使用者在三張 matchmaker 新表各有資料
- **WHEN** 刪除該使用者
- **THEN** 三張表中該 `user_id` 的筆數皆為 0
- **驗收**：`hono-pickball/test/d1-schema.test.ts`，it 名稱「刪除使用者時其回合、分槽與歷史一併刪除」
