# Test Plan: auth-frontend-session

> **RED-phase 承諾書**。只寫「先寫哪些測試、斷言什麼、為什麼先寫」，不寫實作邏輯。
>
> Tier：
> - `unit`：`lib/auth/**` 的純 I/O 函式與 store（`fetch` 以 `vi.stubGlobal` 替換）、`app/login/page.tsx` 的 metadata 匯出。Vitest＋happy-dom。
> - `integration`：`hooks/useSession.ts`（`renderHook`／`renderToString`）、`components/layout/AccountEntry.tsx`、`components/auth/LoginForm.tsx`
>   （`@testing-library/react`＋`user-event`，mock `@/hooks/useSession`、`@/lib/auth/session-client`、`next/navigation`）。
> - `e2e`：Playwright，`tests/e2e/specs/auth-session.spec.ts`，前後端兩個 dev server＋`.dev.vars` 齊備＋`globalSetup`。
>
> 單檔指令：`pnpm --filter ./nextjs-pickball test --run <path>`（`--run` 前不可加 `--`）；E2E：`pnpm --filter ./nextjs-pickball exec playwright test --workers=1 <path>`。
> **it／test 名稱 MUST 與 delta spec「驗收」錨點逐字一致。** `describe`／`it`／`expect`／`vi` MUST 顯式自 `vitest` 匯入。
>
> **後端 API 授權覆蓋**：本 change 不新增後端端點（N/A）；前端呼叫的端點授權已由 B2 覆蓋。

## auth

### Requirement: 前端以 /api/session 作為登入狀態的唯一來源

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| fetchSession 於 200 且形狀正確時回傳 authEnabled 與 user | 回應正確時原樣回傳 | 假 fetch 回 200＋已登入 JSON → 回傳深度相等 | golden path；模組不存在時真紅燈 | unit |
| fetchSession 於非 200、形狀不符或網路錯誤時回傳未啟用且不拋錯 | 任何失敗都降級為未啟用 | 500／非 JSON／`authEnabled:"yes"`／fetch reject 四種 → 皆 `{ authEnabled:false, user:null }`，不 reject | edge case：fail-closed 是訪客零迴歸的保證（Decision 2） | unit |

### Requirement: 前端登入與登出的請求契約

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| signInWithEmail 以 JSON POST 至 /api/auth/sign-in/email | 登入請求的形狀 | fetch 呼叫一次；URL、method、`Content-Type`、`JSON.parse(body)` 皆符合 | golden path：與 B2 契約對齊的唯一防線 | unit |
| signInWithEmail 依狀態碼回傳 ok、invalid-credentials、unavailable 或 failed | 登入結果對應 | 200／401／404／500／reject → 依序五個結果 | edge case：每個狀態碼分支各一 | unit |
| signOut 以 POST 呼叫 /api/auth/sign-out 並回傳是否成功 | 登出請求的形狀與結果 | method POST、URL 正確；200→true、500→false | golden path | unit |

### Requirement: 全頁共用的 session store 與 useSession

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| 初始為 loading，第一次訂閱後取得 session 並轉為 ready | 初始為 loading，第一次訂閱後轉為 ready | 初始快照 `{status:"loading"}`；訂閱後 await → ready 且 listener 被呼叫 | golden path | unit |
| 請求完成前的多個訂閱者只觸發一次請求 | 多個訂閱者共用一次請求 | 連續訂閱三次 → 假 `fetchSession` 呼叫次數 1 | edge case：navbar 與登入頁同時掛載時不得重複請求 | unit |
| refresh 重新取得 session 並通知所有訂閱者 | refresh 重新取得並通知 | ready 後改假函式回傳 → `refresh()` → 呼叫次數 2、兩個 listener 皆被通知、快照 user 更新 | golden path：登入／登出後 UI 同步的機制 | unit |
| useSession 回傳 store 快照並隨 refresh 更新 | useSession 隨 store 更新 | `renderHook` → loading → ready → `act(refresh)` → 新 user | golden path（React 綁定） | integration |
| 伺服器端 render 時 useSession 為 loading 且不發請求 | 伺服器端 render 為 loading | `renderToString(<Probe/>)` 含 `loading`；假 `fetchSession` 呼叫次數 0 | edge case：hydration mismatch 的源頭 | integration |

### Requirement: 本機測試帳號登入頁

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| /login 匯出 metadata 且 robots.index 為 false | 登入頁不進搜尋索引 | `metadata.robots` 含 `index:false`、`title` 非空 | 例外層頁面唯一可單元測的部分（比照 `/health`） | unit |
| 載入中不顯示表單也不顯示未開放訊息 | 載入中不顯示表單也不顯示未開放訊息 | loading → 無密碼欄位、無「此環境未開放登入」 | edge case：避免載入瞬間閃現錯誤訊息或表單 | integration |
| 未啟用時顯示此環境未開放登入且不顯示表單 | 未啟用時不顯示表單 | 文字可見；`queryAllByRole("textbox")` 為空、無 `input[type=password]` | edge case：正式站情境 | integration |
| 已登入時顯示已登入訊息且不顯示表單 | 已登入時不顯示表單 | 「已登入：測試員」可見；連結 href `/`；無密碼欄位 | edge case | integration |
| 送出正確帳密後重新取得 session 並導向首頁 | 登入成功後導向首頁 | `user.type` 兩欄＋點「登入」→ `signInWithEmail` 以輸入值被呼叫、`refresh` 被呼叫、`router.replace("/")` | golden path | integration |
| 帳密錯誤時顯示帳號或密碼錯誤並清空密碼 | 帳密錯誤時顯示錯誤並清空密碼 | `role=alert` 文字相符；email 欄保留、密碼欄空；`replace` 未呼叫 | edge case | integration |
| unavailable 與 failed 分別顯示對應訊息 | 其他失敗顯示對應訊息 | 兩次送出 → 兩種文字 | edge case：每個失敗分支各一 | integration |
| 送出期間登入按鈕為 disabled | 送出期間按鈕為 disabled | pending promise → 按鈕 disabled；resolve 後 enabled | edge case：防重複送出 | integration |
| 以測試帳號登入後 navbar 顯示登出 | 以測試帳號經由登入頁登入 | 訪客 context：`/login` 填帳密 → URL 為 `/`，`getByRole("button",{name:"登出"})` 可見 | golden path（端到端）：runbook 驗收「新 E2E 覆蓋登入」 | e2e |
| 帳號或密碼錯誤時登入頁顯示錯誤訊息 | 錯誤密碼在登入頁顯示錯誤 | 錯誤密碼 → URL 仍為 `/login`，「帳號或密碼錯誤」可見 | edge case（端到端） | e2e |
| 重整後仍維持登入 | 重整後仍維持登入 | `storageState` → `/` 見「登出」→ `reload()` → 仍見「登出」 | golden path：runbook 驗收「重整後仍登入」 | e2e |
| 登出後 navbar 回到登入入口 | 登出後回到訪客 | 新 context UI 登入 → 點「登出」→ 見「登入」連結 → `reload()` 仍為「登入」 | golden path：runbook 驗收「登出」；reload 證明 session 真的被撤銷而非只改 UI | e2e |

## site-navbar

### Requirement: navbar 顯示帳號入口

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| 載入中或未啟用時不渲染任何元素 | 載入中或未啟用時不渲染 | 兩種 mock 狀態 → `container.childElementCount === 0` | golden path（訪客零迴歸）：正式站情境 | integration |
| 啟用且未登入時顯示指向 /login 的登入連結 | 未登入時顯示登入連結 | 名稱「登入」的 link、href、`whitespace-nowrap`、`svg[aria-hidden=true]` | golden path | integration |
| 已登入時顯示登出按鈕且 title 含使用者名稱 | 已登入時顯示登出按鈕 | 名稱「登出」的 button、`title` 相符、`whitespace-nowrap`；無「登入」連結 | golden path | integration |
| 點擊登出後呼叫 signOut 並重新取得 session | 點擊登出後重新取得 session | `signOut` 1 次，之後 `refresh` 1 次（以呼叫順序斷言） | golden path：登出不刷新會留下過期的登出鈕 | integration |
| 未登入時 navbar 顯示登入入口並可前往登入頁 | 未登入時 navbar 顯示登入入口並可前往登入頁 | 訪客 `/` → 點「登入」→ URL `/login`、「電子郵件」欄可見 | golden path（端到端） | e2e |
| 窄螢幕下帳號入口與五個導航連結皆完整落在視口內 | 窄螢幕下帳號入口不擠出既有導航連結 | 1280 量五連結高度 → 320、390 兩寬度下「登入」與五連結 `toBeInViewport({ratio:1})`，五連結高度 ≤ 寬螢幕＋4（只跑 chromium，比照 `navbar-rwd.spec.ts`） | edge case：本 change 最大風險（Risks 第 1 條） | e2e |

## pickleball-guide-page

### Requirement: 互動行為由三支 hooks 提供且各有 smoke test

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| hooks 目錄下每支 hook 都能在規格的歸屬清單中找到 | hooks 目錄的每支 hook 都在歸屬清單內 | 既有 it：新增 `useSession.ts` 後**真的轉紅**（主 spec 尚無 `useSession`），經 tasks 授權同步主 spec 該行後轉綠 | 既有守衛的真紅燈（M14 前例） | unit |
| 歸屬清單提及的每個 hook 名稱都有對應檔案 | 歸屬清單提及的 hook 都有對應檔案 | 既有 it，原樣通過 | regression guard | unit |

## dev-workflow

### Requirement: E2E 登入夾具

指令驗收 C3～C5（見下表）。`auth-session.spec.ts` 的 e2e 列同時是本 Requirement 的端到端證據（storage state 可用）。

## 指令驗收（非 Vitest，tasks 中標為「驗收（指令）」）

| 編號 | 對應 Scenario | 指令／動作 | 通過條件 |
|------|---------------|-----------|----------|
| C1 | （型別與 lint） | `pnpm -r exec tsc --noEmit`；`pnpm --filter ./nextjs-pickball lint` | exit 0；0 errors、warning 不多於基線 |
| C2 | （訪客零迴歸） | `.dev.vars` 齊備下完整 E2E `pnpm --filter ./nextjs-pickball exec playwright test --workers=1` | 既有 test 全數原樣通過；`auth-session.spec.ts` 除「窄螢幕…」在非 chromium project 的預期 skip 外全數 passed，沒有任何因缺帳密而 skip 的 test |
| C3 | 帳密齊備時產生 storage state | 跑 `auth-session.spec.ts` 後檢查 `tests/e2e/.auth/test-account.json` 與 `git status --porcelain` | 檔案存在、含 session cookie；git 不列出 |
| C4 | 缺帳密時既有 E2E 照常執行、登入 spec 明確 skip | 停掉所有 dev server、暫時移除 `.dev.vars`，跑 `api-health.spec.ts`＋`auth-session.spec.ts`，結束後還原並停掉 server | exit 0；api-health 通過；auth-session 全 skipped、原因含 `TEST_ACCOUNT_` |
| C5 | 既有 project 維持訪客 | 閱讀 `playwright.config.ts` | 五個 project 與 top-level `use` 皆無 `storageState` |

---

## Checklist

- [x] Every requirement has at least one matching test
- [x] Every Scenario (####) has at least one matching test or command check
- [x] Every row has a Tier value (unit | integration | e2e)
- [x] Test names match spec anchors verbatim
