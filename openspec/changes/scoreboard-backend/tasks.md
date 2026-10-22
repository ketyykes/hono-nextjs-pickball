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
  - 紅燈（RED commit 之後以暫移實作檔複驗）：`Failed to resolve import "./storage-mode"`，Test Files 1 failed／no tests。無 regression guard。
- [x] 5.2 GREEN（TDD）：新增 `lib/sync/storage-mode.ts`
  - 綠燈：1 passed。
- [x] 5.3 RED（TDD）：新增 `lib/sync/api-client.test.ts`，五個 it（spec「前端 API 請求的結果分類」錨點）。確認紅燈
  - 紅燈：`Failed to resolve import "./api-client"`，Test Files 1 failed／no tests（模組尚不存在）。無 regression guard。
- [x] 5.4 GREEN（TDD）：新增 `lib/sync/api-client.ts`（`requestJson`）
  - 綠燈：5 passed。`ok` 的 `value` 型別為 `T | undefined`（204 時為 undefined）。
- [x] 5.5 RED（TDD）：新增 `lib/sync/latest-wins-saver.test.ts`，五個 it（spec「最新優先的雲端儲存與自動重試」錨點；`vi.useFakeTimers()`）。確認紅燈
  - 紅燈：`Failed to resolve import "./latest-wins-saver"`，Test Files 1 failed／no tests。無 regression guard。
- [x] 5.6 GREEN（TDD）：新增 `lib/sync/latest-wins-saver.ts`（`createLatestWinsSaver`；重試間隔常數具名）
  - 綠燈：5 passed。重試間隔常數 `RETRY_DELAYS_MS`；成功後退避重設（設計同 leader 建議）。
- [x] 5.7 RED（TDD）：新增 `lib/sync/sync-status.test.ts`，it「local、synced、saving 不顯示提示，其餘狀態各有固定文案」。確認紅燈
  - 紅燈：`Failed to resolve import "./sync-status"`，Test Files 1 failed／no tests。無 regression guard。
- [x] 5.8 GREEN（TDD）：新增 `lib/sync/sync-status.ts`（`SyncStatus` 型別、`syncStatusMessage`）
  - 綠燈：1 passed；lib/sync 四檔共 12 passed；tsc exit 0。
- [x] 5.9 REFACTOR：四個模組的命名與匯出一致性；無壞味道則註記 skipped
  - skipped：四模組皆為 `<動詞/名詞>` 單一職責、具名匯出、型別與函式同檔，命名與匯出風格一致，無壞味道。mutation 後補強測試（loading 帶欄位、send reject、dispose 後 save）另以 test commit 記錄。
  - Stage 2 後補 regression guard（實作原本即正確，非 TDD 紅燈）：saver 在途期間新 save 於失敗後取代失敗資料（L14）、requestJson 回傳 schema 解析後的值而非原始 JSON（A12）；兩條對應變異皆已確認轉紅。

## 6. 前端：計分板雲端 hook 與選擇器

Depends on: §4、§5

- [x] 6.1 RED（TDD）：新增 `hooks/useRemoteScoreboardStore.test.tsx`，七個 it（spec「登入時獨立計分板以雲端為準」中 `useRemoteScoreboardStore.test.tsx` 的錨點）。mock `fetch`（`vi.stubGlobal`）。確認紅燈
  - 紅燈：`hooks/useRemoteScoreboardStore.test.tsx` 7 個 it，`Failed to resolve import "./useRemoteScoreboardStore"`（Test Files 1 failed、no tests），原因為功能尚不存在；七個皆非 regression guard（RED commit 855b90b）
- [x] 6.2 GREEN（TDD）：新增 `hooks/useRemoteScoreboardStore.ts`（design Decision 5、6、7；`HYDRATE` 不寫回、衝突重載、401 呼叫 `onUnauthorized`）
  - 綠燈：單檔 7 passed。dirty 標記放在 reducer 狀態（HYDRATE 不標記），saver 於 effect 內建立並於 cleanup dispose（StrictMode 安全）；SyncStatus 映射依 Stage 2 建議（saving 不覆蓋 retrying／conflict／rejected；衝突重載不經 loading）
- [x] 6.3 RED（既有守衛）：跑 `pnpm --filter ./nextjs-pickball test --run hooks/hooksInventory.test.ts`，確認「hooks 目錄下每支 hook 都能在規格的歸屬清單中找到」因 `useRemoteScoreboardStore` 未列入主 spec 而**真的轉紅**，貼出輸出
  - 紅燈（真）：032fab9（6.2 GREEN）之後、6.4 之前實跑，`hooks/hooksInventory.test.ts` 1 failed｜1 passed，`Expected [] / Received ["useRemoteScoreboardStore"]`（hooks/hooksInventory.test.ts:63）
- [x] 6.4 GREEN（授權的主 spec 同步）：**本 task 明文授權**把 delta `specs/pickleball-guide-page/spec.md` 已定稿的歸屬清單句子原樣搬進主 spec `openspec/specs/pickleball-guide-page/spec.md` 的對應句，只動這一句（B3 tasks 3.6、M14 `4b99156` 前例）；
  - 綠燈：主 spec 僅第 141 行一句加入 `useRemoteScoreboardStore`；守衛 2 passed
  commit 訊息 `docs(openspec): 主 spec 歸屬清單同步 useRemoteScoreboardStore（B5 §6）`。重跑 6.3 轉綠。archive 時此段 MODIFIED 應為 no-op
- [x] 6.5 RED（TDD）：`hooks/useScoreboardStore.test.tsx` **只新增**檔頭 `vi.mock("@/hooks/useSession", ...)` 區塊（預設回本機模式的快照；各新 it 以 `vi.mocked(...).mockReturnValue` 覆寫）與四個 it：
  - 紅燈：新增 4 個 it 全紅（`result.current[3]` 為 undefined，選擇器尚不存在），既有 14 個 it 仍綠（Tests 4 failed｜14 passed｜18；tasks 寫 15，實際既有為 14）。「session 載入中或訪客時走本機」的本機行為斷言（寫入 current 槽、無請求）本就綠，屬 regression guard 性質，其 `syncStatus` 為 local 的斷言才是紅燈來源。只在檔頭新增 mock 區塊與 import（vitest import 多了 afterEach）
  「已登入且未帶 matchId 時改用雲端並回傳 syncStatus」「session 載入中或訪客時走本機且 syncStatus 為 local」「雲端模式下 dispatch 不寫入 scoreboard:current:v1」「已登入但帶 matchId 時仍走本機分槽且 syncStatus 為 local」。
  確認新 it 紅燈、既有 15 個 it 仍綠（mock 不改變既有行為），貼出輸出；「session 載入中或訪客時走本機」若因只檢查本機行為而先綠，須點名標 regression guard（其 `syncStatus` 斷言應為紅）
- [x] 6.6 GREEN（TDD）：`hooks/useScoreboardStore.ts`：既有函式本體原封不動改名為同檔的 `useLocalScoreboardStore`（`git diff` 應只顯示函式名稱那一行與新增的選擇器），新增選擇器 `useScoreboardStore`（回傳第四個元素 `syncStatus`）
  - 綠燈：選擇器新增；`git diff` 對本機 hook 只見 `export function` → `function useLocalScoreboardStore` 一行與新增的 import／選擇器；兩檔 25 passed（既有 14＋選擇器 4＋雲端 7）
- [x] 6.7 REFACTOR：選擇器與雲端 hook 的介面是否足以讓 B6 照抄（`enabled`、`onUnauthorized`、`syncStatus`）；無壞味道則註記 skipped
  - REFACTOR skipped：雲端 hook 介面為 `useRemoteScoreboardStore({ enabled, onUnauthorized }) → [state, dispatch, syncStatus]`，選擇器回傳 `[state, dispatch, bindingStatus, syncStatus]`（雲端時 bindingStatus 為 standalone），B6 可照抄；無壞味道
  - Stage 2 必修（TDD）：同一 mount 內 `enabled` true→false→true 且新一輪 GET 回 `data: null` 時殘留前一輪比分。RED：既有錨點 it 內新增一段，實跑 `Expected scores {us:0,them:0} / Received {us:3,them:1}`（`useRemoteScoreboardStore.test.tsx:127`），1 failed｜6 passed；GREEN：`loadCurrent` 一律 `HYDRATE data ?? createInitialState()`
  - Stage 2 補強（regression guard，斷言加進既有 it）：選擇器 401 呼叫 `session.refresh`、已登入 `useScoreboardStore("")` 走雲端、衝突重載 GET 在途期間不為 loading、StrictMode 過期 GET 不覆蓋；四條對應變異皆轉紅

## 7. E2E 夾具與計分板畫面接線

Depends on: §6

- [x] 7.1 設定層：`playwright.config.ts` 新增 project `user-data`（design Decision 8；既有五個 project 與 top-level 設定一行不改）；新增 `tests/e2e/helpers/user-data.ts`
  （`clearTestAccountUserData()`；表清單取自 `@pickball/core/api/user-data-tables`；email 跳脫單引號；`execFileSync` 以參數陣列呼叫、不經 shell）
  - 實跑紀錄：設定層免紅燈；tsc exit 0；`playwright.config.ts` diff 僅新增 `user-data` project（既有五個與 top-level 未動）。helper 的實際執行驗證併入 7.2（beforeEach 會呼叫）
- [x] 7.2 RED（E2E）：新增 `tests/e2e/user-data/scoreboard-sync.spec.ts`（`test.use({ storageState })`、`test.skip(() => !existsSync(storageStatePath), AUTH_SKIP_REASON)`、`test.beforeEach` 呼叫 `clearTestAccountUserData()`），六個 test（spec 錨點）；
  新增 `tests/e2e/specs/scoreboard-local-mode.spec.ts`（訪客，一個 test）。執行 `pnpm --filter ./nextjs-pickball exec playwright test --workers=1 --project=user-data` 與
  `pnpm --filter ./nextjs-pickball exec playwright test --workers=1 --project=chromium tests/e2e/specs/scoreboard-local-mode.spec.ts`（前後清殘留 dev server），貼出輸出：
  user-data 的六個 test 因畫面尚未接線（沒有 `data-sync-status`、沒有提示文案）而紅；**訪客 spec 在接線前就會綠——紀錄中點名並標 regression guard**（它守的是接線後訪客 DOM 不變）
  - 紅燈紀錄：`playwright test --workers=1 --project=user-data` → 6 failed（`getByText('無法載入雲端資料，請重新整理頁面')` 與 `[data-sync-status="synced"]` 皆 `element(s) not found`，beforeEach 的 `clearTestAccountUserData()` 實際執行成功，代表核心套件 runtime import 在 Playwright 下可用）。六個皆為真紅燈、無先綠者。
  - regression guard：`scoreboard-local-mode.spec.ts`「訪客模式下計分板不渲染同步提示與 data-sync-status」→ `--project=chromium` 1 passed（接線前即綠，守的是接線後訪客 DOM 不變）
  - 偏離：衝突 test 讓 A 得分兩次（spec 為一次）——B 本機得一分若 A 也只有一分，無法區分「載入雲端」與「保留本機」
- [x] 7.3 GREEN（例外層：純呈現元件，以 7.2 驗收）：新增 `components/sync/SyncStatusNotice.tsx`（`role="status"`、文案取自 `syncStatusMessage`、`null` 時不渲染）；
  `components/scoreboard/Scoreboard.tsx` 依 design Decision 7 接上（`loading`／`load-failed` 取代畫面、其餘疊加、非 local 時根元素帶 `data-sync-status`）。7.2 全綠；
  不得放寬既有 test、不得以 `waitForTimeout` 取代 `data-sync-status` 等待
  - 實跑紀錄：`--project=user-data` 6 passed；tsc exit 0；提示以 fixed 定位疊加、不佔 flex 高度。mutation 結果見 7.4 紀錄後段
- [x] 7.4 REFACTOR：提示的版面是否遮擋計分按鈕（窄螢幕 390px 目視一次並截圖附在紀錄）；無壞味道則註記 skipped
  - mutation 紀錄（7.3 GREEN 後、持鎖，每條只還原被變異的檔）：M1 helper 多刪 `session` → user-data 6 failed（轉紅，含「清空使用者資料後仍為登入態…」）；M2 helper 改為不刪（`DELETE FROM`→`SELECT * FROM`）→ 4 failed／2 passed（含「清空…」「另一裝置先寫入…」「儲存失敗…」「另一個瀏覽器 context…」轉紅；2 個本就不依賴已清空資料者仍綠）；M3 local 也帶 `data-sync-status` → 訪客 spec 轉紅；M4 `SyncStatusNotice` 在 `null` 時渲染 `<div role="status" />` → 原訪客 spec 仍綠（漏洞），補斷言 `getByRole("status")` 計數 0 後轉紅（commit「訪客 spec 補斷言…」）；M5 `load-failed` 仍渲染計分畫面 → 「雲端載入失敗時…」轉紅（其餘 5 綠）；M6 根元素不帶 `data-sync-status` → 5 failed／1 passed（僅 load-failed 那題仍綠，因取代畫面的根元素另帶屬性）；M7 對照組（`=== "local" ? undefined : s` 改寫為 `!== "local" ? s : undefined`）→ 6 passed 維持綠
  - 7.4 截圖（不 commit）：`/tmp/b5-7.4-conflict.png`（390×844、`conflict`）、`/tmp/b5-7.4-retrying.png`（`retrying`，為初版 fixed 定位，已蓋住直式提示橫幅）、`/tmp/b5-7.4-conflict-landscape.png`（844×390）。觀察：初版 `fixed top-nav` 在直向會蓋住「建議橫向使用」橫幅（壞味道，已修）；改為面板容器內 `absolute`、直向置於兩面板分隔帶中央後，橫幅、設定列、兩顆贏球鈕皆未被遮擋，且提示 `pointer-events-none`（疊加時按鈕仍可點）；橫向貼面板區頂端，只會壓到「我方／對方 · 11 分制」小字、不蓋比分與按鈕
  - Stage 2 修正（持鎖）：① 訪客 spec 的 `getByRole("status")` 在直式 viewport 會抓到 `OrientationHint` 橫幅（mobile-safari／mobile-chrome 原為 `Expected: 0 Received: 1`），改為進頁前於 sessionStorage 寫入 `scoreboard:hint-dismissed`（與 OrientationHint 的 DISMISS_KEY 及 scoreboard.spec 既有做法一致）；五個瀏覽器 project 各跑該 spec 皆 1 passed。② 「雲端載入失敗時…」內先掛起 GET 並斷言 loading 文案、`[data-sync-status="loading"]`、贏球鈕數 0，再放行回 500。③ helper 以 try/catch 只拋出表名與 exit status，不含 SQL／email。④ config 縮排與 spec 常數整理。
  - Stage 2 變異：N1 `loading` 不取代畫面 → 「雲端載入失敗時…」轉紅（`toHaveCount` Received: 1，其餘 5 綠）；N2／N3 Notice 在 null 時渲染空 `role="status"` → mobile-safari、mobile-chrome 皆轉紅（Received: 1）；N4 對照組（`!message`）mobile-safari 維持 1 passed
  - 窄螢幕位置修正：直向中央放置在 320×568 會蓋到贏球鈕，頂端 `top-2` 於 320／375 蓋到比分數字，最後改為頂端單行小字（`top-0.5`、`text-xs`、`py-1`）。以 conflict 文案（最寬）量測提示與贏球鈕、比分數字的外框重疊：320×568 僅與比分元素外框重疊 5px（目視 `/tmp/b5-7.4-fix-320x568.png` 為字框上緣空白，未蓋到數字；不蓋贏球鈕）；375×667、390×844、844×390 皆無重疊。截圖：`/tmp/b5-7.4-fix-320x568.png`、`-375x667.png`、`-390x844.png`、`-844x390.png`。此修正取代上方初版位置的描述（橫向亦同樣貼頂端）
  - 實跑紀錄：user-data 6 passed；chromium `scoreboard*.spec.ts`＋`auth-session.spec.ts` 45 passed、0 skipped；`--list` 既有五個 project 各 142、user-data 6

## 8. 文件同步與總驗收

Depends on: §7

- [x] 8.1 設定層（文件）：`hono-pickball/CLAUDE.md`：路由約定新增「使用者資料 API」段（sub-app、三類授權測試、版本化契約、`USER_DATA_TABLES`）；`localAuth` 位置改為 `src/auth/local-auth-middleware.ts`；
  依賴注意：`zod`、`@hono/zod-validator` 已被 `src` 匯入、移出複審清單（只剩 `date-fns`）；「範圍例外」段落註明計分板已部分上雲、matchmaker 段待 B6。
  `nextjs-pickball/CLAUDE.md`：`lib/sync/`、`components/sync/`、hooks 歸屬 `useRemoteScoreboardStore`、選擇器 hook 慣例、E2E 的 `user-data` project 與 `clearTestAccountUserData`；架構總覽 `/scoreboard` 註明「登入且未綁定場次時以雲端為準」；
  **不動**「matchmaker 為 LocalStorage-only」敘述（B6 改）
- [x] 8.2 驗收（指令）C1：三段 typecheck 皆 exit 0
  結果：`pnpm -r exec tsc --noEmit`、`pnpm --filter ./hono-pickball typecheck`（含 test 段）、`pnpm --filter ./packages/pickball-core typecheck`（含 test 段）皆 exit 0（2026-10-22）。
- [x] 8.3 驗收（指令）C2：`pnpm lint` 0 errors、warning 不多於基線
  結果：`pnpm lint` exit 0，0 errors／3 warnings（`useQuiz.ts`、`useRosterStore.ts`、`useScoreboardStore.ts` 的 unused-vars，與基線 3 條相同）。
- [x] 8.4 驗收（指令）C3：`pnpm test` 全綠，記錄三個 workspace 的檔數／測試數與基線差異
  結果：`pnpm test` exit 0 全綠。前端 92 檔／846（基線 87／823，+5 檔／+23）；後端 16 檔／69（基線 13／51，+3 檔／+18）；核心套件 2 檔／4（基線 1／2，+1 檔／+2）。
- [x] 8.5 驗收（指令）C4：`pnpm build` exit 0
  結果：`pnpm build` exit 0；後端 `Total Upload: 2376.84 KiB / gzip: 394.74 KiB`，前端 OpenNext build Done。
- [x] 8.6 驗收（指令）C5：`db:generate` 無新檔、`db:migrate:local` 成功
  結果：`db:generate` 輸出「No schema changes, nothing to migrate」，`git status --porcelain hono-pickball/drizzle` 為空；`db:migrate:local` 輸出「No migrations to apply!」（`0001` 已套用）。
- [x] 8.7 驗收（指令）C6：`playwright test --list` 與閱讀 `playwright.config.ts`
  結果：`playwright test --list` 共 716 tests／17 files；chromium、firefox、webkit、mobile-chrome、mobile-safari 各 142（基線 141＋訪客 spec 1），user-data 6。`playwright.config.ts` 閱讀：既有五個 project 的 `use` 皆僅 `devices[...]`，皆無 `testDir`／`storageState`，top-level `use` 與 user-data 的 `use` 亦無 `storageState`（僅註解提及）；`scoreboard-sync.spec.ts` 的 6 條只出現在 `[user-data]`，`[user-data]` 下沒有 `specs/` 的 test。
- [x] 8.8 驗收（指令）C7：`.dev.vars` 齊備下依 project 分開跑完整 E2E（前後清殘留 dev server）：
  `for p in chromium firefox mobile-chrome user-data; do pnpm --filter ./nextjs-pickball exec playwright test --workers=1 --project=$p; done`；
  `for p in webkit mobile-safari; do for i in 1 2 3; do pnpm --filter ./nextjs-pickball exec playwright test --workers=1 --project=$p --shard=$i/3; done; done`；
  既有 test 全數原樣通過，新增 test 全 passed，無因缺帳密 skip。結果寫在本 task 後方；失敗不得自行判定為雜訊
  結果：`.dev.vars` 齊備、持共用鎖、整輪起始 load 約 2.7（各 project 開始時 1 分鐘 load 2.7～5.1，皆低於 20）。0 failed、0 flaky。passed／skipped：chromium 142／0；firefox 130／12；mobile-chrome 140／2；user-data 6／0；webkit 三 shard 43+40+47＝130／12（5+7+0）；mobile-safari 三 shard 43+40+47＝130／12（5+7+0）。舊五 project 加總 672 passed／38 skipped（基線 667／38，+5＝每 project 一條訪客 spec）；另 user-data 6 passed。總計 678 passed／38 skipped／0 failed。skipped 38 全為既有條件 skip（非 chromium 瀏覽器或 project 名稱非 chromium 者略過）：auth-proxy 8 條、api-health 6 條、navbar-rwd 與 auth-session 窄螢幕共 24 條，與基線相同；沒有因缺帳密的 skip（上述 skip 理由皆為瀏覽器條件，user-data 與訪客 spec 皆 0 skipped）。
- [x] 8.9 驗收（指令）C8：`DO_NOT_TRACK=1 openspec validate scoreboard-backend --strict` 通過
  結果：`DO_NOT_TRACK=1 openspec validate scoreboard-backend --strict` 輸出「Change 'scoreboard-backend' is valid」。
