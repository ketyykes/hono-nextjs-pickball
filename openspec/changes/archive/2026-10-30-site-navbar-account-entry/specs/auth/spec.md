# Specification: auth

## MODIFIED Requirements

### Requirement: 本機測試帳號登入頁

`/login` SHALL 由 `nextjs-pickball/app/login/page.tsx` 提供，匯出 `metadata` 且 `robots.index` 為 `false`（本機開發用頁面，不進搜尋索引），
不列入 `SiteNavbar` 的 `NAV_LINKS`。頁面內容由 `nextjs-pickball/components/auth/LoginForm.tsx` 依 `useSession` 呈現：

- `loading`：不顯示表單（避免閃現）。
- `authEnabled === false`：顯示「此環境未開放登入」，SHALL NOT 顯示任何輸入欄位。
- 已登入：顯示「已登入：<name>」、回首頁的連結與「登出」按鈕，不顯示表單。點擊「登出」後呼叫 `signOut()`，再呼叫 store 的 `refresh()`，停留在 `/login`
  （navbar 的帳號入口於所有寬度皆提供登出，見 `site-navbar`「navbar 帳號入口於各寬度可見且預留固定寬度」；本頁的「登出」按鈕保留為第二個入口）。
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

#### Scenario: 已登入時可於登入頁登出

- **GIVEN** `useSession` 回傳已登入，`signOut` 回傳 `true`
- **WHEN** 渲染 `LoginForm` 並點擊「登出」按鈕
- **THEN** `signOut` 被呼叫一次，之後 store 的 `refresh` 被呼叫一次；`router.replace` 未被呼叫
- **驗收**：`nextjs-pickball/components/auth/LoginForm.test.tsx`，it 名稱「已登入時於登入頁點擊登出後呼叫 signOut 並重新取得 session」

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

- **GIVEN** 前後端 dev server 皆已啟動，`.dev.vars` 齊備，測試帳號已 seed，瀏覽器為訪客，viewport 寬度 >= 640px
- **WHEN** 開啟 `/login`，填入測試帳號並按「登入」
- **THEN** 導向 `/`，navbar 出現名稱為「登出」的按鈕
- **驗收**：`nextjs-pickball/tests/e2e/specs/auth-session.spec.ts`，test 名稱「以測試帳號登入後 navbar 顯示登出」

#### Scenario: 錯誤密碼在登入頁顯示錯誤

- **GIVEN** 同上
- **WHEN** 以錯誤密碼登入
- **THEN** 停留在 `/login`，顯示「帳號或密碼錯誤」
- **驗收**：`nextjs-pickball/tests/e2e/specs/auth-session.spec.ts`，test 名稱「帳號或密碼錯誤時登入頁顯示錯誤訊息」

#### Scenario: 重整後仍維持登入

- **GIVEN** 以 `globalSetup` 產生的 `storageState` 開啟頁面（已登入），viewport 寬度 >= 640px
- **WHEN** 開啟 `/` 後重新整理
- **THEN** 重整前後 navbar 皆顯示「登出」按鈕
- **驗收**：`nextjs-pickball/tests/e2e/specs/auth-session.spec.ts`，test 名稱「重整後仍維持登入」

#### Scenario: 登出後回到訪客

- **GIVEN** 以登入頁登入（獨立的新 session，不使用共用 `storageState`），viewport 寬度 >= 640px
- **WHEN** 按 navbar 的「登出」
- **THEN** navbar 改為顯示「登入」連結；重新整理後仍為「登入」
- **驗收**：`nextjs-pickball/tests/e2e/specs/auth-session.spec.ts`，test 名稱「登出後 navbar 回到登入入口」

#### Scenario: 窄螢幕下經由登入頁登入與登出

- **GIVEN** 前後端 dev server 皆已啟動，`.dev.vars` 齊備，瀏覽器為訪客（獨立的新 session），viewport 寬度 390px
- **WHEN** 開啟 `/login` 以測試帳號登入；再開啟 `/login` 按「登出」
- **THEN** 登入後導向 `/` 且 header 內顯示名稱為「登出」的按鈕、不顯示「登入」連結；回到 `/login` 時 `main` 內顯示「已登入：<name>」與「登出」按鈕；按 `main` 內的「登出」後顯示「電子郵件」欄位，重新整理後仍為登入表單
- 斷言 MUST 以 `main` 或 `header` 限定範圍：登入頁已登入時 header 與 `main` 各有一個「登出」按鈕，未限定範圍會同時比對到兩個
- **驗收**：`nextjs-pickball/tests/e2e/specs/auth-session.spec.ts`，test 名稱「窄螢幕下可經由登入頁登入與登出」
