# Overview: google-oauth-launch

## Scope

把正式站從「auth 整組停用、無 D1」的訪客版本，改成「只能用 Google 登入、測試帳號登入在遠端維持關閉」並上線。
後端以「Google 設定是否齊全」決定 auth 是否啟用、前端登入頁依後端回報顯示 Google 按鈕、proxy 改為不跟隨轉址讓 OAuth callback 的 cookie 能回到瀏覽器；
正式 D1 宣告進 `wrangler.jsonc`。secrets、遠端 migration、Dashboard 確認與 push 全由使用者手動執行。

**Size**: large — 影響 5 個 capability（auth、api-connectivity、user-data-sync、backend-database、dev-workflow），且跨前後端兩個 Worker 與外部系統（Google、Cloudflare 遠端資源）。
**Frontend involved**: yes — 登入頁新增「使用 Google 登入」按鈕，測試帳號表單改為依後端回報顯示。
**DB schema touched**: no — 不新增 migration；只在 wrangler 設定宣告正式 D1，既有 `0000`～`0004` 由使用者套用到空的遠端 D1。
**Data migration**: no — 正式 D1 為新建空庫，沒有既有資料要搬。
**Cross-component flow**: yes — Google OAuth 是瀏覽器、前端 Worker、後端 Worker、Google 四方多次來回且順序敏感（state cookie → 授權 → callback 302＋session cookie）。

---

## What Changes

- 後端：auth 啟用 = 「development」或「Google 兩值皆有」；非 development 時 email 端點以 `disabledPaths` 回 404；Google provider 加 `prompt: "select_account"`。
- 後端：`/api/session` 多回 `signInMethods: { google, emailPassword }`。
- 前端：`fetchSession`／session store 帶出 `signInMethods`；新增 `startGoogleSignIn()`；登入頁依 `signInMethods` 顯示 Google 按鈕與測試帳號表單。
- 前端 proxy：`env.HONO_API.fetch(..., { redirect: "manual" })`。
- 設定：top-level 宣告正式 D1；`.dev.vars.example` 與 `vitest.config.ts` 補空的 Google 變數；`DB` 型別變必填、讀取端收窄。
- 文件：README 新增「正式站上線步驟」；三份 `CLAUDE.md` 同步。

正式站在各情境下的行為對照：

```
=== Before (main 35f71a4) ===
local  ENVIRONMENT=development : 測試帳號登入 / 雲端同步
remote (無 .dev.vars)           : authEnabled=false, 訪客版, 不碰 D1
remote wrangler top-level       : 無 D1

=== After ===
local  development, 無 Google   : 測試帳號登入 (同 Before)
remote 四個 secret 齊全         : authEnabled=true, 只有 Google
                                  sign-in/email, sign-up/email -> 404
remote 缺任一 Google secret     : authEnabled=false, 訪客版 (同 Before)
remote wrangler top-level       : DB -> hono-pickball (9c3a73c2-...)
```

---

## UI Mockups

`/login` 依 `signInMethods` 的各種畫面（navbar、載入中、未啟用、已登入的畫面不變）。

```
=== State 1: Before / 本機 (emailPassword only) ===

┌──────────────────────────────────────────┐
│ 登入                                     │
│ 電子郵件 [__________________]            │
│ 密碼     [__________________]            │
│ [登入]                                   │
└──────────────────────────────────────────┘

=== State 2: 正式站 (google only) ===

┌──────────────────────────────────────────┐
│ 登入                                     │
│ [使用 Google 登入]                       │  ← 無測試帳號表單
└──────────────────────────────────────────┘
        │
        │ 點擊
        ▼

=== State 3: 請求中 ===

┌──────────────────────────────────────────┐
│ 登入                                     │
│ (disabled) [使用 Google 登入]            │  ← 成功即整頁導向
└──────────────────────────────────────────┘
        │
        │ sign-in/social 失敗 (非 200 / 無 https url
        │ / 網路錯誤)
        ▼

=== State 4: 失敗 ===

┌──────────────────────────────────────────┐
│ 登入                                     │
│ [使用 Google 登入]                       │  ← 恢復可按
│ Google 登入失敗,請稍後再試               │  ← role=alert
└──────────────────────────────────────────┘

=== State 5: 兩者皆啟用 (本機自行設定 Google) ===

┌──────────────────────────────────────────┐
│ 登入                                     │
│ [使用 Google 登入]                       │  ← Google 在前
│ 電子郵件 [__________________]            │
│ 密碼     [__________________]            │
│ [登入]                                   │
└──────────────────────────────────────────┘
```

（實際錯誤文案為全形逗號的「Google 登入失敗，請稍後再試」；圖中改半形以維持對齊。）

---

## Architecture

閘門與資料流。粗體以外的模組（使用者資料 sub-app、`AccountEntry`、`resolveStorageMode`）不變。

```
 browser
   |  /login, /api/*  (same-origin)
   v
 nextjs-pickball Worker
   app/api/[[...route]]/route.ts
     env.HONO_API.fetch(url, { ..., redirect: "manual" })   <- 改
   |
   | service binding HONO_API
   v
 hono-pickball Worker
   /api/auth/*, /api/me, user-data sub-apps
     localAuth gate: isAuthEnabled(env) ? next : 404         <- 改
        isAuthEnabled = isLocalAuthEnabled || isGoogleSignInConfigured
   createAuth(env)
     emailAndPassword.enabled = isLocalAuthEnabled           (不變)
     disabledPaths = local ? [] : [/sign-in/email,
                                   /sign-up/email]           <- 新
     socialProviders.google if isGoogleSignInConfigured
        + prompt: select_account                             <- 新
   GET /api/session
     { authEnabled, user, signInMethods }                    <- 新欄位
   |
   v
 D1: local -> env.local (hono-pickball-local)
     remote -> top-level DB (hono-pickball)                  <- 新

 frontend state
   fetchSession -> session-store snapshot (spread) -> useSession
     -> LoginForm: methods = signInMethods ?? {google:false,
                                               emailPassword:true}
```

---

## Sequence Diagram

正式站一次成功的 Google 登入，與兩個失敗分支。proxy 若跟隨轉址，步驟 8 的 302 與 `Set-Cookie` 會在前端 Worker 內被吞掉。

```
 Browser       nextjs Worker      hono Worker        Google
   |                |                  |                |
 1 | POST /api/auth/sign-in/social     |                |
   |  {provider:google, callbackURL:/, errorCallbackURL:/login}
   |--------------->| fetch(manual) -->|                |
   |                |                  | 寫 verification |
   |                |<-- 200 {url} + Set-Cookie(state)  |
 2 |<-- 200 {url} + Set-Cookie(state)  |                |
 3 | navigate(url) (https only)        |                |
   |--------------------------------------------------->|
 4 |           選擇帳號 (prompt=select_account), 同意    |
 5 |<-- 302 /api/auth/callback/google?code&state -------|
 6 | GET callback (帶 state cookie)    |                |
   |--------------->| fetch(manual) -->|                |
 7 |                |                  |-- token 交換 ->|
   |                |                  |<- id token ----|
   |                |                  | 建 user/session|
 8 |                |<-- 302 Location:/ + Set-Cookie(session)
   |<-- 302 + Set-Cookie (原樣) -------|                |
 9 | GET / -> GET /api/session -> authEnabled, user    |
   |                |                  |                |
 x | 使用者取消 / state 不符:           |                |
   |<-- 302 /login 或 /api/auth/error -|                |
 y | sign-in/social 非 200 / 無 https url: 不導向,      |
   |    顯示「Google 登入失敗,請稍後再試」              |
```

---

## Task Tree

tasks.md 的依賴樹。§2 與 §3 由不同 Implementer 依序執行（同一主 repo，不並行）。

```
§1 對齊與基線 (無產品碼)
 ├── 1.1 基線計數 (unit / E2E list, 雙鎖)
 └── 1.2 與 main、主 spec、Context7 對齊
§2 後端
 ├── 2.1 設定層: vitest 注入, .dev.vars.example,
 │        wrangler top-level D1, cf-typegen, 型別收窄
 ├── 2.2 RED  B1-B6 + 授權修改 auth-session 三 it
 ├── 2.3 GREEN 述詞, 閘門, prompt, signInMethods
 ├── 2.4 RED  disabledPaths / email 404
 ├── 2.5 GREEN disabledPaths
 └── 2.6 REFACTOR
§3 前端 (依賴 §2 的 /api/session 形狀)
 ├── 3.1 RED  fetchSession, store, startGoogleSignIn
 ├── 3.2 GREEN
 ├── 3.3 RED  LoginForm F5-F9 + E2E 登入方式
 ├── 3.4 GREEN LoginForm
 ├── 3.5 RED  proxy redirect manual + E2E callback
 ├── 3.6 GREEN route.ts
 └── 3.7 REFACTOR
§4 文件與指令驗收 (依賴 §2, §3)
 ├── 4.1-4.4 三份 CLAUDE.md, README
 └── C1-C10
§5 使用者上線步驟 (人工, 不阻擋 merge / archive)
 └── U1 secrets -> U2 remote migration -> U3 Dashboard
     -> U4 確認 main -> U5 push -> U6 builds -> U7 驗收
     -> U8 同意畫面 -> U9 上線紀錄
```

---

## Cross-Cutting Impact

| 區域 | 檔案 | 變更 | 驗收 |
|---|---|---|---|
| 後端 auth | `src/auth/local-auth.ts` | 新增 `isGoogleSignInConfigured`、`isAuthEnabled` | auth-config 新 it |
| 後端 auth | `src/auth/local-auth-middleware.ts` | 閘門改看 `isAuthEnabled` | auth-gating、auth-google、既有停用 it |
| 後端 auth | `src/auth/create-auth.ts` | `disabledPaths`、`prompt`、`AuthEnv.DB` 收窄 | auth-config、auth-gating、auth-google |
| 後端路由 | `src/index.ts` | `/api/session` 加 `signInMethods` | auth-session |
| 後端 DB | `src/db/client.ts` | `getDb` 參數型別收窄 | 後端 typecheck 第二段 |
| 後端設定 | `wrangler.jsonc`、`worker-configuration.d.ts` | top-level D1；`DB` 必填 | C4、C7 |
| 後端設定 | `.dev.vars.example`、`vitest.config.ts` | 空 Google 變數 | C10 |
| 前端 auth | `lib/auth/session-client.ts` | `signInMethods`、`startGoogleSignIn` | session-client 新 it |
| 前端 auth | `lib/auth/session-store.ts` | 快照展開 | session-store 新 it |
| 前端 UI | `components/auth/LoginForm.tsx`、`app/login/page.tsx`（註解） | Google 按鈕、顯示條件 | LoginForm 新 it、E2E |
| 前端 proxy | `app/api/[[...route]]/route.ts` | `redirect: "manual"` | route 新 it、E2E、C6 |
| 文件 | root `README.md`、三份 `CLAUDE.md` | 上線步驟、secrets、Dashboard 禁止設定 | C10 |
| 不變 | `packages/**`、`src/routes/**`、`drizzle/**`、`schema.ts`、`AccountEntry`、`lib/sync/**`、`hooks/**` | — | C10 範圍檢查 |
| 遠端（使用者） | Worker secrets ×4、正式 D1 migration、Workers Builds 設定 | 人工 | §5 U1～U7 |
