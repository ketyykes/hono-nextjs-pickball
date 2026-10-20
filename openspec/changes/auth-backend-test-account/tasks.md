# Tasks: auth-backend-test-account

> **TDD 三步**（root `CLAUDE.md`）：RED（先寫失敗測試，以 `pnpm --filter ./hono-pickball test --run test/<檔>.test.ts`
> 在 shell 實際看到紅燈並貼出輸出）→ GREEN（最小實作至綠）→ REFACTOR（無壞味道註記 skipped）。**`--run` 前不可加 `--`**。
>
> **紅燈要是真的**：加入即綠者 MUST 誠實標註 regression guard，**SHALL NOT 用「改斷言看紅再改回」偽造紅燈**。
> 一個 RED task 可一次寫入多個 it（皆須在 GREEN 前實際看到紅），只要紅燈原因都是「功能尚不存在」。
>
> **標註**：`設定層`（`vitest.config.ts`、`package.json`、`.dev.vars.example`、`worker-configuration.d.ts`、文件；不需紅燈）；
> `驗收（指令）`（test-plan C1～C6）；`E2E`（`tests/**` 屬前端 TDD 例外層的測試基礎建設，但 E2E 本身仍先紅後綠）。
>
> **前提**：B1（`backend-d1-foundation`）已合併回 `main`。**不得新增或升級任何 npm 相依**；**禁止任何遠端 CF 操作**。
> 測試帳密與 secret **不得**寫進任何會被 commit 的檔案或 commit 訊息（tasks.md 紀錄以 `<TEST_ACCOUNT_EMAIL>` 代稱）。
> it 名稱 MUST 與 delta spec「驗收」錨點逐字一致。

## 1. 對齊 main＋Context7 查證（不寫產品程式碼）

- [x] 1.1 確認分支 `change/auth-backend-test-account`、工作樹乾淨；`pnpm install` 後 lockfile 零變動；`db:migrate:local` 成功；`pnpm test` baseline（後端應為 B1 後的 6 檔／22 測試），回填 environment.md 並 commit
- [x] 1.2 對齊 B1 實際落地：讀 `hono-pickball/{wrangler.jsonc, vitest.config.ts, src/db/client.ts, src/db/schema.ts, test/apply-migrations.ts, test/env.d.ts, CLAUDE.md}` 與 B1 archive 的 design.md Open Questions，確認 `env.local`、`getDb` 簽章、四張表欄位、`TEST_MIGRATIONS` 夾具與本 design Context 一致；差異記入本 design.md Open Questions；另比對主 spec `openspec/specs/dev-workflow/spec.md` 的「後端測試在 workerd runtime 中執行」與本 change delta 中同名 MODIFIED Requirement 的 B1 部分，若不同，以主 spec 為底重新套用本 change 新增的「app.request 例外」段落與 Scenario 並 commit
- [x] 1.3 本機套件查證：`better-auth` 為 1.6.x、`better-auth/crypto` 匯出 `hashPassword`／`verifyPassword`；`@better-auth/drizzle-adapter` 匯出 `drizzleAdapter` 且有 `transaction` 選項；`node -e "console.log(process.features.typescript)"` 為 `strip`
- [x] 1.4 Context7 查證（MUST）：`/better-auth/better-auth/v1.6.23`（或與已安裝版本最接近的版本 ID）查 ① Hono 整合（`app.on(["GET","POST"], "/api/auth/*")`、`auth.api.getSession({ headers })`）② `emailAndPassword.disableSignUp` 與 sign-up 停用時的錯誤 ③ cookie 預設屬性與 `useSecureCookies` 判定 ④ `trustedOrigins`／`baseURL` ⑤ D1／Cloudflare Workers 的建立方式；與 design Decision 1～5 的差異記入 Open Questions（附 library ID）
- [x] 1.5 實測 design Open Questions 1、3：以一次性腳本（不 commit）確認 sign-up 停用的實際狀態碼；確認 `wrangler d1 execute --local --env local` 寫入後，**執行中**的 `wrangler dev --env local` 能否立即讀到（以 `--port 8790` 起一個後端，查完立刻停止並確認釋放）。結果寫入 Open Questions；狀態碼若非 400，依 design Risks 第 4 條修正 delta spec
  - 結果：§1 全部紀錄見 design.md「apply §1 查證紀錄」。baseline 後端實為 6 檔／25（非 22）；sign-up 停用實測 400；d1 execute --local 對執行中 dev 立即可見；delta spec 無須修正

## 2. 本機登入啟用條件

Depends on: §1

- [x] 2.1 RED: 新增 `hono-pickball/test/auth-config.test.ts`，寫入 it「isLocalAuthEnabled 只在 ENVIRONMENT 恰為 development 時為真」。確認紅燈（模組不存在）並貼出輸出
  - 紅燈：`Error: Cannot find module '../src/auth/local-auth'`，Test Files 1 failed（可用 `git show 1499425:hono-pickball/test/auth-config.test.ts` 與 `git show 1499425^:hono-pickball/src/auth/local-auth.ts` 複驗：後者不存在）
- [x] 2.2 GREEN: 新增 `hono-pickball/src/auth/local-auth.ts` 的 `isLocalAuthEnabled(env)`（嚴格相等 `"development"`）

## 3. createAuth 與測試 env 注入

Depends on: §2

- [x] 3.1 設定層：`.dev.vars.example` 補 `BETTER_AUTH_SECRET`、`BETTER_AUTH_URL=http://localhost:3005`、`TEST_ACCOUNT_EMAIL`、`TEST_ACCOUNT_PASSWORD`、`TEST_ACCOUNT_NAME`（示意值＋用途註解）；跑 `pnpm --filter ./hono-pickball cf-typegen` 更新 `worker-configuration.d.ts`；`vitest.config.ts` 的 `miniflare.bindings` 加入 `ENVIRONMENT: "development"`、`BETTER_AUTH_SECRET: "test-only-secret-not-for-production-0000"`、`BETTER_AUTH_URL: "http://localhost:3005"`（design Decision 6）
  - 實測：pool 會載入 `.dev.vars`（輸出 "Using secrets defined in .dev.vars"），但 `miniflare.bindings` 蓋過它：一次性探針確認 `env.BETTER_AUTH_SECRET`、`env.BETTER_AUTH_URL` 為測試假值（探針未 commit）；既有套件 26 測試全綠
- [x] 3.2 RED: 於 `auth-config.test.ts` 加入五個 it：「缺少 BETTER_AUTH_SECRET 時 createAuth 拋錯」「缺少 BETTER_AUTH_URL 時 createAuth 拋錯」「baseURL 與 trustedOrigins 皆取自 BETTER_AUTH_URL」「emailAndPassword 只在 development 啟用且一律禁止註冊」「Google provider 只在 client id 與 secret 皆存在時註冊」。確認紅燈
  - 紅燈：`Error: Cannot find module '../src/auth/create-auth' imported from .../test/auth-config.test.ts`，`Test Files 1 failed`、`no tests`（模組不存在）
- [x] 3.3 GREEN: 新增 `hono-pickball/src/auth/create-auth.ts` 的 `createAuth(env)`（design Decision 1、3、4）：`getDb(env)`＋`drizzleAdapter(db, { provider: "sqlite", schema, transaction: false })`、`baseURL`／`trustedOrigins`／`secret`、缺值拋錯、`emailAndPassword: { enabled: isLocalAuthEnabled(env), disableSignUp: true }`、條件式 `socialProviders.google`
  - 綠燈：auth-config.test.ts 6 passed；後端全套 31 passed；typecheck exit 0
- [x] 3.4 REFACTOR: 確認 `createAuth` 不在模組層讀 env、沒有預設 secret 的 fallback；無壞味道則註記 skipped
  - skipped（無壞味道）：createAuth 不在模組層讀 env，無預設 secret fallback；mutation 發現 Google 條件只查 secret 的變異存活，已於 Google it 補「只有 secret」組合後轉紅
  - Stage 2 mutation 補洞：M11（secret 取自 URL）、M16／M16b（baseURL／trustedOrigins 寫死）、M19（Google clientId／clientSecret 對調）；測試改用異於 binding 的 URL、斷言 `options.secret`、Google 改 `toMatchObject`，重跑四個變異皆轉紅
  - 限制：`transaction: true`、`provider: "pg"`（M12／M13）在單元層測不到，交由 §5 登入整合測試在真 D1 上覆蓋

## 4. 測試帳號 seed SQL（純函式）

Depends on: §3

- [ ] 4.1 RED: 新增 `hono-pickball/test/seed-test-account.test.ts`，寫入 it「seed SQL 不含明文密碼且正確跳脫單引號」（直接以 `env.DB` 套用 SQL 並讀回 `user.name`）。確認紅燈（模組不存在）
- [ ] 4.2 GREEN: 新增 `hono-pickball/src/db/seed/test-account.ts` 的 `buildTestAccountSeedSql({ email, password, name, now })`（design Decision 7：每行一個 `;` 結尾敘述、先 DELETE 同 email、`hashPassword` 雜湊、單引號跳脫、只 import 套件且型別用 `import type`）

## 5. /api/auth/* 掛載、登入、註冊與 gate

Depends on: §4

- [ ] 5.1 RED: 於 `seed-test-account.test.ts` 加入 it「seed 產生的測試帳號可以登入」「重複 seed 同一 email 只留下一筆且以最新密碼為準」；新增 `hono-pickball/test/auth-sign-in.test.ts`，寫入 it「帳密正確時回 200 並設定 HttpOnly、SameSite=Lax 的 session cookie」「密碼錯誤時回 401 且不發 session cookie」「帳號不存在與密碼錯誤回應相同的 401」「註冊端點回 400 且不建立使用者」。確認全部紅燈（路由不存在 → 404）並貼出輸出
- [ ] 5.2 GREEN: `hono-pickball/src/index.ts` 以 `app.on(["GET", "POST"], "/api/auth/*", …)` 掛 better-auth handler（每請求 `createAuth`，存於 `c.var.auth`）。Hono 的 `Variables` 型別一併宣告
- [ ] 5.3 RED: 新增 `hono-pickball/test/auth-gating.test.ts`，寫入 it「ENVIRONMENT 缺值時 sign-in 回 404 且不發 cookie」「ENVIRONMENT 為 production 時 sign-in 回 404 且不發 cookie」「停用且無 DB binding 時 auth 路由與 /api/me 皆回 404」（`app.request` 注入覆寫 env）。確認紅燈並逐條貼出實際 status（預期：前兩者因 `emailAndPassword.enabled=false` 回非 404 的 4xx；第三者的 `/api/auth/get-session` 因 `getDb` 拋錯回 500）
- [ ] 5.4 GREEN: 新增 gate middleware（`isLocalAuthEnabled` 為 false 時 `c.notFound()`，不呼叫 `createAuth`），掛在 `/api/auth/*`；`/api/me` 於 §6 一併掛上
- [ ] 5.5 REFACTOR: 確認 `createAuth` 每請求只建立一次（gate 之後、handler 共用 `c.var.auth`）；無壞味道則註記 skipped

## 6. requireSession 與 GET /api/me

Depends on: §5

- [ ] 6.1 RED: 新增 `hono-pickball/test/auth-me.test.ts`，寫入 it「未登入呼叫 /api/me 回 401」「偽造的 session cookie 呼叫 /api/me 回 401」「登入後 /api/me 回本人的 id、email 與 name」「A 的 cookie 只能取得 A 而非 B 的資料」「登出後原 session cookie 呼叫 /api/me 回 401」。確認紅燈（路由不存在 → 404）
- [ ] 6.2 GREEN: 新增 `hono-pickball/src/auth/require-session.ts` 的 `requireSession`（無 session → 401 `{ error: "UNAUTHORIZED" }`；有則 `c.set("user")`／`c.set("session")`）；`index.ts` 掛 `GET /api/me`（gate → requireSession → 投影 `{ id, email, name }`）
- [ ] 6.3 確認（regression guard 檢查）：重跑 `auth-gating.test.ts`，第三條 it 的 `/api/me` 部分在 gate 掛上後維持 404；若 5.3 時該部分已綠，於此註明其性質
- [ ] 6.4 REFACTOR: 投影 `{ id, email, name }` 若在 §7 也需要，抽成單一具名函式（於 §7 完成後回頭執行亦可，註明）；無壞味道則註記 skipped

## 7. GET /api/session 狀態探針

Depends on: §6

- [ ] 7.1 RED: 新增 `hono-pickball/test/auth-session.test.ts`，寫入 it「停用且無 DB 時回 200 與 authEnabled false」「啟用但未登入時回 200 與 user null」「登入後回 200 與目前使用者的 id、email 與 name」「session 查詢拋錯時仍回 200 與 user null」。確認紅燈（路由不存在 → 404）
- [ ] 7.2 GREEN: `index.ts` 掛 `GET /api/session`（design Decision 5：停用不建 auth；啟用時 `getSession` 投影；例外 `console.error` 後回 `user: null`）。**不**掛 gate
- [ ] 7.3 REFACTOR: 與 6.4 合併檢查投影函式唯一性；確認降級邏輯只存在於本路由、`requireSession` 不吞例外

## 8. seed 腳本與 db:seed:local

Depends on: §7

- [ ] 8.1 設定層：新增 `hono-pickball/scripts/seed-test-account.ts`（design Decision 7：`process.loadEnvFile(".dev.vars")`、檢查三個變數、寫 `.wrangler/tmp/seed-test-account.sql`、`pnpm exec wrangler d1 execute DB --local --env local --file …`、`finally` 刪暫存檔）；`package.json` 新增 `"db:seed:local": "node scripts/seed-test-account.ts"`。腳本本身是 I/O 膠水，邏輯已由 §4／§5 的測試覆蓋，以下列指令驗收
- [ ] 8.2 驗收（指令）C3：`grep` 確認無 `--remote`、有 `--local` 與 `--env local`
- [ ] 8.3 驗收（指令）C5：暫時移除 `.dev.vars` 的 `TEST_ACCOUNT_PASSWORD` → `db:seed:local` exit 非 0 且輸出含該變數名 → 還原
- [ ] 8.4 驗收（指令）C4：`.dev.vars` 齊備 → `db:migrate:local` → `db:seed:local` → `wrangler dev --env local`（預設 8787，先確認無殘留 process）→ curl 登入回 200 → 停止後端並確認 8787 釋放

## 9. E2E：session cookie 經 proxy 穿透

Depends on: §8

- [ ] 9.1 E2E（regression guard）: 新增 `nextjs-pickball/tests/e2e/helpers/test-account.ts`（`readTestAccount()` 解析 `../hono-pickball/.dev.vars`，缺值回 `null`；`ensureTestAccountSeeded()` 依序執行 `pnpm --filter ./hono-pickball db:migrate:local` 與 `db:seed:local`）與 `nextjs-pickball/tests/e2e/specs/auth-proxy.spec.ts`（只跑 chromium；`beforeAll` seed；缺帳密 `test.skip` 並寫明缺哪個變數），寫入 test「經 proxy 登入後 session cookie 落在前端 origin 並可取得 /api/me」「經 proxy 呼叫 /api/session 未登入時回 200 與 user null」。後端行為已由 §5～§7 的 integration 測試以真紅燈驅動，本 E2E 驗證的是既有 proxy 的穿透能力，寫入即綠——**如實標註為 regression guard**，SHALL NOT 以 stash 回退後端程式碼或改斷言製造紅燈。指令：`pnpm --filter ./nextjs-pickball exec playwright test --workers=1 tests/e2e/specs/auth-proxy.spec.ts`（前後清殘留 process）
- [ ] 9.2 確認 `nextjs-pickball` 的 `tsc --noEmit` 與 `pnpm --filter ./nextjs-pickball lint` 對新增的兩個檔案皆無錯誤

## 10. 文件同步與總驗收

Depends on: §9

- [ ] 10.1 設定層（文件）：改寫 `hono-pickball/CLAUDE.md`：① 路由約定補 `/api/auth/*`、`/api/me`、`/api/session` 與停用時的 404／200 行為 ② 依賴注意：better-auth、`@better-auth/drizzle-adapter` 已被匯入，解除複審（`@hono/zod-validator`、`zod`、`date-fns` 仍未使用，複審期限保留給它們）；註明不升級到 1.7 的理由 ③ 測試慣例：gating 測試以 `app.request(path, init, env)` 注入 env 的例外、POST 帶 `Origin`、測試 env 由 `vitest.config.ts` 注入 ④ 本機登入準備步驟（`.dev.vars` → `db:migrate:local` → `db:seed:local`）
- [ ] 10.2 驗收（指令）C6：有／無 `.dev.vars` 各跑一次 `pnpm --filter ./hono-pickball test`，兩次全綠且通過數相同
- [ ] 10.3 驗收（指令）C1、C2：`pnpm --filter ./hono-pickball build` exit 0；`pnpm --filter ./hono-pickball typecheck` 兩段 exit 0
- [ ] 10.4 驗收（指令）：`pnpm -r exec tsc --noEmit` exit 0；`pnpm --filter ./nextjs-pickball lint` 0 errors；`pnpm test` 全綠（後端 12 檔／50 測試＝B1 後 25＋本 change 25（§1.1 實測 baseline 為 25，原寫 22／47）；前端數不減）；`git diff main --stat -- pnpm-lock.yaml '**/package.json'` 只有 `hono-pickball/package.json`
- [ ] 10.5 驗收（指令）：完整 E2E `pnpm --filter ./nextjs-pickball exec playwright test --workers=1`（`.dev.vars` 齊備）——既有 E2E 全數原樣通過，`auth-proxy.spec.ts` 在 chromium 2 passed；結果寫在本 task 後方
- [ ] 10.6 `DO_NOT_TRACK=1 openspec validate auth-backend-test-account --strict` 通過
