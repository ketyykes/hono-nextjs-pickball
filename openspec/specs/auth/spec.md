# auth Specification

## Purpose
後端（hono-pickball）的身分驗證：以 better-auth 提供本機測試帳號登入（僅 `ENVIRONMENT=development` 啟用）、session 驗證 middleware、`/api/me` 與 `/api/session` 端點，以及本機 D1 測試帳號 seed。

## Requirements

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

### Requirement: 測試帳號以 email 與密碼登入

本機登入啟用時，`POST /api/auth/sign-in/email` SHALL 以 better-auth 驗證帳密。請求 MUST 帶有屬於 `trustedOrigins`
的 `Origin` 標頭（瀏覽器同源 POST 會自動帶上；better-auth 以此做 CSRF 防護）。

帳密正確時 MUST 回 `200` 並設定 session cookie `better-auth.session_token`，其屬性 MUST 為 `HttpOnly`、`SameSite=Lax`、
`Path=/`。`baseURL` 為 `http://` 時 SHALL NOT 帶 `Secure`（與 `api-connectivity` 的 cookie-check 契約一致：
dev 環境為 `http://localhost:3005`，加上 `Secure` 會收不到 cookie）。

密碼錯誤或帳號不存在時 MUST 回 `401`，且 SHALL NOT 發出 session cookie；兩種情況的回應 body MUST 相同（防止帳號列舉）。

#### Scenario: 帳密正確時取得 session cookie

- **GIVEN** 本機登入啟用，測試帳號已 seed
- **WHEN** 以正確帳密並帶 `Origin: <BETTER_AUTH_URL>` 呼叫 `POST /api/auth/sign-in/email`
- **THEN** status 200，`Set-Cookie` 含 `better-auth.session_token=`、`HttpOnly`、`SameSite=Lax`、`Path=/`，且不含 `Secure`
- **驗收**：`hono-pickball/test/auth-sign-in.test.ts`，it 名稱「帳密正確時回 200 並設定 HttpOnly、SameSite=Lax 的 session cookie」

#### Scenario: 密碼錯誤回 401

- **GIVEN** 本機登入啟用，測試帳號已 seed
- **WHEN** 以錯誤密碼呼叫 `POST /api/auth/sign-in/email`
- **THEN** status 401，且回應不含 `Set-Cookie` 的 `better-auth.session_token`
- **驗收**：`hono-pickball/test/auth-sign-in.test.ts`，it 名稱「密碼錯誤時回 401 且不發 session cookie」

#### Scenario: 帳號不存在與密碼錯誤的回應無從區分

- **WHEN** 分別以「不存在的 email」與「存在的 email＋錯誤密碼」呼叫 sign-in
- **THEN** 兩者 status 皆為 401，且 body 的 JSON 完全相同
- **驗收**：`hono-pickball/test/auth-sign-in.test.ts`，it 名稱「帳號不存在與密碼錯誤回應相同的 401」

### Requirement: 不開放註冊

`emailAndPassword.disableSignUp` MUST 為 `true`。`POST /api/auth/sign-up/email` MUST 被拒絕（4xx），
且 SHALL NOT 在 `user` 或 `account` 表新增任何資料。測試帳號只能經由 seed 建立。

#### Scenario: 註冊端點被拒

- **GIVEN** 本機登入啟用
- **WHEN** 以新的 email 呼叫 `POST /api/auth/sign-up/email`
- **THEN** status 為 400，且 `user` 表中該 email 的筆數為 0
- **驗收**：`hono-pickball/test/auth-sign-in.test.ts`，it 名稱「註冊端點回 400 且不建立使用者」

### Requirement: auth 實例每請求依 env 建立

`createAuth(env)` SHALL 在每個需要 auth 的請求內呼叫（Workers 的 binding 只能在請求內取得，且 gating 測試需要注入不同 env），
同一請求內 SHALL 只建立一次（存於 Hono context 重用）。

`createAuth` MUST：
- 以 `getDb(env)` 搭配 `drizzleAdapter(db, { provider: "sqlite", schema, transaction: false })`——D1 沒有互動式 transaction；
- `baseURL` 與 `trustedOrigins`（唯一一筆）皆取自 `env.BETTER_AUTH_URL`（前端 origin；service binding 不改寫 host）；
- `secret` 取自 `env.BETTER_AUTH_SECRET`；
- `BETTER_AUTH_SECRET` 或 `BETTER_AUTH_URL` 缺值時拋出訊息含該變數名的錯誤（不得以預設 secret 運作）；
- 只有 `GOOGLE_CLIENT_ID` 與 `GOOGLE_CLIENT_SECRET` 皆有值時才在 `socialProviders` 註冊 `google`。

#### Scenario: 缺少 BETTER_AUTH_SECRET 時拒絕建立

- **WHEN** 以不含 `BETTER_AUTH_SECRET` 的 env 呼叫 `createAuth`
- **THEN** 拋出錯誤，訊息含 `BETTER_AUTH_SECRET`
- **驗收**：`hono-pickball/test/auth-config.test.ts`，it 名稱「缺少 BETTER_AUTH_SECRET 時 createAuth 拋錯」

#### Scenario: 缺少 BETTER_AUTH_URL 時拒絕建立

- **WHEN** 以不含 `BETTER_AUTH_URL` 的 env 呼叫 `createAuth`
- **THEN** 拋出錯誤，訊息含 `BETTER_AUTH_URL`
- **驗收**：`hono-pickball/test/auth-config.test.ts`，it 名稱「缺少 BETTER_AUTH_URL 時 createAuth 拋錯」

#### Scenario: baseURL 與 trustedOrigins 取自 BETTER_AUTH_URL

- **WHEN** 以 `BETTER_AUTH_URL = "http://localhost:3005"` 呼叫 `createAuth`
- **THEN** 實例的 `options.baseURL` 為 `"http://localhost:3005"`，`options.trustedOrigins` 為 `["http://localhost:3005"]`
- **驗收**：`hono-pickball/test/auth-config.test.ts`，it 名稱「baseURL 與 trustedOrigins 皆取自 BETTER_AUTH_URL」

#### Scenario: emailAndPassword 隨 isLocalAuthEnabled 開關且禁止註冊

- **WHEN** 分別以 `ENVIRONMENT = "development"` 與缺值呼叫 `createAuth`
- **THEN** 前者 `options.emailAndPassword.enabled === true`、後者 `=== false`；兩者 `disableSignUp === true`
- **驗收**：`hono-pickball/test/auth-config.test.ts`，it 名稱「emailAndPassword 只在 development 啟用且一律禁止註冊」

#### Scenario: Google 只在兩個變數皆存在時註冊

- **WHEN** 分別以「兩者皆無」「只有 `GOOGLE_CLIENT_ID`」「兩者皆有」呼叫 `createAuth`
- **THEN** 只有「兩者皆有」時 `options.socialProviders` 含 `google`
- **驗收**：`hono-pickball/test/auth-config.test.ts`，it 名稱「Google provider 只在 client id 與 secret 皆存在時註冊」

### Requirement: requireSession 與 GET /api/me

`hono-pickball/src/auth/` SHALL 匯出 Hono middleware `requireSession`：以 `auth.api.getSession({ headers })` 取得 session，
無有效 session（無 cookie、cookie 無效或已登出）時 MUST 回 `401` 與 JSON `{ "error": "UNAUTHORIZED" }`，
有效時 MUST 把 `user` 與 `session` 設進 Hono context 後繼續。Wave 2 的使用者資料 API SHALL 以它保護。

`GET /api/me` SHALL 經 `requireSession`，回 `200` 與 `{ "user": { "id", "email", "name" } }`——只回這三個欄位，
SHALL NOT 回傳密碼雜湊、token 或其他 account 資料。回傳的永遠是 cookie 所屬的使用者本人。

#### Scenario: 未登入呼叫 /api/me 回 401

- **GIVEN** 本機登入啟用
- **WHEN** 不帶 cookie 呼叫 `GET /api/me`
- **THEN** status 401，body 為 `{ "error": "UNAUTHORIZED" }`
- **驗收**：`hono-pickball/test/auth-me.test.ts`，it 名稱「未登入呼叫 /api/me 回 401」

#### Scenario: 無效 cookie 回 401

- **WHEN** 帶著偽造的 `better-auth.session_token` 呼叫 `GET /api/me`
- **THEN** status 401
- **驗收**：`hono-pickball/test/auth-me.test.ts`，it 名稱「偽造的 session cookie 呼叫 /api/me 回 401」

#### Scenario: 登入後 /api/me 回本人且只含三個欄位

- **GIVEN** 以測試帳號登入取得 cookie
- **WHEN** 帶該 cookie 呼叫 `GET /api/me`
- **THEN** status 200，`user` 的鍵集合恰為 `id`、`email`、`name`，`email` 等於測試帳號
- **驗收**：`hono-pickball/test/auth-me.test.ts`，it 名稱「登入後 /api/me 回本人的 id、email 與 name」

#### Scenario: 不會取得其他使用者的資料

- **GIVEN** 已 seed 使用者 A 與 B，以 A 登入取得 cookie
- **WHEN** 帶 A 的 cookie 呼叫 `GET /api/me`
- **THEN** 回傳的 `id` 等於 A 的 id，SHALL NOT 等於 B 的 id
- **驗收**：`hono-pickball/test/auth-me.test.ts`，it 名稱「A 的 cookie 只能取得 A 而非 B 的資料」

#### Scenario: 登出後原 cookie 失效

- **GIVEN** 以測試帳號登入取得 cookie
- **WHEN** 帶該 cookie 呼叫 `POST /api/auth/sign-out`，再以同一 cookie 呼叫 `GET /api/me`
- **THEN** 後者 status 401
- **驗收**：`hono-pickball/test/auth-me.test.ts`，it 名稱「登出後原 session cookie 呼叫 /api/me 回 401」

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

### Requirement: 測試帳號以 seed 寫入本機 D1

`hono-pickball/src/db/seed/test-account.ts` SHALL 匯出 `buildTestAccountSeedSql({ email, password, name, now })`，
回傳一段可直接交給 `wrangler d1 execute --file` 的 SQL：先刪除同 email 的既有使用者（cascade 帶走其 account／session），
再插入一筆 `user` 與一筆 `account`（`providerId = "credential"`、`accountId = userId`、`password` 為 `better-auth/crypto`
的 `hashPassword` 產生的雜湊）。SQL 中 SHALL NOT 出現明文密碼；字串值中的單引號 MUST 正確跳脫。

`hono-pickball/scripts/seed-test-account.ts` SHALL 從 `hono-pickball/.dev.vars` 讀取 `TEST_ACCOUNT_EMAIL`、
`TEST_ACCOUNT_PASSWORD`、`TEST_ACCOUNT_NAME`（缺任一即以非 0 結束並說明缺哪個），把 SQL 寫到 `.wrangler/` 下的暫存檔，
**只**以 `wrangler d1 execute DB --local --env local --file <暫存檔>` 執行，完成後刪除暫存檔。腳本 SHALL NOT 含 `--remote`。

#### Scenario: seed 後的測試帳號可以登入

- **GIVEN** 把 `buildTestAccountSeedSql` 的輸出套用到測試用 D1
- **WHEN** 以同一組帳密呼叫 `POST /api/auth/sign-in/email`
- **THEN** status 200
- **驗收**：`hono-pickball/test/seed-test-account.test.ts`，it 名稱「seed 產生的測試帳號可以登入」

#### Scenario: 重複 seed 不產生重複使用者

- **WHEN** 對同一 email 連續套用兩次 seed SQL（第二次使用不同密碼）
- **THEN** `user` 表中該 email 恰為 1 筆、`account` 表中該使用者恰為 1 筆，且只有第二次的密碼能登入
- **驗收**：`hono-pickball/test/seed-test-account.test.ts`，it 名稱「重複 seed 同一 email 只留下一筆且以最新密碼為準」

#### Scenario: SQL 不含明文密碼且正確跳脫單引號

- **WHEN** 以含單引號的 name（例：`O'Neil`）與密碼 `p@ss'word` 產生 SQL
- **THEN** SQL 字串不含 `p@ss'word`，套用後 `user.name` 讀回為 `O'Neil`
- **驗收**：`hono-pickball/test/seed-test-account.test.ts`，it 名稱「seed SQL 不含明文密碼且正確跳脫單引號」

#### Scenario: seed 腳本只寫本機 D1

- **WHEN** 檢查 `hono-pickball/scripts/seed-test-account.ts`
- **THEN** 呼叫 wrangler 的參數含 `--local` 與 `--env local`，全檔不含字串 `--remote`
- **驗收**：tasks.md 指令驗收 C3（`grep` 紀錄）

### Requirement: 前端以 /api/session 作為登入狀態的唯一來源

`nextjs-pickball/lib/auth/session-client.ts` SHALL 提供 `fetchSession()`：以 `GET /api/session`（same-origin）取得
`{ authEnabled, user, signInMethods? }`。回應為 200 且形狀符合（`authEnabled` 為布林、`user` 為 `null` 或含字串 `id`／`email`／`name` 的物件、
`signInMethods` 不存在或為含布林 `google` 與 `emailPassword` 的物件）時原樣回傳——`signInMethods` 不存在時回傳值 SHALL NOT 含此鍵
（相容 G1 之前的後端：當時 `authEnabled: true` 只代表測試帳號登入）；
**任何其他情況**（非 200、JSON 解析失敗、形狀不符——含 `signInMethods` 存在但形狀不符、網路錯誤）MUST 回傳 `null` 且 SHALL NOT throw；回傳型別為 `Promise<SessionState | null>`。
`null` 代表「這次無法確認登入狀態」，與 200 且形狀正確的「未登入」或「auth 停用」不同，`fetchSession()` 本身 SHALL NOT 把它降級為未啟用：
是否降級由唯一呼叫端 session store 依上次登入提示決定（「全頁共用的 session store 與 useSession」）——沒有提示時仍 fail-closed 為未啟用，訪客介面維持現狀；
有提示時改為無法確認，SHALL NOT 讓登入者在不知情的情況下改用本機資料。

請求 MUST 以 `keepalive: true` 發出：WebKit 會拒絕「整頁導覽開始後才發出」的一般 fetch，並由瀏覽器自行輸出 console 錯誤
（`Fetch API cannot load … due to access control checks`，不是 JS 例外，try/catch 擋不住），使既有 E2E 的 console 守衛失敗；
`keepalive` 請求不受此限制。回應處理與失敗回 `null` 的規則不變。

`nextjs-pickball/lib/auth/session-store.ts` 的 ready 快照 MUST 原樣帶出 `fetchSession()` 非 `null` 回傳值的全部欄位（含 `signInMethods`），SHALL NOT 只挑 `authEnabled` 與 `user`。

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
- **THEN** 四種情況 `fetchSession()` 皆回傳 `null` 且不 throw（是否降級為未啟用改由 session store 依上次登入提示決定，見「全頁共用的 session store 與 useSession」）
- **註**：標題沿用主 spec 原名（openspec 不允許 MODIFIED 刪除或改名既有 Scenario），行為以本段 THEN 為準
- **驗收**：`nextjs-pickball/lib/auth/session-client.test.ts`，it 名稱「fetchSession 於非 200、形狀不符或網路錯誤時回傳 null 且不拋錯」（改寫既有 it「fetchSession 於非 200、形狀不符或網路錯誤時回傳未啟用且不拋錯」）

#### Scenario: 回應含 signInMethods 時一併回傳

- **WHEN** `/api/session` 回 200 與 `{ "authEnabled": true, "user": null, "signInMethods": { "google": true, "emailPassword": false } }`
- **THEN** `fetchSession()` 回傳 `{ authEnabled: true, user: null, signInMethods: { google: true, emailPassword: false } }`
- **驗收**：`nextjs-pickball/lib/auth/session-client.test.ts`，it 名稱「fetchSession 回傳後端提供的 signInMethods」

#### Scenario: signInMethods 形狀不符時降級為未啟用

- **WHEN** `/api/session` 回 200，`authEnabled` 為 `true`、`user` 為 `null`，`signInMethods` 分別為 `null`、`"google"`、`{ "google": true }`、`{ "google": "yes", "emailPassword": false }`
- **THEN** 四種情況 `fetchSession()` 皆回傳 `null` 且不 throw
- **註**：標題沿用主 spec 原名（openspec 不允許 MODIFIED 刪除或改名既有 Scenario），行為以本段 THEN 為準
- **驗收**：`nextjs-pickball/lib/auth/session-client.test.ts`，it 名稱「signInMethods 形狀不符時 fetchSession 回傳 null」（改寫既有 it「signInMethods 形狀不符時 fetchSession 回傳未啟用」）

#### Scenario: session store 的快照保留 signInMethods

- **GIVEN** `fetchSession` 被替換為回傳 `{ authEnabled: true, user: null, signInMethods: { google: true, emailPassword: false } }` 的假函式
- **WHEN** 訂閱 store 並等待請求完成
- **THEN** 快照為 `{ status: "ready", authEnabled: true, user: null, signInMethods: { google: true, emailPassword: false } }`
- **驗收**：`nextjs-pickball/lib/auth/session-store.test.ts`，it 名稱「fetchSession 回傳 signInMethods 時快照保留同一份 signInMethods」

### Requirement: 前端登入與登出的請求契約

`signInWithEmail(email, password)` SHALL 以 `POST /api/auth/sign-in/email`、`Content-Type: application/json`、body `{ email, password }` 送出，
並把結果對應為：200 → `{ ok: true }`；401 → `{ ok: false, reason: "invalid-credentials" }`；404 → `{ ok: false, reason: "unavailable" }`
（本機登入未啟用）；其他狀態或網路錯誤 → `{ ok: false, reason: "failed" }`。SHALL NOT throw。

`signOut()` SHALL 以 `POST /api/auth/sign-out` 送出（`Content-Type: application/json`、body `{}`），回傳是否為 2xx，SHALL NOT throw。

#### Scenario: 登入請求的形狀

- **WHEN** 呼叫 `signInWithEmail("a@example.com", "pw")`
- **THEN** `fetch` 被呼叫一次，URL 為 `/api/auth/sign-in/email`、method 為 `POST`、`Content-Type` 為 `application/json`、body 解析後等於 `{ email: "a@example.com", password: "pw" }`
- **驗收**：`nextjs-pickball/lib/auth/session-client.test.ts`，it 名稱「signInWithEmail 以 JSON POST 至 /api/auth/sign-in/email」

#### Scenario: 登入結果對應

- **WHEN** 後端分別回 200、401、404、500，以及 `fetch` 拋出例外
- **THEN** 依序回傳 `{ ok: true }`、`invalid-credentials`、`unavailable`、`failed`、`failed`
- **驗收**：`nextjs-pickball/lib/auth/session-client.test.ts`，it 名稱「signInWithEmail 依狀態碼回傳 ok、invalid-credentials、unavailable 或 failed」

#### Scenario: 登出請求的形狀與結果

- **WHEN** 呼叫 `signOut()`，後端分別回 200 與 500
- **THEN** `fetch` 以 `POST` 呼叫 `/api/auth/sign-out`；前者回傳 `true`、後者 `false`
- **驗收**：`nextjs-pickball/lib/auth/session-client.test.ts`，it 名稱「signOut 以 POST 呼叫 /api/auth/sign-out 並回傳是否成功」

### Requirement: 全頁共用的 session store 與 useSession

`nextjs-pickball/lib/auth/session-store.ts` SHALL 提供單一 module 層級 store：
- 初始快照：localStorage 沒有上次登入提示（「上次登入提示的儲存與清除」）時為 `{ status: "loading" }`；有提示時 client 端為 `{ status: "loading", signedInHint: true }`。
  提示在 client 端**第一次讀取快照時**讀一次並快取（未變更時 `getSnapshot()` MUST 回傳同一個參考）；模組載入時 SHALL NOT 讀取 localStorage。
- `SessionSnapshot` 的 loading 變體以 union 表達三種（ready 變體不變）：
  `{ status: "loading"; signedInHint?: true }`（一般載入中）、
  `{ status: "loading"; signedInHint: true; unavailable: true }`（**無法確認**：必帶提示）、
  `{ status: "loading"; localFallback: true }`（**本機備援**）。
  無法確認與本機備援快照各為 module 層級的固定參考。三者的 `status` 都是 `"loading"`：只看 `status === "loading"` 的元件（navbar `AccountEntry`、登入頁 `LoginForm`）不需修改，
  在無法確認與本機備援時仍顯示載入中佔位——已知取捨（此時沒有登入或登出入口，重新整理頁面即重新確認 session）。
- **第一次被訂閱時**才呼叫 `fetchSession()`，取得**非 `null`** 結果後快照變為 `{ status: "ready", authEnabled, user }` 並通知訂閱者；
- **採用到 `null`（請求失敗）**：於採用當下以 `readSignedInHint()` 讀取提示——有提示時快照 MUST 改為無法確認快照並通知訂閱者；沒有提示時快照為 `{ status: "ready", authEnabled: false, user: null }`（fail-closed，訪客行為不變）。
  兩者皆 SHALL NOT 寫入或清除提示。此規則同樣適用於已登入使用中呼叫的 `refresh()`（例如雲端 hook 收到 401 之後）：請求失敗時改為無法確認，SHALL NOT 改為 auth 停用而退回本機。
- 在第一次請求完成前新增的訂閱者 SHALL NOT 觸發第二次請求；
- `refresh()` MUST 重新呼叫 `fetchSession()` 並通知所有訂閱者（登入、登出後由呼叫端觸發）；請求期間快照維持原值，結果依上列規則採用；
- **等待逾時**：快照帶 `signedInHint` 時，自第一次訂閱起 10 秒（`SIGNED_IN_HINT_WAIT_MS = 10_000`）仍未採用任何回應，快照 MUST 改為無法確認快照並通知訂閱者——
  SHALL NOT 改回不帶提示的 `{ status: "loading" }`（那會讓已登入者悄悄改用本機資料），也 SHALL NOT 永遠停在等待中。進行中的請求不取消：之後回應到達照常採用（非 `null` → ready；`null` → 維持無法確認）。已轉為 ready 後逾時 SHALL NOT 改變快照。
- **本機備援**：`chooseLocalFallback(): void`（不是 React hook，不以 `use` 開頭）只在快照為無法確認時有效：快照 MUST 改為本機備援快照並通知訂閱者，
  同時使進行中請求的結果被丟棄（遞增請求編號，比照既有「只有最新一次請求的回應能更新快照」）——本次頁面期間不會被晚到的回應切走；
  之後只有明確呼叫的 `refresh()` 會再改變快照（結果依上列規則採用）。不寫入也不清除提示；重新整理頁面即回到初始流程。
  其他快照下呼叫 SHALL NOT 改變快照、SHALL NOT 通知訂閱者、SHALL NOT 影響進行中的請求。

`nextjs-pickball/hooks/useSession.ts` SHALL 以 `useSyncExternalStore` 讀取該 store，回傳快照、`refresh` 與 `hydrated: boolean`。
`hydrated` 以第二個 `useSyncExternalStore`（不訂閱任何來源，client 快照為 `true`、server snapshot 為 `false`）取得：伺服器端 render 與 hydration 那次 render 為 `false`，hydration 完成後為 `true`；
client 端非 hydration 的 mount（例如 client 端導覽）第一次 render 即為 `true`。它供 `user-data-sync`「前端依 session 選擇儲存模式」判斷「伺服器輸出與 hydration 時儲存模式未定」，不改變 session 快照本身。
server snapshot MUST 固定為 `{ status: "loading" }`（**不帶** `signedInHint`、`unavailable` 或 `localFallback`，伺服器端無從得知）——伺服器端與 hydration 時的第一次 render 一致，不產生 hydration mismatch；
hydration 完成後 React 依 client 快照重新 render，此時才反映提示。這是專案讀取瀏覽器狀態而不造成 hydration mismatch 的既有做法（同一個 store），SHALL NOT 改用在 render 期間直接讀 localStorage。

所有需要登入狀態的元件（navbar、登入頁，以及 Wave 2 的儲存層切換）SHALL 透過 `useSession` 取得，SHALL NOT 各自呼叫 `/api/session`。

#### Scenario: 初始為 loading，第一次訂閱後轉為 ready

- **GIVEN** `fetchSession` 被替換為回傳 `{ authEnabled: true, user: null }` 的假函式；localStorage 沒有上次登入提示
- **WHEN** 讀取初始快照，接著訂閱並等待請求完成
- **THEN** 初始快照為 `{ status: "loading" }`；完成後為 `{ status: "ready", authEnabled: true, user: null }`，訂閱者被通知
- **驗收**：`nextjs-pickball/lib/auth/session-store.test.ts`，it 名稱「初始為 loading，第一次訂閱後取得 session 並轉為 ready」

#### Scenario: 多個訂閱者共用一次請求

- **WHEN** 在第一次請求完成前連續訂閱三次
- **THEN** `fetchSession` 只被呼叫一次
- **驗收**：`nextjs-pickball/lib/auth/session-store.test.ts`，it 名稱「請求完成前的多個訂閱者只觸發一次請求」

#### Scenario: refresh 重新取得並通知

- **GIVEN** store 已為 ready 且 `user` 為 null
- **WHEN** 假函式改為回傳已登入使用者後呼叫 `refresh()`
- **THEN** `fetchSession` 再被呼叫一次，所有訂閱者被通知，快照的 `user` 為該使用者
- **驗收**：`nextjs-pickball/lib/auth/session-store.test.ts`，it 名稱「refresh 重新取得 session 並通知所有訂閱者」

#### Scenario: useSession 隨 store 更新

- **WHEN** 以 `renderHook(useSession)` 渲染，等待 ready 後呼叫回傳的 `refresh`
- **THEN** hook 回傳值先為 loading、再為 ready，refresh 後反映新的 `user`
- **驗收**：`nextjs-pickball/hooks/useSession.test.ts`，it 名稱「useSession 回傳 store 快照並隨 refresh 更新」

#### Scenario: 伺服器端 render 為 loading

- **WHEN** 以 `react-dom/server` 的 `renderToString` 渲染一個顯示 `useSession().status` 的元件
- **THEN** 輸出含 `loading`，且 `fetchSession` 未被呼叫
- **驗收**：`nextjs-pickball/hooks/useSession.test.ts`，it 名稱「伺服器端 render 時 useSession 為 loading 且不發請求」

#### Scenario: 有上次登入提示時 client 初始快照帶提示而伺服器端快照不帶

- **GIVEN** localStorage 有上次登入提示；`fetchSession` 為永不完成的假函式
- **WHEN** 讀取 `getSnapshot()` 兩次與 `getServerSnapshot()`
- **THEN** `getSnapshot()` 為 `{ status: "loading", signedInHint: true }` 且兩次為同一個參考；`getServerSnapshot()` 為 `{ status: "loading" }`；`fetchSession` 未被呼叫
- **驗收**：`nextjs-pickball/lib/auth/session-store.test.ts`，it 名稱「有上次登入提示時 client 初始快照帶 signedInHint 而伺服器端快照不帶」

#### Scenario: 帶提示等待逾時後回到不帶提示的 loading

- **GIVEN** localStorage 有上次登入提示；`fetchSession` 為永不完成的假函式；使用 fake timers
- **WHEN** 訂閱後推進 9,999 毫秒、再推進 1 毫秒；另一輪中 `fetchSession` 在逾時前回應已登入，再推進超過 10 秒
- **THEN** 9,999 毫秒時快照仍為 `{ status: "loading", signedInHint: true }`；10 秒時快照為 `{ status: "loading", signedInHint: true, unavailable: true }`、訂閱者被通知且提示仍在；另一輪中快照維持 ready、不被逾時改變；逾時後 SHALL NOT 回到不帶提示的 loading
- **註**：標題沿用主 spec 原名（openspec 不允許 MODIFIED 刪除或改名既有 Scenario），行為以本段 THEN 為準
- **驗收**：`nextjs-pickball/lib/auth/session-store.test.ts`，it 名稱「帶提示等待逾時仍未取得 session 時快照改為無法確認」（改寫既有 it「帶提示等待逾時仍未取得 session 時快照改回不帶提示的 loading」）

#### Scenario: 有提示時 hydration 一致且完成後反映提示

- **GIVEN** localStorage 有上次登入提示；`fetchSession` 為永不完成的假函式；一個依 `useSession()` 顯示「是否帶提示」的元件
- **WHEN** 以 `renderToString` 產生伺服器端輸出，放進容器後以 `hydrateRoot` hydrate
- **THEN** 伺服器端輸出為「不帶提示」；hydrate 過程 `onRecoverableError` 與 `console.error` 皆未被呼叫；hydrate 完成後畫面為「帶提示」
- **驗收**：`nextjs-pickball/hooks/useSession.test.ts`，it 名稱「有上次登入提示時伺服器端輸出不帶提示、hydration 不產生不一致且完成後反映提示」

#### Scenario: hydrated 在伺服器端與 hydration 時為 false，完成後為 true

- **GIVEN** `fetchSession` 為永不完成的假函式；一個顯示 `String(useSession().hydrated)` 的元件
- **WHEN** 以 `renderToString` 產生伺服器端輸出，放進容器後以 `hydrateRoot` hydrate
- **THEN** 伺服器端輸出為 `false`；hydrate 過程 `onRecoverableError` 與 `console.error` 皆未被呼叫；hydrate 完成後畫面為 `true`
- **驗收**：`nextjs-pickball/hooks/useSession.test.ts`，it 名稱「hydrated 在伺服器端輸出與 hydration 時為 false，hydration 完成後為 true」

#### Scenario: client 端非 hydration 的 mount 第一次 render 即為 hydrated

- **WHEN** 以 `renderHook` 渲染 `useSession`，並在 render 階段同步記錄每次 render 的 `hydrated`
- **THEN** 第一筆即為 `true`
- **驗收**：`nextjs-pickball/hooks/useSession.test.ts`，it 名稱「client 端一般 mount 的第一次 render 即為 hydrated」

#### Scenario: session 請求失敗且有上次登入提示時改為無法確認並保留提示

- **GIVEN** localStorage 有上次登入提示；`fetchSession` 回傳 `null`
- **WHEN** 訂閱並等待請求完成，之後讀取 `getSnapshot()` 兩次，接著呼叫 `chooseLocalFallback()`
- **THEN** 快照為 `{ status: "loading", signedInHint: true, unavailable: true }` 且兩次為同一個參考；訂閱者被通知；提示仍在；呼叫 `chooseLocalFallback()` 後快照為 `{ status: "loading", localFallback: true }`（請求失敗而進入的無法確認，按鈕同樣有效）
- **驗收**：`nextjs-pickball/lib/auth/session-store.test.ts`，it 名稱「session 請求失敗且有上次登入提示時快照改為無法確認且保留提示」

#### Scenario: session 請求失敗且沒有提示時仍降級為 auth 停用

- **GIVEN** localStorage 為空；`fetchSession` 回傳 `null`
- **WHEN** 訂閱並等待請求完成
- **THEN** 快照為 `{ status: "ready", authEnabled: false, user: null }`；localStorage 仍為空（沒有寫入提示）
- **驗收**：`nextjs-pickball/lib/auth/session-store.test.ts`，it 名稱「session 請求失敗且沒有上次登入提示時快照為 auth 停用的 ready」

#### Scenario: 已登入使用中重新取得 session 失敗時改為無法確認

- **GIVEN** localStorage 沒有提示；`fetchSession` 先回傳已登入使用者，之後回傳 `null`
- **WHEN** 訂閱並等待 ready（提示因此寫入），接著呼叫 `refresh()` 並等待完成
- **THEN** `refresh()` 後快照為 `{ status: "loading", signedInHint: true, unavailable: true }`（不是 auth 停用的 ready）；提示仍在
- **驗收**：`nextjs-pickball/lib/auth/session-store.test.ts`，it 名稱「已登入使用中 refresh 失敗時快照改為無法確認且保留提示」

#### Scenario: 無法確認之後晚到的回應仍照常採用

- **GIVEN** localStorage 有上次登入提示；`fetchSession` 回傳一個由測試控制完成時機的 Promise；使用 fake timers
- **WHEN** 訂閱後推進 10 秒（快照改為無法確認），再讓該請求回應已登入使用者；另一輪中（重設 store）同樣逾時後，讓進行中的請求才回 `null`
- **THEN** 快照轉為 `{ status: "ready", authEnabled: true, user: <該使用者> }` 並通知訂閱者；提示仍在；另一輪中快照維持同一個無法確認參考、提示仍在
- **驗收**：`nextjs-pickball/lib/auth/session-store.test.ts`，it 名稱「無法確認之後才到達的 session 回應仍照常採用」

#### Scenario: 選擇本機備援後丟棄進行中請求的結果

- **GIVEN** localStorage 有上次登入提示；`fetchSession` 回傳一個由測試控制完成時機的 Promise；使用 fake timers；訂閱後推進 10 秒，快照為無法確認
- **WHEN** 呼叫 `chooseLocalFallback()`，再讓先前的請求回應未登入（`{ authEnabled: true, user: null }`）；之後讓 `fetchSession` 回 `null` 並呼叫 `refresh()`；再把 `fetchSession` 改為回傳已登入使用者並呼叫 `refresh()`
- **THEN** 呼叫後快照為 `{ status: "loading", localFallback: true }`、再讀一次為同一個參考、訂閱者被通知、提示仍在；先前請求的回應到達後快照不變**且提示仍在**（被丟棄的回應不清除提示）；`refresh()` 回 `null` 時快照回到無法確認、提示仍在；最後一次 `refresh()` 完成後快照為已登入的 ready
- **驗收**：`nextjs-pickball/lib/auth/session-store.test.ts`，it 名稱「chooseLocalFallback 在無法確認時改為本機備援並丟棄進行中請求的結果」

#### Scenario: 不是無法確認時選擇本機備援沒有效果

- **GIVEN** 三種快照：沒有提示的 loading（請求進行中）、帶提示的 loading（請求進行中、尚未逾時）、ready
- **WHEN** 各自呼叫 `chooseLocalFallback()`；前兩種之後再讓進行中的請求回應已登入使用者
- **THEN** 呼叫前後 `getSnapshot()` 為同一個參考、訂閱者未被通知；前兩種的請求回應仍被採用，快照轉為已登入的 ready
- **驗收**：`nextjs-pickball/lib/auth/session-store.test.ts`，it 名稱「不是無法確認時呼叫 chooseLocalFallback 不改變快照也不通知」

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

### Requirement: 換帳號用的衍生測試帳號

本 Requirement 補充「測試帳號以 seed 寫入本機 D1」：`hono-pickball/src/db/seed/test-account.ts` SHALL 另匯出 `deriveSwitchAccountEmail(email)`，
回傳由測試帳號 email 衍生、必定不同於原值且對同一輸入恆定的第二個 email（plus addressing：本地部分加上固定後綴；本地部分已含 `+` 時仍 MUST 產生不同的值），
供「另一分頁換帳號」的 E2E 使用。

`hono-pickball/scripts/seed-test-account.ts` SHALL 以同一組 `TEST_ACCOUNT_PASSWORD` 產生**兩個**帳號的 seed SQL（沿用 `buildTestAccountSeedSql`）：
原測試帳號，以及 `deriveSwitchAccountEmail(TEST_ACCOUNT_EMAIL)`（name 為 `TEST_ACCOUNT_NAME` 加上「（B）」），兩者寫入同一個暫存檔、以同一次 `wrangler d1 execute DB --local --env local --file` 執行。
腳本 SHALL NOT 新增任何 `.dev.vars` 變數（第二帳號完全由既有三個變數衍生）；既有的「只寫本機 D1」「SQL 不含明文密碼」「重複 seed 不產生重複使用者」規則對第二帳號同樣成立。

#### Scenario: 衍生測試帳號：衍生 email 必與原值不同且恆定

- **WHEN** 分別以 `tester@example.com` 與 `tester+x@example.com` 呼叫 `deriveSwitchAccountEmail`，各呼叫兩次
- **THEN** 回傳值皆含一個 `@` 且網域與輸入相同、皆不等於輸入，且同一輸入兩次結果相同
- **驗收**：`hono-pickball/test/seed-test-account.test.ts`，it 名稱「deriveSwitchAccountEmail 產生不同於原值且固定的 email」

#### Scenario: 衍生測試帳號：衍生帳號以同一組密碼可以登入

- **GIVEN** 把原 email 與其衍生 email 以同一組密碼產生的 seed SQL 套用到測試用 D1
- **WHEN** 分別以兩個 email 與該密碼呼叫 `POST /api/auth/sign-in/email`
- **THEN** 兩者皆回 200，且兩者的 `user.id` 不同
- **驗收**：`hono-pickball/test/seed-test-account.test.ts`，it 名稱「衍生帳號與原帳號以同一組密碼皆可登入且為不同使用者」

#### Scenario: 衍生測試帳號：seed 腳本建立原帳號與衍生帳號

- **GIVEN** `.dev.vars` 齊備，已執行 `db:migrate:local`
- **WHEN** 執行 `pnpm --filter ./hono-pickball db:seed:local` 兩次
- **THEN** 兩次皆 exit 0；`user` 表中原 email 與衍生 email 各恰 1 筆；兩個帳號都能以 `TEST_ACCOUNT_PASSWORD` 登入；腳本全檔不含 `--remote`
- **驗收**：tasks.md 指令驗收 C2（seed 後以 `wrangler d1 execute DB --local --env local` 計數、以 curl 登入兩個帳號的紀錄；紀錄不得含密碼值）

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

### Requirement: 上次登入提示的儲存與清除

`nextjs-pickball/lib/auth/session-hint.ts` SHALL 匯出 `SIGNED_IN_HINT_STORAGE_KEY`（值為 `auth:signed-in-hint:v1`，沿用專案 `<領域>:<名稱>:v<版本>` 的 localStorage 命名慣例）、
`readSignedInHint(): boolean`、`writeSignedInHint(): void`、`clearSignedInHint(): void`，是上次登入提示在 localStorage 的**唯一讀寫點**（瀏覽器 I/O 放 `lib/` 的既有慣例）。

- 提示 MUST 只存固定字串 `"1"`；SHALL NOT 存 user id、email、name 或任何其他使用者資訊。讀取時只有值**恰為** `"1"` 才為 true，其他值（含舊格式或被竄改）一律為 false。
- 三個函式 SHALL NOT throw：localStorage 不存在（SSR）、不可用或 `getItem`／`setItem`／`removeItem` 拋例外時，讀取回 false、寫入與清除靜默略過。
- 寫入與清除時機：
  - session store 每次**採用**一份**非 `null`** 的 `fetchSession()` 結果時（即 200 且形狀正確）：`authEnabled === true` 且 `user !== null` → `writeSignedInHint()`；其餘（未登入、auth 停用）→ `clearSignedInHint()`。
    被丟棄的過時回應（已有更新的請求，或使用者已選擇本機備援）SHALL NOT 寫入或清除提示。
  - 採用到 `null`（請求失敗）、帶提示等待逾時、呼叫 `chooseLocalFallback()` 三種情況 SHALL NOT 寫入或清除提示：登入狀態只是這次無法確認，下一次重新整理仍應先等待 session，而不是直接顯示本機資料
    （逐一由「全頁共用的 session store 與 useSession」的無法確認、逾時與本機備援 Scenario 斷言提示仍在）。
  - `signOut()`（`lib/auth/session-client.ts`）在登出請求回 2xx 時 MUST 立即 `clearSignedInHint()`，不等之後的 `refresh()`——使用者在 refresh 完成前重新整理也不會進入等待中；登出失敗時 SHALL NOT 清除（使用者仍為登入狀態）。
- 提示的生命週期跟隨 session，不屬於使用者資料：`data-transfer`「清除本機資料與其確認流程」SHALL NOT 清除它，JSON 備份與本機資料匯入雲端皆不讀取它。

已知取捨：登出以外的方式結束 session（cookie 過期、在其他裝置撤銷）時提示會殘留，該瀏覽器下一次重新整理會先短暫顯示等待中，session 回應後回到本機畫面並清除提示。
請求失敗不清除提示：後端或網路長時間異常時，帶提示的瀏覽器每次重新整理都會先等待、再顯示無法確認畫面（可選擇先用這台裝置的資料），直到 session 能夠確認為止。

#### Scenario: 提示只以固定值寫入並可清除

- **GIVEN** localStorage 為空
- **WHEN** 依序呼叫 `readSignedInHint()`、`writeSignedInHint()`、`readSignedInHint()`、`clearSignedInHint()`、`readSignedInHint()`
- **THEN** 依序為 false、（寫入後 `localStorage.getItem("auth:signed-in-hint:v1")` 恰為 `"1"`，且 localStorage 只多出這一個 key）、true、（key 已移除）、false；`SIGNED_IN_HINT_STORAGE_KEY` 為 `auth:signed-in-hint:v1`
- **驗收**：`nextjs-pickball/lib/auth/session-hint.test.ts`，it 名稱「寫入後讀取為 true 且只存固定值，清除後讀取為 false」

#### Scenario: 非固定值或 localStorage 不可用時不拋錯

- **WHEN** 該 key 的值分別為 `"true"`、`"0"`、`"u1"` 時讀取；以及 `getItem`、`setItem`、`removeItem` 皆被替換為拋出例外時呼叫三個函式
- **THEN** 讀取皆為 false；三個函式皆不拋錯
- **驗收**：`nextjs-pickball/lib/auth/session-hint.test.ts`，it 名稱「值不是固定值或 localStorage 不可用時讀取為 false 且讀寫清除皆不拋錯」

#### Scenario: session 確認結果決定寫入或清除提示

- **GIVEN** `fetchSession` 依序回傳已登入使用者、`{ authEnabled: true, user: null }`、已登入使用者、`{ authEnabled: false, user: null }`
- **WHEN** 訂閱後等待 ready，之後每次 `refresh()` 完成時檢查提示
- **THEN** 依序為有提示、無提示、有提示、無提示
- **驗收**：`nextjs-pickball/lib/auth/session-store.test.ts`，it 名稱「session 確認為已登入時寫入提示，確認為未登入或 auth 停用時清除提示」

#### Scenario: 過時的 session 回應不改變提示

- **GIVEN** 兩個進行中的請求 A（較舊）與 B（較新）
- **WHEN** B 先回應已登入使用者，A 之後才回應 `{ authEnabled: true, user: null }`
- **THEN** 提示維持存在（A 被丟棄），快照的 `user` 為 B 的使用者
- **驗收**：`nextjs-pickball/lib/auth/session-store.test.ts`，it 名稱「被丟棄的過時 session 回應不改變提示」

#### Scenario: 登出成功時立即清除提示

- **GIVEN** localStorage 有上次登入提示
- **WHEN** `signOut()` 的請求分別回 200 與 500
- **THEN** 回 200 時提示被清除；回 500 時提示仍在
- **驗收**：`nextjs-pickball/lib/auth/session-client.test.ts`，it 名稱「signOut 成功時清除上次登入提示，失敗時保留」
