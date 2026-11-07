# Specification: auth

## MODIFIED Requirements

### Requirement: 本機測試帳號登入只在 ENVIRONMENT 為 development 時啟用

`hono-pickball/src/auth/` SHALL 提供 `isLocalAuthEnabled(env)`，其值 MUST 為 `env.ENVIRONMENT === "development"`；
`ENVIRONMENT` 缺值、空字串或任何其他值（含 `"production"`、`"Development"`）一律為停用。這是反向設計：
遠端環境沒有 `.dev.vars`，忘了設變數時預設是**關**的。`isLocalAuthEnabled` 只決定 **email／密碼（測試帳號）登入**是否啟用。

auth 整體是否啟用由 `isAuthEnabled(env)` 判斷（見「Google 登入只在 client id 與 secret 皆有值時啟用」）：`isLocalAuthEnabled` 與 `isGoogleSignInConfigured` 任一成立即啟用。

auth 停用（`isAuthEnabled` 為假）時：`/api/auth/*`（GET 與 POST）與 `GET /api/me` MUST 回 `404`，且 SHALL NOT 建立 auth 實例、SHALL NOT 觸碰 D1
（未設定 Google 的遠端部署與 G1 之前的正式站行為相同）。

auth 因 Google 啟用而 `isLocalAuthEnabled` 為假時（正式站）：`POST /api/auth/sign-in/email` 與 `POST /api/auth/sign-up/email` MUST 回 `404`，
回應 SHALL NOT 含 `Set-Cookie`，且 SHALL NOT 在 `user`、`account`、`session` 表新增任何資料。
此判斷 MUST 以 better-auth 的 `disabledPaths` 實作：`isLocalAuthEnabled` 為假時 `createAuth` 傳入 `disabledPaths: ["/sign-in/email", "/sign-up/email"]`，為真時為空陣列
（better-auth 1.6 的 router 在處理請求前比對去除尾端斜線後的路徑，命中即回 404）。SHALL NOT 改以 Hono 的 `app.post` 等指定 method 的路由攔截——
`hono-pickball/test/expected-user-guard.test.ts` 以 `app.routes` 列舉 method 不為 `ALL` 的路由並排除固定的非使用者資料路徑，新增指定 method 的 `/api/auth/...` 路由會被誤列為使用者資料路由。

`createAuth` 的 `emailAndPassword.enabled` MUST 同樣取自 `isLocalAuthEnabled`（第二道防線：`disabledPaths` 未涵蓋的 email 相關端點由 better-auth 自身以 400 `EMAIL_PASSWORD_DISABLED` 拒絕）。

#### Scenario: ENVIRONMENT 缺值時 email 登入不可用

- **GIVEN** env 不含 `ENVIRONMENT`、未設定 Google，且測試帳號已 seed
- **WHEN** 以正確帳密 `POST /api/auth/sign-in/email`
- **THEN** 回應 status 為 404，且回應不含 `Set-Cookie`
- **驗收**：`hono-pickball/test/auth-gating.test.ts`，it 名稱「ENVIRONMENT 缺值時 sign-in 回 404 且不發 cookie」

#### Scenario: ENVIRONMENT 為非 development 值時 email 登入不可用

- **GIVEN** env 的 `ENVIRONMENT` 為 `"production"`、未設定 Google，且測試帳號已 seed
- **WHEN** 以正確帳密 `POST /api/auth/sign-in/email`
- **THEN** 回應 status 為 404，且回應不含 `Set-Cookie`
- **驗收**：`hono-pickball/test/auth-gating.test.ts`，it 名稱「ENVIRONMENT 為 production 時 sign-in 回 404 且不發 cookie」

#### Scenario: 停用時不觸碰 D1

- **GIVEN** env 不含 `ENVIRONMENT` 也不含 `DB`，且未設定 Google（等同 G1 之前的正式部署設定）
- **WHEN** 分別呼叫 `GET /api/auth/get-session` 與 `GET /api/me`
- **THEN** 兩者皆回 404（而非 500）
- **驗收**：`hono-pickball/test/auth-gating.test.ts`，it 名稱「停用且無 DB binding 時 auth 路由與 /api/me 皆回 404」

#### Scenario: isLocalAuthEnabled 只接受字面值 development

- **WHEN** 以 `ENVIRONMENT` 為 `undefined`、`""`、`"production"`、`"Development"`、`"development"` 分別呼叫 `isLocalAuthEnabled`
- **THEN** 只有 `"development"` 回傳 `true`，其餘皆為 `false`
- **驗收**：`hono-pickball/test/auth-config.test.ts`，it 名稱「isLocalAuthEnabled 只在 ENVIRONMENT 恰為 development 時為真」

#### Scenario: disabledPaths 隨 isLocalAuthEnabled 切換

- **WHEN** 分別以 `ENVIRONMENT = "development"` 與缺值呼叫 `createAuth`
- **THEN** 前者 `options.disabledPaths` 為空陣列，後者為恰含 `"/sign-in/email"` 與 `"/sign-up/email"` 的陣列
- **驗收**：`hono-pickball/test/auth-config.test.ts`，it 名稱「非 development 時 disabledPaths 封鎖 email 登入與註冊，development 時不封鎖」

#### Scenario: 非 development 且 Google 設定齊全時 email 登入與註冊仍回 404

- **GIVEN** env 的 `ENVIRONMENT` 缺值，`GOOGLE_CLIENT_ID` 與 `GOOGLE_CLIENT_SECRET` 皆為非空字串，`DB` 為測試用 D1，且測試帳號已 seed
- **WHEN** 以正確帳密並帶 `Origin: <BETTER_AUTH_URL>` 呼叫 `POST /api/auth/sign-in/email`，再以新的 email 呼叫 `POST /api/auth/sign-up/email`
- **THEN** 兩者 status 皆為 404 且回應皆不含 `Set-Cookie`；`user` 表中該新 email 的筆數為 0
- **驗收**：`hono-pickball/test/auth-gating.test.ts`，it 名稱「非 development 且 Google 設定齊全時 email 登入與註冊回 404 且不發 cookie」

### Requirement: GET /api/session 狀態探針永遠回 200

`GET /api/session` SHALL 在任何環境下回 `200` 與 JSON
`{ "authEnabled": boolean, "user": { "id", "email", "name" } | null, "signInMethods": { "google": boolean, "emailPassword": boolean } }`，
SHALL NOT 回 401 或 404——前端每頁都會呼叫它，瀏覽器會把 4xx 的 fetch 記為 console 錯誤，而既有 E2E 監控 console。

- auth 停用（`isAuthEnabled` 為假）時 MUST 回 `{ "authEnabled": false, "user": null, "signInMethods": { "google": false, "emailPassword": false } }`，且 SHALL NOT 建立 auth 實例或觸碰 D1。
- auth 啟用時 `signInMethods.google` MUST 為 `isGoogleSignInConfigured(env)`、`signInMethods.emailPassword` MUST 為 `isLocalAuthEnabled(env)`；`authEnabled` 為 `true`。
- 啟用且無有效 session 時 `user` 為 `null`；啟用且有效 session 時 `user` 為 `{ id, email, name }`。
- 啟用但查詢 session 時發生例外（例如本機 D1 尚未 migration）MUST 回 `authEnabled: true`、`user: null` 與依上述規則計算的 `signInMethods`，並以
  `console.error` 記錄，SHALL NOT 回 5xx。

本端點只回報狀態，SHALL NOT 作為授權依據；需要授權的端點一律用 `requireSession`。

#### Scenario: 停用時回 authEnabled false 且不需要 DB

- **GIVEN** env 不含 `ENVIRONMENT` 也不含 `DB`，且未設定 Google
- **WHEN** 呼叫 `GET /api/session`
- **THEN** status 200，body 為 `{ "authEnabled": false, "user": null, "signInMethods": { "google": false, "emailPassword": false } }`
- **驗收**：`hono-pickball/test/auth-session.test.ts`，it 名稱「停用且無 DB 時回 200 與 authEnabled false」

#### Scenario: 啟用但未登入時回 user null

- **GIVEN** 本機登入啟用，未設定 Google
- **WHEN** 不帶 cookie 呼叫 `GET /api/session`
- **THEN** status 200，body 為 `{ "authEnabled": true, "user": null, "signInMethods": { "google": false, "emailPassword": true } }`
- **驗收**：`hono-pickball/test/auth-session.test.ts`，it 名稱「啟用但未登入時回 200 與 user null」

#### Scenario: 登入後回目前使用者

- **GIVEN** 以測試帳號登入取得 cookie
- **WHEN** 帶該 cookie 呼叫 `GET /api/session`
- **THEN** status 200，`authEnabled` 為 true，`user` 的鍵集合恰為 `id`、`email`、`name`
- **驗收**：`hono-pickball/test/auth-session.test.ts`，it 名稱「登入後回 200 與目前使用者的 id、email 與 name」

#### Scenario: session 查詢失敗時降級為 user null

- **GIVEN** 本機登入啟用、未設定 Google，但 `DB` 為任何查詢都拋錯的替身
- **WHEN** 帶任一 `better-auth.session_token` cookie 呼叫 `GET /api/session`
- **THEN** status 200，body 為 `{ "authEnabled": true, "user": null, "signInMethods": { "google": false, "emailPassword": true } }`
- **驗收**：`hono-pickball/test/auth-session.test.ts`，it 名稱「session 查詢拋錯時仍回 200 與 user null」

#### Scenario: 非 development 且 Google 設定齊全時回報只有 Google 登入

- **GIVEN** env 的 `ENVIRONMENT` 缺值，`GOOGLE_CLIENT_ID` 與 `GOOGLE_CLIENT_SECRET` 皆為非空字串，`DB` 為測試用 D1
- **WHEN** 不帶 cookie 呼叫 `GET /api/session`
- **THEN** status 200，body 為 `{ "authEnabled": true, "user": null, "signInMethods": { "google": true, "emailPassword": false } }`
- **驗收**：`hono-pickball/test/auth-session.test.ts`，it 名稱「非 development 且 Google 設定齊全時回 authEnabled true 與只有 Google 的 signInMethods」

### Requirement: 前端以 /api/session 作為登入狀態的唯一來源

`nextjs-pickball/lib/auth/session-client.ts` SHALL 提供 `fetchSession()`：以 `GET /api/session`（same-origin）取得
`{ authEnabled, user, signInMethods? }`。回應為 200 且形狀符合（`authEnabled` 為布林、`user` 為 `null` 或含字串 `id`／`email`／`name` 的物件、
`signInMethods` 不存在或為含布林 `google` 與 `emailPassword` 的物件）時原樣回傳——`signInMethods` 不存在時回傳值 SHALL NOT 含此鍵
（相容 G1 之前的後端：當時 `authEnabled: true` 只代表測試帳號登入）；
**任何其他情況**（非 200、JSON 解析失敗、形狀不符——含 `signInMethods` 存在但形狀不符、網路錯誤）MUST 回傳 `{ authEnabled: false, user: null }` 且 SHALL NOT throw——
登入狀態取不到時一律當作「未啟用」，訪客介面維持現狀（fail-closed）。

請求 MUST 以 `keepalive: true` 發出：WebKit 會拒絕「整頁導覽開始後才發出」的一般 fetch，並由瀏覽器自行輸出 console 錯誤
（`Fetch API cannot load … due to access control checks`，不是 JS 例外，try/catch 擋不住），使既有 E2E 的 console 守衛失敗；
`keepalive` 請求不受此限制。回應處理與 fail-closed 規則不變。

`nextjs-pickball/lib/auth/session-store.ts` 的 ready 快照 MUST 原樣帶出 `fetchSession()` 回傳的全部欄位（含 `signInMethods`），SHALL NOT 只挑 `authEnabled` 與 `user`。

前端 SHALL NOT 讀取或依賴 session cookie 的名稱或內容（HttpOnly，且 https 下名稱為 `__Secure-` 前綴）。
前端 SHALL NOT 以 build-time 環境變數判斷是否顯示登入入口或登入方式——顯示登入入口的唯一訊號是 `authEnabled`，登入頁顯示哪些登入方式的唯一訊號是 `signInMethods`。

#### Scenario: 回應正確時原樣回傳

- **WHEN** `/api/session` 回 200 與 `{ "authEnabled": true, "user": { "id": "u1", "email": "a@example.com", "name": "A" } }`
- **THEN** `fetchSession()` 回傳同一個物件內容
- **驗收**：`nextjs-pickball/lib/auth/session-client.test.ts`，it 名稱「fetchSession 於 200 且形狀正確時回傳 authEnabled 與 user」

#### Scenario: session 請求以 keepalive 發出

- **WHEN** 呼叫 `fetchSession()`
- **THEN** `fetch` 以 `/api/session` 與 `keepalive: true` 被呼叫
- **驗收**：`nextjs-pickball/lib/auth/session-client.test.ts`，it 名稱「fetchSession 以 keepalive 發出請求」；
  端到端以既有 webkit／mobile-safari E2E 的 console 守衛（`player-roster`、`match-stage`、`round-timer`、`visual-export`）在 `.dev.vars` 齊備時通過為證

#### Scenario: 任何失敗都降級為未啟用

- **WHEN** `/api/session` 分別回 500、回 200 但 body 不是 JSON、回 200 但 `authEnabled` 不是布林、`fetch` 拋出例外
- **THEN** 四種情況 `fetchSession()` 皆回傳 `{ authEnabled: false, user: null }` 且不 throw
- **驗收**：`nextjs-pickball/lib/auth/session-client.test.ts`，it 名稱「fetchSession 於非 200、形狀不符或網路錯誤時回傳未啟用且不拋錯」

#### Scenario: 回應含 signInMethods 時一併回傳

- **WHEN** `/api/session` 回 200 與 `{ "authEnabled": true, "user": null, "signInMethods": { "google": true, "emailPassword": false } }`
- **THEN** `fetchSession()` 回傳 `{ authEnabled: true, user: null, signInMethods: { google: true, emailPassword: false } }`
- **驗收**：`nextjs-pickball/lib/auth/session-client.test.ts`，it 名稱「fetchSession 回傳後端提供的 signInMethods」

#### Scenario: signInMethods 形狀不符時降級為未啟用

- **WHEN** `/api/session` 回 200，`authEnabled` 為 `true`、`user` 為 `null`，`signInMethods` 分別為 `null`、`"google"`、`{ "google": true }`、`{ "google": "yes", "emailPassword": false }`
- **THEN** 四種情況 `fetchSession()` 皆回傳 `{ authEnabled: false, user: null }` 且不 throw
- **驗收**：`nextjs-pickball/lib/auth/session-client.test.ts`，it 名稱「signInMethods 形狀不符時 fetchSession 回傳未啟用」

#### Scenario: session store 的快照保留 signInMethods

- **GIVEN** `fetchSession` 被替換為回傳 `{ authEnabled: true, user: null, signInMethods: { google: true, emailPassword: false } }` 的假函式
- **WHEN** 訂閱 store 並等待請求完成
- **THEN** 快照為 `{ status: "ready", authEnabled: true, user: null, signInMethods: { google: true, emailPassword: false } }`
- **驗收**：`nextjs-pickball/lib/auth/session-store.test.ts`，it 名稱「fetchSession 回傳 signInMethods 時快照保留同一份 signInMethods」

### Requirement: 本機測試帳號登入頁

`/login` SHALL 由 `nextjs-pickball/app/login/page.tsx` 提供，匯出 `metadata` 且 `robots.index` 為 `false`（登入頁不進搜尋索引），
不列入 `SiteNavbar` 的 `NAV_LINKS`。頁面內容由 `nextjs-pickball/components/auth/LoginForm.tsx` 依 `useSession` 呈現：

- `loading`：不顯示表單（避免閃現）。
- `authEnabled === false`：顯示「此環境未開放登入」，SHALL NOT 顯示任何輸入欄位或 Google 按鈕。
- 已登入：顯示「已登入：<name>」、回首頁的連結與「登出」按鈕，不顯示表單與 Google 按鈕。點擊「登出」後呼叫 `signOut()`，再呼叫 store 的 `refresh()`，停留在 `/login`
  （navbar 的帳號入口於所有寬度皆提供登出，見 `site-navbar`「navbar 帳號入口於各寬度可見且預留固定寬度」；本頁的「登出」按鈕保留為第二個入口）。
- 啟用且未登入：可用的登入方式取自快照的 `signInMethods`；快照不含 `signInMethods` 時（G1 之前的後端）視為 `{ google: false, emailPassword: true }`。
  - `signInMethods.google` 為 `true` 時顯示 `type="button"`、名稱為「使用 Google 登入」的按鈕，位於測試帳號表單之前；為 `false` 時 SHALL NOT 顯示。
    點擊後按鈕 MUST 為 disabled 並呼叫 `startGoogleSignIn()`（見「前端 Google 登入的請求契約」）：結果為 `{ ok: true }` 時按鈕維持 disabled（頁面即將導向 Google）；
    結果為 `{ ok: false }` 時以 `role="alert"` 顯示「Google 登入失敗，請稍後再試」並恢復按鈕。
  - `signInMethods.emailPassword` 為 `true` 時顯示「電子郵件」「密碼」兩個欄位與「登入」按鈕；為 `false` 時 SHALL NOT 顯示任何輸入欄位。送出期間按鈕 MUST 為 disabled。
    - 成功 → 呼叫 store 的 `refresh()` 後以 `router.replace("/")` 導向首頁；
    - `invalid-credentials` → 顯示「帳號或密碼錯誤」，保留 email、清空密碼；
    - `unavailable` → 顯示「此環境未開放登入」；
    - `failed` → 顯示「登入失敗，請稍後再試」。
  - 兩者皆為 `false` 時顯示「此環境未開放登入」。

錯誤訊息 MUST 以 `role="alert"` 呈現。UI 文案 SHALL NOT 含 emoji。

#### Scenario: 登入頁不進搜尋索引

- **WHEN** 檢查 `app/login/page.tsx` 的匯出
- **THEN** `metadata.robots` 含 `index: false`，`metadata.title` 為非空字串
- **驗收**：`nextjs-pickball/app/login/page.test.ts`，it 名稱「/login 匯出 metadata 且 robots.index 為 false」

#### Scenario: 載入中不顯示表單也不顯示未開放訊息

- **GIVEN** `useSession` 回傳 `{ status: "loading" }`
- **WHEN** 渲染 `LoginForm`
- **THEN** 不存在密碼欄位，也不存在「此環境未開放登入」文字
- **驗收**：`nextjs-pickball/components/auth/LoginForm.test.tsx`，it 名稱「載入中不顯示表單也不顯示未開放訊息」

#### Scenario: 未啟用時不顯示表單

- **GIVEN** `useSession` 回傳 `{ status: "ready", authEnabled: false, user: null }`
- **WHEN** 渲染 `LoginForm`
- **THEN** 可見文字「此環境未開放登入」，不存在任何 textbox 或密碼欄位
- **驗收**：`nextjs-pickball/components/auth/LoginForm.test.tsx`，it 名稱「未啟用時顯示此環境未開放登入且不顯示表單」

#### Scenario: 已登入時不顯示表單

- **GIVEN** `useSession` 回傳已登入、`name` 為「測試員」
- **WHEN** 渲染 `LoginForm`
- **THEN** 可見文字「已登入：測試員」與指向 `/` 的連結，不存在密碼欄位
- **驗收**：`nextjs-pickball/components/auth/LoginForm.test.tsx`，it 名稱「已登入時顯示已登入訊息且不顯示表單」

#### Scenario: 已登入時可於登入頁登出

- **GIVEN** `useSession` 回傳已登入，`signOut` 回傳 `true`
- **WHEN** 渲染 `LoginForm` 並點擊「登出」按鈕
- **THEN** `signOut` 被呼叫一次，之後 store 的 `refresh` 被呼叫一次；`router.replace` 未被呼叫
- **驗收**：`nextjs-pickball/components/auth/LoginForm.test.tsx`，it 名稱「已登入時於登入頁點擊登出後呼叫 signOut 並重新取得 session」

#### Scenario: 登入成功後導向首頁

- **GIVEN** 啟用且未登入，`signInWithEmail` 回 `{ ok: true }`
- **WHEN** 填入電子郵件與密碼並按「登入」
- **THEN** `signInWithEmail` 以填入的值被呼叫一次、store 的 `refresh` 被呼叫、`router.replace` 以 `"/"` 被呼叫
- **驗收**：`nextjs-pickball/components/auth/LoginForm.test.tsx`，it 名稱「送出正確帳密後重新取得 session 並導向首頁」

#### Scenario: 帳密錯誤時顯示錯誤並清空密碼

- **GIVEN** `signInWithEmail` 回 `{ ok: false, reason: "invalid-credentials" }`
- **WHEN** 送出表單
- **THEN** `role="alert"` 的元素文字為「帳號或密碼錯誤」，電子郵件欄位保留原值、密碼欄位為空，`router.replace` 未被呼叫
- **驗收**：`nextjs-pickball/components/auth/LoginForm.test.tsx`，it 名稱「帳密錯誤時顯示帳號或密碼錯誤並清空密碼」

#### Scenario: 其他失敗顯示對應訊息

- **GIVEN** `signInWithEmail` 分別回 `unavailable` 與 `failed`
- **WHEN** 送出表單
- **THEN** 分別顯示「此環境未開放登入」與「登入失敗，請稍後再試」
- **驗收**：`nextjs-pickball/components/auth/LoginForm.test.tsx`，it 名稱「unavailable 與 failed 分別顯示對應訊息」

#### Scenario: 送出期間按鈕為 disabled

- **GIVEN** `signInWithEmail` 回傳一個尚未 resolve 的 promise
- **WHEN** 送出表單
- **THEN** 「登入」按鈕為 disabled；promise resolve 後恢復
- **驗收**：`nextjs-pickball/components/auth/LoginForm.test.tsx`，it 名稱「送出期間登入按鈕為 disabled」

#### Scenario: 以測試帳號經由登入頁登入

- **GIVEN** 前後端 dev server 皆已啟動，`.dev.vars` 齊備，測試帳號已 seed，瀏覽器為訪客，viewport 寬度 >= 640px
- **WHEN** 開啟 `/login`，填入測試帳號並按「登入」
- **THEN** 導向 `/`，navbar 出現名稱為「登出」的按鈕
- **驗收**：`nextjs-pickball/tests/e2e/specs/auth-session.spec.ts`，test 名稱「以測試帳號登入後 navbar 顯示登出」

#### Scenario: 錯誤密碼在登入頁顯示錯誤

- **GIVEN** 同上
- **WHEN** 以錯誤密碼登入
- **THEN** 停留在 `/login`，顯示「帳號或密碼錯誤」
- **驗收**：`nextjs-pickball/tests/e2e/specs/auth-session.spec.ts`，test 名稱「帳號或密碼錯誤時登入頁顯示錯誤訊息」

#### Scenario: 重整後仍維持登入

- **GIVEN** 以 `globalSetup` 產生的 `storageState` 開啟頁面（已登入），viewport 寬度 >= 640px
- **WHEN** 開啟 `/` 後重新整理
- **THEN** 重整前後 navbar 皆顯示「登出」按鈕
- **驗收**：`nextjs-pickball/tests/e2e/specs/auth-session.spec.ts`，test 名稱「重整後仍維持登入」

#### Scenario: 登出後回到訪客

- **GIVEN** 以登入頁登入（獨立的新 session，不使用共用 `storageState`），viewport 寬度 >= 640px
- **WHEN** 按 navbar 的「登出」
- **THEN** navbar 改為顯示「登入」連結；重新整理後仍為「登入」
- **驗收**：`nextjs-pickball/tests/e2e/specs/auth-session.spec.ts`，test 名稱「登出後 navbar 回到登入入口」

#### Scenario: 窄螢幕下經由登入頁登入與登出

- **GIVEN** 前後端 dev server 皆已啟動，`.dev.vars` 齊備，瀏覽器為訪客（獨立的新 session），viewport 寬度 390px
- **WHEN** 開啟 `/login` 以測試帳號登入；再開啟 `/login` 按「登出」
- **THEN** 登入後導向 `/` 且 header 內顯示名稱為「登出」的按鈕、不顯示「登入」連結；回到 `/login` 時 `main` 內顯示「已登入：<name>」與「登出」按鈕；按 `main` 內的「登出」後顯示「電子郵件」欄位，重新整理後仍為登入表單
- 斷言 MUST 以 `main` 或 `header` 限定範圍：登入頁已登入時 header 與 `main` 各有一個「登出」按鈕，未限定範圍會同時比對到兩個
- **驗收**：`nextjs-pickball/tests/e2e/specs/auth-session.spec.ts`，test 名稱「窄螢幕下可經由登入頁登入與登出」

#### Scenario: 只啟用 Google 時只顯示 Google 按鈕

- **GIVEN** `useSession` 回傳 `{ status: "ready", authEnabled: true, user: null, signInMethods: { google: true, emailPassword: false } }`
- **WHEN** 渲染 `LoginForm`
- **THEN** 存在名稱為「使用 Google 登入」的按鈕；不存在任何 textbox、密碼欄位與「登入」按鈕；不存在「此環境未開放登入」文字
- **驗收**：`nextjs-pickball/components/auth/LoginForm.test.tsx`，it 名稱「只啟用 Google 時顯示使用 Google 登入按鈕且不顯示測試帳號表單」

#### Scenario: Google 與測試帳號皆啟用時兩者皆顯示

- **GIVEN** `useSession` 回傳啟用且未登入，`signInMethods` 為 `{ google: true, emailPassword: true }`
- **WHEN** 渲染 `LoginForm`
- **THEN** 「使用 Google 登入」按鈕、「電子郵件」「密碼」欄位與「登入」按鈕皆存在，且 Google 按鈕在文件順序上位於「電子郵件」欄位之前
- **驗收**：`nextjs-pickball/components/auth/LoginForm.test.tsx`，it 名稱「Google 與測試帳號皆啟用時兩種登入方式皆顯示且 Google 在前」

#### Scenario: 快照不含 signInMethods 時只顯示測試帳號表單

- **GIVEN** `useSession` 回傳 `{ status: "ready", authEnabled: true, user: null }`（不含 `signInMethods`）
- **WHEN** 渲染 `LoginForm`
- **THEN** 「電子郵件」「密碼」欄位存在，不存在「使用 Google 登入」按鈕
- **驗收**：`nextjs-pickball/components/auth/LoginForm.test.tsx`，it 名稱「快照不含 signInMethods 時只顯示測試帳號表單」

#### Scenario: 點擊 Google 按鈕後呼叫 startGoogleSignIn 並維持 disabled

- **GIVEN** 只啟用 Google，`startGoogleSignIn` 回傳 `{ ok: true }`
- **WHEN** 點擊「使用 Google 登入」
- **THEN** `startGoogleSignIn` 被呼叫一次；按鈕為 disabled，且結果回傳後仍為 disabled；不存在 `role="alert"`；`router.replace` 未被呼叫
- **驗收**：`nextjs-pickball/components/auth/LoginForm.test.tsx`，it 名稱「點擊使用 Google 登入後呼叫 startGoogleSignIn 且按鈕維持 disabled」

#### Scenario: Google 登入請求失敗時顯示錯誤並恢復按鈕

- **GIVEN** 只啟用 Google，`startGoogleSignIn` 回傳 `{ ok: false }`
- **WHEN** 點擊「使用 Google 登入」
- **THEN** `role="alert"` 的元素文字為「Google 登入失敗，請稍後再試」，按鈕恢復為可點擊
- **驗收**：`nextjs-pickball/components/auth/LoginForm.test.tsx`，it 名稱「Google 登入請求失敗時顯示錯誤訊息並恢復按鈕」

#### Scenario: 登入頁的登入方式與後端回報一致

- **GIVEN** 前後端 dev server 皆已啟動，`.dev.vars` 齊備，瀏覽器為訪客，viewport 寬度 >= 640px
- **WHEN** 以 `page.request` 取得 `/api/session`，再開啟 `/login`
- **THEN** `/api/session` 的 `signInMethods.google` 與 `signInMethods.emailPassword` 皆為布林；「使用 Google 登入」按鈕的數量在 `google` 為 `true` 時為 1、否則為 0；`emailPassword` 為 `true` 時「電子郵件」欄位可見
- 驗收執行（tasks C5）時 `.dev.vars` MUST 未設定 Google 變數，因此實際走的是「不顯示 Google 按鈕、測試帳號表單照常顯示」的分支，結果記入 tasks
- **驗收**：`nextjs-pickball/tests/e2e/specs/auth-session.spec.ts`，test 名稱「登入頁的登入方式與後端回報一致」

## ADDED Requirements

### Requirement: Google 登入只在 client id 與 secret 皆有值時啟用

`hono-pickball/src/auth/local-auth.ts` SHALL 提供：

- `isGoogleSignInConfigured(env)`：`env.GOOGLE_CLIENT_ID` 與 `env.GOOGLE_CLIENT_SECRET` **皆為非空字串**時為 `true`，其餘（缺值、空字串、只有其中一個）一律為 `false`（fail-closed：只設一半時不得半啟用）。
- `isAuthEnabled(env)`：`isLocalAuthEnabled(env) || isGoogleSignInConfigured(env)`。`localAuth` 閘門（`hono-pickball/src/auth/local-auth-middleware.ts`）與 `GET /api/session` 的停用判斷 MUST 只用它。

`createAuth` 註冊 `socialProviders.google` 的條件 MUST 為 `isGoogleSignInConfigured(env)`（與既有「兩值皆有才註冊」等價，判斷只寫一處），並 MUST 帶 `prompt: "select_account"`——場邊共用裝置換人登入時，Google 不得自動沿用上一位的帳號。
Google 的 redirect URI 由 better-auth 以 `baseURL`（`BETTER_AUTH_URL`，前端 origin）組成：`<BETTER_AUTH_URL>/api/auth/callback/google`，MUST 與 Google Cloud Console 登記的值完全相同
（本機 `http://localhost:3005/api/auth/callback/google`、正式站 `https://nextjs-pickball.wedsatcoming.workers.dev/api/auth/callback/google`）。

Google 首次登入會建立 `user` 與 `account`（better-auth 預設的社群註冊）；`emailAndPassword.disableSignUp` 只作用於 email 註冊。
誰能以 Google 登入由 Google OAuth 同意畫面的發布狀態控制（「測試中」只允許測試使用者），本 change SHALL NOT 另設允許名單。

#### Scenario: isGoogleSignInConfigured 只在兩值皆為非空字串時為真

- **WHEN** 以 `{}`、只有 `GOOGLE_CLIENT_ID`、只有 `GOOGLE_CLIENT_SECRET`、兩者皆為 `""`、`GOOGLE_CLIENT_ID` 為 `""` 而 secret 有值、兩者皆為非空字串分別呼叫 `isGoogleSignInConfigured`
- **THEN** 只有「兩者皆為非空字串」回傳 `true`
- **驗收**：`hono-pickball/test/auth-config.test.ts`，it 名稱「isGoogleSignInConfigured 只在 client id 與 secret 皆為非空字串時為真」

#### Scenario: isAuthEnabled 在 development 或 Google 設定齊全時為真

- **WHEN** 以「development、無 Google」「非 development、Google 齊全」「development、Google 齊全」「非 development、Google 只有 client id」「非 development、無 Google」分別呼叫 `isAuthEnabled`
- **THEN** 前三者為 `true`，後兩者為 `false`
- **驗收**：`hono-pickball/test/auth-config.test.ts`，it 名稱「isAuthEnabled 在 development 或 Google 設定齊全時為真」

#### Scenario: 非 development 且 Google 設定齊全時 sign-in/social 回傳 Google 授權網址

- **GIVEN** env 的 `ENVIRONMENT` 缺值，`GOOGLE_CLIENT_ID` 為 `"fake-client-id"`、`GOOGLE_CLIENT_SECRET` 為 `"fake-client-secret"`，`BETTER_AUTH_URL` 為 `"http://localhost:3005"`，`DB` 為測試用 D1
- **WHEN** 帶 `Origin: http://localhost:3005` 以 JSON `{ "provider": "google", "callbackURL": "/", "errorCallbackURL": "/login" }` 呼叫 `POST /api/auth/sign-in/social`
- **THEN** status 200，body 的 `redirect` 為 `true`；`url` 的 origin 為 `https://accounts.google.com`、pathname 為 `/o/oauth2/v2/auth`，查詢參數 `client_id` 為 `fake-client-id`、`redirect_uri` 為 `http://localhost:3005/api/auth/callback/google`、`prompt` 為 `select_account`、`scope` 含 `openid`、`email`、`profile`
- **驗收**：`hono-pickball/test/auth-google.test.ts`，it 名稱「非 development 且 Google 設定齊全時 sign-in/social 回傳導向 Google 的授權網址」

#### Scenario: 非 development 且 Google 設定不全時 auth 整組停用且不觸碰 D1

- **GIVEN** env 的 `ENVIRONMENT` 缺值、`DB` 不存在，`GOOGLE_CLIENT_ID` 為 `"fake-client-id"`、`GOOGLE_CLIENT_SECRET` 為 `""`
- **WHEN** 分別呼叫 `GET /api/session`、`POST /api/auth/sign-in/social`（帶 `Origin` 與合法 body）與 `GET /api/me`
- **THEN** `/api/session` 回 200 與 `{ "authEnabled": false, "user": null, "signInMethods": { "google": false, "emailPassword": false } }`；後兩者皆回 404（而非 500）
- **驗收**：`hono-pickball/test/auth-gating.test.ts`，it 名稱「非 development 且 Google 設定不全時 auth 整組停用且不觸碰 D1」

### Requirement: 前端 Google 登入的請求契約

`nextjs-pickball/lib/auth/session-client.ts` SHALL 提供 `startGoogleSignIn(navigate?)`，`navigate` 預設為 `(url) => window.location.assign(url)`（參數只為讓單元測試替換導向）：

- 以 `POST /api/auth/sign-in/social`、`Content-Type: application/json`、body `{ provider: "google", callbackURL: "/", errorCallbackURL: "/login" }` 送出（same-origin，瀏覽器自動帶 `Origin`）；
- 回應為 200 且 JSON 的 `url` 為可解析、協定為 `https:` 的網址時，以該網址呼叫 `navigate` 一次並回傳 `{ ok: true }`；
- 其他情況（非 200、JSON 解析失敗、缺 `url`、`url` 不是 `https:`、`fetch` 拋出例外）MUST 回傳 `{ ok: false }` 且 SHALL NOT 呼叫 `navigate`、SHALL NOT throw。

Google 授權完成後由 better-auth 的 callback 設定 session cookie 並導向 `callbackURL`（`/`）；授權失敗或使用者取消時導向 `errorCallbackURL`（`/login`），本 change 不顯示失敗原因。
頁面導回後 session store 於該次載入第一次被訂閱時重新取得 session，不需另行 `refresh()`。

#### Scenario: startGoogleSignIn 送出 social sign-in 並導向回傳的網址

- **GIVEN** `fetch` 回 200 與 `{ "url": "https://accounts.google.com/o/oauth2/v2/auth?client_id=x", "redirect": true }`
- **WHEN** 以假的 `navigate` 呼叫 `startGoogleSignIn(navigate)`
- **THEN** `fetch` 被呼叫一次，URL 為 `/api/auth/sign-in/social`、method 為 `POST`、`Content-Type` 為 `application/json`、body 解析後等於 `{ provider: "google", callbackURL: "/", errorCallbackURL: "/login" }`；`navigate` 以回傳的 `url` 被呼叫一次；回傳 `{ ok: true }`
- **驗收**：`nextjs-pickball/lib/auth/session-client.test.ts`，it 名稱「startGoogleSignIn 以 JSON POST 至 /api/auth/sign-in/social 並導向回傳的網址」

#### Scenario: startGoogleSignIn 失敗時不導向且不拋錯

- **WHEN** 後端分別回 500、回 200 但 body 不是 JSON、回 200 但缺 `url`、回 200 但 `url` 為 `"javascript:alert(1)"`、回 200 但 `url` 為 `"http://accounts.google.com/"`，以及 `fetch` 拋出例外
- **THEN** 六種情況皆回傳 `{ ok: false }`，`navigate` 未被呼叫，且不 throw
- **驗收**：`nextjs-pickball/lib/auth/session-client.test.ts`，it 名稱「startGoogleSignIn 於非 200、缺少網址、非 https 或網路錯誤時回傳失敗且不導向」
