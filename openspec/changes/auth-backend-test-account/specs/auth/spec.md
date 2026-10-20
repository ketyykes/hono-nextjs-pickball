## ADDED Requirements

### Requirement: 本機測試帳號登入只在 ENVIRONMENT 為 development 時啟用

`hono-pickball/src/auth/` SHALL 提供 `isLocalAuthEnabled(env)`，其值 MUST 為 `env.ENVIRONMENT === "development"`；
`ENVIRONMENT` 缺值、空字串或任何其他值（含 `"production"`、`"Development"`）一律為停用。這是反向設計：
遠端環境沒有 `.dev.vars`，忘了設變數時預設是**關**的。

停用時：`/api/auth/*`（GET 與 POST）與 `GET /api/me` MUST 回 `404`，且 SHALL NOT 建立 auth 實例、SHALL NOT 觸碰 D1
（正式部署設定沒有 `DB` binding）。

啟用與否的判斷 SHALL 只有 `isLocalAuthEnabled` 一處；`createAuth` 的 `emailAndPassword.enabled` MUST 同樣取自它（第二道防線）。

#### Scenario: ENVIRONMENT 缺值時 email 登入不可用

- **GIVEN** env 不含 `ENVIRONMENT`，且測試帳號已 seed
- **WHEN** 以正確帳密 `POST /api/auth/sign-in/email`
- **THEN** 回應 status 為 404，且回應不含 `Set-Cookie`
- **驗收**：`hono-pickball/test/auth-gating.test.ts`，it 名稱「ENVIRONMENT 缺值時 sign-in 回 404 且不發 cookie」

#### Scenario: ENVIRONMENT 為非 development 值時 email 登入不可用

- **GIVEN** env 的 `ENVIRONMENT` 為 `"production"`，且測試帳號已 seed
- **WHEN** 以正確帳密 `POST /api/auth/sign-in/email`
- **THEN** 回應 status 為 404，且回應不含 `Set-Cookie`
- **驗收**：`hono-pickball/test/auth-gating.test.ts`，it 名稱「ENVIRONMENT 為 production 時 sign-in 回 404 且不發 cookie」

#### Scenario: 停用時不觸碰 D1

- **GIVEN** env 不含 `ENVIRONMENT` 也不含 `DB`（等同正式部署設定）
- **WHEN** 分別呼叫 `GET /api/auth/get-session` 與 `GET /api/me`
- **THEN** 兩者皆回 404（而非 500）
- **驗收**：`hono-pickball/test/auth-gating.test.ts`，it 名稱「停用且無 DB binding 時 auth 路由與 /api/me 皆回 404」

#### Scenario: isLocalAuthEnabled 只接受字面值 development

- **WHEN** 以 `ENVIRONMENT` 為 `undefined`、`""`、`"production"`、`"Development"`、`"development"` 分別呼叫 `isLocalAuthEnabled`
- **THEN** 只有 `"development"` 回傳 `true`，其餘皆為 `false`
- **驗收**：`hono-pickball/test/auth-config.test.ts`，it 名稱「isLocalAuthEnabled 只在 ENVIRONMENT 恰為 development 時為真」

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

`GET /api/session` SHALL 在任何環境下回 `200` 與 JSON `{ "authEnabled": boolean, "user": { "id", "email", "name" } | null }`，
SHALL NOT 回 401 或 404——前端每頁都會呼叫它，瀏覽器會把 4xx 的 fetch 記為 console 錯誤，而既有 E2E 監控 console。

- 本機登入停用時 MUST 回 `{ "authEnabled": false, "user": null }`，且 SHALL NOT 建立 auth 實例或觸碰 D1。
- 啟用且無有效 session 時回 `{ "authEnabled": true, "user": null }`。
- 啟用且有效 session 時回 `{ "authEnabled": true, "user": { id, email, name } }`。
- 啟用但查詢 session 時發生例外（例如本機 D1 尚未 migration）MUST 回 `{ "authEnabled": true, "user": null }` 並以
  `console.error` 記錄，SHALL NOT 回 5xx。

本端點只回報狀態，SHALL NOT 作為授權依據；需要授權的端點一律用 `requireSession`。

#### Scenario: 停用時回 authEnabled false 且不需要 DB

- **GIVEN** env 不含 `ENVIRONMENT` 也不含 `DB`
- **WHEN** 呼叫 `GET /api/session`
- **THEN** status 200，body 為 `{ "authEnabled": false, "user": null }`
- **驗收**：`hono-pickball/test/auth-session.test.ts`，it 名稱「停用且無 DB 時回 200 與 authEnabled false」

#### Scenario: 啟用但未登入時回 user null

- **GIVEN** 本機登入啟用
- **WHEN** 不帶 cookie 呼叫 `GET /api/session`
- **THEN** status 200，body 為 `{ "authEnabled": true, "user": null }`
- **驗收**：`hono-pickball/test/auth-session.test.ts`，it 名稱「啟用但未登入時回 200 與 user null」

#### Scenario: 登入後回目前使用者

- **GIVEN** 以測試帳號登入取得 cookie
- **WHEN** 帶該 cookie 呼叫 `GET /api/session`
- **THEN** status 200，`authEnabled` 為 true，`user` 的鍵集合恰為 `id`、`email`、`name`
- **驗收**：`hono-pickball/test/auth-session.test.ts`，it 名稱「登入後回 200 與目前使用者的 id、email 與 name」

#### Scenario: session 查詢失敗時降級為 user null

- **GIVEN** 本機登入啟用，但 `DB` 為任何查詢都拋錯的替身
- **WHEN** 帶任一 `better-auth.session_token` cookie 呼叫 `GET /api/session`
- **THEN** status 200，body 為 `{ "authEnabled": true, "user": null }`
- **驗收**：`hono-pickball/test/auth-session.test.ts`，it 名稱「session 查詢拋錯時仍回 200 與 user null」

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
