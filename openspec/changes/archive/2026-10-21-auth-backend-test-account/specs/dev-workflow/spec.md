## MODIFIED Requirements

### Requirement: 後端測試在 workerd runtime 中執行

`hono-pickball` 的單元測試 SHALL 在真正的 workerd runtime 中執行，SHALL NOT 使用 node 或 happy-dom 模擬 —— 後端程式碼依賴 Cloudflare Workers 的執行環境語意（`cloudflare:workers` 模組、binding、Request/Response 實作），在模擬環境中通過的測試不足以證明部署後可運作。

測試 MUST 放在 `hono-pickball/test/` 獨立目錄，SHALL NOT 鄰近 `src/`（與前端慣例相反）。理由有二：官方 pool 的 tsconfig 分層以 `test/` 為邊界；且 `src/` 會被 `wrangler deploy` 打包，測試檔不應混入部署產物。

設定 MUST 使用從 `@cloudflare/vitest-pool-workers` 套件根匯入的 `cloudflareTest()` Vite plugin。本版（0.16.13）不存在 `defineWorkersConfig`，`exports` 亦無 `./config` subpath。

測試 MUST 使用 `import { exports } from "cloudflare:workers"` 搭配 `exports.default.fetch()`，SHALL NOT 使用 `cloudflare:test` 模組的 `SELF` 或 `env` —— 兩者在 `@cloudflare/vitest-pool-workers/types` 中皆已標記 `@deprecated`。需要直接存取 binding（例如 D1）時，`env` MUST 自 `cloudflare:workers` 匯入（即上述 deprecated 註記所指定的替代來源）。

唯一的例外：需要以**不同 env** 執行同一請求的測試（例如 `ENVIRONMENT` 缺值、非 development、`DB` 不存在或為替身）MUST 以 `import app from "../src/index"` 後 `app.request(path, init, env)` 傳入覆寫後的 env——`exports.default` 綁定的 env 由 pool 固定，無法逐測試改變。其餘測試仍 MUST 走 `exports.default.fetch()`。測試所需的固定 binding 值（例如 `ENVIRONMENT`、`BETTER_AUTH_SECRET`、`BETTER_AUTH_URL`）MUST 由 `vitest.config.ts` 的 `miniflare.bindings` 注入測試專用值，測試結果 SHALL NOT 依賴開發者本機的 `.dev.vars`。

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

#### Scenario: 需要不同 env 的測試以 app.request 注入

- **WHEN** 檢查 `hono-pickball/test/` 中斷言「停用」「缺值」或使用替身 `DB` 的測試
- **THEN** 它們皆以 `app.request(path, init, env)` 傳入覆寫後的 env，未修改 `vitest.config.ts` 的全域 binding
- **驗收**：`hono-pickball/test/auth-gating.test.ts`、`hono-pickball/test/auth-session.test.ts`（Stage 1 Reviewer 逐檔核對）

## ADDED Requirements

### Requirement: 測試帳號 seed 與本機 auth 變數

`hono-pickball/package.json` SHALL 提供 `db:seed:local`：`node scripts/seed-test-account.ts`（Node 22.22 內建 type stripping，
不新增 `tsx` 等相依）。本機建立可登入環境的完整步驟為 `db:migrate:local` → `db:seed:local`，SHALL 記載於 `hono-pickball/CLAUDE.md`。

`hono-pickball/.dev.vars.example` MUST 列出下列變數（示意值，不含真值）與用途說明：
`ENVIRONMENT`、`BETTER_AUTH_SECRET`、`BETTER_AUTH_URL`（本機為 `http://localhost:3005`，前端 origin）、
`TEST_ACCOUNT_EMAIL`、`TEST_ACCOUNT_PASSWORD`、`TEST_ACCOUNT_NAME`。`GOOGLE_CLIENT_ID`／`GOOGLE_CLIENT_SECRET` 屬 G1，本批不列。

後端測試注入 env 的方式見 MODIFIED「後端測試在 workerd runtime 中執行」。

#### Scenario: seed 指令可在本機建立可登入的測試帳號

- **GIVEN** `.dev.vars` 含 `ENVIRONMENT=development` 與三個 `TEST_ACCOUNT_*`，已執行 `db:migrate:local`
- **WHEN** 執行 `pnpm --filter ./hono-pickball db:seed:local`，接著以 `pnpm --filter ./hono-pickball dev` 啟動後端並對 `http://localhost:8787/api/auth/sign-in/email` 送出該帳密（帶 `Origin: http://localhost:3005`）
- **THEN** seed exit 0；登入回 200
- **驗收**：tasks.md 指令驗收 C4 的實測紀錄

#### Scenario: 缺少帳密變數時 seed 以非 0 結束

- **GIVEN** `.dev.vars` 缺 `TEST_ACCOUNT_PASSWORD`
- **WHEN** 執行 `pnpm --filter ./hono-pickball db:seed:local`
- **THEN** exit code 非 0，輸出指出缺少 `TEST_ACCOUNT_PASSWORD`，且未呼叫 wrangler
- **驗收**：tasks.md 指令驗收 C5 的實測紀錄

#### Scenario: 後端測試結果不受本機 .dev.vars 影響

- **WHEN** 在 `.dev.vars` 存在（`ENVIRONMENT=development`）與不存在兩種狀態下各跑一次 `pnpm --filter ./hono-pickball test`
- **THEN** 兩次的通過測試數相同且皆全綠
- **驗收**：tasks.md 指令驗收 C6 的實測紀錄
