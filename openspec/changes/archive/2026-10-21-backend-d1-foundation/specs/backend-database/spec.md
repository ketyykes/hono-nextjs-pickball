## ADDED Requirements

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
