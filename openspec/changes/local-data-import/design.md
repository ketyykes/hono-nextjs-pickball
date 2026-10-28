# Design: local-data-import

## Context

- 前提：B4～B8 已合併並 archive。後端有 `scoreboard_current`（B5）、`matchmaker_players`／`matchmaker_round`／`matchmaker_match_slots`／`matchmaker_history`（B6、B7）、`sync_batch_guards` 與整批守衛（B7）。
  B8 起登入時重置名單不清除任何本機 key，本機五個 key 只代表「訪客時期的資料」。
- 本機 reader：`readRoster()`（名單逐筆降級）、`readRound()`、`readHistory()`（逐筆降級並回寫）、`readScoreboard(matchId)`（`scoreboard:matches:v1` 的單一條目）、`readScoreboard(null)`（`scoreboard:current:v1`）。
  目前沒有「讀取整份分槽」的 reader，本 change 也不新增（訪客路徑零變更）。
- `BackupSchema = { version: 1, players, currentRound: Round | null, history }`（核心 `transfer-types.ts`）；`parseBackup(text)` 前端驗證；B6 起登入時 JSON 還原停用並說明「由 B9 決定」。
- 使用者定案：匯入成功後保留本機資料；雲端已有資料時拒絕並提示（不覆寫、不合併）；重複匯入不可產生重複歷史。

## Goals

- 一次、原子地把本機五個 key 匯入空的雲端；重複匯入安全。
- 定案登入時 JSON 還原的語意，與匯入共用同一端點與規則。
- 訪客路徑零變更。

## Non-Goals

- 覆寫／合併、自動匯入、分批匯入超大資料、新錯誤碼、新 hook。

## Decisions

### Decision 1：「雲端為空」以整批守衛判定，範圍是四張對戰分配機表

**Choice**：batch 第一條為 `INSERT INTO sync_batch_guards … VALUES (?, CASE WHEN NOT EXISTS (SELECT 1 FROM matchmaker_players WHERE user_id = ?) AND NOT EXISTS (… matchmaker_round …) AND NOT EXISTS (… matchmaker_match_slots …) AND NOT EXISTS (… matchmaker_history …) THEN 1 END, ?)`；
獨立計分板以 `INSERT … ON CONFLICT (user_id) DO NOTHING RETURNING user_id` 寫入，有回傳列即 `imported`、無則 `skipped`。

**Rationale**：
- 「先 GET 確認雲端為空、再寫入」有競態（兩台裝置同時匯入會產生重複名單）；守衛把判定放進同一個 batch，D1 依序執行並在失敗時整批回滾（B7 Decision 2 的 Context7 證據：`/llmstxt/developers_cloudflare_d1_llms-full_txt` batch 為 SQL transaction）。
- 冪等：第一次匯入只要寫入了任何一段對戰分配機資料，第二次就必然被守衛拒絕；歷史主鍵是第二道防線。唯一「只寫入獨立計分板」的匯入在重送時會再走一次，但該段 `ON CONFLICT DO NOTHING`，不會重複。
- 獨立計分板不納入拒絕條件：登入後用過一次計分板的使用者，雲端就有 `scoreboard_current` 一列（B5 的重置是寫回初始狀態而非刪列），納入的話名單永遠無法匯入。

**Alternatives considered**：
- 五張表（含 `scoreboard_current`）皆空才匯入：如上，會永久卡住。不選。
- 分段判定（名單空才匯名單、歷史空才匯歷史）：會產生「名單是雲端的、歷史是本機的」這種球員 id 對不上的混合狀態，等同合併。不選。
- 以 `user` 表上的「已匯入」旗標判定：需要改 auth 表或新增 migration，且重置名單後使用者無法再匯入備份。不選。

### Decision 2：大量插入以 `json_each` 讓陳述式數量為常數

**Choice**：伺服器把驗證後的陣列整理成 `[{ id, data, sortOrder }]`、`[{ matchId, playedAt, data }]` 等 JSON 字串，各以**一個**參數綁定：
`INSERT INTO matchmaker_history (user_id, match_id, played_at, data, version, updated_at) SELECT ?, json_extract(value, '$.matchId'), json_extract(value, '$.playedAt'), json_extract(value, '$.data'), 1, ? FROM json_each(?) WHERE true ORDER BY key`。
drizzle 寫法為 `db.insert(<table>).select(sql\`SELECT … FROM json_each(${json}) WHERE true ORDER BY key\`)`（query builder，可放進 `db.batch`）；**不可用 `db.run(sql)`／`db.all(sql)`**——drizzle 0.45.2 的 batch 內帶參數的 raw 陳述式會失敗（`hono-pickball/CLAUDE.md`「多表寫入用整批守衛」禁止事項）。
回合只有一列，以一般 `db.insert(matchmakerRound).values(...)` 寫入；獨立計分板以 `db.insert(scoreboardCurrent).values(...).onConflictDoNothing().returning({ userId })`（apply §1 實測，見查證紀錄）。
前端在送出前檢查名單、歷史、分槽三段各自序列化後 ≤ 1,900,000 位元組（保留給 JSON 包裝與 UTF-8 的餘裕）。

**Rationale（Context7 證據）**：
- `/llmstxt/developers_cloudflare_d1_llms-full_txt`（`platform/limits`）：每條陳述式最多 **100 個綁定參數**、單一字串／BLOB／列最大 **2MB**、SQL 陳述式長度上限 100KB、
  Free 方案每次 Worker 呼叫 **50 個 query**（Paid 1000），且單一 query 的限制適用於 batch 內的每條陳述式。逐筆 `insert().values([...])` 在 100 參數上限下最多十幾筆就要拆陳述式，
  千筆歷史會變成上百條陳述式，超過 Free 方案的 query 上限；`json_each` 使總陳述式數固定約 7 條。
- `/llmstxt/developers_cloudflare_d1_llms-full_txt`（`sql-api/query-json`）：D1 支援 `json_each`、`json_extract`。
- `/drizzle-team/drizzle-orm-docs`（`sqlite/batch-api`、`sqlite/insert`）：`db.batch` 可含 `db.run(sql)`／`db.all(sql)`；`insert().select(sql)` 可用原生 SQL 子查詢。
- `json_extract(value, '$.data')` 對物件回傳 JSON 文字，與 drizzle `text(..., { mode: "json" })` 讀取時的 `JSON.parse` 相容（§1 實測確認）。
- 插入順序：`ORDER BY key` 讓 `rowid` 依陣列順序遞增，B8 的「同 `played_at` 依插入順序」因此保留本機的追加順序。

**Alternatives considered**：
- 分多次請求匯入：失去整份原子性（中途失敗會留下半份資料，且之後的重試被守衛拒絕）。不選。
- 以 D1 的 `exec` 多語句：不支援綁定參數，需要字串拼接，有注入風險。不選。

### Decision 3：前端只讀、經既有 reader、保留本機資料

**Choice**：`buildLocalImportPayload()` 只呼叫既有 reader；分槽只對本機回合的未完成場次逐一 `readScoreboard(matchId)`（孤兒分槽自然不會被讀到）；歷史去重在此完成並回報略過筆數；匯入成功後不呼叫任何寫入或清除。

**Rationale**：
- reader 內建逐筆降級——直接 `JSON.parse` 會讓損毀資料在後端才以 400 失敗，使用者無從得知是哪一筆。
- 以回合的未完成場次為索引讀分槽，讓請求必然通過後端的不變式檢查，也不必為了「讀整份分槽」新增 reader；後端仍檢查（防線不靠前端）。
- 保留本機資料是使用者定案；搭配 Decision 1 的拒絕規則，保留不會造成重複。
- 注意：`readHistory()` 遇到損毀列時會回寫清理後的結果、`readScoreboard` 遇到損毀資料會移除該 key（既有行為）——這是 reader 的既有副作用，不是匯入新增的寫入；spec 的「呼叫前後逐字相同」以無損毀資料的情境驗證。

### Decision 4：登入時 JSON 還原＝「從 JSON 備份匯入到雲端」

**Choice**：`JsonBackupSection` 的雲端分支：選檔 → `parseBackup` → `backupToImportRequest` → `importLocalData`；本機分支不動。

**Rationale**：B6 停用時把語意（覆寫、合併或拒絕）留給 B9。使用者已為「匯入本機資料」定案「拒絕」，同樣是「以外部資料建立雲端資料」的 JSON 還原採相同規則最一致；
要以備份取代雲端資料的路徑是「重置名單 → 匯入」，兩步皆有明確確認。

**Alternatives considered**：雲端模式維持停用：使用者必須登出、還原到本機、再登入、再匯入本機資料，四步才能達成同樣結果。不選。

### Decision 4.5：匯入是一次性雲端操作，帶預期帳號（B7.5 交接）

**Choice**：`src/routes/import.ts` 開頭 `use("*", localAuth, requireSession, requireExpectedUser)`、`onError(userDataOnError)`；`expected-user-guard.test.ts` 樣本表補 `POST /api/import`（14 → 15）。
前端 `importLocalData(expectedUserId, payload)`（第一參數，原樣交給 `requestJson`）；`LocalDataImportSection` 與 `JsonBackupSection` 雲端分支以點擊當下 `useSession()` 的 user id 呼叫，`null` 時不送出，`unauthorized` 時顯示 `REMOTE_TRANSFER_MESSAGES.unauthorized` 並 `refresh()`。

**Rationale**：B7.5 design「交接給 B8／B9」第 2 點；匯入寫錯帳號時整份訪客資料進入另一位使用者的雲端且無法以 API 撤回，後果在所有使用者資料端點中最大，因此除列舉測試外，本端點在自身測試檔另驗「缺少或不符時雲端不寫入」。

### Decision 5：入口——資料頁區塊＋參賽者頁提示，不新增 hook

**Choice**：`LocalDataImportSection` 在資料頁雲端模式渲染；`LocalImportNotice` 在參賽者頁雲端模式、名單 `synced` 且為空、`hasImportableLocalData()` 為真時渲染。兩者的本機讀取都在 effect 內進行（hydration 安全）。

**Rationale**：匯入是一次性動作，不需要跨頁共享狀態，狀態留在元件即可；不新增 hook 也就不需要更新 `pickleball-guide-page` 的歸屬清單。參賽者頁是登入後最先看到「名單是空的」的地方。

### Decision 6：核心 `api/import.ts`

**Choice**：`LocalImportRequestSchema`（`BackupSchema.extend` ＋ `superRefine` 的重複 id／孤兒分槽／空匯入檢查）、`LocalImportResponseSchema`；`CORE_MODULES` 加一項。前後端共用。

## Risks / Trade-offs

- [Risk] 本機歷史超過約 1.9MB（數千筆）時無法一次匯入 → 前端提示並阻止送出；實際量級（單一活動每週數十場）遠低於上限。日後需要時以「同一 batch 內多個 `json_each` 參數」擴充，不改契約。
- [Risk] Free 方案「每次呼叫 50 個 query」是否把 batch 內每條陳述式分別計數，文件未明說；本 change 的 batch 固定 7 條陳述式（不隨筆數增加）＋session 驗證的查詢，兩種解讀皆在上限內（§1 記錄）。後端不另做大小檢查：超過 2MB 的參數由 D1 拋錯、整批回滾、回 500，無部分寫入。
- [Risk] 本機歷史的 `playedAt` 是裝置時間、雲端新歷史是伺服器時間（B7）；匯入後兩者混排，裝置時鐘偏差會影響排序 → 屬資料本身限制，不處理。
- [Risk] 本機名單中的參賽者 id 與另一位使用者相同 → 主鍵含 `user_id`（B6），互不影響（有測試）。
- [Trade-off] 獨立計分板已存在時靜默略過該段（回應標示 `skipped`，畫面顯示「雲端已有進行中的獨立計分板，未匯入該場」）。
- [Trade-off] 「雲端已有資料」沿用 409 `VERSION_CONFLICT`，不新增錯誤碼；`/api/import` 只有這一種 409。

## Migration Plan

- 無 migration。合併後無需額外步驟。正式站零變更（auth 停用）。**不 push**（D4）。回滾：revert 合併 commit（已匯入的雲端資料保留，與一般使用產生的資料無異）。

## 交接與對齊（apply §1，2026-10-28）

- **B7.5**（`2026-10-27-user-data-account-guard` design「交接給 B8／B9」第 2 點）：已落實為 Decision 4.5；delta `user-data-sync` 新增「匯入 API：預期帳號與 session 不符時匯入回 401 且雲端不寫入」「匯入 API：守衛樣本表含匯入端點」；
  `data-transfer` 新增兩個元件層 Scenario（點擊當下帳號＋未授權 refresh）；test-plan 授權覆蓋表加第四欄；E2E 直接打 API 時用 `tests/e2e/helpers/user-data.ts` 的 `expectedUserHeaders()`。
- **B8**（`2026-10-28-matchmaker-history-stats-backend` design「交接給 B9」）：`played_at = Date.parse(playedAt)`、依本機追加順序插入（`ORDER BY key` → `rowid` 遞增），本機五個 key 皆可為來源；
  新增 Scenario「匯入 API：匯入的歷史可依區間與排序讀回」，以 `GET /api/matchmaker/history`（`history-repository.ts`）的 desc／asc／from／to 讀回證明。
- **B7**（`2026-10-24-matchmaker-round-score-backend` design「交接給 B8～B9」）：守衛沿用 `batch-guard.ts` 的 `insertBatchGuard`／`releaseBatchGuard`／`isBatchGuardViolation`；新測試的登入 seed 用 `test/helpers/matchmaker-fixtures.ts`（`seedAndSignIn`、`request` 的 base 為 `/api/matchmaker`，匯入端點需另以同檔 `origin` 組 URL 或 `appRequestInit`），不另複製。
  `hono-pickball/CLAUDE.md` 後續須知第 3 點（第二個守衛 batch 呼叫端時抽 `guardedBatch`）：列為 §3.3 REFACTOR 的評估項，由 Implementer 判斷，不強制。

## apply §1 查證紀錄（2026-10-28）

**1.1 環境**：見 environment.md Verification（baseline 前端 105／1054、後端 23／166、核心 8／17；lint 0／3；三段 typecheck exit 0；E2E 五個 browser project 各 145、user-data 40；lockfile 零變動；`db:migrate:local` 無待套用；`db:seed:local` 成功）。

**1.2 對齊 main**：
- `data-transfer`「登入時的資料工具頁」：原 delta 以 B6 版本為底，缺 B8 的帳號段落與三個 Scenario（`validate --strict` 失敗）。已改以**目前主 spec** 為底重新套用本 change 的增修：表格 JSON 還原列改寫、加「匯入本機資料」列、B8 一次性操作段落擴及雲端 JSON 匯入、「JSON 還原停用的理由」改為 B9 定案語意；B8 四個 Scenario 原文帶入。
  主 spec 的「登入時 JSON 還原停用」Scenario 無法丟棄（OpenSpec MODIFIED 限制，同 B7／B8 前例），**沿用標題、改寫內容**為「本機覆寫式的 JSON 還原在登入時停用（改為雲端匯入）」，驗收改指向 `local-import.spec.ts`；Scenario 內附一行說明。另新增「登入資料工具：以 JSON 備份匯入到空的雲端」。
- 新增 Scenario 一律加 Requirement 前綴（`登入資料工具：`、`匯入本機資料：`、`匯入 API：`）；模擬 archive 後兩個 capability 皆無重複標題。it／test 名稱（驗收錨點）不變。
- 本機 reader 實際位置：`readRoster` 在 `lib/matchmaker/storage.ts`（回 `{ players, droppedCount }`）、`readRound`／`readHistory` 在 `lib/matchmaker/round-storage.ts`、`readScoreboard` 在 `lib/scoreboard/storage.ts`；本機 key 常數在 `lib/matchmaker/storage-keys.ts` 與 `lib/scoreboard/storage-keys.ts`。
- **既有 E2E 的同步點**：B6 的停用說明文字 `JSON_RESTORE_DISABLED_TEXT` 除了「登入時 JSON 還原停用並顯示說明」外，另被 `roster-sync.spec.ts` 三個 test 與 `history-sync.spec.ts`「登入時歷史 CSV 匯出的內容來自雲端」當作「已切到雲端分支」的同步點。B9 移除該文字後這四處必紅，
  因此 tasks 授權：兩檔的該常數改為雲端 JSON 匯入的說明文字（常數改名 `JSON_CLOUD_IMPORT_HINT_TEXT`），同步點斷言的位置與語意不變（見 Open Questions 4）。

**1.3 Context7 查證**：
- `/llmstxt/developers_cloudflare_d1_llms-full_txt`（`platform/limits`）：每條陳述式最多 100 個綁定參數；單一字串／BLOB／列最大 2,000,000 bytes；SQL 陳述式長度上限 100KB；每次 Worker 呼叫 query 數 1000（Paid）／50（Free）；
  「Limits for individual queries … apply to each individual statement contained within a batch」——**batch 內每條是否各計一個 query 仍未明說**，保守以逐條計：7 條＋session 查詢遠低於 50。`D1Database.batch()`：「Batched statements are SQL transactions … the entire sequence is aborted or rolled back」——與 Decision 1 一致。
- `/drizzle-team/drizzle-orm-docs`（`sqlite/insert`「Insert into ... select」）：`insert().select()` 可傳 SQL template tag；有 upsert 子句時 SELECT 須帶 `WHERE true` 以避免解析歧義（本 change 的 json_each 插入一律帶 `WHERE true`）。`latest-releases/drizzle-orm-v0290`：`db.batch` 可含 `insert().returning()`，回應為對應的列陣列。
- `/websites/sqlite_docs`（`json1.html`）：`json_each` 對陣列的 `key` 為整數索引；`json_extract` 單一路徑指向物件／陣列時回「text representation」（JSON 文字），指向數字回 INTEGER／REAL。與 design 假設一致。

**1.4 一次性實測（workerd，未 commit）**：以 drizzle 在單一 `db.batch` 中執行 守衛 → `insert(matchmakerPlayers).select(sql … json_each … WHERE true ORDER BY key)` → `insert(matchmakerHistory).select(...)` → 計分板 `onConflictDoNothing().returning({ userId })` → 釋放守衛：
- 參賽者 `sort_order` 依陣列索引；`json_extract(value, '$.data')` 寫入的 `data` 為 `text`，drizzle json mode 讀回與原物件**深度相等**（含 rating `4.1`、`3.33`、`7.999999999999999`），不需 `json(...)` 包裝 → **Open Questions 2 定案**。
- 歷史依 `ORDER BY key` 插入，`rowid` 遞增；`ORDER BY played_at, rowid` 讀回時同 `played_at` 的兩筆維持陣列順序。
- 計分板 `RETURNING`：首次 `[{ userId }]`、已存在時 `[]` → **Open Questions 1 定案**（以 `returning` 陣列是否為空判斷 `imported`／`skipped`）。
- 守衛條件為假時 batch 拋錯且 `isBatchGuardViolation` 為 true。
- 300 位參賽者（JSON 66KB）＋2000 筆歷史（JSON 779KB）一次 batch 成功；改以 `insert().values()` 一次 200 筆（1200 個參數）時 miniflare 拋 `Failed query`——證實「逐筆 values」變異會在大量資料 it 轉紅。

## Open Questions

1. ~~drizzle 在 `db.batch` 中以 `db.all(sql…RETURNING)` 取得獨立計分板是否寫入的實際寫法~~ → **apply §1 定案**：改用 `insert().values().onConflictDoNothing().returning({ userId })`（`db.all(sql)` 帶參數在 batch 內不可用）。
2. ~~`json_extract(value, '$.data')` 讀回是否等價~~ → **apply §1 定案**：深度相等（含 4.1、7.999999999999999），不需 `json()`。
3. 參賽者頁提示在雲端名單 `load-failed` 時是否顯示（建議不顯示，與 B6「載入失敗以錯誤取代內容」一致）。
4. **（apply §1，待 coordinator 知悉，非阻擋）授權修改的既有測試**：除 proposal 原列的 `roster-sync.spec.ts` 刪除「登入時 JSON 還原停用並顯示說明」外，另有三處為本 change 行為的必然結果——
   ① `hono-pickball/test/expected-user-guard.test.ts` 的 `SAMPLES` 補 `POST /api/import`、`toHaveLength(14)` → 15（B7.5 刻意設計的交接紅燈，同 B8 前例）；
   ② `packages/pickball-core/test/module-boundary.test.ts` 的 `CORE_MODULES` 加 `api/import`（同 B5～B8 前例）；
   ③ `roster-sync.spec.ts` 與 `history-sync.spec.ts` 的 `JSON_RESTORE_DISABLED_TEXT` 常數改為雲端匯入說明文字並改名（四個 test 的同步點，斷言位置與語意不變）。
5. **（apply §1）`data-transfer`「登入時 JSON 還原停用」沿用標題、內容改寫**：理由見查證紀錄 1.2；替代方案 REMOVED＋ADDED 整條 Requirement（9 個 Scenario、移到主 spec 末尾）成本高於收益，不選。若 coordinator 要求改名，需另開 change。
6. Open Questions 3（參賽者頁提示在 `load-failed` 時）：維持建議——提示只在名單 `synced` 時渲染；`loading`／`load-failed` 時參賽者頁本來就以 `SyncStatusNotice` 取代整段內容，提示自然不出現。
7. （apply §2，2026-10-28）Implementer（sonnet）：132090c RED（模組不存在，2 個 it 皆真紅、無先綠）→ 9e3a76a GREEN（`api/import.ts`、`CORE_MODULES`）→ 5dc4637 tasks 註記；REFACTOR skipped。Stage 1（sonnet）PASS。
   Stage 2（opus）第一輪 FAIL（src 無缺陷；12 條非等價存活：空匯入漏判 currentRound、去重鍵改 name、current 的 matchId 放寬為 falsy、current／matches 可省略、回應筆數小數／負數、回應欄位可省略）→ 2e327c0 regression guard（新增兩個 it 與 `expectTypeOf`）→ 複審 PASS（12 條全紅、抽查 10 條仍紅、4 條等價對照綠）。§2 完成。
