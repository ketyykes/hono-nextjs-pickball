# Tasks: matchmaker-round-score-backend

> **TDD 三步**（root `CLAUDE.md`）：RED（先寫失敗測試，以單檔指令在 shell 實際看到紅燈並貼出輸出）→ GREEN（最小實作至綠）→ REFACTOR（無壞味道註記 skipped）。
> 單檔指令：前端 `pnpm --filter ./nextjs-pickball test --run <path>`；後端 `pnpm --filter ./hono-pickball test --run test/<檔>.test.ts`；
> 核心 `pnpm --filter ./packages/pickball-core test --run test/<檔>.test.ts`。**`--run` 前不可加 `--`**。
>
> **紅燈要是真的**：加入即綠者 MUST 誠實標註 regression guard，**SHALL NOT 用「改斷言看紅再改回」偽造紅燈**。
> 一個 RED task 可一次寫入多個 it（皆須在 GREEN 前實際看到紅），會先綠的 it 必須在紀錄中逐一點名並標 regression guard。
>
> **標註**：`TDD`；`regression guard`；`設定層`（`src/db/schema.ts`、`drizzle/**`、`tests/**` helper、文件）；`例外層`（`app/**/page.tsx`、純呈現或 I/O 樣板元件，以 E2E 驗收）；`驗收（指令）`（test-plan C1～C7）。
>
> **前提**：B4 `pickball-core-package`、B5 `scoreboard-backend`、B6 `matchmaker-roster-backend` 皆已合併回 `main` 並 archive。**不新增任何第三方相依**；**禁止任何遠端 CF 操作**（`wrangler d1` 一律 `--local --env local`）；不 push。
> 測試帳密不得寫進任何會被 commit 的檔案或訊息。it／test 名稱 MUST 與 delta spec「驗收」錨點逐字一致；測試一律顯式匯入。
> **訪客路徑零迴歸**：本機實作（`useLocalRoundStore` 本體、`useLocalScoreboardStore`、`useLocalRosterStore`、`round-storage.ts`、`match-slots.ts`、`scoreboard-binding.ts`、核心 `round.ts`／`rating.ts`／`history.ts`）一行不改；
> 既有 it 的名稱與斷言一律不得修改，**唯一例外**為：`hooks/useScoreboardStore.test.tsx` 刪除 B5 的「已登入但帶 matchId 時仍走本機分槽且 syncStatus 為 local」；
> `lib/matchmaker/storage.test.ts`、`hooks/useRemoteRosterStore.test.tsx`、`lib/matchmaker/remote-transfer.test.ts` 各改寫一個 B6 的 it（名稱與斷言依 delta spec）。
> 允許新增 it 的既有測試檔：`hooks/useRoundStore.test.tsx`（只新增 `vi.mock("@/hooks/useSession", ...)` 區塊與新 it）、`hooks/useScoreboardStore.test.tsx`、`hooks/useRemoteRosterStore.test.tsx`、
> `hono-pickball/test/d1-schema.test.ts`、`hono-pickball/test/matchmaker-players.test.ts`、`packages/pickball-core/test/module-boundary.test.ts`（清單）。

## 1. 對齊 main＋Context7 查證（不寫產品程式碼）

- [x] 1.1 確認分支 `change/matchmaker-round-score-backend`、工作樹乾淨；`pnpm install` 後 lockfile 零變動；`db:migrate:local`、`db:seed:local` 成功；
  `pnpm test` baseline（三個 workspace）、三段 typecheck、`pnpm lint`；`playwright test --list` 各 project 數量；回填 environment.md 並 commit
- [x] 1.2 對齊 B4～B6 實際落地：`packages/pickball-core/src/{matchmaker/round,matchmaker/history,scoreboard/types,api/*}.ts` 的實際匯出（`submitScore` 簽章、`ScoreboardState` schema 名稱）、
  `hono-pickball/src/{routes/matchmaker.ts,matchmaker/players-repository.ts,auth/*}`、`test/helpers/session.ts`、`test/matchmaker-players.test.ts`、
  `nextjs-pickball/{lib/sync/*,hooks/useRemoteRosterStore.ts,hooks/useRosterStore.ts,hooks/useScoreboardStore.ts,hooks/useRemoteScoreboardStore.ts,lib/matchmaker/remote-transfer.ts,lib/matchmaker/storage.ts}`、
  `tests/e2e/user-data/*`、B5／B6 design Open Questions。實際簽章與本 design Context 不同處記入 Open Questions。
  比對本 change 的 MODIFIED Requirement 與目前主 spec：`user-data-sync`（一個）、`round-lifecycle`（兩個）、`match-history`（一個）、`match-rating`（一個）、`scoreboard`（兩個，B5 版本）、
  `player-roster`（兩個，B6 版本）、`data-transfer`（一個，B6 版本）、`pickleball-guide-page`（一個——MUST 已含 B6 的 `useRemoteRosterStore`）；
  **若主 spec 的原文與 delta 的原文部分不同（B5／B6 archive 時的調整），以主 spec 為底重新套用本 change 的增修並 commit**
- [x] 1.3 Context7 查證（MUST，附 library ID 記入 design.md「apply §1 查證紀錄」）：`/llmstxt/developers_cloudflare_d1_llms-full_txt`（batch 回滾、`json_each`、limits 中 batch 的 query 計數）；
  `/websites/sqlite_docs`（NOT NULL 衝突處理預設 ABORT；`INSERT OR IGNORE`／`OR REPLACE` 對 NOT NULL 的行為——design Open Questions 3）；
  `/drizzle-team/drizzle-orm-docs`（`db.batch` 搭配 `db.run`／`db.all` 的 `sql`、`insert().select()`、`text(..., { mode: "json" })`）。與 design Decision 2、4、5 的差異記入 Open Questions
- [x] 1.4 一次性實測（不 commit）：在 workerd 測試中以 drizzle 執行 design Decision 2 的守衛 batch（條件真／假各一次），記錄 NOT NULL 違反的完整錯誤訊息；
  Decision 4 的孤兒分槽 DELETE 與 Decision 5 的 `INSERT … SELECT … WHERE EXISTS … RETURNING` 寫法。結果寫入 design Open Questions 1、2

## 2. 核心套件：回合與分槽 API 契約

Depends on: §1

- [x] 2.1 RED（TDD）：新增 `packages/pickball-core/test/api/round.test.ts`，it「MatchSlotListResponseSchema 要求每筆分槽的 matchId 為字串」「SubmitScoreRequestSchema 要求兩個比分字串與正整數 roundVersion」。確認紅燈
- [x] 2.2 GREEN（TDD）：新增 `src/api/round.ts`（design Decision 11）；`CORE_MODULES` 加一項

## 3. 後端：資料表與整批守衛

Depends on: §2

- [x] 3.1 RED（TDD）：`test/d1-schema.test.ts` 新增四個 it（spec `backend-database` 錨點）。確認紅燈（表不存在）
- [x] 3.2 GREEN（設定層＋TDD）：`src/db/schema.ts` 加四張表；`pnpm --filter ./hono-pickball db:generate --name matchmaker_round_slots_history`（不手改）；再跑一次確認無新檔；`db:migrate:local`；3.1 綠。
  之後先跑 `test/user-data-tables.test.ts`，確認 B5 的「USER_DATA_TABLES 恰為 auth 以外的所有資料表」**真的轉紅**（清單未更新）並貼出輸出；再於核心套件 `USER_DATA_TABLES` 加四張表，守衛轉綠
- [x] 3.3 RED（TDD）：新增 `test/d1-batch-guard.test.ts`，spec `user-data-sync`「後端多表寫入以單一 batch 與整批守衛完成」的三個 it。確認紅燈並貼出輸出；
  **「batch 中影響 0 列的 UPDATE 不會使整批回滾」描述的是 D1 的平台行為，3.2 建表後即綠——點名並標 regression guard（characterization）**；另兩個因 `batch-guard.ts` 不存在而紅
- [x] 3.4 GREEN（TDD）：新增 `src/matchmaker/batch-guard.ts`（守衛陳述式產生器、`isBatchGuardViolation`）。3.3 全綠

## 4. 後端：回合與分槽 API

Depends on: §3

- [ ] 4.1 RED（TDD）：新增 `test/matchmaker-round.test.ts`（spec「回合與送出比分的雲端 API」中該檔的 it，以及 `match-history`「回合 PUT 不新增、不修改也不刪除任何歷史」）與
  `test/matchmaker-slots.test.ts`（該檔的三個 it）。確認紅燈並貼出輸出；
  **「auth 停用…皆回 404」在路由不存在時同樣是 404，預期先綠——點名並標 regression guard**；「未登入…皆回 401」若因 B6 sub-app 的 `requireSession` 先綠，同樣點名標註
- [ ] 4.2 GREEN（TDD）：新增 `src/matchmaker/round-repository.ts`（design Decision 4）、`src/matchmaker/slots-repository.ts`（Decision 5）；`src/routes/matchmaker.ts` 加 `/round`、`/slots`、`/slots/:matchId` 路由
  （`zValidator` hook 回 400、path 與 `data.matchId` 檢查）。4.1 全綠；`pnpm --filter ./hono-pickball typecheck` exit 0
- [ ] 4.3 REFACTOR：與 `players-repository.ts`、`scoreboard/repository.ts` 的版本化寫入片段是否值得共用（若抽出，B5／B6 的測試 MUST 原樣通過）；無壞味道則註記 skipped

## 5. 後端：送出比分與重置擴充

Depends on: §4

- [ ] 5.1 RED（TDD）：新增 `test/matchmaker-score.test.ts`（spec `round-lifecycle`、`match-history`、`match-rating` 中錨點指向該檔的全部 it，含兩個 `afterRead` 鉤子的整批守衛 it）；
  `test/matchmaker-players.test.ts` **只新增** it「重置在同一 batch 內刪除本人的名單、回合、分槽與歷史」。確認紅燈並貼出輸出
- [ ] 5.2 GREEN（TDD）：新增 `src/matchmaker/score-repository.ts`（design Decision 2、3；`afterRead` 鉤子只作為選填參數，路由不傳）；`src/routes/matchmaker.ts` 加送出比分路由（失敗碼對應 400／409）；
  `players-repository.ts` 的 reset batch 加三張表。5.1 全綠；B6 的 `matchmaker-players.test.ts` 既有 it 全綠
- [ ] 5.3 REFACTOR：score-repository 的 batch 組裝是否清楚到 B9 可照抄（守衛 → 寫入 → 刪守衛）；無壞味道則註記 skipped

## 6. 前端：API 包裝、命令佇列與名單 port

Depends on: §5

- [ ] 6.1 RED（TDD）：新增 `lib/sync/round-api.test.ts`，it「回合 API 包裝以正確的方法、路徑與 body 呼叫 requestJson」。確認紅燈
- [ ] 6.2 GREEN（TDD）：新增 `lib/sync/round-api.ts`
- [ ] 6.3 RED（TDD）：新增 `lib/sync/round-command-queue.test.ts`，spec 該檔的三個 it（假時鐘驗證退避表）。確認紅燈
- [ ] 6.4 GREEN（TDD）：新增 `lib/sync/round-command-queue.ts`（design Decision 6；退避表取自 `latest-wins-saver.ts` 的同一常數，SHALL NOT 另寫一份）
- [ ] 6.5 RED（TDD）：`hooks/useRemoteRosterStore.test.tsx` 新增三個 it（`applyRemotePlayers` 兩個、`reloadRemotePlayers` 一個），並把 B6 的「resetRoster 成功後清空名單並只清除本機回合、歷史與分槽」改寫為
  「resetRoster 成功後清空名單並只清除本機歷史」；`lib/matchmaker/storage.test.ts` 把 B6 的 `resetLocalMatchProgress` it 改寫為 spec 的新名稱與斷言；
  另新增 it「resetRoster 送出前停止所有參賽者的待送與重試中變更」（apply §1 納入的 B6 轉 B7 待辦，見 design Open Questions 5）。確認六個 it 皆紅
- [ ] 6.6 GREEN（TDD）：`useRemoteRosterStore` 加 `applyRemotePlayers`／`reloadRemotePlayers`；`useRosterStore` 選擇器回傳加兩者（本機為不做事的函式，本機 hook 本體不改）；
  `resetLocalMatchProgress()` 縮減為只移除歷史 key；`reset()` 送出 POST 前先停止所有佇列（`disposeAll()`）。6.5 全綠；B6 其餘 it 全綠

## 7. 前端：雲端回合 hook 與選擇器

Depends on: §6

- [ ] 7.1 RED（TDD）：新增 `hooks/useRemoteRoundStore.test.tsx`，spec 該檔的全部 7 個 it。mock `fetch`、stub `crypto.randomUUID`。確認紅燈
- [ ] 7.2 GREEN（TDD）：新增 `hooks/useRemoteRoundStore.ts`（design Decision 6、7、8）
- [ ] 7.3 RED（TDD）：`hooks/useRoundStore.test.tsx` **只新增** `vi.mock("@/hooks/useSession", ...)` 區塊（預設本機快照）與三個 it：「雲端模式下產生對戰不寫入本機回合與歷史」
  「已登入時改用雲端回合並回傳 syncStatus 與雲端分槽」「session 載入中或訪客時走本機回合且 syncStatus 為 local」。確認新 it 紅燈、既有 it 仍綠；先綠的斷言點名標註
- [ ] 7.4 GREEN（TDD）：`hooks/useRoundStore.ts`：既有函式本體原封不動改名為同檔的 `useLocalRoundStore`（`git diff` 只見函式名稱那一行與新增部分）；新增選擇器；
  `UseRoundStoreResult` 加 `syncStatus`、`remoteMatchSlots`；`UseRoundStoreOptions` 加兩個 port
- [ ] 7.5 REFACTOR：`useRemoteRoundStore` 與 `useRemoteRosterStore`／`useRemoteScoreboardStore` 的載入、衝突重載與 401 處理是否值得抽共用——**只在皆有測試守住時**才抽，B5／B6 的測試 MUST 原樣通過；否則註記 skipped

## 8. 前端：雲端分槽 hook、計分板選擇器與歸屬清單

Depends on: §7

- [ ] 8.1 RED（TDD）：新增 `hooks/useRemoteMatchSlotStore.test.tsx`，spec 該檔的四個 it。確認紅燈
- [ ] 8.2 GREEN（TDD）：新增 `hooks/useRemoteMatchSlotStore.ts`（spec `scoreboard`「登入時獨立計分板以雲端為準」的分槽段落）
- [ ] 8.3 RED（TDD）：`hooks/useScoreboardStore.test.tsx`：**刪除** B5 的 it「已登入但帶 matchId 時仍走本機分槽且 syncStatus 為 local」（tasks 檔頭授權的唯一刪除；commit 訊息載明原因與 spec 出處），
  新增 it「已登入且帶 matchId 時改用雲端分槽且不寫入 scoreboard:matches:v1」。確認新 it 紅燈
- [ ] 8.4 GREEN（TDD）：`hooks/useScoreboardStore.ts` 選擇器加 `matchId` 非 null 的雲端分支（本機實作不改）。8.3 綠；B5 其餘 it 全綠
- [ ] 8.5 RED（既有守衛）：跑 `hooks/hooksInventory.test.ts`，確認因 `useRemoteRoundStore`、`useRemoteMatchSlotStore` 未列入主 spec 而**真的轉紅**，貼出輸出
- [ ] 8.6 GREEN（授權的主 spec 同步）：**本 task 明文授權**把 delta `specs/pickleball-guide-page/spec.md` 已定稿的歸屬清單句子原樣搬進主 spec `openspec/specs/pickleball-guide-page/spec.md` 的對應句，只動這一句（B3 3.6、B5 6.4、B6 5.4 前例）；
  commit 訊息 `docs(openspec): 主 spec 歸屬清單同步 useRemoteRoundStore 與 useRemoteMatchSlotStore（B7 §8）`。重跑 8.5 轉綠。archive 時此段 MODIFIED 應為 no-op

## 9. 前端：資料頁雲端回合

Depends on: §8

- [ ] 9.1 RED（TDD）：`lib/matchmaker/remote-transfer.test.ts` 把 B6 的「雲端備份快照的參賽者取自雲端、回合與歷史取自本機」改寫為「雲端備份快照的參賽者與回合取自雲端、歷史取自本機」（含回合讀取失敗的斷言）。確認紅燈
- [ ] 9.2 GREEN（TDD）：`buildRemoteBackupSnapshot()` 的 `currentRound` 改取雲端。9.1 綠

## 10. E2E 與頁面接線

Depends on: §9

- [ ] 10.1 RED（E2E）：新增 `tests/e2e/user-data/round-sync.spec.ts`（`test.use({ storageState })`、skip 條件、`test.beforeEach` 呼叫 `clearTestAccountUserData()`），spec 錨點的全部 6 個 test。
  以單檔執行 `pnpm --filter ./nextjs-pickball exec playwright test --workers=1 --project=user-data tests/e2e/user-data/round-sync.spec.ts`（前後清殘留 dev server），貼出輸出：
  依賴頁面接線者應為紅；**已由 §7、§8 選擇器達成而先綠者逐一點名標 regression guard**
- [ ] 10.2 GREEN（例外層：頁面與 I/O 樣板元件，以 10.1 驗收）：`app/matchmaker/page.tsx`（雲端模式以 `remoteMatchSlots` 回填與鎖定、不呼叫 `clearMatchSlots`、`SyncStatusNotice`／`data-sync-status`；
  兩個 port 自 `useRosterStore` 傳入；所有 hooks 在 early return 前呼叫）、`app/matchmaker/stats/page.tsx`（傳入 port）、`components/matchmaker/CourtCard.tsx`（雲端模式 await PUT v0 再導向，本機分支不動）、
  `app/scoreboard/page.tsx`（若 §8 選擇器已涵蓋則不改）。10.1 全綠；不得以 `waitForTimeout` 取代狀態等待
- [ ] 10.3 REFACTOR：對戰頁本機與雲端分槽來源的分支是否可收斂成一個小函式；無壞味道則註記 skipped

## 11. 文件同步與總驗收

Depends on: §10

- [ ] 11.1 設定層（文件）：`nextjs-pickball/CLAUDE.md` 改寫「回合與歷史在本機」敘述（登入後回合與分槽以雲端為準、送出比分後端權威、歷史讀取待 B8）；hooks 歸屬加兩支 hook；
  `lib/sync/{round-api,round-command-queue}.ts`。`hono-pickball/CLAUDE.md` 路由約定加回合／分槽／送出比分，並新增「多表寫入用整批守衛」段落（design Decision 2 的寫法與禁止事項）；
  design「交接給 B8～B9」三點寫入適當段落
- [ ] 11.2 驗收（指令）C1：三段 typecheck 皆 exit 0
- [ ] 11.3 驗收（指令）C2：`pnpm lint` 0 errors、warning 不多於基線
- [ ] 11.4 驗收（指令）C3：`pnpm test` 全綠，記錄三個 workspace 的檔數／測試數與基線差異
- [ ] 11.5 驗收（指令）C4：`pnpm build` exit 0
- [ ] 11.6 驗收（指令）C5：`db:generate` 無新檔、`db:migrate:local` 成功
- [ ] 11.7 驗收（指令）C6：`.dev.vars` 齊備下，依 runbook「每開一個新 change 的標準流程」第 4 步的 E2E 指令執行（含 user-data project），前後清殘留 dev server；
  既有 test 全數原樣通過，新增 6 個 test 全 passed，無因缺帳密 skip。結果寫在本 task 後方；失敗不得自行判定為雜訊
- [ ] 11.8 驗收（指令）C7：`DO_NOT_TRACK=1 openspec validate matchmaker-round-score-backend --strict` 通過
