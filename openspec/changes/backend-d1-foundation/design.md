# Design: backend-d1-foundation

## Context

- `hono-pickball` 目前只有 `/api/health` 與 `/api/cookie-check` 兩個端點、4 個測試檔 16 個測試；
  `wrangler.jsonc` 的 D1 binding 是註解。`drizzle-orm@0.45.2`、`drizzle-kit@0.31.10`、
  `@cloudflare/vitest-pool-workers@0.16.13`、`wrangler@4.99.0` 皆已安裝（lockfile 版本，本 change 不升級）。
- runbook D4／D5 與 G1 段落規定：B1～B9 **不得對遠端 CF 執行任何操作**；本 repo **push 即自動部署正式站**；
  遠端 D1 在 G1 才建立。`hono-pickball/CLAUDE.md` 已記載「placeholder UUID 會讓遠端部署直接失敗」。
- 測試慣例：`exports.default.fetch()` 搭配 `import "../src/index"`；`cloudflare:test` 的 `SELF`／`env` 已 deprecated。
- 本 change 是 Wave 1 第一棒；B2（better-auth）把本棒的 `getDb`、資料表、測試夾具當成前提。

## Goals

- 本機 `wrangler dev` 與 vitest（workerd）都能使用 D1 binding `DB`。
- 誤 push 時正式部署既不失敗、也不在遠端建立任何資源，正式站行為零變化。
- 建立「drizzle schema → `drizzle-kit generate` → wrangler／測試夾具共用同一份 SQL」的單一路徑。
- 一條測試真的在 workerd 內寫入並讀回 D1；既有 16 個後端測試零變動。
- 定案「D1 schema／migration SQL 是否屬設定層」並寫回 `hono-pickball/CLAUDE.md`。

## Non-Goals

- better-auth 的設定、任何 API 端點、讀取 `ENVIRONMENT`（B2）。
- 遠端 D1、`--remote` 指令、Workers Builds 設定（G1）。
- 任何前端變更、任何 npm 相依新增或升級。

## Decisions

### Decision 1：D1 binding 只放在具名環境 `env.local`，top-level 不宣告

**Choice**：`wrangler.jsonc` 新增：

```jsonc
"env": {
  "local": {
    "name": "hono-pickball",            // 覆寫預設的 hono-pickball-local
    "d1_databases": [
      { "binding": "DB", "database_name": "hono-pickball-local", "migrations_dir": "drizzle" }
    ]
  }
}
```

top-level 維持現狀（無 `d1_databases`、無 `vars`）。`dev` script 改為 `wrangler dev --env local`，
`db:migrate:local` 帶 `--env local`，vitest 以 `cloudflareTest({ wrangler: { configPath, environment: "local" } })` 取得 `DB`。

**Rationale**：
- Workers Builds 執行的是不帶 `--env` 的 `wrangler deploy`，只讀 top-level；top-level 沒有 D1，
  誤 push 時部署內容與今天完全相同。
- `env.local` 的 `database_id` **先省略**：Context7（`/llmstxt/developers_cloudflare_workers_llms-full_txt`，
  「Automatic provisioning」）記載省略資源 ID 時 `wrangler dev` 會自動建立**本機**資源並跨次保留；
  wrangler 4.99 的 `config-schema.json` 也把 `database_id` 標為「not required」。
  若 §1 實測發現 `wrangler dev` 與 `wrangler d1 migrations apply --local` 在省略 ID 時指向不同的本機 sqlite，
  改填非 UUID 的字面值 `"local-hono-pickball"`（明顯不是真實 ID，且此環境永不部署），並把結果補記於 Open Questions。
- worker 名稱：Context7（同上，「Configure environments deliberately」）記載具名環境預設產生 `{name}-{env}` 的 worker。
  本機若變成 `hono-pickball-local`，前端 `wrangler.jsonc` 的 `HONO_API → hono-pickball` 在 dev registry 會找不到目標。
  wrangler 4.99 原始碼（`wrangler-dist/cli.js` 的 `inheritableInWranglerEnvironments`／`inheritable`）顯示
  `rawEnv.name` 存在時直接採用、不再附加後綴，因此在 `env.local` 明確寫 `"name": "hono-pickball"`。§1 以實際啟動驗證。

**Alternatives considered**：
- **top-level 宣告 D1 但省略 `database_id`**：本機可用、dry-run 可過；但 Context7 同段記載「從 Dashboard（例如 GitHub）
  部署時會自動建立資源」——誤 push 等於在遠端**建立** D1，違反「B1～B9 不建立遠端資源」。不可選。
- **top-level 填 placeholder UUID**：遠端部署直接失敗（`hono-pickball/CLAUDE.md` 已記載），違反 runbook B1 要求。不可選。
- **先 `wrangler d1 create` 正式 D1 取得真實 UUID**：遠端操作，runbook 規定須先問使用者且屬 G1。不選。
- **以第二份 wrangler 設定檔（例：`wrangler.local.jsonc`）**：可行，但 `pnpm cf-typegen`、PostToolUse hook、
  vitest `configPath`、`wrangler d1` 指令都要改指第二份檔，兩份設定的 `compatibility_*` 會漂移。具名環境同檔繼承
  inheritable 鍵（`main`、`compatibility_date`、`compatibility_flags`、`observability`），漂移面較小。

### Decision 2：`cf-typegen` 以 `--env-file .dev.vars.example` 產生型別

**Choice**：`"cf-typegen": "wrangler types --env-interface CloudflareBindings --env-file .dev.vars.example"`。

**Rationale**：wrangler 4.99 的 `wrangler types` 預設讀取 `.dev.vars`，把其中的鍵當成 secret 型別寫進
`worker-configuration.d.ts`（原始碼 `getVarsForDev`：未給 `envFiles` 時才讀 `.dev.vars`）。`.dev.vars` 是 gitignored、
各機器內容不同，被 commit 的型別檔會隨執行者漂移；B2 起 `.dev.vars` 會出現 `BETTER_AUTH_SECRET` 等鍵，問題會立即浮現。
改讀 commit 進版控的範例檔，型別只由 repo 內容決定。

同時，wrangler 對「並非所有環境都有」的 binding 產生可選屬性（原始碼 `generatePerEnvTypeStrings`：
`${key}${required ? "" : "?"}`），因此 `DB` 會是 `DB?: D1Database`——這是正確的語意（正式部署確實沒有 `DB`），
程式碼必須面對它，見 Decision 4。

**Alternatives considered**：
- 維持預設、要求執行 typegen 前刪除 `.dev.vars`：PostToolUse hook 會在編輯 `wrangler.jsonc` 時自動執行，無法保證。
- 在 `wrangler.jsonc` 設 `secrets.required`：會讓部署驗證要求遠端存在這些 secret，誤 push 時可能失敗。不選。
- **注意順序**：`.dev.vars.example` 與新的 `cf-typegen` script MUST 先於 `wrangler.jsonc` 的編輯落地，
  否則 hook 第一次自動重跑時仍用舊 script 讀 `.dev.vars`。

### Decision 3：drizzle 設定與 migration 目錄

**Choice**：`hono-pickball/drizzle.config.ts`：`defineConfig({ dialect: "sqlite", schema: "./src/db/schema.ts", out: "./drizzle" })`，
不設 `driver`／`dbCredentials`（`generate` 只比對 schema 與既有 snapshot，不連資料庫）。
產生指令 `pnpm --filter ./hono-pickball db:generate --name auth_core`。wrangler 的 `migrations_dir` 與
`readD1Migrations()` 都指向 `drizzle/`。

**Rationale**：
- Context7（`/drizzle-team/drizzle-orm-docs`，`drizzle-kit generate`、`drizzle-config-file`）：`generate` 只需要 `dialect` 與 `schema`；
  `driver: "d1-http"` 只用於 `push`／`migrate`／`pull`／`studio`，本專案不用這些指令（會碰遠端）。
- **與文件的差異（以本機套件為準）**：Context7 的新版文件描述 `migrations/<timestamp>_<name>/migration.sql` 的資料夾版面
  （drizzle-kit v1 系列）；本 repo 鎖定的 `drizzle-kit@0.31.10` 產生的是**平面版面** `drizzle/0000_<name>.sql` 加
  `drizzle/meta/_journal.json`（本機 `bin.cjs` 含 `_journal.json` 邏輯）。平面版面正好符合 wrangler 預設的
  `migrations_dir/*.sql` 與 `readD1Migrations` 的讀法，**不需要** `migrations_pattern`。若未來升級 drizzle-kit 到資料夾版面，
  必須同時設定 `migrations_pattern`（Context7 Workers 文件「D1 databases」段落有此選項）並重新驗證夾具。
- 產出的 SQL 以 `--> statement-breakpoint` 分隔，`readD1Migrations` 會切成多個 query；§3 的測試即為其驗證。

**Alternatives considered**：
- `wrangler d1 migrations create` 手寫 SQL：schema 與 SQL 兩份來源，會漂移。不選。
- `drizzle-kit push`：直接改資料庫、無 migration 檔可審，且需要 D1 HTTP 憑證。不選。

### Decision 4：`getDb(env)` 作為唯一的 D1 入口，缺 `DB` 立即拋錯

**Choice**：`src/db/client.ts` 匯出 `getDb(env: Pick<CloudflareBindings, "DB">)`，`env.DB` 為 `undefined` 時
`throw new Error("D1 binding DB 不存在：…")`，否則回傳 `drizzle(env.DB, { schema })`。

**Rationale**：`DB` 型別可選（Decision 2）。把「缺 binding」集中在一處處理，避免各處 `env.DB!`；
正式部署設定沒有 `DB`，若有路徑誤用，錯誤訊息要直接指向原因。Context7（`/drizzle-team/drizzle-orm-docs`，
「Perform CRUD operations on D1」）的標準寫法為 `drizzle(env.<BINDING>)`，帶 `schema` 是為了讓 B2 的
better-auth drizzle adapter 與後續 relational query 使用。

**Alternatives considered**：
- 模組層 `import { env } from "cloudflare:workers"` 建立單例：正式部署沒有 `DB`，模組載入期就要處理 undefined；
  且 B2 需要以不同 env 測試 gating（見 B2 design），注入式較易測。不選。

### Decision 5：auth 核心四張表在 B1 建立

**Choice**：`src/db/schema.ts` 定義 `user`／`session`／`account`／`verification`，欄位依 better-auth **1.6** 核心 schema
（Context7 `/better-auth/better-auth/v1.6.23`：`packages/cli/test/__snapshots__/auth-schema-sqlite-*.txt` 的 drizzle sqlite 產出、
`concepts/database.mdx` 的 account 欄位表）：camelCase 屬性對應 snake_case 欄名、`timestamp_ms` 時間、`boolean` 模式的
`email_verified`、`session.token` unique、`session_userId_idx`／`account_userId_idx`／`verification_identifier_idx` 索引、
`userId` 外鍵 `on delete cascade`。

**Rationale**：runbook 驗收要求「一條測試真的寫入並讀回 D1」，且必須走 migration 管線才有意義；若另造一張只為測試存在的表，
它會成為永久的 dead schema（或在 B2 再以 migration 刪掉）。四張核心表是 B2 確定需要、且由上游文件與快照明確定義的結構。
B2 接上 adapter 時若發現欄位不符，以**新增** migration 修正（不改寫 0000）。

**與 runbook／上游的差異**：Context7 顯示 better-auth **1.7.0～1.7.2** 在 `account` 加了必填 `issuer` 欄位（`account-schema-compat.test.ts`
稱之為 1.7-only breaking change）。本 repo lockfile 為 1.6.15、`package.json` 範圍為 `^1.6.14`——**SHALL NOT 在本批升級到 1.7**；
若日後升級，必須另開 change 處理 schema。

**Alternatives considered**：
- 交給 B2 建表、B1 只驗證夾具：B1 就沒有可寫入讀回的真實資料表，驗收只能用手寫 `CREATE TABLE`，與「測試不得自建表」衝突。
- 用 better-auth CLI 產生 schema：需要新增 `@better-auth/cli` 相依，違反本批「不新增相依」。不選。

### Decision 6：D1 schema 與 migration SQL 屬設定層（免紅燈），但每張表與每個約束都要有 D1 讀寫測試

**Choice**：`src/db/schema.ts` 與 `drizzle/**` 視同 `wrangler.jsonc` 等設定層，不強制「先紅燈」；
但同一 change 內 MUST 有 workerd 中的 D1 讀寫測試覆蓋每張新表與每個約束（unique／FK／cascade）。查詢、驗證、授權等
`src/**` 行為邏輯照常 TDD。寫入 `hono-pickball/CLAUDE.md`（dev-workflow「D1 schema 與 migration SQL 屬設定層」）。

**Rationale**：宣告式 schema 沒有分支，「先寫失敗測試」對它只會退化成「表不存在」的形式紅燈；真正的風險是「宣告了但沒被測到」
（例如漏寫 cascade），所以把義務從「紅燈」換成「覆蓋」。本 change 自己仍會**實際**取得紅燈：§3 先寫 schema 測試、
此時 migration 不存在，測試真紅（不是偽造）。

**Alternatives considered**：
- 一律強制紅燈：對 schema 欄位逐一寫紅燈測試成本高、價值低，且會誘使 agent 用 mutation 偽造紅燈（root CLAUDE.md 明文禁止）。
- 完全不要求測試：cascade／unique 這類約束寫錯不會被任何人發現，直到 B6～B8 資料錯亂。不選。

### Decision 7：測試夾具照官方 d1 範例，`env` 自 `cloudflare:workers` 取得

**Choice**：

```ts
// vitest.config.ts（Node 端）
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";
const migrations = await readD1Migrations(path.join(import.meta.dirname, "drizzle"));
plugins: [cloudflareTest({
  wrangler: { configPath: "./wrangler.jsonc", environment: "local" },
  miniflare: { bindings: { TEST_MIGRATIONS: migrations } },
})],
test: { include: ["test/**/*.test.ts"], setupFiles: ["./test/apply-migrations.ts"] }

// test/apply-migrations.ts（workerd 端）
import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
```

`test/env.d.ts` 以 `declare namespace Cloudflare { interface Env { TEST_MIGRATIONS: D1Migration[] } }` 補型別
（`D1Migration` 型別自 `cloudflare:test` 匯入）。

**Rationale**：
- Context7（`/cloudflare/workers-sdk`，`fixtures/vitest-plugin-examples/d1/vitest.config.ts`）的官方模式即
  「config 端 `readD1Migrations` → `miniflare.bindings.TEST_MIGRATIONS` → setup 檔 `applyD1Migrations(env.X, env.TEST_MIGRATIONS)`，
  `env` 自 `cloudflare:workers`」。
- **與 runbook 假設的差異**：runbook 問「`readD1Migrations` 是否仍存在」——存在，但**從套件根匯入**
  （本機 `dist/pool/index.d.mts` 第 106、132 行）；`types/cloudflare-test.d.ts` 註解仍寫「從 `@cloudflare/vitest-pool-workers/config`
  匯入」，那是過期註解（本版 `exports` 沒有 `./config`，與 `hono-pickball/CLAUDE.md` 既有記載一致）。上游 main 已把套件更名為
  `@cloudflare/vitest-plugin`，本批鎖定 0.16.13 不跟進。
- `applyD1Migrations` 只套用未套用的 migration（以 `d1_migrations` 表記錄），setup 檔在每個測試檔執行前跑一次是安全的；
  Context7 CHANGELOG 記載本版已移除 `isolatedStorage`，**storage 以測試檔為隔離單位**，同檔內的 it 共用資料，測試需自行避免碰撞。
- `cloudflare:test` 的 `env`／`SELF` 已 deprecated（本機型別檔第 3、11 行），但 `applyD1Migrations` 沒有被標 deprecated，仍自
  `cloudflare:test` 匯入。

**Alternatives considered**：
- 在每個測試檔 `beforeAll` 自行套用：重複且易漏。不選。
- 測試裡手寫 `CREATE TABLE`：測到的不是 migration。不選。

## Risks / Trade-offs

- [Risk] `wrangler dev --env local` 在 dev registry 的名稱不是 `hono-pickball`，前端 service binding 斷線
  → Mitigation：`env.local.name` 明確覆寫；§1 以實際啟動（非 8787 的備用埠）＋ `curl /api/health` 驗證。S1 檢查點再以前後端合跑確認。
- [Risk] vitest pool 的 `wrangler.environment` 未把 `env.local` 的 `DB` 帶進測試 → Mitigation：§3 的第一條 schema 測試即會因 `env.DB`
  不存在而失敗，失敗訊息可區分「夾具沒接上」與「表不存在」；若 environment 選項無效，改以 `miniflare.d1Databases: ["DB"]` 補上並記入 Open Questions。
- [Risk] vitest pool 讀取開發者本機 `.dev.vars`，讓測試結果依機器而異 → Mitigation：本棒的測試不讀任何 var；B2 起會在 vitest config
  明確注入測試用值（見 B2 design）。
- [Risk] `drizzle-kit generate` 產生的檔名含隨機詞（例如 `0000_brave_hulk.sql`），可讀性差 → Mitigation：一律帶 `--name`。
- [Risk] 有人日後在 top-level 加回 `d1_databases` → Mitigation：`backend-database` spec 明文禁止；`hono-pickball/CLAUDE.md` 的 D1 段落改寫為
  「D1 只在 `env.local`，G1 才為正式環境宣告」。
- [Trade-off] 本機與正式的設定結構不同（`env.local` vs top-level），R1「本機綠≠上線綠」更明顯 → G1 要以正式 D1 UUID 在 top-level 宣告並重跑完整驗收。

## Migration Plan

- 本 change 只影響本機：合併後各開發者執行一次 `pnpm --filter ./hono-pickball db:migrate:local`。
- 正式部署設定未變；**不 push**（runbook D4）。回滾：revert 合併 commit；本機 `.wrangler/state` 可直接刪除。

## Open Questions

1. `env.local` 省略 `database_id` 時，`wrangler dev --env local` 與 `wrangler d1 migrations apply DB --local --env local`
   是否指向同一份本機 sqlite？（§1.5 實測；不一致則改填 `"local-hono-pickball"`，見 Decision 1）
2. `wrangler types --env-file .dev.vars.example` 是否確實忽略 `.dev.vars`？（§2 實測；若否，改為 Decision 2 的替代方案並記錄）
3. Playwright `webServer` 的 `pnpm --filter hono-pickball dev` 會隨 `dev` script 改走 `--env local`；B1 不跑 E2E 以外的新流程，
   但 §5 的完整 E2E 回歸 MUST 確認 `api-health.spec.ts` 等既有測試不受影響。
