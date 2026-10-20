# Tasks: backend-d1-foundation

> **TDD 三步**（root `CLAUDE.md`）：行為邏輯 task 拆為 RED（先寫失敗測試，以
> `pnpm --filter ./hono-pickball test --run test/<檔>.test.ts` 在 shell 實際看到紅燈並貼出輸出）→ GREEN（最小實作至綠）
> → REFACTOR（無壞味道註記 skipped）。**`--run` 前不可加 `--`**。
>
> **紅燈要是真的**：加入即綠者 MUST 誠實標註 regression guard，**SHALL NOT 用「改斷言看紅再改回」偽造紅燈**。
>
> **標註慣例**：
> - `RED`／`GREEN`／`REFACTOR`：TDD task（`test:`／`feat:`／`refactor:` commit）。
> - `設定層`：`wrangler.jsonc`、`package.json` scripts、`drizzle.config.ts`、`vitest.config.ts`、`drizzle/**`、`src/db/schema.ts`、
>   `.dev.vars.example`（design Decision 6；`build:`／`chore:` commit）。設定層不需紅燈，但其正確性 MUST 由同 change 內的測試或指令驗收覆蓋。
> - `驗收（指令）`：對應 test-plan「指令驗收」表 C1～C8，實跑後把輸出摘要寫在該 task 後方。
>
> it 名稱 MUST 與 delta spec 的「驗收」錨點逐字一致。**本 change 不得新增或升級任何 npm 相依。**
> **禁止任何遠端 CF 操作**（只允許 `--local`、`--dry-run`）。

## 1. 對齊 main＋Context7 查證（不寫產品程式碼）

- [x] 1.1 確認 `git branch --show-current` 為 `change/backend-d1-foundation`、`git status --porcelain` 為空；`pnpm install` 後 lockfile 零變動；跑 `pnpm test` 取得 baseline（後端應為 4 檔／16 測試），回填 environment.md 的 Verification 並 commit
- [x] 1.2 對齊 main：讀 `hono-pickball/{wrangler.jsonc, package.json, vitest.config.ts, tsconfig.json, test/tsconfig.json, src/index.ts, CLAUDE.md}` 與 `test/*.test.ts`，確認與 design Context 描述一致（無 D1、16 測試、`exports.default.fetch` 慣例）；不一致處記入 design.md Open Questions
- [x] 1.3 本機套件查證：確認 `node_modules/@cloudflare/vitest-pool-workers` 為 0.16.13 且套件根匯出 `readD1Migrations`（`dist/pool/index.d.mts`）、`types/cloudflare-test.d.ts` 宣告 `applyD1Migrations` 且未標 deprecated；`drizzle-kit` 為 0.31.10（平面版面）；`better-auth` 為 1.6.x；`wrangler` 為 4.99.x。結果記入 design.md Open Questions（與 design 相同則記「已確認」）
- [x] 1.4 Context7 查證（MUST，不憑記憶）：`resolve-library-id` → `query-docs`，至少查 ① `/cloudflare/workers-sdk` 的 vitest D1 migration 範例（`readD1Migrations`／`applyD1Migrations`／`env` 來源）② Workers 文件的 D1 binding `database_id` 是否必填、automatic provisioning、具名環境命名規則 ③ `/drizzle-team/drizzle-orm-docs` 的 sqlite `drizzle.config.ts` 與 `generate`。與 design Decision 1、3、7 的差異記入 Open Questions（附 library ID）
- [x] 1.5 驗收（指令）C8 前置：確認無其他 dev server（`lsof -i :3005 -i :8787 -i :8790` 為空，否則依派工單必帶 i 處理）。此步只記錄現況，C8 本身於 §2 完成 wrangler 設定後執行

## 2. 本機 D1 環境設定（設定層）

Depends on: §1

- [x] 2.1 設定層：新增 `hono-pickball/.dev.vars.example`（`ENVIRONMENT=development`＋說明註解：只在本機啟用、遠端缺值即停用、`.dev.vars` 不入版控）
- [x] 2.2 設定層：`hono-pickball/package.json` 的 `cf-typegen` 改為 `wrangler types --env-interface CloudflareBindings --env-file .dev.vars.example`；`dev` 改為 `wrangler dev --env local`；新增 `db:generate`（`drizzle-kit generate`）與 `db:migrate:local`（`wrangler d1 migrations apply DB --local --env local`）。**本 task MUST 先於 2.3 commit**（design Decision 2「注意順序」）
- [x] 2.3 設定層：`hono-pickball/wrangler.jsonc` 新增 `env.local`（`name: "hono-pickball"`、`d1_databases: [{ binding: "DB", database_name: "hono-pickball-local", migrations_dir: "drizzle" }]`，**不填 `database_id`**），top-level 不動；移除舊的 D1 註解範例並改寫為「D1 只在 env.local，正式環境於 G1 宣告」的說明。hook 自動重跑 `cf-typegen`，連同 `worker-configuration.d.ts` 一併 commit
- [x] 2.4 驗收（指令）C4：確認 `worker-configuration.d.ts` 含 `DB?: D1Database`；暫時建立內容含 `ENVIRONMENT=development`、`SOME_LOCAL_ONLY=x` 的 `.dev.vars` 跑 `cf-typegen`，`git diff --exit-code -- hono-pickball/worker-configuration.d.ts` 為 0；刪除暫存 `.dev.vars` 再跑一次仍為 0。若不為 0，依 design Open Questions 2 處理並記錄
  - 實測：`worker-configuration.d.ts` 含 `DB?: D1Database`；暫時 `.dev.vars`（ENVIRONMENT、SOME_LOCAL_ONLY）下 cf-typegen 後 `git diff --exit-code` = 0；刪除後再跑 = 0。Open Question 2 結論：`--env-file .dev.vars.example` 確實忽略 `.dev.vars`。（原 .dev.vars 已備份並還原）
- [x] 2.5 驗收（指令）C1：`pnpm --filter ./hono-pickball build` exit 0，dry-run 輸出的 binding 清單不含 `DB`
  - 實測：`pnpm --filter ./hono-pickball build` exit 0；dry-run 輸出 `No bindings found.`，不含 `DB`（另有 wrangler 警告「未指定 --env」，無害）。
- [x] 2.6 驗收（指令）C8：`pnpm --filter ./hono-pickball exec wrangler dev --env local --port 8790` 啟動（背景），輸出的 worker 名稱為 `hono-pickball`、`curl -s -o /dev/null -w "%{http_code}" http://localhost:8790/api/health` 為 200；完成後立刻停止該 process 並以 `lsof -i :8790` 確認釋放。名稱帶 `-local` 後綴則依 execution-plan Escalation 停止
  - 實測：`wrangler dev --env local --port 8790` 就緒，`GET /api/health` 200；binding 清單顯示 `env.DB (hono-pickball-local) D1 Database local`。啟動輸出本身不印 worker 名稱，改以 `WRANGLER_LOG=debug` 確認 inspector 目標為 `core:user:hono-pickball`（無 `-local` 後綴）。本機 D1 路徑資訊：未省略 database_id 相關警告，`.wrangler/state/v3/d1` 目錄存在（Open Question 1 留待 §5.3）。已停止 process，`lsof -i :8790` 無輸出。
- [x] 2.7 設定層：新增 `hono-pickball/drizzle.config.ts`（`dialect: "sqlite"`、`schema: "./src/db/schema.ts"`、`out: "./drizzle"`，不設 `driver`／`dbCredentials`）

## 3. D1 測試夾具與 auth 核心資料表

Depends on: §2

- [ ] 3.1 RED: 新增 `hono-pickball/test/d1-schema.test.ts`，寫入四個 it：「測試用 D1 已套用 TEST_MIGRATIONS 的全部 migration」「auth 核心四張資料表皆已由 migration 建立」「user.email 重複時插入失敗」「刪除使用者時其 session 與 account 一併刪除」。`env` 自 `cloudflare:workers` 匯入，測試內以 `env.DB.prepare(...)` 直接下 SQL（不經 `getDb`，避免與 §4 耦合）。跑單檔確認紅燈（預期：`env.DB`／`TEST_MIGRATIONS` 不存在或表不存在）並貼出輸出
- [ ] 3.2 GREEN（設定層＋測試基礎建設）: `vitest.config.ts` 依 design Decision 7 加入 `readD1Migrations`、`wrangler.environment: "local"`、`miniflare.bindings.TEST_MIGRATIONS`、`setupFiles`；新增 `test/apply-migrations.ts`、`test/env.d.ts`（`TEST_MIGRATIONS: D1Migration[]`）；新增 `src/db/schema.ts`（design Decision 5 的四張表與索引、cascade）；執行 `pnpm --filter ./hono-pickball db:generate --name auth_core` 產生 `drizzle/0000_auth_core.sql` 與 `drizzle/meta/`（不手改）。跑單檔至綠，並跑完整 `pnpm --filter ./hono-pickball test` 確認既有 16 測試不變
- [ ] 3.3 REFACTOR: 檢查 `vitest.config.ts` 與 setup 檔的註解只寫「為什麼」（storage 以測試檔隔離、`env` 來源、為何不手寫建表）；無壞味道則註記 skipped
- [ ] 3.4 驗收（指令）C5：`pnpm --filter ./hono-pickball typecheck` 兩段皆 exit 0（`test/env.d.ts` 與 `D1Migration` 匯入在第二段生效）

## 4. getDb：D1 存取入口

Depends on: §3

- [ ] 4.1 RED: 新增 `hono-pickball/test/db-client.test.ts`，寫入兩個 it：「getDb 回傳的實例可寫入並讀回 user 資料列」「DB binding 不存在時 getDb 立即拋出含 DB 字樣的錯誤」。確認紅燈（`src/db/client.ts` 不存在）並貼出輸出
- [ ] 4.2 GREEN: 新增 `hono-pickball/src/db/client.ts` 的 `getDb(env)`（design Decision 4）：缺 `DB` 拋錯、否則回傳 `drizzle(env.DB, { schema })`。跑單檔至綠
- [ ] 4.3 REFACTOR: 確認 `src/**` 中 `drizzle(` 只出現在 `client.ts`；型別參數只要求 `DB`（`Pick<CloudflareBindings, "DB">`），不綁整個 env；無壞味道則註記 skipped

## 5. 文件同步與總驗收

Depends on: §4

- [ ] 5.1 設定層（文件）：改寫 `hono-pickball/CLAUDE.md`：① 「wrangler.jsonc 要點」的 D1 段落改為「D1 只在 `env.local`；top-level 不得宣告，正式 D1 於 G1 以真實 UUID 宣告」② 常用指令補 `db:generate`、`db:migrate:local`，`dev` 註明走 `--env local` ③ 依賴注意：`drizzle-orm` 已被 `src/db/**` 匯入、解除其 2026-11-12 複審，其餘（better-auth 等）待 B2 ④ 測試慣例：`env` 自 `cloudflare:workers` 取得（`cloudflare:test` 的 `env`／`SELF` 仍禁用）、D1 夾具與「storage 以測試檔隔離」⑤ 新增「D1 schema 與 migration SQL 屬設定層」段落（含覆蓋義務）⑥ 範圍例外段落（matchmaker LocalStorage-only）**不動**（B5／B6 才改）
- [ ] 5.2 驗收（指令）C6、C7：逐條核對 `hono-pickball/CLAUDE.md` 與 `.dev.vars.example`、`wrangler.jsonc`，結果寫在本 task 後方
- [ ] 5.3 驗收（指令）C2：刪除 `hono-pickball/.wrangler/state` 後 `pnpm --filter ./hono-pickball db:migrate:local` exit 0，`wrangler d1 execute DB --local --env local --command "SELECT name FROM sqlite_master WHERE type='table'"` 列出四張表；同時比對本機 sqlite 檔路徑與 2.6 啟動的 `wrangler dev` 是否同一份（design Open Questions 1），不一致則依 Decision 1 改填非 UUID 字面值並重跑 2.5、2.6、3.2
- [ ] 5.4 驗收（指令）C3：`pnpm --filter ./hono-pickball db:generate` 回報無變更、`git status --porcelain -- hono-pickball/drizzle` 為空
- [ ] 5.5 驗收（指令）：`pnpm -r exec tsc --noEmit` exit 0；`pnpm --filter ./nextjs-pickball lint` 0 errors；`pnpm test` 全綠（後端 6 檔／22 測試＝既有 16＋本 change 6；前端數不減）；`git diff main --stat -- pnpm-lock.yaml '**/package.json'` 只有 `hono-pickball/package.json`
- [ ] 5.6 驗收（指令）：完整 E2E 回歸 `pnpm --filter ./nextjs-pickball exec playwright test --workers=1`（前後清殘留 process）——`dev` script 改走 `--env local` 後 `webServer` 啟動的後端必須讓既有 E2E 全數原樣通過；結果（passed／skipped／failed）寫在本 task 後方
- [ ] 5.7 `DO_NOT_TRACK=1 openspec validate backend-d1-foundation --strict` 通過
