# Design: matchmaker-roster-backend

## Context

- 前提：B5 已定下並實作 `user-data-sync` 慣例：`localAuth`（`src/auth/local-auth-middleware.ts`）、`SessionAppEnv`、feature sub-app、版本化契約、
  `USER_DATA_TABLES`（核心套件）＋雙向守衛測試、`lib/sync/{storage-mode,api-client,latest-wins-saver,sync-status}.ts`、`SyncStatusNotice`、
  選擇器 hook 形態、`user-data` E2E project 與 `clearTestAccountUserData()`、`test/helpers/session.ts`。
- B4 已把 `PlayerSchema`（`@pickball/core/matchmaker/types`）搬到核心套件；`roster.ts`（`addPlayer`／`updatePlayer`／`removePlayer`／`togglePlayerActive` 純函式，依賴 `colors.ts`）、
  `roster-csv.ts`（`parseRosterCsv`／`applyRosterImport`）、`storage.ts`、`transfer-storage.ts`、`backup.ts` 留在前端。
- `useRosterStore`（main@414d822）：reducer＋`skipPersist`（RESET 不寫回）、write effect 在前／read effect 在後＋`hasHydratedRef`；
  `addPlayer` 注入 `crypto.randomUUID()` 與 `now`；`resetRoster` → `resetMatchmakerData()`（`RESET_KEYS` 四個 key）。既有 8 個 it。
- `useRosterStore` 的使用者：參賽者頁（全部操作與 `droppedCount`）、對戰頁與統計頁（`players`、`updatePlayer` 當作 `useRoundStore` 的 port：送出比分寫評分、產生對戰寫休息次數）。
  `useRoundStore` 只在動作（產生、重排、換人）時讀 `players`，hydrate 不依賴它。
- 資料頁：`RosterCsvImportSection` 直接 `readRoster()`＋`writeRosterPlayers()`＋`location.reload()`；`JsonBackupSection` 以 `readSnapshot()`／`writeBackup()`；
  `HistoryCsvSection` 以 `readSnapshot()`；`ClearLocalDataSection` 以 `clearAllLocalData()`。

## Goals

- 登入後名單以雲端為準；名單的全部操作（含經 port 寫入的評分與休息次數）在雲端模式寫入後端。
- 補齊「多筆資料」的契約，讓 B8（歷史為多筆、只增不改）有可沿用的樣式；B7 的回合為每人單筆，沿用 B5 的單筆契約。
- 訪客路徑零變更；本機實作一行不改。

## Non-Goals

- 回合／歷史／分槽上雲（B7、B8）；匯入本機資料與登入態 JSON 還原（B9）；名單排序 API。

## Decisions

### Decision 1：資料表以 JSON 存參賽者、複合主鍵

**Choice**：`matchmaker_players(user_id, id, data json, sort_order, version, updated_at)`，PK `(user_id, id)`。

**Rationale**：
- 沿用 B5 Decision 4「JSON 快照＋只有需要查詢／排序的欄位才拆欄」：後端在 B6 不需要查詢參賽者的個別欄位；排序需要 `sort_order`。
  `PlayerSchema` 日後以 `.default()` 演進時，舊列在讀取時由 zod 補值，不需要 migration。
- B7 的後端權威送出比分要更新四位參賽者的評分：以「讀出 data → 核心套件計算 → 帶版本條件寫回 data」完成，與拆欄相比只差在 SQL 寫法，不影響原子性（B7 交接第 2 點）。
- 複合主鍵：參賽者 id 由前端產生，不同使用者匯入同一份備份會有相同 id；單一 `id` 主鍵會讓 B 的匯入因 A 的資料失敗並洩漏存在性。
- Context7（`/drizzle-team/drizzle-orm-docs`）：`sqliteTable(..., (t) => [primaryKey({ columns: [t.userId, t.id] })])` 宣告複合主鍵。

### Decision 2：多筆契約——逐筆版本、刪除冪等、匯入與重置用 batch

**Choice**：見 `user-data-sync`「多筆使用者資料的逐筆版本化契約」。關鍵 SQL：
- 建立：`INSERT ... SELECT ..., COALESCE(MAX(sort_order), -1) + 1 FROM matchmaker_players WHERE user_id = ? ON CONFLICT DO NOTHING RETURNING`（drizzle 以 `sql` 片段表達子查詢；寫法於 §1 實測後定案）。
- 更新：`UPDATE ... SET data, version = version + 1, updated_at WHERE user_id = ? AND id = ? AND version = ? RETURNING`；0 列 → 409。
- 刪除：`DELETE ... WHERE user_id = ? AND id = ?`，不檢查影響列數。
- 匯入：先讀現有最大 `sort_order`，再 `db.batch([insert p1, insert p2, ...])`（**不加** `onConflictDoNothing`），任一主鍵衝突使整批失敗 → catch 為 409。
- 重置：`db.batch([delete matchmaker_players where user_id])`；B7、B8 把回合與歷史的 delete 加進同一個 batch。

**Rationale**：
- Context7（`/llmstxt/developers_cloudflare_d1_llms-full_txt`，`d1/worker-api/d1-database#batch`）：「Batched statements are SQL transactions; if a statement fails … the entire sequence is aborted or rolled back」——
  匯入的整份原子性（spec「匯入整份原子性」Scenario）因此由 D1 保證，測試直接驗證「p4、p5 未寫入」。
- Context7（`/drizzle-team/drizzle-orm-docs`，`batch-api`）：drizzle 的 `db.batch([...])` 對 D1 以單一 batch 送出、可含 insert／update／delete。
- 匯入前「讀最大 `sort_order`」與 batch 之間的競態只影響排序值可能重複（同一使用者兩台裝置同時匯入），不影響資料正確性；`GET` 以 `sort_order, rowid` 排序使結果穩定。記為 Risk。
- 刪除冪等、不比版本：刪除與另一裝置的編輯並發時，「刪除」是明確意圖；對方的 PUT 會因 0 列得到 409 → 重新載入，看到該人已被刪除。若刪除要比版本，
  前端在「新增後立刻刪除」（v0 PUT 尚在途）時沒有可用的版本，會產生難以處理的分支。

### Decision 3：前端——每位參賽者一個最新優先佇列，任一衝突整份重載

**Choice**：`useRemoteRosterStore` 自有 reducer（`HYDRATE`、`UPSERT`、`REMOVE`、`RESET`），重用既有純函式 `addPlayer`／`updatePlayer`／`togglePlayerActive`（`lib/matchmaker/roster.ts`）計算新值；
`versionsRef: Map<id, version>`；`saversRef: Map<id, LatestWinsSaver<{ op: "put", player } | { op: "delete" }>>`，`send` 內讀 `versionsRef` 帶入最新版本；
任一 saver 回報 `conflict` → `dispose` 全部、清空 Map、重新 `GET`、`HYDRATE`、`conflict`；`unauthorized` → `onUnauthorized()`。
`syncStatus` 由各 saver 的狀態彙總（任一 retrying → `retrying`；否則任一在途 → `saving`；否則 `synced`；`conflict`／`rejected` 為黏著狀態，直到下一次全部成功）。

**Rationale**：
- 名單操作頻率低但會「連續編輯同一人」（拖曳強度滑桿、連按出場）；逐人最新優先避免送出中間值，又不會讓 A 的失敗擋住 B 的儲存。
- 整份重載比逐筆合併簡單且符合 D3；名單通常只有數十筆，GET 成本低。
- 「新增後立刻編輯」：v0 PUT 在途時的編輯會排入同一個 saver，等 v0 成功拿到 version 1 後再送，不會出現「以 version 0 更新已存在資料」的 409。

**Alternatives considered**：整份名單一次 PUT（單筆契約）：兩台裝置編輯不同參賽者也會互相衝突，且每次改一人要上傳整份。不選。

### Decision 4：選擇器與既有測試

**Choice**：比照 B5：`useRosterStore.ts` 內既有函式改名為 `useLocalRosterStore`（本體一字不改）、新增選擇器；`useRosterStore.test.tsx` 只新增
`vi.mock("@/hooks/useSession")` 區塊（預設本機快照）與三個新 it。回傳型別 `UseRosterStoreResult` 加 `syncStatus: SyncStatus`。
`hooks/useRemoteRosterStore.ts` 為新檔，依 B3／B5 先例授權同步主 spec 的 hooks 歸屬清單。

**Rationale**：與 B5 相同（本機 hook 一行不動即零迴歸證明）。三個頁面以 `syncStatus` 決定是否以 `SyncStatusNotice` 取代內容；頁面屬前端 TDD 例外層，以 E2E 驗收。

### Decision 5：登入時的重置只清本次活動的本機進度

**Choice**：雲端模式 `resetRoster`：`POST /api/matchmaker/reset` 成功 → `RESET`＋`resetLocalMatchProgress()`（新函式，移除 round、history、match slots 三個 key，key 取自與 `RESET_KEYS` 相同的常數）；
失敗 → 名單不變、`rejected`。非樂觀更新（重置不可逆，失敗時不能讓畫面先空掉）。

**Rationale**：B6～B7 之間回合、歷史、分槽仍在本機，屬於「這場活動」；`matchmaker:roster:v1` 在雲端模式下是訪客時期的資料（B9 匯入的來源），不可清除。
新函式而非改 `resetMatchmakerData()`：訪客路徑的重置行為一行不動；B7、B8 把回合與歷史搬上雲時會逐步縮減這個函式的範圍（交接第 3 點）。

### Decision 6：資料頁——雲端分支收斂在 `lib/matchmaker/remote-transfer.ts`

**Choice**：
- `importRosterRemote(preview, { ids, now })`：`fetchRemotePlayers()` → `applyRosterImport(existing, preview, { ids, now })` → 取 `slice(existing.length)` → `importRemotePlayers(appended)`；
  回傳 `{ ok: true } | { ok: false, message }`（繁體中文，比照 `writeRosterPlayers` 的回傳形狀）。
- `buildRemoteBackupSnapshot()`：`fetchRemotePlayers()` ＋ 本機 `readSnapshot()` 的 `currentRound`／`history`。
- `RosterCsvImportSection`、`JsonBackupSection` 以 `resolveStorageMode(useSession())` 分支；本機分支程式碼不動。JSON 還原在雲端模式不渲染選檔，改顯示說明。

**Rationale**：元件層只做 I/O 樣板（M8 design Decision 7 的既有擺放慣例）；分支邏輯在 lib 可單元測試。`applyRosterImport` 是純函式，雲端與本機共用同一份配色與附加規則（spec 要求重用、不另寫）。

### Decision 7：核心套件新增 `api/players.ts`

**Choice**：`PlayerListResponseSchema = z.object({ items: z.array(z.object({ data: PlayerSchema, version: z.number().int().positive() })) })`、
`PlayerImportRequestSchema = z.object({ players: z.array(PlayerSchema).min(1) }).refine(id 不重複)`；`USER_DATA_TABLES` 加 `matchmaker_players`；`CORE_MODULES` 加一項。

**Rationale**：前端解析回應與後端驗證匯入請求用同一份（B5 Decision 9 的原則）。

## apply §1 查證紀錄（2026-10-22，leader 執行）

**1.2 對齊 B5 實際落地**（與本 design Context 無衝突，以下為實際簽章補充）：
- `localAuth`（`src/auth/local-auth-middleware.ts`）為 `createMiddleware<AuthAppEnv>`；`requireSession` 無 session 回 `401 { error: "UNAUTHORIZED" }`、不 try/catch（getSession 例外 → 500）；
  `SessionAppEnv` 的 `c.var.user.id` 為使用者 id。`getDb(c.env)` 為唯一 D1 入口。
- `src/routes/scoreboard.ts`：`new Hono<SessionAppEnv>().use("*", localAuth, requireSession).onError(...)`，`zValidator("json", schema, hook)` 的 hook 回 `400 INVALID_BODY`；
  `onError` 把 `HTTPException(400)`（JSON 語法錯誤）轉為 `INVALID_BODY`、其他 HTTPException 原樣、其餘 500（B5 OQ6）。
- 核心套件 `api/versioned`（`versionedEnvelopeSchema`／`versionedWriteSchema`，版本為非負整數）、`api/errors`（`API_ERROR_CODES`）、`api/user-data-tables`（目前 `["scoreboard_current"]`）；
  `CORE_MODULES` 目前 21 項（`packages/pickball-core/CLAUDE.md` 亦寫「目前 21 項」，§2 加模組後一併改為 22）。
- 前端 `requestJson(method, path, { body?, schema })` 回 `ok`（204 時 `value: undefined`）／`conflict`／`unauthorized`／`rejected`／`failed`，永不 throw；
  `createLatestWinsSaver({ send, onResult })` 事件為 `saving`／`saved`／`retrying`／`conflict`／`unauthorized`／`rejected`；`resolveStorageMode(snapshot)`；`useSession()` 回 snapshot＋`refresh`。
- `useRemoteScoreboardStore` 回傳 tuple `[state, dispatch, syncStatus]`；名單 hook 依 spec 回傳物件（`UseRosterStoreResult`），兩者形態不同屬預期（名單已是物件形態的既有 API）。
- `playwright.config.ts` 的 `user-data` project 為 `testDir: ./tests/e2e/user-data`、不設 project 層 storageState；`clearTestAccountUserData()` 以 `USER_DATA_TABLES` 逐表 DELETE，加表後自動涵蓋。
- **MODIFIED Requirement 對齊**：`player-roster` 兩個、`data-transfer` 一個、`pickleball-guide-page` 一個，主 spec 原文與 delta 逐行比對後，delta 僅有本 change 的新增段落與 Scenario
  （`pickleball-guide-page` 已含 B5 的 `useRemoteScoreboardStore`；`data-transfer` 主 spec 該 Requirement 末尾的 `---` 分隔線不在 delta 內，archive 時屬排版差異）。無需重新套用；
  `openspec validate --strict` 通過。

**1.3 Context7 查證**：
- `/drizzle-team/drizzle-orm-docs`（`sqlite/indexes-constraints`）：`sqliteTable(name, cols, (t) => [primaryKey({ columns: [t.userId, t.id] })])` 宣告複合主鍵——與 Decision 1 相同。
- 同上（`sqlite/insert`「Insert into ... select」）：`` db.insert(t).select(qb | () => qb | sql`...`) `` 三種寫法皆支援；**upsert 子句存在時 SELECT 必須帶 WHERE**（否則 `ON` 有解析歧義）——
  本案的 SELECT 本來就有 `WHERE user_id = ?`，符合。
- 同上（`sqlite/batch-api`）：`db.batch([...])` 支援 D1，可含 insert／update／delete——與 Decision 2 相同。
- `/llmstxt/developers_cloudflare_d1_llms-full_txt`（`d1/worker-api/d1-database#batch`）：「Batched statements are SQL transactions. If a statement in the sequence fails, … it aborts or rolls back the entire sequence」——與 Decision 2 相同。

**1.4 一次性實測**（workerd＋drizzle-orm 0.45、暫時測試檔，未 commit）：
- `db.batch([insert p4, insert p1(已存在), insert p5])` 拋 `D1_ERROR: UNIQUE constraint failed: …: SQLITE_CONSTRAINT (extended: SQLITE_CONSTRAINT_PRIMARYKEY)`，之後表內只有 p1——**整批回滾成立**。
- `sort_order` 子查詢（Open Questions 1 定案）：
  `` db.insert(t).select(sql`select ${userId}, ${id}, ${JSON.stringify(data)}, coalesce(max(${t.sortOrder}), -1) + 1, 1, ${now.getTime()} from ${t} where ${t.userId} = ${userId}`).onConflictDoNothing().returning() ``
  產生單一陳述式 `insert … select … where user_id = ? on conflict do nothing returning …`；新列回傳且 `data` 經 `mode: "json"` 解回物件；已存在時回 `[]`；該使用者無任何列時 `sort_order` 為 0。
  **注意**：`select` 內的值不經欄位 mapping，`data` 必須自行 `JSON.stringify`、`updated_at` 以 `getTime()` 傳入。query builder 寫法（`` qb.select({ col: sql`…`.as("col") }) ``）亦可，產生等價 SQL。

## Risks / Trade-offs

- [Risk] **過渡期**（B6 合併到 B7 合併之間）：登入時名單在雲端、回合與歷史在本機且與訪客共用同一組 key；登出後訪客會看到登入時產生的回合（球員 id 指向雲端名單），
  登入時也可能看到訪客時期的回合。本批不 push（D4），正式站不受影響；B7 起消失。S2 前不要以真實活動資料測試。
- [Risk] 同一使用者兩台裝置同時匯入時 `sort_order` 可能重複 → `GET` 以 `sort_order, rowid` 排序保持穩定；不影響資料。
- [Risk] `useRoundStore` 送出比分時連續 `updatePlayer` 四人 → 四個 saver 各送一次 PUT（無合併）；任一 409 會整份重載名單，但回合（本機）已記錄該場結果 → 評分可能與歷史不一致。
  B7 以後端權威的單一 batch 取代這條路徑（交接第 2 點）。
- [Risk] 頁面在雲端載入中以提示取代內容，已登入者在 `/api/session` 回應前會先看到本機名單一瞬間（同 B5 Risk 1）。
- [Trade-off] 刪除不比版本（Decision 2）。
- [Trade-off] 登入態 JSON 還原停用，直到 B9。

## Migration Plan

- 合併後 `db:migrate:local`（套用 `0002`）。正式站零變更（auth 停用）。**不 push**（D4）。回滾：revert 合併 commit。

## 交接給 B7～B9

1. **場次分槽**（B5 Decision 1）：`scoreboard:matches:v1` 與回合一起上雲；`resetLocalMatchProgress()` 在 B7 後應只剩 history（B8 後刪除此函式）；`POST /api/matchmaker/reset` 的 batch 要加入回合與分槽表。
2. **送出比分**：後端權威 batch 需更新 `matchmaker_players.data`（四人評分）＋寫回合＋寫歷史；版本條件不成立時讓 batch 失敗的寫法見 B5 Open Questions 1。
   B7 後 `useRoundStore` 在雲端模式不應再經 `updatePlayer` port 逐人 PUT 評分（避免與後端權威重複寫入）。
3. **歷史**（B8）：只增不改，適合「多筆契約」去掉 PUT 更新、只保留 import 式附加；`USER_DATA_TABLES` 與 reset batch 要同步。
4. **B9**：登入態 JSON 還原目前停用（本 change「登入時的資料工具頁」）；B9 決定其去留。本機 `matchmaker:roster:v1` 在登入時刻意保留，作為匯入來源。

## Open Questions

1. drizzle 對「`INSERT ... SELECT MAX(sort_order)+1 ... ON CONFLICT DO NOTHING RETURNING`」的表達方式（`insert().select()` 或 `sql` 原生片段），§1 實測後定案並記錄。
2. 對戰頁與統計頁在雲端載入中以提示取代內容，是否影響 `useRoundStore` 的 hydrate 時序（它不依賴 `players`，預期無影響）——§7 E2E 驗證。
3. （apply §1 定案 OQ1）採 `sql` 模板的 `insert().select()` 單一陳述式（見「apply §1 查證紀錄」1.4），不先讀再寫。
4. （apply §1，B5 帶過來的待辦 1：後端測試補強）納入本 change §3，新增 task 3.6（regression guard，誠實標註）：
   ① `test/user-data-tables.test.ts` 的 `NOT LIKE '_cf_%'` 改為 `NOT GLOB '_cf_*'`（`_` 在 LIKE 為單字元萬用字元；只改查詢字串、it 名稱與斷言不變——這是 tasks 檔頭「允許碰的既有測試檔」以外的唯一例外，經 coordinator 指示授權）；
   ② `test/scoreboard-current.test.ts` **只新增** it：「PUT 忽略 query 與 body 中的 userId，一律寫入登入者本人」「getSession 拋出例外時回 500」「已有資料時 GET 回 200 與該筆資料」（B5 OQ7 ②③；不改既有 it）。
   B6 的 `test/matchmaker-players.test.ts` 在 3.3 RED 時除 spec 的 15 個 it 外，另寫兩個守護 it：「不從 query 或 body 接受 userId」「getSession 拋出例外時回 500」（路由不存在時為 404 → 真紅）。
5. （apply §1，B5 帶過來的待辦 2）`onError`（HTTPException(400) → `INVALID_BODY`）與 `zValidator` hook 抽到 `src/http/`，由 3.5 REFACTOR 執行，scoreboard 與 matchmaker 共用；B5 測試原樣通過。
6. （apply §1，B5 帶過來的待辦 3：跨分頁換帳號，B5 OQ10 ①）**評估結論：本 change 不處理，列為 G1 前必修**。理由：
   另一分頁以 B 登入會直接覆寫同一個 cookie，本分頁之後的請求以 B 的身分成功（不會 401），session store 也不會 refresh，因此「以 user id 作為 effect 依賴」在實務上不會觸發，只是看起來有防護。
   對名單的實際影響有界：本分頁對 A 的參賽者送出的 PUT（version > 0）在 B 名下不存在 → 409 → 整份重載（此時載入的是 B 的名單，但畫面上的帳號仍顯示 A）；DELETE 對 B 為 no-op；
   **新增（version 0 PUT）與 CSV 匯入會寫進 B**。計分板（B5，單筆）在版本號相同時會把 A 的比分覆寫進 B。
   正解需要伺服器端驗證「前端以為的使用者」：例如前端在每個使用者資料請求帶 `X-Expected-User-Id`，後端與 `c.var.user.id` 不符時回 401（觸發 refresh），
   或以 `storage` 事件／BroadcastChannel 跨分頁同步 session。兩者都跨 B5／B6 共用層（`requestJson`、`requireSession`），屬 G1 前必修，不在 B6 範圍內實作。
7. （apply 進度，2026-10-23 leader 交回時）§1、§2 完成（§2 Stage 1 PASS、Stage 2 第一輪 FAIL→補 5 條 regression guard 斷言 `a4c3a8a`→複審 PASS）。
   §3 Implementer 完成 3.1～3.6（`536d6ca..f52b59e`；後端 17 檔／95、`src/http/invalid-body.ts` 抽出 onError 與 zValidator hook），Stage 1 PASS；
   **Stage 2（opus）於交回時仍在執行、結果未知**——接手者須重新派 §3 Stage 2 或取得其結論後再開始 §4。Stage 1 非阻擋觀察：`isConstraintError` 的 `SQLITE_CONSTRAINT` 比對範圍比主鍵衝突寬（FK／NOT NULL 也會判成 409）。
   §4～§8 未開始。
