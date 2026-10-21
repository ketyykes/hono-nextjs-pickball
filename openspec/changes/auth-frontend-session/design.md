# Design: auth-frontend-session

## Context

- **前提為 B2（`auth-backend-test-account`）的 design**：
  - `GET /api/session` 永遠 200，回 `{ authEnabled, user: { id, email, name } | null }`；停用時不碰 D1（B2 Decision 5）。
  - `POST /api/auth/sign-in/email`：成功 200＋`better-auth.session_token`（本機無 `Secure`）；帳密錯誤 401；本機登入停用時 404（B2 Decision 2）。
  - `POST /api/auth/sign-out`：撤銷 session；同源 POST 需 `Origin` 屬於 `trustedOrigins`（瀏覽器自動帶上）。
  - `nextjs-pickball/tests/e2e/helpers/test-account.ts`：`readTestAccount()`、`ensureTestAccountSeeded()`（B2 Decision 8）。
  - 前端 SHALL NOT 依賴 cookie 名稱（B2 Decision 4：G1 改 https 後會加 `__Secure-` 前綴）。
  B2 合併後若上述任何一點與 B2 design 不同（以 B2 archive 的 design.md Open Questions 為準），本 change §1 MUST 先對齊。
- `SiteNavbar` 是 root layout 中、`<ViewTransition>` 外側的 client component，跨路由常駐；5 個 `NAV_LINKS`，
  窄螢幕排版已調到極限：`SiteNavbar.test.tsx` 註解記載「390px 下餘裕已從 90px 縮到約 28px」，320px 下靠「< 375px 隱藏 logo」才塞得下
  （`site-navbar`「窄螢幕導航呈現」）。
- 既有 E2E 約 624 條全為訪客；`player-roster`／`player-stats`／`quiz`／`scoreboard` 監控 console error。
- 前端 TDD 例外層：`app/**/page.tsx`、`tests/**`、`*.config.*`；純呈現元件以 E2E 驗收，行為下放 `hooks/`／`lib/`（`nextjs-pickball/CLAUDE.md`）。
- 已安裝且可用：`lucide-react`、shadcn `button`／`input`／`label`、`@testing-library/react`、`@playwright/test@1.59`。

## Goals

- 訪客路徑零迴歸：沒有 `.dev.vars` 時 navbar 逐像素不變；有 `.dev.vars` 時既有 E2E 全數原樣通過。
- 本機以測試帳號從 `/login` 登入、navbar 顯示登入狀態、可登出、重整後仍登入。
- 提供 Wave 2 共用的 `useSession`（唯一的前端登入狀態來源）。
- E2E 能以登入態測試（`globalSetup`＋`storageState`，D6）。

## Non-Goals

- Google 登入、使用者選單／頭像、任何使用者資料（B5～B9）、D6 的資料清空（無資料表）。

## Decisions

### Decision 1：自寫 `session-client`＋store＋`useSession`，不在前端安裝 better-auth client

**Choice**：`lib/auth/session-client.ts`（三個 fetch 函式）＋`lib/auth/session-store.ts`（外部 store）＋`hooks/useSession.ts`（`useSyncExternalStore`）。

**Rationale**：
- Context7（`/better-auth/better-auth/v1.6.23`，`concepts/client.mdx`、`guides/browser-extension-guide.mdx`）：官方 React client 為
  `createAuthClient` from `better-auth/react`，提供 `useSession`、`signIn.email`、`signOut`，回傳 `{ data, error }`。採用它需要在 `nextjs-pickball`
  **新增 `better-auth` 相依**（runbook 全批「不新增相依」的精神；也會把 auth 程式庫打進前端 bundle）。
- 更關鍵的是**訊號來源**：官方 `useSession` 打的是 `GET /api/auth/get-session`，該路由在停用環境被 B2 的 gate 回 404——瀏覽器把 4xx fetch 記成 console error，
  正式站與無 `.dev.vars` 的 E2E 會出現錯誤（既有四支 E2E 監控 console）。而「是否啟用」本來就不是 better-auth 的概念，官方 client 無從得知。
  B2 為此提供了永遠 200 的 `/api/session`；直接消費它最簡單。
- Context7 FAQ（`reference/faq.mdx`）提醒「避免在 `layout.tsx` 用 `useSession`，改用 server 端 `getSession`」——本專案的 session 查詢必須經
  service binding，root layout 是 server component 且全站靜態，改成伺服器端取 session 會讓每個頁面變 dynamic。改為 navbar（client component）
  掛載後以單一 store 取一次，首屏 HTML 不變。
- store 放 `lib/`（`nextjs-pickball/CLAUDE.md`「瀏覽器 I/O 擺放慣例」：fetch 屬 I/O，放 `lib/`），hook 只做 React 綁定。

**Alternatives considered**：
- `createAuthClient`（官方）：新相依＋4xx console 問題。不選。G1 若需要 Google 的 `signIn.social` 重導流程，屆時再評估（記入 Open Questions）。
- React Context Provider 包在 layout：要改 server component 的 root layout 並引入 provider 層；外部 store＋`useSyncExternalStore` 不需要 provider，
  也不影響 `<ViewTransition>` 的結構。不選。
- SWR／React Query：新相依。不選。

### Decision 2：fail-closed——取不到狀態就當作「未啟用」

**Choice**：`fetchSession` 任何失敗回 `{ authEnabled: false, user: null }`；store 在 `loading` 期間 navbar 不渲染入口。

**Rationale**：訪客 UI 必須與現在相同；後端暫時不可用時不能讓 navbar 出現半套登入 UI 或噴錯。代價是後端掛掉時已登入使用者會短暫看不到登出鈕——
本機開發階段可接受。

### Decision 3：帳號入口是 navbar 最右側的單一圖示元素

**Choice**：`AccountEntry` 放在 `<nav>` 之後（header 內層 flex 的最後一個子元素）；未登入為 `LogIn` 圖示連結（`aria-label="登入"`），
已登入為 `LogOut` 圖示按鈕（`aria-label="登出"`、`title="已登入：<name>"`）；`size-4` 圖示、與導航連結相同的水平內距階梯（`px-1.5`／`px-2`／`sm:px-3`）、
`whitespace-nowrap shrink-0`。

**Rationale**：runbook B3 要求「navbar 顯示登入狀態與登出」。在 28px 餘裕的 390px 上，文字型「登入」「登出」按鈕（兩個中文字＋內距約 44px）必然擠爆；
單一圖示約 28～32px，是唯一可能塞得進去的形式。登入狀態以「出現的是登入還是登出」表達，名稱放 `title`／`aria-label`，不佔寬度。
`lucide-react` 是 `emoji-free-ui` 規定的通用記號來源。

**Alternatives considered**：
- 使用者頭像＋下拉選單：需要新增 shadcn `dropdown-menu`（`radix-ui` 已在相依內，但元件檔要新增），且頭像也要佔寬度。G1 再議。
- 帳號入口只在 `sm` 以上顯示：手機是計分板的主要使用情境（場邊），Wave 2 起手機必須能登入登出。原本不選；
  **2026-10-21 人類裁決改採**（實測 320／375px 擠不下，見 Open Questions 第 9 條）：`< sm` 時以 `hidden sm:inline-flex` 隱藏入口，
  窄螢幕的登入登出改由 `/login` 頁提供（已登入時該頁顯示「登出」按鈕）；行動裝置的登入入口記為 G1 待辦。
- 放在 matchmaker 區段導覽或各頁：違反 runbook「navbar 顯示」。不選。
- **若實測仍擠不下**：本 change SHALL NOT 自行隱藏連結、改文案或改漢堡選單（`site-navbar` 既有立場），升級給人類，候選方案見 Open Questions 1。

### Decision 4：`/login` 是 server component 外殼＋client 表單

**Choice**：`app/login/page.tsx` 匯出 `metadata`（`title`、`robots: { index: false }`），只渲染 `<LoginForm />`；表單狀態、送出、錯誤對應全部在
`components/auth/LoginForm.tsx`，以 RTL 對其做 integration TDD（mock `@/lib/auth/session-client` 與 `next/navigation`）。成功後 `refresh()` 再
`router.replace("/")`（`replace` 而非 `push`：返回鍵不該回到登入表單）。

**Rationale**：`page.tsx` 屬 TDD 例外層，邏輯不放那裡；比照 `/health` 以單元測試只驗 `metadata` 匯出。表單是有分支的行為元件，必須 TDD。

### Decision 5：E2E 夾具用 `globalSetup`（runbook D6），不用 setup project

**Choice**：`globalSetup: "./tests/e2e/global-setup.ts"`；以 API 登入（不開瀏覽器）存 storage state；既有 project 不加 `storageState`、不加 `dependencies`。

**Rationale**：
- Context7（`/microsoft/playwright`，`docs/src/test-global-setup-teardown-js.md`）**推薦 setup project（project dependencies）**，因為能出現在 HTML report、
  有 trace、可用 fixtures。**本 change 刻意採 runbook D6 的 `globalSetup`**：setup project 要讓五個既有 project 都 `dependencies: ["setup"]`，
  等於改動所有既有 E2E 的執行圖；`globalSetup` 只在 setup 檔內做事，帳密缺失時可以優雅略過，既有 project 設定零變動。
  登入只是一個 API 呼叫，trace 與 fixtures 的優勢用不到。
- Context7（`packages/playwright/src/runner/tasks.ts` 的 `createGlobalSetupTasks`）：順序為「移除輸出目錄 → plugin setup（**webServer 啟動**）→ globalSetup」，
  所以 globalSetup 內可以直接呼叫 `http://localhost:3005`。
- Context7（`docs/src/auth.md`）：個別檔案以 `test.use({ storageState })` 取用、以 `{ cookies: [], origins: [] }` 重置，與本設計一致。
- 「登出」測試若對共用 session 登出，會讓同批其他測試的 storage state 失效——因此登入／登出流程一律在新 context 走 UI 登入取得**獨立 session**。

**Alternatives considered**：setup project（Context7 推薦）——見上。不選，差異已記錄。

### Decision 6：單元測試隔離——`SiteNavbar.test.tsx` 只加 mock

**Choice**：`SiteNavbar.test.tsx` 頂部新增 `vi.mock("@/hooks/useSession", () => ({ useSession: () => ({ status: "loading", refresh: vi.fn() }) }))`，
不修改任何既有 it。`AccountEntry.test.tsx`、`LoginForm.test.tsx` 以 mock `@/hooks/useSession` 與 `@/lib/auth/session-client` 控制狀態。
store 的測試以注入假的 `fetchSession`（store 提供僅供測試的重設與注入點，或以 `vi.mock("./session-client")`；擇一，Stage 2 審查）。

**Rationale**：happy-dom 下真的 `fetch("/api/session")` 會打到不存在的 server，讓既有測試變慢或出現未處理錯誤。mock 一行即可隔離，既有斷言零變動。

## Risks / Trade-offs

- **[Risk] 390px／320px 擠不下帳號入口**（本 change 最大風險；390px 現有餘裕約 28px）→ Mitigation：Decision 3 的最小形式；§6 的 E2E 在 320／390 兩寬度以
  `toBeInViewport({ ratio: 1 })` 驗證入口與五個連結，且既有 `navbar-rwd.spec.ts` 在 `.dev.vars` 齊備時必須原樣通過。失敗即依 execution-plan Escalation 升級給人類，
  SHALL NOT 自行改動既有連結或文案。
- [Risk] navbar 每次整頁載入多一次 `/api/session` 請求，`next dev` 冷啟動時拖慢既有 E2E 或造成時序差異（runbook R3）→ Mitigation：入口在 `loading` 時不佔版面、
  不阻塞任何既有互動；完整 E2E 回歸為驗收條件；若出現新的逾時，證據上報。
- [Risk] `globalSetup` 執行 `wrangler d1 execute --local` 時 `wrangler dev` 已在執行（webServer 先啟動）→ Mitigation：B2 design Open Questions 3 已實測；
  若 B2 記錄為「執行中的 dev 讀不到新 seed」，本 change §1 改為在 webServer 啟動前 seed（例如把 seed 併入後端 webServer 的 command）並記錄。
- [Risk] 開發者機器有無 `.dev.vars` 會讓既有 E2E 的 navbar 外觀不同，兩種狀態都必須綠 → Mitigation：§7 的回歸在 `.dev.vars` 齊備狀態下跑完整套（較嚴格的一側），
  另以指令驗收 C4 在缺 `.dev.vars` 時抽跑。
- [Risk] `useSyncExternalStore` 的 server snapshot 與 client 第一次 render 不一致 → Mitigation：server snapshot 固定 loading；client 端第一次 render 也從 loading 開始
  （請求在訂閱後才發出），由「伺服器端 render 為 loading」測試與既有 E2E 的 hydration 監控把關。
- [Trade-off] 已登入狀態只以圖示＋`title` 表達，可見性弱於顯示姓名 → 本機測試帳號階段可接受；G1 上線時重新設計（Open Questions 1）。

## Migration Plan

- 合併後：無 `.dev.vars` 的環境行為不變；有 `.dev.vars` 的開發者可從 navbar 圖示進入 `/login`。
- **不 push**（D4）。回滾：revert 合併 commit；`tests/e2e/.auth/` 可直接刪除。

## Open Questions

1. **【已裁決 2026-10-21，見第 9 條】** 若 §6 的窄螢幕 E2E 失敗，候選方案（需人類裁決，本 change 不自行選）：(a) 帳號入口在 `< 375px` 時改放到 logo 原本的位置（logo 已隱藏）；
   (b) 已登入狀態改為只在 `sm` 以上顯示 `title` 以外的視覺提示；(c) 接受在 `< 375px` 時隱藏入口、改由 `/login` 頁提供登出。
2. G1 加入 Google 登入時，是否改用官方 `createAuthClient`（`signIn.social` 的重導流程）——屆時需處理 Decision 1 所述的 4xx console 問題。
3. 登入成功導向固定為 `/`；Wave 2 若需要「登入後回到原頁」（例如從計分板進入登入），再加 `?next=` 參數（本 change 不做）。

### apply §1 查證紀錄（2026-10-21）

4. **1.1 baseline**：前端 81 檔／783、後端 12 檔／**50**（tasks 1.1 寫 47，B2 合併時實際為 50）；lint 0 errors／3 warnings。
   因此 7.3 的後端預期為 12 檔／50 不變；前端預期 87 檔／805。
5. **1.2 對齊 B2：回應契約與本 design Context 一致**（`/api/session` 永遠 200、停用時 `{authEnabled:false,user:null}`、
   啟用但查詢例外時降級為 `user:null`；`/api/auth/*` 停用時 `c.notFound()` 404；錯誤帳密 401）。差異與移交：
   - helper 實際匯出 `readTestAccount(): TestAccount | null`、`readTestAccountResult()`（`{ok:false, missing}` 可寫明缺哪個變數）、
     `ensureTestAccountSeeded()`；helper 以 `__dirname` 解析路徑（Playwright 以 CJS 載入 TS）。global-setup 的 warn／spec 的 skip 原因
     改用 `readTestAccountResult().missing` 才能寫出缺的變數名（spec 要求原因含 `TEST_ACCOUNT_`）。
   - B2 Open Question 3 已實測：`d1 execute --local` 對執行中的 wrangler dev 立即可見 → **seed 時機不需調整**（globalSetup 在 webServer 後 seed 即可）。
   - **B2 移交（coordinator 指示 MUST）**：seed 會 DELETE 同 email user 並 cascade 刪 session，globalSetup 存 storageState 後若有 spec 再 seed，
     共用 state 即失效。故 §6 範圍**擴大**：`tests/e2e/specs/auth-proxy.spec.ts` 的 `beforeAll` seed 呼叫移除、改依賴 globalSetup
     （該檔斷言零變動），helper 註解同步。此項超出 tasks 標頭「唯一允許碰的既有測試檔是 `SiteNavbar.test.tsx`」，屬 coordinator 明令的例外。
   - 經 proxy 的 sign-in 不帶 `Origin` 回 403：globalSetup 的 API 登入必須帶 `Origin: http://localhost:3005`（與 delta spec 一致）。
6. **1.3 前端現況**：與 design 一致。`lucide-react` 匯出 `LogIn`／`LogOut`；shadcn `button`／`input`／`label` 皆在；`@testing-library/user-event` 已安裝；
   `@playwright/test` 實裝 **1.60.0**（design 寫 1.59）。`SiteNavbar.test.tsx` 的 `afterEach` 用 `vi.resetAllMocks()`——新增的 `useSession` mock
   須在 reset 後仍回 loading（用一般 arrow function 或 `vi.fn` 皆可，Vitest 4 的 reset 會還原為工廠實作）。
7. **1.4 Context7**：
   - `/better-auth/better-auth/v1.6.23`（`concepts/client.mdx`、`reference/faq.mdx`、`authentication/email-password.mdx`）：`createAuthClient` from
     `better-auth/react`、`useSession()` 回 `{ data, isPending, error, refetch }`、`signOut()` 打 `POST /sign-out`；FAQ 仍建議避免在 `layout.tsx` 用 `useSession`。
     **與 Decision 1 無差異**。
   - `/microsoft/playwright/v1.59.0`（`test-global-setup-teardown-js.md`、`auth.md`、`api-testing-js.md`）與 `packages/playwright/src/runner/tasks.ts`：
     順序 removeOutputDirs → plugin setup（webServer）→ globalSetup，globalSetup 可直接呼叫 webServer；`test.use({ storageState })` 取用、
     `{ cookies: [], origins: [] }` 重置；`request.newContext()` 的 `storageState()` 可匯出 cookie。**與 Decision 5 無差異**。
   - `/websites/react_dev_reference`（`useSyncExternalStore`）：`getServerSnapshot` 用於伺服器 render **與 hydration**，client 與 server 必須一致；
     `getSnapshot` 未變更時須回傳同一參考。**與 Decision 1、Risks 第 5 條一致**。
8. **1.5 窄螢幕量測（`.dev.vars` 齊備、前後端 dev、chromium headless、未改程式碼）**——**320px 與 375px 擠不下，390px 勉強放得下**：
   - 目前餘裕（header 內層容器內容寬度 − logo − gap − nav 固有寬度）：**320px：18px**（內容寬 296、logo 隱藏、nav 278）；
     **390px：32px**（內容寬 358、logo 16＋gap 12、nav 298）；1280px：680px。
   - 以 DOM 注入模擬 Decision 3 的入口（`inline-flex`、`py-2`、`px-1.5`／`px-2`、16px 圖示、`shrink-0`，接在 `<nav>` 後、受容器 `gap-3` 影響）：
     | 視口 | 入口左／右緣 | 完整在視口內 | 容器 scrollWidth／clientWidth | 五連結 |
     |---|---|---|---|---|
     | 320 | 302／**330** | **否（超出 10px）** | 330／320 | 皆在視口內、高 36 |
     | 375 | 354／**386** | **否（超出 11px）** | 386／375 | 皆在視口內 |
     | 390 | 354／386 | 是（距右緣 4px，已吃掉容器右內距 12px） | 390／390 | 皆在視口內 |
     | 414 | 366／398 | 是 | 414／414 | 皆在視口內 |
   - 入口需要的寬度：320px 下 28px（圖示 16＋px-1.5）＋ gap 12 = 40px > 餘裕 18px；390px 下 32＋12 = 44px > 32px 的「內容寬餘裕」，
     靠溢出到容器右內距才放得下。
   - 對 Open Questions 1 候選方案的數值評估（僅供人類裁決，本 change 不自行選）：(a) 放到 logo 原位置：320px 下仍需 28＋12 = 40px > 18px，**一樣放不下**；
     (b) 不影響寬度；(c) `< 375px` 隱藏入口：320 可過，但 375px（iPhone SE 2/3、mini 等級）仍超出 11px，需把斷點一併納入考量。
   - 依 tasks 6.3，§6 的窄螢幕 E2E 預期在 320px 失敗；屆時依 Escalation 停止並升級，附截圖。§2～§5 與排版無關，先行實作。

### apply 進度與升級事項（2026-10-21，leader 停止於 tasks 6.3）

9. **窄螢幕擠不下——已於 2026-10-21 由 coordinator 裁決（使用者以 /goal 授權）**。裁決前的事實紀錄如下：
   - E2E 實測（`.dev.vars` 齊備，`auth-session.spec.ts`「窄螢幕下帳號入口與五個導航連結皆完整落在視口內」）：**320px 失敗**，
     「登入」圖示連結 `toBeInViewport({ ratio: 1 })` 實得 0.643，左／右緣 302／330（視口 320，超出 10px）；chromium 與 mobile-chrome 皆同。
     **390px 通過**（右緣 386，距邊 4px，已吃掉容器右內距 12px）。375px（spec 未要求，但為 iPhone SE 2／3、mini 寬度）右緣 386，超出 11px。
     五個導航連結在 320／375／390 皆仍完整在視口內、不換行；既有 `navbar-rwd.spec.ts` 在 `.dev.vars` 齊備時 chromium、mobile-chrome 7/7 通過。
   - 證據：失敗截圖、video、error-context 在 `/tmp/b3-e2e-evidence/`（repo 外、未 commit）；§1 的量測見本節第 8 條。
   - 根因：320px 下內容寬 296、五連結固有寬 278，餘裕 18px；入口需 28px（16 圖示＋`px-1.5`）＋容器 `gap-3` 12px＝40px。
   - 候選方案（第 1 條原列，加上數值評估；本 change 不自行選）：
     (a) `< 375px` 時入口改放 logo 原位置——數值上仍需 28＋12＝40px > 18px，**單獨採用放不下**；
     (b) 不影響寬度，不解決本問題；
     (c) `< 375px` 時隱藏入口、改由 `/login` 頁提供登出——320 可過，但 375px 仍超出 11px，斷點需一併改為例如 `< 390px`（`max-[390px]`）；
     另一可能方向（需人類決定，涉及修改既有 spec 條款）：`< 375px` 時入口與連結共用更小的間距（例如縮小容器 `gap`），但這會改動既有 navbar 的 className／spec「窄螢幕導航呈現」。
   - 裁決後需要：依決定修改 delta spec／design（若改條款）、修改 `AccountEntry`／`SiteNavbar` 並以 TDD 驗證、重跑 §6 E2E，接著執行 §6 Stage 1／Stage 2、§7 與 Final Code Review。
10. **目前進度**：§1～§5 全部完成且通過兩階段審查；§6 的 6.1、6.2、6.4、6.5、6.6 已完成（Implementer 自述，**§6 兩階段審查尚未執行**），6.3 觸發停止；§7 未開始。
    前端單元測試現為 87 檔／820（基線 81／783；新增 6 檔，it 數多於 tasks 7.3 預期的 22 條，差額為 regression guard 與 §3 競態修正，各組紀錄見 tasks.md）。
    §7.4 完整 E2E 將有 2 個已知失敗（chromium、mobile-chrome 的窄螢幕 test），在裁決前不執行；另 firefox 在高負載機器上單條登入 test 需 20～40 秒，跑完整 E2E 時需留意。
11. **與 design 不同之處（已實作）**：
    - store 改用遞增 `requestId`、不共用進行中請求（§3 Stage 2：共用會使「初始請求在途時登入後 refresh」拿到舊結果）。
    - 內距／配色抽到 `components/layout/navItemStyles.ts`（tasks 4.5 寫「同檔」，因 SiteNavbar import AccountEntry，同檔會循環依賴）。
    - 登入連結加 `transitionTypes={["nav-forward"]}` 與 navbar 其他連結一致。
    - `/login` metadata 為 `robots: { index: false, follow: false }`（比照 `/health`）。
    - B2 移交：`auth-proxy.spec.ts` 的 seed 移至 globalSetup（tasks 標頭未列此例外，屬 coordinator 明令）。

### 第 9 條的裁決（2026-10-21，coordinator；使用者以 /goal 授權不再逐條詢問）

12. 採方案 (c) 的變體：
    - 帳號入口在 `< sm`（Tailwind 預設 640px）時隱藏（`hidden sm:inline-flex`），`>= sm` 顯示。理由：五個導航連結的既有窄螢幕呈現零變更、
      不調 gap、不改既有 className；框架標準斷點比自訂 390px 穩定（390px 只剩 4px 餘裕）。
    - 窄螢幕下的登入／登出改由直接造訪 `/login` 提供；`/login` 在已登入時補上「登出」按鈕（原設計只有「已登入：<name>」與回首頁連結）。
    - **G1 待辦：行動裝置的登入入口**——G1 改 Google 登入時重新設計（例如使用者選單／頭像，或行動版的其他入口），本 change 不處理。
    - 窄螢幕 E2E 以 `browserName` 判斷，chromium 與 mobile-chrome 皆執行，保留。
    - 規格同步：delta `site-navbar`（新增 `< sm` 隱藏條款、Scenario「帳號入口於 sm 以下隱藏」，窄螢幕 E2E Scenario 改寫為「窄螢幕下隱藏帳號入口且不影響既有導航連結」，
      navbar 相關 E2E Scenario 加上 viewport >= 640px 前提）、delta `auth`（已登入時登入頁提供登出、新增 Scenario「已登入時可於登入頁登出」
      「窄螢幕下經由登入頁登入與登出」）、test-plan 對應列、tasks 6.3 改寫並新增 6.7～6.11。
13. 第 10 條「目前進度」與第 11 條「與 design 不同之處」維持原紀錄；裁決後的實作結果記於 tasks.md 6.7～6.11 與 §7。
