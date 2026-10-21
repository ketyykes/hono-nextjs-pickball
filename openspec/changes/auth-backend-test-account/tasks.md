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

- [x] 4.1 RED: 新增 `hono-pickball/test/seed-test-account.test.ts`，寫入 it「seed SQL 不含明文密碼且正確跳脫單引號」（直接以 `env.DB` 套用 SQL 並讀回 `user.name`）。確認紅燈（模組不存在）
  - 紅燈：`Error: Cannot find module '../src/db/seed/test-account' imported from .../test/seed-test-account.test.ts`，`Test Files 1 failed`，no tests（模組不存在，真紅燈）
- [x] 4.2 GREEN: 新增 `hono-pickball/src/db/seed/test-account.ts` 的 `buildTestAccountSeedSql({ email, password, name, now })`（design Decision 7：每行一個 `;` 結尾敘述、先 DELETE 同 email、`hashPassword` 雜湊、單引號跳脫、只 import 套件且型別用 `import type`）
  - 綠燈：`seed-test-account.test.ts` 1 passed；Node type stripping 實測可載入並執行（輸出不含明文）
  - mutation（12 次，另含 1 對照）：拿掉單引號跳脫、寫入明文密碼、user.email／name／account.user_id 寫錯皆轉紅；等價變異維持綠
  - 補強：明文密碼被跳脫後不等於原字串，故斷言加上「不含跳脫後的密碼」才殺得掉『寫入明文』變異
  - 存活（本組 it 無法覆蓋，預定由 §5 登入／重複 seed it 覆蓋）：拿掉 DELETE、provider_id、account.account_id、email_verified、時間戳、DELETE 的 email 未跳脫
  - REFACTOR：skipped（無壞味道）
  - Stage 2 審查更正存活歸屬：`DELETE` 改為刪全部 user 只有 §6「A 的 cookie 只能取得 A 而非 B」（先後 seed A、B）殺得掉；INSERT 少 `;` 在測試路徑（`env.DB.exec` 逐行執行）殺不掉，由 §8 C4（`wrangler d1 execute --file`）把關；`account_id = userId` 與 email 的單引號跳脫無既有 it 覆蓋，§5 以斷言補強（見 §5 子項）。流程備註：4.2 的 feat commit 夾帶 2 行測試補強，理想上應為獨立 `test:` commit

## 5. /api/auth/* 掛載、登入、註冊與 gate

Depends on: §4

- [x] 5.1 RED: 於 `seed-test-account.test.ts` 加入 it「seed 產生的測試帳號可以登入」「重複 seed 同一 email 只留下一筆且以最新密碼為準」；新增 `hono-pickball/test/auth-sign-in.test.ts`，寫入 it「帳密正確時回 200 並設定 HttpOnly、SameSite=Lax 的 session cookie」「密碼錯誤時回 401 且不發 session cookie」「帳號不存在與密碼錯誤回應相同的 401」「註冊端點回 400 且不建立使用者」。確認全部紅燈（路由不存在 → 404）並貼出輸出
  - 紅燈（6 條全紅，皆因 `/api/auth/*` 未掛載回 404）：帳密正確 expected 404 to be 200；密碼錯誤 expected 404 to be 401；帳號不存在與密碼錯誤 expected 404 to be 401（紅燈來自 status 404≠401，非 body 比對）；註冊端點 expected 404 to be 400；seed 後可登入 expected 404 to be 200；重複 seed 在 DB 斷言（user 1 筆、account 1 筆、`account_id === user.id`、`provider_id === "credential"`）通過後，於 p1 登入 expected 404 to be 401。`Tests 6 failed | 1 passed`（1 passed 為既有 it）
  - 無 regression guard：6 條皆為真紅燈
  - §4 審查補強（非 RED，另開 `test:` commit 6fe82bc）：seed 跳脫 it 的 email 改為 `o'neil-seed@example.com`（寫入即綠）；`account_id`／`provider_id` 斷言併入「重複 seed」it（見上，該段在紅燈前即通過，因 seed 實作本就正確，屬補強性質）
- [x] 5.2 GREEN: `hono-pickball/src/index.ts` 以 `app.on(["GET", "POST"], "/api/auth/*", …)` 掛 better-auth handler（每請求 `createAuth`，存於 `c.var.auth`）。Hono 的 `Variables` 型別一併宣告
  - 綠燈：後端 9 檔／38 測試全綠（`Test Files 9 passed, Tests 38 passed`（32＋seed 2＋sign-in 4））；typecheck 兩段 exit 0
  - `/api/health`、`/api/cookie-check` 零改動
- [x] 5.3 RED: 新增 `hono-pickball/test/auth-gating.test.ts`，寫入 it「ENVIRONMENT 缺值時 sign-in 回 404 且不發 cookie」「ENVIRONMENT 為 production 時 sign-in 回 404 且不發 cookie」「停用且無 DB binding 時 auth 路由與 /api/me 皆回 404」（`app.request` 注入覆寫 env）。確認紅燈並逐條貼出實際 status（預期：前兩者因 `emailAndPassword.enabled=false` 回非 404 的 4xx；第三者的 `/api/auth/get-session` 因 `getDb` 拋錯回 500）
  - 紅燈（3 條全紅）：ENVIRONMENT 缺值 expected 400 to be 404（`emailAndPassword.enabled=false` 回 400）；ENVIRONMENT 為 production expected 400 to be 404；停用且無 DB 時 `/api/auth/get-session` expected 500 to be 404（`getDb` 拋錯）。`Tests 3 failed`
  - regression guard 註記：第三條 it 的 `/api/me` 部分在 `/api/me` 尚未存在時即為 404（會是綠的），整條 it 的紅燈僅來自 `/api/auth/get-session` 的 500；`/api/me` 的真實保護待 §6 掛上後由 6.3 確認
- [x] 5.4 GREEN: 新增 gate middleware（`isLocalAuthEnabled` 為 false 時 `c.notFound()`，不呼叫 `createAuth`），掛在 `/api/auth/*`；`/api/me` 於 §6 一併掛上
  - 綠燈：後端 10 檔／41 測試全綠；typecheck 兩段 exit 0；`/api/me` 留待 §6 掛 gate
- [x] 5.5 REFACTOR: 確認 `createAuth` 每請求只建立一次（gate 之後、handler 共用 `c.var.auth`）；無壞味道則註記 skipped
  - skipped：gate 通過後 `createAuth` 於 `/api/auth/*` handler 內只建立一次並 `c.set('auth', …)`，無壞味道；`/api/me` 的 auth 共用留待 §6
  - mutation（14 次，另含 1 對照，三重落地檢查皆通過、每次還原後 `git diff` 乾淨）：gate 拿掉（轉紅：gating 3 條）；gate 只擋 POST（轉紅：無 DB 的 get-session）；gate 放到 `createAuth` 之後（轉紅：無 DB 的 get-session 500）；`transaction: true`（轉紅：註冊端點）；`disableSignUp: false`（轉紅）；`enabled: false`（轉紅：sign-in 200／401 與 seed 登入）；`enabled: true`（轉紅：createAuth 設定 it）；seed 拿掉 DELETE、`provider_id` 改 `'email'`、`password` 寫 NULL、`account_id` 用另一個 uuid、email 未跳脫（DELETE／INSERT）皆轉紅；等價變異 `return next()` 維持綠
  - 存活：`provider: "pg"`（登入與註冊流程皆通過，drizzle adapter 在此用途下行為與 sqlite 無可觀察差異，視為等價，未硬造測試）
  - 狀態碼分支：200（gate 拿掉／enabled false）、400（disableSignUp false／gate 前的 enabled 行為）、401（enabled false 時 sign-in 變 400）、404（gate 拿掉）各至少一個變異轉紅
  - Stage 2 審查補登：`app.on` 只收 POST **存活**——停用時 GET 本來就 404，啟用時沒有測試以 GET 進 better-auth handler；spec 未規範啟用時 GET 的行為，前端改用 `/api/session`（Decision 5），Google callback 屬 G1，**接受存活**。`isLocalAuthEnabled` 改 `!== "production"` 轉紅 4 條。`provider: "pg"` 經審查讀 adapter 原始碼裁定為現行設定下的等價變異（差異只在 `ilike`、`supportsUUIDs`、JSON／陣列欄位，皆未觸發）；日後若加入會做不分大小寫搜尋的 plugin 或 JSON 欄位須重新評估。`src/index.ts` 中「同請求的後續 middleware 與 handler 共用」的註解目前不準確（`c.set` 在最終 handler），由 §6 抽出共用 middleware 時一併修正

## 6. requireSession 與 GET /api/me

Depends on: §5

- [x] 6.1 RED: 新增 `hono-pickball/test/auth-me.test.ts`，寫入 it「未登入呼叫 /api/me 回 401」「偽造的 session cookie 呼叫 /api/me 回 401」「登入後 /api/me 回本人的 id、email 與 name」「A 的 cookie 只能取得 A 而非 B 的資料」「登出後原 session cookie 呼叫 /api/me 回 401」。確認紅燈（路由不存在 → 404）
  - 紅燈（commit a096c4e）：5 failed。前四條 `expected 404 to be 401/200`；「登出後…」在登入後的前置檢查 `expected 404 to be 200` 即失敗（路由不存在），尚未走到 sign-out 之後的 401 斷言
- [x] 6.2 GREEN: 新增 `hono-pickball/src/auth/require-session.ts` 的 `requireSession`（無 session → 401 `{ error: "UNAUTHORIZED" }`；有則 `c.set("user")`／`c.set("session")`）；`index.ts` 掛 `GET /api/me`（gate → requireSession → 投影 `{ id, email, name }`）
  - 實作偏離之處：依 leader 指示，把 gate＋`createAuth`＋`c.set('auth')` 抽成共用 middleware `localAuth`，同掛 `/api/auth/*` 與 `/api/me`；handler 與 `requireSession` 皆讀 `c.var.auth`（每請求只建一次）。`Variables` 補 `user`／`session`（型別取自 `auth.$Infer.Session`，定義於 `require-session.ts` 的 `AuthAppEnv`）。投影一併於此抽成 `src/auth/public-user.ts` 的 `toPublicUser`（見 6.4）。後端 11 檔／46 測試全綠，typecheck 兩段 exit 0（commit 7d12d10）
- [x] 6.3 確認（regression guard 檢查）：重跑 `auth-gating.test.ts`，第三條 it 的 `/api/me` 部分在 gate 掛上後維持 404；若 5.3 時該部分已綠，於此註明其性質
  - 結論：`auth-gating.test.ts` 3/3 綠。5.3 時 `/api/me` 尚未存在，該部分本來就 404，屬 regression guard；gate 掛上後才有保護力——變異「`/api/me` 拿掉 gate」使第三條 it 轉紅（無 DB 時 `c.var.auth` 未設定而 500），證明它此時真正在守
- [x] 6.4 REFACTOR: 投影 `{ id, email, name }` 若在 §7 也需要，抽成單一具名函式（於 §7 完成後回頭執行亦可，註明）；無壞味道則註記 skipped
  - 已在 6.2 GREEN 一併抽出 `toPublicUser`（§7 直接重用，7.3 再確認唯一性），故無獨立 refactor commit；其餘無壞味道，skipped
  - Stage 2 審查（opus）：APPROVED。存活 3 個：`requireSession` 加 try/catch 降級成 401 或 `next()`（M7a／M7b，design Decision 5「授權路徑不得吞錯」無對應 it；M7a 交 §7「session 查詢拋錯時仍回 200 與 user null」同時斷言 `/api/me` 回 500 補強——test-plan 該列明定「同時證明降級只在探針」；M7b 對 `/api/me` 實質等價）、同一請求建立兩次 auth（M12，結構性約束，以 `grep -rn "createAuth(" src` 只命中 `localAuth` 把關）。非阻擋建議（留給 Wave 2）：`localAuth` 移到 `src/auth/` 以便拆檔重用；`AuthAppEnv` 的 `user`／`session` 宣告為非 optional，未掛 middleware 的路由讀取時型別不會報錯

## 7. GET /api/session 狀態探針

Depends on: §6

- [x] 7.1 RED: 新增 `hono-pickball/test/auth-session.test.ts`，寫入 it「停用且無 DB 時回 200 與 authEnabled false」「啟用但未登入時回 200 與 user null」「登入後回 200 與目前使用者的 id、email 與 name」「session 查詢拋錯時仍回 200 與 user null」。確認紅燈（路由不存在 → 404）
  - 紅燈：4 failed／4，四條皆 `expected 404 to be 200`（路由不存在）。第四條 it 另以同一替身 env＋同一個（真實登入取得、簽章正確的）cookie 呼叫 `GET /api/me` 並斷言 500：該斷言在 RED 時 `/api/me` 已存在，預期當下即為 500，屬 regression guard（leader 追加，用以殺掉「`requireSession` 加 try/catch」變異）；整條 it 的紅燈僅來自 `/api/session` 404
- [x] 7.2 GREEN: `index.ts` 掛 `GET /api/session`（design Decision 5：停用不建 auth；啟用時 `getSession` 投影；例外 `console.error` 後回 `user: null`）。**不**掛 gate
  - 綠燈（commit 6e996da）：auth-session 4/4；後端 12 檔／50 測試全綠；typecheck 兩段 exit 0。try/catch 範圍包住 `createAuth(c.env)` 與 `getSession`（啟用分支缺 secret 等建立期例外也降級為 user null，spec 未要求但無害；停用分支不進 try，不建 auth、不碰 D1）。測試以真實登入取得的簽章 cookie 搭配拋錯 DB 替身，確保 better-auth 確實走到 DB 查詢
- [x] 7.3 REFACTOR: 與 6.4 合併檢查投影函式唯一性；確認降級邏輯只存在於本路由、`requireSession` 不吞例外
  - skipped（無壞味道）：`grep -rn "toPublicUser" src` 僅 `/api/me` 與 `/api/session` 兩處呼叫、定義唯一於 `public-user.ts`；`catch` 只存在於 `/api/session`，`requireSession` 無 try/catch（M9 變異使 /api/me 降級 401 時，「session 查詢拋錯」it 的 `/api/me` 500 斷言轉紅）；`createAuth(` 仍僅 `localAuth` 與 `/api/session` 啟用分支各一處
  - mutation（自跑 19 次，詳見回報）：存活 2 個——啟用分支重複建立 createAuth、移除 console.error，皆為結構／日誌約束，行為測試無法觀察
  - Stage 2 補強：原存活變異「移除 console.error」已殺——「session 查詢拋錯」it 以 `vi.spyOn(console, "error")`（try/finally `mockRestore`）斷言有一次呼叫的訊息含「查詢 session 失敗」。注意 better-auth 自己也會 console.error，只斷言 `toHaveBeenCalled` 時該變異仍綠（實測），故改認本路由訊息；變異轉紅，對照組（訊息後半改字）維持綠。另修正 index.ts 註解為「包住 auth 建立與 session 查詢」。僅剩「重複 createAuth」存活（結構約束）

## 8. seed 腳本與 db:seed:local

Depends on: §7

- [x] 8.1 設定層：新增 `hono-pickball/scripts/seed-test-account.ts`（design Decision 7：`process.loadEnvFile(".dev.vars")`、檢查三個變數、寫 `.wrangler/tmp/seed-test-account.sql`、`pnpm exec wrangler d1 execute DB --local --env local --file …`、`finally` 刪暫存檔）；`package.json` 新增 `"db:seed:local": "node scripts/seed-test-account.ts"`。腳本本身是 I/O 膠水，邏輯已由 §4／§5 的測試覆蓋，以下列指令驗收
  - 完成（commit febd390）：`scripts/seed-test-account.ts` 以 `import.meta.dirname` 推導路徑，缺 `.dev.vars` 或缺變數即 exit 1；`finally` 刪暫存檔；`pnpm typecheck` 兩段 exit 0（scripts/ 不在 tsconfig include，由 Node 實跑驗證）
  - Stage 2 修正：loadEnvFile → parseEnv（與 design Decision 7 字面不同，理由：loadEnvFile 不覆寫 shell 已 export 的變數，會 seed 錯帳號並使缺變數檢查失效，偏離 spec「從 .dev.vars 讀取」；parseEnv 只回傳物件、不寫入 process.env，BETTER_AUTH_SECRET 也不會注入 wrangler 子行程）；暫存檔改 mode 0o600；wrangler 失敗時 console.error 後設 exitCode=1
- [x] 8.2 驗收（指令）C3：`grep` 確認無 `--remote`、有 `--local` 與 `--env local`
  - C3 實測：`grep -n -- "--remote" scripts/seed-test-account.ts` 無輸出（rc=1）；`grep -n -- "--local"` 命中第 49 行，同一呼叫含 `"--env", "local"`
- [x] 8.3 驗收（指令）C5：暫時移除 `.dev.vars` 的 `TEST_ACCOUNT_PASSWORD` → `db:seed:local` exit 非 0 且輸出含該變數名 → 還原
  - C5 實測：移除 `TEST_ACCOUNT_PASSWORD` 後 `db:seed:local` exit 1，輸出「缺少環境變數 TEST_ACCOUNT_PASSWORD」，輸出無 wrangler 字樣（未呼叫）；已還原且 `cmp` 與備份逐位元組相同
  - Stage 2 修正後重跑：shell 先 export `TEST_ACCOUNT_PASSWORD=from-shell-fake`、`.dev.vars` 缺該變數 → exit 1、輸出含 `TEST_ACCOUNT_PASSWORD`、未呼叫 wrangler；`cmp` 仍相同
  - 變異（手動）：拿掉檢查迴圈後輸出變為 `buildTestAccountSeedSql` 的 TypeError 堆疊、不含變數名，證明 C5 驗收有鑑別力；已還原
- [x] 8.4 驗收（指令）C4：`.dev.vars` 齊備 → `db:migrate:local` → `db:seed:local` → `wrangler dev --env local`（預設 8787，先確認無殘留 process）→ curl 登入回 200 → 停止後端並確認 8787 釋放
  - C4 實測：`.dev.vars` 齊備 → `db:migrate:local` exit 0 → `db:seed:local` exit 0（暫存檔已刪）→ `pnpm dev` 啟動後以 `<TEST_ACCOUNT_EMAIL>` 登入 `POST /api/auth/sign-in/email`（Origin: http://localhost:3005）回 200；停止後 :3005／:8787／:8790 無殘留
  - Stage 2 修正後重跑：seed exit 0，`test ! -e .wrangler/tmp/seed-test-account.sql` 成立（暫存檔已刪）；登入 200；C3 重跑 `--remote` 無輸出、`--local` 與 `--env local` 同一呼叫；停止後 8787 釋放、殘留 0

## 9. E2E：session cookie 經 proxy 穿透

Depends on: §8

- [x] 9.1 E2E（regression guard）: 新增 `nextjs-pickball/tests/e2e/helpers/test-account.ts`（`readTestAccount()` 解析 `../hono-pickball/.dev.vars`，缺值回 `null`；`ensureTestAccountSeeded()` 依序執行 `pnpm --filter ./hono-pickball db:migrate:local` 與 `db:seed:local`）與 `nextjs-pickball/tests/e2e/specs/auth-proxy.spec.ts`（只跑 chromium；`beforeAll` seed；缺帳密 `test.skip` 並寫明缺哪個變數），寫入 test「經 proxy 登入後 session cookie 落在前端 origin 並可取得 /api/me」「經 proxy 呼叫 /api/session 未登入時回 200 與 user null」。後端行為已由 §5～§7 的 integration 測試以真紅燈驅動，本 E2E 驗證的是既有 proxy 的穿透能力，寫入即綠——**如實標註為 regression guard**，SHALL NOT 以 stash 回退後端程式碼或改斷言製造紅燈。指令：`pnpm --filter ./nextjs-pickball exec playwright test --workers=1 tests/e2e/specs/auth-proxy.spec.ts`（前後清殘留 process）
  - 性質：**regression guard**（後端行為已由 §5～§7 integration 測試真紅燈驅動，本 E2E 寫入即綠；未回退後端、未改斷言製造紅燈）
  - 鑑別力檢查（確認測試會失敗，非偽造紅燈）：暫時把測試檔內預期 email 改成錯值，chromium 跑一次 → 1 failed（Expected 錯值／Received 實際 email）、/api/session 1 passed；已還原
  - 結果：`playwright test --workers=1 tests/e2e/specs/auth-proxy.spec.ts` → 4 passed（chromium、mobile-chrome 各 2）、6 skipped（firefox／webkit／mobile-safari），非因缺帳密而 skip；前後無殘留 process，:3005／:8787 無 listener
  - Stage 2 修正（第 1 次退回）：預設 workers 下 mobile-chrome 與 `--repeat-each` 會讓多個 worker 並行 seed（暫存檔互刪、`SQLITE_BUSY`、user 被重建使 session 失效）。修正：spec 以 `isMobile` 排除 mobile-chrome 並 `mode: "serial"`；seed 腳本暫存檔改 `mkdtempSync` 唯一目錄；`ensureTestAccountSeeded()` 以 runner pid 為 key 的 mkdir 鎖，同一次 Playwright 執行只 seed 一次（`--repeat-each` 會分到不同 worker，僅 serial 不足）；Origin 加「為什麼」註解；email 斷言不外洩測試 email
  - Stage 2 修正驗證：`--workers=1 --project=chromium` 2 passed；預設 workers `--project=chromium --project=mobile-chrome --repeat-each=4` 連跑兩次皆 8 passed／8 skipped（mobile-chrome 全 skip）；前端 tsc／lint、後端 typecheck 皆 exit 0，後端 12 檔 50 測試通過；`.wrangler/tmp` 無殘留 seed 目錄
  - 實作備註：helper 用 `__dirname`（Playwright 以 CJS 載入 TS）；另匯出 `readTestAccountResult()` 回報缺少的變數名，`readTestAccount()` 缺值回 `null`；`ensureTestAccountSeeded()` 以 `pnpm --dir <hono 絕對路徑>` 執行，不依賴 cwd
- [x] 9.2 確認 `nextjs-pickball` 的 `tsc --noEmit` 與 `pnpm --filter ./nextjs-pickball lint` 對新增的兩個檔案皆無錯誤
  - 前端 `tsc --noEmit` exit 0；`lint` exit 0（0 errors，3 個既有 warning，皆不在新增檔案）

## 10. 文件同步與總驗收

Depends on: §9

- [ ] 10.1 設定層（文件）：改寫 `hono-pickball/CLAUDE.md`：① 路由約定補 `/api/auth/*`、`/api/me`、`/api/session` 與停用時的 404／200 行為 ② 依賴注意：better-auth、`@better-auth/drizzle-adapter` 已被匯入，解除複審（`@hono/zod-validator`、`zod`、`date-fns` 仍未使用，複審期限保留給它們）；註明不升級到 1.7 的理由 ③ 測試慣例：gating 測試以 `app.request(path, init, env)` 注入 env 的例外、POST 帶 `Origin`、測試 env 由 `vitest.config.ts` 注入 ④ 本機登入準備步驟（`.dev.vars` → `db:migrate:local` → `db:seed:local`）
- [ ] 10.2 驗收（指令）C6：有／無 `.dev.vars` 各跑一次 `pnpm --filter ./hono-pickball test`，兩次全綠且通過數相同
- [ ] 10.3 驗收（指令）C1、C2：`pnpm --filter ./hono-pickball build` exit 0；`pnpm --filter ./hono-pickball typecheck` 兩段 exit 0
- [ ] 10.4 驗收（指令）：`pnpm -r exec tsc --noEmit` exit 0；`pnpm --filter ./nextjs-pickball lint` 0 errors；`pnpm test` 全綠（後端 12 檔／50 測試＝B1 後 25＋本 change 25（§1.1 實測 baseline 為 25，原寫 22／47）；前端數不減）；`git diff main --stat -- pnpm-lock.yaml '**/package.json'` 只有 `hono-pickball/package.json`
- [ ] 10.5 驗收（指令）：完整 E2E `pnpm --filter ./nextjs-pickball exec playwright test --workers=1`（`.dev.vars` 齊備）——既有 E2E 全數原樣通過，`auth-proxy.spec.ts` 在 chromium 2 passed；結果寫在本 task 後方
- [ ] 10.6 `DO_NOT_TRACK=1 openspec validate auth-backend-test-account --strict` 通過
