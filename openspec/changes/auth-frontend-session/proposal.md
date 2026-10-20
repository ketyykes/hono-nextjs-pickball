# Proposal: auth-frontend-session

## Why

runbook B3：B2（`auth-backend-test-account`）已讓後端能以本機測試帳號登入，但前端還沒有任何入口——
使用者無法登入、看不到自己是否已登入、也無法登出；Wave 2 的「訪客走 LocalStorage、登入走 API」分支更需要一個
前端共用的 session 狀態來源。本 change 補上登入頁、session hook、navbar 的登入狀態與登出，以及讓 E2E 能以登入態測試的夾具（D6）。

**前提**：B2 已合併回 `main` 並 archive（`/api/session`、`/api/auth/sign-in/email`、`/api/auth/sign-out`、`db:seed:local`、
`nextjs-pickball/tests/e2e/helpers/test-account.ts` 皆來自 B2）。

**硬性約束**：未登入（訪客）路徑**既有行為與既有 E2E 零迴歸**（runbook「使用者已定案」第 3 條）。

## What Changes

- 新增 `nextjs-pickball/lib/auth/`：
  - `session-client.ts`：`fetchSession()`（`GET /api/session`，任何失敗一律降級為「未啟用、未登入」）、
    `signInWithEmail()`（`POST /api/auth/sign-in/email`，把 401／404／其他失敗對應成三種結果）、`signOut()`（`POST /api/auth/sign-out`）。
  - `session-store.ts`：全頁共用的 session 外部 store（第一次訂閱時才請求、多個訂閱者共用一次請求、`refresh()` 通知所有訂閱者）。
- 新增 `nextjs-pickball/hooks/useSession.ts`：以 `useSyncExternalStore` 讀 store；server snapshot 固定為「載入中」，避免 hydration mismatch。
- 新增 `nextjs-pickball/components/layout/AccountEntry.tsx`，掛進 `SiteNavbar`：載入中或未啟用時**不渲染任何東西**
  （正式站與無 `.dev.vars` 的環境與現在逐像素相同）；啟用且未登入時為圖示連結「登入」→ `/login`；已登入時為圖示按鈕「登出」。
- 新增 `/login`：`nextjs-pickball/app/login/page.tsx`（`robots.index: false`）＋`components/auth/LoginForm.tsx`
  （只有測試帳號 email／password 表單；未啟用時顯示「此環境未開放登入」；G1 再加 Google 按鈕）。
- 「是否顯示登入入口」的訊號來源定案為後端 `GET /api/session` 的 `authEnabled`（runbook B3 建議由後端回報，不另設 build-time 變數）。
- E2E 夾具（D6）：`playwright.config.ts` 加 `globalSetup`（`tests/e2e/global-setup.ts`：重用 B2 helper 執行 migration＋seed、以 API 登入一次並存
  `tests/e2e/.auth/test-account.json`）；**既有五個 project 的 `use` 不變**（仍為訪客）；新 spec `auth-session.spec.ts` 以 `test.use({ storageState })` 取用。
  `nextjs-pickball/.gitignore` 加入 `/tests/e2e/.auth/`。
- `SiteNavbar.test.tsx` 只新增一行 `vi.mock("@/hooks/useSession", …)`（避免單元測試發出真實網路請求），**不改任何既有 it 的斷言**。
- hooks 歸屬清單新增 `useSession → auth`（`pickleball-guide-page` MODIFIED；`hooksInventory.test.ts` 直接讀主 spec，apply 時依 M14 前例經 tasks 授權同步主 spec 該行）。

### 明確不做

- Google 登入按鈕、帳號連結（G1）；任何使用者資料的讀寫或匯入（B5～B9）。
- 不新增 npm 相依（**不**在前端安裝 better-auth，見 design Decision 1）。
- D6 的「每個 spec 開頭清空測試帳號的使用者資料」：本 change 沒有任何使用者資料表，留給 Wave 2 第一個有資料的 change 實作。

## Capabilities

### New Capabilities

（無。前端 session 行為併入 B2 建立的 `auth` capability。）

### Modified Capabilities

- `auth`：ADDED 前端 session 狀態來源（client／store／`useSession`）、登入頁。
- `site-navbar`：ADDED「navbar 顯示帳號入口」（訪客／已登入／未啟用三態、窄螢幕不得擠出既有五個連結）。
- `pickleball-guide-page`：MODIFIED「互動行為由三支 hooks 提供且各有 smoke test」——歸屬清單加入 `useSession → auth`。
- `dev-workflow`：ADDED「E2E 登入夾具」（`globalSetup`＋`storageState`、缺 `.dev.vars` 時的 skip 規則）。

## Impact

- **程式碼**：`nextjs-pickball/{lib/auth/**, hooks/useSession.ts(+test), components/layout/AccountEntry.tsx(+test),
  components/layout/SiteNavbar.tsx, components/layout/SiteNavbar.test.tsx（只加 mock）, components/auth/**, app/login/**,
  playwright.config.ts, tests/e2e/{global-setup.ts, specs/auth-session.spec.ts}, .gitignore, CLAUDE.md}`、
  `openspec/specs/pickleball-guide-page/spec.md`（僅 tasks 授權的歸屬清單一行）。**不動** `hono-pickball/**`。
- **行為**：每次整頁載入，navbar 會對 `/api/session` 發一次請求（永遠 200，訪客無 console 錯誤）。
  無 `.dev.vars` 的環境（含正式站）`authEnabled` 為 false，navbar 與現在完全相同。
- **E2E**：開發者本機有 `.dev.vars` 時，所有既有 E2E 的 navbar 會多出「登入」圖示——**窄螢幕排版餘裕是本 change 最大風險**
  （390px 下現有餘裕約 28px，見 design Risks），既有 `navbar-rwd.spec.ts` 必須在 `.dev.vars` 齊備的狀態下原樣通過。
- **相依**：無新增。
