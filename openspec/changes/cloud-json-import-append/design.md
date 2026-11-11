# Design: cloud-json-import-append

## Context

- **兩個雲端匯入入口都走 `POST /api/import`**（`hono-pickball/src/routes/import.ts` → `src/import/local-import-repository.ts` 的 `importLocalData`）：固定 7 條的單一 batch，第一條是整批守衛（`matchmaker_players`／`round`／`match_slots`／`history` 四表皆無本人列），不成立即 `409 VERSION_CONFLICT`、整份不寫。
  路由順序為 `jsonBodyLimit` → `zValidator`（400）→ repository 內 `checkImportLimits`（413）→ batch（409／500）。所以前端拿到 409 時，這份請求已經通過 schema 與上限判定。
- **前端雲端 JSON 匯入**（`components/matchmaker/JsonBackupSection.tsx` 的 `handleCloudImportText`）：`parseBackup` → `backupToImportRequest`（`lib/sync/local-import.ts`）→ `importLocalData(userId, …)` → `describeImportOutcome`（`components/matchmaker/local-import-view.ts`）。409 對應 `LOCAL_IMPORT_MESSAGES.cloudNotEmpty`，與「匯入本機資料到雲端」區塊共用。
  說明文字 `LOCAL_IMPORT_MESSAGES.jsonCloudImportHint` 寫著「只有雲端沒有任何對戰分配機資料時才會寫入；不會覆寫或合併雲端資料」，三個 user-data E2E spec 以它的字面值當「已切到雲端分支」的同步點（`local-import.spec.ts`、`history-sync.spec.ts`、`roster-sync.spec.ts` 共 5 處）。
  `local-import.spec.ts` 的 test「登入時以 JSON 備份匯入到空的雲端且不寫入本機」後半段再選同一份檔，斷言看到 `CONFLICT_TEXT`——本 change 後該入口改顯示附加確認，這一行必須改寫（proposal 授權）。
- **名單的同名規則**：`PlayerSchema.name` 為 `z.string().trim().min(1)`，寫入雲端前已 trim；`player-roster` 沒有名稱唯一性；`data-transfer` 的參賽者 CSV 匯入明定「同名視為不同人」。本 change 依使用者定案在 JSON 附加入口採相反規則（同名視為同一人），只限此入口。
- **sort_order 與版本**（`src/matchmaker/players-repository.ts`、`version-floor.ts`）：單筆建立為 `coalesce(max(sort_order), -1) + 1`、版本為 `initialVersion(userId)`（下限加一，子查詢在同一條陳述式）；`importPlayers` 在 batch 外先讀 max（既有寫法，不沿用）。
  歷史 `version` 恆為 1；`matchmaker_history` 主鍵 `(user_id, match_id)`；`matchmaker_players` 主鍵 `(user_id, id)`。
- **其他裝置是否看得到附加的資料**：雲端 hook（`hooks/useRemote*.ts`）只在掛載與 409 衝突時 `GET`，沒有輪詢、focus 或 visibility 重新讀取（`grep visibilitychange|setInterval|focus` 皆無）。資料頁本身不掛名單或歷史 store（`RosterCsvImportSection` 在確認當下才 GET），切到參賽者頁或歷史頁時重新掛載即讀到新資料，因此**本 change 不需要附加成功後重新讀取**。
  其他已開啟的裝置要到重新載入（或因衝突重新讀取）才看到；附加只新增列、不改既有列的 `version`，其他裝置對既有參賽者的樂觀並行不受影響。
- **統計頁**（`player-stats`「統計資料的計算範圍與唯讀保證」）：`computePlayerStats` 以 `HistoryPlayer.id` 為鍵、SHALL NOT 以姓名為鍵。歷史中唯一引用球員 id 的欄位是 `teamA.players[].id` 與 `teamB.players[].id`（`HistoryPlayerSchema` 為 `{ id, name, ratingBefore, ratingAfter }`；`doublesComposition` 是 `mens`／`womens`／`mixed`／`general` 列舉，不含 id）。
  若附加的歷史保留備份的球員 id，與雲端同名而被略過的那位（雲端 id 與備份 id 不同）在統計頁會分成兩列，附加的比賽也不會算到雲端那位身上——因此 coordinator 追加使用者定案：附加時把這些 id 改寫為雲端同名者的 id（Decision 11）。備份中雲端沒有的新名字以備份 id 新增參賽者，與其歷史 id 一致，不需改寫。
- **守衛樣本表**：`hono-pickball/test/expected-user-guard.test.ts` 以 `app.routes` 列舉使用者資料路由並 `toHaveLength(15)`；新增路由不補樣本即轉紅。
- **D1 batch 結果（Context7 查證，`/llmstxt/developers_cloudflare_d1_llms-full_txt`，2026-11-11）**：`batch()` 回傳與陳述式同位置的 `D1Result` 陣列；每個 `D1Result.meta.changes` 定義為「The number of changes made to the database」，`results` 為 `RETURNING`／`SELECT` 的列；
  batch 是 SQL transaction，任一陳述式失敗整批回滾。文件**沒有**明文說明 `INSERT … SELECT … ON CONFLICT DO NOTHING` 時 `changes` 是否只計實際插入的列；而本專案經 drizzle 的 `db.batch()` 對帶 `.returning()` 的陳述式回傳的是列陣列（既有 `local-import-repository.ts` 的獨立計分板即以 `results[5].length` 判定「寫入／略過」）。
- **SQLite 的同表 `INSERT … SELECT`**：當 SELECT 讀取插入目標表時，SQLite 先把 SELECT 結果算完再插入（同一條陳述式看不到自己剛插入的列）。因此「同一份備份內同名只取第一位」無法靠對 `matchmaker_players` 的 `NOT EXISTS` 達成。
- **drizzle 限制**（`hono-pickball/CLAUDE.md`）：drizzle 0.45.2 的 batch 內帶參數的 raw 陳述式（`db.run`／`db.all`）會失敗，大量插入一律 `db.insert(<table>).select(sql\`… FROM json_each(${json}) … ORDER BY key\`)`；搭配 ON CONFLICT 時 SELECT 需有 `WHERE` 以避免解析歧義。
- **本 change 在主 repo 進行**：Stop hook 會擋主 worktree 的 tsc 紅燈（前端與核心 `src`；後端與核心的 `test/**` 不在 Stop hook 範圍）。

## Goals / Non-Goals

**Goals**

- 已登入且雲端有資料時，使用者能從 JSON 備份把參賽者與歷史救回雲端，由使用者看過說明後自行決定。
- 附加只新增、絕不覆寫或刪除雲端任何既有列；同名參賽者與重複歷史略過；同一份備份重送不產生重複。
- 單一 D1 batch、常數條陳述式；上限判定前後端同一個函式；預期帳號守衛、413、401 規則與既有批次寫入端點一致。
- 附加的比賽算到雲端同名參賽者身上：統計頁不因附加而出現同名的第二列。
- 雲端為空時的整份匯入、訪客的本機覆寫式還原、「匯入本機資料到雲端」區塊完全不變。

**Non-Goals**

- 重算或更新強度分數、匯入回合與分槽、區分同名不同人、改動 `player-stats` 的統計鍵（同名分列由 Decision 11 的 id 改寫解決）。
- 改寫歷史中的姓名快照、`ratingBefore`／`ratingAfter`，或改寫雲端既有歷史的球員 id（只改本次附加寫入的列）。
- 改動「匯入本機資料到雲端」、參賽者 CSV 匯入、雲端 hook（不新增輪詢或跨分頁通知）。
- 新增 npm 相依、migration、遠端 Cloudflare 操作。

## Decisions

### Decision 1：新增端點 `POST /api/import/append`，不擴充 `POST /api/import`

**Choice**：同一個 sub-app 新增 `.post("/append", jsonBodyLimit(IMPORT_BODY_LIMIT_BYTES), zValidator("json", AppendImportRequestSchema, invalidBodyHook), …)`，repository 新增附加函式（放在 `src/import/local-import-repository.ts`，可共用該檔的 json_each 寫法）。
`POST /api/import` 的請求、守衛、回應與 409 完全不動。

**Rationale**：兩者語意相反（「空才整份寫」vs「逐列略過」），回應形狀也不同；分開才能讓既有 `importLocalData` 的 7 條陳述式、`results[5]` 索引與全部既有測試保持原狀。掛在同一 sub-app 自動取得 `localAuth`、`requireSession`、`requireExpectedUser`、`userDataOnError`。

**Alternatives considered**：
- `POST /api/import` 加 `mode: "append"`：同一個 handler 兩套 batch 與回應，`LocalImportRequestSchema` 要變成 union，既有 schema 測試與 E2E 都會受波及。不選。
- 前端組合既有端點（`POST /api/matchmaker/players/import` 附加參賽者＋新增歷史批次端點）：兩次請求不原子，第二步失敗留下半套資料；`players/import` 遇已存在 id 整份 409，不符合逐列略過。不選。
- `POST /api/import` 在 409 情境下自動改為附加：違反「使用者自行決定」。不選。

### Decision 2：前端兩段式——先送整份匯入，409 才顯示附加確認

**Choice**：選檔後照舊送 `POST /api/import`；200 沿用既有文案；`cloud-not-empty` 時以 `backupToAppendRequest` 取出 `{ players, history }`：兩段皆空 → 顯示 `appendNothing`、不渲染按鈕；否則在區塊內顯示附加確認（備份的參賽者數與歷史筆數、四條說明、「附加到雲端」與「取消」）。按下才送 `POST /api/import/append`。
確認顯示的是**備份**的筆數（去重前）；實際新增與略過筆數由後端回應決定並在結果顯示。

**Rationale**：雲端為空時行為零變更（含回合與分槽）；409 由後端權威判定，前端不必先讀雲端。確認前就算出「實際會新增幾位」需要先 GET 名單與歷史（兩個請求、與附加之間有競態），而後端回應本來就會給準確數字。

**Alternatives considered**：
- 選檔後一律先顯示確認：雲端為空的使用者多一步，且會改變既有 E2E 與 Scenario。不選。
- 確認前先 GET 雲端算出淨新增數：多兩個請求、仍可能與實際不符（其他裝置同時寫入）。不選。
- 以 `role="dialog"` 對話框呈現：要處理焦點陷阱與 Esc，區塊內的確認已足夠且與 CSV 匯入預覽一致（區塊內呈現）。不選。

### Decision 3：同名的判定與備份內去重放在核心

**Choice**：同名＝`data.name` 完全相同（`PlayerSchema` 已 trim；大小寫、全半形視為不同）。雲端已有同名者或已有相同 `id` 者皆略過、不覆寫。
同一份請求內的同名去重由核心 `serializeAppendSegments` 完成（每個名稱只留第一位、保持請求順序），`checkAppendLimits` 回傳的 `segments` 就是送進 `json_each` 的參數；後端 `skipped = 請求筆數 − added`。

**Rationale**：Context 已查證同一條 `INSERT … SELECT` 看不到自己插入的列，SQL 端的 `NOT EXISTS` 擋不住同批同名；去重是請求內的純函式運算，與資料庫狀態無關、沒有競態，放在核心可單元測試且前後端量測同一份字串。
`id` 已存在者略過：備份若曾從雲端匯出再還原到本機，同一位參賽者會帶雲端 id；改名後的同一筆仍是同一人，覆寫違反「不覆寫」。

**Alternatives considered**：
- 正規化後比較（`toLowerCase`、NFKC、去全形空白）：沒有既有規則可沿用，誤合併的風險較高。不選。
- SQL 視窗函式（`row_number() OVER (PARTITION BY name ORDER BY key) = 1`）去重：可行但把語意藏在 SQL，且量測的字串含重複者，與送出的形狀不一致。不選。
- schema 拒絕同名：本機名單允許同名（CSV 匯入會產生），會讓合法備份永遠無法附加。不選。

### Decision 4：兩條 `INSERT … SELECT … FROM json_each(?)`，以 `RETURNING` 計數

**Choice**：batch 恰為兩條：
1. 參賽者：`INSERT INTO matchmaker_players (user_id, id, data, sort_order, version, updated_at) SELECT … FROM json_each(<players 段>) WHERE NOT EXISTS (本人雲端名單有相同 json_extract(data,'$.name')) [AND NOT EXISTS (本人雲端已有相同 id)] ORDER BY key ON CONFLICT DO NOTHING RETURNING id`；
   `sort_order` 為「本人目前最大 `sort_order`（無列時 −1）」加上依 `key` 遞增的序號（例如 `row_number() OVER (ORDER BY key)`），`version` 為 `initialVersion(userId)`。
2. 歷史：`INSERT INTO matchmaker_history (user_id, match_id, played_at, data, version, updated_at) WITH <id 對應 CTE> SELECT … <改寫後的 data> … FROM json_each(<history 段>) WHERE true ORDER BY key ON CONFLICT DO NOTHING RETURNING match_id`，`version` 為 1；`data` 的改寫見 Decision 11。

`added` 取各自 `RETURNING` 的列數。實作細節（id 以 `NOT EXISTS` 或 `ON CONFLICT` 排除、序號寫法）由 Implementer 決定，但 MUST 維持：常數兩條、略過條件在 SQL 內、sort_order 大於附加前最大值且依備份順序遞增、`ORDER BY key`。

**Rationale**：與既有匯入同一套 json_each 寫法（D1 每條陳述式 100 個參數上限、單一字串 2MB 上限）；`RETURNING` 是本專案在 batch 內已驗證過的計數方式，而 `meta.changes` 在 ON CONFLICT DO NOTHING 下的語意文件沒有明文，且 drizzle 對帶 `.returning()` 的陳述式回傳的是列陣列。
序號以 SQL 計算：不在 batch 外讀 max（`importPlayers` 的寫法會與其他裝置的 PUT 競態）。

**Alternatives considered**：
- `meta.changes` 計數：見上，文件未保證、且需改用不帶 returning 的形式取 meta。不選（記錄查證結果供日後參考）。
- batch 內先放一條 `SELECT count(*)` 預先計算略過數：多一條陳述式且兩條之間的語意要重複寫一次。不選。
- 先在 JS 端讀雲端名單與歷史、算好要插入的列再送：先讀後寫的競態。不選。

### Decision 5：不使用整批守衛

**Choice**：附加 batch 不放 `insertBatchGuard`／`releaseBatchGuard`；`sync_batch_guards` 不被觸碰。

**Rationale**：「後端多表寫入以單一 batch 與整批守衛完成」的守衛用來表達「前提不成立則整批不寫」。附加沒有整批前提：逐列略過就是預期語意，且略過條件已在各自的 SQL 內對資料庫目前內容判定。兩條陳述式仍在同一個 batch，任一失敗整批回滾。D1 依序執行 batch，兩個同時送出的附加或附加與匯入之間不會交錯。

**Alternatives considered**：放一個恆真的守衛以「符合慣例」：不表達任何條件，只多兩條陳述式並讓 batch 錯誤分類多一條路徑。不選。

### Decision 6：版本與其他裝置

**Choice**：新增參賽者 `version = initialVersion(userId)`；附加的歷史 `version = 1`；下限列只讀不寫、不改任何既有列。
其他裝置不主動通知（雲端 store 沒有輪詢）；本裝置附加後切頁即重新讀取。delta spec 把附加的參賽者加入「刪除後重建的使用者資料版本不得重複」的建立路徑。

**Rationale**：附加的 id 可能曾被刪除過（例如重置前從雲端匯出的備份），取下限加一才能避免 ABA；既有列版本不變，其他裝置手上的版本仍有效。

**Alternatives considered**：附加後由前端廣播（BroadcastChannel）要求其他分頁重新讀取：跨裝置無效、跨分頁的換帳號規則要重審，超出範圍。不選。

### Decision 7：契約與轉換函式的位置

**Choice**：核心 `@pickball/core/api/import` 新增 `AppendImportRequestSchema`、`AppendImportResponseSchema`、`AppendImportRequest`／`AppendImportResponse` 型別、`serializeAppendSegments`、`checkAppendLimits`（不新增模組，`CORE_MODULES` 不變；歷史段建議與 `serializeImportSegments` 共用私有 helper）。
前端 `lib/sync/local-import.ts` 新增 `backupToAppendRequest`、`appendBackupToCloud(expectedUserId, request)` 與 `AppendImportOutcome`（`appended`／`unauthorized`／`too-large`／`failed`），附加路徑字串只出現在此檔。

**Rationale**：上限與參數形狀必須前後端同一份（「批次寫入端點的筆數與 body 上限」）；`Backup → 請求` 的轉換只有前端用，比照既有 `backupToImportRequest` 放在前端同檔。

**Alternatives considered**：轉換函式放核心：後端不需要，徒增核心匯出。`appendBackupToCloud` 放 `remote-transfer.ts`：匯入路徑集中在 `local-import.ts` 是既有慣例。皆不選。

### Decision 8：文案與畫面結構

**Choice**：`local-import-view.ts` 新增 `APPEND_RULES`（四條，`readonly` 陣列）、`APPEND_ACTION_LABEL`、`APPEND_CANCEL_LABEL`、`LOCAL_IMPORT_MESSAGES.appendNothing`、`describeAppendPreview(players, history)`、`describeAppendOutcome(outcome)`，並改寫 `jsonCloudImportHint`；文字以 delta spec 為準。
成功結果沿用 `ImportResultView` 的 `note` 與 `LocalImportResultMessage`（`json-backup-import-message`／`-note`），錯誤沿用既有 `role="alert"` 訊息區；附加確認是 `CardContent` 內的區塊（`data-testid="json-backup-append-confirm"`），說明以 `<ul>` 清單呈現。
`LOCAL_IMPORT_MESSAGES.cloudNotEmpty` 保留（「匯入本機資料到雲端」仍用），只是 JSON 入口不再顯示。

**Rationale**：文案集中可被逐字斷言；成功與補充說明的呈現已有元件，不另寫。

**Alternatives considered**：在 `describeImportOutcome` 內加附加分支：兩種結果型別不同，混在一起會讓「匯入本機資料」區塊也看得到附加文案。不選。

### Decision 9：測試策略

**Choice**：
- 核心：`test/api/import.test.ts` 兩個 it（請求、回應 schema）、`test/api/import-limits.test.ts` 兩個 it（參數形狀、上限），寫法比照既有同檔 it。
- 後端：新檔 `hono-pickball/test/local-import-append.test.ts`，夾具沿用 `test/helpers/matchmaker-fixtures.ts`（`seedAndSignIn`、`seedRound`、`seedSlot`、`seedHistory`、`rowsOf`、`throwingDb`）與 `local-import.test.ts` 的 D1 替身寫法（計數 batch 呼叫、委派 `prepare`）；每個 it 用不同 email 避免同檔資料互相干擾。
  守衛樣本表依 proposal 授權補樣本與長度。
- 前端單元：`local-import.test.ts`、`local-import-view.test.ts`、`JsonBackupSection.test.tsx` 新 it，沿用既有 `vi.stubGlobal("fetch")`、`mockRemoteSession`、`snapshotKeys` 與 `userEvent.upload`；延後回應以可控 Promise 斷言按鈕停用；「不重新載入」以 `vi.spyOn(location, "reload")` 或既有寫法斷言未呼叫（happy-dom 無法 spy 時以「元件仍掛載且狀態保留」替代，紀錄中註明）。
- E2E：`local-import.spec.ts` 新增一條；雲端資料以 `page.request.post("/api/import", { headers: await expectedUserHeaders(page.request), data })` 建立（`beforeEach` 已清空），備份以 `setInputFiles` 的 buffer 提供；雲端狀態以 `page.request.get` 讀回斷言；web-first 斷言、不得 `waitForTimeout`、帳密不進檔案。

### Decision 10：spec 切法

**Choice**：`user-data-sync` ADDED「本機備份附加到雲端的 API」；MODIFIED 三個敘述會變錯的 Requirement（批次寫入端點清單、版本下限的建立路徑、匯入 API 的守衛樣本總數與新端點指引）。`data-transfer` MODIFIED「登入時的資料工具頁」，既有 Scenario 全數保留、新增 8 個。
`match-history`「登入時歷史以雲端為準」中「列舉出的使用者資料路由由 13 條變為 14 條」「共 14 條」早在 `POST /api/import` 加入時就已過時而未改（前例），本 change 比照不動（列入 Open Questions）。

### Decision 11：歷史球員 id 的改寫在後端同一條 SQL 內完成

**Choice**：核心 `serializeAppendSegments` 多產生一段**參賽者對照段**（請求中全部參賽者、不去重的 `[{ id, name }]`）。歷史那條陳述式先以 CTE 建出 id 對應表——對照段中「id 不在本人雲端名單」的每一位，對應到本人雲端名單（此時已含第一條陳述式新增的列）中同名、`sort_order` 最小者的 id——
再以 `json_set(value, '$.teamA.players', (SELECT json_group_array(json_set(t.value, '$.id', coalesce(<對應 id>, t.value ->> '$.id'))) FROM (SELECT value FROM json_each(value, '$.teamA.players') ORDER BY key) t), '$.teamB.players', …)` 產生寫入的 `data`。
規則全文見 delta spec「歷史中的球員 id 改寫」①②③。propose 階段已以 `wrangler d1 execute --local` 實跑此寫法的 SELECT 部分（2026-11-11；CTE 以 `VALUES` 代替名單表）：`b1`→`c1`、`b9`→`b2`、不在名單的 `z1` 不變，姓名、分數與順序保留。

**Rationale**：
- 只有後端看得到雲端名單；放在同一個 batch 的第二條陳述式，看到的名單就是第一條寫入之後的名單（batch 依序執行），略過判定與 id 對應不會不一致，也沒有「先讀後寫」的競態。
- 備份內同名的第二位以後也要對應：它們在核心已被去重、不在參賽者段，所以需要對照段提供 `id → name`；以 `HistoryPlayer.name` 姓名快照比對不可靠（快照是當時的名字，參賽者之後可能改名）。
- 陳述式數量仍為兩條、參數仍是核心產生並量測過的字串（對照段同樣受 1,900,000 位元組上限）。

**Alternatives considered**：
- 前端先 `GET /api/matchmaker/players` 取雲端名單、在瀏覽器改寫歷史再送附加：GET 與附加之間其他裝置可能新增、改名或刪除參賽者，造成「參賽者被 SQL 略過、歷史卻保留備份 id」的分列，或對應到剛被刪除的 id；
  且兩個請求都要帶當下的預期帳號，若中途換帳號（`useSession` 已換成 B），A 的名單會被用來改寫送進 B 的資料——要另外比對兩次請求的帳號才能擋下。多一個請求也讓確認後的等待變長。不選。
- 後端 handler 在 batch 外先讀名單、在 JS 改寫：同樣是先讀後寫的競態（D1 batch 外沒有交易）。不選。
- 不改寫（原設計）：統計頁分列、附加的比賽不算到雲端那位。已被使用者定案推翻。

## Risks / Trade-offs

- [Risk] 歷史 id 改寫的 SQL 較複雜（CTE、巢狀 `json_each`、`json_group_array`、`json_set`）：子查詢 `ORDER BY key` 後再聚合的順序是 SQLite 的實際行為而非文件保證 → Mitigation：本機 D1（miniflare）亦支援聚合函式內的 `ORDER BY`（`json_group_array(x ORDER BY key)`，SQLite 3.44 起；propose 階段已實測），Implementer 可擇一並以 Scenario 的雙打陣列順序斷言鎖住；2,000 筆時對照 CTE 只算一次，不要在每位球員的子查詢內重複掃描名單。
  `INSERT … WITH … SELECT` 若 drizzle 的 `insert().select(sql\`…\`)` 無法產生，可把 CTE 改寫為 FROM 子句內的子查詢；必須用 raw 陳述式才能達成 → 停止並升級。
- [Risk] D1 不允許 `TEMP TABLE`（propose 實測回 `SQLITE_AUTH`）→ 對應表只能用 CTE 或子查詢。
- [Risk] drizzle 的 `insert().select()` 與視窗函式、`ON CONFLICT DO NOTHING`、`RETURNING` 組合可能無法產生預期 SQL → Mitigation：§3 第一個後端 RED 即涵蓋完整組合；可改用 `NOT EXISTS` 排除 id、或改以 `key` 加基準值計算 `sort_order`（允許間隔，Scenario 只要求大於且遞增）；若必須用 `db.run`／raw 陳述式才能達成 → 停止並升級（違反既有限制）。
- [Risk] 同名不同人被合併成一位（球聚常有同名同姓），且其附加的比賽會算到雲端那位的統計上 → Mitigation：使用者已接受；確認畫面第一條說明明講同名視為同一人、歷史會算在雲端那位身上；略過筆數顯示在結果。
- [Trade-off] 改寫只影響本次附加寫入的歷史；雲端既有歷史、或日後另一次附加之前已寫入的歷史不回頭改。
- [Risk] 附加的歷史不反映在強度分數 → 確認畫面第四條說明要求手動調整（使用者定案）。
- [Risk] 備份中的進行中回合遺失 → 第三條說明要求先在本機結束回合再匯出。
- [Risk] 其他已開啟裝置看到舊名單、在附加後才新增同名參賽者 → 單筆新增不做同名檢查是既有行為，接受；重新載入即看到完整名單。
- [Risk] 確認顯示的是備份筆數，與實際新增數不同 → 結果文案顯示實際新增與略過筆數；確認文字寫「可以把這份備份的 N 位參賽者、M 筆歷史附加到雲端」而非「將新增」。
- [Risk] 409 只代表「雲端有對戰分配機資料」，使用者按下附加前雲端可能被清空 → 附加端點在雲端為空時同樣成立（全部新增），結果正確。
- [Risk] 既有 E2E 的字面值同步點與第二次選檔斷言 → proposal 明列授權改寫範圍（3 檔常數、1 處斷言、守衛樣本表），其餘既有 test 不得修改；Final review 以 `git diff` 核對。
- [Risk] 主 repo 的 Stop hook 擋型別紅燈：核心與前端的 RED 會 import 尚不存在的匯出 → RED 與其 GREEN MUST 在同一張派工單內完成；後端 `test/**` 不在 Stop hook 範圍，但交件前 MUST 跑 `pnpm --dir …/hono-pickball typecheck`。
- [Risk] 後端測試在受限沙箱噴 `listen EPERM 127.0.0.1` → 不是設定錯誤，放行後重跑。
- [Risk] user-data E2E 依賴 `.dev.vars` 測試帳號 → 不齊備時停止並向 coordinator 索取，skip 不算通過。

## Migration Plan

無 schema 或資料遷移、無新相依。部署照 README「部署前手動檢查清單」，**順序 MUST 先 `hono-pickball` 後 `nextjs-pickball`**：前端的附加按鈕依賴新端點，反序部署時按下附加會得到 404（分類為 `failed`，顯示「匯入失敗，請稍後再試」，不寫入任何資料）。
回滾：revert 前端提交即回到「409 顯示拒絕」；後端端點留著無害（無呼叫端）。

## Open Questions

（設計裁量已於 Decisions 定案；下列為 propose 階段的判斷，請 coordinator 確認。）

- 回應欄位命名為 `skipped`（而非 `skippedSameName`／`skippedDuplicate`）：參賽者的略過同時包含「雲端同名」「id 已存在」「備份內同名的第二位」，單一名稱較準確；畫面文案為「略過同名或已在雲端的參賽者 K 位」。
- `id` 已存在但名稱不同的參賽者也略過（視為同一筆、不覆寫），計入 `skipped`。
- 第一條說明補上「附加的歷史會算在雲端那位參賽者身上」（因 id 改寫定案而加；仍為四條）。
- id 改寫的對應目標為雲端同名者中 `sort_order` 最小的一位（雲端本身就有同名兩位時取第一位）；`id` 已存在者不改寫；找不到同名者（例如該名稱的第一位因 id 已存在而略過）時不改寫。
- `match-history` 中過時的「共 14 條」比照前例不動；`user-data-sync`「本機資料匯入雲端的 API」的「共 15 條」則以 MODIFIED 改為 16。
