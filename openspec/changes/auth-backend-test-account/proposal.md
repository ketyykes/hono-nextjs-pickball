# Proposal: auth-backend-test-account

## Why

runbook B2：計分資料要「以登入使用者為單位保存」，後端必須先有可運作的登入與 session。
正式登入方式是 Google（G1，暫緩），在那之前以**只存在本機的測試帳號**（email／password）
驗證其餘所有功能。B1（`backend-d1-foundation`）已提供本機 D1、`getDb`、四張 auth 核心資料表與測試夾具，
本 change 把 better-auth 接上去，並提供 Wave 2 每個使用者資料 API 都會用到的 `requireSession`。

**前提**：B1 已合併回 `main`（本 change 的 `getDb`、`env.local`、`TEST_MIGRATIONS` 夾具皆來自 B1）。

## What Changes

- 新增 `hono-pickball/src/auth/`：
  - `createAuth(env)`：**每請求**依 env 建立 better-auth 實例（`@better-auth/drizzle-adapter`，`provider: "sqlite"`，
    `transaction: false`；`baseURL`／`trustedOrigins` 取自 `BETTER_AUTH_URL`；`secret` 取自 `BETTER_AUTH_SECRET`）。
  - `isLocalAuthEnabled(env)`：只有 `ENVIRONMENT === "development"` 才為真（D5 反向設計：缺值或任何其他值一律停用）。
  - `emailAndPassword: { enabled: isLocalAuthEnabled(env), disableSignUp: true }`。
  - `socialProviders.google` 只在 `GOOGLE_CLIENT_ID` 與 `GOOGLE_CLIENT_SECRET` 皆存在時註冊（本批永遠不存在，G1 啟用）。
  - `requireSession` middleware：無有效 session 回 `401`，有則把 `user`／`session` 放進 Hono context。
- `hono-pickball/src/index.ts` 新增三組路由（皆在 `/api/*` 之下）：
  - `GET|POST /api/auth/*` → better-auth handler；本機登入未啟用時回 `404`（D4）。
  - `GET /api/me` → `requireSession` 後回目前使用者；本機登入未啟用時回 `404`。
  - `GET /api/session` → **永遠回 `200`** 的狀態探針 `{ authEnabled, user }`，供 B3 前端決定是否顯示登入入口。
    不回 401／404 是刻意的：瀏覽器對 4xx 的 fetch 會在 console 記錄錯誤，既有 E2E 有 console 監控，訪客路徑不得因此迴歸。
- 測試帳號 seed（D5）：`src/db/seed/test-account.ts` 以 better-auth 的 `hashPassword` 產生 seed SQL；
  `scripts/seed-test-account.ts`（Node 22 type stripping 直接執行）讀 `.dev.vars` 的帳密，**只**以
  `wrangler d1 execute DB --local --env local --file` 寫入；新增 `db:seed:local` script。
- `.dev.vars.example` 補 `BETTER_AUTH_SECRET`、`BETTER_AUTH_URL`、`TEST_ACCOUNT_EMAIL`、`TEST_ACCOUNT_PASSWORD`、
  `TEST_ACCOUNT_NAME`（示意值，不含真值）；`vitest.config.ts` 以 `miniflare.bindings` 注入**測試專用**值，測試不依賴各機器的 `.dev.vars`。
- 新增 E2E `nextjs-pickball/tests/e2e/specs/auth-proxy.spec.ts`（只跑 chromium）與 helper
  `nextjs-pickball/tests/e2e/helpers/test-account.ts`：證明 session cookie 經 `/api/[[...route]]` proxy 原樣穿透。
- 改寫 `hono-pickball/CLAUDE.md`：路由清單、依賴注意（better-auth 已被匯入，解除複審）、測試慣例（gating 測試以
  `app.request(path, init, env)` 注入 env 的例外）、seed 流程。

### 明確不做

- Google 登入、遠端 D1、secrets、部署（G1）。登入頁與 navbar（B3）。任何使用者資料表（B5～B8）。
- 受保護的 seed／reset API 端點（D5 明文不建議：多一個攻擊面）。
- 不新增 npm 相依（`better-auth`、`@better-auth/drizzle-adapter`、`drizzle-orm` 皆已安裝）；**不升級 better-auth 到 1.7**
  （1.7 的 `account.issuer` 為 breaking schema 變更，見 B1 design Decision 5）。

## Capabilities

### New Capabilities

- `auth`：本機測試帳號登入的啟用條件、email／password 登入、禁止註冊、auth 實例的建立方式、
  `requireSession`／`GET /api/me`、`GET /api/session` 狀態探針、測試帳號 seed。

### Modified Capabilities

- `api-connectivity`：ADDED「better-auth 的 session cookie 經 proxy 原樣穿透」（兌現既有
  「`GET /api/cookie-check` 的 cookie 穿透契約」所說的「未來 better-auth 直接依賴此行為」）。
- `dev-workflow`：
  - MODIFIED「後端測試在 workerd runtime 中執行」：以 **B1 delta 的版本為底**，加入「需要不同 env 的測試以 `app.request(path, init, env)` 注入」
    的唯一例外與「測試 binding 由 `vitest.config.ts` 注入、不依賴 `.dev.vars`」。B1 archive 後若主 spec 該段與 B1 delta 不同，§1 MUST 以主 spec 為底重新套用本段新增內容。
  - ADDED「測試帳號 seed 與本機 auth 變數」（`db:seed:local`、`.dev.vars` 變數清單）。

## Impact

- **程式碼**：`hono-pickball/src/{index.ts, auth/**, db/seed/**}`、`hono-pickball/scripts/seed-test-account.ts`、
  `hono-pickball/{package.json, vitest.config.ts, .dev.vars.example, worker-configuration.d.ts, CLAUDE.md}`、
  `hono-pickball/test/{auth-*.test.ts, seed-test-account.test.ts}`、
  `nextjs-pickball/tests/e2e/{specs/auth-proxy.spec.ts, helpers/test-account.ts}`。
  **不動** `nextjs-pickball` 的產品程式碼（`app/`、`components/`、`hooks/`、`lib/`）。
- **API**：新增 `/api/auth/*`、`/api/me`、`/api/session`。正式部署（無 `ENVIRONMENT`、無 `DB`）下：
  `/api/auth/*` 與 `/api/me` 回 404、`/api/session` 回 `{ authEnabled: false, user: null }`，皆不觸碰 D1。
- **相依**：無新增；`pnpm-lock.yaml` 必須零變動。
- **安全**：測試帳密與 secret 只在 gitignored 的 `.dev.vars`；seed 只寫本機 D1；註冊端點關閉。
- **後續 change**：B3 依賴 `/api/session` 的回應契約、`/api/auth/sign-in/email`／`/api/auth/sign-out`、
  `db:seed:local` 與 E2E helper；Wave 2 依賴 `requireSession`。
