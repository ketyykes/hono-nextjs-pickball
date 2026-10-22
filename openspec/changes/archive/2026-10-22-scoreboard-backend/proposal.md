# Proposal: scoreboard-backend

## Why

runbook B5：登入後計分板要以後端為準，換裝置也看得到同一場比賽。B5 是 Wave 2 第一個有「使用者資料表」的 change，
因此除了計分板本身，還要把 B6～B9 共用的慣例一次定下來：D1 表命名、API 路由、授權 middleware、`version`／409 衝突處理（D3）、
前端「依 session 選儲存層」的介面、同步失敗的重試與提示、E2E 登入夾具的資料清空（D6）。
這些慣例若各 change 自己發明，五個 key 會出現五套語意。

**前提**：B4 `pickball-core-package` 已合併並 archive（後端以 `@pickball/core` 的 `ScoreboardStateSchema` 驗證寫入）。

## What Changes

**跨 change 慣例（新 capability `user-data-sync`，B6～B9 必須沿用）**
- 後端使用者資料 API：一律在 `/api/<feature>/...`，sub-app 掛 `localAuth`＋`requireSession`；auth 停用時回 404（D4，與 `/api/me` 相同閘門）、
  未登入 401、只能存取 session 本人的資料。每個端點 MUST 有「未登入 401」「存取他人資料被拒」「停用 404」三類測試。
- 版本化讀寫契約（D3）：`GET` 回 `{ data, version }`（無資料時 `{ data: null, version: 0 }`，**不回 404**）；
  `PUT` 送 `{ data, version }`，版本不符回 `409 { error: "VERSION_CONFLICT" }`，成功回 `{ data, version: n + 1 }`；
  body 不合 schema 回 `400 { error: "INVALID_BODY" }`。契約的 zod schema 與錯誤碼放 `@pickball/core/api/*`，前後端共用。
- D1 表慣例：`<feature>_<entity>` snake_case、`user_id` 參照 `user.id` 且 `on delete cascade`、`version`、`updated_at`；
  JSON 快照存 `data`（text json）並在寫入前以共用 schema 驗證。使用者資料表清單 `USER_DATA_TABLES` 放核心套件，由後端測試雙向守住。
- 前端儲存模式：`resolveStorageMode(session)` 只有在 session 已就緒、auth 啟用且有 user 時為 `"remote"`，其餘（含載入中）一律 `"local"`——
  訪客與正式站的時序與行為完全不變。
- 前端同步：`lib/sync/` 的 `requestJson`（永不 throw，結果分為 ok／conflict／unauthorized／rejected／failed）與「最新優先」儲存佇列
  （同時只有一個請求、只送最新狀態、失敗以 1／2／4／8 秒後每 8 秒重試）；同步狀態以 `SyncStatusNotice`（`role="status"`）提示，
  衝突時顯示「資料已在其他裝置更新，已重新載入最新資料」並重新載入，不合併。
- E2E：新增 Playwright project `user-data`（`testDir: tests/e2e/user-data`、`workers: 1`），既有五個 project **一行不改**；
  helper `clearTestAccountUserData()` 以 `wrangler d1 execute DB --local --env local` 只刪 `USER_DATA_TABLES` 中屬於測試帳號的列，
  **不刪 user／session**（避免 storage state 失效）、不新增 reset API。

**計分板**
- D1 表 `scoreboard_current`（每位使用者一列）；`GET`／`PUT /api/scoreboard/current`；PUT 另要求 `data.matchId === null`。
- `useScoreboardStore` 改為選擇器：既有本機實作原封不動改名為同檔的 `useLocalScoreboardStore`，新增 `hooks/useRemoteScoreboardStore.ts`；
  只有「雲端模式且未綁定場次（`matchId === null`）」走後端，回傳值多第四個元素 `syncStatus`。
- **範圍調整（與 runbook 草案不同）**：場次分槽 `scoreboard:matches:v1` **不在本 change**，移到 B7 與回合一起上雲（理由見 design Decision 1）。
  登入時由對戰頁進入的綁定計分板仍走 localStorage，與 B7 之前的回合資料一致。

**順帶處理（B2 合併紀錄給 Wave 2 的建議）**
- `localAuth` middleware 從 `src/index.ts` 移到 `src/auth/local-auth-middleware.ts`（行為不變）。
- `AuthAppEnv` 拆為 `AuthAppEnv`（只有 `auth`）與 `SessionAppEnv`（再加 `user`、`session`）；未掛 `requireSession` 的路由讀 `c.var.user` 變成型別錯誤。

### 明確不做

- 場次分槽上雲（B7）、對戰分配機任何資料（B6～B8）、匯入本機資料（B9）。
- 本機與雲端合併、雙寫、離線佇列持久化（重新整理後未送出的變更會遺失，以重試提示告知）。
- 刪除雲端計分板的 API（RESET 以 PUT 初始狀態表達）。
- 遠端 D1、Google 登入（G1）。

## Capabilities

### New Capabilities

- `user-data-sync`：使用者資料 API 的路由／授權／停用閘門、版本化讀寫契約、D1 使用者資料表慣例、前端儲存模式選擇、請求結果分類、最新優先儲存與重試、同步狀態提示、E2E 使用者資料夾具。

### Modified Capabilities

- `scoreboard`：「localStorage 持久化」限定為本機模式並加入雲端分支；新增「登入時獨立計分板以雲端為準」。
- `backend-database`：新增「計分板目前比賽資料表由 migration 建立」。
- `dev-workflow`：「E2E 登入夾具」加入 `user-data` project 與使用者資料清空。
- `pickleball-guide-page`：「互動行為由三支 hooks 提供且各有 smoke test」的歸屬清單加入 `useRemoteScoreboardStore → scoreboard`。

## Impact

- **後端**：`src/index.ts`（掛 sub-app、移出 `localAuth`）、`src/auth/{local-auth-middleware,require-session}.ts`、`src/routes/scoreboard.ts`、
  `src/scoreboard/repository.ts`、`src/db/schema.ts`、`drizzle/0001_scoreboard_current.sql`（＋meta）；測試 `test/helpers/session.ts`、
  `test/scoreboard-current.test.ts`、`test/user-data-tables.test.ts`、`test/auth-env-types.test.ts`，`test/d1-schema.test.ts` 新增 it。
- **核心套件**：`packages/pickball-core/src/api/{versioned,errors,user-data-tables}.ts` 與其測試；`CORE_MODULES` 更新。
- **前端**：`lib/sync/{storage-mode,api-client,latest-wins-saver,sync-status}.ts`、`hooks/useRemoteScoreboardStore.ts`、
  `hooks/useScoreboardStore.ts`（選擇器）、`components/sync/SyncStatusNotice.tsx`、`components/scoreboard/Scoreboard.tsx`；
  `playwright.config.ts`（新增 project）、`tests/e2e/helpers/user-data.ts`、`tests/e2e/user-data/scoreboard-sync.spec.ts`；
  既有 `hooks/useScoreboardStore.test.tsx` **只新增** `vi.mock("@/hooks/useSession")` 區塊與新 it。
- **主 spec 例外同步**：`hooksInventory.test.ts` 直接讀主 spec，tasks 依 B3 先例（3.5／3.6）授權同步 `pickleball-guide-page` 歸屬清單那一句。
- **文件**：`nextjs-pickball/CLAUDE.md`、`hono-pickball/CLAUDE.md`（路由約定、依賴注意：`zod`／`@hono/zod-validator` 自本 change 起被 `src` 匯入）。
- **相依**：**不新增任何第三方套件**。`zod` 與 `@hono/zod-validator` 已在後端 dependencies（runbook 列為預裝待用）。
- **訪客／正式站**：零變更（`resolveStorageMode` 在 auth 停用或未登入時恆為 local；同步提示與 `data-sync-status` 只在雲端模式渲染）。
