# Test Plan: cloud-json-import-append

> **RED-phase 承諾書**。只寫「先寫哪些測試、斷言什麼、為什麼先寫」，不寫實作邏輯。
>
> Tier：`unit`（核心 Vitest node 環境；前端 Vitest＋happy-dom）；`integration`（後端 Vitest 在 workerd＋本機 D1，經 `exports.default.fetch()` 或 `app.request(…, env 覆寫)`）；`e2e`（Playwright `user-data` project，測試帳號登入）。
>
> **it／test 名稱 MUST 與 delta spec 的「驗收」錨點逐字一致。**
>
> **核心**：比照 `test/api/import.test.ts`、`test/api/import-limits.test.ts` 既有 it 的 fixture 寫法（合法參賽者與歷史的建構函式、以 `"x".repeat(n)` 調整位元組數到恰為上限）；新匯出在 GREEN 前不存在，RED 為型別／匯入紅燈。
>
> **後端**：新檔 `hono-pickball/test/local-import-append.test.ts`，頂部 `import "../src/index"`，顯式匯入 `describe`／`it`／`expect`（`beforeEach` 等亦同）；夾具沿用 `test/helpers/matchmaker-fixtures.ts`、`test/helpers/session.ts` 與 `test/local-import.test.ts` 的 D1 替身寫法；
> 每個 it 用不同 email（同檔 it 共用 D1）；「不寫入」一律以送出前後 `rowsOf(table, userId)` 對 `USER_DATA_TABLES` 每張表深度相等斷言；請求一律帶 `Origin` 與 `X-Expected-User-Id`（帳號守衛相關 it 除外）。
>
> **前端**：沿用 `JsonBackupSection.test.tsx` 既有 `vi.mock("@/hooks/useSession")`、`mockRemoteSession`、`snapshotKeys`、`buildBackupFile` 與 `vi.stubGlobal("fetch", fetchMock)`；fetch 依 URL 與 method 分派回應（`POST /api/import`、`GET /api/matchmaker/players`〔409 之後的預覽名單，回 `{ items: [{ data, version }] }`〕與 `POST /api/import/append`）；斷言請求數時分別計數。
> 文案一律自 `local-import-view.ts` 與 `remote-transfer.ts` 匯入常數，不抄字面值；唯一例外是 `local-import-view.test.ts` 鎖定常數值的 it 以字面值比對。「本機資料不變」以 `snapshotKeys()` 前後深度相等斷言。
>
> **E2E 共同要求**：`test.use({ storageState })` 與既有 `test.skip` 條件沿用檔頭；雲端資料以 `page.request.post("/api/import", { headers: await expectedUserHeaders(page.request), data })` 建立、以 `page.request.get` 讀回；備份檔以 `setInputFiles` 的 buffer 提供；
> 同步點用既有寫法（雲端分支說明文字、`[data-sync-status="synced"]`）；web-first 斷言，SHALL NOT `waitForTimeout`；測試帳密不得寫進檔案。
>
> **授權改寫的既有測試（僅限下列；其餘既有 it／test 的名稱、斷言與 setup 一律不得修改）**：
> ① `hono-pickball/test/expected-user-guard.test.ts`：`SAMPLES` 補 `"POST /api/import/append"`（合法附加 body）、`toHaveLength(15)` → `toHaveLength(16)`；
> ② `nextjs-pickball/tests/e2e/user-data/{local-import,history-sync,roster-sync}.spec.ts` 的常數 `JSON_CLOUD_IMPORT_HINT_TEXT` 改為新說明文字；
> ③ `local-import.spec.ts` test「登入時以 JSON 備份匯入到空的雲端且不寫入本機」第二次選檔後的 `getByText(CONFLICT_TEXT)` 可見斷言 → `getByTestId("json-backup-append-confirm")` 可見且 `getByText(CONFLICT_TEXT)` `toHaveCount(0)`（不按附加；註解同步更新）。
> ① 與 ③ 在產品碼未改前即紅（視為該 it／test 的 RED，紀錄中標「改寫既有 it」）；② 是說明文字改變的同步，與 `jsonCloudImportHint` 的產品改動放在同一個 GREEN commit（§4.2），**不宣稱紅燈**，由 §5 的 user-data E2E 實跑驗證。

## user-data-sync

### Requirement: 本機備份附加到雲端的 API（ADDED）

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| AppendImportRequestSchema 拒絕空字串或重複的參賽者 id、重複的歷史 matchId 與兩段皆空 | 附加 API：共用的附加請求與回應 schema | `safeParse`：參賽者 `id: ""`、兩位同 id、兩筆同 `matchId`、`{ players: [], history: [] }` → `success` false；只有一筆歷史、只有一位參賽者 → true；合法請求另帶 `currentRound` → true 且 `data` 不含 `currentRound` | 前後端共用的契約根；匯出不存在 → **真紅**（匯入失敗） | unit |
| AppendImportResponseSchema 只接受新增與略過筆數的固定形狀 | 同上 | `{ appended: { players: { added: 1, skipped: 0 }, history: { added: 0, skipped: 2 } } }` → true；缺 `history`、`added: -1`、`skipped: 1.5`、缺 `appended` → false | 前端解析回應的唯一依據；不存在 → **真紅** | unit |
| serializeAppendSegments 同名只保留第一位參賽者，對照段含全部參賽者，歷史段與整份匯入的歷史段相同 | 附加 API：共用的附加參數形狀 | 參賽者 `x1`「戊」、`x2`「己」、`x3`「戊」與兩筆歷史 → `players` `toBe(JSON.stringify([{ id: "x1", data: x1 }, { id: "x2", data: x2 }]))`；對照段 `toBe(JSON.stringify([{ id: "x1", name: "戊" }, { id: "x2", name: "己" }, { id: "x3", name: "戊" }]))`；`history` `toBe(serializeImportSegments({ version: 1, players: [], currentRound: null, history, scoreboard: { current: null, matches: [] } }).history)` | 備份內同名去重只能在請求層完成（design Decision 3）；不存在 → **真紅** | unit |
| checkAppendLimits 三段各自恰為上限時通過，多一位元組或超過 500 位參賽者即不通過 | 附加 API：共用的附加上限判定 | 參賽者段恰 1,900,000 位元組 → `ok` true 且 `segments` `toEqual(serializeAppendSegments(req))`；多 1 位元組 → false；參賽者對照段、歷史段同上；500 位 → true；501 位（含同名、去重後 < 500）→ false；參賽者段與歷史段各約 1,200,000 位元組（加總超過）→ true | 前後端同一個上限判定；不存在 → **真紅** | unit |
| auth 停用且無 DB binding 時附加端點回 404 | 附加 API：auth 停用時附加端點回 404 | `app.request("/api/import/append", POST 合法 body, { ...env, ENVIRONMENT: undefined, DB: undefined })` → 404 | sub-app 的 `localAuth` 對未定義路由同樣先回 404 → 預期寫入即綠，**regression guard**（mutation：路由改掛到不經 `localAuth` 的 app 須轉紅） | integration |
| 未登入呼叫附加端點回 401 | 附加 API：未登入時附加端點回 401 | 不帶 cookie POST → 401、body `{ error: "UNAUTHORIZED" }` | sub-app `use("*")` 對未定義路由也會先執行 → 預期寫入即綠，**regression guard** | integration |
| 雲端已有資料時附加略過同名或已存在 id 的參賽者與重複歷史，其餘依備份順序接在後面 | 附加 API：略過同名或已存在的參賽者與重複歷史，其餘依備份順序接在後面 | 以 PUT 建立 `c1`「甲」(rating 3)、`c2`「乙」，`seedHistory` `h1` → 附加 `[b1「甲」(5), b2「丙」, c2「改名乙」, b3「丁」]`、`[h1′, h2, h3]` → 200、`appended` 為 `{ players: { added: 2, skipped: 2 }, history: { added: 2, skipped: 1 } }`；GET players 的 `data.id` 依序 `c1,c2,b2,b3`，`c1` rating 3、`c2` 名稱「乙」；`rowsOf` 的 `b2`、`b3` `sort_order` 皆大於附加前最大值且 `b2` < `b3`；GET history `order=asc` 的 `matchId` 依序 `h1,h2,h3` 且 `h1` 的 `data` 為原值 | golden path，四條略過規則與順序一次鎖住；端點不存在回 404 → **真紅** | integration |
| 附加不改動回合、分槽、獨立計分板、版本下限與整批守衛表 | 附加 API：附加不改動回合、分槽、獨立計分板、版本下限與守衛表 | 先建立一位參賽者再重置（產生下限列），之後以 `seedRound`、`seedSlot`、PUT `/api/scoreboard/current` 準備 → 記下 `matchmaker_round`、`matchmaker_match_slots`、`scoreboard_current`、`sync_version_floors` 的本人列 → 附加一位新參賽者與一筆新歷史 → 200；四表 `toEqual` 附加前；`sync_batch_guards` 本人列 `[]` | 「不碰」清單的唯一防線；端點不存在 → **真紅**（狀態碼 404） | integration |
| 同一份備份附加兩次時第二次全部略過且不產生重複 | 附加 API：同一份備份附加兩次 | 雲端一位參賽者；同一請求（2 位新參賽者、2 筆新歷史）送兩次 → 第一次 `added` 2／2；第二次 `{ players: { added: 0, skipped: 2 }, history: { added: 0, skipped: 2 } }`；`matchmaker_players` 3 列、`matchmaker_history` 2 列 | 冪等是使用者重按的保證；不存在 → **真紅** | integration |
| 備份內同名的參賽者只新增第一位 | 附加 API：備份內同名的參賽者只新增第一位 | 雲端「甲」；附加 `x1「戊」, x2「戊」, x3「己」` → `appended.players` `{ added: 2, skipped: 1 }`；GET players 含 `x1` 與 `x3`、不含 `x2` | SQL 看不到同批插入的列，必須由請求層去重；不存在 → **真紅** | integration |
| 附加的歷史中因同名而略過的參賽者 id 改寫為雲端同名者的 id，其餘欄位不變 | 附加 API：附加的歷史中因同名而略過的參賽者 id 改寫為雲端那位的 id | 以 PUT 依序建立 `c1`「甲」、`c5`「甲」→ 附加 `b1「甲」, b2「丙」, b9「丙」` 與 `r1`（單打 `[b1]` vs `[b2]`）、`r2`（雙打 `[b1, b9]` vs `[z1, b2]`）→ `appended.players` `{ added: 1, skipped: 2 }`；GET history 讀回 `r1.teamA.players.map(id)` `toEqual(["c1"])`、`r1.teamB` `["b2"]`、`r2.teamA` `["c1", "b2"]`、`r2.teamB` `["z1", "b2"]`；把讀回的兩筆的球員 id 換回請求值後 `toEqual` 請求的歷史（姓名、分數、陣列順序、`doublesComposition` 不變）；讀回的歷史序列化後不含 `"b1"`、`"b9"`；（實作階段補，regression guard，鎖住 ⑨ teamB 改寫與 ⑪ id 已在雲端不改寫：另加 `r3`〔teamB `[b1, b9]` → `[c1, b2]`〕；另以第二位使用者〔雲端 `c1`「甲」、`c5`「甲」，附加 `c5`「甲」與 teamA `[c5]`、teamB `[c1]` 的歷史〕斷言 `c5` 不被改寫為 `c1`） | 使用者追加定案（統計以 id 為鍵）；改寫只能在後端 SQL 內完成（design Decision 11）；不存在 → **真紅** | integration |
| 附加的參賽者版本為版本下限加一，附加的歷史版本為 1 | 附加 API：附加的參賽者與歷史版本 | PUT `p1`（v1）→ 更新兩次到 v3 → reset → PUT `p2`「甲」v0（回 v4）→ 附加 `p1「乙」` 與一筆歷史 → GET players 的 `p1` version 4、`p2` version 4；`rowsOf(matchmaker_history)` 該筆 version 1；以 `version: 3` PUT `p1` → 409 | 防 ABA（design Decision 6）；不存在 → **真紅** | integration |
| B 的附加不受 A 的資料影響且不改動 A | 附加 API：附加只寫入本人且不受他人資料影響 | A 有 `s1`「甲」與 `h1`；B 有「乙」→ B 附加 `s1「甲」`、`h1` → 200、`added` 1／1；A 在 `USER_DATA_TABLES` 每張表 `toEqual` 附加前；（實作階段補，regression guard，鎖住歷史 id 對應只看本人名單：第二組使用者 A2 先建立 `a1`「甲」、B2 雲端有 `cb2`「甲」，B2 附加備份 `b1`「甲」、`a1`「甲」與 teamA `[b1]`、teamB `[a1]` 的歷史 → `appended.players` `{ added: 0, skipped: 2 }`，讀回兩隊皆為 `[cb2]`，A2 各表不變） | 同名與重複判定 MUST 只看本人；不存在 → **真紅** | integration |
| 空字串或重複的參賽者 id、重複的歷史 matchId 或兩段皆空的附加請求回 400 且不寫入 | 附加 API：不合法的附加請求 | 五種 body 逐一 → 400、`{ error: "INVALID_BODY" }`；該使用者各表 `toEqual` 送出前 | 契約在路由層生效；不存在回 404 → **真紅** | integration |
| 附加的參賽者超過 500 位或單段參數超過上限時回 413 PAYLOAD_TOO_LARGE 且不呼叫 D1 batch | 附加 API：超過筆數或單段上限時回 413 且不送出 batch | `batch` 計數並拋錯、`prepare` 委派真 D1 的替身經 `app.request(…, { ...env, DB: 替身 })`：501 位 → 413、歷史段多 1 位元組 → 413，計數 0；另以真 D1 送歷史段恰 1,900,000 位元組 → 200 且該使用者 `matchmaker_history` 有列 | 上限必須在 batch 前擋下；不存在 → **真紅** | integration |
| 請求 body 超過附加上限時回 413 PAYLOAD_TOO_LARGE 且雲端不寫入 | 附加 API：請求 body 超過上限時回 413 且不寫入 | 合法 body 加約 10MB 未知欄位 → 413、`{ error: "PAYLOAD_TOO_LARGE" }`；各表 `toEqual` 送出前 | 未知欄位會被 schema 剝除，只有 body 上限擋得下；不存在回 404 → **真紅** | integration |
| 預期帳號缺少或與 session 不符時附加回 401 ACCOUNT_MISMATCH 且雲端不寫入 | 附加 API：預期帳號與 session 不符時回 401 且雲端不寫入 | B 的 cookie 帶 A 的 id／不帶／空字串 → 三者 401、`{ error: "ACCOUNT_MISMATCH" }`；A、B 各表 `toEqual` 送出前 | `requireExpectedUser` 對未定義路由也會先執行 → 預期寫入即綠，**regression guard**（GREEN 後 mutation：附加路由改掛到不含 `requireExpectedUser` 的位置須轉紅） | integration |
| 附加以單一 D1 batch 的固定兩條陳述式寫入 300 位參賽者與 2000 筆歷史 | 附加 API：大量資料以單一 batch 的固定兩條陳述式附加 | 記錄 `batch` 呼叫並委派真 D1 的替身；雲端一位參賽者 → 附加 300 位、2,000 筆 → 200、`added` 300／2000；`batch` 呼叫 1 次、`statements.length` 2；`rowsOf` 兩表依 `rowid` 的 `id`／`match_id` 等於陣列順序 | 常數條陳述式是 D1 參數上限下唯一可行寫法；不存在 → **真紅** | integration |
| batch 拋出錯誤時附加回 500 | 附加 API：batch 錯誤回 500 而非 409 | `batch` 一律拋一般錯誤的替身 → 500 | 錯誤不得被吞成其他狀態碼；不存在回 404 → **真紅** | integration |
| 每條使用者資料路由在預期帳號與 session 不符時皆回 401 ACCOUNT_MISMATCH 且資料不變；缺少或空白的預期帳號標頭使使用者資料路由回 401 ACCOUNT_MISMATCH 且資料不變；列舉出的使用者資料路由恰與守衛樣本表一致 | 附加 API：守衛樣本表含附加端點 | **改寫既有 it**（授權 ①）：`SAMPLES` 補附加樣本、長度 16；前兩個 it 對新樣本同樣斷言 401 且快照不變 | 列舉 it 在路由未加前因樣本表多一條而 **真紅**；前兩個 it 對新樣本在 GREEN 前也是 401（middleware）→ 該部分為 regression guard | integration |

### Requirement: 本機資料匯入雲端的 API（MODIFIED）

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| （改寫的錨點）列舉出的使用者資料路由恰與守衛樣本表一致 | 匯入 API：守衛樣本表含匯入端點（總數改為 16） | 同上表最後一列 | 只改總數，不另立 it | integration |
| （既有）`hono-pickball/test/local-import.test.ts` 全部 it、`packages/pickball-core/test/api/import.test.ts` 與 `import-limits.test.ts` 既有 it | 本 Requirement 其餘全部 Scenario | 原樣通過 | regression guard：整份匯入、409 拒絕規則與 7 條 batch 不變 | integration／unit |

### Requirement: 批次寫入端點的筆數與 body 上限（MODIFIED）

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| （新增端點的錨點）附加的參賽者超過 500 位或單段參數超過上限時回 413 PAYLOAD_TOO_LARGE 且不呼叫 D1 batch；請求 body 超過附加上限時回 413 PAYLOAD_TOO_LARGE 且雲端不寫入 | 見 ADDED Requirement | 同上表 | 本 Requirement 只把附加端點列入清單 | integration |
| （既有）共用 body 上限 middleware 超過上限時回 413 PAYLOAD_TOO_LARGE 且不執行下一層；批次寫入的上限常數皆小於 D1 單一字串上限 | 本 Requirement 既有兩個 Scenario | 原樣通過 | regression guard（常數不變） | integration／unit |

### Requirement: 刪除後重建的使用者資料版本不得重複（MODIFIED）

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| （新增路徑的錨點）附加的參賽者版本為版本下限加一，附加的歷史版本為 1 | 見 ADDED Requirement「附加 API：附加的參賽者與歷史版本」 | 同上表 | 本 Requirement 只把附加的參賽者加入建立路徑 | integration |
| （既有）`hono-pickball/test/version-floor.test.ts` 全部 it、`matchmaker-players.test.ts`「重置以單一 D1 batch 送出四條刪除」 | 本 Requirement 全部既有 Scenario | 原樣通過 | regression guard | integration |

## data-transfer

### Requirement: 登入時的資料工具頁（MODIFIED）

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| backupToAppendRequest 只取備份的參賽者與歷史 | 登入資料工具：附加請求的組成與結果分類 | 含 2 位參賽者、2 筆歷史與 `currentRound` 的備份 → 回傳 `toEqual({ players: backup.players, history: backup.history })`，`Object.keys` 恰為 `["players", "history"]` | 回合不匯入的唯一轉換點；不存在 → **真紅** | unit |
| appendBackupToCloud 依回應分類為已附加、未授權、資料過大或失敗且不改動本機 | 同上 | 本機五個 key 有資料；fetch 依序回 200 合法、200 `{}`、401、409、413、500、`throw new TypeError` → `kind` 依序 `appended`（`appended` `toEqual` 回應值）、`failed`、`unauthorized`、`failed`、`too-large`、`failed`、`failed`；每次 `url` 為 `/api/import/append`、`method` 為 `POST`、`headers[EXPECTED_USER_ID_HEADER]` 為 `user-a`、body 解析後 `toEqual` 傳入的 request；前後五個 key 逐字相同 | 前端唯一的附加請求函式；不存在 → **真紅** | unit |
| previewAppendPlayers 依後端的同名與 id 規則列出會新增與視為同一人的參賽者 | 登入資料工具：附加預覽依後端規則列出會新增與視為同一人的參賽者 | 四組 `toEqual`：① 雲端 `c1`「甲」、`c2`「乙」，備份 `b1`「甲」、`b2`「丙」、`c2`「改名乙」、`b3`「丁」→ `{ added: ["丙", "丁"], matched: ["甲", "改名乙"] }`；② 雲端「甲」，備份 `x1`「戊」、`x2`「戊」、`x3`「己」→ `{ added: ["戊", "己"], matched: [] }`；③ 雲端 `c1`「甲」，備份 `c1`「戊」、`x2`「戊」→ `{ added: [], matched: ["戊"] }`；④ 雲端「Amy」，備份「amy」、「Amy」→ `{ added: ["amy"], matched: ["Amy"] }`。①② 的參賽者 id、名稱與順序 MUST 與後端 it「雲端已有資料時附加略過同名或已存在 id 的參賽者與重複歷史…」「備份內同名的參賽者只新增第一位」的夾具相同（註解註明對應的後端 it） | 使用者追加定案的預覽；前後端規則一致的前端錨點（design Decision 12）；不存在 → **真紅** | unit |
| fetchAppendPreview 以呼叫端給的帳號讀取雲端名單並分類為預覽、未授權或失敗 | 登入資料工具：附加預覽以呼叫端給的帳號讀取雲端名單 | 本機五個 key 有資料；附加內容 2 位參賽者；fetch 依序回 200 合法名單、200 `{}`、401、500、`throw new TypeError` → `kind` 依序 `ready`（`preview` `toEqual(previewAppendPlayers(request.players, 名單各列的 data))`）、`failed`、`unauthorized`、`failed`、`failed`；每次 `url` 為 `/api/matchmaker/players`、`method` 為 `GET`、`headers[EXPECTED_USER_ID_HEADER]` 為 `user-a`；前後五個 key 逐字相同 | 預覽名單的唯一讀取點與帳號規則；不存在 → **真紅** | unit |
| 附加結果依略過筆數組成新增與略過的文案 | 登入資料工具：附加結果與確認的文案 | `describeAppendOutcome({ kind: "appended", appended: { players: { added: 3, skipped: 2 }, history: { added: 4, skipped: 1 } } })` → `{ tone: "success", text: "已新增 3 位參賽者、4 筆歷史。", note: "略過同名或已在雲端的參賽者 2 位、略過已在雲端的歷史 1 筆。" }`；只有參賽者略過、只有歷史略過各自只含一句；皆 0 → `note` 為 `undefined`；`unauthorized`、`too-large`、`failed` → `tone: "error"` 且 `text` 依序為 `REMOTE_TRANSFER_MESSAGES.unauthorized`、`LOCAL_IMPORT_MESSAGES.tooLarge`、`LOCAL_IMPORT_MESSAGES.failed` | 結果文案的單一事實來源；不存在 → **真紅** | unit |
| 附加確認的說明、預覽名單標題與提醒、四條說明與按鈕文字為固定值 | 同上 | 字面值比對：`describeAppendPreview(2, 1)`、`describeAppendNewPlayers(3)`（「會新增到雲端的參賽者（3 位）：」）、`describeAppendMatchedPlayers(2)`（「已在雲端、會視為同一人而不新增的參賽者（2 位）：」）、`APPEND_NAME_CHECK_HINT`、`APPEND_RULES`（`toEqual` 四條陣列，① 含名稱比對規則）、`APPEND_ACTION_LABEL`、`APPEND_CANCEL_LABEL`、`LOCAL_IMPORT_MESSAGES.appendNothing`、`appendNoNewPlayers`、`appendPreviewFailed`、`LOCAL_IMPORT_MESSAGES.jsonCloudImportHint` 皆等於 delta spec 的文字；`LOCAL_IMPORT_MESSAGES.cloudNotEmpty` 仍為原文字 | 使用者定案的四條說明不得漂移；常數不存在／說明文字未改 → **真紅** | unit |
| 雲端已有資料時顯示附加確認、預覽名單與四條說明，按下附加到雲端才以當下帳號送出附加請求 | 登入資料工具：雲端已有資料時顯示附加確認，按下附加到雲端才送出 | fetch：`POST /api/import` → 409；`GET /api/matchmaker/players` → 雲端「甲」（id 與備份不同）；`/api/import/append` → 可控 Promise。`mockRemoteSession("user-a")` → 上傳含「甲」「丙」、1 筆、回合的備份 → `findByTestId("json-backup-append-confirm")` 的文字含 `describeAppendPreview(2, 1)`、`describeAppendNewPlayers(1)`、`describeAppendMatchedPlayers(1)`、`APPEND_NAME_CHECK_HINT`；`json-backup-append-new-players` 的 `listitem` 文字 `toEqual(["丙"])`、`json-backup-append-matched-players` 的 `toEqual(["甲"])`、`json-backup-append-rules` 的 `toEqual(APPEND_RULES)`；兩顆按鈕 `type` 為 `button`；`queryByText(LOCAL_IMPORT_MESSAGES.cloudNotEmpty)` null；fetch 2 次，依序為 `POST /api/import` 與 `GET /api/matchmaker/players`，`X-Expected-User-Id` 皆為 `user-a` → `mockRemoteSession("user-b")`、rerender → 按 `APPEND_ACTION_LABEL` → 兩顆按鈕 `disabled`；第 3 次 fetch 的 url、method、`X-Expected-User-Id` 為 `user-b`、body `toEqual({ players, history })` → resolve 200 `{ appended: { players: { added: 1, skipped: 1 }, history: { added: 1, skipped: 0 } } }` → 確認消失；`json-backup-import-message` 文字為「已新增 1 位參賽者、1 筆歷史。」、`-note` 為「略過同名或已在雲端的參賽者 1 位。」；`refresh` 未呼叫；`snapshotKeys()` 不變 | golden path；現行 409 顯示拒絕文案 → **真紅** | unit |
| 附加確認按下取消或重新選檔時不送出附加請求並收起確認 | 登入資料工具：取消附加或重新選檔不送出附加請求 | `/api/import` 依序回 409、409、200、`GET /api/matchmaker/players` 回合法名單 → 第一次選檔後按 `APPEND_CANCEL_LABEL` → `queryByTestId("json-backup-append-confirm")` null、`queryByRole("alert")`、`queryByTestId("json-backup-import-message")` null → 再選同一份檔，確認出現 → 改選另一份備份檔 → 確認消失、`json-backup-import-message` 為整份匯入成功文案；`/api/import` 呼叫 3 次、`GET /api/matchmaker/players` 2 次、`/api/import/append` 0 次；`snapshotKeys()` 不變 | 「使用者自行決定」的另一半與重新選檔重置；現行無確認 → **真紅** | unit |
| 附加請求未授權時刷新 session，資料過大與其他失敗顯示對應文案且不寫入本機 | 登入資料工具：附加請求失敗的文案與 session 刷新 | `GET /api/matchmaker/players` 一律回合法名單；三輪（各輪 `cleanup` 後重新 render）：附加回 401 → `findByRole("alert")` 為 `REMOTE_TRANSFER_MESSAGES.unauthorized`、`refresh` 1 次；413 → `LOCAL_IMPORT_MESSAGES.tooLarge`、`refresh` 未增加；500 → `LOCAL_IMPORT_MESSAGES.failed`；第四輪確認出現後改 `mockSessionWithoutUserId()` 再按 → alert 為 unauthorized 且 `/api/import/append` 呼叫數不增加；每輪 `json-backup-import-message` 不存在、`snapshotKeys()` 不變 | 錯誤分支沿用既有規則；現行無附加流程 → **真紅** | unit |
| 備份沒有可附加的參賽者與歷史時顯示無可附加且不渲染附加按鈕 | 登入資料工具：備份沒有可附加的內容 | 備份 `players: []`、`history: []`、`currentRound` 為合法回合；`/api/import` → 409 → `findByRole("alert")` 為 `LOCAL_IMPORT_MESSAGES.appendNothing`；`queryByTestId("json-backup-append-confirm")`、`queryByRole("button", { name: APPEND_ACTION_LABEL })` null；fetch 1 次（沒有名單 GET） | 防止送出必定 400 的空附加；常數不存在 → **真紅** | unit |
| 附加確認在沒有會新增的參賽者時顯示提示且仍可附加歷史 | 登入資料工具：附加確認在沒有會新增的參賽者時顯示提示且仍可附加 | `/api/import` → 409；名單 GET → 雲端「甲」；上傳只有「甲」（不同 id）與 1 筆歷史的備份 → `findByTestId("json-backup-append-no-new-players")` 文字為 `LOCAL_IMPORT_MESSAGES.appendNoNewPlayers`；`queryByTestId("json-backup-append-new-players")`、`queryByText(APPEND_NAME_CHECK_HINT)` null；`json-backup-append-matched-players` 的 `listitem` `toEqual(["甲"])`；`getByRole("button", { name: APPEND_ACTION_LABEL })` 存在且未停用 | 「沒有新增者」仍可附加歷史，不得把按鈕藏起來；現行無預覽 → **真紅** | unit |
| 讀取雲端名單未授權時刷新 session，其他失敗顯示讀取失敗，兩者皆不顯示附加確認 | 登入資料工具：讀取雲端名單失敗時不顯示附加確認 | `/api/import` 一律 409；兩輪（各輪 `cleanup` 後重新 render）：名單 GET 回 401 → `findByRole("alert")` 為 `REMOTE_TRANSFER_MESSAGES.unauthorized`、`refresh` 1 次；回 500 → alert 為 `LOCAL_IMPORT_MESSAGES.appendPreviewFailed`、`refresh` 未增加；每輪 `queryByTestId("json-backup-append-confirm")`、`queryByRole("button", { name: APPEND_ACTION_LABEL })`、`queryByTestId("json-backup-import-message")` null，`/api/import/append` 0 次；`snapshotKeys()` 不變 | 讀不到名單就無法預覽，不得退回不預覽的確認；現行無預覽 → **真紅** | unit |
| 雲端沒有資料時照舊整份匯入且不顯示附加確認 | 登入資料工具：雲端為空時整份匯入不變 | `/api/import` → 200（2 位、0 筆）→ `json-backup-import-message` 為「已匯入 2 位參賽者、0 筆歷史、0 個回合、0 個場次計分板。」；`queryByTestId("json-backup-append-confirm")` null；fetch 1 次且 url 為 `/api/import` | 雲端為空時行為不變 → 預期寫入即綠，**regression guard**（GREEN 後 mutation：200 也進入附加流程須轉紅） | unit |
| 登入時雲端已有資料時以 JSON 備份附加參賽者與歷史且不覆寫雲端 | 登入資料工具：雲端已有資料時以 JSON 備份附加參賽者與歷史 | `beforeEach` 已清空 → `page.request.post("/api/import")` 建立「共同甲」(rating 3)、「雲端乙」、`ch1`（`playedAt` 為測試當下）、含進行中場次的回合 → 記下 `GET /api/matchmaker/round` → goto 資料頁、等雲端分支說明 → `readLocalKeys`、`markNoReload` → 上傳備份（「共同甲」不同 id rating 5、「新人丙」、`ch1`、`bh2`〔備份共同甲 vs 新人丙〕、另一回合；雲端 `ch1` 為雲端共同甲 vs 雲端乙）→ `json-backup-append-confirm` 可見且含「2 位參賽者、2 筆歷史」與四條說明；`json-backup-append-new-players` 的 `listitem` `toHaveText(["新人丙"])`、`json-backup-append-matched-players` 的 `toHaveText(["共同甲"])` → 按「附加到雲端」→ `json-backup-import-message` `toHaveText("已新增 1 位參賽者、1 筆歷史。")`、`-note` `toHaveText("略過同名或已在雲端的參賽者 1 位、略過已在雲端的歷史 1 筆。")`；`expectNotReloaded`；本機 key 不變 → 參賽者頁 synced 後三個名字依序可見；`GET /api/matchmaker/players` 的名字依序且「共同甲」rating 3；歷史頁「今日」紀錄卡片 `toHaveCount(2)`；統計頁（`/matchmaker/stats`）`player-stat-row-<雲端共同甲 id>` 的出場數欄為 `2`、`player-stat-row-<備份共同甲 id>` `toHaveCount(0)`；`GET /api/matchmaker/round` 的 `data` 與 `version` 等於附加前 | 使用者定案流程的端到端證據（前端 → proxy → 後端 → D1 → 各頁讀回）；現行顯示拒絕文案 → **真紅** | e2e |
| （改寫的同步點）`local-import.spec.ts`「登入時以 JSON 備份匯入到空的雲端且不寫入本機」「登入時以超過 500 位參賽者的 JSON 備份匯入雲端時顯示資料量超過上限且雲端不寫入」；`history-sync.spec.ts`、`roster-sync.spec.ts` 中以 `JSON_CLOUD_IMPORT_HINT_TEXT` 為同步點的 test | 登入時 JSON 還原停用；登入資料工具：以 JSON 備份匯入到空的雲端；匯入本機資料：登入時以超過上限的 JSON 備份匯入雲端；其餘以說明文字為同步點者 | **改寫既有 test**（授權 ②③）：常數改為新說明；第一條的第二次選檔改斷言附加確認可見、`CONFLICT_TEXT` `toHaveCount(0)`；其餘斷言不變 | ② 與產品文字同 commit 同步（不宣稱紅燈）；③ 在附加流程實作前 → **真紅** | e2e |
| （既有）`JsonBackupSection.test.tsx` 既有 6 個 it、`local-import.test.ts` 既有 it、`local-import-view.test.ts` 既有 it、`LocalDataImportSection.test.tsx` 全部 it、`local-import.spec.ts` 中「匯入本機資料到雲端」的 test（含「重複匯入時顯示雲端已有資料且歷史不重複」） | 本 Requirement 其餘既有 Scenario；`data-transfer`「登入後匯入本機資料到雲端」全部 Scenario | 原樣通過 | regression guard：區塊的 409 文案、等待中與無法確認、帳號規則不變 | unit／e2e |

## 指令驗收（非 Vitest，tasks 中標為「驗收（指令）」）

| # | 對應 | 指令 | 期望 |
|---|---|---|---|
| C1 | （型別） | `pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball -r exec tsc --noEmit`；`pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball/hono-pickball typecheck`；`pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball/packages/pickball-core typecheck` | 皆 exit 0 |
| C2 | （lint） | `pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball lint`（雙鎖） | 0 errors、warning 不多於基線 |
| C3 | （單元） | `pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball test`（雙鎖） | 三組皆綠；前端檔數＝基線、測試數＝基線＋13；後端檔數＝基線＋1、測試數＝基線＋15；核心檔數＝基線、測試數＝基線＋4（改寫的既有 it 不增減數量） |
| C4 | （建置） | `pnpm --dir /Users/m2_24gb/Desktop/project/nextjs-pickball build`（雙鎖） | exit 0；建置後 `git status --porcelain` 為空 |
| C5 | （E2E） | `/tmp/cgate2.sh cloud-json-import-append`（矩陣：chromium、firefox、mobile-chrome、user-data 各一次；webkit、mobile-safari 各 `--shard=1/3`～`3/3`） | 五個 browser project 各＝基線且 0 failed（skip 只限既有瀏覽器條件）；user-data＝基線＋1、全 passed、0 skipped |
| C6 | （附加路徑只出現一處） | `grep -rn "/api/import/append" /Users/m2_24gb/Desktop/project/nextjs-pickball/nextjs-pickball/app /Users/m2_24gb/Desktop/project/nextjs-pickball/nextjs-pickball/components /Users/m2_24gb/Desktop/project/nextjs-pickball/nextjs-pickball/hooks /Users/m2_24gb/Desktop/project/nextjs-pickball/nextjs-pickball/lib \| grep -v "\.test\."` | 只有 `lib/sync/local-import.ts` 一行 |
| C7 | （範圍） | `git -C /Users/m2_24gb/Desktop/project/nextjs-pickball diff main --stat -- hono-pickball/src/db hono-pickball/drizzle hono-pickball/src/matchmaker hono-pickball/src/scoreboard hono-pickball/src/auth hono-pickball/src/http hono-pickball/src/index.ts hono-pickball/wrangler.jsonc 'nextjs-pickball/hooks' nextjs-pickball/components/matchmaker/LocalDataImportSection.tsx nextjs-pickball/components/matchmaker/LocalImportNotice.tsx nextjs-pickball/components/matchmaker/LocalImportResultMessage.tsx nextjs-pickball/components/matchmaker/ClearLocalDataSection.tsx nextjs-pickball/components/matchmaker/RosterCsvImportSection.tsx nextjs-pickball/components/matchmaker/HistoryCsvSection.tsx nextjs-pickball/lib/sync/roster-api.ts nextjs-pickball/lib/matchmaker nextjs-pickball/components/layout nextjs-pickball/components/auth nextjs-pickball/components/quiz nextjs-pickball/components/tour nextjs-pickball/components/guide packages/pickball-core/src/matchmaker packages/pickball-core/src/scoreboard nextjs-pickball/package.json hono-pickball/package.json packages/pickball-core/package.json pnpm-lock.yaml openspec/specs` | 輸出為空 |
| C8 | （規格） | `DO_NOT_TRACK=1 openspec validate cloud-json-import-append --strict`（repo root） | valid |
| C9 | （既有匯入未被改動） | `git -C /Users/m2_24gb/Desktop/project/nextjs-pickball diff main -- hono-pickball/test/local-import.test.ts packages/pickball-core/test/api nextjs-pickball/components/matchmaker/LocalDataImportSection.test.tsx \| grep -E "^-[^-]"` | 輸出為空（既有測試只增不刪；核心兩檔只新增 it） |
| C10 | （拒絕文案只留在匯入本機資料區塊） | `grep -rn "cloudNotEmpty" /Users/m2_24gb/Desktop/project/nextjs-pickball/nextjs-pickball/components /Users/m2_24gb/Desktop/project/nextjs-pickball/nextjs-pickball/app \| grep -v "\.test\."` | 只出現在 `components/matchmaker/local-import-view.ts`（常數定義與 `describeImportOutcome`）；`JsonBackupSection.tsx` 不出現 |

## Checklist

- [x] 每個 Requirement 至少一列（user-data-sync 4、data-transfer 1）
- [x] 每個新增 Scenario（user-data-sync 19、data-transfer 12）至少一列；總數改寫的既有 Scenario「匯入 API：守衛樣本表含匯入端點」對應改寫既有 it；其餘既有 Scenario 以「（既有）」列合併
- [x] 每列皆有 Tier（unit | integration | e2e）
- [x] 新 it 共 32（核心 4 真紅；後端 15：真紅 12、regression guard 3；前端 13：真紅 12、regression guard 1——`local-import.test.ts` 4、`local-import-view.test.ts` 2、`JsonBackupSection.test.tsx` 7）；新 E2E 1（真紅）；改寫既有 it 1（真紅）、改寫既有 E2E 斷言 1 處（真紅）；E2E 常數同步 3 檔（非紅燈，與產品文字同 commit）
- [x] 授權改寫的既有測試只有 proposal Impact 列出的三處，不改其他 it／test 的名稱與斷言
