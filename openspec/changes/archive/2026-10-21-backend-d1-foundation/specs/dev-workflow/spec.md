## MODIFIED Requirements

### Requirement: 後端測試在 workerd runtime 中執行

`hono-pickball` 的單元測試 SHALL 在真正的 workerd runtime 中執行，SHALL NOT 使用 node 或 happy-dom 模擬 —— 後端程式碼依賴 Cloudflare Workers 的執行環境語意（`cloudflare:workers` 模組、binding、Request/Response 實作），在模擬環境中通過的測試不足以證明部署後可運作。

測試 MUST 放在 `hono-pickball/test/` 獨立目錄，SHALL NOT 鄰近 `src/`（與前端慣例相反）。理由有二：官方 pool 的 tsconfig 分層以 `test/` 為邊界；且 `src/` 會被 `wrangler deploy` 打包，測試檔不應混入部署產物。

設定 MUST 使用從 `@cloudflare/vitest-pool-workers` 套件根匯入的 `cloudflareTest()` Vite plugin。本版（0.16.13）不存在 `defineWorkersConfig`，`exports` 亦無 `./config` subpath。

測試 MUST 使用 `import { exports } from "cloudflare:workers"` 搭配 `exports.default.fetch()`，SHALL NOT 使用 `cloudflare:test` 模組的 `SELF` 或 `env` —— 兩者在 `@cloudflare/vitest-pool-workers/types` 中皆已標記 `@deprecated`。需要直接存取 binding（例如 D1）時，`env` MUST 自 `cloudflare:workers` 匯入（即上述 deprecated 註記所指定的替代來源）。

測試用 D1 MUST 經由 migration 夾具建立：`vitest.config.ts` 於 Node 端以套件根匯出的 `readD1Migrations()` 讀取 `hono-pickball/drizzle/` 的 migration，經 `cloudflareTest()` 的 `miniflare.bindings` 注入為 `TEST_MIGRATIONS`，並以 `wrangler.environment: "local"` 取得 `env.local` 宣告的 `DB`；`test.setupFiles` 指定的 `test/apply-migrations.ts` MUST 以 `cloudflare:test` 的 `applyD1Migrations(env.DB, env.TEST_MIGRATIONS)` 套用。測試 SHALL NOT 以手寫 `CREATE TABLE` 自建資料表——那會讓測試驗證的 schema 與 migration 脫鉤。storage 隔離單位為**測試檔**（本版已移除 `isolatedStorage` 選項），同一測試檔內的 it 共用同一份 D1 資料，測試 MUST 自行使用不互相衝突的資料（例如各自的 email）。

#### Scenario: 後端測試可在 workerd runtime 中取得 worker

- **WHEN** 執行 `pnpm --filter ./hono-pickball test --run test/smoke.test.ts`
- **THEN** 測試通過，且 `exports.default.fetch` 為可呼叫的函式
- **驗收**：`hono-pickball/test/smoke.test.ts`，it 名稱「可在 workerd runtime 中執行並存取 Hono worker」

#### Scenario: 測試檔位於獨立的 test/ 目錄

- **WHEN** 列出 `hono-pickball/` 下的測試檔
- **THEN** 全部位於 `test/` 目錄，`src/` 下不存在任何 `*.test.ts`

#### Scenario: 受限沙箱中的失敗不得被誤判為設定錯誤

- **GIVEN** 執行環境禁止程序監聽 localhost
- **WHEN** 執行後端測試
- **THEN** 會出現 `listen EPERM: operation not permitted 127.0.0.1`（miniflare 需開 localhost server）
- **AND** 此為環境限制而非設定錯誤，處置方式是放行後重跑，SHALL NOT 因此修改 `vitest.config.ts`

#### Scenario: 測試用 D1 已由夾具套用全部 migration

- **WHEN** 任一測試檔開始執行
- **THEN** `env.DB` 的 `d1_migrations` 表記錄的 migration 名稱與 `env.TEST_MIGRATIONS` 的名稱清單完全一致
- **驗收**：`hono-pickball/test/d1-schema.test.ts`，it 名稱「測試用 D1 已套用 TEST_MIGRATIONS 的全部 migration」

### Requirement: 後端 Hono app 必須帶入 binding 型別

`hono-pickball/src/index.ts` 的 Hono 實例 SHALL 宣告為 `new Hono<{ Bindings: CloudflareBindings }>()`，使 `c.env` 具備由 `wrangler types` 產生的型別。

`CloudflareBindings` 為 `worker-configuration.d.ts` 宣告的全域介面，SHALL NOT 額外 import。改動 `wrangler.jsonc` 後 MUST 重跑 `pnpm cf-typegen`（root `.claude/settings.json` 已有 PostToolUse hook 自動觸發）。

`cf-typegen` MUST 以 `--env-file .dev.vars.example` 產生型別：預設行為會讀取各機器自己的 `.dev.vars`（gitignored），使 commit 進版控的 `worker-configuration.d.ts` 隨開發者本機內容漂移。

`DB` 只宣告於 `env.local`（見 `backend-database` capability），`wrangler types` 對「並非所有環境都有」的 binding 產生可選型別，因此 `CloudflareBindings` 的 `DB` MUST 為 `DB?: D1Database`；程式碼 SHALL NOT 以非空斷言（`!`）繞過，一律經 `getDb(env)` 取得實例。

此為型別層要求，SHALL NOT 以單元測試驗收 —— 泛型化與型別產生不改變 runtime 行為，用 `@ts-expect-error` 湊出的「型別測試」是空測試。驗收方式為 `typecheck` exit 0 與檢查產出檔內容。

#### Scenario: Hono 實例帶入 CloudflareBindings

- **WHEN** 檢查 `hono-pickball/src/index.ts` 的 Hono 建構
- **THEN** 為 `new Hono<{ Bindings: CloudflareBindings }>()`，且檔案未 import `CloudflareBindings`

#### Scenario: 型別檢查通過

- **WHEN** 執行 `pnpm --filter ./hono-pickball typecheck`
- **THEN** exit 0

#### Scenario: 產出的型別中 DB 為可選且不受本機 .dev.vars 影響

- **WHEN** 在本機 `.dev.vars` 存在與不存在兩種狀態下各執行一次 `pnpm --filter ./hono-pickball cf-typegen`
- **THEN** 兩次產出的 `worker-configuration.d.ts` 內容相同，且含 `DB?: D1Database`
- **驗收**：tasks.md §2 的實測紀錄（兩次產出以 `git diff --exit-code` 比對）

## ADDED Requirements

### Requirement: 本機 D1 migration 流程

`hono-pickball/package.json` SHALL 提供：

- `db:generate`：`drizzle-kit generate`，依 `drizzle.config.ts`（`dialect: "sqlite"`、`schema: "./src/db/schema.ts"`、`out: "./drizzle"`，不設 `driver` 與 `dbCredentials`）產生 SQL migration
- `db:migrate:local`：`wrangler d1 migrations apply DB --local --env local`
- `dev`：`wrangler dev --env local`

`env.local` 的 `d1_databases[0].migrations_dir` MUST 為 `drizzle`，使 wrangler 與測試夾具讀取同一份 migration。

任何指令 SHALL NOT 帶 `--remote`；遠端 D1 的建立與 migration 屬 G1。

`drizzle/` 下的 SQL 與 `meta/` SHALL 與 `src/db/schema.ts` 保持一致：commit 前執行 `db:generate` MUST 不產生新檔案。

#### Scenario: migration 可從零套用到本機 D1

- **GIVEN** 刪除 `hono-pickball/.wrangler/state` 下的本機 D1 資料
- **WHEN** 執行 `pnpm --filter ./hono-pickball db:migrate:local`
- **THEN** exit 0，且 `wrangler d1 execute DB --local --env local --command "SELECT name FROM sqlite_master WHERE type='table'"` 列出 `user`、`session`、`account`、`verification`
- **驗收**：tasks.md §5 的實測紀錄

#### Scenario: schema 與 migration 無漂移

- **WHEN** 在已 commit 的狀態下執行 `pnpm --filter ./hono-pickball db:generate`
- **THEN** drizzle-kit 回報沒有 schema 變更，`git status --porcelain -- hono-pickball/drizzle` 為空
- **驗收**：tasks.md §5 的實測紀錄

### Requirement: D1 schema 與 migration SQL 屬設定層

`hono-pickball/src/db/schema.ts` 的資料表宣告與 `hono-pickball/drizzle/**` 的 migration SQL SHALL 視為**設定層**：
撰寫或修改時不強制 TDD 紅燈（宣告式內容沒有分支可言，且 SQL 由工具產生）。

但設定層 MUST 被至少一條在 workerd 中對 D1 實際讀寫的測試覆蓋：每新增一張資料表，同一 change 內
MUST 有測試證明該表可經 migration 建立並被寫入讀回；schema 上的約束（unique、foreign key、cascade）
MUST 各有測試。讀寫這些資料表的 `src/**` 行為邏輯（查詢、驗證、授權）照常適用 TDD 三步。

此規則 MUST 寫入 `hono-pickball/CLAUDE.md`。

#### Scenario: CLAUDE.md 記載設定層例外與其覆蓋義務

- **WHEN** 檢查 `hono-pickball/CLAUDE.md`
- **THEN** 存在段落說明 `src/db/schema.ts` 與 `drizzle/**` 屬設定層免紅燈，且同時寫明「每張表與每個約束須有 D1 讀寫測試覆蓋」

### Requirement: .dev.vars.example 列出本機所需變數且不含真值

`hono-pickball/.dev.vars.example` SHALL 列出本機 `wrangler dev` 所需的每一個變數名稱與用途說明，
值 MUST 為示意值或空值，SHALL NOT 含任何真實密碼或 secret。`.dev.vars` 維持 gitignored。

`ENVIRONMENT` SHALL 只出現在 `.dev.vars`（範例值 `development`），`wrangler.jsonc` 的 top-level 與
`env.local` 皆 SHALL NOT 以 `vars` 設定它——遠端環境沒有 `.dev.vars`，缺值即代表非開發環境。

#### Scenario: 範例檔存在且 wrangler.jsonc 不設 ENVIRONMENT

- **WHEN** 檢查 `hono-pickball/.dev.vars.example` 與 `hono-pickball/wrangler.jsonc`
- **THEN** 前者含 `ENVIRONMENT=development` 一行與說明註解；後者的 top-level 與 `env.local` 皆不存在 `vars` 鍵（註解中提及不算）
