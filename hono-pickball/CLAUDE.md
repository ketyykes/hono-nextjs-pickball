# CLAUDE.md

本檔描述 **hono-pickball workspace**（monorepo 後端）：Hono 4 API on Cloudflare Workers。**所有後端邏輯（含未來的 better-auth、drizzle、D1）都放這裡**，不要寫進前端的 API route。

> ⚠️ 範圍例外：matchmaker（對戰分配機）依 root `prd.md` 明定為 **LocalStorage-only 純前端功能**，
> 引擎與名單邏輯**刻意**放在 `nextjs-pickball/lib/matchmaker/` —— 那不是待搬進來的「後端邏輯」。

以下指令除特別標註外皆假設 cwd 在 `hono-pickball/`；從 repo root 執行請用 `pnpm --filter ./hono-pickball <script>`。

## 常用指令

- `pnpm dev` — `wrangler dev --env local`（http://localhost:8787）；走 `--env local` 才有本機 D1 binding（`DB`）
- `pnpm db:generate` — `drizzle-kit generate`，由 `src/db/schema.ts` 產生 `drizzle/` 下的 migration；commit 前執行必須不產生新檔案（schema 與 migration 不得漂移）
- `pnpm db:migrate:local` — `wrangler d1 migrations apply DB --local --env local`；首次 clone 或 `drizzle/` 變更後執行一次。**任何指令都不得帶 `--remote`**，遠端 D1 的建立與 migration 屬後續 G1
- `pnpm test` — Vitest（在真正的 workerd runtime 中執行）；單檔用 `pnpm --filter ./hono-pickball test --run test/<檔>.test.ts`（**`--run` 前不可加 `--`**）
- `pnpm typecheck` — `tsc --noEmit` + `tsc --noEmit -p test/tsconfig.json`（**兩段都要**：workspace tsconfig 的 include 不含 test/，root 的 `pnpm typecheck` 與 Stop hook 也都查不到 test/ 的型別）
- `pnpm build` — `tsc --noEmit && wrangler deploy --dry-run`；兩段互補：前者抓型別但抓不到打包錯，後者走真 esbuild 打包並驗證 wrangler.jsonc 但不做型別檢查
- `pnpm run deploy` — `wrangler deploy --minify` 手動部署（注意：`deploy` 與 pnpm 內建指令撞名，必須加 `run`）；**正式部署走 CF Dashboard Workers Builds（Git 整合），平常不手動 deploy**
- `pnpm cf-typegen` — 重新產生 `CloudflareBindings` 型別（`worker-configuration.d.ts`）；改 `wrangler.jsonc` 後 root `.claude/settings.json` 的 PostToolUse hook 會自動重跑，不必手動；此指令讀 `.dev.vars.example`（不是各機的 `.dev.vars`），所以產出不受個人環境影響

## wrangler.jsonc 要點

- `name: "hono-pickball"` **必須與 CF Dashboard 的 Worker 名稱一致**，否則 Workers Builds 會失敗
- `compatibility_flags: ["nodejs_compat"]` 已開啟（better-auth / drizzle 依賴 node:crypto 等模組）
- D1 只在 `env.local`（binding `DB`、`database_name: "hono-pickball-local"`、`migrations_dir: "drizzle"`，刻意不填 `database_id`）；**top-level 不得宣告 `d1_databases`**，正式 D1 於 G1 以 `wrangler d1 create` 產生的真實 UUID 宣告。placeholder UUID 會讓遠端部署失敗，top-level 省略 `database_id` 則可能在誤 push 時遠端自動建立 D1
- `env.local` 必須明確 `"name": "hono-pickball"`，否則 dev registry 名稱變 `hono-pickball-local`，前端 service binding 找不到
- ⚠️ CF Dashboard 的 Workers Builds **不得設定 `CLOUDFLARE_ENV` 環境變數，deploy command 也不得帶 `--env`**；否則部署會改讀沒有 `database_id` 的 `env.local`。此風險 repo 內無法防範
- `ENVIRONMENT` 只放 `.dev.vars`（範例見 `.dev.vars.example`，值 `development`），`wrangler.jsonc` 的 top-level 與 `env.local` 皆不設 `vars`；遠端沒有 `.dev.vars`，缺值即代表非開發環境。其型別為必填 `string` 但遠端實際為 `undefined`，讀取時只用 `env.ENVIRONMENT === "development"` 這種等值比較

## D1 schema 與 migration SQL 屬設定層

- `src/db/schema.ts` 的資料表宣告與 `drizzle/**` 的 migration SQL 視為**設定層**：宣告式內容沒有分支、SQL 由工具產生，撰寫或修改時**不強制 TDD 紅燈**
- **覆蓋義務**：設定層必須被至少一條在 workerd 中對 D1 實際讀寫的測試覆蓋——每新增一張資料表，同一 change 內須有測試證明該表可經 migration 建立並被寫入讀回；schema 上的每個約束（unique、foreign key、cascade）也須各有測試
- 讀寫這些資料表的 `src/**` 行為邏輯（查詢、驗證、授權）**照常適用 TDD 三步**
- D1 一律經 `src/db/client.ts` 的 `getDb(env)` 取得，缺 `DB` binding 時會拋錯

## 測試慣例

- 測試放 **`test/` 獨立目錄**（與前端「鄰近程式碼」的慣例不同）。理由：(a) 官方 pool 的 tsconfig 分層以 `test/` 為邊界，(b) `src/` 會被 `wrangler deploy` 打包，測試檔不該混入
- `vitest.config.ts` 用 **`cloudflareTest()` plugin 從套件根匯入**；本版（0.16.13）**沒有 `defineWorkersConfig`、也沒有 `./config` subpath**，照抄舊版官方範例會 import 失敗
- 用 `import { exports } from "cloudflare:workers"` 搭配 `exports.default.fetch()`；**不要用 `cloudflare:test` 的 `SELF` / `env`**——兩者在套件的 `@cloudflare/vitest-pool-workers/types`（`cloudflare-test.d.ts`，經 `test/tsconfig.json` 的 `types` 引入，非本 workspace 的檔案）皆已標 `@deprecated`。需直接存取 binding（如 D1）時，`env` 自 `cloudflare:workers` 匯入
- **D1 夾具**：`vitest.config.ts` 以 `readD1Migrations` 讀 `drizzle/`，經 `miniflare.bindings.TEST_MIGRATIONS` 注入，`wrangler.environment` 設 `"local"` 取得 `DB`，`setupFiles` 的 `test/apply-migrations.ts` 以 `applyD1Migrations` 套用。測試**不得手寫 `CREATE TABLE`**，一律走 migration
- **storage 以測試檔隔離**（本版已無 `isolatedStorage`）：同一測試檔內的 it 共用同一份 D1 資料，測試須自行使用不互相衝突的資料
- `DB` 在型別上為可選，測試／setup 以 `if (!env.DB) throw ...` 處理，不用 `!`
- `.dev.vars` 會被 vitest pool 讀取（輸出可見 `Using secrets defined in .dev.vars`）；目前測試不讀任何 var
- 測試檔頂部要 `import "../src/index"`，`src/` 改動時才會自動重跑
- 刻意不開 `globals`：一律顯式 `import { describe, it, expect } from "vitest"`，避免 workerd 全域污染
- ⚠️ 在受限沙箱中跑會噴 `listen EPERM: operation not permitted 127.0.0.1` —— 是 miniflare 需要開 localhost server 被擋，**不是設定錯誤**，放行後重跑即可
- ⚠️ `setCookie` 會對 ISO 字串的 `:` 做 percent-encoding；比對 cookie 值時要先 `decodeURIComponent`

## 路由約定

- 對外 API **一律掛在 `/api/*` 之下**——Next.js 端的 catch-all proxy（`app/api/[[...route]]/route.ts`）只轉發 `/api/*`，掛在其他路徑的端點前端打不到
- **root path（`GET /`）刻意不定義，回 404 是預期行為**，不代表部署失敗。原本的 `Hello Hono!` 樣板已於 change `backend-cleanup-and-tdd-enablement` 移除（驗收：`test/routing.test.ts`）
- 現有測試端點：
  - `GET /api/health` — 部署冒煙測試，驗證 Next.js → service binding → Hono 的通路正常
  - `GET /api/cookie-check` — 驗證 Set-Cookie 能經 service binding 原樣穿透回瀏覽器（呼叫兩次即可確認來回都通；未來 better-auth 依賴此行為）

## 依賴注意

- `drizzle-orm` 已被 `src/db/**` 匯入，**不再受下述複審限制**；`drizzle-kit`（devDependencies，CLI 工具本該如此）已由 `db:generate` 使用
- `better-auth`、`@better-auth/drizzle-adapter`、`@hono/zod-validator`、`zod`、`date-fns` 在 dependencies，但**仍未被 `src/**` 匯入**，為未來會員／揪團功能預先安裝（B2 起接上）
- **保留而非移除的理由**：`wrangler deploy --dry-run` 實測產物為 gzip **16.91 KiB**，離 CF Free plan 的 3 MiB 上限餘裕極大；體積沒有壓力時，移除的收益低於日後重裝的摩擦
- **複審期限：2026-11-12**。屆時若上述未匯入的套件仍未被 `src/**` 匯入，開 change 移除（決策 D5）
- `@cloudflare/vitest-pool-workers` 與 `vitest` 不屬上述範圍——已於 change `backend-cleanup-and-tdd-enablement` 實際啟用
