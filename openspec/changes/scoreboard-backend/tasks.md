# Tasks: scoreboard-backend

> **TDD 三步**（root `CLAUDE.md`）：RED（先寫失敗測試，以單檔指令在 shell 實際看到紅燈並貼出輸出）→ GREEN（最小實作至綠）→ REFACTOR（無壞味道註記 skipped）。
> 單檔指令：前端 `pnpm --filter ./nextjs-pickball test --run <path>`；後端 `pnpm --filter ./hono-pickball test --run test/<檔>.test.ts`；
> 核心 `pnpm --filter ./packages/pickball-core test --run test/<檔>.test.ts`。**`--run` 前不可加 `--`**。
>
> **紅燈要是真的**：加入即綠者 MUST 誠實標註 regression guard，**SHALL NOT 用「改斷言看紅再改回」偽造紅燈**。
> 一個 RED task 可一次寫入多個 it（皆須在 GREEN 前實際看到紅），只要紅燈原因都是「功能尚不存在」；其中會先綠的 it 必須在紀錄中逐一點名並標 regression guard。
>
> **標註**：`TDD`（RED／GREEN 成對）；`regression guard`；`設定層`（`src/db/schema.ts`、`drizzle/**`、`playwright.config.ts`、`tests/**` 的 helper、文件，不需紅燈，但 D1 表 MUST 有讀寫測試）；
> `例外層`（前端 `nextjs-pickball/CLAUDE.md` 的 TDD 例外：純呈現元件、`tests/**`）；`驗收（指令）`（test-plan C1～C8）。
>
> **前提**：B4 `pickball-core-package` 已合併回 `main` 並 archive。**不新增任何第三方相依**；**禁止任何遠端 CF 操作**（所有 `wrangler d1` 指令 MUST 帶 `--local`）；不 push。
> 測試帳密不得寫進任何會被 commit 的檔案或訊息。it／test 名稱 MUST 與 delta spec「驗收」錨點逐字一致；測試一律顯式匯入 `describe`／`it`／`expect`／`vi`。
> **訪客路徑零迴歸**：本機實作（`useLocalScoreboardStore`、`lib/scoreboard/storage.ts`、`match-slots.ts`）一行不改；既有 it 的名稱與斷言一律不得修改；
> 唯一允許碰的既有測試檔是 `hooks/useScoreboardStore.test.tsx`（只新增 `vi.mock("@/hooks/useSession")` 區塊與新 it）與 `hono-pickball/test/d1-schema.test.ts`（只新增 it）。

## 1. 對齊 main＋Context7 查證（不寫產品程式碼）

- [x] 1.1 確認分支 `change/scoreboard-backend`、工作樹乾淨；`pnpm install` 後 lockfile 零變動；`db:migrate:local`、`db:seed:local` 成功；
  `pnpm test` baseline（三個 workspace 的檔數／測試數）、`pnpm -r exec tsc --noEmit`、`pnpm --filter ./hono-pickball typecheck`、`pnpm lint`；`playwright test --list` 各 project 的數量；回填 environment.md 並 commit
- [x] 1.2 對齊 B4 實際落地：`@pickball/core` 的匯出路徑（`scoreboard/types`、`scoreboard/reducer`）、`CORE_MODULES` 現況、B4 design Open Questions（特別是 vitest-pool-workers 是否需要額外設定）。
  對齊 B2／B3：`hono-pickball/src/index.ts`、`src/auth/{require-session,local-auth,create-auth}.ts`、`test/auth-me.test.ts` 的 seed／signIn 寫法、`nextjs-pickball/tests/e2e/helpers/{test-account,storage-state}.ts`。
  比對本 change 四個 MODIFIED Requirement 與目前主 spec（`scoreboard`、`dev-workflow`、`pickleball-guide-page`；B4 可能已改動 `dev-workflow` 的其他 Requirement）——若主 spec 的同名 Requirement 已與 delta 的「原文部分」不同，以主 spec 為底重新套用本 change 的增修並 commit。差異記入 design.md Open Questions
- [x] 1.3 Context7 查證（MUST，附 library ID 記入 design.md「apply §1 查證紀錄」）：`/honojs/website`（`createMiddleware` 型別推導、`app.route` 與 sub-app `use("*")`）；
  `/honojs/middleware`（`zValidator` hook）；`/drizzle-team/drizzle-orm-docs`（SQLite `onConflictDoNothing().returning()`、`update().where().returning()`、`text({ mode: "json" }).$type<T>()`）；
  `/llmstxt/developers_cloudflare_d1_llms-full_txt`（foreign key 預設強制、`wrangler d1 execute --command` 多陳述式）；`/websites/playwright_dev`（`testProject.workers`、project 層 `testDir`）。與 design Decision 2～8 的差異記入 Open Questions
- [x] 1.4 一次性實測（不 commit）：以 `pnpm --dir <repo>/hono-pickball exec wrangler d1 execute DB --local --env local --command "SELECT 1; SELECT 2;"` 確認多陳述式可執行且輸出可解析；結果寫入 Open Questions

## 2. 核心套件：API 契約

Depends on: §1

- [x] 2.1 RED（TDD）：新增 `packages/pickball-core/test/api/versioned.test.ts`，it「versionedEnvelopeSchema 接受 data null 與非負整數 version」「versionedWriteSchema 拒絕 null data 與負數或非整數 version」。確認紅燈（模組不存在）。紅燈：`test --run test/api/versioned.test.ts` 因 `src/api/versioned` 不存在而整檔失敗（typecheck 僅 TS2307）；兩個 it 皆為真紅燈，無 regression guard
- [x] 2.2 GREEN（TDD）：新增 `src/api/versioned.ts`、`src/api/errors.ts`（`API_ERROR_CODES`、`ApiErrorBody`）；`test/module-boundary.test.ts` 的 `CORE_MODULES` 加入兩項（B4 規則：清單與檔案一致）。核心全套 4 passed
- [x] 2.3 REFACTOR：無壞味道則註記 skipped（refactor: skipped，無壞味道）

## 3. 後端：授權型別、middleware 位置與資料表

Depends on: §2

- [x] 3.1 RED（TDD，type）：新增 `hono-pickball/test/auth-env-types.test.ts`：一個以 `new Hono<AuthAppEnv>()` 宣告、未掛 `requireSession` 的 handler 讀 `c.var.user`（上一行 `// @ts-expect-error`），
  一個經 `requireSession` 的 handler 讀 `c.var.user.id`；檔內放一個執行期 it「auth 型別測試檔可載入」以免空檔。以 `pnpm --filter ./hono-pickball typecheck` 確認紅燈（`Unused '@ts-expect-error' directive`）並貼出輸出
  - 紅燈紀錄：`typecheck` exit 2，`test/auth-env-types.test.ts(9,2): error TS2578: Unused '@ts-expect-error' directive.`（另有 TS2305：`SessionAppEnv` 尚不存在，屬功能不存在的紅燈原因）
- [x] 3.2 GREEN（TDD）：`src/auth/require-session.ts` 拆為 `AuthAppEnv`／`SessionAppEnv`，`requireSession` 改為 `createMiddleware<SessionAppEnv>`；typecheck exit 0；既有後端測試全綠（regression guard）
  - 實跑紀錄：typecheck exit 0；後端全套 14 檔／52 tests 全綠（基線 13／51 + 型別測試檔 1 it）
- [x] 3.3 REFACTOR（regression guard：既有 `auth-gating`／`auth-me`／`auth-session`／`auth-sign-in` 測試）：`localAuth` 自 `src/index.ts` 原樣搬到 `src/auth/local-auth-middleware.ts`（design Decision 2），`index.ts` 改為匯入；後端測試全綠、數量不變
  - 實跑紀錄：搬移後後端全套 14 檔／52 tests 全綠，數量與搬移前相同；typecheck exit 0
- [x] 3.4 RED（TDD）：`test/d1-schema.test.ts` 新增四個 it（「scoreboard_current 可由 migration 建立並寫入讀回」「同一使用者在 scoreboard_current 只能有一列」「scoreboard_current 的 user_id 必須參照既有使用者」「刪除使用者時其 scoreboard_current 一併刪除」）；
  新增 `test/user-data-tables.test.ts`（「USER_DATA_TABLES 恰為 auth 以外的所有資料表」「每張使用者資料表皆有 user_id、version 與 updated_at 且 user_id 參照 user 並 cascade」）。確認紅燈（表不存在／`@pickball/core/api/user-data-tables` 不存在）
  - 紅燈紀錄：`d1-schema.test.ts` 4 failed／6 passed（`D1_ERROR: no such table: scoreboard_current`；外鍵 it 為 `expected [Function] to throw error matching /FOREIGN KEY/ but got 'D1_ERROR: no such table...'`）；`user-data-tables.test.ts` 整檔 `Cannot find package '@pickball/core/api/user-data-tables'`。四個新 it 皆因功能不存在而紅，無先綠者
- [x] 3.5 GREEN（設定層＋TDD）：`src/db/schema.ts` 加 `scoreboardCurrent`（design Decision 4；`data` 以 `$type<ScoreboardState>()`）；`pnpm --filter ./hono-pickball db:generate --name scoreboard_current` 產生 `drizzle/0001_scoreboard_current.sql` 與 meta（不手改）；
  再跑一次 `db:generate` 確認無新檔；核心套件新增 `src/api/user-data-tables.ts`（`USER_DATA_TABLES = ["scoreboard_current"] as const`）並更新 `CORE_MODULES`；`db:migrate:local`；3.4 轉綠
  - 實跑紀錄：`db:generate --name scoreboard_current` 產生 `0001_scoreboard_current.sql`；再跑一次 `db:generate` 為「No schema changes」；`db:migrate:local` 套用 0001；後端 15 檔／58 tests 全綠（3.4 的 6 個 it 轉綠）；核心 module-boundary 綠；三處 typecheck exit 0
  - 自跑變異發現 `scoreboard_current.data` 的 NOT NULL 無測試涵蓋，補一個 d1-schema it「scoreboard_current 的 data 不可為 NULL」（寫入即綠，標註 regression guard）；後端最終 15 檔／59 tests

## 4. 後端：計分板 API

Depends on: §3

- [x] 4.1 設定層（測試基礎建設）：新增 `hono-pickball/test/helpers/session.ts`（`seedUser(email)`、`signIn(email)` 回 Cookie 字串、`userIdOf(email)`；沿用 `auth-me.test.ts` 的 `buildTestAccountSeedSql` 與 `Origin` 寫法）；既有測試檔不改
  - 實跑紀錄：新增 `test/helpers/session.ts`（`seedUser`／`signIn`／`userIdOf`）；既有測試檔未動；typecheck 於 4.2 一併驗證
- [x] 4.2 RED（TDD）：新增 `test/scoreboard-current.test.ts`，寫入 spec 錨點的全部 it：「auth 停用且無 DB binding 時 GET 與 PUT /api/scoreboard/current 皆回 404」「未登入呼叫 GET 與 PUT /api/scoreboard/current 皆回 401」
  「B 的 cookie 讀不到 A 的計分板且寫入不影響 A」「尚無資料時 GET 回 data null 與 version 0」「以 version 0 首次寫入成功並回 version 1」「以目前 version 寫入成功並遞增 version，GET 取回相同資料」
  「version 不符時回 409 VERSION_CONFLICT 且資料不變」「已有資料時以 version 0 寫入回 409」「body 不符 schema 或 content-type 非 JSON 時回 400 INVALID_BODY」「data.matchId 非 null 時回 400 INVALID_BODY」。
  確認紅燈並貼出輸出；**「auth 停用…皆回 404」在路由不存在時同樣是 404，預期先綠——紀錄中點名並標 regression guard**（它在 GREEN 後證明的是「路由存在時停用仍 404」）
  - 實跑紀錄：`pnpm --filter ./hono-pickball test --run test/scoreboard-current.test.ts` → 9 failed｜1 passed（路由不存在，皆為 `expected 404 to be 401/200/409/400`）；regression guard：「auth 停用且無 DB binding 時 GET 與 PUT /api/scoreboard/current 皆回 404」（路由不存在時同為 404，先綠）；其餘 9 個為真紅燈
  - 依 spec Requirement 原文（「body 不是 JSON … → 400 INVALID_BODY」）於「body 不符 schema 或 content-type 非 JSON 時回 400 INVALID_BODY」額外加入第五種輸入：`Content-Type: application/json` 但 body 為語法錯誤的 JSON（`{"data":`）；it 名稱不變
- [x] 4.3 GREEN（TDD）：新增 `src/scoreboard/repository.ts`（`getCurrent`、`putCurrent`；design Decision 3 的單一條件式 SQL）、`src/routes/scoreboard.ts`（`SessionAppEnv` sub-app、`use("*", localAuth, requireSession)`、`zValidator` hook 回 `INVALID_BODY`、`matchId` 檢查）；
  `src/index.ts` 以 `app.route("/api/scoreboard", scoreboardRoutes)` 掛載。4.2 全綠；`pnpm --filter ./hono-pickball typecheck` exit 0
  - 實跑紀錄：`test/scoreboard-current.test.ts` 10/10 綠；`pnpm --filter ./hono-pickball typecheck` exit 0。JSON 語法錯誤：實測 Hono 的 `app.route` 會套用 sub-app 的 `onError`，故於 `scoreboardRoutes` 以 `onError` 將 `HTTPException(400)` 轉為 `{ error: "INVALID_BODY" }`，其餘錯誤維持 Hono 預設（HTTPException 回其 response、其他 500）
  - GREEN 後補強（`63637c8`，Implementer mutation 自檢 M12／M18 存活後加嚴，只新增斷言、不改既有斷言語意）：「B 的 cookie…」補「B 以 version 1 更新後 A 仍為 5:3、version 1」（守 update 的 `user_id` 條件）；「以 version 0 首次寫入…」改送省略 `matchId`／`courtNumber`／`teamPlayers` 的 data，斷言回傳與 GET 皆補為 null（守「寫入與回傳為驗證後輸出」）。紀錄由 leader 依 Stage 1 指正補記
- [x] 4.4 REFACTOR：錯誤回應的建立是否重複（抽成 `src/http/errors.ts` 的小 helper 與否）；無壞味道則註記 skipped
  - skipped：`INVALID_BODY` 回應僅在單一檔案出現三次一行式，抽 helper 只增加間接層；`UNAUTHORIZED`／`VERSION_CONFLICT` 各一處，無壞味道

## 5. 前端：同步基礎（`lib/sync/`）

Depends on: §2

- [x] 5.1 RED（TDD）：新增 `nextjs-pickball/lib/sync/storage-mode.test.ts`，it「只有 session 就緒、auth 啟用且有 user 時為 remote」。確認紅燈
  - 紅燈（commit 8d 之後以暫移實作檔複驗）：`Failed to resolve import "./storage-mode"`，Test Files 1 failed／no tests。無 regression guard。
- [x] 5.2 GREEN（TDD）：新增 `lib/sync/storage-mode.ts`
  - 綠燈：1 passed。
- [ ] 5.3 RED（TDD）：新增 `lib/sync/api-client.test.ts`，五個 it（spec「前端 API 請求的結果分類」錨點）。確認紅燈
- [ ] 5.4 GREEN（TDD）：新增 `lib/sync/api-client.ts`（`requestJson`）
- [ ] 5.5 RED（TDD）：新增 `lib/sync/latest-wins-saver.test.ts`，五個 it（spec「最新優先的雲端儲存與自動重試」錨點；`vi.useFakeTimers()`）。確認紅燈
- [ ] 5.6 GREEN（TDD）：新增 `lib/sync/latest-wins-saver.ts`（`createLatestWinsSaver`；重試間隔常數具名）
- [ ] 5.7 RED（TDD）：新增 `lib/sync/sync-status.test.ts`，it「local、synced、saving 不顯示提示，其餘狀態各有固定文案」。確認紅燈
- [ ] 5.8 GREEN（TDD）：新增 `lib/sync/sync-status.ts`（`SyncStatus` 型別、`syncStatusMessage`）
- [ ] 5.9 REFACTOR：四個模組的命名與匯出一致性；無壞味道則註記 skipped

## 6. 前端：計分板雲端 hook 與選擇器

Depends on: §4、§5

- [ ] 6.1 RED（TDD）：新增 `hooks/useRemoteScoreboardStore.test.tsx`，七個 it（spec「登入時獨立計分板以雲端為準」中 `useRemoteScoreboardStore.test.tsx` 的錨點）。mock `fetch`（`vi.stubGlobal`）。確認紅燈
- [ ] 6.2 GREEN（TDD）：新增 `hooks/useRemoteScoreboardStore.ts`（design Decision 5、6、7；`HYDRATE` 不寫回、衝突重載、401 呼叫 `onUnauthorized`）
- [ ] 6.3 RED（既有守衛）：跑 `pnpm --filter ./nextjs-pickball test --run hooks/hooksInventory.test.ts`，確認「hooks 目錄下每支 hook 都能在規格的歸屬清單中找到」因 `useRemoteScoreboardStore` 未列入主 spec 而**真的轉紅**，貼出輸出
- [ ] 6.4 GREEN（授權的主 spec 同步）：**本 task 明文授權**把 delta `specs/pickleball-guide-page/spec.md` 已定稿的歸屬清單句子原樣搬進主 spec `openspec/specs/pickleball-guide-page/spec.md` 的對應句，只動這一句（B3 tasks 3.6、M14 `4b99156` 前例）；
  commit 訊息 `docs(openspec): 主 spec 歸屬清單同步 useRemoteScoreboardStore（B5 §6）`。重跑 6.3 轉綠。archive 時此段 MODIFIED 應為 no-op
- [ ] 6.5 RED（TDD）：`hooks/useScoreboardStore.test.tsx` **只新增**檔頭 `vi.mock("@/hooks/useSession", ...)` 區塊（預設回本機模式的快照；各新 it 以 `vi.mocked(...).mockReturnValue` 覆寫）與四個 it：
  「已登入且未帶 matchId 時改用雲端並回傳 syncStatus」「session 載入中或訪客時走本機且 syncStatus 為 local」「雲端模式下 dispatch 不寫入 scoreboard:current:v1」「已登入但帶 matchId 時仍走本機分槽且 syncStatus 為 local」。
  確認新 it 紅燈、既有 15 個 it 仍綠（mock 不改變既有行為），貼出輸出；「session 載入中或訪客時走本機」若因只檢查本機行為而先綠，須點名標 regression guard（其 `syncStatus` 斷言應為紅）
- [ ] 6.6 GREEN（TDD）：`hooks/useScoreboardStore.ts`：既有函式本體原封不動改名為同檔的 `useLocalScoreboardStore`（`git diff` 應只顯示函式名稱那一行與新增的選擇器），新增選擇器 `useScoreboardStore`（回傳第四個元素 `syncStatus`）
- [ ] 6.7 REFACTOR：選擇器與雲端 hook 的介面是否足以讓 B6 照抄（`enabled`、`onUnauthorized`、`syncStatus`）；無壞味道則註記 skipped

## 7. E2E 夾具與計分板畫面接線

Depends on: §6

- [ ] 7.1 設定層：`playwright.config.ts` 新增 project `user-data`（design Decision 8；既有五個 project 與 top-level 設定一行不改）；新增 `tests/e2e/helpers/user-data.ts`
  （`clearTestAccountUserData()`；表清單取自 `@pickball/core/api/user-data-tables`；email 跳脫單引號；`execFileSync` 以參數陣列呼叫、不經 shell）
- [ ] 7.2 RED（E2E）：新增 `tests/e2e/user-data/scoreboard-sync.spec.ts`（`test.use({ storageState })`、`test.skip(() => !existsSync(storageStatePath), AUTH_SKIP_REASON)`、`test.beforeEach` 呼叫 `clearTestAccountUserData()`），六個 test（spec 錨點）；
  新增 `tests/e2e/specs/scoreboard-local-mode.spec.ts`（訪客，一個 test）。執行 `pnpm --filter ./nextjs-pickball exec playwright test --workers=1 --project=user-data` 與
  `pnpm --filter ./nextjs-pickball exec playwright test --workers=1 --project=chromium tests/e2e/specs/scoreboard-local-mode.spec.ts`（前後清殘留 dev server），貼出輸出：
  user-data 的六個 test 因畫面尚未接線（沒有 `data-sync-status`、沒有提示文案）而紅；**訪客 spec 在接線前就會綠——紀錄中點名並標 regression guard**（它守的是接線後訪客 DOM 不變）
- [ ] 7.3 GREEN（例外層：純呈現元件，以 7.2 驗收）：新增 `components/sync/SyncStatusNotice.tsx`（`role="status"`、文案取自 `syncStatusMessage`、`null` 時不渲染）；
  `components/scoreboard/Scoreboard.tsx` 依 design Decision 7 接上（`loading`／`load-failed` 取代畫面、其餘疊加、非 local 時根元素帶 `data-sync-status`）。7.2 全綠；
  不得放寬既有 test、不得以 `waitForTimeout` 取代 `data-sync-status` 等待
- [ ] 7.4 REFACTOR：提示的版面是否遮擋計分按鈕（窄螢幕 390px 目視一次並截圖附在紀錄）；無壞味道則註記 skipped

## 8. 文件同步與總驗收

Depends on: §7

- [ ] 8.1 設定層（文件）：`hono-pickball/CLAUDE.md`：路由約定新增「使用者資料 API」段（sub-app、三類授權測試、版本化契約、`USER_DATA_TABLES`）；`localAuth` 位置改為 `src/auth/local-auth-middleware.ts`；
  依賴注意：`zod`、`@hono/zod-validator` 已被 `src` 匯入、移出複審清單（只剩 `date-fns`）；「範圍例外」段落註明計分板已部分上雲、matchmaker 段待 B6。
  `nextjs-pickball/CLAUDE.md`：`lib/sync/`、`components/sync/`、hooks 歸屬 `useRemoteScoreboardStore`、選擇器 hook 慣例、E2E 的 `user-data` project 與 `clearTestAccountUserData`；架構總覽 `/scoreboard` 註明「登入且未綁定場次時以雲端為準」；
  **不動**「matchmaker 為 LocalStorage-only」敘述（B6 改）
- [ ] 8.2 驗收（指令）C1：三段 typecheck 皆 exit 0
- [ ] 8.3 驗收（指令）C2：`pnpm lint` 0 errors、warning 不多於基線
- [ ] 8.4 驗收（指令）C3：`pnpm test` 全綠，記錄三個 workspace 的檔數／測試數與基線差異
- [ ] 8.5 驗收（指令）C4：`pnpm build` exit 0
- [ ] 8.6 驗收（指令）C5：`db:generate` 無新檔、`db:migrate:local` 成功
- [ ] 8.7 驗收（指令）C6：`playwright test --list` 與閱讀 `playwright.config.ts`
- [ ] 8.8 驗收（指令）C7：`.dev.vars` 齊備下依 project 分開跑完整 E2E（前後清殘留 dev server）：
  `for p in chromium firefox mobile-chrome user-data; do pnpm --filter ./nextjs-pickball exec playwright test --workers=1 --project=$p; done`；
  `for p in webkit mobile-safari; do for i in 1 2 3; do pnpm --filter ./nextjs-pickball exec playwright test --workers=1 --project=$p --shard=$i/3; done; done`；
  既有 test 全數原樣通過，新增 test 全 passed，無因缺帳密 skip。結果寫在本 task 後方；失敗不得自行判定為雜訊
- [ ] 8.9 驗收（指令）C8：`DO_NOT_TRACK=1 openspec validate scoreboard-backend --strict` 通過
