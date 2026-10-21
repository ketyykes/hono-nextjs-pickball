## ADDED Requirements

### Requirement: navbar 顯示帳號入口

`SiteNavbar` SHALL 在 `<nav>` 之後渲染 `nextjs-pickball/components/layout/AccountEntry.tsx`，依 `useSession` 呈現三種狀態：

- `status === "loading"` 或 `authEnabled === false`：**不渲染任何元素**（不佔寬度）。正式站與沒有 `.dev.vars` 的環境因此與本 change 之前逐像素相同。
- 啟用且未登入：一個指向 `/login` 的連結，內容為 `lucide-react` 的 `LogIn` 圖示，可及名稱（accessible name）為「登入」。
- 已登入：一個按鈕，內容為 `lucide-react` 的 `LogOut` 圖示，可及名稱為「登出」，`title` 為「已登入：<name>」。
  點擊後呼叫 `signOut()`，再呼叫 store 的 `refresh()`；停留在目前頁面。

帳號入口 SHALL NOT 列入 `NAV_LINKS`，`/login` 亦 SHALL NOT 列入（`NAV_LINKS` 僅含公開內容路由的既有約束不變）。
入口元素 MUST 套用 `whitespace-nowrap` 與 `shrink-0`，圖示 MUST 為 `aria-hidden`，可及名稱由 `aria-label` 提供（`emoji-free-ui`：通用記號用 `lucide-react`）。

視口寬度 **< `sm`（640px）** 時帳號入口 MUST 隱藏（以 Tailwind 的 `hidden sm:inline-flex` 表達，SHALL NOT 以 JS 量測視口寬度），`>= sm` 時顯示。
窄螢幕下的登入與登出改由直接造訪 `/login` 提供（見 `auth`「本機測試帳號登入頁」）。
「窄螢幕導航呈現」Requirement 的五個連結呈現（可見性、不換行、320px 完整落在視口內、`< 375px` 隱藏 logo）與其 className **零變更**。

> **為什麼窄螢幕隱藏入口**（2026-10-21 人類裁決，design Open Questions 第 9 條）：實測 320px 下入口超出視口 10px、375px 超出 11px、
> 390px 只剩 4px；要塞進去就得改動既有五個連結的間距或內距。框架標準斷點 `sm` 比自訂 390px 穩定。
> 行動裝置的登入入口記為 G1 待辦（G1 改為 Google 登入時重新設計），本 change 不處理。

專注模式（`html.sb-focus`）下入口隨 header 一起隱藏，不需額外處理。

#### Scenario: 載入中或未啟用時不渲染

- **GIVEN** `useSession` 分別回傳 `{ status: "loading" }` 與 `{ status: "ready", authEnabled: false, user: null }`
- **WHEN** 渲染 `AccountEntry`
- **THEN** 兩種情況的 container 皆為空（無任何子元素）
- **驗收**：`nextjs-pickball/components/layout/AccountEntry.test.tsx`，it 名稱「載入中或未啟用時不渲染任何元素」

#### Scenario: 帳號入口於 sm 以下隱藏

- **GIVEN** `useSession` 分別回傳啟用且未登入、已登入
- **WHEN** 渲染 `AccountEntry`
- **THEN** 登入連結與登出按鈕的 class 皆含 `hidden` 與 `sm:inline-flex`
- **驗收**：`nextjs-pickball/components/layout/AccountEntry.test.tsx`，it 名稱「登入連結與登出按鈕在 sm 以下隱藏」

#### Scenario: 未登入時顯示登入連結

- **GIVEN** `useSession` 回傳啟用且 `user` 為 null
- **WHEN** 渲染 `AccountEntry`
- **THEN** 存在名稱為「登入」的連結，`href === "/login"`，class 含 `whitespace-nowrap`，內含一個 `aria-hidden="true"` 的 `svg`
- **驗收**：`nextjs-pickball/components/layout/AccountEntry.test.tsx`，it 名稱「啟用且未登入時顯示指向 /login 的登入連結」

#### Scenario: 已登入時顯示登出按鈕

- **GIVEN** `useSession` 回傳已登入、`name` 為「測試員」
- **WHEN** 渲染 `AccountEntry`
- **THEN** 存在名稱為「登出」的按鈕，`title` 為「已登入：測試員」，class 含 `whitespace-nowrap`；不存在「登入」連結
- **驗收**：`nextjs-pickball/components/layout/AccountEntry.test.tsx`，it 名稱「已登入時顯示登出按鈕且 title 含使用者名稱」

#### Scenario: 點擊登出後重新取得 session

- **GIVEN** 已登入，`signOut` 回傳 `true`
- **WHEN** 點擊「登出」
- **THEN** `signOut` 被呼叫一次，之後 store 的 `refresh` 被呼叫一次
- **驗收**：`nextjs-pickball/components/layout/AccountEntry.test.tsx`，it 名稱「點擊登出後呼叫 signOut 並重新取得 session」

#### Scenario: 未登入時 navbar 顯示登入入口並可前往登入頁

- **GIVEN** 前後端 dev server 皆已啟動、`.dev.vars` 齊備，瀏覽器為訪客，viewport 寬度 >= 640px
- **WHEN** 開啟 `/` 並點擊 navbar 的「登入」
- **THEN** 導向 `/login` 並顯示「電子郵件」欄位
- **驗收**：`nextjs-pickball/tests/e2e/specs/auth-session.spec.ts`，test 名稱「未登入時 navbar 顯示登入入口並可前往登入頁」

#### Scenario: 窄螢幕下隱藏帳號入口且不影響既有導航連結

- **GIVEN** `.dev.vars` 齊備，瀏覽器為訪客（啟用且未登入）
- **WHEN** viewport 分別為 320px、375px、390px，再改為 640px 與 1280px
- **THEN** 前三種寬度下 header 內「登入」連結為 hidden，「首頁」「完整體驗」「計分板」「測驗」「對戰分配」五個連結皆以 `toBeInViewport({ ratio: 1 })` 完整落在視口內，且高度不高於 1280px 下的高度＋4px；
  640px 與 1280px 下「登入」連結可見、完整落在視口內，且右緣不小於「對戰分配」右緣（位於 `<nav>` 之後）
- **驗收**：`nextjs-pickball/tests/e2e/specs/auth-session.spec.ts`，test 名稱「窄螢幕下隱藏帳號入口且五個導航連結皆完整落在視口內」
