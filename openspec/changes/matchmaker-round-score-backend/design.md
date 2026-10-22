# Design: matchmaker-round-score-backend

## Context

- 前提：B4（`@pickball/core`：`submitScore`、`RoundSchema`、`MatchHistoryEntrySchema`、`ScoreboardState` schema、`history-range`）、
  B5（`user-data-sync` 全部慣例、`lib/sync/*`、`SyncStatusNotice`、`user-data` E2E project、`clearTestAccountUserData()`、`test/helpers/session.ts`）、
  B6（`matchmaker_players`、`/api/matchmaker/*` sub-app、`players-repository.ts`、`useRemoteRosterStore`、`roster-api.ts`、`remote-transfer.ts`、`resetLocalMatchProgress()`）皆已合併並 archive。
- 核心 `submitScore({ round, players, matchId, rawScoreA, rawScoreB, now })` 為純函式：成功回 `{ round, historyEntry, playerPatches: [{ id, rating, gamesPlayed }], boundaryHits }`，
  失敗回 `{ ok: false, code, message }`（`empty-field`／`invalid-number`／`negative-score`／`tie`／`already-completed`／`match-not-found`／`scoring-failed`）。
  `round.timer !== null` 時同分為 `"draw"`，評分以 `S = 0.5` 計算（M15）。
- 前端 `useRoundStore({ players, updatePlayer })`（main@a595294）：七個操作皆同步回傳結果；`generateRound` 經 `updatePlayer` 套用休息次數，`submitScore` 經 `updatePlayer` 套用評分（B6 雲端模式下變成逐人 PUT）。
- 場次分槽：`scoreboard:matches:v1`（`match-slots.ts`），由 `CourtCard` 導向前的 `ensureMatchSlot` 建立、計分板以 `useScoreboardStore(matchId)` 讀寫、
  對戰頁的回填 effect 以 `collectFinishedSubmissions` 每次送出一筆並 `clearMatchSlots`、`RoundControls` 以 `isTargetScoreLocked(round, slots)` 判定鎖定。
- 場次 id 由前端 `crypto.randomUUID()` 產生（`useRoundStore` 注入 `newMatchId`），因此 `(user_id, match_id)` 足以唯一識別分槽與歷史。
- 限制：D1 沒有互動式 transaction（runbook R2）；B5 Open Questions 1 指出 batch 中影響 0 列的 UPDATE 不會讓整批回滾。

## Goals

- 登入後回合（含計時、目標分數、換人）與場次分槽以雲端為準；送出比分由後端權威、單一 batch 原子寫入評分＋回合＋歷史＋清除分槽。
- 定案「batch 內版本保護」的通用寫法，並以測試證明衝突時整批不寫入（B8／B9 沿用）。
- 訪客路徑零變更；本機 hook 本體一行不改。

## Non-Goals

- 歷史與統計的讀取上雲（B8）；匯入本機資料（B9）；配對與計時器搬到後端；新的錯誤碼。

## Decisions

### Decision 1：四張新表——回合單筆、分槽與歷史以場次 id 為鍵、守衛表

**Choice**：`matchmaker_round(user_id PK, data, version, updated_at)`；`matchmaker_match_slots((user_id, match_id) PK, data, version, updated_at)`；
`matchmaker_history((user_id, match_id) PK, played_at, data, version=1, updated_at)`；`sync_batch_guards(user_id PK, version NOT NULL, updated_at)`。皆 FK cascade、列入 `USER_DATA_TABLES`。

**Rationale**：
- 沿用 B5 Decision 4「JSON 快照＋只有需要查詢／排序的欄位才拆欄」。回合是單一物件（每人一筆，單筆契約）；分槽與歷史以場次 id 為鍵。
- `played_at` 拆欄：B8 要依區間查詢與排序，在 B7 建表時一次到位，避免 B8 再做 backfill migration。
- 歷史主鍵 `(user_id, match_id)`：同一場只會完成一次，主鍵是重複送出的第二道防線（第一道是 `already-completed`），也讓 B9 匯入時重複的 matchId 必然整批失敗。
- 守衛表名遵循 `<feature>_<entity>`（feature 為 `sync`）；它有 `user_id`／`version`／`updated_at` 三欄，自然滿足 `USER_DATA_TABLES` 的欄位慣例守衛。

**Alternatives considered**：
- 回合拆欄（每場一列）：回合的所有變更（產生、重排、換人）都是整份替換，拆欄只會讓 PUT 變成多列寫入並需要守衛，沒有查詢需求支撐。不選。
- 守衛不建表，改用既有表（例：對 `matchmaker_round` 插入衝突列）：語意混淆，且失敗訊息無法與真正的主鍵衝突區分。不選。

### Decision 2：batch 內版本保護＝「整批守衛」INSERT 違反 NOT NULL

**Choice**：需要多表版本保護的 batch，第一條陳述式為
`INSERT INTO sync_batch_guards (user_id, version, updated_at) VALUES (?, CASE WHEN <條件> THEN 1 END, ?)`，最後一條為 `DELETE FROM sync_batch_guards WHERE user_id = ?`。
`<條件>` 為只讀資料庫目前內容的 SQL（送出比分：`(SELECT version FROM matchmaker_round WHERE user_id = ?) = ? AND (SELECT COUNT(*) FROM matchmaker_players WHERE user_id = ? AND ((id = ? AND version = ?) OR …)) = ?`）。
條件為假 → `CASE` 為 NULL → NOT NULL 違反 → 該陳述式失敗 → D1 回滾整批。錯誤以 `batch-guard.ts` 的 `isBatchGuardViolation(err)` 判定（訊息含 `sync_batch_guards.version`），回 409；
送出比分另把 `matchmaker_history` 的主鍵衝突視為 409；其他錯誤照常 500。drizzle 以 `db.run(sql\`…\`)` 放進 `db.batch([...])`。

**守衛必須是第一條**：送出比分的 batch 會把回合與球員的 version 加一，條件若放在後面就會讀到自己剛寫入的新 version 而失效。

**Rationale（Context7 證據）**：
- `/llmstxt/developers_cloudflare_d1_llms-full_txt`（`d1/worker-api/d1-database#batch`）：「Batched statements are SQL transactions; if a statement fails … the entire sequence is aborted or rolled back」，
  且「each statement … execute and commit sequentially, non-concurrently」——只要**有一條陳述式失敗**整批就回滾；反過來說，影響 0 列的 UPDATE 不是失敗，不會觸發回滾（B5 OQ1）。
- `/websites/sqlite_docs`（`lang_createtable.html` §4.1、`lang_conflict.html`）：NOT NULL 約束未指定衝突子句時預設為 **ABORT**，「aborts the current SQL statement with an SQLITE_CONSTRAINT error」——
  也就是「讓一條陳述式失敗」的可靠手段；錯誤訊息會指出約束與欄位（`NOT NULL constraint failed: sync_batch_guards.version`），可據以分類。
- `/websites/sqlite_docs`（`lang_createtrigger.html` §6）：「A special SQL function RAISE() may be used within a trigger-program」——RAISE 只能在 trigger 內使用，無法直接寫在 batch 的陳述式中。
- `/drizzle-team/drizzle-orm-docs`（`sqlite/batch-api`）：`db.batch` 可包含 `db.run()`、`db.insert()`、`db.update()`、`db.delete()`，於 D1 以單一 batch 送出。
- D1 支援 `json_each`／`json_extract`（`/llmstxt/developers_cloudflare_d1_llms-full_txt`，`sql-api/query-json`），Decision 4、5 用到。

**Alternatives considered**：
- (a) 各 UPDATE 帶 `WHERE version = ?`，batch 後檢查 `meta.changes`：batch 已提交，發現 0 列時其他陳述式（歷史插入）已寫入，只能手動補償——違反 R2。不選。
- (b) trigger＋`RAISE(ABORT, …)`：drizzle-kit 不產生 trigger，必須手寫 migration（違反 `db:generate` 慣例），且 trigger 會作用在所有 UPDATE 上，B6 的名單 PUT 也會被影響。不選。
- (c) 以 `json('not json')`、除以零等「製造錯誤」的運算式：錯誤訊息不指向任何可辨識的名稱，分類只能靠脆弱的字串；且 SQLite 的除以零回 NULL 而非錯誤。不選。
- (d) `CHECK` 約束（例：`CHECK (version = 1)` 再插入 0）：可行，但 drizzle 的 `check()` 與 NOT NULL 相比多一層 migration 語法，且 NOT NULL 的錯誤訊息已含欄位名稱。NOT NULL 較簡單。
- (e) 先讀後寫、接受競態：B6 Risk 3 正是這個問題的來源。不選。
- (f) Durable Objects 序列化同一使用者的寫入：新增 binding 與部署順序，對單人使用的工具過度設計。不選。

**測試**：`test/d1-batch-guard.test.ts` 以 characterization 測試固定兩個平台行為（0 列 UPDATE 不回滾；守衛失敗整批回滾），repository 層以注入的 `afterRead` 鉤子
（只供測試，在「讀出並計算完成、batch 送出前」執行）模擬另一個請求改動球員 version 或刪除回合，斷言名單、回合、歷史、分槽**全部**不變。

### Decision 3：送出比分由後端以同一個核心純函式計算

**Choice**：`POST /api/matchmaker/round/matches/:matchId/score`，body `{ scoreA: string, scoreB: string, roundVersion }`。
後端讀回合與名單 → 核心 `submitScore`（`now` 為伺服器時間）→ 依失敗碼分 400／409 → `score-repository.ts` 組 batch（守衛 → 插入歷史 → 更新回合 → 逐一更新被更新球員 → 刪除該場分槽 → 刪守衛）。
比分以**字串**傳送：與既有輸入框一致，讓 `empty-field`／`invalid-number` 的驗證只有一份（核心 `submitScore`），後端不另寫數字解析。
回應帶 `round`、被更新的 `players`（含新 version）、`historyEntry`、`boundaryHits`，前端不必再 GET。

**Rationale**：評分、平局語意與歷史欄位只有一份實作（`match-rating`、`round-lifecycle` delta），M15 的平局與 `2026-09-14-matchmaker-draw-followups` 的修正自動在雲端生效。

**Alternatives considered**：前端算完把結果 POST 給後端寫入（後端只驗版本）：後端無法驗證評分是否被竄改，也違反「送出比分後端權威」的定案。不選。

### Decision 4：回合 PUT——完成狀態不可經 PUT 改變；同一 batch 清除孤兒分槽

**Choice**：PUT 前讀出目前回合，若新資料中任一 `completed` 場次在目前回合中不存在同 id 且深度相等的已完成場次 → 400。
寫入為 `batch([帶版本條件的 UPDATE（或 v0 的 INSERT … ON CONFLICT DO NOTHING）RETURNING, DELETE FROM matchmaker_match_slots WHERE user_id = ? AND match_id NOT IN (SELECT json_extract(m.value, '$.id') FROM matchmaker_round r, json_each(r.data, '$.matches') m WHERE r.user_id = ? AND json_extract(m.value, '$.status') != 'completed')])`。
回合 PUT **不需要**整批守衛：唯一的條件寫入是單一 UPDATE（0 列 → 409）；DELETE 以資料庫內容推導，不論 UPDATE 是否成功都只會讓分槽與「資料庫中的目前回合」一致。

**Rationale**：
- 「完成狀態不可經 PUT 改變」把後端權威延伸到回合 PUT：否則前端可以 PUT 一個標記完成的回合而略過評分與歷史。比對在 batch 外，但 UPDATE 帶版本條件，比對後回合若被改動就會 409，沒有競態。
- 孤兒分槽由伺服器清：等同本機的 `clearDiscardedMatchSlots`，但不依賴前端記得呼叫；`round-lifecycle`「重排本輪或重置名單時清除對應計分板進度」在雲端由此滿足。

**Alternatives considered**：前端在重排後逐一 DELETE 分槽：多一組端點與失敗分支，且衝突時分槽與回合不一致。不選。

### Decision 5：分槽端點——建立以「場次屬於目前回合且未完成」為前置條件

**Choice**：`PUT /slots/:matchId` v0 為 `INSERT INTO matchmaker_match_slots … SELECT … WHERE EXISTS (SELECT 1 FROM matchmaker_round r, json_each(r.data, '$.matches') m WHERE r.user_id = ? AND json_extract(m.value, '$.id') = ? AND json_extract(m.value, '$.status') != 'completed') ON CONFLICT DO NOTHING RETURNING`；
空結果 → 409（已存在或場次無效，前端兩者都以 GET 決定 `bound`／`missing`）。v>0 為帶版本條件的 UPDATE。無 DELETE、無批次附加。
`GET /slots` 依 `match_id` 排序（分槽沒有建立順序的語意）。

**Rationale**：維持「分槽 ⟺ 綁定有效」不變式（`scoreboard`「對戰場次綁定與失效處理」）於伺服器端；`ensureMatchSlot` 的「已存在不覆蓋」語意對應到 v0 的 `ON CONFLICT DO NOTHING`。

### Decision 6：前端回合以「命令佇列」送出，送出時以最新已確認回合重新套用

**Choice**：`lib/sync/round-command-queue.ts`（無 React 相依、可單元測試）：
- 命令兩種：`transform`（`(round, players) => { round, afterCommit? } | null`）與 `submit`（`{ matchId, scoreA, scoreB }`）。
- 單一在途、FIFO；送出時取佇列頭：若為 `transform`，把**連續的** `transform` 依序套用在「最新已確認回合」上，合併成一次 PUT（帶已確認 version）；若為 `submit`，單獨 POST（帶已確認 version）。
- 成功 → 更新已確認回合與 version、執行 `afterCommit`（`generateRound` 的休息次數結算）、pop；`transform` 在已確認回合上回傳 `null`（例：換人對象已不在休息名單）→ 丟棄該命令。
- `conflict`／`unauthorized`／`rejected` → 清空佇列並回報；`failed` → 依 `createLatestWinsSaver` 的退避表（1/2/4/8 秒後每 8 秒）重試同一請求。
- 畫面顯示 = 已確認回合依序套用佇列中的命令（`submit` 以核心 `submitScore` 預測），因此操作仍是同步回傳、樂觀更新。

**Rationale**：送出比分的回應（伺服器算出的完成場次與時間）必須成為之後回合 PUT 的基礎。若沿用 B5 的 `createLatestWinsSaver` 直接存「計算好的回合資料」，
排在送出比分後面的 PUT 會帶著尚未完成該場的舊回合，若以最新 version 送出就會覆蓋伺服器的完成狀態（被 Decision 4 拒絕成 400），以舊 version 送出則必然 409。重新套用命令同時消除這兩種失敗。

**Alternatives considered**：
- 非樂觀、操作期間鎖住 UI：網路重試期間整頁無法操作，且七個操作的同步回傳簽章要改成 Promise，牽動既有元件。不選。
- 送出比分樂觀套用本機計算結果、之後以 PUT 寫回：評分與歷史的權威會回到前端。不選。

### Decision 7：名單接收後端寫入的評分——`applyRemotePlayers` 與 `reloadRemotePlayers`

**Choice**：`useRemoteRosterStore` 新增兩個操作（`player-roster` delta 第 9、10 點）；選擇器在本機模式回傳不做事的函式。
`useRoundStore` options 多兩個 port，對戰頁與統計頁從 `useRosterStore` 取來傳入。`applyRemotePlayers` 遇到該參賽者有待送或在途變更時視同衝突、整份重載。

**Rationale**：評分由後端寫入後，前端只需要把回應套進畫面與 `versionsRef`；若再經 `updatePlayer` 會產生第二次寫入（B6 Risk 3 的來源）。
待送變更若帶著舊 version 送出必然 409，提前整份重載比等它失敗清楚。

**Alternatives considered**：送出比分成功後讓名單 hook 自己重新 GET：每場多一次請求，且畫面會閃一下舊值。不選。

### Decision 8：分槽前端——`useRemoteMatchSlotStore`、分槽清單由回合 store 持有、`CourtCard` 先建立再導向

**Choice**：
- 計分板頁（帶 `matchId`）用新 hook `useRemoteMatchSlotStore`（B5 `useRemoteScoreboardStore` 的同型，差在 `bindingStatus` 與路徑）。
- 對戰頁需要的「全部分槽」由 `useRemoteRoundStore` 一併載入並以 `remoteMatchSlots` 回傳（回填、鎖定判定）；送出比分與回合 PUT 成功後依伺服器規則同步移除。
- `CourtCard` 雲端模式改為 async：`await putRemoteMatchSlot(seed, 0)`，ok 或 conflict → `router.push`；其他 → 顯示錯誤。

**Rationale**：分槽建立若留到計分板頁才做，就無法區分「場次已失效」與「尚未建立」，`missing` 的判定會失真；先建立再導向保留了本機 `ensureMatchSlot` 的時序語意。

### Decision 9：選擇器與既有測試

**Choice**：比照 B5／B6：`useRoundStore.ts` 內既有函式本體改名為 `useLocalRoundStore`（一字不改），新增選擇器；回傳型別加 `syncStatus`、`remoteMatchSlots`。
`useScoreboardStore` 的選擇器多一個分支。**例外**：B5 的 it「已登入但帶 matchId 時仍走本機分槽且 syncStatus 為 local」所描述的行為被本 change 刻意改變，
該 it 刪除並由新 it 取代；B6 的三個 it（`resetLocalMatchProgress`、`resetRoster` 成功、雲端備份快照）依 delta 改寫。其餘既有 it 一律不動。

### Decision 10：重置與資料頁

**Choice**：`POST /api/matchmaker/reset` 的 batch 擴充為四張表。`resetLocalMatchProgress()` 縮減為只移除 `matchmaker:history:v1`（B6 交接第 1 點；理由見 `player-roster` delta）。
`buildRemoteBackupSnapshot()` 的 `currentRound` 改取 `GET /api/matchmaker/round`。

### Decision 11：核心套件 `api/round.ts`

**Choice**：`RoundGetResponseSchema`、`RoundPutRequestSchema`（`{ data: RoundSchema, version }`）、`MatchSlotSchema`（`ScoreboardState` 且 `matchId: string`）、
`MatchSlotListResponseSchema`、`MatchSlotGetResponseSchema`、`SubmitScoreRequestSchema`、`SubmitScoreResponseSchema`；`USER_DATA_TABLES` 加四張表；`CORE_MODULES` 加 `api/round`。

## Risks / Trade-offs

- [Risk] 守衛錯誤訊息的實際文字（miniflare 與正式 D1 可能有前綴差異）→ 以「包含 `sync_batch_guards.version`」判定，§1.4 一次性實測並記錄；`d1-batch-guard.test.ts` 在 workerd 中守住。
- [Risk] **過渡期**（B7～B8）：登入時歷史寫入雲端，但歷史頁、統計頁、歷史 CSV、JSON 匯出的 `history` 仍讀本機——登入時看不到新歷史，統計頁在雲端模式為空（`history` 恆為空陣列）。不 push（D4）；B8 消除。
- [Risk] 樂觀顯示的送出比分在衝突時會被收回 → 依 `conflict` 文案提示並重新載入；與 B5／B6 的衝突體驗一致。
- [Risk] `completedAt`／`playedAt` 改用伺服器時間，與裝置時間可能差幾秒 → 歷史區間以伺服器時間判定，誤差遠小於區間粒度（日）。
- [Risk] 另一裝置送出比分後，本裝置的名單評分在下一次衝突前是舊值，配對（前端算）可能用到舊評分 → 回合衝突時 `reloadRemotePlayers`；配對的準確度不影響資料正確性。
- [Risk] 每次送出比分的 batch 約 9 條陳述式＋2 次讀取，遠低於 Free 方案每次呼叫 50 個 query 的上限（`/llmstxt/developers_cloudflare_d1_llms-full_txt` limits）；batch 是否把每條陳述式分別計數文件未明說，§1.3 記錄。
- [Trade-off] 分槽不提供 DELETE：前端沒有「刪除單一分槽」的使用情境（本機的 `clearScoreboard(matchId)` 沒有呼叫端）。
- [Trade-off] `resetLocalMatchProgress()` 在雲端重置時清除本機歷史（含訪客時期的歷史）；B8 刪除此函式。

## Migration Plan

- 合併後 `db:migrate:local`（套用 `0003`）。正式站零變更（auth 停用）。**不 push**（D4）。回滾：revert 合併 commit；`0003` 只新增表，不影響既有資料。

## 交接給 B8～B9

1. **B8**：`matchmaker_history` 已有 `played_at`（ms）與主鍵；讀取端點只需 GET。追加順序以 `rowid` 保存。`useRemoteRoundStore` 的 `history` 恆為空陣列——B8 讓歷史頁與統計頁改讀雲端後，
   回合 store 的 `history` 欄位在雲端模式仍無人使用。`resetLocalMatchProgress()` 在 B8 刪除；`buildRemoteBackupSnapshot()` 的 `history` 改取雲端。
2. **B9**：整批守衛（`user-data-sync`「後端多表寫入以單一 batch 與整批守衛完成」）可直接用於「雲端為空才匯入」；匯入的分槽 MUST 屬於匯入回合的未完成場次（Decision 5 的不變式）；
   歷史主鍵使重複的 `matchId` 整批失敗。
3. 本 change 不新增錯誤碼；B9 若需要區分「雲端已有資料」，以 409 搭配前端文案處理即可。

## Open Questions

1. D1／miniflare 對 NOT NULL 違反的錯誤訊息完整文字（§1.4 實測），以及 `isBatchGuardViolation` 是否需要同時比對 `SQLITE_CONSTRAINT`。
2. drizzle 對「`INSERT … SELECT … WHERE EXISTS (… json_each …) ON CONFLICT DO NOTHING RETURNING`」的表達方式（預期 `db.run(sql)` 無法取 RETURNING，改用 `db.all(sql)`／`db.get(sql)`；§1.4 實測）。
3. `INSERT OR IGNORE`／`OR REPLACE` 對 NOT NULL 的處理（守衛 MUST NOT 使用，spec 已禁止）——§1.3 以 Context7 `/websites/sqlite_docs` 補查並記錄，作為 mutation 清單的依據。
4. 對戰頁同時 `GET /round` 與 `GET /slots` 是否需要合併為單一端點（目前兩個請求；若 E2E 出現時序問題再議）。
