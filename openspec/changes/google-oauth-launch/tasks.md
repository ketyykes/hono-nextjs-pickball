# Tasks: google-oauth-launch

> **TDD 三步**（root `CLAUDE.md`）：RED（先寫失敗測試，以單檔指令在 shell 實際看到紅燈並貼出輸出）→ GREEN（最小實作至綠）→ REFACTOR（無壞味道註記 skipped）。
> 單檔 vitest（免鎖）：`pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball/<workspace> test --run <path>`（**`--run` 前不可加 `--`**；**不要用 `pnpm --dir <root> --filter ./<ws>`**，cwd 不在 root 時 "No projects matched" 且 exit 0）。
> 單檔 E2E（雙鎖）：`pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball/nextjs-pickball exec playwright test --workers=1 --project=<p> <spec> [-g <test 名稱>]`，前後清殘留 dev server。
>
> **重負載雙鎖**（E2E、eslint 全套、全套 vitest、build、preview）：先 `/tmp/lock-fast.sh nextjspickball "<說明>"`（每秒輪詢 mkdir 鎖 `/tmp/heavy-compute.lock`）→ `python3 /Users/m2_24gb/Desktop/project/mini4wd/app/scripts/heavy.py --label nextjspickball -- <指令>` → `/tmp/heavy-lock.sh release nextjspickball`；不得在 heavy.py 內再包 heavy.py；單檔 vitest 免鎖。
> 清殘留：`lsof -i :3005 -i :8787` ＋ `ps aux | grep -E "next-server|wrangler|workerd|playwright" | grep -v grep`，只 kill 路徑含 `Desktop/project/nextjs-pickball` 的 PID，禁止 `pkill -f`。
>
> **紅燈要是真的**：加入即綠者 MUST 誠實標註 regression guard，**SHALL NOT 用「改斷言看紅再改回」偽造紅燈**。
> 一個 RED task 可一次寫入多個 it（皆須在 GREEN 前實際看到紅），會先綠的 it 必須在紀錄中逐一點名並標 regression guard。
> 本 change 在主 repo 進行，Stop hook 會擋主 worktree 的 tsc 紅燈：**每個 RED 與其 GREEN MUST 在同一張派工單內完成**。
>
> **標註**：`TDD`；`regression guard`；`設定層`（wrangler／vitest 設定、型別產物、文件）；`驗收（指令）`（test-plan C1～C10）；`人工`（§5，使用者執行）。
>
> **範圍**：產品程式碼只改 proposal「Impact」列出的檔案。**不新增相依、不新增 migration、不動核心套件、不 push**。
> it／test 名稱 MUST 與 delta spec「驗收」錨點逐字一致；測試一律顯式匯入 `describe`／`it`／`expect`／`vi`；E2E 不得使用 `waitForTimeout`。
>
> **禁止任何遠端 CF 操作**（`wrangler deploy`、`d1 create`、任何 `--remote`、`secret put`／`list`／`delete`、`wrangler login`）；只允許 `--local`、`--dry-run`。
> **Google OAuth Client ID／Secret 與測試帳密 SHALL NOT 出現在任何 commit**；測試用假值固定為 `fake-client-id`／`fake-client-secret`。agent SHALL NOT 讀取或修改 `hono-pickball/.dev.vars` 的值。
>
> **授權修改的既有測試（僅限下列兩處，皆為本 change 行為的必然結果；其餘既有 it／test 的名稱與斷言一律不得修改）**：
> ① `hono-pickball/test/auth-session.test.ts` 的三個 it「停用且無 DB 時回 200 與 authEnabled false」「啟用但未登入時回 200 與 user null」「session 查詢拋錯時仍回 200 與 user null」：`toEqual` 的期望物件**增列** `signInMethods`
>    （依序 `{ google: false, emailPassword: false }`、`{ google: false, emailPassword: true }`、`{ google: false, emailPassword: true }`），其餘斷言一字不改；
> ② `nextjs-pickball/components/auth/LoginForm.test.tsx` 檔頭 `vi.mock("@/lib/auth/session-client", …)` 的 factory **增列** `startGoogleSignIn: vi.fn()`。

## 1. 對齊與基線（不寫產品程式碼）

- [x] 1.1 確認分支 `change/google-oauth-launch`、工作樹乾淨；`pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball install` 後 lockfile 零變動；`pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball/hono-pickball db:migrate:local` 成功；
  確認 `hono-pickball/.dev.vars` 含 `TEST_ACCOUNT_*` 與 `ENVIRONMENT`、**不含** `GOOGLE_` 開頭的鍵（只以 `grep -c '^GOOGLE_'` 計數，不得輸出值；不符時向 coordinator 回報）；
  雙鎖下跑 `pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball test`（記錄三個 workspace 的檔數／測試數）、三段 typecheck、`pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball lint`（errors／warnings 數）、
  `pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball/nextjs-pickball exec playwright test --list`（六個 project 各自數量）、`pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball/hono-pickball build`（保存 dry-run 的 binding 清單作對照：預期**不含** `env.DB`）；回填 environment.md Verification 並 commit（`chore:`）
  - 紀錄：基線回填於 environment.md（commit `6bc2a53`）。單元與 lint 依 coordinator 指示沿用 `35f71a4` 實測（前端 111／1118、後端 26／215、核心 10／27；lint 0／3）；leader 實跑三段 typecheck 皆 exit 0、`--list` 五個瀏覽器各 158／user-data 47、`hono-pickball build`（雙鎖）exit 0 且 `No bindings found.`；lockfile 零變動；`.dev.vars` 無 `GOOGLE_` 鍵。
- [x] 1.2 對齊 main：確認 proposal「Impact」列出的產品檔與測試檔與 propose 時（`main` `35f71a4`）內容一致（`git diff --stat 35f71a4 HEAD -- <檔案清單>` 無輸出）；
  以 python difflib 比對本 change 全部 MODIFIED Requirement（auth 4、api-connectivity 1、user-data-sync 1、backend-database 1、dev-workflow 2）與目前主 spec，除本 change 刻意增修外應無差異；
  **若主 spec 已被其他 change 改動，以主 spec 為底重新套用本 change 的增修**、`DO_NOT_TRACK=1 openspec validate google-oauth-launch --strict` 通過後 commit（`docs(openspec):`）；差異記入 design.md Open Questions。
  以 Context7（`/better-auth/better-auth`）複查 design Context 的四項前提：`disabledPaths`、`signIn.social` 的 `callbackURL`／`errorCallbackURL`、Google `prompt`、https baseURL 的 secure cookie；不符時停止回報
  - 紀錄：`git diff --stat 35f71a4 HEAD -- <Impact 產品檔／測試檔／文件／openspec/specs>` 無輸出；difflib 比對九個 MODIFIED Requirement，主 spec 側被刪除的行全屬本 change 刻意改寫（停用敘述、回應形狀、G1 字樣），無既有 Scenario 遺失，主 spec 未被他 change 改動，不需重新套用。
    Context7 `/better-auth/better-auth` 複查四項前提皆成立：`disabledPaths` 於 router `onRequest` 以正規化路徑比對並回 404（本機 1.6.15 `dist/api/index.mjs:164-166` 同）；`sign-in/social` body 接受 `callbackURL`／`errorCallbackURL`；Google `prompt: "select_account"`；靜態 `baseURL` 以 `https://` 開頭時 cookie 為 `Secure` 且帶 `__Secure-` 前綴。

## 2. 後端：auth 啟用規則、email 封鎖、signInMethods、正式 D1

Depends on: §1

- [x] 2.1 設定層（不需紅燈，`hono-pickball/CLAUDE.md`：wrangler／vitest 設定與型別產物屬設定層）：
  ① `vitest.config.ts` 的 `miniflare.bindings` 增列 `GOOGLE_CLIENT_ID: ""`、`GOOGLE_CLIENT_SECRET: ""`（附「為什麼」註解：不讓開發者本機 `.dev.vars` 的 Google 值改變測試結果）；
  ② `.dev.vars.example` 增列空值的 `GOOGLE_CLIENT_ID=`、`GOOGLE_CLIENT_SECRET=` 與註解（正式站以 `wrangler secret put` 設定；本機留空即只有測試帳號）；
  ③ `wrangler.jsonc` top-level 增列 `d1_databases`（`DB`／`hono-pickball`／`9c3a73c2-9a06-4e92-bb6d-90f9cbfda513`／`drizzle`），`env.local`、`name`、`services` 不動、不加 `vars`；
  ④ 手動重跑 `pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball/hono-pickball cf-typegen`（`.dev.vars.example` 的改動不會觸發 hook），確認 `worker-configuration.d.ts` 變為 `DB: D1Database`、`GOOGLE_CLIENT_ID: string`、`GOOGLE_CLIENT_SECRET: string`；
  ⑤ `src/db/client.ts` 的 `getDb` 參數與 `src/auth/create-auth.ts` 的 `AuthEnv.DB` 收窄為允許 `undefined`（design Decision 8）；
  驗收：前端 `pnpm -r exec tsc --noEmit` 與後端 typecheck 兩段 exit 0；後端全套單元測試（雙鎖）與基線相同、全綠；`pnpm --dir …/hono-pickball build` 的 dry-run 列出 `env.DB (hono-pickball)`。commit（`chore:`）
  - 紀錄：`4fd0457`（chore）。`hono-pickball build`（雙鎖）exit 0，dry-run 列出 `env.DB (hono-pickball)  D1 Database`；`worker-configuration.d.ts` 為 `DB: D1Database`、`GOOGLE_CLIENT_ID: string`、`GOOGLE_CLIENT_SECRET: string`，無 `DB?:`；commit 前後端全套 26 檔／215 全綠；`tsc -r` 與後端 typecheck exit 0。`vitest.config.ts`、`wrangler.jsonc` 中因 top-level 新增正式 D1 而失實的既有註解一併改寫。
- [x] 2.2 RED（TDD）：
  - `test/auth-config.test.ts` 新增 it「isGoogleSignInConfigured 只在 client id 與 secret 皆為非空字串時為真」「isAuthEnabled 在 development 或 Google 設定齊全時為真」；
  - 新檔 `test/auth-google.test.ts`：it「非 development 且 Google 設定齊全時 sign-in/social 回傳導向 Google 的授權網址」「非 development 且 Google 設定齊全時使用者資料 API 未登入回 401」；
  - `test/auth-session.test.ts` 新增 it「非 development 且 Google 設定齊全時回 authEnabled true 與只有 Google 的 signInMethods」，並依檔頭例外 ① 增列三個既有 it 的期望欄位；
  - `test/auth-gating.test.ts` 新增 it「非 development 且 Google 設定不全時 auth 整組停用且不觸碰 D1」；
  - E2E `tests/e2e/specs/auth-session.spec.ts` 的既有 describe「訪客」內新增 test「登入頁的登入方式與後端回報一致」（沿用 `guestState` 與檔頭的 storageState skip；必須在本組 GREEN 前寫入：其 `typeof signInMethods.google` 斷言只在後端尚未回報欄位時為紅，test-plan 該列）。
  斷言依 test-plan。單檔 vitest 逐檔確認新 it 與例外 ① 的三個 it 全紅並貼出輸出（`auth-config` 的兩個 it 因匯入不存在的函式而整檔失敗，屬預期）；雙鎖下以 chromium 單檔 E2E（`-g "登入頁的登入方式與後端回報一致"`）確認紅並貼出輸出；
  依 e 機械複驗後 commit（`test:`）
  - 紀錄：`8b02c8e`（test）。紅燈：`auth-config` 2 failed（`isGoogleSignInConfigured is not a function`／`isAuthEnabled is not a function`）；`auth-google` 2 failed（`expected 404 to be 200`、`expected 404 to be 401`）；`auth-gating` 新 it 紅（`expected { authEnabled: false, user: null } to deeply equal …`）；`auth-session` 4 failed（例外 ① 三個＋新 it）。E2E chromium 單檔（雙鎖）紅：`Expected: "boolean" / Received: "undefined"`（首版寫 `body.signInMethods.google` 得 TypeError，改 optional chaining 後為斷言紅，commit 後者；兩者皆紅，非偽造）。無寫入即綠者。leader 機械複驗：RED commit 只含 `hono-pickball/test/*` 與 E2E spec，`hono-pickball/src` diff 為空；7 個新名稱在 `8b02c8e^` 皆 0 筆。
- [x] 2.3 GREEN（TDD）：`local-auth.ts` 新增 `isGoogleSignInConfigured`、`isAuthEnabled`；`local-auth-middleware.ts` 閘門改用 `isAuthEnabled`（同步更新註解）；`create-auth.ts` 的 Google 註冊條件改用 `isGoogleSignInConfigured` 並加 `prompt: "select_account"`；
  `src/index.ts` 的 `/api/session` 停用判斷改用 `isAuthEnabled`、三個分支皆回 `signInMethods`（design Decision 1、3、7）。
  2.2 的 it 與 E2E 全綠；`auth-*.test.ts`、`expected-user-guard.test.ts`、`db-client.test.ts` 其餘既有 it 原樣綠；後端全套單元測試（雙鎖）全綠；後端 typecheck 兩段 exit 0。commit（`feat:`）
  - 紀錄：`9b58955`（feat）。單檔全綠（auth-config 8、auth-google 2、auth-gating 4、auth-session 5、auth-env-types 1、db-client 3、expected-user-guard 6）；後端全套（雙鎖）27 檔／221 passed；E2E chromium「登入頁的登入方式與後端回報一致」1 passed。
- [x] 2.4 RED（TDD）：`test/auth-config.test.ts` 新增 it「非 development 時 disabledPaths 封鎖 email 登入與註冊，development 時不封鎖」；`test/auth-gating.test.ts` 新增 it「非 development 且 Google 設定齊全時 email 登入與註冊回 404 且不發 cookie」。
  單檔 vitest 確認兩個 it 皆紅並貼出輸出（後者預期為 `expected 400 to be 404`：2.3 開啟閘門後 better-auth 以 `EMAIL_PASSWORD_DISABLED` 拒絕；若實際為其他狀態碼，記錄原文並向 coordinator 回報後再續）；commit（`test:`）
  - 紀錄：`f558b2d`（test）。B8 `expected undefined to deeply equal []`；B7 `expected 400 to be 404`（與預期相符）。leader 複驗：RED commit 只含兩個測試檔、`hono-pickball/src` diff 為空；兩個新名稱在 `9b58955` 與 `f558b2d^` 皆 0 筆（確在第一輪 GREEN 之後寫入）。
- [x] 2.5 GREEN（TDD）：`create-auth.ts` 傳入 `disabledPaths`，依 `isLocalAuthEnabled` 切換空陣列與 `["/sign-in/email", "/sign-up/email"]`（design Decision 2；不得以 Hono `app.post` 攔截）；
  2.4 的 it 全綠；後端全套單元測試（雙鎖）全綠，`expected-user-guard.test.ts` 列舉數不變；commit（`feat:`）
  - 紀錄：`33ee61b`（feat）。auth-config 9／auth-gating 5 全綠；後端全套（雙鎖）27 檔／223 passed；`expected-user-guard` 6 個 it 綠、列舉數不變。
- [x] 2.6 REFACTOR：判斷是否只寫一處、`disabledPaths` 條件是否以具名常數或 if/else 表達、`local-auth.ts` 的檔頭註解是否已反映「兩個述詞＋聯集」；無壞味道則註記 skipped
  - 紀錄：Implementer 初判 skipped；Stage 2 第一輪 FAIL（`AuthEnv` JSDoc 與 `emailAndPassword` 註解失實、`createAuth` 殘留第二份 truthy 判斷、`disabledPaths` 未以具名常數表達），leader 追加 `wrangler.jsonc` `env.local` 註解失實。全新 Implementer 修正於 `34a197e`（refactor：`isGoogleSignInConfigured` 改 type guard、`createAuth` 只留單一判斷、`localAuthEnabled`／`disabledPaths` 具名常數、三處註解改寫）；單檔全綠、後端全套（雙鎖）27／223、兩段 typecheck exit 0。
- [x] 2.7 mutation 自檢（execution-plan b §2 的六條＋對照組）結果附於本 task 紀錄

  - 紀錄：Implementer 自跑與 Stage 2 兩輪獨立 mutation 結果一致（第二輪以 `34a197e` 為準）：① 閘門改回 `isLocalAuthEnabled` → B3、B6 紅，**B4 維持綠**（`/api/session` 不經 `localAuth`，另以 X3「`/api/session` 閘門改 `isLocalAuthEnabled`」證明 B4 守住自身判斷；兩位 reviewer 皆判定非測試缺口）；② 只檢查 client id → B1、B2、B5、「Google provider 只在 client id 與 secret 皆存在時註冊」紅；③ 移除 `/sign-up/email` → B7、B8 紅；④ `disabledPaths` 恆空 → B7（收到 400）、B8 紅；⑤ `emailPassword` 寫死 true → B4 紅；⑥ 移除 prompt → B3 紅；對照組（`||` 兩側對調）全綠；加碼 X1 述詞寫死 true、X2 `emailAndPassword.enabled` 寫死 true 皆轉紅。存活變異：無（B4 於 ① 屬預期）。代號：B1 isGoogleSignInConfigured、B2 isAuthEnabled、B3 sign-in/social、B4 session 只有 Google、B5 Google 不全停用、B6 使用者資料 401、B7 email 404、B8 disabledPaths。
    Stage 1（sonnet）PASS；Stage 2（opus）第一輪 FAIL（見 2.6）→ 第二輪 PASS，無必修項。
## 3. 前端：signInMethods、Google 按鈕、proxy 不跟隨轉址

Depends on: §2

- [x] 3.1 RED（TDD）：`lib/auth/session-client.test.ts` 新增 it「fetchSession 回傳後端提供的 signInMethods」「signInMethods 形狀不符時 fetchSession 回傳未啟用」
  「startGoogleSignIn 以 JSON POST 至 /api/auth/sign-in/social 並導向回傳的網址」「startGoogleSignIn 於非 200、缺少網址、非 https 或網路錯誤時回傳失敗且不導向」；
  `lib/auth/session-store.test.ts` 新增 it「fetchSession 回傳 signInMethods 時快照保留同一份 signInMethods」。
  單檔 vitest 逐檔確認新 it 全紅並貼出輸出（`startGoogleSignIn` 尚不存在，該兩個 it 以「不是函式」失敗屬預期）；commit（`test:`）
  - 紀錄：`92d0c58`（test）。`session-client.test.ts` 4 failed｜6 passed：「fetchSession 回傳後端提供的 signInMethods」toEqual 缺 `signInMethods`；「signInMethods 形狀不符時…」預期 `authEnabled: false` 實得 `true`；兩個 startGoogleSignIn it 為 `TypeError: startGoogleSignIn is not a function`。`session-store.test.ts` 1 failed｜11 passed（快照缺 `signInMethods`）。無寫入即綠者。leader 機械複驗：`session-client.ts`、`session-store.ts` 在 `92d0c58^` 與 `92d0c58` 內容相同；5 個新名稱在 `92d0c58^` 皆 0 筆。
- [x] 3.2 GREEN（TDD）：`session-client.ts` 增列 `SignInMethods` 型別、`SessionState.signInMethods?`、`isValidPayload` 對 `signInMethods` 的檢查（鍵不存在 → 不帶此鍵；形狀不符 → 未啟用）、`startGoogleSignIn(navigate = …)`（design Decision 4、5）；
  `session-store.ts` 的 ready 快照改為展開 `fetchSession()` 的結果。3.1 的 it 全綠；兩檔其餘既有 it 與 `hooks/useSession.test.ts`（若存在）原樣綠；`pnpm -r exec tsc --noEmit` exit 0；改動檔 ESLint 0 errors；commit（`feat:`）
  - 紀錄：`688b619`（feat）。單檔：session-client 10 passed、session-store 12 passed、`hooks/useSession.test.ts` 3 passed；`tsc -r` exit 0；改動檔 ESLint 0 errors。
- [x] 3.3 RED（TDD）：`components/auth/LoginForm.test.tsx` 依檔頭例外 ② 增列 mock，新增 it「只啟用 Google 時顯示使用 Google 登入按鈕且不顯示測試帳號表單」「Google 與測試帳號皆啟用時兩種登入方式皆顯示且 Google 在前」
  「快照不含 signInMethods 時只顯示測試帳號表單」「點擊使用 Google 登入後呼叫 startGoogleSignIn 且按鈕維持 disabled」「Google 登入請求失敗時顯示錯誤訊息並恢復按鈕」。
  單檔 vitest 確認除「快照不含 signInMethods 時只顯示測試帳號表單」外全紅並貼出輸出；該 it 寫入即綠，**標 regression guard**（test-plan 已預先點名）；commit（`test:`）
  - 紀錄：`1025415`（test）。`LoginForm.test.tsx` 4 failed｜12 passed，四個 Google it 皆為 `Unable to find an accessible element with the role "button" and name "使用 Google 登入"`；「快照不含 signInMethods 時只顯示測試帳號表單」寫入即綠，**regression guard**（測試內註解點名）。檔頭 mock 依例外 ② 只增列 `startGoogleSignIn: vi.fn()`。**偏離 test-plan**：「Google 在前」改以 `Array.from(document.querySelectorAll("button, input")).indexOf` 比較先後，不用 `compareDocumentPosition`——happy-dom 對 React render 的 DOM 回傳反向值（leader 以 scratch 測試獨立重現：在前的 button 對 input 得 `2`）；Stage 2 以「Google 按鈕移到表單之後」變異實證替代斷言會紅（見 design `## Open Questions`）。leader 機械複驗：`LoginForm.tsx` 在 `1025415^` 與 `1025415` 內容相同；5 個新名稱在 `1025415^` 皆 0 筆。
- [x] 3.4 GREEN（TDD）：`LoginForm.tsx` 依 `signInMethods ?? { google: false, emailPassword: true }` 顯示「使用 Google 登入」按鈕（在表單之前）與測試帳號表單；點擊後 disabled、呼叫 `startGoogleSignIn()`，`ok: false` 時以 `role="alert"` 顯示「Google 登入失敗，請稍後再試」並恢復按鈕；
  `app/login/page.tsx` 只更新「本機開發用的測試帳號登入頁」註解。3.3 的 it 全綠；`LoginForm.test.tsx` 其餘既有 it 與 `app/login/page.test.ts` 原樣綠；雙鎖下 chromium 跑 `auth-session.spec.ts` 全檔全綠；commit（`feat:`）
  - 紀錄：`a468f06`（feat）。LoginForm 16 passed、`app/login/page.test.ts` 1 passed；雙鎖下 chromium `auth-session.spec.ts` 全檔 8 passed（含「登入頁的登入方式與後端回報一致」，無 skip）。
- [x] 3.5 RED（TDD）：`app/api/[[...route]]/route.test.ts` 新增 it「轉發時以 redirect: manual 呼叫 binding，不在 proxy 內跟隨轉址」「upstream 的 3xx 轉址連同 Location 與多個 Set-Cookie 原樣回傳」；
  `tests/e2e/specs/auth-proxy.spec.ts` 的既有 describe「auth proxy 穿透」內新增 test「經 proxy 呼叫 OAuth callback 時轉址原樣回到瀏覽器」（沿用該 describe 的 chromium skip；只用 `request` fixture、`maxRedirects: 0`，不需帳密）。
  單檔 vitest 確認前者紅、後者寫入即綠（**regression guard**，test-plan 已預先點名）；雙鎖下 chromium 單檔 E2E 實跑該 test：紅即真紅，綠則**標 regression guard** 並記錄 `next dev` 下 binding 不跟隨轉址的事實（design Decision 6 驗證限制）；commit（`test:`）
  - 紀錄：`e6d7390`（test）。`route.test.ts` 1 failed｜8 passed：「轉發時以 redirect: manual…」`expected undefined to be 'manual'`；「upstream 的 3xx 轉址連同 Location 與多個 Set-Cookie 原樣回傳」寫入即綠，**regression guard**。E2E（雙鎖、chromium、`-g "OAuth callback"`）**真紅**：`Expected: >= 300 / Received: 200`（webServer log 有 `state_not_found`）——`next dev` 下 miniflare binding **會**跟隨轉址，故非 regression guard。leader 機械複驗：`route.ts` 在 `e6d7390^` 與 `e6d7390` 內容相同；3 個新名稱在 `e6d7390^` 皆 0 筆。
- [x] 3.6 GREEN（TDD）：`route.ts` 的 init 增列 `redirect: "manual"`（附「為什麼」註解：binding 的 fetch 預設跟隨轉址，OAuth callback 的 Set-Cookie 會被吞掉）；3.5 的 it 與 E2E 全綠；`route.test.ts` 其餘既有 it 原樣綠；`auth-proxy.spec.ts` 其餘既有 test 原樣綠；commit（`fix:`）
  - 紀錄：`22a0a20`（fix）。route 9 passed；雙鎖下 chromium `auth-proxy.spec.ts` 全檔 3 passed（新 test 綠、既有 2 個綠）；`tsc -r` exit 0；`git status` 乾淨。
- [x] 3.7 REFACTOR：`LoginForm` 的顯示條件是否以具名變數表達、無巢狀三元；`startGoogleSignIn` 與既有三個函式的錯誤處理風格一致；無壞味道則註記 skipped
  - 紀錄：skipped。顯示條件以 `methods`／`showGoogle`／`showEmailPassword` 具名變數表達、無巢狀三元；`startGoogleSignIn` 與既有三個函式同為 try/catch、判 `status === 200`、絕不 throw。Stage 2 判 skipped 合理。
- [x] 3.8 mutation 自檢（execution-plan b §3 的六條＋對照組）結果附於本 task 紀錄
  - 紀錄：Implementer 自跑與 Stage 2 獨立 mutation 結果一致：① 不驗 `signInMethods` 形狀 → F2 紅；② 快照只挑兩欄 → F12 紅；③ Google 按鈕只看 `authEnabled` → F7 紅；④ 缺省 `{ google: false, emailPassword: false }` → F7＋7 個既有 LoginForm it 紅（8/16）；⑤ 移除 `https:` 檢查 → F4 紅；⑥ 移除 `redirect: "manual"` → F10 紅；對照組（`isValidSignInMethods` 兩檢查對調、`typeof object` 與 `null` 檢查對調）全綠。Stage 2 加碼 S1～S7：按鈕移到表單後、`ok:true` 時恢復、`ok:false` 時不恢復、`errorCallbackURL` 改值、移除 `status !== 200`、移除 `setGooglePending(true)` 皆紅；**存活 1 條（S6）**：無條件寫入 `session.signInMethods`（鍵不存在時成為 undefined 屬性）全綠——`toEqual` 忽略 undefined 屬性，「鍵不存在 → 回傳值不含此鍵」未被釘住；補強需改既有 it 斷言（`toStrictEqual`）或新增 it，皆超出授權範圍，不在本 change 處理（見 design `## Open Questions`）。代號：F1～F4 session-client、F5～F9 LoginForm、F10～F11 route、F12 session-store。
    Stage 1（sonnet）PASS；Stage 2（opus）PASS，無必修項。

## 4. 文件與指令驗收

Depends on: §2、§3

- [ ] 4.1 `hono-pickball/CLAUDE.md`：auth 啟用規則（兩個述詞＋聯集、fail-closed）、`disabledPaths`、`signInMethods`、top-level 正式 D1 與 `env.local` 分工、`DB` 型別必填、`--remote` 只限使用者上線步驟、Google 變數在測試中注入空值；commit（`docs:`）
- [ ] 4.2 `nextjs-pickball/CLAUDE.md`：`/login` 依 `signInMethods` 顯示、`startGoogleSignIn`、proxy `redirect: "manual"` 的理由；commit（`docs:`）
- [ ] 4.3 root `CLAUDE.md`「CF Dashboard 側設定（不在 repo 內）」：列出四個 secret 名稱（不含值）、不得設定 `CLOUDFLARE_ENV`／`--env`／遠端 `ENVIRONMENT`；commit（`docs:`）
- [ ] 4.4 root `README.md`：新增「正式站上線步驟」一節（內容與 §5 的指令逐字一致，依 `dev-workflow` 新 Requirement 的七項），「部署前手動檢查清單」第 8 步指向該節；commit（`docs:`）
- [ ] C1 驗收（指令）：三段 typecheck 皆 exit 0（test-plan C1）
- [ ] C2 驗收（指令）：雙鎖下 `pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball lint` 0 errors、warnings 不多於基線
- [ ] C3 驗收（指令）：雙鎖下 `pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball test` 全綠；前端檔數不變、測試數＝基線＋12；後端檔數＋1、測試數＝基線＋8；核心與基線相同
- [ ] C4 驗收（指令）：雙鎖下 `pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball build` exit 0；hono-pickball 段的 dry-run binding 清單含 `env.DB (hono-pickball)`；建置後 `git status --porcelain` 為空
- [ ] C5 驗收（指令）：`.dev.vars` 不含 `GOOGLE_` 鍵；記錄 `curl -s http://localhost:8787/api/session` 輸出；依 project 分開跑全套 E2E（chromium、firefox、mobile-chrome、user-data 各一次；webkit、mobile-safari 各 `--shard=1/3`～`3/3`），每次雙鎖、前後清殘留；
  `--list`：五個瀏覽器 project 各＝基線＋2、user-data＝基線；執行：chromium 新增 2 passed，其餘四個瀏覽器 project 各新增 1 passed＋1 skipped，user-data 與基線相同；全部 0 failed、無因缺帳密 skip
- [ ] C6 驗收（指令）：雙鎖下起後端 dev 與前端 `preview`（workerd），curl `GET /api/auth/callback/google` 為 3xx 且 redirect_url 非空、`GET /api/session` 含 `"signInMethods":{"google":false,"emailPassword":true}`；結束後清掉自起的 process（test-plan C6）
- [ ] C7 驗收（指令）：`pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball/hono-pickball cf-typegen` 後 `git -C /Users/m2_24gb/Desktop/project/nextjs-pickball diff --exit-code -- hono-pickball/worker-configuration.d.ts` exit 0；grep 確認 `DB: D1Database`、兩個 Google 變數為 `string`、全檔無 `DB?:`
- [ ] C8 驗收（指令）：`git -C /Users/m2_24gb/Desktop/project/nextjs-pickball log -p main..HEAD | grep -E 'apps\.googleusercontent\.com|GOCSPX-'` 無輸出
- [ ] C9 驗收（指令）：`DO_NOT_TRACK=1 openspec validate google-oauth-launch --strict`（repo root）valid
- [ ] C10 驗收（指令）：test-plan C10 各項檢查（scripts 無 `--remote`、範例檔與 vitest 注入、`env.local` 不變、README 字串順序與第 8 步、root CLAUDE.md 小節）通過；`git diff main --stat` ⊆ proposal Impact；範圍外路徑的 `git diff main --stat` 輸出為空

## 5. 使用者上線步驟（人工）

> **只由使用者執行**；任何 agent SHALL NOT 執行本組任何指令。本組**不阻擋** merge 與 archive（design Decision 11）：archive 時本組維持未勾，archived `tasks.md` 頁首加註勾選比例與「§5 為使用者上線步驟，archive 時尚未執行；未勾選不代表遺漏」；
> 使用者完成後**不回填**本組核取方塊，改把結果寫進 archived `design.md` 的「上線紀錄」一節並以 `docs(openspec):` commit。
> 以下指令皆在 repo root 執行。**U1～U4 完成前不得 push**（push 即觸發正式部署）。

- [ ] U1 人工：設定 hono-pickball 的四個 Worker secret（`ENVIRONMENT` 絕對不設）
  ```bash
  pnpm --dir hono-pickball exec wrangler login
  openssl rand -base64 32        # 複製輸出，作為下一行的值
  pnpm --dir hono-pickball exec wrangler secret put BETTER_AUTH_SECRET
  pnpm --dir hono-pickball exec wrangler secret put BETTER_AUTH_URL      # 輸入 https://nextjs-pickball.wedsatcoming.workers.dev（無尾端斜線）
  pnpm --dir hono-pickball exec wrangler secret put GOOGLE_CLIENT_ID     # Google Cloud Console 的用戶端 ID
  pnpm --dir hono-pickball exec wrangler secret put GOOGLE_CLIENT_SECRET # 用戶端密鑰
  pnpm --dir hono-pickball exec wrangler secret list
  ```
  驗收：`secret list` 恰列出 `BETTER_AUTH_SECRET`、`BETTER_AUTH_URL`、`GOOGLE_CLIENT_ID`、`GOOGLE_CLIENT_SECRET` 四個名稱，**沒有** `ENVIRONMENT`。
  （若 Worker 尚未有任何部署，`secret put` 會詢問是否建立 Worker；選是即可，下一次部署會沿用這些 secret。）
- [ ] U2 人工：對正式 D1 套用既有 migration（不帶 `--env`）
  ```bash
  pnpm --dir hono-pickball exec wrangler d1 migrations apply DB --remote
  pnpm --dir hono-pickball exec wrangler d1 migrations list DB --remote
  ```
  驗收：apply 列出 `0000`～`0004` 並成功；list 回報沒有待套用的 migration；輸出中的資料庫為 `hono-pickball`（`9c3a73c2-9a06-4e92-bb6d-90f9cbfda513`），**不是** `hono-pickball-local`。
- [ ] U3 人工：CF Dashboard 確認（Workers & Pages → 各 Worker → Settings）
  - Builds：`hono-pickball` 的 root directory 為 `hono-pickball`、`nextjs-pickball` 的為 `nextjs-pickball`；build／deploy command **不含** `--env`；Build variables **沒有** `CLOUDFLARE_ENV`。
  - Variables and Secrets：`hono-pickball` 只有 U1 的四個 secret，**沒有** `ENVIRONMENT`（任何類型）。
  - 若最近一次 build log 可查，確認 `pnpm install` 有解析 `packages/pickball-core`（`workspace:*`）；首次無法確認時於 U6 檢查。
  驗收：以上各項皆符合；任一不符先修正再進 U4。
- [ ] U4 人工：確認要上線的內容
  ```bash
  git -C . status --porcelain        # 必須為空
  git log --oneline origin/main..main
  ```
  驗收：列出的 commit 為本 change（與其前已合併、尚未 push 的 change）；沒有預期外的提交。
- [ ] U5 人工：push（觸發兩個 Worker 的 Workers Builds）
  ```bash
  git push origin main
  ```
- [ ] U6 人工：Dashboard 確認部署順序與結果——`hono-pickball` 的 build 成功後再確認 `nextjs-pickball` 的 build 成功（兩者先後不受 repo 控制，過渡期行為見 design Decision 12）；
  `hono-pickball` 的 deploy log 列出 `env.DB (hono-pickball)`。驗收：兩個 build 皆為成功；任一失敗依 U9 回滾或重試。
- [ ] U7 人工：部署後驗收
  ```bash
  curl -s https://hono-pickball.wedsatcoming.workers.dev/api/health
  curl -s https://nextjs-pickball.wedsatcoming.workers.dev/api/session
  curl -s -o /dev/null -w '%{http_code}\n' -X POST \
    -H 'Content-Type: application/json' -H 'Origin: https://nextjs-pickball.wedsatcoming.workers.dev' \
    -d '{"email":"nobody@example.com","password":"x"}' \
    https://nextjs-pickball.wedsatcoming.workers.dev/api/auth/sign-in/email
  curl -s -o /dev/null -w '%{http_code}\n' -X POST \
    -H 'Content-Type: application/json' -H 'Origin: https://nextjs-pickball.wedsatcoming.workers.dev' \
    -d '{"email":"nobody@example.com","password":"xxxxxxxx","name":"x"}' \
    https://nextjs-pickball.wedsatcoming.workers.dev/api/auth/sign-up/email
  curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' \
    https://nextjs-pickball.wedsatcoming.workers.dev/api/auth/callback/google
  ```
  驗收：health 回 200 JSON；`/api/session` 為 `{"authEnabled":true,"user":null,"signInMethods":{"google":true,"emailPassword":false}}`；兩個 email 端點皆 `404`；callback 為 `302`（或其他 3xx）且 redirect_url 指向 `https://nextjs-pickball.wedsatcoming.workers.dev/...`。
  瀏覽器：開 `/login` 只見「使用 Google 登入」→ 選帳號並同意 → 回到首頁、navbar 顯示登出；重整仍登入；DevTools 可見 `__Secure-better-auth.session_token`（`Secure`、`HttpOnly`）；
  在 `/matchmaker/players` 新增一位參賽者、重整仍在（遠端 D1 寫入可用）；登出後回到訪客。Dashboard → hono-pickball → Observability 檢查 callback 與 `/api/session` 無 `exceededCpu`／1102。
  判讀：`authEnabled:false` → Google secret 缺或為空（回 U1）；`/api/auth/*` 500 或 `user` 永遠 null → `BETTER_AUTH_*` 缺或 U2 未完成；Google 顯示 `redirect_uri_mismatch` → `BETTER_AUTH_URL` 與 Console 登記值不一致。
- [ ] U8 人工：Google OAuth 同意畫面決定——「測試中」狀態只有列入測試使用者的帳號能登入；要開放給所有人時於 Google Cloud Console 發布應用程式（本 change 不設允許名單，首次 Google 登入即建立帳號）。
- [ ] U9 人工：回滾（需要時）與紀錄
  - 回滾：Dashboard → 該 Worker → Deployments → 回滾至前一版（兩個 Worker 可各自回滾）；或 `git revert <commit>` 後 `git push origin main`。只想暫停 Google 登入時：`pnpm --dir hono-pickball exec wrangler secret delete GOOGLE_CLIENT_ID`（正式站回到訪客版）。遠端 D1 與其餘 secrets 保留。
  - 紀錄：把 U1～U8 的日期、結果、curl 輸出摘要與偏差寫進 archived `design.md`「上線紀錄」一節並 commit（`docs(openspec):`）。
