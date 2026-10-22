# CLAUDE.md

本檔描述 **hono-pickball workspace**（monorepo 後端）：Hono 4 API on Cloudflare Workers。**所有後端邏輯（含 better-auth、drizzle、D1）都放這裡**，不要寫進前端的 API route。

> ⚠️ 範圍例外：計分板（`/scoreboard`）已部分上雲（B5：登入且未綁定場次時以雲端為準，路由見 `src/routes/scoreboard.ts`）；
> matchmaker（對戰分配機）的**參賽者名單已上雲**（B6：`src/routes/matchmaker.ts`，表 `matchmaker_players`）。
> **回合、歷史、場次分槽仍為前端 LocalStorage**，待 B7、B8，在那之前不是待搬進來的「後端邏輯」；
> 引擎純邏輯（分配、評分等）在 `@pickball/core`。

以下指令除特別標註外皆假設 cwd 在 `hono-pickball/`；從 repo root 執行請用 `pnpm --filter ./hono-pickball <script>`。

後端可匯入 `@pickball/core`（`workspace:*`；前後端共用的純邏輯與契約，見 [`packages/pickball-core/CLAUDE.md`](../packages/pickball-core/CLAUDE.md)）。`src/**` 已於 B5 起匯入（如 `@pickball/core/api/versioned`、`@pickball/core/api/errors`、`@pickball/core/api/user-data-tables`）；匯入不需額外的 wrangler／tsconfig 設定（`test/pickball-core-import.test.ts` 證明 workerd 測試可解析，`wrangler deploy --dry-run` 證明 esbuild 可打包）。

## 常用指令

- `pnpm dev` — `wrangler dev --env local`（http://localhost:8787）；走 `--env local` 才有本機 D1 binding（`DB`）
- `pnpm db:generate` — `drizzle-kit generate`，由 `src/db/schema.ts` 產生 `drizzle/` 下的 migration；commit 前執行必須不產生新檔案（schema 與 migration 不得漂移）
- `pnpm db:migrate:local` — `wrangler d1 migrations apply DB --local --env local`；首次 clone 或 `drizzle/` 變更後執行一次。**任何指令都不得帶 `--remote`**，遠端 D1 的建立與 migration 屬後續 G1
- `pnpm db:seed:local` — `node scripts/seed-test-account.ts`（Node 22 內建 type stripping，不需 `tsx`）；把 `.dev.vars` 的 `TEST_ACCOUNT_*` 寫入本機 D1。只讀 `.dev.vars`（以 `parseEnv` 解析，shell 已 export 的同名變數不影響）、只寫本機 D1（`--local --env local`），**不得帶 `--remote`**；重複執行會先刪除同 email 的 user（cascade 刪其 session）再重建。可在 `wrangler dev` 執行中跑，結果立即可見
- `pnpm test` — Vitest（在真正的 workerd runtime 中執行）；單檔用 `pnpm --filter ./hono-pickball test --run test/<檔>.test.ts`（**`--run` 前不可加 `--`**）
- `pnpm typecheck` — `tsc --noEmit` + `tsc --noEmit -p test/tsconfig.json`（**兩段都要**：workspace tsconfig 的 include 不含 test/，root 的 `pnpm typecheck` 與 Stop hook 也都查不到 test/ 的型別）
- `pnpm build` — `tsc --noEmit && wrangler deploy --dry-run`；兩段互補：前者抓型別但抓不到打包錯，後者走真 esbuild 打包並驗證 wrangler.jsonc 但不做型別檢查
- `pnpm run deploy` — `wrangler deploy --minify` 手動部署（注意：`deploy` 與 pnpm 內建指令撞名，必須加 `run`）；**正式部署走 CF Dashboard Workers Builds（Git 整合），平常不手動 deploy**
- `pnpm cf-typegen` — 重新產生 `CloudflareBindings` 型別（`worker-configuration.d.ts`）；改 `wrangler.jsonc` 後 root `.claude/settings.json` 的 PostToolUse hook 會自動重跑，不必手動；此指令讀 `.dev.vars.example`（不是各機的 `.dev.vars`），所以產出不受個人環境影響

## 本機登入準備

首次 clone 或換機器後，依序：

1. `cp .dev.vars.example .dev.vars`，補齊 `ENVIRONMENT`、`BETTER_AUTH_SECRET`、`BETTER_AUTH_URL`（`http://localhost:3005`）、`TEST_ACCOUNT_EMAIL`、`TEST_ACCOUNT_PASSWORD`、`TEST_ACCOUNT_NAME`；`.dev.vars.example` 只放示意值，**真實帳密與 secret 不得寫入任何會 commit 的檔案**
2. `pnpm db:migrate:local`
3. `pnpm db:seed:local`

`ENVIRONMENT` 不是 `"development"` 時 auth 整組停用（見「路由約定」），所以缺 `.dev.vars` 的環境無法登入是預期行為。

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
- vitest pool 會讀 `.dev.vars`（輸出可見 `Using secrets defined in .dev.vars`），但 `vitest.config.ts` 的 `miniflare.bindings` 注入了 `ENVIRONMENT`、`BETTER_AUTH_SECRET`（假值）、`BETTER_AUTH_URL`，且實測注入值優先於 `.dev.vars`；測試結果不依賴 `.dev.vars`（有／無該檔各跑一次，通過數相同，C6 已驗證）
- **gating／替身情境的例外**：預設走 `exports.default.fetch()`，但要驗證停用（`ENVIRONMENT` 非 `"development"`）或替換 env 時，改用 `app.request(path, init, { ...env, 覆寫 })` 注入 env，因為 `exports` 無法逐次覆寫 binding
- 測試或 curl 呼叫 `POST /api/auth/*` 一律帶 `Origin`（屬於 trustedOrigins）：經前端 proxy 不帶會回 403；直打後端且不帶 cookie 時 better-auth 不檢查 Origin，不帶也會過，但不要依賴這個差異
- 測試檔頂部要 `import "../src/index"`，`src/` 改動時才會自動重跑
- 刻意不開 `globals`：一律顯式 `import { describe, it, expect } from "vitest"`，避免 workerd 全域污染
- ⚠️ 在受限沙箱中跑會噴 `listen EPERM: operation not permitted 127.0.0.1` —— 是 miniflare 需要開 localhost server 被擋，**不是設定錯誤**，放行後重跑即可
- ⚠️ `setCookie` 會對 ISO 字串的 `:` 做 percent-encoding；比對 cookie 值時要先 `decodeURIComponent`

## 路由約定

- 對外 API **一律掛在 `/api/*` 之下**——Next.js 端的 catch-all proxy（`app/api/[[...route]]/route.ts`）只轉發 `/api/*`，掛在其他路徑的端點前端打不到
- **root path（`GET /`）刻意不定義，回 404 是預期行為**，不代表部署失敗。原本的 `Hello Hono!` 樣板已於 change `backend-cleanup-and-tdd-enablement` 移除（驗收：`test/routing.test.ts`）
- **auth 與 session 端點**（better-auth 1.6，email／password，註冊停用）：
  - `/api/auth/*`（GET、POST）— better-auth handler；`GET /api/me` — 回 `{ user: { id, email, name } }`，未登入 401。兩者都掛共用 middleware `localAuth`（gate → `createAuth` → `c.set("auth")`）。**停用時（`ENVIRONMENT` 非 `"development"`）回 404，不建立 auth、不碰 D1**
  - `GET /api/session` — 狀態探針，**不掛 gate，永遠 200** `{ authEnabled, user }`；停用時 `authEnabled: false`、`user: null`，查詢例外降級為 `user: null` 並 `console.error`。**SHALL NOT 作為授權依據**；受保護端點一律掛 `localAuth, requireSession`
- **使用者資料 API**（B5 起；新 feature 如 B6～B9 一律照此做）：
  - 結構：`src/routes/<feature>.ts` sub-app（型別用 `SessionAppEnv`，開頭 `use("*", localAuth, requireSession)`）、`src/<feature>/repository.ts`（D1 讀寫）、在 `src/index.ts` 以 `app.route` 掛載。`localAuth` 位於 `src/auth/local-auth-middleware.ts`
  - 新表依「使用者資料表慣例」：`user_id` 參照 `user.id` 並 cascade 刪除、`version`、`updated_at`；表名加進 `@pickball/core/api/user-data-tables` 的 `USER_DATA_TABLES`（`test/user-data-tables.test.ts` 會比對實際資料表，漏列即失敗）；migration 一律用 `db:generate` 產生
  - 版本化契約（單筆資料）：`GET` 回 `{ data | null, version }`，尚無資料時 `version` 為 0；`PUT { data, version }` 版本不符回 409 `VERSION_CONFLICT`、body 不合法回 400 `INVALID_BODY`、未登入回 401 `UNAUTHORIZED`。共用 schema 在 `@pickball/core/api/versioned`、錯誤碼在 `@pickball/core/api/errors`。多筆資料則各筆帶 `version`，衝突一律 409，前端整份重載
  - sub-app 的 `onError` 要把 JSON 語法錯誤的 `HTTPException(400)` 轉為 `INVALID_BODY`（見 `src/routes/scoreboard.ts`），新 sub-app 照抄時一併帶上
  - **授權覆蓋表**：每個端點須有三類測試——未登入 401、他人資料不可見／不可改、帳號停用 404
- **matchmaker 名單 API**（B6，`src/routes/matchmaker.ts`、`src/matchmaker/players-repository.ts`）：
  - 端點 `/api/matchmaker/*`：`GET /players`；`PUT /players/:id`（per-record version，version 0 為建立，path id 必須等於 `data.id`）；`DELETE /players/:id`（冪等 204）；`POST /players/import`（`db.batch()` 原子，主鍵衝突 409）；`POST /reset`（batch 刪除）
  - 掛 `localAuth, requireSession`，錯誤處理用 `userDataOnError`；共用的 `src/http/invalid-body.ts`（`userDataOnError`、`invalidBodyHook`，scoreboard 與 matchmaker 共用）——**凡是使用者資料路由都沿用它，不要各寫一份**
  - 多筆契約要點：複合主鍵 `(user_id, id)`；`sort_order = coalesce(max,-1)+1`；`GET` 依 `sort_order, rowid` 排序；只有主鍵衝突判 409，其他約束違規為 500（`isConstraintError` 只認 `SQLITE_CONSTRAINT_PRIMARYKEY` 與 `UNIQUE constraint failed`，並沿 cause 鏈查找）
  - **後續 change 須知**（詳見 openspec change `matchmaker-roster-backend` design「交接給 B7～B9」）：
    1. 場次分槽（`scoreboard:matches:v1`）隨回合一起上雲；`POST /api/matchmaker/reset` 的 batch 要加入回合與分槽表
    2. 送出比分採後端權威 batch：更新 `matchmaker_players.data`（四人評分）、寫回合、寫歷史；版本條件不成立時讓 batch 失敗的寫法見 B5 Open Questions 1
    3. 歷史（B8）只增不改：多筆契約去掉 PUT 更新、只保留 import 式附加；`USER_DATA_TABLES` 與 reset batch 要同步
- 現有測試端點：
  - `GET /api/health` — 部署冒煙測試，驗證 Next.js → service binding → Hono 的通路正常
  - `GET /api/cookie-check` — 驗證 Set-Cookie 能經 service binding 原樣穿透回瀏覽器（呼叫兩次即可確認來回都通；better-auth 的 session cookie 依賴此行為，已由 `nextjs-pickball/tests/e2e/specs/auth-proxy.spec.ts` 驗證）

## 依賴注意

- `drizzle-orm` 已被 `src/db/**` 匯入，**不再受下述複審限制**；`drizzle-kit`（devDependencies，CLI 工具本該如此）已由 `db:generate` 使用
- `better-auth`、`@better-auth/drizzle-adapter` 已被 `src/auth/**` 匯入，**不再受下述複審限制**。**不升級到 better-auth 1.7**：其 `account.issuer` 為 breaking schema 變更（B1 design Decision 5），升級須另開 change 處理 migration
- `zod`、`@hono/zod-validator` 已被 `src/**` 匯入，**不再受下述複審限制**；`zod` 另由核心套件 `@pickball/core` 引入（同一份版本）
- `date-fns` 在 dependencies，但**仍未被 `src/**` 匯入**，為未來會員／揪團功能預先安裝
- **保留而非移除的理由**：`wrangler deploy --dry-run` 實測產物為 gzip **340.66 KiB**（B2 納入 better-auth 後；匯入前為 16.91 KiB），離 CF Free plan 的 3 MiB 上限餘裕極大；體積沒有壓力時，移除的收益低於日後重裝的摩擦
- **複審期限：2026-11-12**。屆時若 `date-fns` 仍未被 `src/**` 匯入，開 change 移除（決策 D5）
- `@cloudflare/vitest-pool-workers` 與 `vitest` 不屬上述範圍——已於 change `backend-cleanup-and-tdd-enablement` 實際啟用
