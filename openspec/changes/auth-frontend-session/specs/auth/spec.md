## ADDED Requirements

### Requirement: 前端以 /api/session 作為登入狀態的唯一來源

`nextjs-pickball/lib/auth/session-client.ts` SHALL 提供 `fetchSession()`：以 `GET /api/session`（same-origin）取得
`{ authEnabled, user }`。回應為 200 且形狀符合（`authEnabled` 為布林、`user` 為 `null` 或含字串 `id`／`email`／`name` 的物件）時原樣回傳；
**任何其他情況**（非 200、JSON 解析失敗、形狀不符、網路錯誤）MUST 回傳 `{ authEnabled: false, user: null }` 且 SHALL NOT throw——
登入狀態取不到時一律當作「未啟用」，訪客介面維持現狀（fail-closed）。

前端 SHALL NOT 讀取或依賴 session cookie 的名稱或內容（HttpOnly，且 G1 改用 https 後名稱會變成 `__Secure-` 前綴）。
前端 SHALL NOT 以 build-time 環境變數判斷是否顯示登入入口——唯一訊號是 `authEnabled`。

#### Scenario: 回應正確時原樣回傳

- **WHEN** `/api/session` 回 200 與 `{ "authEnabled": true, "user": { "id": "u1", "email": "a@example.com", "name": "A" } }`
- **THEN** `fetchSession()` 回傳同一個物件內容
- **驗收**：`nextjs-pickball/lib/auth/session-client.test.ts`，it 名稱「fetchSession 於 200 且形狀正確時回傳 authEnabled 與 user」

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
- 已登入：顯示「已登入：<name>」與回首頁的連結，不顯示表單。
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

- **GIVEN** 前後端 dev server 皆已啟動，`.dev.vars` 齊備，測試帳號已 seed，瀏覽器為訪客
- **WHEN** 開啟 `/login`，填入測試帳號並按「登入」
- **THEN** 導向 `/`，navbar 出現名稱為「登出」的按鈕
- **驗收**：`nextjs-pickball/tests/e2e/specs/auth-session.spec.ts`，test 名稱「以測試帳號登入後 navbar 顯示登出」

#### Scenario: 錯誤密碼在登入頁顯示錯誤

- **GIVEN** 同上
- **WHEN** 以錯誤密碼登入
- **THEN** 停留在 `/login`，顯示「帳號或密碼錯誤」
- **驗收**：`nextjs-pickball/tests/e2e/specs/auth-session.spec.ts`，test 名稱「帳號或密碼錯誤時登入頁顯示錯誤訊息」

#### Scenario: 重整後仍維持登入

- **GIVEN** 以 `globalSetup` 產生的 `storageState` 開啟頁面（已登入）
- **WHEN** 開啟 `/` 後重新整理
- **THEN** 重整前後 navbar 皆顯示「登出」按鈕
- **驗收**：`nextjs-pickball/tests/e2e/specs/auth-session.spec.ts`，test 名稱「重整後仍維持登入」

#### Scenario: 登出後回到訪客

- **GIVEN** 以登入頁登入（獨立的新 session，不使用共用 `storageState`）
- **WHEN** 按 navbar 的「登出」
- **THEN** navbar 改為顯示「登入」連結；重新整理後仍為「登入」
- **驗收**：`nextjs-pickball/tests/e2e/specs/auth-session.spec.ts`，test 名稱「登出後 navbar 回到登入入口」
