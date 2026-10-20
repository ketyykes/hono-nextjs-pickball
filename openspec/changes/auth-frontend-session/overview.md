# Overview: auth-frontend-session（B3）

## Scope

讓前端看得到登入：navbar 右側多一個圖示入口（訪客為「登入」、已登入為「登出」），新增 `/login` 測試帳號登入頁，
以及全站共用的 `useSession`。另加 Playwright 登入夾具，讓 E2E 能以登入態測試。
沒有 `.dev.vars` 的環境（含正式站）一切與現在相同。

- **規模：large**——影響 4 個 capability（`auth`、`site-navbar`、`pickleball-guide-page`、`dev-workflow`），tasks 超過 20 項。
- **前端需求**：是 → 附 UI Mockups。
- **DB 結構**：否。
- **資料遷移**：否。
- **跨元件流程**：是。navbar 掛載 → store 請求 `/api/session` → 登入頁送出 → 通知所有訂閱者；E2E 的 webServer → globalSetup → spec → 附 Sequence Diagram。

## What Changes

- `lib/auth/session-client.ts`、`lib/auth/session-store.ts`、`hooks/useSession.ts`
- `components/layout/AccountEntry.tsx`（掛進 `SiteNavbar`）、`components/auth/LoginForm.tsx`、`app/login/page.tsx`
- `playwright.config.ts` 的 `globalSetup`、`tests/e2e/global-setup.ts`、`tests/e2e/specs/auth-session.spec.ts`、`.gitignore`
- hooks 歸屬清單加 `useSession → auth`

```
=== Before ===                          === After ===
navbar: logo + 5 連結                   navbar: logo + 5 連結 + [帳號入口]
                                                 (未啟用/載入中: 不渲染)
/login: 404                             /login: 測試帳號登入表單 (noindex)
登入狀態: 無                            useSession() <- store <- /api/session
E2E: 全訪客                             E2E: 既有全訪客 + auth-session (storageState)
```

## UI Mockups

窄螢幕（390px）navbar，入口為單一圖示；寬螢幕同一位置。

```
=== State 1: 未啟用 / 載入中（正式站、無 .dev.vars）— 與現在相同 ===
┌──────────────────────────────────────────────────────┐
│ [◎]        首頁 完整體驗 計分板 測驗 對戰分配        │
└──────────────────────────────────────────────────────┘

=== State 2: 啟用、訪客 ===
┌──────────────────────────────────────────────────────┐
│ [◎]      首頁 完整體驗 計分板 測驗 對戰分配 [→]      │ ← [→]=LogIn
└──────────────────────────────────────────────────────┘      aria-label 登入
                                                │ 點擊
                                                ▼
=== State 3: /login 表單 ===
┌──────────────────────────────┐
│ 本機測試帳號登入               │
│ 電子郵件 [__________________] │
│ 密碼     [__________________] │
│ [登入]                         │
└──────────────────────────────┘
        │ 送出中: [登入]░░░░ (disabled)
        ├─ 401 ─► ┌──────────────────────────┐
        │         │ ! 帳號或密碼錯誤 (alert)  │  email 保留、密碼清空
        │         └──────────────────────────┘
        ├─ 404 ─► 此環境未開放登入
        ├─ 其他 ─► 登入失敗，請稍後再試
        ▼ 200 → refresh() → router.replace("/")

=== State 4: 已登入 ===
┌──────────────────────────────────────────────────────┐
│ [◎]      首頁 完整體驗 計分板 測驗 對戰分配 [↪]      │ ← [↪]=LogOut
└──────────────────────────────────────────────────────┘      aria-label 登出
                                                │             title 已登入：名稱
                                                ▼ 點擊 → signOut → refresh
                                          回到 State 2

=== State 5: /login 在未啟用環境 ===
┌──────────────────────────────┐
│ 此環境未開放登入               │   (無任何輸入欄位)
└──────────────────────────────┘
```

## Architecture

```
 SiteNavbar ──► AccountEntry ──┐
 /login ──────► LoginForm ─────┤ useSession()  (useSyncExternalStore)
 (Wave 2 儲存層) ──────────────┘      │
                                      ▼
                         lib/auth/session-store.ts
                          subscribe / getSnapshot / refresh
                                      │ 第一次訂閱、refresh
                                      ▼
                         lib/auth/session-client.ts
              fetchSession ─► GET  /api/session        (永遠 200)
              signInWithEmail ► POST /api/auth/sign-in/email
              signOut ──────► POST /api/auth/sign-out
                                      │ same-origin
                                      ▼
                     app/api/[[...route]] ─HONO_API─► hono-pickball (B2)
```

## Sequence Diagram

登入流程與 E2E 夾具。

```
Browser      AccountEntry   store        client        Next proxy→Hono
  │ 載入頁面 │               │             │                 │
  │─────────►│ subscribe ───►│ fetchSession│                 │
  │          │               │────────────►│ GET /api/session│
  │          │               │◄── {authEnabled:true,user:null}
  │          │◄── ready ─────│  → 顯示 [登入]                │
  │ /login 送出帳密           │             │                 │
  │─────────────────────────────────────────►POST sign-in ───►│
  │          │               │             │◄── 200 Set-Cookie│
  │          │               │◄─ refresh() │ GET /api/session │
  │          │◄── user ──────│  → 顯示 [登出]、replace("/")  │
  │          │  失敗分支: fetch 失敗 → authEnabled:false → 不渲染

Playwright:  webServer(8787,3005) 啟動
             └► globalSetup: readTestAccount()
                  ├ null ─► warn、刪舊 state、結束 (auth spec 會 skip)
                  └ ok ──► migrate+seed ─► API 登入 ─► .auth/test-account.json
             └► specs: 既有(訪客)  /  auth-session(test.use storageState)
```

## Task Tree

```
§1 對齊 main（B2 已合併）＋Context7 查證
 └─ §2 session-client（unit）
     └─ §3 session-store＋useSession（＋hooks 歸屬清單）
         ├─ §4 AccountEntry＋掛進 SiteNavbar
         └─ §5 LoginForm＋/login
             └─ §6 E2E 夾具與 auth-session.spec（需要 §4、§5）
                 └─ §7 文件與總驗收（含完整 E2E 回歸）
```

## Cross-Cutting Impact

| 檔案／模組 | §2 | §3 | §4 | §5 | §6 | §7 |
|---|---|---|---|---|---|---|
| `lib/auth/session-client.ts` | 新增 | | | | | |
| `lib/auth/session-store.ts`、`hooks/useSession.ts` | | 新增 | | | | |
| `openspec/specs/pickleball-guide-page/spec.md`（授權一行） | | 改 | | | | |
| `components/layout/AccountEntry.tsx` | | | 新增 | | | |
| `components/layout/SiteNavbar.tsx`／`.test.tsx`（只加 mock） | | | 改 | | | |
| `components/auth/LoginForm.tsx`、`app/login/page.tsx` | | | | 新增 | | |
| `playwright.config.ts`、`tests/e2e/**`、`.gitignore` | | | | | 改 | |
| `nextjs-pickball/CLAUDE.md` | | | | | | 改 |
