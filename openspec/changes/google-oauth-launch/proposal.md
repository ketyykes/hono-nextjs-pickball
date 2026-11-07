# Proposal: google-oauth-launch

## Why

計分機制後端化（B1～B9）只在本機以測試帳號驗證過；正式站至今仍是「auth 整組停用、無 D1」的訪客版本，使用者無法登入、雲端同步無從使用。
使用者已於 2026-11-07 完成 Google Cloud Console 的 OAuth 同意畫面與 Web 用戶端、並建立正式 D1（`hono-pickball`，`9c3a73c2-9a06-4e92-bb6d-90f9cbfda513`），G1 的前置條件齊備。
本 change 依 `docs/backend-scoring-runbook-b1-b9.md`「G1 暫緩」一節、D4／D5、R1 與 B1 合併紀錄的遺留項，把正式站改為「只能以 Google 登入、測試帳號登入在遠端維持關閉」並上線。
runbook 列為「G1 前必修」的四項（import oversize 門檻、行動裝置登入入口、跨分頁換帳號、version ABA）已分別由 `2026-11-01-user-data-import-limits`、`2026-10-30-site-navbar-account-entry`、`2026-10-27-user-data-account-guard`、`2026-11-01-user-data-version-monotonic` 修掉，本 change 不重做。

## What Changes

- **後端 auth 啟用規則改為兩條獨立判斷**（`hono-pickball/src/auth/local-auth.ts`）：
  - `isLocalAuthEnabled(env)`（既有，不改）：只決定 **email／密碼（測試帳號）登入**，仍只在 `ENVIRONMENT === "development"` 成立（D5）。
  - 新增 `isGoogleSignInConfigured(env)`：`GOOGLE_CLIENT_ID` 與 `GOOGLE_CLIENT_SECRET` 皆為非空字串。
  - 新增 `isAuthEnabled(env)` ＝ 前兩者任一成立；`localAuth` 閘門（`/api/auth/*`、`/api/me`、所有使用者資料 API）改用它。兩者皆不成立時行為與現在完全相同（404、不建 auth、不碰 D1）。
- **email／密碼在非 development 一律回 404**：auth 因 Google 啟用時，`createAuth` 以 better-auth 的 `disabledPaths: ["/sign-in/email", "/sign-up/email"]` 讓兩個端點回 404、不發 cookie；`emailAndPassword.enabled` 仍取自 `isLocalAuthEnabled`（第二道防線）。
- **Google provider**：沿用既有「兩值皆有才註冊」，判斷改用 `isGoogleSignInConfigured`，並加 `prompt: "select_account"`（場邊共用裝置換人登入時必須能選帳號）。
- **`GET /api/session` 多回報 `signInMethods: { google, emailPassword }`**，前端依此決定登入頁顯示哪些登入方式；auth 停用時兩者皆 `false`。
- **前端 proxy 改以 `redirect: "manual"` 轉發**（`nextjs-pickball/app/api/[[...route]]/route.ts`）：service binding 的 `fetch` 預設會在 Worker 內跟隨 3xx，OAuth callback 的 302 與其 `Set-Cookie` 會被吞掉，Google 登入無法完成。
- **前端**：`fetchSession` 帶出 `signInMethods`、session store 快照保留它；新增 `startGoogleSignIn()`（`POST /api/auth/sign-in/social` 取得授權網址後導向）；登入頁在 `signInMethods.google` 為真時顯示「使用 Google 登入」按鈕，測試帳號表單只在 `signInMethods.emailPassword` 為真時顯示（正式站因此只剩 Google 按鈕）。
- **設定**：`wrangler.jsonc` 的 top-level 宣告正式 D1（`env.local` 維持自己的宣告、`name` 與 service binding 不變）；`.dev.vars.example` 補 `GOOGLE_CLIENT_ID`／`GOOGLE_CLIENT_SECRET`（空值）；`vitest.config.ts` 注入空的 Google 變數；`cf-typegen` 後 `DB` 變為必填，`getDb` 與 `AuthEnv` 的參數型別收窄為可為 `undefined`。
- **文件**：`hono-pickball/CLAUDE.md`（auth、wrangler、D1、`--remote` 規則）、`nextjs-pickball/CLAUDE.md`（`/login`）、root `CLAUDE.md`（CF Dashboard 側設定、secrets）、root `README.md`（部署前檢查清單第 8 步與新的「正式站上線步驟」）。
- **使用者上線步驟（人工）**：secrets、遠端 migration、Dashboard 確認、push 與部署後驗收全由使用者執行；agent 只做 `--local`／`--dry-run`。
- **BREAKING（行為層，僅遠端）**：正式站 `/api/session` 的 `authEnabled` 由 `false` 變 `true`（Google 設定齊全時），navbar 出現登入入口、`/api/auth/*` 與使用者資料 API 不再回 404。本機（`ENVIRONMENT=development`、未設 Google）行為除 `/api/session` 多一個欄位外不變。
- **BREAKING（規格層）**：`backend-database`「D1 只宣告於本機環境，正式部署設定不含 D1」移除，改為 top-level 宣告正式 D1。

### 明確不做

- 不建 staging（使用者定案）；不新增 npm 相依（前端不引入 better-auth client，自寫兩個 fetch）；不改 better-auth 版本（`hono-pickball/CLAUDE.md`：不升 1.7）。
- 不做 account linking 設定（沿用 better-auth 預設；測試帳號只存在本機 D1）；不改 `localAuth` 的名稱（改名會牽動三個 sub-app 與多份文件，見 design Decision 1）。
- 不處理 Google 登入取消／失敗後的訊息（`errorCallbackURL` 導回 `/login`，不顯示原因）；不改 `AccountEntry`、`resolveStorageMode`、使用者資料 API 本身。
- 不關閉後端 Worker 的 `workers.dev` 公開網址、不設自訂網域（列 design Risks）。
- 不更新已凍結的 `docs/backend-scoring-runbook-b1-b9.md`（該檔頁首已聲明不再更新）。

## Capabilities

### New Capabilities

（無）

### Modified Capabilities

- `auth`：MODIFIED「本機測試帳號登入只在 ENVIRONMENT 為 development 時啟用」（閘門改由 `isAuthEnabled` 判斷、非 development 時 email 端點 404）、「GET /api/session 狀態探針永遠回 200」（加 `signInMethods`）、「前端以 /api/session 作為登入狀態的唯一來源」（帶出 `signInMethods`、store 保留）、「本機測試帳號登入頁」（Google 按鈕與表單顯示條件）；ADDED「Google 登入只在 client id 與 secret 皆有值時啟用」「前端 Google 登入的請求契約」。
- `api-connectivity`：MODIFIED「`/api/*` 經 service binding 原樣轉發」（`redirect: "manual"`、3xx 原樣回傳）。
- `user-data-sync`：MODIFIED「使用者資料 API 的路由、授權與停用閘門」（閘門改為 `isAuthEnabled`）。
- `backend-database`：REMOVED「D1 只宣告於本機環境，正式部署設定不含 D1」；ADDED「正式 D1 宣告於 top-level，本機 D1 維持於 env.local」；MODIFIED「後端以 getDb 取得 D1 的 drizzle 實例」（參數型別與停用理由）。
- `dev-workflow`：REMOVED「後端 Hono app 必須帶入 binding 型別」並由 ADDED「後端 binding 型別由 wrangler types 產生且 DB 為必填」取代（既有 Scenario「產出的型別中 DB 為可選…」不再成立，MODIFIED 無法移除既有 Scenario）；MODIFIED「本機 D1 migration 流程」（`--remote` 只限使用者手動上線步驟）、「測試帳號 seed 與本機 auth 變數」（列出 Google 變數、測試注入空值）；ADDED「正式站上線步驟與遠端設定由使用者手動執行並記載於 README」。

## Impact

- **後端產品程式碼**：`hono-pickball/src/auth/local-auth.ts`、`src/auth/local-auth-middleware.ts`、`src/auth/create-auth.ts`、`src/index.ts`（`/api/session`）、`src/db/client.ts`（僅型別）。不新增檔案。
- **前端產品程式碼**：`nextjs-pickball/lib/auth/session-client.ts`、`lib/auth/session-store.ts`、`components/auth/LoginForm.tsx`、`app/api/[[...route]]/route.ts`、`app/login/page.tsx`（僅註解）。
- **設定**：`hono-pickball/wrangler.jsonc`、`hono-pickball/.dev.vars.example`、`hono-pickball/vitest.config.ts`、`hono-pickball/worker-configuration.d.ts`（cf-typegen 產物）。
- **測試**：
  - 後端新增 8 個 it：`test/auth-config.test.ts`（3）、`test/auth-session.test.ts`（1）、`test/auth-gating.test.ts`（2）、新檔 `test/auth-google.test.ts`（2）。
  - 前端新增 12 個 it：`lib/auth/session-client.test.ts`（4）、`lib/auth/session-store.test.ts`（1）、`components/auth/LoginForm.test.tsx`（5）、`app/api/[[...route]]/route.test.ts`（2）。
  - E2E 新增 2 條：`tests/e2e/specs/auth-session.spec.ts`（1，五個瀏覽器 project）、`tests/e2e/specs/auth-proxy.spec.ts`（1，只在 chromium 執行）。
  - **授權修改的既有測試（僅限下列兩處，皆為本 change 行為的必然結果）**：
    ① `hono-pickball/test/auth-session.test.ts` 的三個 it「停用且無 DB 時回 200 與 authEnabled false」「啟用但未登入時回 200 與 user null」「session 查詢拋錯時仍回 200 與 user null」：`toEqual` 的期望物件**增列** `signInMethods`（依序為 `{ google: false, emailPassword: false }`、`{ google: false, emailPassword: true }`、`{ google: false, emailPassword: true }`），其餘斷言一字不改；
    ② `nextjs-pickball/components/auth/LoginForm.test.tsx` 檔頭 `vi.mock("@/lib/auth/session-client", …)` 的 factory **增列** `startGoogleSignIn: vi.fn()`（只為新 it 提供 mock，不改任何既有 it）。
    其餘既有 it／test 的名稱與斷言一律不改。
- **文件**：`hono-pickball/CLAUDE.md`、`nextjs-pickball/CLAUDE.md`、root `CLAUDE.md`、root `README.md`。
- **相依**：不新增。**migration**：不新增（既有 `drizzle/0000`～`0004` 由使用者以 `--remote` 套用到正式 D1）。**核心套件**：零變更。
- **外部系統**：Google OAuth（使用者已建立，redirect URI 為兩個前端網址）；Cloudflare 正式 D1、Worker secrets、Workers Builds 設定（皆由使用者操作）。
- **正式站**：push 後正式站可用 Google 登入並啟用雲端同步；訪客路徑不變。
