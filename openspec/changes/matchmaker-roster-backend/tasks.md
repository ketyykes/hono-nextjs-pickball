# Tasks: matchmaker-roster-backend

> **TDD 三步**（root `CLAUDE.md`）：RED（先寫失敗測試，以單檔指令在 shell 實際看到紅燈並貼出輸出）→ GREEN（最小實作至綠）→ REFACTOR（無壞味道註記 skipped）。
> 單檔指令：前端 `pnpm --filter ./nextjs-pickball test --run <path>`；後端 `pnpm --filter ./hono-pickball test --run test/<檔>.test.ts`；
> 核心 `pnpm --filter ./packages/pickball-core test --run test/<檔>.test.ts`。**`--run` 前不可加 `--`**。
>
> **紅燈要是真的**：加入即綠者 MUST 誠實標註 regression guard，**SHALL NOT 用「改斷言看紅再改回」偽造紅燈**。
> 一個 RED task 可一次寫入多個 it（皆須在 GREEN 前實際看到紅），會先綠的 it 必須在紀錄中逐一點名並標 regression guard。
>
> **標註**：`TDD`；`regression guard`；`設定層`（`src/db/schema.ts`、`drizzle/**`、`tests/**` helper、文件）；`例外層`（`app/**/page.tsx`、純呈現或 I/O 樣板元件，以 E2E 驗收）；`驗收（指令）`（test-plan C1～C7）。
>
> **前提**：B5 `scoreboard-backend` 已合併回 `main` 並 archive。**不新增任何第三方相依**；**禁止任何遠端 CF 操作**（`wrangler d1` 一律 `--local --env local`）；不 push。
> 測試帳密不得寫進任何會被 commit 的檔案或訊息。it／test 名稱 MUST 與 delta spec「驗收」錨點逐字一致；測試一律顯式匯入。
> **訪客路徑零迴歸**：本機實作（`useLocalRosterStore`、`lib/matchmaker/storage.ts` 既有函式、`roster.ts`、`roster-csv.ts`、`transfer-storage.ts`、`backup.ts`）一行不改；
> 既有 it 的名稱與斷言一律不得修改；允許碰的既有測試檔只有 `hooks/useRosterStore.test.tsx`（只新增 mock 區塊與新 it）、`lib/matchmaker/storage.test.ts`（只新增 it）、`hono-pickball/test/d1-schema.test.ts`（只新增 it）。

## 1. 對齊 main＋Context7 查證（不寫產品程式碼）

- [x] 1.1 確認分支 `change/matchmaker-roster-backend`、工作樹乾淨；`pnpm install` 後 lockfile 零變動；`db:migrate:local`、`db:seed:local` 成功；
  `pnpm test` baseline（三個 workspace）、三段 typecheck、`pnpm lint`；`playwright test --list` 各 project 數量；回填 environment.md 並 commit
- [x] 1.2 對齊 B5 實際落地：`src/auth/local-auth-middleware.ts`、`src/auth/require-session.ts`、`src/routes/scoreboard.ts`、`src/scoreboard/repository.ts`、`test/helpers/session.ts`、
  `test/user-data-tables.test.ts`、`packages/pickball-core/src/api/*`、`nextjs-pickball/lib/sync/*`、`hooks/useRemoteScoreboardStore.ts`、`components/sync/SyncStatusNotice.tsx`、
  `playwright.config.ts` 的 `user-data` project、`tests/e2e/helpers/user-data.ts`、B5 design Open Questions。實際簽章與本 design Context 不同處記入 Open Questions。
  比對本 change 的 MODIFIED Requirement 與目前主 spec（`player-roster` 兩個、`data-transfer` 一個、`pickleball-guide-page` 一個——後者 MUST 已含 B5 的 `useRemoteScoreboardStore`）；
  若主 spec 的原文與 delta 的原文部分不同，以主 spec 為底重新套用本 change 的增修並 commit
- [x] 1.3 Context7 查證（MUST，附 library ID 記入 design.md「apply §1 查證紀錄」）：`/drizzle-team/drizzle-orm-docs`（複合主鍵 `primaryKey`、`insert().select()` 或 `sql` 子查詢、`db.batch` 於 D1）；
  `/llmstxt/developers_cloudflare_d1_llms-full_txt`（batch 中某陳述式失敗時整批回滾）。與 design Decision 1、2 的差異記入 Open Questions
- [x] 1.4 一次性實測（不 commit）：在 workerd 測試中以 drizzle 執行「`batch([insert 新 id, insert 既有 id])`」確認整批失敗且新 id 未寫入；以及 design Open Questions 1 的 `sort_order` 子查詢寫法。結果寫入 Open Questions

## 2. 核心套件：名單 API 契約

Depends on: §1

- [x] 2.1 RED（TDD）：新增 `packages/pickball-core/test/api/players.test.ts`，it「PlayerImportRequestSchema 要求至少一位且 id 不重複」「PlayerListResponseSchema 以 PlayerSchema 驗證每一筆」。確認紅燈
- [x] 2.2 GREEN（TDD）：新增 `src/api/players.ts`；`CORE_MODULES` 加一項

## 3. 後端：資料表與名單 API

Depends on: §2

- [x] 3.1 RED（TDD）：`test/d1-schema.test.ts` 新增四個 it（spec `backend-database` 錨點）。確認紅燈（表不存在）。
  另記錄：設定層 3.2 加表後，B5 的「USER_DATA_TABLES 恰為 auth 以外的所有資料表」會因清單未更新而**真的轉紅**（守衛生效的證據），貼出輸出
- [x] 3.2 GREEN（設定層＋TDD）：`src/db/schema.ts` 加 `matchmakerPlayers`（複合主鍵）；`pnpm --filter ./hono-pickball db:generate --name matchmaker_players`（不手改）；再跑一次確認無新檔；
  核心套件 `USER_DATA_TABLES` 加 `matchmaker_players`；`db:migrate:local`；3.1 與守衛皆綠
- [ ] 3.3 RED（TDD）：新增 `test/matchmaker-players.test.ts`，寫入 spec「參賽者雲端 API」的全部 15 個 it。確認紅燈並貼出輸出；
  **「auth 停用…皆回 404」在路由不存在時同樣是 404，預期先綠——點名並標 regression guard**。
  另依 design Open Questions 4 加兩個守護 it（不在 spec 錨點內）：「不從 query 或 body 接受 userId」「getSession 拋出例外時回 500」（路由不存在時為 404 → 真紅）
- [ ] 3.4 GREEN（TDD）：新增 `src/matchmaker/players-repository.ts`（design Decision 2 的 SQL）、`src/routes/matchmaker.ts`（`SessionAppEnv` sub-app、`use("*", localAuth, requireSession)`、`zValidator` hook、path id 檢查）；
  `src/index.ts` 以 `app.route("/api/matchmaker", matchmakerRoutes)` 掛載。3.3 全綠；`pnpm --filter ./hono-pickball typecheck` exit 0
- [ ] 3.5 REFACTOR：與 `src/scoreboard/repository.ts` 是否有可共用的版本化寫入片段（若抽出，B5 的測試 MUST 原樣通過）；無壞味道則註記 skipped。
  **另（design Open Questions 5，B5 帶過來的待辦 2）**：把 sub-app 的 `onError`（`HTTPException(400)` → `INVALID_BODY`）與 `zValidator` 的 hook 抽到 `src/http/`，`scoreboard.ts` 與 `matchmaker.ts` 共用；純重構，B5 與 3.3 的測試原樣通過
- [ ] 3.6 regression guard（design Open Questions 4，B5 帶過來的待辦 1；行為早已實作，加入即綠者如實標註，不偽造紅燈）：
  ① `test/user-data-tables.test.ts` 的查詢字串 `NOT LIKE '_cf_%'` 改為 `NOT GLOB '_cf_*'`（只改查詢字串，it 名稱與斷言不變；coordinator 授權的唯一既有測試檔例外）；
  ② `test/scoreboard-current.test.ts` **只新增** 三個 it：「PUT 忽略 query 與 body 中的 userId，一律寫入登入者本人」「getSession 拋出例外時回 500」「已有資料時 GET 回 200 與該筆資料」。
  以 mutation 證明三者守得住（PUT 改讀 `?userId=`、`onError` 吞 500、GET 改回 201 等）

## 4. 前端：名單 API 包裝與本機進度清除

Depends on: §3

- [ ] 4.1 RED（TDD）：新增 `lib/sync/roster-api.test.ts`，it「名單 API 包裝以正確的方法、路徑與 body 呼叫 requestJson」。確認紅燈
- [ ] 4.2 GREEN（TDD）：新增 `lib/sync/roster-api.ts`
- [ ] 4.3 RED（TDD）：`lib/matchmaker/storage.test.ts` **只新增** it「resetLocalMatchProgress 只移除回合、歷史與分槽，保留名單與獨立計分板」。確認紅燈
- [ ] 4.4 GREEN（TDD）：`lib/matchmaker/storage.ts` 新增 `resetLocalMatchProgress()`（key 取自與 `RESET_KEYS` 相同的常數；既有函式與 `RESET_KEYS` 不改）

## 5. 前端：名單雲端 hook 與選擇器

Depends on: §4

- [ ] 5.1 RED（TDD）：新增 `hooks/useRemoteRosterStore.test.tsx`，spec 中該檔的全部 11 個 it（「登入時名單以雲端為準」9 個＋「重置名單與二次確認」2 個）。mock `fetch`、stub `crypto.randomUUID`。確認紅燈
- [ ] 5.2 GREEN（TDD）：新增 `hooks/useRemoteRosterStore.ts`（design Decision 3、5）
- [ ] 5.3 RED（既有守衛）：跑 `hooks/hooksInventory.test.ts`，確認因 `useRemoteRosterStore` 未列入主 spec 而**真的轉紅**，貼出輸出
- [ ] 5.4 GREEN（授權的主 spec 同步）：**本 task 明文授權**把 delta `specs/pickleball-guide-page/spec.md` 已定稿的歸屬清單句子原樣搬進主 spec `openspec/specs/pickleball-guide-page/spec.md` 的對應句，只動這一句（B3 3.6、B5 6.4 前例）；
  commit 訊息 `docs(openspec): 主 spec 歸屬清單同步 useRemoteRosterStore（B6 §5）`。重跑 5.3 轉綠。archive 時此段 MODIFIED 應為 no-op
- [ ] 5.5 RED（TDD）：`hooks/useRosterStore.test.tsx` **只新增** `vi.mock("@/hooks/useSession", ...)` 區塊（預設本機快照）與三個 it：「已登入時改用雲端名單並回傳 syncStatus」
  「session 載入中或訪客時走本機且 syncStatus 為 local」「雲端模式下變更名單不寫入 matchmaker:roster:v1」。確認新 it 紅燈、既有 8 個 it 仍綠；先綠的斷言點名標註
- [ ] 5.6 GREEN（TDD）：`hooks/useRosterStore.ts`：既有函式本體原封不動改名為同檔的 `useLocalRosterStore`（`git diff` 只見函式名稱那一行與新增部分）；新增選擇器 `useRosterStore`；`UseRosterStoreResult` 加 `syncStatus`
- [ ] 5.7 REFACTOR：`useRemoteRosterStore` 與 `useRemoteScoreboardStore` 的重複（載入／衝突重載／401 處理）是否值得抽共用 hook——**只在兩者皆有測試守住時**才抽，抽出後 B5 的測試 MUST 原樣通過；否則註記 skipped 並說明理由

## 6. 前端：資料頁雲端分支

Depends on: §5

- [ ] 6.1 RED（TDD）：新增 `lib/matchmaker/remote-transfer.test.ts`，三個 it（「雲端 CSV 匯入以雲端現有名單計算並只送出新增的參賽者」「雲端 CSV 匯入失敗時回傳錯誤且不視為成功」「雲端備份快照的參賽者取自雲端、回合與歷史取自本機」）。確認紅燈
- [ ] 6.2 GREEN（TDD）：新增 `lib/matchmaker/remote-transfer.ts`（design Decision 6）

## 7. E2E 與頁面接線

Depends on: §6

- [ ] 7.1 RED（E2E）：新增 `tests/e2e/user-data/roster-sync.spec.ts`（`test.use({ storageState })`、skip 條件、`test.beforeEach` 呼叫 `clearTestAccountUserData()`），spec 錨點的全部 10 個 test。
  執行 `pnpm --filter ./nextjs-pickball exec playwright test --workers=1 --project=user-data tests/e2e/user-data/roster-sync.spec.ts`（前後清殘留 dev server），貼出輸出：
  依賴頁面接線者（`data-sync-status`、提示、資料頁分支）應為紅；**已由 §5 選擇器達成而先綠者逐一點名標 regression guard**
- [ ] 7.2 GREEN（例外層：頁面與 I/O 樣板元件，以 7.1 驗收）：`app/matchmaker/{page,players/page,stats/page}.tsx` 依 spec 接上 `SyncStatusNotice` 與 `data-sync-status`（loading／load-failed 取代主要內容；所有 hooks 在 early return 前呼叫）；
  `components/matchmaker/RosterCsvImportSection.tsx`、`JsonBackupSection.tsx` 依 `resolveStorageMode(useSession())` 分支（本機分支程式碼不動）。7.1 全綠；不得以 `waitForTimeout` 取代狀態等待
- [ ] 7.3 REFACTOR：三個頁面的同步提示接線是否重複到值得抽成小元件；無壞味道則註記 skipped

## 8. 文件同步與總驗收

Depends on: §7

- [ ] 8.1 設定層（文件）：`nextjs-pickball/CLAUDE.md` 改寫「matchmaker 為 LocalStorage-only」敘述（訪客為本機；登入後名單以雲端為準，回合與歷史待 B7、B8）；hooks 歸屬加 `useRemoteRosterStore`；
  `lib/sync/roster-api.ts`、`lib/matchmaker/remote-transfer.ts`；資料頁登入態差異。`hono-pickball/CLAUDE.md` 改寫「範圍例外」段落（名單已上雲）、路由約定加 `/api/matchmaker/*` 與多筆契約；
  design「交接給 B7～B9」四點寫入適當段落
- [ ] 8.2 驗收（指令）C1：三段 typecheck 皆 exit 0
- [ ] 8.3 驗收（指令）C2：`pnpm lint` 0 errors、warning 不多於基線
- [ ] 8.4 驗收（指令）C3：`pnpm test` 全綠，記錄三個 workspace 的檔數／測試數與基線差異
- [ ] 8.5 驗收（指令）C4：`pnpm build` exit 0
- [ ] 8.6 驗收（指令）C5：`db:generate` 無新檔、`db:migrate:local` 成功
- [ ] 8.7 驗收（指令）C6：`.dev.vars` 齊備下依 project 分開跑完整 E2E（前後清殘留 dev server）：
  `for p in chromium firefox mobile-chrome user-data; do pnpm --filter ./nextjs-pickball exec playwright test --workers=1 --project=$p; done`；
  `for p in webkit mobile-safari; do for i in 1 2 3; do pnpm --filter ./nextjs-pickball exec playwright test --workers=1 --project=$p --shard=$i/3; done; done`；
  既有 test 全數原樣通過，新增 test 全 passed，無因缺帳密 skip。結果寫在本 task 後方；失敗不得自行判定為雜訊
- [ ] 8.8 驗收（指令）C7：`DO_NOT_TRACK=1 openspec validate matchmaker-roster-backend --strict` 通過
