# Design: auth-backend-test-account

## Context

- **前提為 B1（`backend-d1-foundation`）的 design**：D1 只在 `wrangler.jsonc` 的 `env.local`（worker 名稱維持 `hono-pickball`）；
  `getDb(env)` 是唯一 D1 入口、缺 `DB` 立即拋錯；`src/db/schema.ts` 已有 better-auth 1.6 的四張核心表；
  測試夾具以 `TEST_MIGRATIONS` 在每個測試檔前套用 migration；`cf-typegen` 讀 `.dev.vars.example`。
  B1 合併後若上述任何一點與 B1 design 不同（以 B1 design.md 的 Open Questions 為準），本 change §1 MUST 先對齊再開工。
- 已安裝：`better-auth@1.6.15`、`@better-auth/drizzle-adapter@1.6.15`、`drizzle-orm@0.45.2`；Node `22.22.1`
  （本機實測 `process.features.typescript === "strip"`、`process.loadEnvFile` 存在）。
- 前端 `/api/[[...route]]` proxy 原樣轉發 URL 與 headers（`api-connectivity` spec）；瀏覽器視角 same-origin。
- 既有 E2E 有多支監控 console error（`player-roster.spec.ts`、`player-stats.spec.ts`、`quiz.spec.ts`、`scoreboard.spec.ts`）。
- runbook 已定案：D4（G1 前 `/api/auth/*` 與使用者資料 API 在非 development 回 404）、D5（`ENVIRONMENT === "development"` 才啟用、
  `disableSignUp: true`、seed 只寫 local、不做 seed API）。

## Goals

- 本機以測試帳號登入取得 session cookie；`GET /api/me` 回本人；錯誤密碼 401；註冊被拒。
- `ENVIRONMENT` 缺值或非 development 時 email 登入不可用——兩種情況都有測試。
- 正式部署設定（無 `ENVIRONMENT`、無 `DB`）下所有新路由都不觸碰 D1、不回 5xx。
- 提供 Wave 2 共用的 `requireSession`，以及 B3 用來判斷登入入口的 `GET /api/session`。
- cookie 經前端 proxy 穿透有 E2E 證據。

## Non-Goals

- Google 登入（只預留設定結構）、遠端任何資源、登入頁與 navbar（B3）、使用者資料表（B5～B8）。

## Decisions

### Decision 1：auth 實例**每請求**建立（`createAuth(env)`），而非模組層 `env`

**Choice**：`src/auth/create-auth.ts` 匯出 `createAuth(env)`；路由在 gate 通過後呼叫一次並以 `c.set("auth", …)` 存於該請求的
Hono context，同請求的 middleware 與 handler 共用。

**Rationale**：
- Context7（`/better-auth/better-auth/v1.6.23`，`concepts/database.mdx`「Configure Better Auth for Cloudflare D1」）的官方寫法是
  模組層 `import { env } from "cloudflare:workers"` 後 `betterAuth({ database: env.DB })`。**本 change 刻意不採用**，理由：
  1. 正式部署設定沒有 `DB`（B1 Decision 1）；模組層建立會在**載入期**就碰到 `undefined`，連 `/api/health` 都可能被拖垮。
  2. runbook 要求「`ENVIRONMENT` 缺值」與「非 development」**兩種情況都要有測試**；`exports.default` 綁定的 env 無法逐測試變更，
     注入式工廠才能以 `app.request(path, init, env)` 覆寫 env 測試 gating（見 Decision 6）。
  3. `baseURL`／`secret` 來自 env（Decision 3），每請求讀取才與 `.dev.vars` 的實際值一致。
- 代價：每請求多一次 `betterAuth()` 初始化。只在本機啟用且請求量極低；R1（本機與遠端差異）在 G1 重新評估是否改為 isolate 層快取。

**Alternatives considered**：
- 模組層單例（官方範例）：上述三點皆不成立。不選。
- isolate 層 lazy 單例（第一次請求時以該請求 env 建立並快取）：測試間 env 不同會互相污染；G1 視需要再引入。不選。

### Decision 2：gate 集中於 `isLocalAuthEnabled`，停用時 404 且不建立 auth

**Choice**：`src/auth/local-auth.ts` 的 `isLocalAuthEnabled(env) = env.ENVIRONMENT === "development"`。`/api/auth/*` 與 `/api/me`
前掛一個 gate middleware：停用即 `c.notFound()`（與既有未定義路由的 404 相同），不呼叫 `createAuth`。`createAuth` 的
`emailAndPassword.enabled` 也取自同一函式（第二道防線：即使未來有人把 gate 拿掉，email 登入仍關閉）。

**Rationale**：runbook D4／D5 原文。「只有字面值 development」用嚴格相等，`"Development"`、空字串都視為停用，列為測試案例。

**Alternatives considered**：
- 只靠 `emailAndPassword.enabled=false`、路由照常掛載：正式部署會因缺 `DB` 在 `createAuth` 拋錯變 500，且 `/api/auth/*` 對外暴露。不選。
- 以 `ENVIRONMENT !== "production"` 判斷：缺值時預設開啟，違反 D5 反向設計。不選。

### Decision 3：`baseURL`／`trustedOrigins` 取自 `BETTER_AUTH_URL`（與 runbook 的差異）

**Choice**：`baseURL: env.BETTER_AUTH_URL`、`trustedOrigins: [env.BETTER_AUTH_URL]`，`.dev.vars.example` 示意值為 `http://localhost:3005`。
缺 `BETTER_AUTH_URL` 或 `BETTER_AUTH_SECRET` 時 `createAuth` 拋錯（訊息含變數名）。

**Rationale**：runbook B2 寫「`trustedOrigins` 本批只列本機 `http://localhost:3005`」。本 change 的**實際值**仍只有這一個，
但改由 `.dev.vars` 提供而非寫死在程式碼——S1 第 3 步要在 `pnpm --filter ./nextjs-pickball preview`（OpenNext／workerd）下重驗登入，
preview 的前端 origin 埠號不一定是 3005（Open Questions 2）；寫死會逼 S1 為了換埠號改程式碼。G1 也只需設定遠端變數。
`baseURL` 為**前端 origin**：service binding 不改寫 host（`api-connectivity`「`/api/*` 經 service binding 原樣轉發」），
better-auth 看到的請求 URL 就是前端 URL。

Context7（同上，`reference/security.mdx`「Trusted Proxy Headers」）建議多網域時省略 `baseURL` 改由 proxy headers 推導；
本專案單一 origin 且經 service binding，明確指定較可預期。

**Alternatives considered**：寫死 `http://localhost:3005`（runbook 原文）：S1 preview 埠號不同時需改碼。不選，差異已記錄供 coordinator 確認。

### Decision 4：cookie 採 better-auth 預設，不設 `useSecureCookies`

**Choice**：不設定 `advanced.useSecureCookies`、`cookiePrefix`、`defaultCookieAttributes`。

**Rationale**：Context7（`/better-auth/better-auth`，`packages/better-auth/src/cookies/index.ts` 的 `createCookieGetter`）：
`Secure` 的決定順序為「明確 `useSecureCookies` → 動態 protocol → 靜態 `baseURL` 是否 `https://` → `isProduction`」；
預設屬性為 `HttpOnly`、`SameSite=Lax`、`Path=/`，名稱 `better-auth.session_token`，`Secure` 時加 `__Secure-` 前綴。
本機 `baseURL` 為 `http://` → 不帶 `Secure`、無前綴，與 `api-connectivity` 的 cookie-check 契約（不得設 `Secure`）一致；
G1 換成 `https://` 正式網址時會自動變成 `__Secure-better-auth.session_token` 並帶 `Secure`，無須改碼。
**因此 B3 前端 SHALL NOT 讀取或依賴 cookie 名稱**（HttpOnly 本來也讀不到），一律以 `/api/session` 判斷。

### Decision 5：`/api/session` 永遠 200；`/api/me` 走 `requireSession`

**Choice**：
- `GET /api/session`：停用 → `{ authEnabled: false, user: null }`（不建 auth、不碰 D1）；啟用 → `auth.api.getSession({ headers })`
  的結果投影為 `{ id, email, name }` 或 `null`；查詢拋錯 → `console.error` 並回 `user: null`。
- `GET /api/me`：gate → `requireSession`（無 session 回 `401 { error: "UNAUTHORIZED" }`）→ 回 `{ user: { id, email, name } }`。

**Rationale**：
- runbook B3 建議「由後端 `GET /api/me` 或 `/api/health` 回報環境」。兩者都不適合直接當前端每頁的探針：
  `/api/me` 對訪客必回 401（runbook 要求的契約），停用時回 404——**瀏覽器會把 4xx fetch 記為 console error**，
  既有四支 E2E 監控 console，訪客路徑會迴歸（runbook 已定案「既有 E2E 零迴歸」）；`/api/health` 是部署冒煙契約
  （`api-connectivity` 規定四個欄位），混入 auth 狀態會讓 `lib/health.ts` 的形狀驗證與 auth 耦合。
  因此另立一個語意單純的狀態探針，`/api/me` 維持 runbook 的 401 契約，作為 Wave 2 使用者資料 API 的樣板。
- 查詢失敗降級為 `user: null`：最常見的情況是開發者還沒跑 `db:migrate:local` 就帶著舊 cookie 開頁，此時訪客 UI 必須照常可用。
  但降級**只在探針**——`requireSession` 遇到例外照常 500，授權路徑不得吞錯。
- Context7（`integrations/hono.mdx`）的官方 Hono middleware 是對 `"*"` 全域取 session；本 change 改為只在需要的路由取，
  避免 `/api/health`、`/api/cookie-check` 與停用環境被 auth 拖累。

**Alternatives considered**：
- 前端呼叫 better-auth 內建 `GET /api/auth/get-session`：停用時被 gate 回 404，同樣觸發 console error。不選。
- `/api/health` 加 `authEnabled` 欄位：見上。不選。

### Decision 6：測試 env 的注入方式

**Choice**：`vitest.config.ts` 的 `miniflare.bindings` 注入 `ENVIRONMENT: "development"`、`BETTER_AUTH_SECRET: "test-only-secret-…"`、
`BETTER_AUTH_URL: "http://localhost:3005"`（與 B1 的 `TEST_MIGRATIONS` 並列）。啟用情境沿用 `exports.default.fetch()`；
停用／缺值／替身 DB 情境以 `import app from "../src/index"` 後 `app.request(url, init, { ...env, <覆寫> })`。
所有 POST 到 `/api/auth/*` 的測試請求帶 `Origin: http://localhost:3005`。

**Rationale**：`exports.default` 的 env 由 pool 固定，無法逐測試改變；Hono 的 `app.request` 第三參數就是 env，是最小的注入點。
測試用 secret 是固定的假字串，不是密碼，可以進版控。`.dev.vars` 由開發者自管，若 pool 也載入它，`miniflare.bindings` 必須蓋過它——
§1 實測，若無法蓋過則改為「需要固定值的測試一律走 `app.request`」並記錄（指令驗收 C6 會揭露差異）。

### Decision 7：seed 由純函式產生 SQL，Node 腳本只負責 I/O

**Choice**：
- `src/db/seed/test-account.ts`：`buildTestAccountSeedSql({ email, password, name, now })` → `Promise<string>`。
  內部 `crypto.randomUUID()` 產生 `userId`／`accountId`，`hashPassword`（`better-auth/crypto`）產生雜湊，每行一個以 `;` 結尾的敘述：
  `DELETE FROM user WHERE email = …;`、`INSERT INTO user …;`、`INSERT INTO account …;`。只 import 套件（無相對 import、無 TS 專屬語法、
  型別 import 一律 `import type`），使 Node type stripping 可直接載入。
- `scripts/seed-test-account.ts`：`process.loadEnvFile(".dev.vars")` → 檢查三個變數 → 寫 `.wrangler/tmp/seed-test-account.sql` →
  `execFileSync("wrangler", ["d1","execute","DB","--local","--env","local","--file", path])`（經 `pnpm exec`）→ 刪檔。

**Rationale**：
- `hashPassword` 匯出位置：Context7 指出密碼存在 `account` 表、`providerId = "credential"`（`authentication/email-password.mdx`）；
  本機套件 `better-auth/package.json` 的 `exports` 含 `./crypto`，`dist/crypto/index.d.mts` 匯出 `hashPassword`／`verifyPassword`。
  用同一個函式雜湊，登入時的 `verifyPassword` 必然相容。
- 純函式放 `src/**` 才能在 workerd 內以「seed 後真的能登入」做端對端測試；它不被 `src/index.ts` 匯入，不會被打包進 worker。
- Node 22.22.1 預設 type stripping（本機 `process.features.typescript === "strip"`），不需新增 `tsx`。
- runbook D5 原文：只以 `wrangler d1 execute --local` 寫入、帳密放 `.dev.vars`、不做 seed API。

**Alternatives considered**：
- 在 seed 腳本裡呼叫 better-auth 的 `signUpEmail` API：需要暫時開啟註冊，違反 `disableSignUp: true`。不選。
- `.mjs` 腳本＋`.d.mts` 型別檔：多一份型別宣告要維護。Node type stripping 不可用時才退回此案（§1 已實測可用）。

### Decision 8：E2E 驗證 proxy 穿透，helper 供 B3 重用

**Choice**：`nextjs-pickball/tests/e2e/helpers/test-account.ts` 提供 `readTestAccount()`（解析 `../hono-pickball/.dev.vars`，缺值回 `null`）
與 `ensureTestAccountSeeded()`（執行 `db:migrate:local` 與 `db:seed:local`）。`auth-proxy.spec.ts` 只在 chromium 執行
（比照 `api-health.spec.ts`：通路與瀏覽器無關），`beforeAll` 呼叫 `ensureTestAccountSeeded()`；缺帳密則 `test.skip` 並寫明原因。

**Rationale**：runbook B2 驗收要求 cookie 經 proxy 穿透。只用 `request` fixture（不開頁面），不碰任何 UI，與 B3 的登入 UI E2E 分工清楚；
helper 讓 B3 的 Playwright `globalSetup`（runbook D6）直接重用，不寫第二份 `.dev.vars` 解析。

## Risks / Trade-offs

- [Risk] `wrangler d1 execute --local` 在 `wrangler dev` 執行中寫入同一份本機 sqlite，dev 端讀不到或鎖死
  → Mitigation：§1 實測（啟動中的 dev 能否立刻以新 seed 的帳號登入）；不行則 helper 改為「seed 後提示重啟」並把 E2E 的 seed 移到
  `webServer` 啟動前，記入 Open Questions 交 B3 處理。
- [Risk] vitest pool 載入開發者的 `.dev.vars` 並蓋過 `miniflare.bindings` → Mitigation：Decision 6 的退路＋指令驗收 C6。
- [Risk] scrypt 雜湊在 workerd 測試中耗時，測試逾時 → Mitigation：每個測試檔只 seed 必要的帳號；若逾時，調整 vitest `testTimeout`（設定層）並記錄。
- [Risk] better-auth 實際錯誤碼與 Context7 原始碼不同（例如 sign-up 停用回 403 而非 400）→ Mitigation：§1 先以一條探索性請求確認，
  若不同，spec 的狀態碼以實測為準修正 delta spec（經 Stage 1 Reviewer 同意）並記入 Open Questions；SHALL NOT 放寬成「任意 4xx」。
- [Risk] B1 的四張表欄位與 better-auth adapter 實際需求不符 → Mitigation：以**新增** migration 修正（`db:generate --name …`），不改寫 0000。
- [Trade-off] 新增 `/api/session` 一個端點，正式部署若被 push 會多出一個回 `{ authEnabled: false, user: null }` 的公開端點——
  不洩漏任何資料、不觸碰 D1，可接受。

## Migration Plan

- 合併後開發者：在 `.dev.vars` 補齊 `.dev.vars.example` 列出的變數 → `db:migrate:local` → `db:seed:local`。
- 正式部署設定未變；**不 push**（D4）。回滾：revert 合併 commit，本機 D1 可刪除重建。

## Open Questions

1. sign-up 停用時的實際狀態碼（Context7 原始碼為 `BAD_REQUEST`）——§1 實測確認。
2. S1 的 `preview` 模式下前端 origin 與埠號（OpenNext preview 預設可能與後端 `wrangler dev` 的 8787 衝突）；本 change 以
   `BETTER_AUTH_URL` 變數化因應，實際值由 S1 決定，**不屬本 change 驗收**。
3. `wrangler d1 execute --local` 與執行中的 `wrangler dev` 是否共用且即時可見同一份資料（Risks 第 1 條）。

### apply §1 查證紀錄（2026-10-21）

- **1.1 baseline**：後端為 6 檔／**25** 測試（B1 apply 時新增 3.5、4.4 兩條覆蓋測試），非 tasks 1.1 所寫的 22。
  因此 tasks 10.4 的後端預期改為 12 檔／**50** 測試（25＋本 change 25）。
- **1.2 對齊 B1：一致，無差異**。`env.local` 宣告 `DB`（worker 名稱維持 `hono-pickball`）；`getDb(env: Pick<CloudflareBindings, "DB">)`
  缺 `DB` 拋錯；`CloudflareBindings` 的 `DB` 為可選（`DB?: D1Database`）、`ENVIRONMENT` 為必填 `string`（B1 Open Question 4，
  只能以 `=== "development"` 判斷）；四張表欄位與 better-auth 1.6 一致（1.5 實測 adapter 可直接註冊、登入）；
  `TEST_MIGRATIONS` 經 `miniflare.bindings` 注入、`test/apply-migrations.ts` 套用。主 spec `dev-workflow`「後端測試在 workerd runtime 中執行」
  與本 change delta 的差異**只有**本 change 新增的「app.request 例外」段落與 Scenario，delta 已以主 spec 為底，無須重套。
- **1.3 本機套件：與 design 相同**。`better-auth@1.6.15`、`@better-auth/drizzle-adapter@1.6.15`；`better-auth/package.json` exports 含 `./crypto`，
  `dist/crypto/index.d.mts` 匯出 `hashPassword`／`verifyPassword`；adapter `index.d.mts` 匯出 `drizzleAdapter`、`transaction?: boolean`；
  Node `v22.22.1`、`process.features.typescript === "strip"`、`process.loadEnvFile` 為 function。
- **1.4 Context7（`/better-auth/better-auth/v1.6.23`）：與 Decision 1～5 無衝突**。
  ① `integrations/hono.mdx`：`app.on(["POST","GET"], "/api/auth/*", (c) => auth.handler(c.req.raw))`、`auth.api.getSession({ headers: c.req.raw.headers })`，
  與 Decision 1／5 一致（官方 middleware 掛 `"*"`，本 change 刻意只掛在需要的路由，已記於 Decision 5）。
  ② `api/routes/sign-up.ts`：`!enabled || disableSignUp` → `APIError("BAD_REQUEST", EMAIL_PASSWORD_SIGN_UP_DISABLED)`。
  ③ `cookies/index.ts` `createCookieGetter`：`Secure` 判定順序與 Decision 4 所述相同；預設 `sameSite: "lax"`、`path: "/"`、`httpOnly: true`。
  ④ `auth/base.ts`：靜態 `baseURL` 時不從請求推導；`trustedOrigins` 每請求以 `getTrustedOrigins(options, request)` 解析。
  ⑤ `concepts/database.mdx`：官方 D1 範例為模組層 `env.DB`（Decision 1 已說明不採用）；adapter `transaction` 預設 `false`，本 change 明確設 `false`。
  另：官方 installation 以 `better-auth/adapters/drizzle` 匯入 adapter；本 change 依 proposal 使用已安裝的 `@better-auth/drizzle-adapter`，兩者同一實作。
- **1.5 實測（一次性 probe 測試檔與暫時路由，皆未 commit、已還原）**：
  - **Open Question 1 結論：sign-up 停用回 `400`**，body `{"message":"Email and password sign up is not enabled","code":"EMAIL_PASSWORD_SIGN_UP_DISABLED"}`。
    delta spec 無須修正。
  - 附帶觀察：錯誤密碼與不存在帳號皆回 `401` `{"message":"Invalid email or password","code":"INVALID_EMAIL_OR_PASSWORD"}`（body 相同，
    「帳號不存在與密碼錯誤回應相同」預期為 regression guard）；成功登入的 `Set-Cookie` 為
    `better-auth.session_token=…; Max-Age=604800; Path=/; HttpOnly; SameSite=Lax`（無 `Secure`）；
    `emailAndPassword.enabled=false` 時 sign-in 回 `400 EMAIL_PASSWORD_DISABLED`（5.3 前兩條 it 的紅燈預期即此值）。
  - ⚠️ **未帶 `Origin` 的 sign-in POST 也回 200**（請求不帶 cookie 時 better-auth 不做 origin 檢查）。spec「請求 MUST 帶有屬於 trustedOrigins 的 Origin」
    是對呼叫端的要求而非伺服端的強制行為；本 change 測試一律帶 `Origin`，不新增「缺 Origin 被拒」的斷言（那不是 better-auth 1.6 的行為）。
  - **Open Question 3 結論：立即可見**。以 `wrangler dev --env local --port 8790` 起後端（暫時加一條讀 `user` 計數的路由），
    `wrangler d1 execute DB --local --env local --command "INSERT …"` 後同一個執行中的 dev 立即讀到 1 筆，`DELETE` 後立即讀回 0 筆。
    E2E helper 可在 `webServer` 已啟動後再 seed，不需重啟後端。dev 停止後 `lsof -i :8790` 無輸出。
