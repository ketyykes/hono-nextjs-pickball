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
`INSERT INTO matchmaker_history (user_id, match_id, played_at, data, version, updated_at) SELECT ?, json_extract(value, '$.matchId'), json_extract(value, '$.playedAt'), json_extract(value, '$.data'), 1, ? FROM json_each(?) ORDER BY key`。
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

### Decision 5：入口——資料頁區塊＋參賽者頁提示，不新增 hook

**Choice**：`LocalDataImportSection` 在資料頁雲端模式渲染；`LocalImportNotice` 在參賽者頁雲端模式、名單 `synced` 且為空、`hasImportableLocalData()` 為真時渲染。兩者的本機讀取都在 effect 內進行（hydration 安全）。

**Rationale**：匯入是一次性動作，不需要跨頁共享狀態，狀態留在元件即可；不新增 hook 也就不需要更新 `pickleball-guide-page` 的歸屬清單。參賽者頁是登入後最先看到「名單是空的」的地方。

### Decision 6：核心 `api/import.ts`

**Choice**：`LocalImportRequestSchema`（`BackupSchema.extend` ＋ `superRefine` 的重複 id／孤兒分槽／空匯入檢查）、`LocalImportResponseSchema`；`CORE_MODULES` 加一項。前後端共用。

## Risks / Trade-offs

- [Risk] 本機歷史超過約 1.9MB（數千筆）時無法一次匯入 → 前端提示並阻止送出；實際量級（單一活動每週數十場）遠低於上限。日後需要時以「同一 batch 內多個 `json_each` 參數」擴充，不改契約。
- [Risk] Free 方案「每次呼叫 50 個 query」是否把 batch 內每條陳述式分別計數，文件未明說；本 change 的 batch 約 7 條＋2 次讀取，兩種解讀皆在上限內（§1 記錄）。
- [Risk] 本機歷史的 `playedAt` 是裝置時間、雲端新歷史是伺服器時間（B7）；匯入後兩者混排，裝置時鐘偏差會影響排序 → 屬資料本身限制，不處理。
- [Risk] 本機名單中的參賽者 id 與另一位使用者相同 → 主鍵含 `user_id`（B6），互不影響（有測試）。
- [Trade-off] 獨立計分板已存在時靜默略過該段（回應標示 `skipped`，畫面顯示「雲端已有進行中的獨立計分板，未匯入該場」）。
- [Trade-off] 「雲端已有資料」沿用 409 `VERSION_CONFLICT`，不新增錯誤碼；`/api/import` 只有這一種 409。

## Migration Plan

- 無 migration。合併後無需額外步驟。正式站零變更（auth 停用）。**不 push**（D4）。回滾：revert 合併 commit（已匯入的雲端資料保留，與一般使用產生的資料無異）。

## Open Questions

1. drizzle 在 `db.batch` 中以 `db.all(sql\`… RETURNING user_id\`)` 取得獨立計分板是否寫入的實際寫法（§1 實測）。
2. `json_extract(value, '$.data')` 寫入 `data` 欄位後，drizzle `mode: "json"` 讀回是否與 `JSON.stringify` 寫入的列等價（含數字精度，例如 rating 4.1）——§1 實測；不等價時改用 `json(json_extract(...))`。
3. 參賽者頁提示在雲端名單 `load-failed` 時是否顯示（建議不顯示，與 B6「載入失敗以錯誤取代內容」一致）。
