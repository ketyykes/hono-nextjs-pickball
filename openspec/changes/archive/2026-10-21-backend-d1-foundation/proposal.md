# Proposal: backend-d1-foundation

## Why

「計分機制後端化」（runbook `backend-scoring-runbook-b1-b9.md`，B1～B9）要把計分板與對戰分配機的
LocalStorage 資料搬到 `hono-pickball`（Cloudflare Workers + D1）。本 change 是第一棒 **B1**：
後端目前沒有任何資料庫——`wrangler.jsonc` 的 D1 binding 被註解掉、`drizzle-orm`／`drizzle-kit`
雖已安裝但沒有被 `src/**` 匯入，也沒有能在 workerd runtime 內對 D1 套用 migration 的測試夾具。
B2（better-auth）以後的每一棒都踩在這三件事上，必須先單獨落地並驗證。

本 change 有一個硬限制：**B1～B9 禁止任何遠端 CF 操作**，且本 repo **push 即自動部署正式站**。
因此 D1 binding 的寫法必須做到「本機可用、誤 push 時正式部署既不失敗、也不在遠端建立任何資源」。

## What Changes

- `hono-pickball/wrangler.jsonc` 新增具名環境 **`env.local`**（`name` 明確覆寫為 `hono-pickball`，
  宣告 `DB` D1 binding 與 `migrations_dir`）；**top-level（正式部署所用的設定）維持不宣告 D1**。
  正式站 Workers Builds 執行的 `wrangler deploy` 不帶 `--env`，因此行為與現在完全相同。
- `hono-pickball/package.json`：`dev` 改為 `wrangler dev --env local`；新增 `db:generate`
  （`drizzle-kit generate`）與 `db:migrate:local`（`wrangler d1 migrations apply DB --local --env local`）；
  `cf-typegen` 改以 `--env-file .dev.vars.example` 產生型別，使 `worker-configuration.d.ts`
  不再隨各機器的 `.dev.vars`（gitignored）內容漂移。
- 新增 `hono-pickball/drizzle.config.ts`、`hono-pickball/src/db/schema.ts`（better-auth 1.6 的
  四張核心資料表 `user`／`session`／`account`／`verification`）與 `drizzle-kit generate`
  產出的第一支 migration（`hono-pickball/drizzle/0000_*.sql` 及 `drizzle/meta/`）。
- 新增 `hono-pickball/src/db/client.ts` 的 `getDb(env)`：回傳 drizzle D1 實例，
  `DB` binding 不存在時拋出明確錯誤（正式部署沒有 `DB`，誤用時要立刻現形而非靜默失敗）。
- 測試夾具：`vitest.config.ts` 以 `readD1Migrations` 讀 migration 並經 `miniflare.bindings`
  注入 `TEST_MIGRATIONS`，以 `wrangler.environment: "local"` 取得 `DB`；新增 setup 檔
  `test/apply-migrations.ts` 於每個測試檔開始前以 `applyD1Migrations` 套用。
- 新增 `hono-pickball/.dev.vars.example`（只列變數名與說明，不含真值；本棒只有 `ENVIRONMENT`）。
- 改寫 `hono-pickball/CLAUDE.md`：D1 binding 段落、依賴注意（解除 2026-11-12 複審期限中 drizzle 的部分）、
  測試慣例（`env` 自 `cloudflare:workers` 取得、D1 夾具）、「D1 schema／migration SQL 屬設定層」的 TDD 定案。

### 明確不做

- 不接 better-auth、不新增任何 API 端點、不讀 `ENVIRONMENT`（B2 範圍）。
- 不建立任何遠端 D1、不執行任何 `--remote` 指令（G1 範圍）。
- 不新增 npm 相依（`drizzle-orm`、`drizzle-kit`、`@cloudflare/vitest-pool-workers` 皆已安裝）。

## Capabilities

### New Capabilities

- `backend-database`：後端 D1 存取入口（`getDb`）、auth 核心資料表 schema 與 migration、
  「D1 只存在於本機環境、正式部署設定不含 D1」的部署安全約束。

### Modified Capabilities

- `dev-workflow`：
  - MODIFIED「後端測試在 workerd runtime 中執行」：補上 D1 migration 夾具與 `env` 的合法來源
    （`cloudflare:workers`；`cloudflare:test` 的 `env`／`SELF` 仍禁用）。
  - MODIFIED「後端 Hono app 必須帶入 binding 型別」：binding 清單不再為空，`DB` 型別為可選。
  - ADDED 本機 D1 migration 流程、D1 schema／migration SQL 屬設定層、`.dev.vars.example` 契約。

## Impact

- **程式碼**：`hono-pickball/{wrangler.jsonc, package.json, drizzle.config.ts, vitest.config.ts,
  worker-configuration.d.ts, .dev.vars.example, CLAUDE.md}`、`hono-pickball/src/db/**`、
  `hono-pickball/drizzle/**`、`hono-pickball/test/{apply-migrations.ts, env.d.ts, d1-schema.test.ts,
  db-client.test.ts}`。**不動** `hono-pickball/src/index.ts` 與任何前端檔案。
- **相依**：無新增；`pnpm-lock.yaml` 必須零變動。
- **部署**：正式部署設定（top-level）零變動；`pnpm --filter ./hono-pickball build`
  （`wrangler deploy --dry-run`）必須照常通過。
- **開發流程**：`pnpm dev`／`pnpm dev:api`／Playwright `webServer` 經由 `dev` script 改走 `--env local`，
  worker 名稱維持 `hono-pickball`，前端 service binding 不受影響（§1 實測）。
- **後續 change**：B2 以本棒的 `getDb`、`env.local`、測試夾具與四張資料表為前提。
