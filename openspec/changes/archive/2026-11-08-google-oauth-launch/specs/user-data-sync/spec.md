# Specification: user-data-sync

## MODIFIED Requirements

### Requirement: 使用者資料 API 的路由、授權與停用閘門

所有讀寫使用者資料的後端端點 SHALL 掛在 `/api/<feature>/...` 之下，以 `hono-pickball/src/routes/<feature>.ts` 的 Hono sub-app 實作，
並以 `app.route("/api/<feature>", <sub-app>)` 掛載。sub-app MUST 以 `use("*", localAuth, requireSession, requireExpectedUser)` 保護其下所有路由：

- `localAuth` SHALL 位於 `hono-pickball/src/auth/local-auth-middleware.ts`，是 `/api/auth/*`、`/api/me` 與所有使用者資料 API **共用的唯一**停用閘門：
  `isAuthEnabled(env)`（`auth`「Google 登入只在 client id 與 secret 皆有值時啟用」：`ENVIRONMENT === "development"` 或 Google 設定齊全）為假時 MUST 回 `404`，且 SHALL NOT 建立 auth 實例、SHALL NOT 觸碰 D1（未設定 Google 的遠端部署與 G1 之前的正式站行為相同）。正式站以 Google 啟用 auth 後，使用者資料 API 與本機同樣經 `requireSession`／`requireExpectedUser` 授權。
- `requireSession` 無有效 session 時 MUST 回 `401 { "error": "UNAUTHORIZED" }`。
- `requireExpectedUser` SHALL 位於 `hono-pickball/src/auth/require-expected-user.ts`，規則見「使用者資料請求的預期帳號守衛」。它只掛在使用者資料 sub-app；
  `requireSession` 本身 SHALL NOT 檢查預期帳號（`GET /api/me` 沿用 `localAuth, requireSession` 而不要求標頭）。
- 端點 MUST 只以 `c.var.user.id` 決定讀寫哪一位使用者的資料；SHALL NOT 從 path、query、body 或 header 接受使用者 id 作為讀寫對象。
  預期帳號標頭只用於**比對**：相符時照常以 `c.var.user.id` 讀寫，不符時整個請求被拒，因此不構成「接受使用者 id」。

其他 capability 中「sub-app 以 `localAuth`＋`requireSession` 保護」之類的敘述（例：`round-lifecycle`「回合與送出比分的雲端 API」），一律以本 Requirement 的完整 middleware 鏈為準。

Hono 型別參數 SHALL 分為兩層：`AuthAppEnv`（`Variables` 只有 `auth`）與 `SessionAppEnv`（再加 `user`、`session`）。
`requireSession` MUST 以 `createMiddleware<SessionAppEnv>` 宣告，使未經 `requireSession` 的 handler 讀取 `c.var.user` 成為型別錯誤
（B2 時兩者為同一型別，漏掛 middleware 不會被 tsc 發現）。

每個使用者資料端點 MUST 在 `hono-pickball/test/` 各有至少一個測試涵蓋四類情境：**未登入回 401**、**存取他人資料被拒**（以另一位使用者的 cookie 讀不到、改不到本人資料）、
**auth 停用回 404**（以 `app.request(path, init, { ...env, ENVIRONMENT: undefined, DB: undefined })` 注入，證明不觸碰 D1；`vitest.config.ts` 注入的 Google 變數為空字串，此 env 因此為停用）、
**預期帳號缺少或不符回 401 `ACCOUNT_MISMATCH` 且資料不變**（由「使用者資料請求的預期帳號守衛」的列舉測試涵蓋，新增端點時補上該測試的樣本請求即可）。
各 change 的 test-plan.md MUST 附「後端 API 授權覆蓋表」逐端點列出這四類測試的 it 名稱。
後端測試以 cookie 送出的成功路徑請求 MUST 同時帶上該 cookie 所屬使用者的 `X-Expected-User-Id`（由 `hono-pickball/test/helpers/` 的請求 helper 集中處理）。

#### Scenario: auth 停用時使用者資料 API 回 404 且不觸碰 D1

- **GIVEN** env 不含 `ENVIRONMENT` 也不含 `DB`，且未設定 Google
- **WHEN** 分別呼叫 `GET /api/scoreboard/current` 與 `PUT /api/scoreboard/current`（合法 body）
- **THEN** 兩者皆回 404（而非 500）
- **驗收**：`hono-pickball/test/scoreboard-current.test.ts`，it 名稱「auth 停用且無 DB binding 時 GET 與 PUT /api/scoreboard/current 皆回 404」

#### Scenario: 未登入呼叫使用者資料 API 回 401

- **GIVEN** 本機登入啟用
- **WHEN** 不帶 cookie 分別呼叫 `GET` 與 `PUT /api/scoreboard/current`
- **THEN** 兩者皆回 401，body 為 `{ "error": "UNAUTHORIZED" }`
- **驗收**：`hono-pickball/test/scoreboard-current.test.ts`，it 名稱「未登入呼叫 GET 與 PUT /api/scoreboard/current 皆回 401」

#### Scenario: 只能存取本人的資料

- **GIVEN** 使用者 A 已寫入計分板（比分 5:3），使用者 B 已登入
- **WHEN** B 的 cookie 呼叫 `GET /api/scoreboard/current`，再以 `version: 0` 呼叫 `PUT`
- **THEN** B 的 GET 回 `{ data: null, version: 0 }`；B 的 PUT 成功建立 B 自己的資料；之後以 A 的 cookie GET 仍回比分 5:3 與原 version
- **驗收**：`hono-pickball/test/scoreboard-current.test.ts`，it 名稱「B 的 cookie 讀不到 A 的計分板且寫入不影響 A」

#### Scenario: 未經 requireSession 的 handler 讀取 user 為型別錯誤

- **GIVEN** `hono-pickball/test/auth-env-types.test.ts` 內以 `new Hono<AuthAppEnv>()` 宣告、未掛 `requireSession` 的 handler，在讀取 `c.var.user` 的那一行上方標註 `// @ts-expect-error`
- **WHEN** 執行 `pnpm --filter ./hono-pickball typecheck`
- **THEN** exit 0（該行確實是型別錯誤）；同檔另一個以 `SessionAppEnv` 經 `requireSession` 的 handler 讀取 `c.var.user.id` 無型別錯誤
- **驗收**：tasks.md 中該 RED／GREEN 的 typecheck 實跑紀錄（RED 時為「Unused '@ts-expect-error' directive」）

#### Scenario: 非 development 且 Google 設定齊全時使用者資料 API 改由 session 授權

- **GIVEN** env 的 `ENVIRONMENT` 缺值，`GOOGLE_CLIENT_ID` 與 `GOOGLE_CLIENT_SECRET` 皆為非空字串，`DB` 為測試用 D1
- **WHEN** 不帶 cookie 分別呼叫 `GET /api/scoreboard/current` 與 `GET /api/matchmaker/players`
- **THEN** 兩者皆回 401，body 為 `{ "error": "UNAUTHORIZED" }`（閘門放行、由 `requireSession` 拒絕，而非 404）
- **驗收**：`hono-pickball/test/auth-google.test.ts`，it 名稱「非 development 且 Google 設定齊全時使用者資料 API 未登入回 401」
