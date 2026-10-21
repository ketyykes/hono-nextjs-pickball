# auth Specification

## Purpose
後端（hono-pickball）的身分驗證：以 better-auth 提供本機測試帳號登入（僅 `ENVIRONMENT=development` 啟用）、session 驗證 middleware、`/api/me` 與 `/api/session` 端點，以及本機 D1 測試帳號 seed。

## Requirements

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

### Requirement: 前端以 /api/session 作為登入狀態的唯一來源

`nextjs-pickball/lib/auth/session-client.ts` SHALL 提供 `fetchSession()`：以 `GET /api/session`（same-origin）取得
`{ authEnabled, user }`。回應為 200 且形狀符合（`authEnabled` 為布林、`user` 為 `null` 或含字串 `id`／`email`／`name` 的物件）時原樣回傳；
**任何其他情況**（非 200、JSON 解析失敗、形狀不符、網路錯誤）MUST 回傳 `{ authEnabled: false, user: null }` 且 SHALL NOT throw——
登入狀態取不到時一律當作「未啟用」，訪客介面維持現狀（fail-closed）。

請求 MUST 以 `keepalive: true` 發出：WebKit 會拒絕「整頁導覽開始後才發出」的一般 fetch，並由瀏覽器自行輸出 console 錯誤
（`Fetch API cannot load … due to access control checks`，不是 JS 例外，try/catch 擋不住），使既有 E2E 的 console 守衛失敗；
`keepalive` 請求不受此限制。回應處理與 fail-closed 規則不變。

前端 SHALL NOT 讀取或依賴 session cookie 的名稱或內容（HttpOnly，且 G1 改用 https 後名稱會變成 `__Secure-` 前綴）。
前端 SHALL NOT 以 build-time 環境變數判斷是否顯示登入入口——唯一訊號是 `authEnabled`。

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
- 初始快照為 `{ status: "loading" }`；
- **第一次被訂閱時**才呼叫 `fetchSession()`，取得後快照變為 `{ status: "ready", authEnabled, user }` 並通知訂閱者；
- 在第一次請求完成前新增的訂閱者 SHALL NOT 觸發第二次請求；
- `refresh()` MUST 重新呼叫 `fetchSession()` 並通知所有訂閱者（登入、登出後由呼叫端觸發）。

`nextjs-pickball/hooks/useSession.ts` SHALL 以 `useSyncExternalStore` 讀取該 store，回傳快照與 `refresh`。
server snapshot MUST 固定為 `{ status: "loading" }`——伺服器端與 hydration 時的第一次 render 一致，不產生 hydration mismatch。

所有需要登入狀態的元件（navbar、登入頁，以及 Wave 2 的儲存層切換）SHALL 透過 `useSession` 取得，SHALL NOT 各自呼叫 `/api/session`。

#### Scenario: 初始為 loading，第一次訂閱後轉為 ready

- **GIVEN** `fetchSession` 被替換為回傳 `{ authEnabled: true, user: null }` 的假函式
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

### Requirement: 本機測試帳號登入頁

`/login` SHALL 由 `nextjs-pickball/app/login/page.tsx` 提供，匯出 `metadata` 且 `robots.index` 為 `false`（本機開發用頁面，不進搜尋索引），
不列入 `SiteNavbar` 的 `NAV_LINKS`。頁面內容由 `nextjs-pickball/components/auth/LoginForm.tsx` 依 `useSession` 呈現：

- `loading`：不顯示表單（避免閃現）。
- `authEnabled === false`：顯示「此環境未開放登入」，SHALL NOT 顯示任何輸入欄位。
- 已登入：顯示「已登入：<name>」、回首頁的連結與「登出」按鈕，不顯示表單。點擊「登出」後呼叫 `signOut()`，再呼叫 store 的 `refresh()`，停留在 `/login`
  （窄螢幕下 navbar 不顯示帳號入口，登出由本頁提供，見 `site-navbar`「navbar 顯示帳號入口」）。
- 啟用且未登入：顯示「電子郵件」「密碼」兩個欄位與「登入」按鈕。送出期間按鈕 MUST 為 disabled。
  - 成功 → 呼叫 store 的 `refresh()` 後以 `router.replace("/")` 導向首頁；
  - `invalid-credentials` → 顯示「帳號或密碼錯誤」，保留 email、清空密碼；
  - `unavailable` → 顯示「此環境未開放登入」；
  - `failed` → 顯示「登入失敗，請稍後再試」。

錯誤訊息 MUST 以 `role="alert"` 呈現。本 change SHALL NOT 顯示 Google 登入按鈕（G1）。

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
- **THEN** 登入後導向 `/` 且 navbar 不顯示帳號入口；回到 `/login` 時顯示「已登入：<name>」與「登出」按鈕；登出後顯示「電子郵件」欄位，重新整理後仍為登入表單
- **驗收**：`nextjs-pickball/tests/e2e/specs/auth-session.spec.ts`，test 名稱「窄螢幕下可經由登入頁登入與登出」
