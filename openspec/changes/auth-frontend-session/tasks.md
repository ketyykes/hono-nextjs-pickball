# Tasks: auth-frontend-session

> **TDD 三步**（root `CLAUDE.md`）：RED（先寫失敗測試，以 `pnpm --filter ./nextjs-pickball test --run <path>` 在 shell 實際看到紅燈並貼出輸出）
> → GREEN（最小實作至綠）→ REFACTOR（無壞味道註記 skipped）。**`--run` 前不可加 `--`**。
>
> **紅燈要是真的**：加入即綠者 MUST 誠實標註 regression guard，**SHALL NOT 用「改斷言看紅再改回」偽造紅燈**。
>
> **前端 TDD 例外層**（`nextjs-pickball/CLAUDE.md`）：`app/**/page.tsx`、`playwright.config.ts`、`tests/**`、`.gitignore` 屬例外層，
> 以 E2E 或單元測試驗收其對外契約；標為 `例外層`。`驗收（指令）` 對應 test-plan C1～C5。
>
> **前提**：B2（`auth-backend-test-account`）已合併回 `main` 並 archive。**不得新增任何 npm 相依**；**禁止任何遠端 CF 操作**。
> 測試帳密不得寫進任何會被 commit 的檔案或訊息。it／test 名稱 MUST 與 delta spec「驗收」錨點逐字一致；`describe`／`it`／`expect`／`vi` 顯式匯入。
> **訪客路徑零迴歸**：既有 it 的斷言一律不得修改；唯一允許碰的既有測試檔是 `SiteNavbar.test.tsx`（只加一行 mock，見 4.4）。

## 1. 對齊 main＋Context7 查證（不寫產品程式碼）

- [x] 1.1 確認分支 `change/auth-frontend-session`、工作樹乾淨；`pnpm install` 後 lockfile 零變動；`db:migrate:local` 與 `db:seed:local` 成功；`pnpm test` baseline（前端檔數／測試數、後端應為 B2 後的 12 檔／47 測試），回填 environment.md 並 commit
- [x] 1.2 對齊 B2 實際落地：讀 `hono-pickball/src/index.ts`（`/api/session`、`/api/auth/*`、`/api/me` 的實際回應形狀與狀態碼）、`nextjs-pickball/tests/e2e/helpers/test-account.ts`（實際匯出簽章）、B2 archive 的 design.md Open Questions（特別是 sign-up 狀態碼、`wrangler d1 execute --local` 與執行中 dev 的可見性）。與本 design Context 不同處記入 Open Questions；若「執行中的 dev 讀不到新 seed」，依 design Risks 第 3 條調整 §6 的 seed 時機並記錄
- [x] 1.3 對齊前端現況：讀 `components/layout/SiteNavbar.tsx`／`.test.tsx`、`tests/e2e/specs/navbar-rwd.spec.ts`、`playwright.config.ts`、`app/health/page.test.ts`（metadata 測試範本）、`components/ui/{button,input,label}.tsx`；確認 `lucide-react` 匯出 `LogIn`／`LogOut`
- [x] 1.4 Context7 查證（MUST）：① `/better-auth/better-auth`（與已安裝版本最接近的版本 ID）的 React client（`createAuthClient`、`useSession`、`signOut`）與 FAQ 對 layout 使用 `useSession` 的建議 ② `/microsoft/playwright` 的 `globalSetup` 與 webServer 執行順序、`storageState`、`test.use` 重置 ③ `/facebook/react`（或 `/reactjs/react.dev`）的 `useSyncExternalStore` 與 `getServerSnapshot`。與 design Decision 1、5 的差異記入 Open Questions（附 library ID）
- [x] 1.5 量測窄螢幕餘裕（不改程式碼）：`.dev.vars` 齊備、前後端 dev 啟動後，以 Playwright 或瀏覽器在 320／390px 量 header 內層容器的可用寬度與五個連結的右緣，記錄目前餘裕（px），作為 §4 的判斷基準；完成後清掉自己起的 process

## 2. session-client

Depends on: §1

- [x] 2.1 RED: 新增 `nextjs-pickball/lib/auth/session-client.test.ts`，寫入 it「fetchSession 於 200 且形狀正確時回傳 authEnabled 與 user」「fetchSession 於非 200、形狀不符或網路錯誤時回傳未啟用且不拋錯」「signInWithEmail 以 JSON POST 至 /api/auth/sign-in/email」「signInWithEmail 依狀態碼回傳 ok、invalid-credentials、unavailable 或 failed」「signOut 以 POST 呼叫 /api/auth/sign-out 並回傳是否成功」（`vi.stubGlobal("fetch", …)`）。確認紅燈（模組不存在）
- [x] 2.2 GREEN: 新增 `nextjs-pickball/lib/auth/session-client.ts`（三個函式、`SessionState` 型別、形狀驗證；皆不 throw）
- [x] 2.3 REFACTOR: 形狀驗證比照 `lib/health.ts` 的 `isValidPayload` 寫法；無壞味道則註記 skipped
  - 2.1 紅燈 `3cf7648`（模組不存在，`git show 3cf7648^:…/session-client.ts` 複驗不存在）；2.2 `bdda3ab`；2.3 **skipped**（GREEN 已比照 `isValidPayload` 寫法，Stage 2 同意）。Stage 1／Stage 2 PASS；Stage 2 建議補 fetchSession method 斷言，已於 `05955f6` 補上（**regression guard**，寫入即綠）。

## 3. session store 與 useSession

Depends on: §2

- [x] 3.1 RED: 新增 `nextjs-pickball/lib/auth/session-store.test.ts`，寫入 it「初始為 loading，第一次訂閱後取得 session 並轉為 ready」「請求完成前的多個訂閱者只觸發一次請求」「refresh 重新取得 session 並通知所有訂閱者」（以 `vi.mock("./session-client")` 或 store 的測試注入點替換 `fetchSession`，每個 it 前重設 store）。確認紅燈
- [x] 3.2 GREEN: 新增 `nextjs-pickball/lib/auth/session-store.ts`（`subscribe`、`getSnapshot`、`getServerSnapshot`、`refresh`；第一次訂閱才請求、進行中請求共用）
- [x] 3.3 RED: 新增 `nextjs-pickball/hooks/useSession.test.ts`，寫入 it「useSession 回傳 store 快照並隨 refresh 更新」「伺服器端 render 時 useSession 為 loading 且不發請求」。確認紅燈（hook 不存在）
- [x] 3.4 GREEN: 新增 `nextjs-pickball/hooks/useSession.ts`（`useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)`，回傳快照＋`refresh`）
- [x] 3.5 RED（既有守衛）：跑 `pnpm --filter ./nextjs-pickball test --run hooks/hooksInventory.test.ts`，確認「hooks 目錄下每支 hook 都能在規格的歸屬清單中找到」因 `useSession` 未列入主 spec 而**真的轉紅**，貼出輸出
- [x] 3.6 GREEN（授權的主 spec 同步）：**本 task 明文授權**把 delta `specs/pickleball-guide-page/spec.md` 已定稿的歸屬清單句子（結尾為「`useSession` → auth）。」）原樣搬進主 spec `openspec/specs/pickleball-guide-page/spec.md` 的對應句，只動這一句（M14 `4b99156` 前例）；commit 訊息 `docs(openspec): 主 spec 歸屬清單同步 useSession（B3 §3）`。重跑 3.5 轉綠。archive 時此段 MODIFIED 應為 no-op
- [x] 3.7 REFACTOR: 確認 store 沒有在模組載入時發請求；無壞味道則註記 skipped
  - 紀錄：3.1 `1969131`（紅：模組不存在）→ 3.2 `f131b8c`；3.3 `b6ea559`（紅：hook 不存在）→ 3.4 `fd41541`；3.5 於 `fd41541` 後實跑真紅
    （`expected [ 'useSession' ] to deeply equal []`）；3.6 `d5141d8` 只動主 spec 一句，3.5 轉綠；3.7 **skipped**（只在第一次 subscribe 才請求，有測試守住）。
  - 補強 it（**regression guard**，寫入即綠）：`d895e56`（取消訂閱、getSnapshot 穩定參考、getServerSnapshot 在 ready 後仍 loading、SSR 在 ready 後仍 loading 等）、
    `823cceb`（模組初值、authEnabled false、ready 後新訂閱者不再請求；Stage 2 第 1 輪必修 1～3）。
  - **Stage 2 第 1 輪退回**：除測試缺口外，指出 inflight 共用使「初始請求在途時 refresh 拿到登入前舊結果」的競態（spec「refresh MUST 重新呼叫 fetchSession」）。
    以 TDD 修正：`8f26126`（真紅：改寫本 change 自己在 `d895e56` 新增的「共用同一次請求」it）→ `f7263f2`（改用遞增 requestId，以最新請求為準）。
    第 2 輪 Stage 2 PASS；建議的 refresh 語意註解已補（`516a5a1`）。
  - 測試數與 7.3 原預期不同：session-store **11** 個 it（預期 3）、useSession **3** 個（預期 2），差額皆為上述 regression guard／競態修正。

## 4. AccountEntry 與 navbar

Depends on: §3

- [x] 4.1 RED: 新增 `nextjs-pickball/components/layout/AccountEntry.test.tsx`（mock `@/hooks/useSession` 與 `@/lib/auth/session-client`），寫入 it「載入中或未啟用時不渲染任何元素」「啟用且未登入時顯示指向 /login 的登入連結」「已登入時顯示登出按鈕且 title 含使用者名稱」「點擊登出後呼叫 signOut 並重新取得 session」。確認紅燈
- [x] 4.2 GREEN: 新增 `nextjs-pickball/components/layout/AccountEntry.tsx`（design Decision 3：`LogIn`／`LogOut` 圖示、`aria-label`、`title`、`whitespace-nowrap shrink-0`、與導航連結相同的內距階梯與 solid／透明配色規則）
- [x] 4.3 例外層（接線）：`SiteNavbar.tsx` 在 `<nav>` 之後渲染 `<AccountEntry solid={solid} />`（或等價的配色傳遞方式）；不改動 `NAV_LINKS` 與既有 className
- [x] 4.4 既有測試隔離：`SiteNavbar.test.tsx` 頂部新增 `vi.mock("@/hooks/useSession", …)`（回傳 loading），**不改任何既有 it**；跑該檔確認既有 it 全數原樣通過（`git diff` 只有新增的 mock 區塊）
- [x] 4.5 REFACTOR: 配色判斷若與 `SiteNavbar` 的連結配色重複，抽成同檔共用的具名函式或常數；無壞味道則註記 skipped
  - 紀錄：4.1 `a0d5318`（紅：模組不存在）→ 4.2 `8b30379`；4.3 `8ffd41f`（只加 import 與 `<AccountEntry solid={solid} />`）；4.4 `4829242`（只新增 5 行 mock）。
  - **Stage 2 第 1 輪退回**：4.5 不得 skipped（AccountEntry 第二次寫死連結配色與內距）。修正 `244567a`：抽出 `components/layout/navItemStyles.ts`
    （`NAV_ITEM_BASE`、`navItemTone`）。**與 tasks 字面「同檔」不同**：SiteNavbar 已 import AccountEntry，放同檔會循環依賴，故用獨立模組；
    Stage 2 以 `cn()` 重建比對 SiteNavbar 連結 4 種組合與 AccountEntry 2 種組合的 class 逐字相同。
  - 補強：`09928dd`（shrink-0 斷言）、`0f86ba9`（signOut 失敗仍 refresh）皆 **regression guard**；`3e535cd`（真紅）→ `ee70f6d`：登入連結補 `transitionTypes={["nav-forward"]}`
    與 navbar 其他連結一致（測試檔以 `vi.mock("next/link")` 暴露該 prop）。AccountEntry.test 共 **7** 個 it（7.3 原預期 4）。第 2 輪 Stage 2 PASS。
  - 已知未覆蓋：接線位置（在 `<nav>` 之後）無單元測試（4.3 屬例外層），由 §6 E2E 驗收。

## 5. 登入頁

Depends on: §4

- [x] 5.1 RED: 新增 `nextjs-pickball/app/login/page.test.ts`，寫入 it「/login 匯出 metadata 且 robots.index 為 false」。確認紅燈
- [x] 5.2 GREEN（例外層）: 新增 `nextjs-pickball/app/login/page.tsx`（server component，匯出 `metadata`，渲染 `<LoginForm />`）——此時 `LoginForm` 尚不存在，先建立只回傳 `null` 的最小檔以讓 5.1 轉綠
- [x] 5.3 RED: 新增 `nextjs-pickball/components/auth/LoginForm.test.tsx`（mock `@/hooks/useSession`、`@/lib/auth/session-client`、`next/navigation`），寫入 it「載入中不顯示表單也不顯示未開放訊息」「未啟用時顯示此環境未開放登入且不顯示表單」「已登入時顯示已登入訊息且不顯示表單」「送出正確帳密後重新取得 session 並導向首頁」「帳密錯誤時顯示帳號或密碼錯誤並清空密碼」「unavailable 與 failed 分別顯示對應訊息」「送出期間登入按鈕為 disabled」。確認紅燈
- [x] 5.4 GREEN: 實作 `nextjs-pickball/components/auth/LoginForm.tsx`（design Decision 4；shadcn `Input`／`Label`／`Button`；錯誤 `role="alert"`；成功 `refresh()` 後 `router.replace("/")`）
- [x] 5.5 REFACTOR: 錯誤訊息文案集中為同檔具名常數；無壞味道則註記 skipped
  - 紀錄：5.1 `024be20`（紅：`page.tsx` 不存在）→ 5.2 `d529e5c`（例外層，LoginForm 先為 null 佔位）；5.3 `6b19c80`：7 條中 6 條真紅，
    「載入中不顯示表單也不顯示未開放訊息」在 null 佔位下寫入即綠，**regression guard**；5.4 `8107922`；5.5 `6318f25`（三個文案常數）。
  - 補強（皆 **regression guard**）：`837a842`（refresh 完成前不導向、欄位 type／autocomplete）、`f6fd683`（送出時阻止瀏覽器預設送出，Stage 2 建議）。
    `74661dd` 移除無作用的 pending 守衛（Stage 2 建議；重複送出由按鈕 disabled 防止）。Stage 1／Stage 2 一次 PASS。
  - LoginForm.test 共 **10** 個 it（7.3 原預期 7）。

## 6. E2E 登入夾具與 auth-session.spec

Depends on: §5

- [x] 6.1 例外層：`nextjs-pickball/.gitignore` 加 `/tests/e2e/.auth/`；新增 `nextjs-pickball/tests/e2e/global-setup.ts`（`dev-workflow`「E2E 登入夾具」1～2 點：重用 B2 helper、缺帳密時 warn＋刪舊 state＋結束、登入失敗 throw）；`playwright.config.ts` 加 `globalSetup`，**不動**五個 project 與 top-level `use`。storage state 路徑以設定檔目錄解析（`path.join(import.meta.dirname ?? __dirname, …)` 等價寫法），spec 與 setup 共用同一個常數
- [x] 6.2 E2E（預期多為 regression guard）: 新增 `nextjs-pickball/tests/e2e/specs/auth-session.spec.ts`，寫入 test「未登入時 navbar 顯示登入入口並可前往登入頁」「以測試帳號登入後 navbar 顯示登出」「帳號或密碼錯誤時登入頁顯示錯誤訊息」「重整後仍維持登入」「登出後 navbar 回到登入入口」「窄螢幕下帳號入口與五個導航連結皆完整落在視口內」（最後一條只跑 chromium；storage state 不存在時整檔 `test.skip` 並寫明原因；登入／登出流程用新 context）。行為已由 §2～§5 的單元／integration 測試以真紅燈驅動，本檔寫入時多數 test 會直接綠——**如實逐條標註**哪些是 regression guard、哪些首次執行為紅（及其原因）；**SHALL NOT** 以回退產品程式碼或改斷言製造紅燈。指令：`pnpm --filter ./nextjs-pickball exec playwright test --workers=1 tests/e2e/specs/auth-session.spec.ts`（前後清殘留 process）
- [x] 6.3 窄螢幕判定（2026-10-21 裁決後改寫）：`< sm`（640px）隱藏帳號入口、窄螢幕由 `/login` 登入登出（design Open Questions 第 9、12 條）。
  驗收：6.7～6.11 完成後，`auth-session.spec.ts`「窄螢幕下隱藏帳號入口且五個導航連結皆完整落在視口內」在 chromium 與 mobile-chrome 通過
  （320／375／390 入口 hidden 且五連結完整、640／1280 入口可見且在 `<nav>` 之後），既有 `navbar-rwd.spec.ts` 在 `.dev.vars` 齊備時原樣通過
  - 裁決前紀錄：原 test「窄螢幕下帳號入口與五個導航連結皆完整落在視口內」在 chromium 與 mobile-chrome 皆於 **320px** 失敗
    （「登入」連結 ratio 0.643，左／右緣 302／330）；390px 通過（右緣 386）；navbar-rwd 7/7 通過；產品程式碼未改動。證據在 `/tmp/b3-e2e-evidence/`。
- [x] 6.4 驗收（指令）C3：storage state 檔存在、含 session cookie、`git status --porcelain` 不列出
- [x] 6.5 驗收（指令）C4：停掉所有 dev server、暫時移除 `.dev.vars`，跑 `api-health.spec.ts`＋`auth-session.spec.ts`：exit 0、api-health 通過、auth-session 全 skipped 且原因含 `TEST_ACCOUNT_`；還原 `.dev.vars` 並停掉 server（`reuseExistingServer` 會沿用舊 server，因此前後都要確認 3005／8787 無殘留）
- [x] 6.6 驗收（指令）C5：`playwright.config.ts` 五個 project 與 top-level `use` 無 `storageState`
  - §6 紀錄（Implementer 自述；**§6 的 Stage 1／Stage 2 審查尚未執行**，等人類裁決 6.3 後再做）：
    6.1 `352b513`（`.gitignore`、`globalSetup`、`tests/e2e/global-setup.ts`、`tests/e2e/helpers/storage-state.ts`；依 B2 移交，
    `auth-proxy.spec.ts` 移除 `beforeAll` 的 seed 呼叫，斷言與 skip 零變動，chromium 2 passed／8 skipped）；6.2 `2783a4c`。
    6.2 前五條為 **regression guard**（首次執行即綠；firefox 有負載造成的逾時，隔離重跑通過，spec 內因此加 60 秒 test timeout 與導航後 15 秒 `toHaveURL`）；
    窄螢幕一條為真紅（即 6.3）。另依 Stage 2（§4）建議加入「入口右緣 ≥ 對戰分配右緣」位置斷言。
    C3：state 檔存在、只含 `better-auth.session_token`、被 `.gitignore` 忽略。C4：移除 `.dev.vars` 後 api-health 4 passed、auth-session 30 條全 skipped（原因含 `TEST_ACCOUNT_`）、
    exit 0、舊 state 被刪；還原後 `cmp` 位元相同；前後 3005／8787 無殘留。C5：五個 project 與 top-level `use` 無 `storageState`。

### 6.3 裁決的實作（2026-10-21 新增）

- [x] 6.7 RED: `AccountEntry.test.tsx` 新增 it「登入連結與登出按鈕在 sm 以下隱藏」（class 含 `hidden` 與 `sm:inline-flex`）。確認紅燈
- [x] 6.8 GREEN: `AccountEntry.tsx` 入口改為 `hidden sm:inline-flex`（取代 `inline-flex`；`shrink-0`、`whitespace-nowrap`、內距與配色不變）；SiteNavbar 與既有連結 className 零變更
- [x] 6.9 RED: `LoginForm.test.tsx` 新增 it「已登入時於登入頁點擊登出後呼叫 signOut 並重新取得 session」。確認紅燈
- [x] 6.10 GREEN: `LoginForm.tsx` 已登入狀態加「登出」按鈕（`signOut()` 後 `refresh()`，不導向）
- [x] 6.11 E2E（例外層）: `auth-session.spec.ts`——窄螢幕 test 改名並改寫為「窄螢幕下隱藏帳號入口且五個導航連結皆完整落在視口內」（320／375／390 hidden、五連結完整；640／1280 可見、右緣 ≥ 對戰分配）；
  依賴 navbar 入口的 test（未登入時…、以測試帳號登入後…、重整後…、登出後…）以 `test.use({ viewport: { width: 1280, height: 800 } })` 固定寬螢幕；
  新增「窄螢幕下可經由登入頁登入與登出」（390px、新 context）。新斷言先在 6.8／6.10 之前的程式碼上看到紅燈（或如實標註 regression guard）；
  跑 `auth-session.spec.ts`＋`navbar-rwd.spec.ts`＋`auth-proxy.spec.ts`
  - 紀錄：6.7 `058464a`（真紅：class 無 `hidden`）→ 6.8 `dbdd2b6`；6.9 `87a3f18`（真紅：無「登出」按鈕）→ 6.10 `33d5d92`；
    6.11 `4f578f4`（於 GREEN 前實跑，窄螢幕兩條新斷言 `toBeHidden failed` 為真紅）、`ddee0aa`（LoginForm 新增登出按鈕後，登出 E2E 改限定 header 並先等導向 `/`）。
  - §6 Stage 1 PASS；**Stage 2 第 1 輪退回**：goto／reload 後等待 hydration＋`/api/session` 的斷言只用預設 5 秒 expect timeout，
    高負載下 firefox reload 後入口出現需 2～8 秒（兩次執行各 1 條失敗、隔離重跑皆過）。修正 `1ecf0b9`：`SESSION_TIMEOUT = 15_000`＋`expect.configure`，
    只改 timeout、斷言不變（依 design Risks 2 上報此新逾時）。第 2 輪 PASS：全 5 project 32 passed／3 skipped／0 failed；
    加壓（`--workers=4 --repeat-each=2`）64 passed／0 failed，同條件下把逾時改回 5 秒會出現 2 條逾時。
    6.3 驗收：「窄螢幕下隱藏帳號入口且五個導航連結皆完整落在視口內」chromium、mobile-chrome 通過；navbar-rwd 原樣通過。

## 7. 文件同步與總驗收

Depends on: §6

- [ ] 7.1 設定層（文件）：`nextjs-pickball/CLAUDE.md`：架構總覽補 `/login`（本機測試帳號登入頁，不在 navbar 的 `NAV_LINKS`，由帳號圖示進入）；目錄約定的 hooks 歸屬補 `auth：useSession`、`lib/` 補 `auth/`；測試架構補 E2E 登入夾具（`globalSetup`、`.auth/`、缺 `.dev.vars` 時 skip）；**不動**「matchmaker 為 LocalStorage-only」敘述（B5／B6 才改）
- [ ] 7.2 驗收（指令）C1：`pnpm -r exec tsc --noEmit` exit 0；`pnpm --filter ./hono-pickball typecheck` exit 0；`pnpm --filter ./nextjs-pickball lint` 0 errors 且 warning 不多於基線
- [ ] 7.3 驗收（指令）：`pnpm test` 全綠；前端檔數／測試數 = 基線＋本 change 新增（6 檔、22 測試：session-client 5、session-store 3、useSession 2、AccountEntry 4、page 1、LoginForm 7，再加既有 hooksInventory 不變）；後端不變；`git diff main --stat -- pnpm-lock.yaml '**/package.json'` 為空
- [ ] 7.4 驗收（指令）C2：`.dev.vars` 齊備下完整 E2E `pnpm --filter ./nextjs-pickball exec playwright test --workers=1`（前後清殘留）：既有 test 全數原樣通過（passed／skipped 數與基線相同，另加 B2 的 auth-proxy 與本 change 的 auth-session）；結果寫在本 task 後方。失敗不得自行判定為雜訊
- [ ] 7.5 `DO_NOT_TRACK=1 openspec validate auth-frontend-session --strict` 通過
