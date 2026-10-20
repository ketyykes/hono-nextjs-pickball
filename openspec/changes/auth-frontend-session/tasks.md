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

- [ ] 1.1 確認分支 `change/auth-frontend-session`、工作樹乾淨；`pnpm install` 後 lockfile 零變動；`db:migrate:local` 與 `db:seed:local` 成功；`pnpm test` baseline（前端檔數／測試數、後端應為 B2 後的 12 檔／47 測試），回填 environment.md 並 commit
- [ ] 1.2 對齊 B2 實際落地：讀 `hono-pickball/src/index.ts`（`/api/session`、`/api/auth/*`、`/api/me` 的實際回應形狀與狀態碼）、`nextjs-pickball/tests/e2e/helpers/test-account.ts`（實際匯出簽章）、B2 archive 的 design.md Open Questions（特別是 sign-up 狀態碼、`wrangler d1 execute --local` 與執行中 dev 的可見性）。與本 design Context 不同處記入 Open Questions；若「執行中的 dev 讀不到新 seed」，依 design Risks 第 3 條調整 §6 的 seed 時機並記錄
- [ ] 1.3 對齊前端現況：讀 `components/layout/SiteNavbar.tsx`／`.test.tsx`、`tests/e2e/specs/navbar-rwd.spec.ts`、`playwright.config.ts`、`app/health/page.test.ts`（metadata 測試範本）、`components/ui/{button,input,label}.tsx`；確認 `lucide-react` 匯出 `LogIn`／`LogOut`
- [ ] 1.4 Context7 查證（MUST）：① `/better-auth/better-auth`（與已安裝版本最接近的版本 ID）的 React client（`createAuthClient`、`useSession`、`signOut`）與 FAQ 對 layout 使用 `useSession` 的建議 ② `/microsoft/playwright` 的 `globalSetup` 與 webServer 執行順序、`storageState`、`test.use` 重置 ③ `/facebook/react`（或 `/reactjs/react.dev`）的 `useSyncExternalStore` 與 `getServerSnapshot`。與 design Decision 1、5 的差異記入 Open Questions（附 library ID）
- [ ] 1.5 量測窄螢幕餘裕（不改程式碼）：`.dev.vars` 齊備、前後端 dev 啟動後，以 Playwright 或瀏覽器在 320／390px 量 header 內層容器的可用寬度與五個連結的右緣，記錄目前餘裕（px），作為 §4 的判斷基準；完成後清掉自己起的 process

## 2. session-client

Depends on: §1

- [ ] 2.1 RED: 新增 `nextjs-pickball/lib/auth/session-client.test.ts`，寫入 it「fetchSession 於 200 且形狀正確時回傳 authEnabled 與 user」「fetchSession 於非 200、形狀不符或網路錯誤時回傳未啟用且不拋錯」「signInWithEmail 以 JSON POST 至 /api/auth/sign-in/email」「signInWithEmail 依狀態碼回傳 ok、invalid-credentials、unavailable 或 failed」「signOut 以 POST 呼叫 /api/auth/sign-out 並回傳是否成功」（`vi.stubGlobal("fetch", …)`）。確認紅燈（模組不存在）
- [ ] 2.2 GREEN: 新增 `nextjs-pickball/lib/auth/session-client.ts`（三個函式、`SessionState` 型別、形狀驗證；皆不 throw）
- [ ] 2.3 REFACTOR: 形狀驗證比照 `lib/health.ts` 的 `isValidPayload` 寫法；無壞味道則註記 skipped

## 3. session store 與 useSession

Depends on: §2

- [ ] 3.1 RED: 新增 `nextjs-pickball/lib/auth/session-store.test.ts`，寫入 it「初始為 loading，第一次訂閱後取得 session 並轉為 ready」「請求完成前的多個訂閱者只觸發一次請求」「refresh 重新取得 session 並通知所有訂閱者」（以 `vi.mock("./session-client")` 或 store 的測試注入點替換 `fetchSession`，每個 it 前重設 store）。確認紅燈
- [ ] 3.2 GREEN: 新增 `nextjs-pickball/lib/auth/session-store.ts`（`subscribe`、`getSnapshot`、`getServerSnapshot`、`refresh`；第一次訂閱才請求、進行中請求共用）
- [ ] 3.3 RED: 新增 `nextjs-pickball/hooks/useSession.test.ts`，寫入 it「useSession 回傳 store 快照並隨 refresh 更新」「伺服器端 render 時 useSession 為 loading 且不發請求」。確認紅燈（hook 不存在）
- [ ] 3.4 GREEN: 新增 `nextjs-pickball/hooks/useSession.ts`（`useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)`，回傳快照＋`refresh`）
- [ ] 3.5 RED（既有守衛）：跑 `pnpm --filter ./nextjs-pickball test --run hooks/hooksInventory.test.ts`，確認「hooks 目錄下每支 hook 都能在規格的歸屬清單中找到」因 `useSession` 未列入主 spec 而**真的轉紅**，貼出輸出
- [ ] 3.6 GREEN（授權的主 spec 同步）：**本 task 明文授權**把 delta `specs/pickleball-guide-page/spec.md` 已定稿的歸屬清單句子（結尾為「`useSession` → auth）。」）原樣搬進主 spec `openspec/specs/pickleball-guide-page/spec.md` 的對應句，只動這一句（M14 `4b99156` 前例）；commit 訊息 `docs(openspec): 主 spec 歸屬清單同步 useSession（B3 §3）`。重跑 3.5 轉綠。archive 時此段 MODIFIED 應為 no-op
- [ ] 3.7 REFACTOR: 確認 store 沒有在模組載入時發請求；無壞味道則註記 skipped

## 4. AccountEntry 與 navbar

Depends on: §3

- [ ] 4.1 RED: 新增 `nextjs-pickball/components/layout/AccountEntry.test.tsx`（mock `@/hooks/useSession` 與 `@/lib/auth/session-client`），寫入 it「載入中或未啟用時不渲染任何元素」「啟用且未登入時顯示指向 /login 的登入連結」「已登入時顯示登出按鈕且 title 含使用者名稱」「點擊登出後呼叫 signOut 並重新取得 session」。確認紅燈
- [ ] 4.2 GREEN: 新增 `nextjs-pickball/components/layout/AccountEntry.tsx`（design Decision 3：`LogIn`／`LogOut` 圖示、`aria-label`、`title`、`whitespace-nowrap shrink-0`、與導航連結相同的內距階梯與 solid／透明配色規則）
- [ ] 4.3 例外層（接線）：`SiteNavbar.tsx` 在 `<nav>` 之後渲染 `<AccountEntry solid={solid} />`（或等價的配色傳遞方式）；不改動 `NAV_LINKS` 與既有 className
- [ ] 4.4 既有測試隔離：`SiteNavbar.test.tsx` 頂部新增 `vi.mock("@/hooks/useSession", …)`（回傳 loading），**不改任何既有 it**；跑該檔確認既有 it 全數原樣通過（`git diff` 只有新增的 mock 區塊）
- [ ] 4.5 REFACTOR: 配色判斷若與 `SiteNavbar` 的連結配色重複，抽成同檔共用的具名函式或常數；無壞味道則註記 skipped

## 5. 登入頁

Depends on: §4

- [ ] 5.1 RED: 新增 `nextjs-pickball/app/login/page.test.ts`，寫入 it「/login 匯出 metadata 且 robots.index 為 false」。確認紅燈
- [ ] 5.2 GREEN（例外層）: 新增 `nextjs-pickball/app/login/page.tsx`（server component，匯出 `metadata`，渲染 `<LoginForm />`）——此時 `LoginForm` 尚不存在，先建立只回傳 `null` 的最小檔以讓 5.1 轉綠
- [ ] 5.3 RED: 新增 `nextjs-pickball/components/auth/LoginForm.test.tsx`（mock `@/hooks/useSession`、`@/lib/auth/session-client`、`next/navigation`），寫入 it「載入中不顯示表單也不顯示未開放訊息」「未啟用時顯示此環境未開放登入且不顯示表單」「已登入時顯示已登入訊息且不顯示表單」「送出正確帳密後重新取得 session 並導向首頁」「帳密錯誤時顯示帳號或密碼錯誤並清空密碼」「unavailable 與 failed 分別顯示對應訊息」「送出期間登入按鈕為 disabled」。確認紅燈
- [ ] 5.4 GREEN: 實作 `nextjs-pickball/components/auth/LoginForm.tsx`（design Decision 4；shadcn `Input`／`Label`／`Button`；錯誤 `role="alert"`；成功 `refresh()` 後 `router.replace("/")`）
- [ ] 5.5 REFACTOR: 錯誤訊息文案集中為同檔具名常數；無壞味道則註記 skipped

## 6. E2E 登入夾具與 auth-session.spec

Depends on: §5

- [ ] 6.1 例外層：`nextjs-pickball/.gitignore` 加 `/tests/e2e/.auth/`；新增 `nextjs-pickball/tests/e2e/global-setup.ts`（`dev-workflow`「E2E 登入夾具」1～2 點：重用 B2 helper、缺帳密時 warn＋刪舊 state＋結束、登入失敗 throw）；`playwright.config.ts` 加 `globalSetup`，**不動**五個 project 與 top-level `use`。storage state 路徑以設定檔目錄解析（`path.join(import.meta.dirname ?? __dirname, …)` 等價寫法），spec 與 setup 共用同一個常數
- [ ] 6.2 E2E（預期多為 regression guard）: 新增 `nextjs-pickball/tests/e2e/specs/auth-session.spec.ts`，寫入 test「未登入時 navbar 顯示登入入口並可前往登入頁」「以測試帳號登入後 navbar 顯示登出」「帳號或密碼錯誤時登入頁顯示錯誤訊息」「重整後仍維持登入」「登出後 navbar 回到登入入口」「窄螢幕下帳號入口與五個導航連結皆完整落在視口內」（最後一條只跑 chromium；storage state 不存在時整檔 `test.skip` 並寫明原因；登入／登出流程用新 context）。行為已由 §2～§5 的單元／integration 測試以真紅燈驅動，本檔寫入時多數 test 會直接綠——**如實逐條標註**哪些是 regression guard、哪些首次執行為紅（及其原因）；**SHALL NOT** 以回退產品程式碼或改斷言製造紅燈。指令：`pnpm --filter ./nextjs-pickball exec playwright test --workers=1 tests/e2e/specs/auth-session.spec.ts`（前後清殘留 process）
- [ ] 6.3 窄螢幕判定：若「窄螢幕下帳號入口與五個導航連結皆完整落在視口內」失敗，或既有 `navbar-rwd.spec.ts` 在 `.dev.vars` 齊備時失敗——**停止並依 execution-plan Escalation 升級**，附 1.5 的量測與失敗截圖，SHALL NOT 自行改動既有連結、文案或斷點
- [ ] 6.4 驗收（指令）C3：storage state 檔存在、含 session cookie、`git status --porcelain` 不列出
- [ ] 6.5 驗收（指令）C4：停掉所有 dev server、暫時移除 `.dev.vars`，跑 `api-health.spec.ts`＋`auth-session.spec.ts`：exit 0、api-health 通過、auth-session 全 skipped 且原因含 `TEST_ACCOUNT_`；還原 `.dev.vars` 並停掉 server（`reuseExistingServer` 會沿用舊 server，因此前後都要確認 3005／8787 無殘留）
- [ ] 6.6 驗收（指令）C5：`playwright.config.ts` 五個 project 與 top-level `use` 無 `storageState`

## 7. 文件同步與總驗收

Depends on: §6

- [ ] 7.1 設定層（文件）：`nextjs-pickball/CLAUDE.md`：架構總覽補 `/login`（本機測試帳號登入頁，不在 navbar 的 `NAV_LINKS`，由帳號圖示進入）；目錄約定的 hooks 歸屬補 `auth：useSession`、`lib/` 補 `auth/`；測試架構補 E2E 登入夾具（`globalSetup`、`.auth/`、缺 `.dev.vars` 時 skip）；**不動**「matchmaker 為 LocalStorage-only」敘述（B5／B6 才改）
- [ ] 7.2 驗收（指令）C1：`pnpm -r exec tsc --noEmit` exit 0；`pnpm --filter ./hono-pickball typecheck` exit 0；`pnpm --filter ./nextjs-pickball lint` 0 errors 且 warning 不多於基線
- [ ] 7.3 驗收（指令）：`pnpm test` 全綠；前端檔數／測試數 = 基線＋本 change 新增（6 檔、22 測試：session-client 5、session-store 3、useSession 2、AccountEntry 4、page 1、LoginForm 7，再加既有 hooksInventory 不變）；後端不變；`git diff main --stat -- pnpm-lock.yaml '**/package.json'` 為空
- [ ] 7.4 驗收（指令）C2：`.dev.vars` 齊備下完整 E2E `pnpm --filter ./nextjs-pickball exec playwright test --workers=1`（前後清殘留）：既有 test 全數原樣通過（passed／skipped 數與基線相同，另加 B2 的 auth-proxy 與本 change 的 auth-session）；結果寫在本 task 後方。失敗不得自行判定為雜訊
- [ ] 7.5 `DO_NOT_TRACK=1 openspec validate auth-frontend-session --strict` 通過
