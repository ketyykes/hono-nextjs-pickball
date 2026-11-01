# backend-database Specification

## Purpose
後端（hono-pickball）D1 資料庫的基礎建設：D1 binding 的環境宣告範圍、`getDb` 存取入口，以及由 drizzle migration 建立的 auth 核心資料表。

## Requirements

### Requirement: D1 只宣告於本機環境，正式部署設定不含 D1

`hono-pickball/wrangler.jsonc` 的 D1 binding（`DB`）SHALL 只宣告在具名環境 `env.local` 之下；
top-level 設定（CF Dashboard Workers Builds 執行不帶 `--env` 的 `wrangler deploy` 時所用的設定）
SHALL NOT 宣告任何 `d1_databases`。

理由：本 repo push 即自動部署正式站，而 G1 之前不得建立任何遠端資源。三個替代方案皆不可行——
placeholder UUID 會讓遠端部署直接失敗；top-level 省略 `database_id` 會觸發 wrangler 的
automatic provisioning，在誤 push 時於遠端**建立** D1；先建立正式 D1 取得 UUID 屬遠端操作。

`env.local` MUST 明確宣告 `"name": "hono-pickball"`。wrangler 具名環境預設以
`<name>-<env>` 命名 worker，未覆寫時本機 worker 會變成 `hono-pickball-local`，
前端 `HONO_API → hono-pickball` 的 service binding 在 dev registry 中將找不到目標。

`env.local` SHALL NOT 填入任何看似真實的 UUID 作為 `database_id`。

#### Scenario: 正式部署設定的 dry-run 通過且不含 D1

- **WHEN** 於 repo root 執行 `pnpm --filter ./hono-pickball build`（`tsc --noEmit && wrangler deploy --dry-run`）
- **THEN** exit 0，且 dry-run 輸出的 binding 清單不含 `DB`
- **驗收**：tasks.md 指令驗收 C1（task 2.5）的實跑紀錄

#### Scenario: 本機環境的 worker 名稱維持 hono-pickball

- **WHEN** 以 `pnpm --filter ./hono-pickball dev`（即 `wrangler dev --env local`）啟動後端
- **THEN** 啟動輸出的 worker 名稱為 `hono-pickball`，且 `GET /api/health` 回 200
- **驗收**：tasks.md 指令驗收 C8（task 2.6）的實測紀錄

### Requirement: 後端以 getDb 取得 D1 的 drizzle 實例

`hono-pickball/src/db/client.ts` SHALL 匯出 `getDb(env)`，回傳以 `env.DB` 建立、帶入
`src/db/schema.ts` 全部資料表定義的 drizzle（`drizzle-orm/d1`）實例。`src/**` 內所有 D1 存取
SHALL 經由 `getDb` 取得實例，SHALL NOT 在其他地方直接呼叫 `drizzle(env.DB)`。

`env.DB` 不存在時（正式部署設定沒有 `DB`）`getDb` MUST 拋出訊息含 `DB` 的錯誤，
SHALL NOT 回傳一個在第一次查詢時才失敗的實例——misconfiguration 要在取得實例的當下現形。

#### Scenario: 取得的實例可寫入並讀回資料

- **GIVEN** 測試用 D1 已套用全部 migration
- **WHEN** 以 `getDb(env)` 對 `user` 表插入一筆資料後再以 email 查詢
- **THEN** 讀回的資料列 `id`、`name`、`email` 與寫入值相同
- **驗收**：`hono-pickball/test/db-client.test.ts`，it 名稱「getDb 回傳的實例可寫入並讀回 user 資料列」

#### Scenario: DB binding 不存在時立即拋錯

- **WHEN** 以不含 `DB` 的 env 呼叫 `getDb`
- **THEN** 拋出錯誤，且錯誤訊息含 `DB`
- **驗收**：`hono-pickball/test/db-client.test.ts`，it 名稱「DB binding 不存在時 getDb 立即拋出含 DB 字樣的錯誤」

### Requirement: auth 核心資料表由 migration 建立

`hono-pickball/src/db/schema.ts` SHALL 以 drizzle `sqliteTable` 定義 better-auth 1.6 的四張核心資料表：
`user`、`session`、`account`、`verification`（表名為單數，欄位對應 better-auth 1.6 的核心 schema；
`account` 表 SHALL NOT 含 1.7 才新增的 `issuer` 欄位）。時間欄位 SHALL 以
`integer(..., { mode: "timestamp_ms" })` 表示，布林欄位 SHALL 以 `integer(..., { mode: "boolean" })` 表示。

對應的 SQL migration SHALL 由 `drizzle-kit generate` 產生並置於 `hono-pickball/drizzle/`，
SHALL NOT 手寫或手改產出的 SQL。

`user.email` MUST 為 unique；`session.userId` 與 `account.userId` MUST 以 foreign key 參照 `user.id`
並設定 `on delete cascade`（刪除使用者時其 session 與 account 一併刪除，避免孤兒憑證）。

#### Scenario: migration 套用後四張表皆存在

- **GIVEN** 測試用 D1 已套用全部 migration
- **WHEN** 查詢 `sqlite_master` 的資料表名稱
- **THEN** 結果包含 `user`、`session`、`account`、`verification`
- **驗收**：`hono-pickball/test/d1-schema.test.ts`，it 名稱「auth 核心四張資料表皆已由 migration 建立」

#### Scenario: user.email 不可重複

- **GIVEN** `user` 表已有一筆 email 為 `a@example.com` 的資料
- **WHEN** 再插入一筆相同 email 的資料
- **THEN** 插入失敗（拋出 UNIQUE constraint 錯誤），表內該 email 仍只有一筆
- **驗收**：`hono-pickball/test/d1-schema.test.ts`，it 名稱「user.email 重複時插入失敗」

#### Scenario: 刪除使用者時連帶刪除其 session 與 account

- **GIVEN** 一位使用者擁有一筆 `session` 與一筆 `account`
- **WHEN** 刪除該使用者
- **THEN** `session` 與 `account` 中 `userId` 等於該使用者 id 的資料筆數皆為 0
- **驗收**：`hono-pickball/test/d1-schema.test.ts`，it 名稱「刪除使用者時其 session 與 account 一併刪除」

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
