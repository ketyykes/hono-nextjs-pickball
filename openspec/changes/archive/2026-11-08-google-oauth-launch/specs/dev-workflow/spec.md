# Specification: dev-workflow

## REMOVED Requirements

### Requirement: 後端 Hono app 必須帶入 binding 型別

**Reason**：其 Scenario「產出的型別中 DB 為可選且不受本機 .dev.vars 影響」以「`DB` 只宣告於 `env.local`」為前提；top-level 宣告正式 D1 後 `wrangler types` 產生必填的 `DB: D1Database`，該 Scenario 不再成立，而 MODIFIED 無法移除既有 Scenario。

**Migration**：由 ADDED「後端 binding 型別由 wrangler types 產生且 DB 為必填」取代；原文的 Hono 型別、`CloudflareBindings` 不另 import、`cf-typegen --env-file .dev.vars.example`、禁止 `!`、只以 typecheck 驗收等規則與 Scenario「Hono 實例帶入 CloudflareBindings」「型別檢查通過」原樣移入，
「產出的型別中 DB 為可選且不受本機 .dev.vars 影響」改為「產出的型別含必填的 DB 與 Google 變數且可重現」。

## MODIFIED Requirements

### Requirement: 本機 D1 migration 流程

`hono-pickball/package.json` SHALL 提供：

- `db:generate`：`drizzle-kit generate`，依 `drizzle.config.ts`（`dialect: "sqlite"`、`schema: "./src/db/schema.ts"`、`out: "./drizzle"`，不設 `driver` 與 `dbCredentials`）產生 SQL migration
- `db:migrate:local`：`wrangler d1 migrations apply DB --local --env local`
- `dev`：`wrangler dev --env local`

`env.local` 的 `d1_databases[0].migrations_dir` MUST 為 `drizzle`，使 wrangler 與測試夾具讀取同一份 migration。

`hono-pickball/package.json` 的任何 script 與 agent 執行的任何指令 SHALL NOT 帶 `--remote`。正式 D1 的 migration 只由使用者依 root `README.md`「正式站上線步驟」手動執行（`wrangler d1 migrations apply DB --remote`，讀 top-level 設定、不帶 `--env`）；本機 `db:migrate:local` 維持 `--local --env local`。

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

#### Scenario: package.json 的 script 不含 --remote

- **WHEN** 檢查 `hono-pickball/package.json` 與 `nextjs-pickball/package.json` 的 `scripts`
- **THEN** 任何 script 字串皆不含 `--remote`
- **驗收**：tasks.md 指令驗收 C10 的實跑紀錄

### Requirement: 測試帳號 seed 與本機 auth 變數

`hono-pickball/package.json` SHALL 提供 `db:seed:local`：`node scripts/seed-test-account.ts`（Node 22.22 內建 type stripping，
不新增 `tsx` 等相依）。本機建立可登入環境的完整步驟為 `db:migrate:local` → `db:seed:local`，SHALL 記載於 `hono-pickball/CLAUDE.md`。

`hono-pickball/.dev.vars.example` MUST 列出下列變數（示意值，不含真值）與用途說明：
`ENVIRONMENT`、`BETTER_AUTH_SECRET`、`BETTER_AUTH_URL`（本機為 `http://localhost:3005`，前端 origin）、
`TEST_ACCOUNT_EMAIL`、`TEST_ACCOUNT_PASSWORD`、`TEST_ACCOUNT_NAME`、`GOOGLE_CLIENT_ID`、`GOOGLE_CLIENT_SECRET`。
兩個 Google 變數在範例檔 MUST 為空值，並註明「選填；兩者皆有值才啟用 Google 登入，本機預設留空；值不得寫入任何會 commit 的檔案」——範例檔被原樣複製成 `.dev.vars` 時，本機維持「只有測試帳號登入」，不會出現指向無效 client 的 Google 按鈕。
`hono-pickball/vitest.config.ts` 的 `miniflare.bindings` MUST 注入 `GOOGLE_CLIENT_ID: ""` 與 `GOOGLE_CLIENT_SECRET: ""`：pool 會讀開發者本機的 `.dev.vars`，未注入時，有在本機設定 Google 的開發者跑測試會讓 `exports.default` 的 env 變成「Google 已啟用」，停用與 `signInMethods` 的斷言即隨機器而異。

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

#### Scenario: 範例檔列出空值的 Google 變數且測試注入空值

- **WHEN** 檢查 `hono-pickball/.dev.vars.example` 與 `hono-pickball/vitest.config.ts`
- **THEN** 前者含 `GOOGLE_CLIENT_ID=` 與 `GOOGLE_CLIENT_SECRET=` 兩行（等號後為空）與說明註解；後者的 `miniflare.bindings` 含 `GOOGLE_CLIENT_ID: ""` 與 `GOOGLE_CLIENT_SECRET: ""`
- **驗收**：tasks.md 指令驗收 C10 的實跑紀錄

## ADDED Requirements

### Requirement: 後端 binding 型別由 wrangler types 產生且 DB 為必填

`hono-pickball/src/index.ts` 的 Hono 實例 SHALL 宣告為 `new Hono<{ Bindings: CloudflareBindings }>()`，使 `c.env` 具備由 `wrangler types` 產生的型別。

`CloudflareBindings` 為 `worker-configuration.d.ts` 宣告的全域介面，SHALL NOT 額外 import。改動 `wrangler.jsonc` 後 MUST 重跑 `pnpm cf-typegen`（root `.claude/settings.json` 已有 PostToolUse hook 自動觸發）。

`cf-typegen` MUST 以 `--env-file .dev.vars.example` 產生型別：預設行為會讀取各機器自己的 `.dev.vars`（gitignored），使 commit 進版控的 `worker-configuration.d.ts` 隨開發者本機內容漂移。

`DB` 同時宣告於 top-level（正式 D1）與 `env.local`（本機 D1，見 `backend-database`「正式 D1 宣告於 top-level，本機 D1 維持於 env.local」），`wrangler types` 因此產生**必填**的 `DB: D1Database`。但遠端 binding 可能遺失、停用與替身情境的測試會注入 `DB: undefined`，所以讀取 `DB` 的函式參數（`getDb` 與 `createAuth` 的 `AuthEnv`）MUST 收窄為允許 `undefined`，並在讀取時以值檢查；程式碼 SHALL NOT 以非空斷言（`!`）繞過，一律經 `getDb(env)` 取得實例。`.dev.vars.example` 列出的 `GOOGLE_CLIENT_ID`、`GOOGLE_CLIENT_SECRET` 會被產為必填 `string`，但遠端可能缺值，`AuthEnv` 同樣 MUST 收窄為可選。

此為型別層要求，SHALL NOT 以單元測試驗收 —— 泛型化與型別產生不改變 runtime 行為，用 `@ts-expect-error` 湊出的「型別測試」是空測試。驗收方式為 `typecheck` exit 0 與檢查產出檔內容。

#### Scenario: Hono 實例帶入 CloudflareBindings

- **WHEN** 檢查 `hono-pickball/src/index.ts` 的 Hono 建構
- **THEN** 為 `new Hono<{ Bindings: CloudflareBindings }>()`，且檔案未 import `CloudflareBindings`

#### Scenario: 型別檢查通過

- **WHEN** 執行 `pnpm --filter ./hono-pickball typecheck`
- **THEN** exit 0

#### Scenario: 產出的型別含必填的 DB 與 Google 變數且可重現

- **WHEN** 在已 commit 的狀態下執行 `pnpm --filter ./hono-pickball cf-typegen`（script 帶 `--env-file .dev.vars.example`，不讀各機的 `.dev.vars`）
- **THEN** `git diff --exit-code -- hono-pickball/worker-configuration.d.ts` 無差異，且該檔的 `__BaseEnv_CloudflareBindings` 含 `DB: D1Database`、`GOOGLE_CLIENT_ID: string`、`GOOGLE_CLIENT_SECRET: string`，不含 `DB?:`
- **驗收**：tasks.md 指令驗收 C7 的實測紀錄

### Requirement: 正式站上線步驟與遠端設定由使用者手動執行並記載於 README

root `README.md` SHALL 有「正式站上線步驟」一節，列出可直接複製執行的指令與每步的驗收方式，至少涵蓋：

1. `wrangler login` 後以 `wrangler secret put` 設定 hono-pickball 的四個 secret：`BETTER_AUTH_SECRET`（以 `openssl rand -base64 32` 產生）、`BETTER_AUTH_URL`（正式前端 origin `https://nextjs-pickball.wedsatcoming.workers.dev`）、`GOOGLE_CLIENT_ID`、`GOOGLE_CLIENT_SECRET`；
   並以 `wrangler secret list` 確認恰有這四個名稱。`ENVIRONMENT` SHALL NOT 以 secret、`vars` 或 Dashboard 變數設定於遠端（設定即會在正式站開啟測試帳號登入）。
2. `wrangler d1 migrations apply DB --remote`（於 `hono-pickball/` 執行，不帶 `--env`），並以 `wrangler d1 migrations list DB --remote` 確認無待套用的 migration。
3. CF Dashboard 確認：兩個 Worker 的 build／deploy command 不帶 `--env`、未設定 `CLOUDFLARE_ENV`、未設定 `ENVIRONMENT` 變數；root directory 分別為 `hono-pickball`、`nextjs-pickball`，且該 root directory 下 `pnpm install` 能解析 `packages/pickball-core`（`workspace:*`）。
4. push 時機與部署順序（先 hono-pickball、後 nextjs-pickball）由使用者決定並在 Dashboard 確認兩個 build 皆成功。
5. 部署後以 `curl` 驗收：`/api/session` 回 `authEnabled: true` 與 `signInMethods: { google: true, emailPassword: false }`；`POST /api/auth/sign-in/email` 與 `POST /api/auth/sign-up/email` 回 404；`GET /api/auth/callback/google` 回 3xx；再以瀏覽器實際走一次 Google 登入、重整仍登入、登出。
6. Google OAuth 同意畫面為「測試中」時只有測試使用者能登入；是否發布由使用者決定。
7. 回滾方式：Dashboard 回滾至前一個部署，或 revert 後 push。

「部署前手動檢查清單」的第 8 步 MUST 同時指向「正式站上線步驟」（首次上線與日後改動 secrets／D1 時適用）。
root `CLAUDE.md` 的「CF Dashboard 側設定」MUST 列出四個 secret 的名稱（不含值）與「不得設定 `CLOUDFLARE_ENV`、`--env`、遠端 `ENVIRONMENT`」。

coding agent SHALL NOT 執行任何遠端 Cloudflare 操作（`wrangler deploy`、`wrangler d1 create`、任何 `--remote`、`wrangler secret put`、`git push`）；只允許 `--local` 與 `--dry-run`。
OAuth client secret、Google client id 與測試帳密 SHALL NOT 出現在任何 commit 中。

#### Scenario: README 記載正式站上線步驟

- **WHEN** 檢查 root `README.md`
- **THEN** 存在「正式站上線步驟」一節，且依序含 `wrangler secret put BETTER_AUTH_SECRET`、`wrangler secret put BETTER_AUTH_URL`、`wrangler secret put GOOGLE_CLIENT_ID`、`wrangler secret put GOOGLE_CLIENT_SECRET`、`wrangler secret list`、`wrangler d1 migrations apply DB --remote`、`CLOUDFLARE_ENV`、`/api/session`、`/api/auth/sign-in/email` 等字串；「部署前手動檢查清單」第 8 步提及該節
- **驗收**：tasks.md 指令驗收 C10 的實跑紀錄

#### Scenario: root CLAUDE.md 記載 secrets 與禁止的 Dashboard 設定

- **WHEN** 檢查 root `CLAUDE.md` 的「CF Dashboard 側設定（不在 repo 內）」小節
- **THEN** 含 `BETTER_AUTH_SECRET`、`BETTER_AUTH_URL`、`GOOGLE_CLIENT_ID`、`GOOGLE_CLIENT_SECRET` 四個名稱與 `CLOUDFLARE_ENV`，且不含任何 secret 值
- **驗收**：tasks.md 指令驗收 C10 的實跑紀錄

#### Scenario: commit 不含 OAuth 憑證

- **WHEN** 對本 change 的全部 commit 執行 `git log -p main..HEAD`
- **THEN** 輸出不含 `apps.googleusercontent.com` 與 `GOCSPX-`，且 `.dev.vars.example` 的 Google 變數為空值
- **驗收**：tasks.md 指令驗收 C8 的實跑紀錄
