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
> **第五個例外（coordinator 於 apply §10 授權，2026-10-24）**：`tests/e2e/user-data/roster-sync.spec.ts`「登入時送出比分後評分寫入雲端名單」只把送出後的等待由逐人 PUT 改為等待送出比分 POST（`/api/matchmaker/round/matches/:matchId/score`）回應 ok，並加嚴一條「送出比分期間沒有任何 `PUT /api/matchmaker/players/:id`」；test 名稱與「2 升 2 降」斷言不動（delta `player-roster`「送出比分的評分寫回雲端名單」THEN：前端不逐人 PUT）。
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

- [x] 4.1 RED（TDD）：新增 `test/matchmaker-round.test.ts`（spec「回合與送出比分的雲端 API」中該檔的 it，以及 `match-history`「回合 PUT 不新增、不修改也不刪除任何歷史」）與
  `test/matchmaker-slots.test.ts`（該檔的三個 it）。確認紅燈並貼出輸出；
  **「auth 停用…皆回 404」在路由不存在時同樣是 404，預期先綠——點名並標 regression guard**；「未登入…皆回 401」若因 B6 sub-app 的 `requireSession` 先綠，同樣點名標註
  - **regression guard 點名（誠實標註，寫入即綠，非紅燈）**：
    - 4.1 RED 當下先綠的 3 個 it：「auth 停用且無 DB binding 時回合、分槽與送出比分端點皆回 404」（路由不存在也是 404）、「未登入呼叫回合、分槽與送出比分端點皆回 401」（B6 的 `requireSession` 先擋）、「getSession 拋出例外時回合與分槽端點回 500」。其餘 15 個 it 為真實紅燈（404）。
    - 事後補的 guard（由 mutation 與 Stage 2 發現缺口）：`b10965e` 鍵順序不影響已完成場次比對；`d3fce67` 回合 PUT 單一 batch（D1 spy）與 B 以 version 1 PUT A 的分槽；
      其後補的斷言與 it——GET 單筆分槽查無資料回 200（slots／round 兩檔）、「不從 query 或 body 接受 userId」it 內 A 先有分槽並斷言 `GET /slots`、`GET /slots/:matchId` 帶 A 的 userId 讀不到、
      「回合寫入並回傳驗證後的輸出（含 schema 補上的預設值）」與「分槽寫入並回傳驗證後的輸出（含 schema 補上的預設值）」。
- [x] 4.2 GREEN（TDD）：新增 `src/matchmaker/round-repository.ts`（design Decision 4）、`src/matchmaker/slots-repository.ts`（Decision 5）；`src/routes/matchmaker.ts` 加 `/round`、`/slots`、`/slots/:matchId` 路由
  （`zValidator` hook 回 400、path 與 `data.matchId` 檢查）。4.1 全綠；`pnpm --filter ./hono-pickball typecheck` exit 0
- [x] 4.3 REFACTOR：與 `players-repository.ts`、`scoreboard/repository.ts` 的版本化寫入片段是否值得共用（若抽出，B5／B6 的測試 MUST 原樣通過）；無壞味道則註記 skipped；**skipped**：三處版本化寫入的形狀不同（players 為 insert-select 取 max sort_order、scoreboard 為單列 values、回合需同 batch 清分槽、分槽 v0 帶 EXISTS），共用片段會需要多個參數化旋鈕，無壞味道

## 5. 後端：送出比分與重置擴充

Depends on: §4

- [x] 5.1 RED（TDD）：新增 `test/matchmaker-score.test.ts`（spec `round-lifecycle`、`match-history`、`match-rating` 中錨點指向該檔的全部 it，含兩個 `afterRead` 鉤子的整批守衛 it）；
  `test/matchmaker-players.test.ts` **只新增** it「重置在同一 batch 內刪除本人的名單、回合、分槽與歷史」。確認紅燈並貼出輸出
  - **紅燈紀錄**：`matchmaker-score.test.ts` 16 個 it 全部真實紅燈（路由不存在回 404，或 `score-repository` 模組不存在）；`matchmaker-players.test.ts` 新增的重置 it 紅燈（回合、分槽、歷史未被刪除），既有 21 個 it 原樣綠。
  - **regression guard 點名**：RED 當下先綠者無（「未登入 401」「auth 停用 404」「getSession 500」三個迴圈 it 已在 §4 的 `matchmaker-round.test.ts`，§5 實作後仍須綠）。
  - **事後補的 regression guard（GREEN 之後由 mutation 發現缺口而加，寫入即綠，非紅燈）**：「殘留的守衛列造成的主鍵衝突不被吞成 409 而是照常拋出」（守住歷史主鍵衝突的比對必須限定 `matchmaker_history`）；
    「送出比分在單一 batch…」it 內加入另一位使用者（相同球員 id、場次 id、版本）資料不變的斷言（守住所有 `user_id` 條件）。
  - 錨點外自補的 it（皆為真實紅燈）：回合版本在計算後變動的守衛、歷史主鍵衝突（第二道防線）、名單缺少參賽者或回合不存在、body 不符 schema、完成時間取伺服器時間、不從 query 或 body 接受 userId（送出比分）。
- [x] 5.2 GREEN（TDD）：新增 `src/matchmaker/score-repository.ts`（design Decision 2、3；`afterRead` 鉤子只作為選填參數，路由不傳）；`src/routes/matchmaker.ts` 加送出比分路由（失敗碼對應 400／409）；
  `players-repository.ts` 的 reset batch 加三張表。5.1 全綠；B6 的 `matchmaker-players.test.ts` 既有 it 全綠。GREEN commit 同時修正了 RED 測試檔的一行型別（`concat` 元素型別），斷言等價
- [x] 5.3 REFACTOR：score-repository 的 batch 組裝是否清楚到 B9 可照抄（守衛 → 寫入 → 刪守衛）；無壞味道則註記 skipped；Stage 2 退回後已實際重構：歷史主鍵衝突的分類集中到 `batch-guard.ts`（`isHistoryPrimaryKeyViolation`，與 `isBatchGuardViolation` 共用逐層查 cause 的 `errorChainMatches`），`score-repository.ts` 引用之，並補齊 batch 每條陳述式的「為什麼」註解（守衛 → 歷史 → 回合 → 球員 → 分槽 → 刪守衛）。
  `players-repository.ts` 的 `isConstraintError` 不共用：它認任何主鍵／UNIQUE 衝突（名單匯入的 id 重複），與「限定 matchmaker_history」語意不同；技術上可改寫為 `errorChainMatches(e, 判斷式)`，但為維持 B6 程式碼不動（surgical）且 `errorChainMatches` 目前未匯出，本 change 不改，留待 B9 抽共用時一併處理（Stage 2 複審指正原「需多一個旋鈕」的理由不成立）。
  **`guardedBatch` 包裝（OQ14）決定不抽**：目前只有送出比分一處使用，守衛 → 寫入 → 刪守衛的順序已在 `score-repository.ts` 一處清楚呈現；B9 若出現第二個呼叫端再抽，避免單一用途的抽象。
  補件 regression guard（寫入即綠）：「計算後參與球員被刪除時整批守衛使 batch 不寫入任何資料」、「重置以單一 D1 batch 送出四條刪除」、d1-batch-guard 的「歷史主鍵衝突的判定只認 matchmaker_history 的 UNIQUE 衝突」

## 6. 前端：API 包裝、命令佇列與名單 port

Depends on: §5

- [x] 6.1 RED（TDD）：新增 `lib/sync/round-api.test.ts`，it「回合 API 包裝以正確的方法、路徑與 body 呼叫 requestJson」。確認紅燈
  - 紅燈：`1af288a`（只含測試檔）；`round-api` 模組不存在，兩個 it 皆因 import 解析失敗而紅。regression guard：無（兩個 it 皆為真紅燈）。額外 it「原樣回傳 requestJson 的結果」同批寫入。
- [x] 6.2 GREEN（TDD）：新增 `lib/sync/round-api.ts`
  - REFACTOR：skipped（無壞味道）。
  - **事後補的 regression guard（Stage 2 mutation 發現缺口，寫入即綠，非紅燈）**：`round-api.test.ts` 的「PUT 回應 schema 只接受各自的資料形狀，回合與分槽不可互換」（殺 A06、A13；原本只比對 schema 常數身分，換成對方的 schema 仍綠）。
- [x] 6.3 RED（TDD）：新增 `lib/sync/round-command-queue.test.ts`，spec 該檔的三個 it（假時鐘驗證退避表）。確認紅燈
  - 紅燈：`f3aec24`（只含測試檔）；`round-command-queue` 模組不存在，9 個 it（spec 三個＋額外六個）皆因 import 解析失敗而紅。regression guard：無。GREEN 時修正 RED 測試檔的一個 harness 筆誤（「成功但沒有回應內容」it 把 submitScore mock 設在錯的 harness），斷言未改。
  - **事後補的 regression guard（GREEN 之後由 mutation 發現缺口而加，寫入即綠，非紅燈）**：「退避等待期間排入的命令不提前送出，也不重置等待時間」、「停止後失敗次數歸零，下一次失敗重新從第一個退避間隔開始」、「請求拋出例外時視為網路失敗並重試」。
- [x] 6.4 GREEN（TDD）：新增 `lib/sync/round-command-queue.ts`（design Decision 6；退避表取自 `latest-wins-saver.ts` 的同一常數，SHALL NOT 另寫一份）
  - REFACTOR：skipped（無壞味道）。
  - **事後補的 regression guard（Stage 2 mutation 發現缺口，寫入即綠，非紅燈）**：`round-command-queue.test.ts` 的「dispose 後不留計時器、佇列清空，之後排入的命令不進入 getPending」（殺 Q23、Q25、Q26）與「合併時夾著被丟棄的命令，後面的命令仍併入同一次 PUT」（殺 Q35）。Q24（`flush` 不檢查 `disposed`）為等價變異：dispose 後 `flush` 只能經 `enqueue`（已檢查）、`finish`（已檢查）或計時器（已清除）到達，無可觀察差異。
- [x] 6.5 RED（TDD）：`hooks/useRemoteRosterStore.test.tsx` 新增三個 it（`applyRemotePlayers` 兩個、`reloadRemotePlayers` 一個），並把 B6 的「resetRoster 成功後清空名單並只清除本機回合、歷史與分槽」改寫為
  「resetRoster 成功後清空名單並只清除本機歷史」；`lib/matchmaker/storage.test.ts` 把 B6 的 `resetLocalMatchProgress` it 改寫為 spec 的新名稱與斷言；
  另新增 it「resetRoster 送出前停止所有參賽者的待送與重試中變更」（apply §1 納入的 B6 轉 B7 待辦，見 design Open Questions 5）。確認六個 it 皆紅
  - 紅燈：`6b6ac49`（只含測試檔），7 紅（spec 要求的六個 it 加「enabled 為 false 時 applyRemotePlayers 與 reloadRemotePlayers 不發出請求」）；另有額外的「reloadRemotePlayers 重新 GET 失敗時回報 load-failed，401 時呼叫 onUnauthorized」（紅）與新檔 `hooks/useRosterStore.ports.test.tsx` 兩個 it（紅，TypeError: not a function）。**regression guard：無**（所有新增與改寫的 it 皆為真紅燈）。
  - 偏離／註記：GREEN 時修正 RED 測試檔一個筆誤（reload 的 401 情境把第二個 hook 的 GET 回應排在 render 之後，改為之前），斷言未改。resetRoster 失敗後 versions 已被 `disposeAll()` 清除（OQ5 的必然結果）：之後的編輯以 version 0 送出會得 409 並自動重載，由「雲端拒絕儲存，請重新整理頁面」提示涵蓋。
- [x] 6.6 GREEN（TDD）：`useRemoteRosterStore` 加 `applyRemotePlayers`／`reloadRemotePlayers`；`useRosterStore` 選擇器回傳加兩者（本機為不做事的函式，本機 hook 本體不改）；
  `resetLocalMatchProgress()` 縮減為只移除歷史 key；`reset()` 送出 POST 前先停止所有佇列（`disposeAll()`）。6.5 全綠；B6 其餘 it 全綠
  - 實作註記：`disposeAll()` 放在 POST 送出前後，B6 三個「重置進行中收到 401／409」的既有 it 會因 saver 忽略舊世代結果而變紅；以 `handleStaleOutcome`（只在重置在途時、對舊世代在途請求的 401／409 照常處理）保持它們原樣通過，未修改任何既有 it。REFACTOR：`reloadAfterConflict` 泛化為 `reloadPlayers(afterConflict)`，其餘無壞味道（skipped）。
  - **事後補的 regression guard（Stage 2 mutation 發現缺口，寫入即綠，非紅燈）**：`useRemoteRosterStore.test.tsx` 的「applyRemotePlayers 只在回應中的參賽者有待送變更時才重載」（殺 R03、R04）、「重置成功之後才到的舊世代 409 或 401，不得重載、不得呼叫 onUnauthorized，狀態維持 synced」（殺 R20）、「重置在途時卸載，之後舊世代回 409 不得發出 GET」（殺 R22）、「重置中已收到 401，之後另一筆舊世代回 409 不得發出 GET」（殺 R23）、「重置中 DELETE 回 401 時呼叫 onUnauthorized」（殺 R24）。

## 7. 前端：雲端回合 hook 與選擇器

Depends on: §6

- [x] 7.1 RED（TDD）：新增 `hooks/useRemoteRoundStore.test.tsx`，spec 該檔的全部 7 個 it。mock `fetch`、stub `crypto.randomUUID`。確認紅燈
  - 紅燈：`0d0c6ea`（只含測試檔）；`useRemoteRoundStore` 模組不存在，整檔因 import 解析失敗而紅（`git show 0d0c6ea^:nextjs-pickball/hooks/useRemoteRoundStore.ts` 查無此檔）。spec 的 7 個錨點 it 名稱逐字一致，同批另寫 20 個 it（OQ7 名單未就緒、transform 可重入、重載／401 閘門、卸載 dispose、各 `SyncStatus` 轉換、分槽清理等）。regression guard：無（皆因 import 失敗而紅）。
  - GREEN 時修正 RED 測試檔兩處（斷言語意未削弱）：「休息次數結算」夾具需先有一個有人休息的上一輪（休息次數是結束上一輪時結算）；`restSettlements` 的型別窄化。
  - **事後補的 regression guard（GREEN 之後由 mutation 發現缺口而加，寫入即綠，非紅燈）**：樂觀顯示送出（B18）、conflict／rejected 的 saving 黏著（S03、S04）、重試在途期間仍為 retrying（S02）、送出成功後以回應回合為基礎重新套用排隊變更（B02）、不同場次的送出各自排入（B21）、`startTimer` 開始時間沿用操作當下（B15d）、重複送出的失敗碼（M03）。最終 30 個 it。
- [x] 7.2 GREEN（TDD）：新增 `hooks/useRemoteRoundStore.ts`（design Decision 6、7、8）
  - `f813573`；30 個 it 全綠，tsc exit 0。
  - **與 design／ticket 的差異**：① options 多一個選填的 `rosterSyncStatus`（OQ7：名單 `loading`／`load-failed` 時 `submitScore` 回 `scoring-failed` 且不送出；頁面把它列入回填 effect 依賴，頁面接線屬 §10）。② `reloadRemotePlayers()` 放在衝突重載「成功之後」呼叫（401 或重載失敗時不呼叫，滿足「401 後不再呼叫」）。③ `generateRound` 的新回合與休息結算在排入前決定，`apply` 恆回傳同一份（可重入）；`resetIncompleteMatches` 以「第 n 次取 id 固定」的來源重新套用，`startTimer` 沿用操作當下的時間。④ 排隊中的送出若又收到同場次，回 `scoring-failed`（不重複排入）。
  - **已知副作用（預期）**：`hooks/hooksInventory.test.ts` 因 `useRemoteRoundStore` 尚未列入主 spec 歸屬清單而轉紅，由 §8.5／8.6 處理（本組不改主 spec）。
- [x] 7.3 RED（TDD）：`hooks/useRoundStore.test.tsx` **只新增** `vi.mock("@/hooks/useSession", ...)` 區塊（預設本機快照）與三個 it：「雲端模式下產生對戰不寫入本機回合與歷史」
  「已登入時改用雲端回合並回傳 syncStatus 與雲端分槽」「session 載入中或訪客時走本機回合且 syncStatus 為 local」。確認新 it 紅燈、既有 it 仍綠；先綠的斷言點名標註
  - 紅燈：`a179896`（只含測試檔）；3 個新 it 紅、既有 17 個 it 仍綠（`3 failed | 17 passed`）。三個 it 皆因 `syncStatus` 為 `undefined` 或雲端請求未發出而紅。
  - 先綠（regression guard）的斷言：「session 載入中或訪客時走本機回合…」中的 `round` 非 null、`matchmaker:round:v1` 有值、`fetch` 未被呼叫——本機實作原本就成立，該 it 由 `syncStatus`／`remoteMatchSlots` 的斷言轉紅。只新增 `vi.mock("@/hooks/useSession", ...)` 區塊、三個 import（`afterEach`、`waitFor`、`useSession`）與新 it，既有 it 的名稱與斷言未改。
  - 事後補兩個 it（寫入即綠，regression guard）：「選擇器把名單 port、名單狀態與 401 處理交給雲端實作」、「雲端 PUT 回 409 時選擇器呼叫 reloadRemotePlayers」。
- [x] 7.4 GREEN（TDD）：`hooks/useRoundStore.ts`：既有函式本體原封不動改名為同檔的 `useLocalRoundStore`（`git diff` 只見函式名稱那一行與新增部分）；新增選擇器；
  `UseRoundStoreResult` 加 `syncStatus`、`remoteMatchSlots`；`UseRoundStoreOptions` 加兩個 port
  - `55779b2`；`git diff 46c6a03 -- nextjs-pickball/hooks/useRoundStore.ts`：本體只見函式名稱／回傳型別那一行（`useRoundStore` → `useLocalRoundStore`，回傳 `LocalRoundStoreResult`），其餘皆為新增（import、options 欄位、結果欄位、`doNothing`、選擇器）。
  - **與 design 的差異**：兩個 port 與 `rosterSyncStatus` 在 `UseRoundStoreOptions` 為**選填**——既有 `useRoundStore.test.tsx` 約 18 處只傳 `{ players, updatePlayer }`，且既有 it 不得修改，必填會使 tsc 失敗；省略時為不做事的函式，頁面（§10）會傳入。
- [x] 7.5 REFACTOR：`useRemoteRoundStore` 與 `useRemoteRosterStore`／`useRemoteScoreboardStore` 的載入、衝突重載與 401 處理是否值得抽共用——**只在皆有測試守住時**才抽，B5／B6 的測試 MUST 原樣通過；否則註記 skipped
  - **skipped**：三者的狀態機不同（名單是每人一個 saver＋重置，計分板是單一 saver＋dirty 追蹤，回合是命令佇列＋重新套用），僅 `LOAD_FAILED`／401 的幾行相似，抽共用需改動 B5／B6 的正式程式碼，換不到足夠的簡化。
  - **Stage 2 mutation 發現缺口的事後 regression guard（寫入即綠，非紅燈；實作未改）**，`51cdff0`、`f6447b9`（場次 id 不重複 Q02 與無法套用的換人不清空畫面 E01 兩個 it）；逐 it 殺掉的變異（編號取自審查員 `/tmp/b7s2rev/muts.py`）：
    - `useRemoteRoundStore.test.tsx`「401 之後與衝突重載期間，七個操作皆不送出也不改變畫面」：G02、G03、G05、G06、G07。
    - 「排在送出比分後面的場次調整以回應的回合重新套用，不覆蓋伺服器算出的完成時間」：Q09、Q10（swap／reset 在送出後重新套用）。
    - 「排隊中的回合變更以伺服器回應的回合為基礎，保留伺服器改過的欄位」：Q06、Q07、Q09、Q10。
    - 「回應的回合中換入的球員已不在休息名單時，排隊的換人被丟棄且畫面等於已確認回合」：Q11。
    - 「重排產生多個新場次時，場次 id 彼此不重複」：Q02。
    - 「排在送出比分後面、已無法套用的換人不會清空畫面，也不會被預測進畫面」：E01。
    - 「排隊中的送出會被預測進畫面…」：E02。
    - 「名單從空變成六人之後，generateRound 以新名單排出回合」：C10。
    - 「enabled 反覆切換時，舊一輪較晚回來的載入結果被忽略」：L14、L19。
    - 「已載入之後 enabled 關閉再開啟，重新載入前回到 loading 且清空回合」：R01。
    - 既有 it 加一條斷言：名單未就緒的失敗碼（O06）。
    - `useRoundStore.test.tsx`「雲端模式產生下一輪時，上一輪休息者的休息次數在 PUT 成功後經 updatePlayer 結算」：S05；「雲端模式不使用訪客時期的本機回合與歷史」：S12、S13。
    - 複驗：以審查員 harness 重跑，上列變異全部轉紅；等價對照 R15、P03、P06、C09、S14 維持綠；L22（effect 開頭不重設 ref，審查員標 probe）仍存活，判定近似等價（`LOAD_START` 與載入完成前 `readyRef` 本來就由 cleanup 與 `updateReady` 維持為 false）。
  - 7.2 之後的自我精簡（`a8d46c2`）：移除經 mutation 證實不可達的 `load` 內 `stopped` 檢查與 `handleUnauthorized` 內的重複 `queue.dispose()`。

## 8. 前端：雲端分槽 hook、計分板選擇器與歸屬清單

Depends on: §7

- [x] 8.1 RED（TDD）：新增 `hooks/useRemoteMatchSlotStore.test.tsx`，spec 該檔的四個 it。確認紅燈
  - 紅燈：`844ee47`（只含測試檔；`git show 844ee47^:nextjs-pickball/hooks/useRemoteMatchSlotStore.ts` 查無此檔）。模組不存在，整檔因 import 解析失敗而紅（輸出 `/tmp/b7s8/red81.txt`）。spec 的 4 個錨點 it 名稱逐字一致。regression guard：無（皆因 import 失敗而紅）。
  - 事後補的 regression guard（GREEN 後自跑 mutation 發現缺口而加，寫入即綠，非紅燈）：`1c59e2b`、`21cc08b`，共 4 個 it：分槽儲存的同步狀態轉換與保留規則（saving／retrying／rejected、成功後沿用版本、204 視為失敗、卸載後不重試）、衝突文案維持到下一次儲存成功、重新啟用與換場次的重載、卸載後結果忽略與 `onUnauthorized` 取最新函式；另在 missing 的錨點 it 加一條 `syncStatus` 為 synced 的斷言。最終 8 個 it。
  - 事後補的 regression guard（Stage 2 mutation 發現缺口而加，寫入即綠，非紅燈）：`8454871`，共 4 個 it：衝突後重新 GET 回 401 時呼叫 onUnauthorized 且之後不再送出 PUT（殺 H12）、換場次後載入中 dispatch 不得以前一場的 version 送出 PUT（殺 H42）、啟用後第一個 render 的 syncStatus 即為 loading（殺 H38）、GET 回 204 時為 load-failed（殺 H10）。最終 12 個 it。
- [x] 8.2 GREEN（TDD）：新增 `hooks/useRemoteMatchSlotStore.ts`（spec `scoreboard`「登入時獨立計分板以雲端為準」的分槽段落）
  - `0465fcd`；4 個錨點 it 綠，tsc exit 0。
  - **與 design 的差異**：回傳為四元組 `[state, dispatch, bindingStatus, syncStatus]`（選擇器可直接回傳）；`missing` 時 `syncStatus` 設為 `synced`（失效說明取代畫面，不疊加同步提示）；載入失敗時 `bindingStatus` 維持 `pending`、`syncStatus` 為 `load-failed`。`statusReducer` 與 B5 同型但各自一份（B7 7.5 已記 skipped 的同一理由）。
- [x] 8.3 RED（TDD）：`hooks/useScoreboardStore.test.tsx`：**刪除** B5 的 it「已登入但帶 matchId 時仍走本機分槽且 syncStatus 為 local」（tasks 檔頭授權的唯一刪除；commit 訊息載明原因與 spec 出處），
  新增 it「已登入且帶 matchId 時改用雲端分槽且不寫入 scoreboard:matches:v1」。確認新 it 紅燈
  - 紅燈：`d0cd0a0`（只含測試檔）；新 it 紅、其餘 17 個 it 綠（`1 failed | 17 passed`，輸出 `/tmp/b7s8/red83.txt`），失敗為 `expected 'missing' to be 'bound'`。刪除的 B5 it：「已登入但帶 matchId 時仍走本機分槽且 syncStatus 為 local」（`git show d0cd0a0 -- nextjs-pickball/hooks/useScoreboardStore.test.tsx` 只見該 it 被新 it 取代；commit 訊息載明原因與 spec 出處）。
  - 先綠的斷言：無（新 it 在 `bindingStatus` 等待處即紅）。
- [x] 8.4 GREEN（TDD）：`hooks/useScoreboardStore.ts` 選擇器加 `matchId` 非 null 的雲端分支（本機實作不改）。8.3 綠；B5 其餘 it 全綠
  - `b13f610`；`git diff` 只動 `useScoreboardStore.ts` 的選擇器（新增 `useRemoteMatchSlotStore` import 與分支，`useLocalScoreboardStore` 本體未動）。8.3 綠、B5 其餘 it 全綠；tsc exit 0。
  - 事後補 regression guard：選擇器對分槽 hook 傳入 `session.refresh`（`1c59e2b`，mutation B03 存活後補）。
  - 已知（與 B5 獨立計分板路徑相同）：選擇器每次 render 仍呼叫本機 hook；雲端模式帶 matchId 時本機 hook 若讀到訪客遺留的同 id 分槽，只會原樣寫回相同內容，不寫入雲端模式的狀態。
- [x] 8.5 RED（既有守衛）：跑 `hooks/hooksInventory.test.ts`，確認因 `useRemoteRoundStore`、`useRemoteMatchSlotStore` 未列入主 spec 而**真的轉紅**，貼出輸出
  - 紅燈（8.2 之後跑，輸出 `/tmp/b7s8/red85.txt`）：「hooks 目錄下每支 hook 都能在規格的歸屬清單中找到」失敗，`missing` 為 `["useRemoteMatchSlotStore", "useRemoteRoundStore"]`；另一個 it 綠。
- [x] 8.6 GREEN（授權的主 spec 同步）：**本 task 明文授權**把 delta `specs/pickleball-guide-page/spec.md` 已定稿的歸屬清單句子原樣搬進主 spec `openspec/specs/pickleball-guide-page/spec.md` 的對應句，只動這一句（B3 3.6、B5 6.4、B6 5.4 前例）；
  commit 訊息 `docs(openspec): 主 spec 歸屬清單同步 useRemoteRoundStore 與 useRemoteMatchSlotStore（B7 §8）`。重跑 8.5 轉綠。archive 時此段 MODIFIED 應為 no-op
  - `aafd02f`；`git diff eba2f78 -- openspec/specs/` 只動 `pickleball-guide-page/spec.md` 的「本 capability 只擁有上述三支」那一行（加入 `useRemoteRoundStore`、`useRemoteMatchSlotStore`），內容與 delta 該句逐字相同。`hooksInventory.test.ts` 2 個 it 轉綠。
  - **§8 mutation（自跑，48 條）**：分槽 hook 36 條 A01～A36、選擇器 8 條 B01～B08、等價對照 4 條（E01～E03、BE1）；首輪存活 A04、A19、A21～A24、A26～A32、A35、B03 皆補 regression guard 後轉紅。最終僅 A20（204 時 `value` 為 undefined，移除檢查後讀 `.version` 拋錯，saver 同樣視為 failed，行為等價）與 A36（`enabled` 為 false 時回傳的 `bindingStatus`，選擇器不讀取）判定等價。必做三項：missing 仍 PUT（A01、A16）、409 重載回 null 不轉 missing（A02、A03）、帶 matchId 仍走本機（B01、B02、B06）皆轉紅。
  - 驗收：本組 3 檔 + `hooksInventory.test.ts` 綠；全套前端 100 檔 981 個 it 綠；`pnpm -r exec tsc --noEmit` exit 0；`pnpm lint` 0 errors／3 warnings。

## 9. 前端：資料頁雲端回合

Depends on: §8

- [x] 9.1 RED（TDD）：`lib/matchmaker/remote-transfer.test.ts` 把 B6 的「雲端備份快照的參賽者取自雲端、回合與歷史取自本機」改寫為「雲端備份快照的參賽者與回合取自雲端、歷史取自本機」（含回合讀取失敗的斷言）。確認紅燈
  - 紅燈 commit `198ced5`（僅含 `remote-transfer.test.ts`；`git show 198ced5^:nextjs-pickball/lib/matchmaker/remote-transfer.ts` 仍為 `currentRound: local.currentRound`）。單檔輸出：1 failed | 7 passed，`expected roundNumber 7 ... received 1`（舊實作取本機回合）。
  - 改寫範圍：只改寫 B6 該 it（名稱依 spec）；含雲端回合 null、回合讀取 500／204／401 失敗的斷言。
  - 後續補強 commit（regression guard，非 TDD 紅燈）：補「名單失敗而回合成功」500／204／401 斷言。原因：mutation 發現原 RED 只讓兩條 GET 同時失敗，名單端的分支變異會存活。
- [x] 9.2 GREEN（TDD）：`buildRemoteBackupSnapshot()` 的 `currentRound` 改取雲端。9.1 綠
  - GREEN commit `7240149`：`buildRemoteBackupSnapshot()` 以 `fetchRemoteRound()`（經 `round-api.ts`）取回合，與名單並行讀取；任一 401 回 unauthorized，任一非 ok／204 回 backupFetchFailed；歷史仍讀本機。單檔 8 passed。
  - REFACTOR skipped（無壞味道）。

## 10. E2E 與頁面接線

Depends on: §9

- [x] 10.1 RED（E2E）：新增 `tests/e2e/user-data/round-sync.spec.ts`（`test.use({ storageState })`、skip 條件、`test.beforeEach` 呼叫 `clearTestAccountUserData()`），spec 錨點的全部 6 個 test。
  以單檔執行 `pnpm --filter ./nextjs-pickball exec playwright test --workers=1 --project=user-data tests/e2e/user-data/round-sync.spec.ts`（前後清殘留 dev server），貼出輸出：
  依賴頁面接線者應為紅；**已由 §7、§8 選擇器達成而先綠者逐一點名標 regression guard**
  - 紅燈（232face，只含 spec 檔；`git show 232face^:nextjs-pickball/tests/e2e/user-data/round-sync.spec.ts` 不存在可複驗）：4 failed／2 passed。紅：「登入時經計分板完成的場次…」與「登入時場次計分板的進度…」（`waitForResponse` 逾時：場地卡未先 PUT 分槽）、「另一裝置先送出同一場比分時…」（頁面不顯示回合衝突文案）、「雲端回合載入失敗時對戰頁…」（頁面只看名單狀態，找不到錯誤文案）。
  - 先綠（regression guard）：「登入後產生的回合在重新整理與另一個 context 中由雲端還原」「登入時重置名單後雲端回合與分槽一併清除」——選擇器 `useRoundStore` 在 §7、§8 已切換雲端，頁面不需接線即成立。
  - GREEN 後以 mutation 發現 5 條缺口並補強（皆為 regression guard，補在 GREEN 之後：2049558、85ffd6e）：雲端回填不動本機分槽（sentinel）、回到對戰頁後「計分中」與目標分數鎖定、名單晚載入時回填仍會執行、評分在同一頁面即時顯示（`applyRemotePlayers`）、分槽 PUT 完成前不導向。
- [x] 10.2 GREEN（例外層：頁面與 I/O 樣板元件，以 10.1 驗收）：`app/matchmaker/page.tsx`（雲端模式以 `remoteMatchSlots` 回填與鎖定、不呼叫 `clearMatchSlots`、`SyncStatusNotice`／`data-sync-status`；
  兩個 port 自 `useRosterStore` 傳入；所有 hooks 在 early return 前呼叫）、`app/matchmaker/stats/page.tsx`（傳入 port）、`components/matchmaker/CourtCard.tsx`（雲端模式 await PUT v0 再導向，本機分支不動）、
  `app/scoreboard/page.tsx`（若 §8 選擇器已涵蓋則不改）。10.1 全綠；不得以 `waitForTimeout` 取代狀態等待
  - fa6fd34：round-sync 6 條全綠；`app/scoreboard/page.tsx` 未改（§8 選擇器已涵蓋）。偏離：`CourtCard` 不直接用 `useRouter`（既有 CourtCard 單元測試無 router context，會拋錯），改為可選 prop `remoteNavigate`（`MatchStage` 轉傳，頁面以 `router.push` 提供）；未傳入即走原本機分支，一行未動。頁面同步狀態取名單與回合兩者中最需注意者（`mergeSyncStatus`）。
  - Stage 2 補件（269d7fc，皆為寫入即綠的 regression guard，不改產品碼）：P18 頁面漏傳 `reloadRemotePlayers`（test 3 追加：衝突後 B 的場地卡強度重新載入）、P20 `updatePlayer` 改空函式（新增 test：再產生一輪後雲端休息次數增加）、P23 early return 漏掉 `loading`（新增 test：回合 GET 暫扣時顯示載入提示且無產生按鈕）、C2 分槽 PUT 409 不導向（test 6 追加：繼續計分回 409 仍導向且比分 2:0）、C3／C4／C7 分槽建立失敗分支（新增 test：PUT 回 500 時顯示錯誤、不導向，解除後可再進入）。7 條變異皆轉紅，等價對照維持綠。
  - 已知：既有 `roster-sync.spec.ts`「登入時送出比分後評分寫入雲端名單」等待 `PUT /api/matchmaker/players/*`，B7 後評分改由送出比分的 POST 寫入、不再逐人 PUT，該 test 在 `waitForResponse` 逾時。→ coordinator 授權改寫等待條件並加嚴（tasks 檔頭第五個例外），改寫 commit `e04ef43`（leader 依裁定執行；文件 `4171aaa`）。
- [x] 10.3 REFACTOR：對戰頁本機與雲端分槽來源的分支是否可收斂成一個小函式；無壞味道則註記 skipped
  - skipped：分支只有 `remoteMatchSlots ?? matchSlots` 一行與回填 effect 內的早退區塊，收斂成函式需把 `submitScore`、`players`、`round` 全傳入，反而擴大面積並碰到本機分支。

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
