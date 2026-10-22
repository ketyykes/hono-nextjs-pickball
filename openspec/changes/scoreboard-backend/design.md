# Design: scoreboard-backend

## Context

- 前提：B4 已把 `ScoreboardStateSchema`、`createInitialState`、`scoreboardReducer` 搬到 `@pickball/core/scoreboard/*`；
  `nextjs-pickball/lib/scoreboard/{storage,storage-keys,match-slots}.ts` 仍在前端（localStorage I/O）。
- 後端現況（main@414d822）：`src/index.ts` 內聯定義 `localAuth`（gate → `createAuth` → `c.set("auth")`），掛在 `/api/auth/*` 與 `/api/me`；
  `src/auth/require-session.ts` 的 `AuthAppEnv` 把 `auth`、`user`、`session` 放在同一個 `Variables`（皆非 optional）；
  `src/auth/local-auth.ts` 的 `isLocalAuthEnabled` 被 `create-auth.ts` 匯入；`getDb(env)` 為唯一 D1 入口；`zod`、`@hono/zod-validator` 已安裝但 `src` 未匯入。
- 前端現況：`useScoreboardStore(matchId)` 回傳 `[state, dispatch, bindingStatus]`，以 write effect 在前、read effect 在後＋`hasHydratedRef` 守門；
  `Scoreboard` 在 `bindingStatus === "missing"` 時提早回傳 `MatchBindingNotice`；`app/scoreboard/page.tsx` 以 `key={matchId ?? "standalone"}` 強制 remount。
  `useSession()` 回傳 `{ status: "loading" } | { status: "ready", authEnabled, user }` 加 `refresh`。
- 場次分槽 `scoreboard:matches:v1` 的使用者遍布對戰分配機：`CourtCard`（導向前同步 `ensureMatchSlot`）、`app/matchmaker/page.tsx`（`readMatchSlots`＋`collectFinishedSubmissions` 自動送出）、
  `RoundControls`（`isTargetScoreLocked`）、`useRoundStore`（`clearDiscardedMatchSlots`）、`lib/matchmaker/storage.ts` 的 `RESET_KEYS`。
- E2E：`globalSetup` 產生 `tests/e2e/.auth/test-account.json`；`playwright.config.ts` 為 `fullyParallel: true`、非 CI 時 workers 不設限、五個 project 共用 top-level `testDir: ./tests/e2e/specs`。
- runbook 教訓 14：WebKit 單一 browser 超過 64 個 context 會卡住，驗收依 project 分開跑。

## Goals

- 已登入且未綁定場次的計分板以雲端為準，換裝置可續用，衝突時明確提示並重新載入（D3）。
- 一次定下 B6～B9 沿用的慣例（見 Decision 2～9），讓之後的 change 只需「照抄」。
- 訪客與正式站零變更：程式路徑、首屏時序、DOM 皆相同。

## Non-Goals

- 場次分槽上雲（移至 B7，Decision 1）；本機與雲端合併、離線佇列持久化；刪除雲端資料的 API；匯入本機資料（B9）。

## Decisions

### Decision 1：場次分槽移到 B7，本 change 只做獨立計分板

**Choice**：B5 只把 `scoreboard:current:v1` 搬上雲；`scoreboard:matches:v1` 在任何模式下都留在 localStorage，B7 與回合（`matchmaker:round:v1`）一起上雲。

**Rationale**：分槽不是計分板自己的資料——它由 `CourtCard` 在導向前建立、由對戰頁讀取並自動送出比分、由回合重排時批次清除、由「重置」連同回合一起刪除。
若 B5 讓已登入的綁定計分板讀寫雲端分槽，而 B6～B7 之間對戰頁仍以 localStorage 建立分槽，計分板會讀不到剛建立的分槽而顯示「場次已失效」，
回合重排的清除與自動送出也會各看各的。B7 的「送出比分」是後端權威的單一 batch，屆時可在同一個 batch 內清除對應分槽，一致性最好。
runbook 已定「五個 key 全部要有後端版本」，本決策只是改變交付順序，不減少範圍——B7 交接事項第 1 點。

**Alternatives considered**：B5 做分槽 API 但前端不接（死碼、契約無人驗證）；B5 前後端都做（上述不一致）。不選。

### Decision 2：路由與授權 middleware 的形態

**Choice**：
- `src/auth/local-auth-middleware.ts` 匯出 `localAuth`（自 `src/index.ts` 原樣搬出）。不放進 `local-auth.ts`：`create-auth.ts` 匯入 `local-auth.ts`，而 middleware 要匯入 `createAuth`，會形成循環匯入。
- `src/auth/require-session.ts`：`AuthAppEnv = { Bindings; Variables: { auth } }`、`SessionAppEnv = { Bindings; Variables: { auth; user; session } }`；
  `requireSession = createMiddleware<SessionAppEnv>(...)`。`src/index.ts` 的主 app 維持 `new Hono<AuthAppEnv>()`。
- 每個 feature 一個 sub-app：`src/routes/scoreboard.ts` 匯出 `scoreboardRoutes = new Hono<SessionAppEnv>().use("*", localAuth, requireSession).get(...).put(...)`；
  主 app `app.route("/api/scoreboard", scoreboardRoutes)`。資料存取放 `src/scoreboard/repository.ts`（純粹接 drizzle，handler 只做 HTTP 對應）。
- 測試共用 `test/helpers/session.ts`（`seedUser(email)`、`signIn(email)` 回 cookie、`userIdOf(email)`），既有測試檔不改。

**Rationale**：
- Context7（`/honojs/website`，`docs/helpers/factory.md`、`docs/guides/middleware.md`）：`createMiddleware<{ Variables: ... }>` 宣告的變數會由 `.use()`／handler 鏈推導進 `c.var`；
  `app.route(path, subApp)` 為官方的分組方式。因此以 `SessionAppEnv` 宣告的 sub-app 內 `c.var.user` 有型別，而主 app（`AuthAppEnv`）的 handler 若未掛 `requireSession` 讀 `c.var.user` 會是型別錯誤——
  這正是 B2 合併紀錄指出的漏洞。以 `@ts-expect-error` 型別測試鎖住（`test/auth-env-types.test.ts`，紅燈為 typecheck 的「Unused '@ts-expect-error' directive」）。
- sub-app 層的 `use("*", ...)` 讓「新增端點忘了掛授權」不可能發生；比逐路由掛 middleware 安全。

### Decision 3：版本化讀寫契約與 SQL

**Choice**：`GET` → `{ data | null, version }`（無資料 `{ null, 0 }`）；`PUT { data, version }`：
- `version === 0`：`insert(...).values(...).onConflictDoNothing().returning()`，空陣列 → 409；
- `version > 0`：`update(...).set({ data, version: version + 1, updatedAt }).where(and(eq(userId), eq(version, expected))).returning()`，空陣列 → 409。
- 409 body 只有 `{ error: "VERSION_CONFLICT" }`，不附目前資料（前端一律重新 GET，單一路徑較好測）。
- 驗證：`zValidator("json", versionedWriteSchema(ScoreboardStateSchema), hook)`，hook 在失敗時回 `400 { error: "INVALID_BODY" }`；
  PUT current 另檢查 `data.matchId === null`，否則同樣 400（`scoreboard_current` 只存獨立計分板）。

**Rationale**：
- Context7（`/drizzle-team/drizzle-orm-docs`）：`update().where(eq(version, expected)).returning()` 回傳空陣列即代表條件不成立，是樂觀鎖的標準寫法；`onConflictDoNothing()` 在衝突時不寫入且 `returning()` 為空。
  兩者都是**單一 SQL**，沒有「先讀再寫」的競態窗口。
- 已安裝的 `hono/dist/validator/validator.js`（本機查證）：`json` target 在 `Content-Type` 不符 `application/json` 時**不解析 body、以 `{}` 進入驗證**，因此 schema 必然失敗 → 走 hook 的 400；
  JSON 語法錯誤則由 Hono 直接拋 `HTTPException(400)`（body 為純文字，不是本契約的 JSON）。spec 只承諾「400」，測試以 `text/plain` 送合法 JSON 驗證前者。
- Context7（`/honojs/middleware`，`packages/zod-validator`）：`zValidator(target, schema, hook)` 的 hook 可回傳 Response 取代預設錯誤；peer 支援 `zod ^3.25 || ^4`（已安裝 zod 4.4.3）。
- 「`Content-Type` 必須是 JSON」同時是 CSRF 防線之一：跨站表單無法送 `application/json`，送 JSON 必須經 CORS preflight（本 API 不回 CORS 標頭）；session cookie 為 `SameSite=Lax`（B2 Context7 查證），跨站 PUT 不帶 cookie。G1 上線前再複核（交接事項）。

### Decision 4：使用者資料表慣例與 `USER_DATA_TABLES`

**Choice**：表名 `<feature>_<entity>`；`user_id` FK cascade；`version`、`updated_at`；JSON 快照放 `data text json`。
`scoreboard_current` 以 `user_id` 為 PK。核心套件新增 `api/user-data-tables.ts` 匯出 `USER_DATA_TABLES = ["scoreboard_current"] as const`，
後端測試以 `sqlite_master` 雙向比對、以 `pragma_table_info`／`pragma_foreign_key_list` 檢查欄位慣例。

**Rationale**：
- Context7（`/llmstxt/developers_cloudflare_d1_llms-full_txt`，`d1/sql-api/foreign-keys`）：D1 預設對所有查詢與 migration 強制 foreign key（等同每個 transaction `PRAGMA foreign_keys = on`），
  所以 FK 與 cascade 可以用測試證明，不必另開 pragma。
- 清單放核心套件，是因為 E2E helper（前端 workspace）與後端測試都要讀它；放後端 `src` 前端拿不到，放 E2E helper 後端測試拿不到。
- 雙向比對讓 B6～B8 新增表時「忘了加進清單」直接轉紅，E2E 的清空就不會漏表。

### Decision 5：前端儲存模式與選擇器 hook

**Choice**：
- `lib/sync/storage-mode.ts`：`resolveStorageMode(snapshot)`，只有 ready＋authEnabled＋user 為 `"remote"`。
- `hooks/useScoreboardStore.ts`：既有函式本體原封不動改名為 `useLocalScoreboardStore`（同檔、不匯出；本體與註解一字不改，`git diff` 只見函式名稱那一行），
  新的 `useScoreboardStore(matchIdParam)` 呼叫 `useSession()`、`useLocalScoreboardStore(matchIdParam)`、`useRemoteScoreboardStore({ enabled, onUnauthorized: refresh })`，
  `enabled = mode === "remote" && 正規化後的 matchId === null`，依 `enabled` 回傳其一，並附第四個元素 `syncStatus`（本機為 `"local"`）。
- `hooks/useRemoteScoreboardStore.ts`：自有 `useReducer(scoreboardReducer)`；對外的 `dispatch` 包一層「標記為使用者變更」，effect 只在標記存在時把 state 交給 saver——
  載入與衝突重載用的 `HYDRATE` 不會被寫回。
- 既有 `hooks/useScoreboardStore.test.tsx` **只新增**檔頭的 `vi.mock("@/hooks/useSession", ...)` 區塊（預設回 `{ status: "ready", authEnabled: false, user: null, refresh }`）與新 it，既有 it 一字不改。

**Rationale**：
- 本機 hook 一行不動，既有 15 個 it 與所有計分板 E2E 就是零迴歸的證明；選擇器的分支只有一個布林。
- 兩個 hook 每次都呼叫（hooks 規則），`enabled` 為 false 的雲端 hook 不發請求；本機 hook 在雲端模式下沒有使用者動作，不會寫入 `scoreboard:current:v1`
  （它 mount 時會 hydrate 並把同一份資料寫回——與現況相同，非新寫入）。
- session 載入中視為本機：訪客時序不變（runbook R3）。已登入者會先看到本機資料一瞬間再切到「正在載入雲端資料…」——記為 Trade-off。
- 「session 已就緒前就按了得分」只會寫入本機獨立槽，雲端不受影響，符合「不做雙寫」。

**Alternatives considered**：
- 在 `Scoreboard` 元件層選擇：元件要同時呼叫兩個 hook 並自己分派，邏輯散到呈現層。不選。
- 抽象出 `ScoreboardStorage` 介面注入本機 hook：要改動本機 hook 本體，失去「一行不動」的零迴歸證明。不選。

### Decision 6：請求結果分類與最新優先儲存

**Choice**：`lib/sync/api-client.ts` 的 `requestJson` 永不 throw，結果為 ok／conflict／unauthorized／rejected／failed；
`lib/sync/latest-wins-saver.ts` 的 `createLatestWinsSaver` 只負責「單一在途、最新優先、退避重試、停止條件」，版本號由呼叫端在 `send` 內帶入。
重試間隔 1、2、4、8 秒後每 8 秒，無上限（頁面存活期間）。PUT 不帶 `keepalive`（keepalive 的 body 有 64 KiB 總量限制，超過時 fetch 直接失敗會變成永遠重試）。

**Rationale**：計分是高頻動作（每球一次），逐球 round-trip 失敗就擋按鈕會讓場邊無法使用（D2 的理由）；最新優先保證「最後顯示的比分」最終寫入。
分類放在單一 client，B6～B9 的雲端 hook 直接沿用，不會各自解讀狀態碼。GET 帶 keepalive 沿用 B3 的 WebKit 修正（Open Questions 第 14 條）。

### Decision 7：同步狀態與提示

**Choice**：八種 `SyncStatus` 與固定文案（spec 表）；`SyncStatusNotice` 以 `role="status"` 呈現；`loading`／`load-failed` 取代計分畫面，其餘疊加；
非 local 時計分板根元素帶 `data-sync-status`。

**Rationale**：`loading`／`load-failed` 時沒有可信比分，顯示初始 0:0 會誤導（使用者可能以為比賽被清空而按下 RESET）。
`data-sync-status` 讓 E2E 等待「已同步」而不靠 sleep；只在雲端模式渲染，訪客 DOM 不變（新增訪客 E2E 驗證）。

### Decision 8：E2E 使用者資料 project 與清空

**Choice**：新增第六個 project `user-data`（`testDir: ./tests/e2e/user-data`、`workers: 1`、`fullyParallel: false`、Desktop Chrome）；
既有五個 project 一行不改（它們用 top-level `testDir`，不會撿到新目錄）。`tests/e2e/helpers/user-data.ts` 的 `clearTestAccountUserData()` 以
`pnpm --dir <hono-pickball> exec wrangler d1 execute DB --local --env local --command` 執行
`DELETE FROM <t> WHERE user_id IN (SELECT id FROM user WHERE email = '<跳脫後的 email>');`（對 `USER_DATA_TABLES` 每張表各一句）。每個 test 的 `beforeEach` 呼叫。

**Rationale**：
- Context7（`/websites/playwright_dev`，`api/class-testproject#workers`，v1.52 起）：`testProject.workers` 限制單一 project 的並行數，
  官方舉例正是「all tests from a project share a single resource like a test account」。本機 Playwright 為 1.60。
- 只跑 Desktop Chrome：雲端同步邏輯與瀏覽器引擎無關，多引擎重跑只會讓共用帳號的資料互相踩；跨引擎的呈現已由既有訪客 E2E 涵蓋。
- B2 §1 已實測 `wrangler d1 execute --local` 寫入對執行中的 `wrangler dev` 立即可見；不刪 user／session，storage state 持續有效（spec Scenario 驗證）。

### Decision 9：核心套件新增的 API 契約模組

**Choice**：`packages/pickball-core/src/api/versioned.ts`（`versionedEnvelopeSchema`、`versionedWriteSchema`）、`api/errors.ts`（`API_ERROR_CODES`、`ApiErrorBody` 型別）、
`api/user-data-tables.ts`；測試放 `packages/pickball-core/test/api/`；`module-boundary.test.ts` 的 `CORE_MODULES` 加三項。端點路徑字串不抽常數（每個路徑只有前端 hook 與後端 route 各一處、且有 E2E 串接驗證，抽常數是過度設計）。

## Risks / Trade-offs

- [Risk] 已登入者在 `/api/session` 回應前會先看到本機計分（一瞬間），期間的操作寫入本機槽 → 記錄為取捨；E2E 一律等 `data-sync-status` 再操作。
- [Risk] 重新整理時尚未送達的變更遺失 → 重試提示告知；不做持久化佇列（Non-Goal）。
- [Risk] `pnpm test:e2e` 預設平行時，`user-data` project 與訪客 project 同時跑 → 訪客 project 不碰測試帳號的雲端資料（B3 的 `auth-session.spec.ts` 只做登入／登出新 context），無衝突。
- [Risk] `wrangler d1 execute` 每次約 1～2 秒，`beforeEach` 會拉長 user-data project → 本 change 只有 6 個 test，可接受；B6～B8 若累積過多，再評估改為 `beforeAll`＋檔內 serial。
- [Risk] 新的訪客 E2E（`scoreboard-local-mode.spec.ts`）讓 WebKit 兩個 project 各多 1 個 context → 驗收本來就分三份 shard。
- [Risk] 移出 `localAuth` 與拆型別若改變行為 → 既有 `auth-gating`、`auth-me`、`auth-session` 測試是 regression guard，必須原樣通過。
- [Trade-off] 衝突時直接丟棄本裝置未同步的那一步（D3 不合併）。

## Migration Plan

- 合併後 `pnpm install`（無新相依，B4 已建立 workspace 連結）、`pnpm --filter ./hono-pickball db:migrate:local`（套用 `0001`）。
- 正式站：auth 停用 → 使用者資料 API 404、前端恆為本機模式，零變更；遠端 D1 的 migration 屬 G1。**不 push**（D4）。
- 回滾：revert 合併 commit；本機 D1 多出的表無害（可刪 `hono-pickball/.wrangler/state` 重建）。

## 交接給 B6～B9（摘要；tasks 8.1 會寫進兩份 CLAUDE.md）

1. 新 feature 一律：`src/routes/<feature>.ts` sub-app（`SessionAppEnv`＋`use("*", localAuth, requireSession)`）、`src/<feature>/repository.ts`、`app.route`。
2. 新表一律依 Decision 4，並加進 `USER_DATA_TABLES`（後端測試會擋）；migration 以 `db:generate` 產生。
3. 單筆資料用版本化契約（Decision 3）；多筆資料各筆帶 `version`，衝突一律 409＋前端整份重載。
4. 前端：`resolveStorageMode`＋選擇器 hook（本機 hook 一行不動）＋`requestJson`＋`createLatestWinsSaver`＋`SyncStatusNotice`；新 hook 依 B3／本 change 先例同步主 spec 歸屬清單。
5. E2E：使用者資料 spec 放 `tests/e2e/user-data/`、`beforeEach` 呼叫 `clearTestAccountUserData()`；驗收迴圈多一個 `--project=user-data`。
6. 授權覆蓋表：每個端點三類測試（401／他人資料／停用 404）。

## apply §1 查證紀錄（2026-10-22）

**對齊 main（tasks 1.2，base `621bb7e`）**
- `@pickball/core`：`exports` 為 `{"./*": "./src/*.ts"}`，匯入路徑 `@pickball/core/scoreboard/{types,reducer}` 與 design 假設相同；`src/` 目前只有 `scoreboard/`、`matchmaker/`，尚無 `api/`。
  `test/module-boundary.test.ts` 的 `CORE_MODULES` 為 18 項，下限斷言 `>= 18`；另一個 it 對每個模組要求 `Object.keys(mod).length > 0`（`api/errors.ts` 只匯出型別會轉紅，必須至少匯出 `API_ERROR_CODES` 值）。
  核心套件 vitest `include` 為 `test/**/*.test.ts`，`test/api/versioned.test.ts` 在範圍內；`test/tsconfig.json` 只有 `types: ["node"]`（無 DOM，B4 Open Questions 8 的教訓：RED 寫完先跑核心 `typecheck`）。
- B4 Open Questions：無「vitest-pool-workers 需要額外設定」的待辦；`hono-pickball/test/pickball-core-import.test.ts` 已證明 workerd 可解析 workspace 套件，本 change 不需改 `vitest.config.ts`。
- 後端：`src/index.ts` 內聯 `localAuth`（`createMiddleware<AuthAppEnv>`，gate → `createAuth` → `c.set("auth")`），掛 `/api/auth/*` 與 `/api/me`；`require-session.ts` 的 `AuthAppEnv` 三個變數同層、`requireSession` 以 `createMiddleware<AuthAppEnv>` 宣告——與 Context 一節相同。
  `create-auth.ts` 匯入 `local-auth.ts`（Decision 2 的循環匯入理由成立）。`test/auth-me.test.ts` 的 `seed`／`signIn`／`userIdOf` 寫法（`buildTestAccountSeedSql`、`Origin: http://localhost:3005`、`exports.default.fetch`）可直接搬到 `test/helpers/session.ts`；
  停用情境沿用 `auth-gating.test.ts` 的 `app.request(path, init, { ...env, ... })`。
- 前端：`SessionSnapshot`、`useSession()`、`useScoreboardStore` 與 Context 一節相同；E2E helper `tests/e2e/helpers/{test-account,storage-state}.ts` 存在。
- 主 spec 比對（以 Requirement 區塊逐行 diff）：`scoreboard`「localStorage 持久化」、`dev-workflow`「E2E 登入夾具」、`pickleball-guide-page`「互動行為由三支 hooks 提供且各有 smoke test」三者，
  主 spec 現行文字與 delta 的「原文部分」完全一致，差異只有本 change 的增修（B4 未改動這三個 Requirement）——**不需要重新套用 delta**。

**Context7（tasks 1.3）**
- `/honojs/website`（`docs/guides/middleware.md`、`docs/api/context.md`）：`createMiddleware<{ Variables }>` 的變數經 `.use()` 鏈與 handler 參數合併進 `c.var`；`app.route()` 為分組方式。與 Decision 2 一致。
- `/honojs/middleware`（`packages/zod-validator/README.md`）：`zValidator(target, schema, (result, c) => { if (!result.success) return c.json(...) })` 的 hook 回傳 Response 取代預設錯誤。已安裝 `@hono/zod-validator` 0.8.0，peer `zod ^3.25 || ^4`（已裝 4.4.3）。與 Decision 3 一致。
- 本機查證 `hono` 4.12.25 `dist/validator/validator.js`：`json` target 在 `Content-Type` 不符時 `break`（value 維持 `{}` 進入驗證）；JSON 語法錯誤拋 `HTTPException(400, "Malformed JSON in request body")`。與 Decision 3 一致。
- `/drizzle-team/drizzle-orm-docs`（`sqlite/update.mdx`、`sqlite/insert.mdx`、`guides/empty-array-default-value.mdx`）：`update().set().where().returning()` 條件不成立時回空陣列；`insert().values().onConflictDoNothing()`；`text(..., { mode: "json" }).$type<T>()`。與 Decision 3、4 一致（已裝 drizzle-orm 0.45.2）。
- `/llmstxt/developers_cloudflare_d1_llms-full_txt`（`d1/sql-api/foreign-keys`、`workers/wrangler/commands/d1`）：D1 的 FK 強制等同 `PRAGMA foreign_keys = on`，使用者查詢無法關閉；`--command` 接受「以 `;` 分隔的多個查詢」。與 Decision 4、8 一致。
- `/websites/playwright_dev`（`api/class-testproject`）：`testProject.workers`（v1.52 起）限制單一 project 並行數、官方例即「共用測試帳號」；`testProject.testDir` 每個 project 可不同；`fullyParallel` 可設在 project 層。已裝 1.60.0。與 Decision 8 一致。
- 結論：Decision 2～8 **無與查證結果不同之處**。

**一次性實測（tasks 1.4，不 commit）**
- `pnpm --dir <repo>/hono-pickball exec wrangler d1 execute DB --local --env local --command "SELECT 1 AS a; SELECT 2 AS b;"` exit 0，輸出「2 commands executed successfully」並附 JSON 陣列（每個陳述式一個 `{ results, success, meta }`）；
  加 `--json` 時 stdout 只有該 JSON 陣列（banner 在 stderr），可 `JSON.parse`。`clearTestAccountUserData()` 對多張表各一句 `DELETE` 合併為單一 `--command` 可行。

## Open Questions

1. D1 `batch()` 內「版本條件不成立的 UPDATE」只會影響 0 列、不會讓 batch 失敗回滾（Context7 `/llmstxt/developers_cloudflare_d1_llms-full_txt`：batch 只在**某個陳述式失敗**時整批回滾）。
   B7 的送出比分若要在 batch 內同時檢查回合版本，需要「條件不成立時讓陳述式失敗」的寫法（例如對 CHECK 約束違反、或以子查詢讓 INSERT 的 NOT NULL 欄位為 NULL），或先讀版本再以單一 batch 寫入並接受極小競態窗口——由 B7 決定並以測試證明。
2. `useScoreboardStore` 第四個回傳值目前只有 `Scoreboard` 使用；`app/matchmaker/page.tsx` 等不經此 hook 的分槽讀寫不受影響（Decision 1）。
3. CSRF 防線（JSON content-type＋`SameSite=Lax`＋不回 CORS 標頭）在正式網域（G1）需再複核，含 Google 登入後的 cookie 屬性。
4. （apply §1）Decision 2～8 與 Context7／本機查證無差異；三個 MODIFIED Requirement 的主 spec 原文與 delta 一致，無需重新套用（見「apply §1 查證紀錄」）。
5. （apply §1）`wrangler d1 execute --local --command` 多陳述式實測可行，`--json` 輸出可解析（見查證紀錄）。
6. （apply §4 leader 裁定）spec「版本化讀寫契約」原文要求「body 不是 JSON → `400 { error: "INVALID_BODY" }`」，與 Decision 3 Rationale「JSON 語法錯誤由 Hono 拋純文字 400、spec 只承諾 400」不一致；以 spec 為準：
   `src/routes/scoreboard.ts` 的 sub-app `onError` 將 `HTTPException(400)` 轉為 `INVALID_BODY`（實測 Hono 4.12 的 `app.route` 會套用 sub-app 的 `onError`），其他錯誤維持 Hono 預設；
   「body 不符 schema 或 content-type 非 JSON 時回 400 INVALID_BODY」it 內加入第五種輸入（語法錯誤 JSON）。B6～B9 照抄 sub-app 形態時需一併帶上（§4 Stage 2 建議 B6 開工時把 `onError`＋`zValidator` hook 抽成 `src/http/` 共用）。
7. （apply §3／§4 Stage 2 非阻擋建議，留後續）① `test/user-data-tables.test.ts` 的 `NOT LIKE '_cf_%'` 中 `_` 為單字元萬用字元，可改 `GLOB` 或 `ESCAPE`；
   ② `scoreboard-current.test.ts` 未直接守「SHALL NOT 從 query／body 接受使用者 id」（PUT 改讀 `?userId=` 的變異存活）與「getSession 例外時回 500」（`onError` 吞 500 的變異存活；probe 實測現行實作回 500 正確）；
   ③ GET 有資料的 it 未斷言 status 200。皆為測試加強，不影響現行行為，交 coordinator 決定是否在本 change 補。
8. （apply §5）5.1 的 RED commit `bb6dd3e` 早於實際看到紅燈（實作檔當時未追蹤、不在 commit 內），Implementer 事後暫移實作重跑確認紅燈；`git show bb6dd3e^:nextjs-pickball/lib/sync/storage-mode.ts` 不存在，機械複驗成立。
   §5 Stage 2 指出的 L14（失敗後以舊值覆蓋較新待送值）與 A12（回傳未經 schema 的 JSON）兩個存活變異已於 `12ae7e2` 補 regression guard 斷言。
9. （apply §6）Stage 2 第一輪 FAIL：同一 mount 內 `enabled` true→false→true 且新一輪 GET 回 `data: null` 時保留前一輪比分（違反「data 為 null 時維持 `createInitialState()`」，可能把前一帳號比分寫上新帳號）；
   已依 TDD 修正（RED `199578e`、fix `e718f67`：載入成功一律 `HYDRATE data ?? createInitialState()`），並補選擇器 401 呼叫 `refresh`、衝突重載不切 `loading`、StrictMode 過期 GET、`useScoreboardStore("")` 四條 regression guard（`d347fc3`）；複審 PASS。
   test-plan／tasks 寫「既有 `useScoreboardStore.test.tsx` 15 個 it」為筆誤，基準實為 14 個（tasks 6.5 已註記）。
10. （apply §6 非阻擋，交 B6）① 401 → `refresh()` 後 session 仍為登入（例如另一分頁換帳號）時 `enabled` 不切換、effect 不重跑，hook 會停在 `loading` 或 `saving` 且之後寫入被靜默丟棄；B6 照抄時應考慮以 user id 作為 effect 依賴或 401 後強制重載。
    ② 衝突重載期間 `versionRef` 仍為舊版本，重載中使用者動作會多一輪 409→重載（有界、自癒）；可於重載開始時設 null 省去。③ 無歷史時 UNDO 回傳同一 state 仍標 dirty，多送一次 PUT（無害）。
    ④ 雲端模式下本機 hook mount 時仍會把 `scoreboard:current:v1` 既有資料（經 zod 正規化）寫回原 key——Decision 5 已接受的取捨，使用者動作不寫入（有 it 守）。
11. （apply §7）Stage 2 第一輪 FAIL：訪客 spec 的 `getByRole("status")` 計數 0 在直式 viewport 被既有 `OrientationHint`（亦為 `role="status"`）打破（mobile-safari／mobile-chrome 紅），已改為進頁前寫入 `scoreboard:hint-dismissed`（`bf98193`）；
    並補「loading 取代計分畫面」的守護（在「雲端載入失敗時…」test 內先掛起 GET，`bea6b59`）。複審 PASS。
    偏離：衝突 E2E 讓 A 得分兩次（spec 寫一次）——A 一分時 B 本機一分同為 1:1，無法區分「載入雲端」與「保留本機」。
    取捨：疊加提示改為面板區頂端單行小字（`4cb5276`），375 以下直式會蓋住「我方 · 11 分制」標籤（不蓋按鈕與比分數字），衝突／拒絕狀態停留期間看不到該標籤；
    `clearTestAccountUserData()` 失敗訊息不含 SQL／email／stderr（避免洩漏），排查需手動重跑 wrangler 指令。
