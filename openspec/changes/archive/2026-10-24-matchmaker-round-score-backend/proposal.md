# Proposal: matchmaker-round-score-backend

## Why

runbook B7：登入後對戰分配機的**目前回合**（含計時器、目標分數、臨時換人）與**對戰場次的計分板分槽**（`scoreboard:matches:v1`）要以後端為準，換裝置可續用。
**送出比分改由後端權威**：B6 的過渡做法是前端算完後經 `updatePlayer` port 逐人 PUT 評分，回合與歷史仍寫本機——任一人的 PUT 衝突就會讓「評分已變、歷史未寫」或反之
（B6 design Risks 第 3 條）。本 change 把「更新四人評分＋標示場次完成＋寫一筆歷史＋清除該場分槽」收進**單一 D1 `batch()`**，
並解決 B5 Open Questions 1／B6 交接第 2 點：**batch 中影響 0 列的 UPDATE 不會讓整批回滾**，版本條件必須改由「一定會寫入一列、條件不符時違反 NOT NULL」的整批守衛陳述式表達。

**前提**：B4 `pickball-core-package`、B5 `scoreboard-backend`、B6 `matchmaker-roster-backend` 皆已合併並 archive
（`@pickball/core`、`user-data-sync` 全部慣例、`matchmaker_players`、`/api/matchmaker/*` sub-app、`useRemoteRosterStore`、`resetLocalMatchProgress()` 皆已存在）。

## What Changes

**後端**
- D1 新表（migration `0003`，`db:generate` 產生）：
  - `matchmaker_round`：每位使用者一筆目前回合（`RoundSchema` JSON）。
  - `matchmaker_match_slots`：`(user_id, match_id)`，對戰場次的計分板分槽（`ScoreboardState` JSON，`matchId` 非 null）。
  - `matchmaker_history`：`(user_id, match_id)`，歷史賽果（`MatchHistoryEntry` JSON＋可查詢的 `played_at`）；本 change 由送出比分寫入，讀取 API 留給 B8。
  - `sync_batch_guards`：整批守衛表（平時恆為空；每個需要多表版本保護的 batch 第一條陳述式寫入一列、最後一條刪除）。
- `src/routes/matchmaker.ts` 新增：
  - `GET／PUT /api/matchmaker/round`（單筆版本化契約；PUT 在同一 batch 內清除「不屬於新回合」的分槽）
  - `GET /api/matchmaker/slots`、`GET／PUT /api/matchmaker/slots/:matchId`（多筆契約的子集，不提供 DELETE 與批次附加——分槽一律由伺服器在 batch 內刪除；建立時場次 MUST 屬於目前回合的未完成場次）
  - `POST /api/matchmaker/round/matches/:matchId/score`：後端以核心套件 `submitScore` 計算，**單一 batch** 原子寫入評分、回合、歷史並清除該場分槽；版本不符時整批不寫入（409）。
  - `POST /api/matchmaker/reset` 的 batch 擴充為名單＋回合＋分槽＋歷史四張表。

**核心套件**：`src/api/round.ts`（回合、分槽、送出比分的請求／回應 schema）；`USER_DATA_TABLES` 加四張表；`CORE_MODULES` 加一項。

**前端**
- `useRoundStore` 改為選擇器（本機實作原封不動改名為同檔的 `useLocalRoundStore`），新增 `hooks/useRemoteRoundStore.ts`：
  回合變更以「命令佇列」送出（`lib/sync/round-command-queue.ts`：單一在途、送出時以最新已確認回合重新套用、連續的回合變更合併為一次 PUT、送出比分不合併）；
  送出比分改呼叫 POST，回應中的四位參賽者經新 port `applyRemotePlayers` 寫入名單（不再逐人 PUT）；回合衝突時經 `reloadRemotePlayers` 一併重載名單。
- `useScoreboardStore` 選擇器擴充：雲端模式且帶 `matchId` 時改用新的 `hooks/useRemoteMatchSlotStore.ts`。
- 對戰頁：雲端模式的分槽清單、自動回填、目標分數鎖定改以雲端分槽為來源；`CourtCard` 進入計分板前先在雲端建立分槽。
- `resetLocalMatchProgress()` 縮減為只清本機歷史（B6 交接第 1 點；B8 刪除）。
- 資料頁（登入時）：JSON 匯出的 `currentRound` 改取自雲端（`history` 仍取本機，B8 改）。
- `lib/sync/round-api.ts`（回合／分槽／送出比分 API 的薄包裝）。

**文件**：兩份 CLAUDE.md 的「回合與歷史在本機」敘述改寫；`hono-pickball/CLAUDE.md` 記錄整批守衛寫法。

### 明確不做

- 歷史與統計的**讀取**上雲（歷史頁、統計頁、歷史 CSV、JSON 匯出的 `history`）——B8。
- 匯入本機資料、登入態 JSON 還原——B9。
- 配對演算法搬到後端（已定案：配對前端算）；計時器的伺服器端計時。
- 新錯誤碼（沿用 `UNAUTHORIZED`／`VERSION_CONFLICT`／`INVALID_BODY`）。

## Capabilities

### New Capabilities

（無）

### Modified Capabilities

- `user-data-sync`：「多筆使用者資料的逐筆版本化契約」允許各資料只提供端點子集並自訂排序；新增「後端多表寫入以單一 batch 與整批守衛完成」。
- `round-lifecycle`：「比分送出的完成流程」加入雲端模式的後端權威 batch；「回合與歷史的持久化與損壞降級」限定本機模式；新增「回合與送出比分的雲端 API」「登入時回合與場次分槽以雲端為準」。
- `match-history`：「完成場次時寫入一筆歷史」加入雲端寫入位置與 `(user_id, match_id)` 第二道防線。
- `match-rating`：「純函式契約與輸入驗證」明訂前後端呼叫同一份核心實作（路徑依 B4 對照表改為核心套件）。
- `scoreboard`：「登入時獨立計分板以雲端為準」擴充為帶 `matchId` 時改用雲端分槽。
- `player-roster`：「重置名單與二次確認」的登入分支（雲端 reset 範圍、`resetLocalMatchProgress` 縮減）；「登入時名單以雲端為準」移除逐人 PUT 評分、加入 `applyRemotePlayers`。
- `data-transfer`：「登入時的資料工具頁」的 `currentRound` 改取自雲端。
- `backend-database`：新增「對戰分配機回合、分槽、歷史與整批守衛資料表由 migration 建立」。
- `pickleball-guide-page`：hooks 歸屬清單加入 `useRemoteRoundStore → round-lifecycle`、`useRemoteMatchSlotStore → scoreboard`。

## Impact

- **後端**：`src/routes/matchmaker.ts`、新增 `src/matchmaker/{round-repository,slots-repository,score-repository,batch-guard}.ts`、`src/matchmaker/players-repository.ts`（reset 擴充）、
  `src/db/schema.ts`、`drizzle/0003_*.sql`（＋meta）；測試新增 `test/d1-batch-guard.test.ts`、`test/matchmaker-round.test.ts`、`test/matchmaker-slots.test.ts`、`test/matchmaker-score.test.ts`，
  `test/d1-schema.test.ts`、`test/matchmaker-players.test.ts` 只新增 it。
- **核心套件**：新增 `src/api/round.ts` 與其測試；`src/api/user-data-tables.ts`；`CORE_MODULES`。
- **前端**：`hooks/useRoundStore.ts`（改名＋選擇器）、`hooks/useRemoteRoundStore.ts`、`hooks/useRemoteMatchSlotStore.ts`、`hooks/useScoreboardStore.ts`（選擇器分支）、
  `hooks/useRemoteRosterStore.ts`（`applyRemotePlayers`、`reloadRemotePlayers`）、`hooks/useRosterStore.ts`（選擇器回傳加這兩者）、`lib/sync/round-api.ts`、`lib/sync/round-command-queue.ts`、
  `lib/matchmaker/storage.ts`（`resetLocalMatchProgress` 縮減）、`lib/matchmaker/remote-transfer.ts`、`app/matchmaker/page.tsx`、`components/matchmaker/CourtCard.tsx`、`app/scoreboard/page.tsx`（若需接線）；
  E2E `tests/e2e/user-data/round-sync.spec.ts`。
- **允許修改的既有測試**：`hooks/useScoreboardStore.test.tsx` 刪除 B5 的「已登入但帶 matchId 時仍走本機分槽且 syncStatus 為 local」（行為依本 change 改變，見 `scoreboard` delta）；
  `lib/matchmaker/storage.test.ts` 改寫 B6 的 `resetLocalMatchProgress` it、`hooks/useRemoteRosterStore.test.tsx` 改寫 B6 的「resetRoster 成功後…」it、`lib/matchmaker/remote-transfer.test.ts` 改寫 B6 的「雲端備份快照…」it（三者名稱與斷言依本 change 的 delta）；其餘既有 it 一律不改。
- **主 spec 例外同步**：依 B3／B5／B6 先例，tasks 授權同步 `pickleball-guide-page` 歸屬清單那一句。
- **相依**：**不新增任何第三方套件**。
- **訪客／正式站**：零變更（本機 hook 本體一行不改；auth 停用時新端點回 404）。
- **過渡期限制（B7～B8 之間，不 push）**：登入時歷史寫入雲端，但歷史頁、統計頁、歷史 CSV 與 JSON 匯出的 `history` 仍讀本機——登入時看不到雲端歷史，B8 起消失。
