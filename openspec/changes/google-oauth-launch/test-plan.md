# Test Plan: google-oauth-launch

> **RED-phase 承諾書**。只寫「先寫哪些測試、斷言什麼、為什麼先寫」，不寫實作邏輯。
>
> Tier：`integration`（後端 Vitest，在 workerd runtime 中經 `exports.default.fetch()` 或 `app.request(path, init, env)` 打真的 Hono app 與測試用 D1）；
> `unit`（後端純函式與 `createAuth(...).options` 的斷言、前端 Vitest＋happy-dom，`useSession`／`session-client` 以既有 module-level `vi.mock` 取代、proxy 以 `@vitest-environment node`）；
> `e2e`（Playwright，`tests/e2e/specs/`，五個瀏覽器 project；需 `.dev.vars` 的測試帳密）。
>
> **it／test 名稱 MUST 與 delta spec 的「驗收」錨點逐字一致。**
>
> **後端 env 的共同要求**：需要「非 development」「Google 齊全／不全」「無 DB」的 it 一律以 `import app from "../src/index"` 後 `app.request(path, init, { ...env, 覆寫 })` 注入（`exports.default` 的 env 由 pool 固定）。
> 假的 Google 值固定為 `GOOGLE_CLIENT_ID: "fake-client-id"`、`GOOGLE_CLIENT_SECRET: "fake-client-secret"`；「非 development」一律寫 `ENVIRONMENT: undefined`（正式站實況）。
> `POST /api/auth/*` 一律帶 `Origin: http://localhost:3005`（`hono-pickball/CLAUDE.md` 測試慣例）。同檔 it 共用 D1，seed 的 email 各自不同。
>
> **前端 mock 的共同要求**：`LoginForm.test.tsx` 的新 it 以 `mockUseSession.mockReturnValue({ status: "ready", authEnabled: true, user: null, signInMethods: {...}, refresh })` 驅動；
> 檔頭 `vi.mock("@/lib/auth/session-client")` 的 factory 依授權增列 `startGoogleSignIn: vi.fn()`；既有 `afterEach(vi.resetAllMocks)` 不改。
> `startGoogleSignIn` 的導向以第一個參數注入假 `navigate`（`vi.fn()`），SHALL NOT spy `window.location`。

## auth

### Requirement: 本機測試帳號登入只在 ENVIRONMENT 為 development 時啟用（MODIFIED）

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| 非 development 時 disabledPaths 封鎖 email 登入與註冊，development 時不封鎖 | disabledPaths 隨 isLocalAuthEnabled 切換 | `createAuth({ ...env, ENVIRONMENT: "development" }).options.disabledPaths` `toEqual([])`；`createAuth({ ...env, ENVIRONMENT: undefined }).options.disabledPaths` 排序後 `toEqual(["/sign-in/email", "/sign-up/email"])` | 第二輪 RED（§2.4）：第一輪 GREEN 後 `disabledPaths` 仍為 `undefined` → **真紅**；設定層的直接證據 | unit |
| 非 development 且 Google 設定齊全時 email 登入與註冊回 404 且不發 cookie | 非 development 且 Google 設定齊全時 email 登入與註冊仍回 404 | seed `gating-google-email@example.com`；env `ENVIRONMENT: undefined`＋假 Google → `POST /api/auth/sign-in/email`（正確帳密）status 404、`set-cookie` 為 null；`POST /api/auth/sign-up/email`（`gating-google-signup@example.com`）status 404、`set-cookie` 為 null；`SELECT count(*) FROM user WHERE email = 'gating-google-signup@example.com'` 為 0 | 第二輪 RED（§2.4）：第一輪 GREEN 開啟閘門後 better-auth 對停用的 email 回 400 → **真紅**；守住 D5「遠端 email 登入關閉」 | integration |
| （既有）ENVIRONMENT 缺值時 sign-in 回 404 且不發 cookie；ENVIRONMENT 為 production 時 sign-in 回 404 且不發 cookie；停用且無 DB binding 時 auth 路由與 /api/me 皆回 404 | ENVIRONMENT 缺值時…／為非 development 值時…／停用時不觸碰 D1 | 原樣通過（測試 env 的 Google 變數為 `""`，`isAuthEnabled` 為假） | regression guard——閘門改看 `isAuthEnabled` 後，未設 Google 的停用路徑不得變 | integration |
| （既有）isLocalAuthEnabled 只在 ENVIRONMENT 恰為 development 時為真 | isLocalAuthEnabled 只接受字面值 development | 原樣通過 | regression guard（函式不改） | unit |

### Requirement: GET /api/session 狀態探針永遠回 200（MODIFIED）

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| 非 development 且 Google 設定齊全時回 authEnabled true 與只有 Google 的 signInMethods | 非 development 且 Google 設定齊全時回報只有 Google 登入 | `app.request("/api/session", {}, { ...env, ENVIRONMENT: undefined, 假 Google })` → 200，`toEqual({ authEnabled: true, user: null, signInMethods: { google: true, emailPassword: false } })` | golden path（正式站的探針）；現行為 `authEnabled: false` → **真紅** | integration |
| （既有，授權增列欄位）停用且無 DB 時回 200 與 authEnabled false | 停用時回 authEnabled false 且不需要 DB | 期望物件增列 `signInMethods: { google: false, emailPassword: false }`，其餘不改 | 增列後現行回應不含此鍵 → **真紅**；GREEN 後為停用分支的 regression guard | integration |
| （既有，授權增列欄位）啟用但未登入時回 200 與 user null | 啟用但未登入時回 user null | 期望物件增列 `signInMethods: { google: false, emailPassword: true }` | 同上 → **真紅**（本機的探針形狀） | integration |
| （既有，授權增列欄位）session 查詢拋錯時仍回 200 與 user null | session 查詢失敗時降級為 user null | 期望物件增列 `signInMethods: { google: false, emailPassword: true }`；`console.error` 與 `/api/me` 500 的斷言不改 | 同上 → **真紅**；守住降級分支也帶欄位 | integration |
| （既有）登入後回 200 與目前使用者的 id、email 與 name | 登入後回目前使用者 | 原樣通過（只查 `authEnabled` 與 `user`，不以 `toEqual` 比整個 body） | regression guard | integration |

### Requirement: 前端以 /api/session 作為登入狀態的唯一來源（MODIFIED）

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| fetchSession 回傳後端提供的 signInMethods | 回應含 signInMethods 時一併回傳 | `fetch` 回 200 `{ authEnabled: true, user: null, signInMethods: { google: true, emailPassword: false } }` → `toEqual` 同一物件 | golden path；現行只取 `authEnabled`／`user` → **真紅** | unit |
| signInMethods 形狀不符時 fetchSession 回傳未啟用 | signInMethods 形狀不符時降級為未啟用 | 四種 `signInMethods`（`null`、`"google"`、`{ google: true }`、`{ google: "yes", emailPassword: false }`）逐一 → `toEqual({ authEnabled: false, user: null })` | fail-closed 邊界；現行忽略此鍵而回 `authEnabled: true` → **真紅** | unit |
| fetchSession 回傳 signInMethods 時快照保留同一份 signInMethods | session store 的快照保留 signInMethods | `mockedFetchSession.mockResolvedValue({ authEnabled: true, user: null, signInMethods: { google: true, emailPassword: false } })`；訂閱後 `waitFor` → `getSnapshot()` `toEqual({ status: "ready", authEnabled: true, user: null, signInMethods: { google: true, emailPassword: false } })` | 現行快照只挑兩欄 → **真紅**；沒有它 `LoginForm` 永遠拿不到欄位 | unit |
| （既有）fetchSession 於 200 且形狀正確時回傳 authEnabled 與 user；fetchSession 以 keepalive 發出請求；fetchSession 於非 200、形狀不符或網路錯誤時回傳未啟用且不拋錯 | 回應正確時原樣回傳／session 請求以 keepalive 發出／任何失敗都降級為未啟用 | 原樣通過（payload 不含 `signInMethods` 時回傳值不含此鍵，`toEqual` 不變） | regression guard——Decision 4「缺省不補鍵」的守門 | unit |
| （既有）session-store 與 useSession 的全部 it | 「全頁共用的 session store 與 useSession」各 Scenario（主 spec，不在本 delta） | 原樣通過（mock 不含 `signInMethods`，展開後快照不變） | regression guard——快照改為展開後不得改變既有形狀與參考穩定性 | unit |

### Requirement: 本機測試帳號登入頁（MODIFIED）

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| 只啟用 Google 時顯示使用 Google 登入按鈕且不顯示測試帳號表單 | 只啟用 Google 時只顯示 Google 按鈕 | `signInMethods: { google: true, emailPassword: false }` → `getByRole("button", { name: "使用 Google 登入" })` 存在；`queryAllByRole("textbox")` 為 `[]`、`input[type=password]` 為 null、`queryByRole("button", { name: "登入", exact: true })` 為 null、`queryByText("此環境未開放登入")` 為 null | golden path（正式站畫面）；現行無此按鈕且照樣顯示表單 → **真紅** | unit |
| Google 與測試帳號皆啟用時兩種登入方式皆顯示且 Google 在前 | Google 與測試帳號皆啟用時兩者皆顯示 | `{ google: true, emailPassword: true }` → Google 按鈕、「電子郵件」「密碼」、「登入」皆存在；`googleButton.compareDocumentPosition(emailInput) & Node.DOCUMENT_POSITION_FOLLOWING` 為真 | 版面順序的承諾；現行無按鈕 → **真紅** | unit |
| 快照不含 signInMethods 時只顯示測試帳號表單 | 快照不含 signInMethods 時只顯示測試帳號表單 | `{ status: "ready", authEnabled: true, user: null }` → 「電子郵件」「密碼」存在，`queryByRole("button", { name: "使用 Google 登入" })` 為 null | **regression guard**（現行即如此，寫入即綠，紀錄中點名）；守 Decision 4 的缺省值——實作若把缺省改成 `emailPassword: false` 或 `google: true` 會轉紅 | unit |
| 點擊使用 Google 登入後呼叫 startGoogleSignIn 且按鈕維持 disabled | 點擊 Google 按鈕後呼叫 startGoogleSignIn 並維持 disabled | 只啟用 Google；`mockStartGoogleSignIn.mockResolvedValue({ ok: true })` → 點擊後 `toHaveBeenCalledTimes(1)`；`waitFor` 按鈕 `disabled === true`；再 `await` 一個 microtask 後仍為 disabled；`queryByRole("alert")` 為 null；`mockReplace` 未被呼叫 | 互動核心；現行無按鈕 → **真紅** | unit |
| Google 登入請求失敗時顯示錯誤訊息並恢復按鈕 | Google 登入請求失敗時顯示錯誤並恢復按鈕 | `mockResolvedValue({ ok: false })` → `findByRole("alert")` 文字為「Google 登入失敗，請稍後再試」；`waitFor` 按鈕 `disabled === false` | 失敗分支；現行無按鈕 → **真紅** | unit |
| 登入頁的登入方式與後端回報一致 | 登入頁的登入方式與後端回報一致 | 訪客 context；`page.request.get("/api/session")` 的 `signInMethods.google`、`emailPassword` 皆為 `boolean`（`expect(typeof …).toBe("boolean")`）；`page.goto("/login")` 後先等待 `expect(page.getByLabel("電子郵件")).toBeVisible()`（`emailPassword` 為真時）或 Google 按鈕可見（`google` 為真時），再斷言 `getByRole("button", { name: "使用 Google 登入" })` `toHaveCount(google ? 1 : 0)` | 端到端證據（真後端＋真 proxy＋真 store）；現行 `/api/session` 無此欄位，`typeof` 斷言即紅 → **真紅**——因此 MUST 在後端 GREEN（tasks §2.3）**之前**寫入並看到紅燈（排在 §2.2）；C5 時 `.dev.vars` 不設 Google | e2e |
| （既有）LoginForm 的 10 個 it、`/login` metadata 的 it | 載入中…／未啟用…／已登入…／已登入時可於登入頁登出／登入成功後導向首頁／帳密錯誤…／其他失敗…／送出期間按鈕為 disabled／登入頁不進搜尋索引 | 原樣通過（mock 不含 `signInMethods` → 缺省為只有測試帳號） | regression guard | unit |
| （既有）以測試帳號登入後 navbar 顯示登出；帳號或密碼錯誤時登入頁顯示錯誤訊息；重整後仍維持登入；登出後 navbar 回到登入入口；窄螢幕下可經由登入頁登入與登出 | 以測試帳號經由登入頁登入／錯誤密碼…／重整後仍維持登入／登出後回到訪客／窄螢幕下經由登入頁登入與登出 | 原樣通過 | regression guard（本機測試帳號流程不變） | e2e |

### Requirement: Google 登入只在 client id 與 secret 皆有值時啟用（ADDED）

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| isGoogleSignInConfigured 只在 client id 與 secret 皆為非空字串時為真 | isGoogleSignInConfigured 只在兩值皆為非空字串時為真 | 六種輸入（`{}`、只有 id、只有 secret、兩者 `""`、id 為 `""` 而 secret 有值、兩者非空）→ 只有最後一種 `true` | 新函式不存在 → **真紅**；fail-closed 的定義 | unit |
| isAuthEnabled 在 development 或 Google 設定齊全時為真 | isAuthEnabled 在 development 或 Google 設定齊全時為真 | 五種組合 → `[true, true, true, false, false]` | 新函式不存在 → **真紅**；Decision 1 的真值表 | unit |
| 非 development 且 Google 設定齊全時 sign-in/social 回傳導向 Google 的授權網址 | 非 development 且 Google 設定齊全時 sign-in/social 回傳 Google 授權網址 | env `ENVIRONMENT: undefined`＋假 Google；`POST /api/auth/sign-in/social` body `{ provider: "google", callbackURL: "/", errorCallbackURL: "/login" }` → 200；`body.redirect === true`；`new URL(body.url)` 的 `origin` 為 `https://accounts.google.com`、`pathname` 為 `/o/oauth2/v2/auth`；`searchParams.get("client_id")` 為 `fake-client-id`、`redirect_uri` 為 `http://localhost:3005/api/auth/callback/google`、`prompt` 為 `select_account`、`scope` 以空白切分後含 `openid`、`email`、`profile` | golden path（正式站的 Google 入口）；現行閘門 404 → **真紅**；`prompt` 斷言另擋 Decision 7 | integration |
| 非 development 且 Google 設定不全時 auth 整組停用且不觸碰 D1 | 非 development 且 Google 設定不全時 auth 整組停用且不觸碰 D1 | env `{ ...env, ENVIRONMENT: undefined, DB: undefined, GOOGLE_CLIENT_ID: "fake-client-id", GOOGLE_CLIENT_SECRET: "" }` → `/api/session` 200 且 `toEqual({ authEnabled: false, user: null, signInMethods: { google: false, emailPassword: false } })`；`POST /api/auth/sign-in/social` 404；`GET /api/me` 404 | fail-closed 的端到端證據；現行 `/api/session` 不含 `signInMethods` → **真紅**（404 兩段在現行即成立，GREEN 後守「只設一半不得半啟用」） | integration |
| （既有）Google provider 只在 client id 與 secret 皆存在時註冊 | 「auth 實例每請求依 env 建立」的 Scenario「Google 只在兩個變數皆存在時註冊」（主 spec，不在本 delta） | 原樣通過（`toMatchObject` 容許多出的 `prompt`） | regression guard——判斷改用 `isGoogleSignInConfigured` 後不得變 | unit |

### Requirement: 前端 Google 登入的請求契約（ADDED）

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| startGoogleSignIn 以 JSON POST 至 /api/auth/sign-in/social 並導向回傳的網址 | startGoogleSignIn 送出 social sign-in 並導向回傳的網址 | `fetch` 回 200 `{ url: "https://accounts.google.com/o/oauth2/v2/auth?client_id=x", redirect: true }`；`navigate = vi.fn()` → 回傳 `{ ok: true }`；`fetch` 呼叫一次，URL `/api/auth/sign-in/social`、method `POST`、`Content-Type` `application/json`、`JSON.parse(body)` `toEqual({ provider: "google", callbackURL: "/", errorCallbackURL: "/login" })`；`navigate` 以該 url 呼叫一次 | golden path；函式不存在 → **真紅** | unit |
| startGoogleSignIn 於非 200、缺少網址、非 https 或網路錯誤時回傳失敗且不導向 | startGoogleSignIn 失敗時不導向且不拋錯 | 六種情況逐一（500、200 非 JSON、200 缺 `url`、`javascript:alert(1)`、`http://accounts.google.com/`、`fetch` reject）→ `resolves.toEqual({ ok: false })`，`navigate` 未被呼叫 | fail-closed 與 open-redirect 防護；函式不存在 → **真紅** | unit |

## api-connectivity

### Requirement: `/api/*` 經 service binding 原樣轉發（MODIFIED）

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| 轉發時以 redirect: manual 呼叫 binding，不在 proxy 內跟隨轉址 | 轉發不在 proxy 內跟隨轉址 | 以 GET 與 POST（帶 body）各呼叫一次 → 兩次 `lastCall().init.redirect` 皆為 `"manual"` | Google 登入能否完成的關鍵；現行 init 無 `redirect` → **真紅** | unit |
| upstream 的 3xx 轉址連同 Location 與多個 Set-Cookie 原樣回傳 | upstream 的轉址連同 Location 與 Set-Cookie 原樣回傳 | `fetchSpy.mockResolvedValueOnce(new Response(null, { status: 302, headers: [["location","http://localhost:3005/"],["set-cookie","a=1; Path=/"],["set-cookie","b=2; Path=/"]] }))` → 回應 `status` 302、`headers.get("location")` 相同、`headers.getSetCookie()` `toEqual(["a=1; Path=/", "b=2; Path=/"])` | **regression guard**（現行以 `headers` 重建即保留，寫入即綠，紀錄中點名）；鎖住「manual 之後瀏覽器真的拿得到 cookie」 | unit |
| 經 proxy 呼叫 OAuth callback 時轉址原樣回到瀏覽器 | OAuth callback 的轉址經 proxy 回到瀏覽器 | chromium；`request.get("/api/auth/callback/google", { maxRedirects: 0 })` → `status()` 在 300～399，`headers()["location"]` 以 `http://localhost:3005/` 開頭 | 端到端證據；`next dev` 的 miniflare binding 是否跟隨轉址未知——RED 當下實跑：紅即真紅、綠則誠實標 **regression guard**（紅燈由上方單元測試承擔；workerd 行為由 C6 驗） | e2e |
| （既有）GET 請求不帶 body 也不帶 duplex；HEAD 請求不帶 body 也不帶 duplex；POST 請求帶 request.body 與 duplex: half；PUT / PATCH / DELETE 皆走同一 proxy handler；轉發時第一參數為原始 request.url，host 與 query string 不被改寫；回傳的 Response 為新實例且保留 status / statusText / body | GET / HEAD 不帶 body 與 duplex／有 body 的 method 帶 duplex: half／七個 method 共用同一 handler／URL 不被改寫且不傳 Request 實例／回傳為本 realm 重建的 Response | 原樣通過（另含未掛 Scenario 的既有 it「轉發時保留原始 method 與 headers」） | regression guard | unit |

## user-data-sync

### Requirement: 使用者資料 API 的路由、授權與停用閘門（MODIFIED）

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| 非 development 且 Google 設定齊全時使用者資料 API 未登入回 401 | 非 development 且 Google 設定齊全時使用者資料 API 改由 session 授權 | env `ENVIRONMENT: undefined`＋假 Google；不帶 cookie `GET /api/scoreboard/current` 與 `GET /api/matchmaker/players` → 皆 401、`toEqual({ error: "UNAUTHORIZED" })` | 正式站雲端同步可用的前提；現行閘門 404 → **真紅** | integration |
| （既有）auth 停用且無 DB binding 時 GET 與 PUT /api/scoreboard/current 皆回 404；未登入呼叫 GET 與 PUT /api/scoreboard/current 皆回 401；B 的 cookie 讀不到 A 的計分板且寫入不影響 A；各使用者資料端點的「auth 停用回 404」it（`matchmaker-*.test.ts`、`local-import.test.ts`、`expected-user-guard.test.ts`）；auth 型別測試 | auth 停用時使用者資料 API 回 404 且不觸碰 D1／未登入呼叫使用者資料 API 回 401／只能存取本人的資料／未經 requireSession 的 handler 讀取 user 為型別錯誤 | 原樣通過；型別 Scenario 由 C1 的後端 typecheck 第二段守住 | regression guard——閘門改看 `isAuthEnabled` 後，既有授權覆蓋表不得變；`expected-user-guard` 的路由列舉數不得變（本 change 不新增路由） | integration |

## backend-database

### Requirement: 正式 D1 宣告於 top-level，本機 D1 維持於 env.local（ADDED，設定層）

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| （指令驗收 C4）`pnpm --filter ./hono-pickball build` | 正式部署設定的 dry-run 列出正式 D1 | exit 0；dry-run 輸出的 binding 清單含 `env.DB` 與 `hono-pickball`（`9c3a73c2-9a06-4e92-bb6d-90f9cbfda513`） | 設定層，不強制紅燈；部署設定正確性的唯一本機證據 | integration |
| （指令驗收 C5）E2E 的 webServer 啟動 | 本機環境的 worker 名稱維持 hono-pickball | 後端 webServer 以 `/api/health` 通過 readiness、前端 service binding 找到 `hono-pickball`（全套 E2E 可跑即證） | regression guard | e2e |
| （既有）測試用 D1 已套用 TEST_MIGRATIONS 的全部 migration；（指令驗收 C10）wrangler.jsonc 與 vitest.config.ts 的檢查 | 本機測試與 dev 仍使用 env.local 的本機 D1 | 原樣通過；C10 以 `node -e` 解析 jsonc（去註解）確認 `env.local.d1_databases[0]` 無 `database_id`、`database_name` 為 `hono-pickball-local`，`vitest.config.ts` 含 `environment: "local"` | regression guard——top-level 新增 D1 不得讓測試改連正式 D1 | integration |

### Requirement: 後端以 getDb 取得 D1 的 drizzle 實例（MODIFIED）

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| （既有）getDb 回傳的實例可寫入並讀回 user 資料列；DB binding 不存在時 getDb 立即拋出含 DB 字樣的錯誤 | 取得的實例可寫入並讀回資料／DB binding 不存在時立即拋錯 | 原樣通過；且 C1 的後端 typecheck 第二段 exit 0（`getDb({ ...env, DB: undefined })` 在 `DB` 變必填後仍合法） | regression guard＋型別層驗收（收窄參數型別的唯一證據） | integration |

## dev-workflow

### Requirement: 後端 binding 型別由 wrangler types 產生且 DB 為必填（ADDED，型別層）

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| （指令驗收 C7）cf-typegen 可重現性 | 產出的型別含必填的 DB 與 Google 變數且可重現 | 已 commit 狀態下 `pnpm --filter ./hono-pickball cf-typegen` 後 `git diff --exit-code -- hono-pickball/worker-configuration.d.ts` exit 0；`grep` 該檔 `__BaseEnv_CloudflareBindings` 區塊含 `DB: D1Database`、`GOOGLE_CLIENT_ID: string`、`GOOGLE_CLIENT_SECRET: string`，全檔不含 `DB?:` | 型別層不以單元測試驗收（既有規則） | integration |
| （指令驗收 C1）三段 typecheck | Hono 實例帶入 CloudflareBindings／型別檢查通過 | 皆 exit 0 | regression guard | integration |

### Requirement: 本機 D1 migration 流程（MODIFIED）

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| （指令驗收 C10）scripts 不含 `--remote` | package.json 的 script 不含 --remote | `node -e` 讀兩個 workspace 的 `package.json`，`Object.values(scripts).some(s => s.includes("--remote"))` 為 false | 設定層檢查 | integration |
| （§1 基線）`db:migrate:local` 成功；`db:generate` 不產生新檔 | migration 可從零套用到本機 D1／schema 與 migration 無漂移 | 原樣成立（本 change 不動 schema） | regression guard | integration |

### Requirement: 測試帳號 seed 與本機 auth 變數（MODIFIED）

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| （指令驗收 C10）範例檔與 vitest 注入 | 範例檔列出空值的 Google 變數且測試注入空值 | `grep -n '^GOOGLE_CLIENT_ID=$' hono-pickball/.dev.vars.example` 與 `^GOOGLE_CLIENT_SECRET=$` 各一行；`grep -n 'GOOGLE_CLIENT_ID: ""' hono-pickball/vitest.config.ts` 與 secret 各一行 | 設定層檢查；`.dev.vars` 不影響測試結果的前提 | integration |
| （既有，§1／C5）seed 指令可建立可登入的測試帳號；缺少帳密變數時 seed 以非 0 結束；後端測試結果不受本機 .dev.vars 影響 | seed 指令可在本機建立可登入的測試帳號／缺少帳密變數時 seed 以非 0 結束／後端測試結果不受本機 .dev.vars 影響 | 原樣成立：E2E globalSetup 的 seed＋登入成功即證第一項；`test/seed-test-account.test.ts` 守第二項；第三項由注入空 Google 值確保（本 change 不搬動開發者的 `.dev.vars`） | regression guard | integration |

### Requirement: 正式站上線步驟與遠端設定由使用者手動執行並記載於 README（ADDED，文件層）

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| （指令驗收 C10）README 內容 | README 記載正式站上線步驟 | `grep -n` root `README.md` 依序找到 Scenario 列出的各字串（以 python 檢查出現順序），且第 8 步行內含「正式站上線步驟」 | 文件層檢查 | integration |
| （指令驗收 C10）root CLAUDE.md 內容 | root CLAUDE.md 記載 secrets 與禁止的 Dashboard 設定 | 「CF Dashboard 側設定」小節（至下一個 `##`／`###` 標題前）含四個 secret 名稱與 `CLOUDFLARE_ENV` | 文件層檢查 | integration |
| （指令驗收 C8）憑證外洩檢查 | commit 不含 OAuth 憑證 | `git log -p main..HEAD \| grep -E 'apps\.googleusercontent\.com\|GOCSPX-'` 無輸出（exit 1） | 安全檢查；使用者硬性要求 | integration |

## 後端 API 授權覆蓋表

本 change **不新增**任何使用者資料端點，四類測試沿用各端點既有 it（`user-data-sync`「使用者資料 API 的路由、授權與停用閘門」），名稱與斷言一律不改。
閘門判斷改為 `isAuthEnabled` 影響全部端點，故另以 B6 補上「非 development 但 Google 齊全」這個新的啟用來源：

| 端點 | 未登入 401 | 存取他人資料被拒 | auth 停用 404 | 預期帳號不符 401 |
|---|---|---|---|---|
| `GET`／`PUT /api/scoreboard/current` | 「未登入呼叫 GET 與 PUT /api/scoreboard/current 皆回 401」；新增「非 development 且 Google 設定齊全時使用者資料 API 未登入回 401」（GET） | 「B 的 cookie 讀不到 A 的計分板且寫入不影響 A」 | 「auth 停用且無 DB binding 時 GET 與 PUT /api/scoreboard/current 皆回 404」 | `expected-user-guard.test.ts` 的列舉 it（不改） |
| `/api/matchmaker/*`、`/api/import/*` 其餘端點 | 各自既有 it；`GET /api/matchmaker/players` 另由新增 it 覆蓋 | 各自既有 it | 各自既有 it | 同上 |

## 指令驗收（非 Vitest，tasks 中標為「驗收（指令）」）

| # | 對應 Scenario | 指令 | 期望 |
|---|---|---|---|
| C1 | 型別檢查通過；getDb 參數收窄 | `pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball -r exec tsc --noEmit`；`pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball/hono-pickball typecheck`；`pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball/packages/pickball-core typecheck` | 皆 exit 0 |
| C2 | （lint） | `pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball lint`（雙鎖） | 0 errors、warning 不多於基線 |
| C3 | （單元） | `pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball test`（雙鎖） | 三組皆綠；前端檔數不變、測試數＝基線＋12；後端檔數＋1（`auth-google.test.ts`）、測試數＝基線＋8；核心與基線相同 |
| C4 | 正式部署設定的 dry-run 列出正式 D1 | `pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball build`（雙鎖），另保存 hono-pickball 段的 dry-run 輸出 | exit 0；binding 清單含 `env.DB`／`hono-pickball`；建置後 `git status --porcelain` 為空 |
| C5 | 登入頁的登入方式與後端回報一致；OAuth callback 的轉址經 proxy 回到瀏覽器；本機 worker 名稱維持 hono-pickball；既有 E2E 全綠 | `.dev.vars` 齊備且**未設定** `GOOGLE_*`；先記錄 `curl -s http://localhost:8787/api/session` 的輸出；依 project 分開跑 `pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball/nextjs-pickball exec playwright test --workers=1 --project=<p>`（chromium、firefox、mobile-chrome、user-data 各一次；webkit、mobile-safari 各 `--shard=1/3`～`3/3`），每次雙鎖、前後清殘留 | `--list`：五個瀏覽器 project 各＝基線＋2、user-data＝基線；執行：chromium 新增 2 passed，firefox／webkit／mobile-chrome／mobile-safari 各新增 1 passed＋1 skipped（`auth-proxy` 只在 chromium），user-data 與基線相同；全部 0 failed、無因缺帳密 skip |
| C6 | （workerd 整合）proxy 不跟隨轉址 | 雙鎖下先起後端 `pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball/hono-pickball dev`（背景），再起 `pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball/nextjs-pickball preview`（背景），埠號以 preview 啟動輸出的 `Ready on http://localhost:<port>` 為準並記錄；`curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' http://localhost:<port>/api/auth/callback/google` 與 `curl -s http://localhost:<port>/api/session` | 前者為 3xx 且 redirect_url 非空；後者含 `"signInMethods":{"google":false,"emailPassword":true}`；結束後只 kill 本次自起且路徑含本 repo 的 PID，`lsof -i :3005 -i :8787 -i :<port>` 為空。callback 不帶 state 時 better-auth 一律轉址到錯誤頁，不需改 `.dev.vars` |
| C7 | 產出的型別含必填的 DB 與 Google 變數且可重現 | `pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball/hono-pickball cf-typegen`；`git -C /Users/m2_24gb/Desktop/project/nextjs-pickball diff --exit-code -- hono-pickball/worker-configuration.d.ts`；grep 檢查 | diff exit 0；grep 如上表 |
| C8 | commit 不含 OAuth 憑證 | `git -C /Users/m2_24gb/Desktop/project/nextjs-pickball log -p main..HEAD \| grep -E 'apps\.googleusercontent\.com\|GOCSPX-'` | 無輸出 |
| C9 | （規格） | `DO_NOT_TRACK=1 openspec validate google-oauth-launch --strict`（repo root） | valid |
| C10 | 設定與文件檢查（scripts 無 `--remote`、範例檔與 vitest 注入、env.local 不變、README、root CLAUDE.md）；範圍 | 上表各列的 `node -e`／`grep`／python 檢查；`git diff main --stat` | 各檢查通過；`git diff main --stat` ⊆ proposal Impact；`git diff main --stat -- packages nextjs-pickball/components/layout nextjs-pickball/lib/sync nextjs-pickball/hooks hono-pickball/src/routes hono-pickball/drizzle hono-pickball/src/db/schema.ts openspec/specs` 輸出為空 |

## Checklist

- [x] 每個 Requirement 至少一列（MODIFIED 8、ADDED 5、REMOVED 2 由其取代者承接）
- [x] 每個 Scenario 至少一列（新增 Scenario 各有專屬列；MODIFIED 帶入的既有 Scenario 以「（既有）」列合併）
- [x] 每列皆有 Tier（unit | integration | e2e）
- [x] 授權修改的既有測試只有兩處（`auth-session.test.ts` 三個 it 的期望物件增列欄位、`LoginForm.test.tsx` 的 mock factory 增列一個函式），皆標明原因
- [x] 寫入即綠者已預先點名：「快照不含 signInMethods 時只顯示測試帳號表單」「upstream 的 3xx 轉址連同 Location 與多個 Set-Cookie 原樣回傳」；「經 proxy 呼叫 OAuth callback 時轉址原樣回到瀏覽器」視 RED 實跑結果判定
- [x] 新 it 共 20（後端 8、前端 12）；新 E2E 2
