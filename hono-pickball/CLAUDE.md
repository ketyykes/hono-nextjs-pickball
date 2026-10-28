# CLAUDE.md

本檔描述 **hono-pickball workspace**（monorepo 後端）：Hono 4 API on Cloudflare Workers。**所有後端邏輯（含 better-auth、drizzle、D1）都放這裡**，不要寫進前端的 API route。

> ⚠️ 範圍例外：計分板（`/scoreboard`）已部分上雲（B5：登入且未綁定場次時以雲端為準，路由見 `src/routes/scoreboard.ts`）；
> matchmaker（對戰分配機）的**參賽者名單已上雲**（B6：`src/routes/matchmaker.ts`，表 `matchmaker_players`），
> **回合、場次分槽與送出比分（含歷史寫入）也已上雲**（B7：表 `matchmaker_round`、`matchmaker_match_slots`、`matchmaker_history`）。
> **歷史的讀取端點也已提供**（B8：`GET /api/matchmaker/history`），登入時歷史頁、統計頁與歷史 CSV 皆讀雲端；
> 引擎純邏輯（分配、評分等）在 `@pickball/core`。

以下指令除特別標註外皆假設 cwd 在 `hono-pickball/`；從 repo root 執行請用 `pnpm --filter ./hono-pickball <script>`。

後端可匯入 `@pickball/core`（`workspace:*`；前後端共用的純邏輯與契約，見 [`packages/pickball-core/CLAUDE.md`](../packages/pickball-core/CLAUDE.md)）。`src/**` 已於 B5 起匯入（如 `@pickball/core/api/versioned`、`@pickball/core/api/errors`、`@pickball/core/api/user-data-tables`）；匯入不需額外的 wrangler／tsconfig 設定（`test/pickball-core-import.test.ts` 證明 workerd 測試可解析，`wrangler deploy --dry-run` 證明 esbuild 可打包）。

## 常用指令

- `pnpm dev` — `wrangler dev --env local`（http://localhost:8787）；走 `--env local` 才有本機 D1 binding（`DB`）
- `pnpm db:generate` — `drizzle-kit generate`，由 `src/db/schema.ts` 產生 `drizzle/` 下的 migration；commit 前執行必須不產生新檔案（schema 與 migration 不得漂移）
- `pnpm db:migrate:local` — `wrangler d1 migrations apply DB --local --env local`；首次 clone 或 `drizzle/` 變更後執行一次。**任何指令都不得帶 `--remote`**，遠端 D1 的建立與 migration 屬後續 G1
- `pnpm db:seed:local` — `node scripts/seed-test-account.ts`（Node 22 內建 type stripping，不需 `tsx`）；把 `.dev.vars` 的 `TEST_ACCOUNT_*` 寫入本機 D1。只讀 `.dev.vars`（以 `parseEnv` 解析，shell 已 export 的同名變數不影響）、只寫本機 D1（`--local --env local`），**不得帶 `--remote`**；重複執行會先刪除同 email 的 user（cascade 刪其 session）再重建。會建立**兩個帳號**：`TEST_ACCOUNT_EMAIL` 與由 `deriveSwitchAccountEmail()` 衍生的換帳號測試用第二帳號（plus addressing、同密碼；B7.5）。可在 `wrangler dev` 執行中跑，結果立即可見
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
  - 結構：`src/routes/<feature>.ts` sub-app（型別用 `SessionAppEnv`，開頭 `use("*", localAuth, requireSession, requireExpectedUser)`）、`src/<feature>/repository.ts`（D1 讀寫）、在 `src/index.ts` 以 `app.route` 掛載。`localAuth` 位於 `src/auth/local-auth-middleware.ts`
  - **預期帳號守衛**（B7.5，`src/auth/require-expected-user.ts`）：每個使用者資料請求（所有方法）MUST 帶 `X-Expected-User-Id`（常數 `EXPECTED_USER_ID_HEADER` 在 `@pickball/core/api/headers`），缺少或與 session 的 user id 不符一律回 401 `ACCOUNT_MISMATCH`，防止換帳號後舊分頁把資料寫進新帳號。`test/expected-user-guard.test.ts` 以 `app.routes` 列舉使用者資料路由並與守衛樣本表比對（目前 14 條），**新增端點必須同時補樣本**，漏掛守衛或漏補樣本都會紅。curl 範例：`curl -b cookies.txt -H 'X-Expected-User-Id: <user id>' http://localhost:8787/api/scoreboard`
  - 新表依「使用者資料表慣例」：`user_id` 參照 `user.id` 並 cascade 刪除、`version`、`updated_at`；表名加進 `@pickball/core/api/user-data-tables` 的 `USER_DATA_TABLES`（`test/user-data-tables.test.ts` 會比對實際資料表，漏列即失敗）；migration 一律用 `db:generate` 產生
  - 版本化契約（單筆資料）：`GET` 回 `{ data | null, version }`，尚無資料時 `version` 為 0；`PUT { data, version }` 版本不符回 409 `VERSION_CONFLICT`、body 不合法回 400 `INVALID_BODY`、未登入回 401 `UNAUTHORIZED`。共用 schema 在 `@pickball/core/api/versioned`、錯誤碼在 `@pickball/core/api/errors`。多筆資料則各筆帶 `version`，衝突一律 409，前端整份重載
  - sub-app 的 `onError` 要把 JSON 語法錯誤的 `HTTPException(400)` 轉為 `INVALID_BODY`，共用實作為 `src/http/invalid-body.ts` 的 `userDataOnError`（搭配 zValidator 的 `invalidBodyHook`），新 sub-app 直接沿用、不要另寫
  - **授權覆蓋表**：每個端點須有四類測試——未登入 401、他人資料不可見／不可改、帳號停用 404、預期帳號缺少／不符 401（第四類由 `test/expected-user-guard.test.ts` 的列舉 it 統一覆蓋）
- **matchmaker 名單 API**（B6，`src/routes/matchmaker.ts`、`src/matchmaker/players-repository.ts`）：
  - 端點 `/api/matchmaker/*`：`GET /players`；`PUT /players/:id`（per-record version，version 0 為建立，path id 必須等於 `data.id`）；`DELETE /players/:id`（冪等 204）；`POST /players/import`（`db.batch()` 原子，主鍵衝突 409）；`POST /reset`（`db.batch()` 一次刪除 `matchmaker_players`、`matchmaker_round`、`matchmaker_match_slots`、`matchmaker_history` 四張表）
  - 掛 `localAuth, requireSession, requireExpectedUser`，錯誤處理用 `userDataOnError`；共用的 `src/http/invalid-body.ts`（`userDataOnError`、`invalidBodyHook`，scoreboard 與 matchmaker 共用）——**凡是使用者資料路由都沿用它，不要各寫一份**
  - 多筆契約要點：複合主鍵 `(user_id, id)`；`sort_order = coalesce(max,-1)+1`；`GET` 依 `sort_order, rowid` 排序；只有主鍵衝突判 409，其他約束違規為 500（`isConstraintError` 只認 `SQLITE_CONSTRAINT_PRIMARYKEY` 與 `UNIQUE constraint failed`，並沿 cause 鏈查找）
- **matchmaker 回合、場次分槽與送出比分 API**（B7，同在 `src/routes/matchmaker.ts`；`src/matchmaker/{round,slots,score}-repository.ts`）：
  - `GET /round` 回 `{ data | null, version }`（尚無回合時 `version` 為 0）；`PUT /round` 帶 `{ data, version }`，回應為寫入後的資料與新版本。**判定順序**：先比對完成狀態（PUT 不得改變場次完成狀態，違反回 400 `INVALID_BODY`），再比版本（不符回 409 `VERSION_CONFLICT`）。此順序是 coordinator 裁定維持的行為（符合 spec 字面），舊回合裝置重排時會先得到 400 而非 409，不要自行對調
  - `GET /slots`（清單）、`GET /slots/:matchId`（單筆，不存在回 `{ data: null, version: 0 }`）、`PUT /slots/:matchId`（path 的 `matchId` 必須等於 `data.matchId`，否則 400；版本不符 409）。**`GET /slots` 的 `orderBy`（依 `match_id`）必須保留**：不排序時 `ANALYZE` 後查詢計畫可能改變回傳順序（design Open Questions 第 16 條）
  - `POST /round/matches/:matchId/score`（body `{ scoreA, scoreB, roundVersion }`）：後端權威，以核心套件純函式計算評分，在**同一個 batch** 內更新四位球員評分、回合完成狀態、寫歷史、刪除該場分槽；不合法（`empty-field`、`invalid-number`、`negative-score`、`tie`）回 400；`match-not-found`、`already-completed`、`scoring-failed`、版本條件不成立或同一場次已有歷史回 409。由「多表寫入用整批守衛」保護
  - `POST /reset` 的 batch 已擴充為四張表（見上方名單 API）
  - **後續 change 須知**（詳見 openspec change `matchmaker-round-score-backend` design「交接給 B8～B9」）：
    1. **B8（已完成）**：讀取端點 `GET /api/matchmaker/history` 已提供（見上方「matchmaker 歷史讀取 API」）；前端 `resetLocalMatchProgress()` 已刪除、`buildRemoteBackupSnapshot()` 的 `history` 已改取雲端。歷史只增不改：多筆契約去掉 PUT 更新、只保留 import 式附加
    2. **B9**：整批守衛可直接用於「雲端為空才匯入」；匯入的分槽 MUST 屬於匯入回合的未完成場次；歷史主鍵使重複的 `matchId` 整批失敗。B7 不新增錯誤碼，B9 若需區分「雲端已有資料」，以 409 搭配前端文案處理即可
    3. B9 出現第二個守衛 batch 呼叫端時，把 `guardedBatch` 抽到 `batch-guard.ts`；B6 `isConstraintError` 可一併改用 `errorChainMatches`
    4. **B7.5 預期帳號守衛**（詳見 openspec change `user-data-account-guard` design「交接給 B8／B9」）：B8 的 `GET /api/matchmaker/history` 在 matchmaker sub-app 內自動受守衛保護，但守衛樣本表 MUST 補一條；B9 的 `src/routes/import.ts` 開頭 MUST 為 `use("*", localAuth, requireSession, requireExpectedUser)` 且樣本表補 `POST /api/import`
       （第 3 點現況：`guardedBatch` 目前**不是程式碼中的具名函式**，是 design OQ14 決定「不抽」的包裝；守衛 → 寫入 → 刪守衛與 `try/catch` 分類直接寫在 `src/matchmaker/score-repository.ts` 的送出比分函式內。`errorChainMatches` 在 `src/matchmaker/batch-guard.ts`，目前未匯出；`isConstraintError` 在 `src/matchmaker/players-repository.ts`，未匯出且自行處理 cause 鏈）
    5. **B8 交接給 B9**（openspec change `matchmaker-history-stats-backend` design「交接給 B9」）：① 匯入的歷史 MUST 寫入 `played_at`（`Date.parse(playedAt)`），否則 `GET /history` 的區間查詢會漏掉；② 匯入的歷史以 `asc` 讀回時順序為 `played_at` 加 `rowid`，匯入時 MUST 依本機的追加順序插入，同時間的紀錄才會維持原順序；③ 前端 `resetLocalMatchProgress()` 已刪除，登入時重置不碰本機，本機五個 key 皆可作為匯入來源
- **matchmaker 歷史讀取 API**（B8，同在 `src/routes/matchmaker.ts`；`src/matchmaker/history-repository.ts`，查詢契約在 `@pickball/core/api/history`）：
  - `GET /api/matchmaker/history?from=&to=&order=`：皆選填的毫秒界線，**`from` 含、`to` 不含**（`played_at >= from AND played_at < to`），同時給兩者時 `from` 必須小於 `to`；格式不合（非十進位整數、`from >= to`、`order` 不是 `desc`／`asc`）回 400 `INVALID_BODY`。`order` 預設 `desc`（`ORDER BY played_at DESC, rowid ASC`），`asc` 為 `played_at ASC, rowid ASC`；`rowid` 即追加順序，與前端 `filterHistoryByRange` 的穩定排序一致
  - 回應 `{ items: [{ data, version }], total, droppedCount }`：`total` 為本人**全部**筆數（不受界線影響，讓前端分得出「完全沒有歷史」與「此區間沒有」）；`droppedCount` 為本次範圍內被略過的列數
  - **損毀列只略過、不刪除**：`data` 以 sql 片段取原始文字後逐列 `JSON.parse` 再過 `MatchHistoryEntrySchema.safeParse`，語法錯誤（非 JSON 文字）或 schema 不符都略過並計入 `droppedCount`。不可改用 drizzle json mode 直接讀取——單列非 JSON 會讓整個查詢 500。保留原列是為了日後能以新版 schema 救回（與本機的「回寫清理」刻意不同）
  - **後端不計算區間**：Workers 的時區為 UTC，在後端算「今日」「本週」會讓台灣使用者到早上 8 點才換日；區間界線由前端以核心 `rangeBounds(range, now)` 依使用者裝置時區算成毫秒後傳入，後端只比較毫秒，切點只有核心一份實作
  - 歷史只增不改，沒有 PUT；掛在 matchmaker sub-app 內自動受預期帳號守衛保護，守衛樣本表已含 `GET /api/matchmaker/history`
- 現有測試端點：
  - `GET /api/health` — 部署冒煙測試，驗證 Next.js → service binding → Hono 的通路正常
  - `GET /api/cookie-check` — 驗證 Set-Cookie 能經 service binding 原樣穿透回瀏覽器（呼叫兩次即可確認來回都通；better-auth 的 session cookie 依賴此行為，已由 `nextjs-pickball/tests/e2e/specs/auth-proxy.spec.ts` 驗證）

## 多表寫入用整批守衛

D1 沒有互動式 transaction，只有 `db.batch()`：batch 中任一陳述式**失敗**會回滾整批，但**影響 0 列的 UPDATE 不算失敗**（B5 Open Questions 1），所以光靠 `WHERE version = ?` 擋不住競態。需要多表一致寫入（例：送出比分）時，一律用整批守衛，實作在 `src/matchmaker/batch-guard.ts`：

- **寫法**：batch 的**第一條**為 `insertBatchGuard(db, userId, condition, now)`，即對 `sync_batch_guards` 插入 `version = CASE WHEN <條件> THEN 1 END`；**最後一條**為 `releaseBatchGuard(db, userId)`（DELETE），使守衛表在任何 batch 結束後恆為空。`<條件>` 是在 SQL 內對資料庫**目前**內容做的版本比較（例：回合版本與每位被更新球員的版本）。條件為假 → `CASE` 得 NULL → 違反 `version` 的 NOT NULL → 該陳述式失敗 → D1 回滾整批
- **守衛必須是第一條**：後面的陳述式會把 version 加一，守衛放後面會讀到自己剛寫入的新 version 而失效
- **錯誤分類集中在 `batch-guard.ts`**：`isBatchGuardViolation(error)`（訊息含 `NOT NULL constraint failed: sync_batch_guards.version`，不比對寬泛的 `SQLITE_CONSTRAINT`）與 `isHistoryPrimaryKeyViolation(error)`（限定 `matchmaker_history.`，殘留守衛列或其他表的衝突不得被吞成 409），兩者都沿 cause 鏈逐層檢查；呼叫端 catch 後符合者回 conflict，其餘照常拋出（500）
- **禁止事項**：
  - 不得改用多次 `run()` 加 try/catch 補償：前面的寫入已提交，補償不可靠
  - 守衛 INSERT 不得加 `OR IGNORE`／`OR REPLACE`／`onConflictDoNothing`，否則違反約束的守衛會被靜默略過
  - `sync_batch_guards.version` 不得有 `DEFAULT`，否則 NULL 會被預設值取代而不失敗
  - **drizzle 0.45.2 的 batch 內不可使用帶參數的 `db.run(sql)`**（`SQLiteRaw` 無 stmt，執行失敗）；一律改用 query builder 搭配 `sql` 片段（`insertBatchGuard` 即如此）
  - 不得在 JS 端先判定再傳常數條件（如 `sql`1``）：先讀後寫之間的競態就沒被消除。batch 前讀到的 version 只能當比較基準，比較本身必須在 SQL 內執行
- 測試：`test/d1-batch-guard.test.ts` 固定兩個平台行為（0 列 UPDATE 不回滾、守衛失敗整批回滾）；repository 層以測試專用的 `afterRead` 鉤子模擬競態

## 依賴注意

- `drizzle-orm` 已被 `src/db/**` 匯入，**不再受下述複審限制**；`drizzle-kit`（devDependencies，CLI 工具本該如此）已由 `db:generate` 使用
- `better-auth`、`@better-auth/drizzle-adapter` 已被 `src/auth/**` 匯入，**不再受下述複審限制**。**不升級到 better-auth 1.7**：其 `account.issuer` 為 breaking schema 變更（B1 design Decision 5），升級須另開 change 處理 migration
- `zod`、`@hono/zod-validator` 已被 `src/**` 匯入，**不再受下述複審限制**；`zod` 另由核心套件 `@pickball/core` 引入（同一份版本）
- `date-fns` 在 dependencies，但**仍未被 `src/**` 匯入**，為未來會員／揪團功能預先安裝
- **保留而非移除的理由**：`wrangler deploy --dry-run` 實測產物為 gzip **340.66 KiB**（B2 納入 better-auth 後；匯入前為 16.91 KiB），離 CF Free plan 的 3 MiB 上限餘裕極大；體積沒有壓力時，移除的收益低於日後重裝的摩擦
- **複審期限：2026-11-12**。屆時若 `date-fns` 仍未被 `src/**` 匯入，開 change 移除（決策 D5）
- `@cloudflare/vitest-pool-workers` 與 `vitest` 不屬上述範圍——已於 change `backend-cleanup-and-tdd-enablement` 實際啟用
