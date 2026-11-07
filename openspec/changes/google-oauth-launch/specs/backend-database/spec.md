# Specification: backend-database

## REMOVED Requirements

### Requirement: D1 只宣告於本機環境，正式部署設定不含 D1

**Reason**：該 Requirement 的前提是「G1 之前不得建立任何遠端資源」。使用者已於 2026-11-07 建立正式 D1（`database_name: hono-pickball`、`database_id: 9c3a73c2-9a06-4e92-bb6d-90f9cbfda513`），
正式站上線需要 top-level 的 `DB` binding；當初三個替代方案被否決的理由（placeholder UUID 部署失敗、省略 `database_id` 會遠端自動建立 D1、建立正式 D1 屬遠端操作）在有真實 UUID 後皆不再適用。

**Migration**：由 ADDED「正式 D1 宣告於 top-level，本機 D1 維持於 env.local」取代——top-level 宣告真實 UUID 的正式 D1，`env.local` 的宣告、`"name": "hono-pickball"` 與「不填看似真實的 `database_id`」三項規則原樣保留於新 Requirement。
原 Scenario「正式部署設定的 dry-run 通過且不含 D1」改為新 Requirement 的「正式部署設定的 dry-run 列出正式 D1」；「本機環境的 worker 名稱維持 hono-pickball」原樣移入新 Requirement。

## ADDED Requirements

### Requirement: 正式 D1 宣告於 top-level，本機 D1 維持於 env.local

`hono-pickball/wrangler.jsonc` 的 top-level 設定（CF Dashboard Workers Builds 執行不帶 `--env` 的 `wrangler deploy` 時所用的設定）SHALL 宣告正式 D1：
`d1_databases` 恰一筆，`binding` 為 `DB`、`database_name` 為 `hono-pickball`、`database_id` 為 `9c3a73c2-9a06-4e92-bb6d-90f9cbfda513`、`migrations_dir` 為 `drizzle`。
`database_id` 不是機密，可進版控。

wrangler 的 bindings（`d1_databases`、`services`、`vars`）不會從 top-level 繼承到具名環境，因此 `env.local` MUST 維持自己的 `d1_databases` 宣告
（`binding` 為 `DB`、`database_name` 為 `hono-pickball-local`、`migrations_dir` 為 `drizzle`），SHALL NOT 填入任何看似真實的 UUID 作為 `database_id`；
`vitest.config.ts` 的 `wrangler.environment: "local"` 與 `wrangler dev --env local` 因此仍只使用本機 D1。

`env.local` MUST 明確宣告 `"name": "hono-pickball"`。wrangler 具名環境預設以 `<name>-<env>` 命名 worker，未覆寫時本機 worker 會變成 `hono-pickball-local`，
前端 `HONO_API → hono-pickball` 的 service binding 在 dev registry 中將找不到目標。top-level 的 `name` MUST 維持 `hono-pickball`（與 CF Dashboard 的 Worker 名稱一致）。

top-level 與 `env.local` 皆 SHALL NOT 設定 `vars`（`dev-workflow`「.dev.vars.example 列出本機所需變數且不含真值」）；正式站的 `BETTER_AUTH_SECRET`、`BETTER_AUTH_URL`、`GOOGLE_CLIENT_ID`、`GOOGLE_CLIENT_SECRET` 一律以 Worker secret 設定。

Workers Builds 的 build／deploy command SHALL NOT 帶 `--env`，且 SHALL NOT 設定 `CLOUDFLARE_ENV` 環境變數：否則部署改讀沒有 `database_id` 的 `env.local`，wrangler 的 automatic provisioning 可能在遠端**建立**一個新的 D1。
此風險 repo 內無法防範，MUST 記載於 root `README.md` 的「正式站上線步驟」並由使用者於上線前在 Dashboard 人工確認（`dev-workflow`「正式站上線步驟與遠端設定由使用者手動執行並記載於 README」）。

#### Scenario: 正式部署設定的 dry-run 列出正式 D1

- **WHEN** 於 repo root 執行 `pnpm --filter ./hono-pickball build`（`tsc --noEmit && wrangler deploy --dry-run`）
- **THEN** exit 0，且 dry-run 輸出的 binding 清單含 `env.DB`，其資料庫為 `hono-pickball`（`9c3a73c2-9a06-4e92-bb6d-90f9cbfda513`）
- **驗收**：tasks.md 指令驗收 C4 的實跑紀錄

#### Scenario: 本機環境的 worker 名稱維持 hono-pickball

- **WHEN** 以 `pnpm --filter ./hono-pickball dev`（即 `wrangler dev --env local`）啟動後端
- **THEN** 啟動輸出的 worker 名稱為 `hono-pickball`，且 `GET /api/health` 回 200
- **驗收**：tasks.md 指令驗收 C5（E2E 的 webServer 以 `/api/health` 為 readiness 探測，且前端 service binding 經 dev registry 找到 `hono-pickball`）

#### Scenario: 本機測試與 dev 仍使用 env.local 的本機 D1

- **WHEN** 檢查 `hono-pickball/wrangler.jsonc` 與 `hono-pickball/vitest.config.ts`，並執行後端單元測試
- **THEN** `env.local.d1_databases[0]` 的 `database_name` 為 `hono-pickball-local` 且不含 `database_id`，`vitest.config.ts` 的 `wrangler.environment` 為 `"local"`；既有 it「測試用 D1 已套用 TEST_MIGRATIONS 的全部 migration」通過
- **驗收**：tasks.md 指令驗收 C3 與 C10 的紀錄

## MODIFIED Requirements

### Requirement: 後端以 getDb 取得 D1 的 drizzle 實例

`hono-pickball/src/db/client.ts` SHALL 匯出 `getDb(env)`，回傳以 `env.DB` 建立、帶入
`src/db/schema.ts` 全部資料表定義的 drizzle（`drizzle-orm/d1`）實例。`src/**` 內所有 D1 存取
SHALL 經由 `getDb` 取得實例，SHALL NOT 在其他地方直接呼叫 `drizzle(env.DB)`。

`getDb` 的參數型別 MUST 允許 `DB` 為 `undefined`（例：`{ DB?: D1Database }`）：top-level 宣告正式 D1 後 `cf-typegen` 產生的 `DB` 為必填，
但遠端 binding 可能因設定錯誤而不存在，且停用與替身情境的測試會注入 `DB: undefined`。

`env.DB` 不存在時（binding 遺失或測試注入 `undefined`）`getDb` MUST 拋出訊息含 `DB` 的錯誤，
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
