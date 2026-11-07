# Design: google-oauth-launch

## Context

- **現況（`main` `35f71a4`）**：
  - `hono-pickball/src/auth/local-auth.ts` 的 `isLocalAuthEnabled(env)`（`ENVIRONMENT === "development"`）是**整個 auth 的唯一開關**：`localAuth` middleware（`/api/auth/*`、`/api/me`、三個使用者資料 sub-app）與 `GET /api/session` 都只看它。
    遠端沒有 `.dev.vars`，所以正式站 `authEnabled: false`、所有 auth 與使用者資料端點 404、不碰 D1。
  - `createAuth` 已預留 Google：`GOOGLE_CLIENT_ID` 與 `GOOGLE_CLIENT_SECRET` 皆 truthy 才註冊 `socialProviders.google`（`test/auth-config.test.ts`「Google provider 只在 client id 與 secret 皆存在時註冊」已守住）。`baseURL`／`trustedOrigins` 取自 `BETTER_AUTH_URL`（前端 origin，service binding 不改寫 host）。
  - `hono-pickball/wrangler.jsonc` 只在 `env.local` 宣告 D1（無 `database_id`），top-level 沒有 D1、沒有 `vars`；`worker-configuration.d.ts` 因此產生 `DB?: D1Database`。
  - 前端沒有安裝 better-auth client：`lib/auth/session-client.ts` 以 `fetch` 自寫 `fetchSession`／`signInWithEmail`／`signOut`；`LoginForm` 在 `authEnabled` 為真且未登入時一律顯示測試帳號表單；`session-store` 的 ready 快照只挑 `authEnabled` 與 `user`。
  - `app/api/[[...route]]/route.ts` 以 `env.HONO_API.fetch(request.url, { method, headers, body, duplex })` 轉發，init **沒有** `redirect`。
- **使用者定案（2026-11-07）**：Google OAuth 用戶端已建立，redirect URI 為 `http://localhost:3005/api/auth/callback/google` 與 `https://nextjs-pickball.wedsatcoming.workers.dev/api/auth/callback/google`；Client ID／Secret 不交給 agent、不得進 commit。
  正式 D1 已建立（`hono-pickball`／`9c3a73c2-9a06-4e92-bb6d-90f9cbfda513`）。不建 staging。正式前端 `https://nextjs-pickball.wedsatcoming.workers.dev`、後端 `https://hono-pickball.wedsatcoming.workers.dev`；push 到 main 即由 Workers Builds 部署。
- **runbook 遺留項查證**（`docs/backend-scoring-runbook-b1-b9.md`）：
  - 「G1 前必修」四項已修，本 change 不重做：import oversize 門檻 → `2026-11-01-user-data-import-limits`（核心 `checkImportLimits` 以後端包裝形狀量測，`IMPORT_SEGMENT_LIMIT_BYTES` 1,900,000）；行動裝置登入入口 → `2026-10-30-site-navbar-account-entry`（帳號入口各寬度可見）；跨分頁換帳號 → `2026-10-27-user-data-account-guard`（`X-Expected-User-Id`）；version ABA → `2026-11-01-user-data-version-monotonic`（`sync_version_floors`）。
  - 仍屬 G1：D4／D5（遠端 email 登入關閉）、R1（本機綠不等於上線綠）、B1 合併紀錄「Workers Builds 若設 `CLOUDFLARE_ENV=local` 或 deploy 帶 `--env` 會讀到無 `database_id` 的 `env.local`」、B4「Workers Builds 能否解析 workspace 相依」、「G1 暫緩」一節的 secrets、遠端 migration、部署順序與 account linking。
  - S1 附註「sign-in 送格式錯誤的 JSON 時 better-auth 回 500」：函式庫行為、非安全問題；正式站 email 端點改為 404 後不再觸及，本 change 不處理。
- **查證來源**：Context7 `/better-auth/better-auth/v1.6.23`（Google provider 的 `prompt: "select_account"`、`signIn.social` 的 `callbackURL`／`errorCallbackURL`、https baseURL 時預設 secure cookie、OAuth state 預設存於 verification 表並以簽章 cookie 比對、`disabledPaths`）；
  Context7 `/llmstxt/developers_cloudflare_workers_llms-full_txt`（service binding 的 `fetch()` 具 Fetch API 語意，未帶 `redirect` 時預設跟隨轉址）；本機 `node_modules` 的 better-auth 1.6.15 原始碼（`sign-in/email` 停用時回 400 `EMAIL_PASSWORD_DISABLED`；router 的 `onRequest` 以去除尾端斜線的路徑比對 `disabledPaths` 並回 404；callback 缺 state 時 `redirectOnError` 以 302 導向 `<baseURL>/api/auth/error?error=…`；Google 授權端點為 `https://accounts.google.com/o/oauth2/v2/auth`）。
  另以暫存設定實跑 `wrangler types`（`/tmp`，未動 repo）確認：top-level 與 `env.local` 皆宣告 `DB` 時產出 `DB: D1Database`（必填），`.dev.vars.example` 的空值 `GOOGLE_*` 產出必填 `string`。

## Goals

- 正式站只能以 Google 登入；測試帳號（email／密碼）在遠端 MUST 維持關閉（D5），且關閉不依賴「遠端剛好沒有測試帳號」。
- Google 設定不齊全時 fail-closed：不註冊 provider、前端不顯示 Google 按鈕、`/api/session` 照常 200；非 development 時整組 auth 與現在一樣停用。
- 本機（`ENVIRONMENT=development`、未設 Google）行為除 `/api/session` 多一個欄位外不變，既有單元測試與 E2E（含 `user-data` project）全綠。
- Google 的完整 OAuth 來回（含 302 與 `Set-Cookie`）能經前端 proxy 成立。
- 遠端操作全部由使用者執行，且每一步有確切指令與驗收方式。

## Non-Goals

- staging 環境、自訂網域、關閉後端 `workers.dev` 公開網址。
- Google 登入取消／失敗的原因提示（只導回 `/login`）、登入後回到原頁面（一律導向 `/`，與測試帳號一致）。
- account linking 設定、允許名單、使用者管理介面。
- 升級 better-auth、引入 better-auth client、新增任何 npm 相依。
- 修正與本 change 無關的既有規格漂移（例：`dev-workflow`「Hono 實例帶入 CloudflareBindings」Scenario 寫 `new Hono<{ Bindings: CloudflareBindings }>()`，實作為 `new Hono<AuthAppEnv>()`；本 change 只把該 Scenario 原樣移入新 Requirement）。

## Decisions

### Decision 1：auth 啟用拆成兩個述詞，閘門改看兩者的聯集；`localAuth` 不改名

**Choice**：`src/auth/local-auth.ts` 維持 `isLocalAuthEnabled`（只管 email／密碼），新增 `isGoogleSignInConfigured(env)`（兩值皆為非空字串）與 `isAuthEnabled(env)`（兩者任一）。
`localAuth` middleware 與 `/api/session` 的停用判斷改用 `isAuthEnabled`；`createAuth` 的 Google 註冊條件改用 `isGoogleSignInConfigured`（行為與既有 truthy 判斷等價，判斷只寫一處）、`emailAndPassword.enabled` 與 `disabledPaths` 用 `isLocalAuthEnabled`。

| env | `isLocalAuthEnabled` | `isGoogleSignInConfigured` | `isAuthEnabled` | 結果 |
|---|---|---|---|---|
| 本機（`.dev.vars` 預設） | true | false | true | 只有測試帳號 |
| 本機＋自行設定 Google | true | true | true | 兩者皆可 |
| 正式站（四個 secret 齊） | false | true | true | 只有 Google，email 404 |
| 正式站缺任一 Google secret | false | false | false | 與 G1 前相同：整組 404、不碰 D1 |

**Rationale**：
- 「Google 是否可用」由**設定是否齊全**決定、「測試帳號是否可用」由**是否為開發環境**決定，兩件事本來就獨立；用一個 `ENVIRONMENT=production` 之類的旗標同時決定兩者，忘了設時會落到哪一邊不明確。
- 缺值即關（fail-closed）沿用 D5 的反向設計：遠端少設一個 Google secret 時，正式站退回 G1 前的訪客版本，而不是「按鈕在、按下去 500」。
- 既有停用測試（`{ ...env, ENVIRONMENT: undefined, DB: undefined }`）在 Google 變數為空時仍是停用，不需改寫（Decision 9 讓測試 env 的 Google 變數固定為空字串）。

**Alternatives considered**：
- 新增 `AUTH_PROVIDERS` 或 `ENVIRONMENT=production` 變數明示開哪些登入方式：多一個要人工同步的遠端變數，且與「Google 設定齊全」重複表達；不選。
- 只要有 `GOOGLE_CLIENT_ID` 就啟用：只設一半時 provider 半啟用、callback 失敗；不選（既有 it 已鎖住「兩值皆有才註冊」）。
- 把 `localAuth` 改名為 `authGate`：名稱更貼切，但會牽動 `src/routes/{scoreboard,matchmaker,import}.ts`、`hono-pickball/CLAUDE.md` 多處與 `user-data-sync` 主 spec 的 middleware 鏈敘述，屬純改名的範圍擴張；本 change 只更新其註解，改名留待日後需要時另開。

### Decision 2：非 development 時以 better-auth 的 `disabledPaths` 讓 email 端點回 404

**Choice**：`createAuth` 傳入 `disabledPaths: isLocalAuthEnabled(env) ? [] : ["/sign-in/email", "/sign-up/email"]`；`emailAndPassword.enabled` 仍為 `isLocalAuthEnabled(env)`（第二道防線）。

**Rationale**：
- better-auth 1.6 的 router 在 `onRequest` 先以「去除 basePath 與尾端斜線」的路徑比對 `disabledPaths`，命中回 `404 Not Found`、不進 endpoint、不發 cookie（原始碼 `api/index.mjs`、`@better-auth/core` 的 `normalizePathname`；Context7 options 文件有同一範例 `disabledPaths: ["/sign-up/email", "/sign-in/email"]`）。
- 404 與「auth 停用」及既有前端 `signInWithEmail` 的 `unavailable` 對應一致；runbook 的上線驗收「email 登入端點遠端回 404」可直接以 curl 檢查。
- 只靠 `emailAndPassword.enabled: false` 時 better-auth 回 400 `EMAIL_PASSWORD_DISABLED`：雖然安全，但回應碼與停用時不同、且是函式庫行為的偶然；雙層讓任一層被誤刪時另一層仍擋住（Stage 2 mutation 會各自驗）。

**Alternatives considered**：
- 在 Hono 以 `app.post("/api/auth/sign-in/email", …)` 先攔：`test/expected-user-guard.test.ts` 以 `app.routes` 列舉 method 非 `ALL` 的路由，新路由會被當成使用者資料路由而使既有 it 轉紅，必須改既有測試的排除清單；不選。
- 以 `app.use("/api/auth/*")` 寫 middleware 比對路徑：可行但要自己處理尾端斜線與大小寫，等於重寫 `disabledPaths`；不選。
- 只依賴 `emailAndPassword.enabled: false`：見上，回 400 且單層；不選。

### Decision 3：`/api/session` 增列 `signInMethods: { google, emailPassword }`

**Choice**：auth 啟用時 `signInMethods = { google: isGoogleSignInConfigured(env), emailPassword: isLocalAuthEnabled(env) }`；停用時兩者皆 `false`。查詢 session 例外的降級分支同樣帶 `signInMethods`。
前端顯示登入入口仍只看 `authEnabled`；登入頁顯示哪種登入方式只看 `signInMethods`。

**Rationale**：
- 前端必須知道「正式站沒有測試帳號登入」才能隱藏表單；`/api/session` 已是登入狀態的唯一來源（`auth`「前端以 /api/session 作為登入狀態的唯一來源」），多一個欄位不多一個請求。
- runbook B3 已定案「前端判斷顯示與否的訊號來自後端，不用 build-time 變數」，避免兩端設定不同步。

**Alternatives considered**：
- 另開 `GET /api/auth-methods`：多一個每頁請求與一個 loading 狀態；且 `/api/auth/*` 屬 better-auth 路徑；不選。
- 只加 `googleEnabled`，email 表單仍看 `authEnabled`：正式站 `authEnabled` 為真時會顯示一個必定 404 的表單；不選。
- 前端改用 better-auth client 的能力探測：需新增相依；不選。

**代價（授權修改既有測試）**：`test/auth-session.test.ts` 三個 it 以 `toEqual` 比對整個 body，增列欄位後必然不等；授權**只**在期望物件增列 `signInMethods`（見 proposal Impact ①），其餘斷言不改。這三個 it 因此同時是新欄位的 RED。

### Decision 4：前端 `signInMethods` 為可選欄位，缺省視為 G1 之前的後端

**Choice**：`SessionState` 增列 `signInMethods?: SignInMethods`。`fetchSession`：鍵不存在 → 回傳值不含此鍵；鍵存在但形狀不符 → 整份 fail-closed（`{ authEnabled: false, user: null }`）。`session-store` 的 ready 快照改為展開 `fetchSession()` 的全部欄位。
`LoginForm`：`const methods = session.signInMethods ?? { google: false, emailPassword: true }`。

**Rationale**：
- 缺省值的語意是「G1 之前的後端」：當時 `authEnabled: true` 只可能代表測試帳號登入，所以缺省為 `{ google: false, emailPassword: true }` 是**準確**而非寬鬆的推定；
  新後端一律回此欄位，缺省分支只在「前端先部署、後端仍是舊版」的過渡期出現，而舊版後端在正式站回 `authEnabled: false`，表單根本不會顯示（Decision 12）。
- 登入頁的顯示不是安全邊界：email 端點在正式站由後端 404 擋住（Decision 2），前端多顯示或少顯示都不影響授權。
- 必填欄位會讓 `useSession` 的所有 mock（`components/**`、`hooks/**`、`lib/**` 共約 15 個測試檔以 `authEnabled` 組 session 物件）與 `tests/e2e/specs/navbar-account-entry.spec.ts` 的 `/api/session` 替身型別或行為改變，屬範圍外的大量既有測試改寫；可選欄位讓這些檔案一行不動。

**Alternatives considered**：
- 必填欄位：型別最嚴格，但需改寫約 15 個既有測試檔的 fixture；不選。
- 缺省視為 `{ google: false, emailPassword: false }`（更保守）：`LoginForm.test.tsx` 既有以 `mockLoggedOut()`（`{ authEnabled: true, user: null }`）驅動表單的 it 會全數轉紅，等於改既有斷言；且對真實的舊後端是錯誤推定；不選。

### Decision 5：前端自寫 `startGoogleSignIn(navigate?)`，不引入 better-auth client

**Choice**：`POST /api/auth/sign-in/social`，body `{ provider: "google", callbackURL: "/", errorCallbackURL: "/login" }`；200 且 `url` 為 `https:` 網址時呼叫 `navigate(url)`（預設 `window.location.assign`）並回 `{ ok: true }`，其餘回 `{ ok: false }`、不導向、不 throw。

**Rationale**：
- better-auth 的 `signIn.social` 在 client 端就是這個 POST（回 `{ url, redirect: true }`）再導向；state cookie 由同一個回應的 `Set-Cookie` 設定，經 proxy 原樣回到前端 origin。與既有三個自寫函式同一風格、同樣「絕不 throw」。
- `navigate` 參數只為讓 `session-client.test.ts` 替換導向（happy-dom 的 `location.assign` 是否可 spy 不可靠）；`LoginForm.test.tsx` 已 mock 整個 `session-client` 模組，元件測試不碰導向。
- 只接受 `https:`：防止後端被竄改或替身回傳 `javascript:` 等協定時前端照導；Google 授權端點一律 https。不寫死 `accounts.google.com`，日後換 provider 不必改前端。
- `callbackURL: "/"` 與測試帳號登入成功後 `router.replace("/")` 一致；`errorCallbackURL: "/login"` 讓取消授權時回到登入頁，而不是 better-auth 的預設錯誤頁。導回後是整頁載入，session store 第一次被訂閱時自然重新取得 session。

**Alternatives considered**：
- 安裝 `better-auth/react` client：新增相依（違反硬性規則），且其 `useSession` 與既有 store 重複；不選。
- 以 `<form method="post" action="/api/auth/sign-in/social">` 直接送出：better-auth 對 social sign-in 只接受 JSON，且回應是 JSON 而非 302；不選。
- `startGoogleSignIn` 只回傳 `url`、由 `LoginForm` 呼叫 `window.location.assign`：元件測試需 spy `location`；不選。

### Decision 6：proxy 以 `redirect: "manual"` 轉發

**Choice**：`route.ts` 的 init 增列 `redirect: "manual"`（所有 method）。回應重建方式不變（`new Response(upstream.body, { status, statusText, headers })`），3xx 的 `Location` 與多個 `Set-Cookie` 隨 `headers` 原樣保留。

**Rationale**：
- Cloudflare 文件明載：service binding 的 `fetch()` 依 Fetch API 語意，以 `(url, init)` 呼叫時隱含建立新 `Request`，`redirect` 預設 `follow`，會在呼叫端 Worker 內自行跟隨轉址；只有「Worker 收到的原始請求」預設為 `manual`，而 proxy 傳的是 URL 字串（`api-connectivity` 規定不得傳 Request 實例）。
- OAuth callback（`GET /api/auth/callback/google`）成功時 better-auth 回 302＋`Set-Cookie`（session）導向 `/`；被跟隨後瀏覽器只會在 `/api/auth/callback/google` 這個網址拿到首頁內容、沒有 session cookie，Google 登入永遠不會成功。email 登入、`/api/session` 等回 200 的端點不受影響，所以 B1～B9 沒有暴露這個問題（R1 所說「本機綠不等於上線綠」的一例）。

**Alternatives considered**：
- 只對 `/api/auth/callback/*` 設 `manual`：其他端點若日後回 3xx 也應交給瀏覽器；proxy 的原則是「原樣轉發」，不做路徑特例；不選。
- 在 proxy 內偵測 3xx 後手動重建 302：`redirect: "manual"` 已原樣回傳，多寫一層無益；不選。

**驗證限制**：`next dev` 下的 binding 是 miniflare proxy，是否跟隨轉址與 workerd 正式環境未必相同。
因此除單元測試（init 必帶 `redirect: "manual"`，**真紅**）與 `next dev` E2E（RED 當下實跑，若已是 3xx 則誠實標為 regression guard）外，C6 在 `pnpm --filter ./nextjs-pickball preview`（workerd）以 curl 驗證 callback 回 3xx；正式站再由使用者以 curl 驗證（U7）。

### Decision 7：Google provider 帶 `prompt: "select_account"`

**Choice**：`socialProviders.google = { clientId, clientSecret, prompt: "select_account" }`；scope 沿用預設（`openid email profile`）。

**Rationale**：本專案的使用情境是場邊共用裝置（`user-data-account-guard` 已處理換帳號），Google 預設會沿用瀏覽器目前的 Google 帳號直接授權，登出後下一位使用者無從選擇帳號。Context7 better-auth Google 文件以此參數「每次都要求選擇帳號」。
**Alternatives considered**：不設 prompt（換人需先登出 Google 本身）；`prompt: "consent"`（每次都要同意，干擾大）；不選。

### Decision 8：wrangler top-level 宣告正式 D1；`DB` 型別變必填後收窄讀取端

**Choice**：
- top-level 新增 `d1_databases: [{ binding: "DB", database_name: "hono-pickball", database_id: "9c3a73c2-9a06-4e92-bb6d-90f9cbfda513", migrations_dir: "drizzle" }]`；`env.local` 的宣告、`name`、無 `database_id` 皆不變；top-level 仍不設 `vars`。
- `cf-typegen` 後 `CloudflareBindings.DB` 為必填；`src/db/client.ts` 的 `getDb` 參數與 `src/auth/create-auth.ts` 的 `AuthEnv.DB` 收窄為 `D1Database | undefined`（後者的 `GOOGLE_*` 已是可選，維持）。

**Rationale**：
- bindings 不會從 top-level 繼承到具名環境（runbook「G1 暫緩」與 wrangler 文件），所以加 top-level 不影響 `wrangler dev --env local` 與 `vitest`（`environment: "local"`）。
- 必填 `DB` 會讓 `test/db-client.test.ts` 的 `getDb({ ...env, DB: undefined })` 型別錯誤（`pnpm --filter ./hono-pickball typecheck` 第二段）；`app.request(path, init, { …, DB: undefined })` 因 Hono 的 env 參數型別為 `E["Bindings"] | {}` 不受影響。收窄讀取端是型別層修正，比改既有測試正確——遠端 binding 確實可能遺失。
- 此項屬設定層／型別層（`hono-pickball/CLAUDE.md`：`wrangler.jsonc` 為設定；`dev-workflow`「binding 型別」不以單元測試驗收），以 typecheck 兩段、`wrangler deploy --dry-run` 與 cf-typegen 可重現性驗收（C1、C4、C7）。

**Alternatives considered**：
- 正式 D1 改放具名環境 `env.production` 並要求 Workers Builds 帶 `--env production`：與既有「Workers Builds 不帶 `--env`」的 Dashboard 設定相反，且漏設時部署讀 top-level（無 D1）；不選。
- 不收窄型別、改既有測試：違反「既有 it 不得改」，且型別謊稱 binding 一定存在；不選。

### Decision 9：四個正式設定一律用 Worker secret；`ENVIRONMENT` 永不設於遠端；測試注入空 Google 變數

**Choice**：
- 正式站以 `wrangler secret put` 設定 `BETTER_AUTH_SECRET`、`BETTER_AUTH_URL`、`GOOGLE_CLIENT_ID`、`GOOGLE_CLIENT_SECRET`；`wrangler.jsonc` 不設任何 `vars`。
- `ENVIRONMENT` SHALL NOT 以任何形式設於遠端（secret、`vars`、Dashboard 變數）。
- `.dev.vars.example` 增列 `GOOGLE_CLIENT_ID=`、`GOOGLE_CLIENT_SECRET=`（空值＋註解）並重跑 `cf-typegen`；`vitest.config.ts` 的 `miniflare.bindings` 增列兩者為 `""`。

**Rationale**：
- `BETTER_AUTH_SECRET`、`GOOGLE_CLIENT_SECRET` 必須是 secret；`GOOGLE_CLIENT_ID` 技術上可公開，但使用者要求不進 commit，只能是 secret；`BETTER_AUTH_URL` 不是機密，放 `vars` 可進版控，
  但會打破 `dev-workflow`「wrangler.jsonc 的 top-level 與 env.local 皆不存在 vars 鍵」的既有不變式（它防的是有人順手把 `ENVIRONMENT` 也放進 `vars`），且 cf-typegen 會把它產為字面值型別。
  多一次 `secret put` 的代價小於拆掉該不變式；secret 也不會被 `wrangler deploy` 覆寫（`vars` 才會）。
- 測試注入空字串：vitest pool 會讀開發者本機的 `.dev.vars`（`hono-pickball/CLAUDE.md` 測試慣例），有人在本機設了真 Google 值時，`exports.default` 的 env 會變成「Google 已啟用」，`signInMethods` 斷言與停用測試就隨機器而異；注入值優先於 `.dev.vars`（同節實測紀錄）。
- 範例檔用空值：被原樣 `cp` 成 `.dev.vars` 時本機維持「只有測試帳號」，不會出現指向無效 client 的按鈕；`isGoogleSignInConfigured` 視空字串為未設定。
- `.dev.vars.example` 變更**不會**觸發 root 的 cf-typegen hook（hook 只看 `wrangler.(jsonc|json|toml)`），tasks 明列手動重跑。

**Alternatives considered**：`BETTER_AUTH_URL` 放 top-level `vars`（見上）；Google 範例值填 `your-client-id` 示意值（複製後本機出現壞按鈕）；不選。

### Decision 10：測試策略——真 Google 不進自動測試

**Choice**：
- **後端（workerd，`app.request` 注入 env）**：以假 client id／secret 驗證 provider 註冊與 `prompt`、`isGoogleSignInConfigured`／`isAuthEnabled` 真值表、`disabledPaths`、非 development 時 email 端點 404、`/api/session` 的 `signInMethods`、Google 設定不全時整組停用且不碰 D1、使用者資料 API 改由 session 授權（401 而非 404），以及 `POST /api/auth/sign-in/social` 回傳的授權網址（better-auth 在本機組出網址，不需網路）。
- **前端（Vitest＋happy-dom）**：`fetchSession` 帶出／驗證 `signInMethods`、store 保留欄位、`startGoogleSignIn` 的請求形狀與失敗分類（假 `navigate`）、`LoginForm` 的按鈕顯示條件與點擊行為（mock `startGoogleSignIn`）、proxy 帶 `redirect: "manual"` 與 3xx 原樣回傳。
- **E2E（兩條）**：`auth-session.spec.ts`「登入頁的登入方式與後端回報一致」（五個瀏覽器 project；以 `/api/session` 的回報決定 Google 按鈕的期望數量，C5 執行時 `.dev.vars` 不設 Google，實際驗的是「不顯示 Google 按鈕、測試帳號表單照常」）；
  `auth-proxy.spec.ts`「經 proxy 呼叫 OAuth callback 時轉址原樣回到瀏覽器」（chromium；`maxRedirects: 0`，不帶 state 時 better-auth 以 302 導向錯誤頁，正好驗 proxy 不跟隨）。
- **選做而不做**：「以假 client id 驗證點按鈕導向 accounts.google.com」的 E2E。要讓 E2E 的後端帶 Google 變數，必須另起一組 `wrangler dev`（不同 `.dev.vars`、不同埠、前端 service binding 指不過去）或改 `playwright.config.ts` 的 webServer 指令，且會真的導覽到外部網域（網路相依、Google 錯誤頁不穩定）；
  按鈕→`startGoogleSignIn`→`navigate(url)`（前端單元）與 `sign-in/social` 回傳授權網址（後端單元）已分段覆蓋，真實來回由使用者上線驗收（U7）承擔。

**Rationale**：E2E 斷言寫成「與後端回報一致」而非寫死「沒有 Google 按鈕」：使用者可能在本機 `.dev.vars` 設真 Google 值測試登入，寫死會讓 E2E 隨個人設定失敗；以 C5 的執行條件確保預設分支被實際走過。

### Decision 11：遠端步驟只由使用者執行，獨立成 tasks 最後一組；不阻擋 merge／archive

**Choice**：
- agent（leader、Implementer、Reviewer）只做 `--local` 與 `--dry-run`；tasks §5「使用者上線步驟（人工）」逐步寫出指令與驗收方式，由使用者執行。
- 程式部分（§1～§4）完成並經 Final Code Review 與 coordinator 驗證後即可合併回 `main` 並 archive（不 push）。§5 的核取方塊在 archive 時維持未勾，leader／coordinator 依 `dev-workflow`「歸檔前必須確認 task 狀態」在 archived `tasks.md` 頁首加註實際勾選比例與「§5 為使用者上線步驟，archive 時尚未執行；未勾選不代表遺漏」。
- 使用者執行 §5 後，結果**不回填 archived `tasks.md` 的核取方塊**（該規則禁止事後補勾），改寫進 archived `design.md` 末尾的「上線紀錄」一節（日期、各步結果、curl 輸出摘要、偏差與處置），以一個 `docs(openspec):` commit 提交。
- push 本身是 §5 的一步：程式合併後 `main` 會領先 `origin/main`，**在 U1～U4（secrets、遠端 migration、Dashboard 確認）完成前不得 push**，否則正式站會在缺 secret 時部署（行為退回 G1 前的訪客版，見 Decision 1 表格最後一列，不會壞，但需要再部署一次）。

**Rationale**：遠端步驟需要使用者的 Cloudflare 與 Google 帳號權限，且依使用者規定 agent 禁止遠端操作；讓 archive 等待人工步驟會使 change 長期懸置，而程式正確性已由本機驗收證明。紀錄放 design 而非 tasks，兼顧「誠實的執行紀錄」與「上線結果可追溯」。
**Alternatives considered**：archive 前等使用者完成上線（change 懸置、阻擋後續 change 的 §1 對齊）；§5 寫成 skipped（語意錯誤：不是不做，是由別人做）；不選。

### Decision 12：push 後兩個 Worker 的部署順序與過渡期相容

**Choice**：README 與 §5 照既有規則寫「先 hono-pickball、後 nextjs-pickball」，由使用者在 Dashboard 確認兩個 build 皆成功；不另做程式層的順序保證。

**Rationale**：Workers Builds 對同一個 push 觸發兩個 Worker 的建置，完成先後不受 repo 控制。兩種過渡期都安全：
- 前端新、後端舊：舊後端在正式站回 `{ authEnabled: false, user: null }`（不含 `signInMethods`）→ 前端仍是訪客介面。
- 後端新、前端舊：新後端回 `authEnabled: true` → 舊前端 navbar 出現登入入口、`/login` 顯示測試帳號表單；送出時 email 端點 404 → 顯示「此環境未開放登入」。不會寫入任何資料，直到前端部署完成。
service binding 目標（`hono-pickball`）早已存在，前端先完成也不會部署失敗。

## Risks / Trade-offs

以下多數**本機無法驗證、只能上線後才知道**（R1），對應的上線驗收寫在 tasks §5：

- [Risk] **redirect URI 不一致**：Google 要求與登記值逐字相同；`BETTER_AUTH_URL` 多一個尾端斜線或寫成後端網址，callback 會被 Google 以 `redirect_uri_mismatch` 拒絕 → Mitigation：U1 指定確切值 `https://nextjs-pickball.wedsatcoming.workers.dev`（無尾端斜線）；後端單元測試鎖住 `redirect_uri = <BETTER_AUTH_URL>/api/auth/callback/google`；U7 實走一次。
- [Risk] **proxy 在 workerd 正式環境是否真的不跟隨轉址** → Mitigation：單元測試鎖 `redirect: "manual"`；C6 以 `preview`（workerd）curl callback；U7 以正式站 curl `GET /api/auth/callback/google` 須為 3xx。
- [Risk] **`__Secure-` cookie 經 proxy 回到瀏覽器**：https `baseURL` 時 better-auth 預設 secure cookie、名稱帶 `__Secure-` 前綴；本機為 http 無法重現 → Mitigation：前端不依賴 cookie 名稱（既有規格）；U7 在瀏覽器確認登入後重整仍登入、DevTools 可見 `__Secure-better-auth.session_token` 帶 `Secure; HttpOnly; SameSite=Lax`。
- [Risk] **Free 方案 CPU 時間上限（每請求 10 ms）**：每個需要 auth 的請求都 `createAuth`，OAuth callback 另有 token 交換與 id token 驗證；本機不受限 → Mitigation：U7 以 Dashboard Observability（`wrangler.jsonc` 已開 `observability`）檢查 callback 與 `/api/session` 是否出現 `exceededCpu`／1102；若超限另開 change（例：改付費方案或快取 auth 實例），不在本 change 處理。
- [Risk] **遠端 D1 延遲與 migration**：正式 D1 為空，未套用 migration 時 `/api/session` 降級為 `user: null`、登入 callback 500 → Mitigation：U2 套用並以 `migrations list` 確認；U7 登入後在 `/matchmaker/players` 新增一位參賽者、重整仍在，證明遠端寫入可用。
- [Risk] **secret 只設一部分**：缺 Google 任一值 → 整組停用（看起來像「什麼都沒變」）；缺 `BETTER_AUTH_URL` 或 `BETTER_AUTH_SECRET` 而 Google 齊全 → `/api/session` 降級為 `authEnabled: true, user: null` 且 `/api/auth/*` 500 → Mitigation：U1 以 `wrangler secret list` 核對恰為四個名稱；U7 的 curl 依結果判讀。
- [Risk] **遠端誤設 `ENVIRONMENT=development`**：正式站會開啟 email 登入（遠端 D1 沒有測試帳號、註冊仍停用，實際無法登入，但違反 D5）→ Mitigation：U1／U3 明列禁止並以 `secret list` 與 Dashboard Variables 核對；U7 curl email 端點須 404。
- [Risk] **Workers Builds 帶 `--env` 或設 `CLOUDFLARE_ENV`**：部署讀 `env.local`（無 `database_id`），wrangler 可能自動在遠端建立新 D1 → Mitigation：U3 人工確認；repo 內無法防範（`backend-database` 新 Requirement 已載明）。
- [Risk] **Workers Builds 解析 `packages/pickball-core`（`workspace:*`）**：root directory 為 workspace 子目錄時是否能 `pnpm install` 整個 monorepo，只能遠端驗證（runbook B4、README 既有「尚待遠端驗證」）→ Mitigation：U3 確認 build log；失敗時回滾並另開 change 調整 build command。
- [Risk] **Google 同意畫面為「測試中」**：只有列入測試使用者的帳號能登入，其他人會看到 Google 的「存取遭拒」→ Mitigation：U8 提醒使用者決定是否發布；本 change 不設允許名單（Google 首次登入即建立帳號）。
- [Risk] **後端 `hono-pickball.wedsatcoming.workers.dev` 公開可達**：可繞過前端直接呼叫 API → 接受：session cookie 落在前端網域，瀏覽器不會帶到後端網域；POST 仍受 better-auth 的 Origin 檢查；關閉 `workers_dev` 列入 Non-Goals。
- [Risk] **前端缺省 `signInMethods` 為寬鬆推定**（Decision 4）→ 接受：只影響登入頁顯示，授權由後端擋；新後端一律回此欄位。
- [Risk] **`next dev` 的 miniflare binding 可能本來就不跟隨轉址**，E2E「OAuth callback 轉址」在 RED 當下即綠 → Mitigation：依 root `CLAUDE.md` 誠實標 regression guard，紅燈由單元測試承擔；workerd 行為由 C6 驗證。
- [Risk] **主 repo 的 Stop hook 擋前端 tsc 紅燈**：§3 的 RED 會 import 尚不存在的 `startGoogleSignIn`，前端 tsconfig 含測試檔 → Mitigation：每個 RED 與其 GREEN 在同一張派工單內完成（execution-plan）。後端 `test/**` 不在 Stop hook 範圍，但 §2 仍以後端 typecheck 兩段驗收。
- [Risk] **本機 account linking**：開發者若在本機同時設 Google 且測試帳號 email 與自己的 Google email 相同，better-auth 預設會連結兩者 → 接受：只發生在本機 D1；正式 D1 沒有測試帳號。
- [Risk] **E2E「登入方式與後端回報一致」在開發者本機設了 Google 時走另一分支** → Mitigation：C5 明定 `.dev.vars` 不設 Google 並記錄 `/api/session` 輸出；斷言兩分支皆正確，不會因個人設定而假紅。

## Migration Plan

1. 程式部分（§1～§4）在 `change/google-oauth-launch` 完成、合併回 `main`、archive；**不 push**。
2. 使用者依 tasks §5（同 README「正式站上線步驟」）：U1 secrets → U2 遠端 migration → U3 Dashboard 確認 → U4 確認 `main` 內容 → U5 push → U6 確認兩個 build 成功 → U7 curl 與瀏覽器驗收 → U8 同意畫面發布決定 → U9 回填上線紀錄。
3. **回滾**：Dashboard → 各 Worker → Deployments 回滾至前一版（前端與後端各自獨立，可只回滾一個）；或 `git revert` 後 push。遠端 D1 的資料與 secrets 保留不刪（舊版程式不讀它們）。
   若只想暫停 Google 登入而保留新版程式：刪除任一 Google secret（`wrangler secret delete GOOGLE_CLIENT_ID`）即回到 Decision 1 表格最後一列的訪客版本。
4. 無 schema 變更、無資料遷移；遠端 D1 以既有 `drizzle/0000`～`0004` 從空庫建立。

## Open Questions

無待人類裁決事項。apply 期間的偏差與 coordinator 裁定記錄於此。

apply 期間 leader 的裁量（2026-11-07）：

- **測試代號**：execution-plan 的 mutation 清單引用 B1～B7、F2～F12，但 artifact 未定義對照。leader 依 test-plan 列序定義並寫進每張派工單：B1 isGoogleSignInConfigured、B2 isAuthEnabled、B3 sign-in/social、B4 session 只有 Google、B5 Google 不全停用、B6 使用者資料 401、B7 email 404、B8 disabledPaths；F1～F4 session-client 四個 it、F5～F9 LoginForm 五個 it、F10～F11 route 兩個 it、F12 session-store。
- **mutation ① 與 B4**：execution-plan 寫「① 閘門改回 `isLocalAuthEnabled`，B4 須轉紅」，但 `/api/session` 刻意不掛 `localAuth`，B4 在 ① 下必然維持綠；兩位 reviewer 另以「`/api/session` 自身閘門改 `isLocalAuthEnabled`」證明 B4 守得住，判定為計畫文字的瑕疵、非測試缺口。
- **派工內容**：plan 片段（tasks、test-plan、spec、design、派工單必帶）逐字貼入；既有產品碼與測試檔改由 subagent 直接 Read repo 內現況（而非把全文貼進派工單），因為 Implementer 編輯前本來就須 Read，且可避免貼上內容與實檔不一致。subagent 一律不得讀 `openspec/**` 與 `docs/**`。
- **已知限制（不擋）**：`isGoogleSignInConfigured` 改為 type guard 後，若傳入 cf-typegen 的 env（`GOOGLE_*` 為必填 `string`），否定分支會把 env 收窄為 `never`；目前所有呼叫端只當布林值使用，不受影響（Stage 2 第二輪實測）。日後若在否定分支內讀 `c.env`，需改為回傳 `{ clientId, clientSecret } | null` 的取值函式。
- **§3「Google 在前」斷言的替代寫法**：test-plan 指定 `compareDocumentPosition(...) & DOCUMENT_POSITION_FOLLOWING`，但 happy-dom 對 React render 出的 DOM 回傳反向值（leader 以 scratch 測試重現：`render(<div><button/><form>…<input/></form></div>)` 下 button 對 input 得 `2`、反向得 `4`；以 `innerHTML` 直接建構時則正確）。改用 `querySelectorAll("button, input")` 的 tree order 以 `indexOf` 比較，另斷言 `indexOf >= 0` 防假綠；Stage 2 以「按鈕移到表單之後」變異實證會紅。斷言意圖不變，只換量測方式。
- **§3 E2E「經 proxy 呼叫 OAuth callback…」為真紅**：design Decision 6 預期 `next dev` 下可能已是 3xx；實跑 RED 當下為 200（miniflare binding 會跟隨轉址），故此 test 是真紅而非 regression guard，也證實 `next dev` 與 workerd 同樣需要 `redirect: "manual"`。workerd 行為仍由 C6 驗證。
- **存活變異 S6（不在本 change 處理）**：`fetchSession` 無條件寫入 `signInMethods`（鍵不存在時成為 `undefined` 屬性）不會讓任何 it 轉紅——既有 it 用 `toEqual`，忽略值為 `undefined` 的屬性，Decision 4「鍵不存在 → 回傳值不含此鍵」未被釘住。補強需把既有 it 改為 `toStrictEqual` 或新增 it，前者違反「既有斷言不得修改」、後者超出 test-plan 的 +12 計數；目前行為正確（`??` 對 `undefined` 照常運作），留待後續 change。
- **§3 Stage 2 的非阻擋建議（未處理，留待後續）**：兩種登入方式皆啟用時 Google 失敗的 alert 出現在 email 表單內（「登入」按鈕上方），離 Google 按鈕較遠；`pending` 與 `googlePending` 未互鎖（刻意連點兩顆按鈕會讓導向競爭）；`ok: true` 後經 bfcache 返回時按鈕維持 disabled；`session-client.ts` 檔頭「四個函式」的計數易漏改。皆屬 UI／措辭偏好或超出 spec 的行為，依「只做 spec 要求」不在本 change 修改。
- **§4 Stage 2 建議的取捨**：必修兩項（README 缺 Google redirect URI 前置條件、hono `CLAUDE.md`「註冊停用」與 Google 首次登入自動建帳號矛盾）已修；另採納會造成誤診或與事實不符的建議（push 前分支確認、`authEnabled:false` 判讀補「新版尚未部署」、migration 清單只在首次為 0000～0004、`if (!env.DB) throw` 理由、400 防線加註實測紀錄、`route.ts` 失實的「未來」註解）。未採納：三份文件理由重複、`git revert -m 1` 寫法、補設 secret 是否需再部署的措辭（沿用 Decision 11）——屬措辭或結構偏好。
- **Final Code Review（opus）PASS，非阻擋建議留待後續**：`hono-pickball/src/index.ts` 與 `test/api-cookie-check.test.ts` 的「未來 better-auth 依賴 Set-Cookie」措辭已過時；`test/auth-gating.test.ts` 註解「等同正式部署設定：沒有 ENVIRONMENT 也沒有 DB」在正式 D1 與 Google 上線後失實（應為「等同 auth 停用的部署」）；`isGoogleSignInConfigured` 以 `Boolean()` 判斷，只含空白的值會被視為已設定（符合 spec「非空字串」，若要 `.trim()` 需另開 change）。前兩項只是註解，因審查已收斂、改動不影響行為，不再開修正輪。

## 上線紀錄（archive 後由使用者回填）

（尚未執行。使用者完成 tasks §5 後，於此記錄日期、U1～U8 各步結果、curl 輸出摘要與偏差處置；archived `tasks.md` 的 §5 核取方塊不回填。）
