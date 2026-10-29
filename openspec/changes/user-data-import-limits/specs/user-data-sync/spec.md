# Specification: user-data-sync

## MODIFIED Requirements

### Requirement: 本機資料匯入雲端的 API

後端 SHALL 提供 `POST /api/import`（sub-app `src/routes/import.ts`，型別 `SessionAppEnv`，開頭 MUST 為 `use("*", localAuth, requireSession, requireExpectedUser)`、錯誤處理沿用 `userDataOnError`；以 `app.route("/api/import", …)` 掛載；授權、停用閘門、預期帳號守衛與錯誤碼依「使用者資料 API 的路由、授權與停用閘門」與「使用者資料請求的預期帳號守衛」；SQL MUST 帶 `user_id = c.var.user.id`），
把一份本機資料一次寫入雲端。請求以核心 `@pickball/core/api/import` 的 `LocalImportRequestSchema` 驗證：

```
LocalImportRequestSchema = BackupSchema.extend({
  players: PlayerWriteSchema[],
  scoreboard: { current: ScoreboardState（matchId 為 null）| null, matches: ScoreboardState[]（matchId 皆非 null） }
})
```

`matches` 每一筆即一個場次分槽，分槽鍵為該筆的 `matchId`（與 B7 `matchmaker_match_slots` 的 `match_id` 等於 `data.matchId` 的不變式一致）。
`players` 以 `@pickball/core/api/players` 的 `PlayerWriteSchema`（`PlayerSchema` 再要求 `id` 為非空字串）驗證；`BackupSchema` 與 `PlayerSchema` 本身不變（見 `player-roster`「參賽者雲端 API」）。

並 MUST 額外拒絕（`400 INVALID_BODY`）：參賽者 id 為空字串、參賽者 id 重複、歷史 `matchId` 重複、分槽 `matchId` 重複、分槽的 `matchId` 不屬於 `currentRound` 中未完成的場次（`currentRound` 為 `null` 時不得有分槽）、
五段皆為空（無參賽者、無回合、無歷史、無分槽、無獨立計分板）。

**大小與筆數上限**（依「批次寫入端點的筆數與 body 上限」）：

- 請求 body 超過核心 `IMPORT_BODY_LIMIT_BYTES`（10,000,000 位元組）時 MUST 回 `413 { "error": "PAYLOAD_TOO_LARGE" }`，且 SHALL NOT 執行 validator 與 handler。
- 通過 schema 後，以核心 `checkImportLimits(request)` 判定：參賽者超過 `MAX_PLAYERS_PER_IMPORT`（500）位，或 `serializeImportSegments(request)` 產生的五段 JSON 參數（參賽者、回合、分槽、歷史、獨立計分板）任一段的 UTF-8 位元組數超過 `IMPORT_SEGMENT_LIMIT_BYTES`（1,900,000）時，
  MUST 回 `413 { "error": "PAYLOAD_TOO_LARGE" }`，且 MUST 在呼叫 `db.batch()` **之前**拒絕——不寫入任何列、不建立守衛列。恰等於上限時 MUST 照常匯入。各段分別計算，SHALL NOT 以各段加總判定。
- 送進 `json_each` 的五個參數 MUST 就是 `checkImportLimits` 通過時回傳的 `segments`（即 `serializeImportSegments` 的輸出），repository SHALL NOT 自行另組 JSON：前端判定 oversize 用的是同一個函式，形狀只有一份，判定才會與後端一致。
- 判定上限與 D1 平台上限的關係：D1 單一字串／BLOB／列最大 2,000,000 位元組；1,900,000 為 5% 的餘裕（正式 D1 無法在本機驗證；本機 miniflare 約到 2.1～2.2MB 仍會成功，不能代表正式環境）。

**拒絕規則（使用者定案）**：該使用者在 `matchmaker_players`、`matchmaker_round`、`matchmaker_match_slots`、`matchmaker_history` 任一表已有資料時，
MUST 回 `409 VERSION_CONFLICT` 且**整份不寫入**——SHALL NOT 覆寫、SHALL NOT 合併。獨立計分板（`scoreboard_current`）不在拒絕條件內：
雲端已有一筆時該段 MUST 略過（不覆寫），其餘照常匯入，並在回應中標示 `scoreboardCurrent: "skipped"`——
獨立計分板只是「一場進行中的比賽」，若也納入拒絕條件，使用過登入態計分板的使用者將永遠無法匯入名單。

**原子性與冪等**：全部寫入 MUST 在**單一** D1 `batch()` 內完成，第一條為整批守衛（條件：上述四張表皆無該使用者的列），依「後端多表寫入以單一 batch 與整批守衛完成」。
同一份資料重複匯入時，第二次必因第一次已寫入名單、回合或歷史而被守衛拒絕；歷史的 `(user_id, match_id)` 主鍵是第二道防線。因此重複匯入 SHALL NOT 產生重複歷史。

**陳述式數量為常數**：參賽者、分槽、歷史各以**一條** `INSERT … SELECT … FROM json_each(?)` 寫入（整段陣列為單一參數），SHALL NOT 逐筆展開成多條陳述式或多個參數——
D1 每條陳述式最多 100 個參數、單一字串最多 2,000,000 位元組（見 design「查證紀錄」）。插入順序 MUST 依陣列順序（`ORDER BY key`）：
參賽者的 `sort_order` 為陣列索引；歷史的 `played_at` 為 `Date.parse(playedAt)`、插入順序即本機的追加順序（B8 的同時間排序依 `rowid`）。所有匯入列的 `version` 為 1。

成功回 `200 { imported: { players, round: boolean, slots, history, scoreboardCurrent: "imported" | "skipped" | "none" } }`。

**預期帳號守衛**：本端點是使用者資料路由，`hono-pickball/test/expected-user-guard.test.ts` 的樣本表 MUST 補 `POST /api/import` 一條（合法的匯入 body），列舉出的使用者資料路由由 14 條變為 15 條。
匯入一旦寫錯帳號，整份訪客資料會進入另一位使用者的雲端且無法以 API 撤回，因此本端點另在自身測試檔驗證「缺少或不符時雲端不寫入」。

**歷史可被讀回**：匯入的歷史列 MUST 能被 `GET /api/matchmaker/history`（`hono-pickball/src/matchmaker/history-repository.ts`）依區間與兩種排序讀回：`played_at` 為 `Date.parse(playedAt)` 的毫秒值，同 `played_at` 時依插入順序（`rowid`）。

**陳述式上限**：整個 batch 為固定的 7 條陳述式（守衛、參賽者、回合、分槽、歷史、獨立計分板、釋放守衛），不隨資料筆數增加。任一段參數超過上限時依上方「大小與筆數上限」回 413、不送出 batch（前端以同一個 `checkImportLimits` 先行阻擋，見 `data-transfer`「登入後匯入本機資料到雲端」）。
batch 本身拋出的其他錯誤（非整批守衛違規）MUST 照常回 500，SHALL NOT 被分類為 409；batch 失敗時整批回滾是 D1 的平台行為，由 `hono-pickball/test/d1-batch-guard.test.ts` 固定。

#### Scenario: 匯入 API：auth 停用時匯入端點回 404

- **WHEN** 以 auth 停用且無 DB binding 的 env 呼叫 `POST /api/import`
- **THEN** 回 404
- **驗收**：`hono-pickball/test/local-import.test.ts`，it 名稱「auth 停用且無 DB binding 時匯入端點回 404」

#### Scenario: 匯入 API：未登入時匯入端點回 401

- **WHEN** 未帶 session 呼叫 `POST /api/import`
- **THEN** 回 `401 { "error": "UNAUTHORIZED" }`
- **驗收**：`hono-pickball/test/local-import.test.ts`，it 名稱「未登入呼叫匯入端點回 401」

#### Scenario: 匯入 API：匯入只寫入本人且不受他人資料影響

- **GIVEN** 使用者 A 已有名單與歷史
- **WHEN** 使用者 B 匯入一份含相同參賽者 id 與相同歷史 `matchId` 的資料
- **THEN** B 回 200；A 的資料逐列不變
- **驗收**：`hono-pickball/test/local-import.test.ts`，it 名稱「B 的匯入不受 A 的資料影響且不改動 A」

#### Scenario: 匯入 API：匯入五段資料並保留順序

- **GIVEN** 雲端為空
- **WHEN** 匯入 3 位參賽者、一個回合、`m1` 的分槽、依序 `h1`／`h2`／`h3`（`h2`、`h3` 的 `playedAt` 相同）的歷史與一場獨立計分板
- **THEN** 回 200 且 `imported` 為 `{ players: 3, round: true, slots: 1, history: 3, scoreboardCurrent: "imported" }`；
  `GET /api/matchmaker/players` 依原順序；`GET /api/matchmaker/history?order=asc` 依 `h1`、`h2`、`h3`；`GET /api/matchmaker/round`、`/slots`、`/api/scoreboard/current` 各為匯入值；所有 `version` 為 1
- **驗收**：`hono-pickball/test/local-import.test.ts`，it 名稱「匯入五段資料後各自為 version 1 且保留原順序」

#### Scenario: 匯入 API：雲端已有對戰分配機資料時整份不寫入

- **GIVEN** 分別讓雲端只有一位參賽者、只有回合、只有一個分槽、只有一筆歷史（四種情境）
- **WHEN** 匯入一份合法資料
- **THEN** 四種情境皆回 409 `VERSION_CONFLICT`；匯入資料的任何一段都沒有寫入（含獨立計分板）
- **驗收**：`hono-pickball/test/local-import.test.ts`，it 名稱「四張對戰分配機表任一有資料時回 409 且整份不寫入」

#### Scenario: 匯入 API：重複匯入同一份資料

- **WHEN** 以同一份資料連續匯入兩次
- **THEN** 第一次 200、第二次 409；`matchmaker_history` 的筆數等於該份資料的歷史筆數
- **驗收**：`hono-pickball/test/local-import.test.ts`，it 名稱「同一份資料重複匯入時第二次回 409 且歷史不重複」

#### Scenario: 匯入 API：雲端已有獨立計分板時略過該段

- **GIVEN** 雲端 `scoreboard_current` 已有一筆（version 4）
- **WHEN** 匯入含獨立計分板與 2 位參賽者的資料
- **THEN** 回 200，`scoreboardCurrent` 為 `"skipped"`；雲端獨立計分板仍為原值與 version 4；2 位參賽者已寫入
- **驗收**：`hono-pickball/test/local-import.test.ts`，it 名稱「雲端已有獨立計分板時略過該段且不覆寫」

#### Scenario: 匯入 API：不合法的匯入請求

- **WHEN** 分別送出：參賽者 id 重複、歷史 `matchId` 重複、分槽不屬於回合、分槽屬於已完成場次、`currentRound` 為 null 卻有分槽、五段皆空、`version` 不是 1
- **THEN** 七者皆回 400 `INVALID_BODY`，且不寫入任何資料
- **驗收**：`hono-pickball/test/local-import.test.ts`，it 名稱「重複 id、孤兒分槽、空匯入或版本不符的請求回 400 且不寫入」

#### Scenario: 匯入 API：大量資料以常數個陳述式匯入

- **WHEN** 匯入 300 位參賽者與 2,000 筆歷史
- **THEN** 回 200；兩表筆數分別為 300 與 2,000，且列的順序與 `match_id` 依陣列順序
- **AND** 另一次匯入的歷史段 JSON 參數約 2.4MB（超過 D1 單一字串上限 2MB）時回 `413 { "error": "PAYLOAD_TOO_LARGE" }`，且該使用者在各使用者資料表與 `sync_batch_guards` 皆無任何列
- **驗收**：`hono-pickball/test/local-import.test.ts`，it 名稱「300 位參賽者與 2000 筆歷史可一次匯入」

#### Scenario: 匯入 API：共用的匯入請求 schema

- **WHEN** 以 `LocalImportRequestSchema` 解析「歷史 `matchId` 重複」「分槽不屬於回合」「五段皆空」與「合法請求」
- **THEN** 只有合法請求通過
- **驗收**：`packages/pickball-core/test/api/import.test.ts`，it 名稱「LocalImportRequestSchema 拒絕重複 id、孤兒分槽與空匯入」

#### Scenario: 匯入 API：預期帳號與 session 不符時匯入回 401 且雲端不寫入

- **GIVEN** 使用者 A、B 皆已登入且雲端皆為空
- **WHEN** 以 B 的 cookie 分別帶 `X-Expected-User-Id: <A 的 id>`、不帶該標頭、帶空字串，送出一份合法的匯入資料
- **THEN** 三者皆回 `401 { "error": "ACCOUNT_MISMATCH" }`；A 與 B 在 `USER_DATA_TABLES` 每張表中皆無任何列
- **驗收**：`hono-pickball/test/local-import.test.ts`，it 名稱「預期帳號缺少或與 session 不符時匯入回 401 ACCOUNT_MISMATCH 且雲端不寫入」

#### Scenario: 匯入 API：守衛樣本表含匯入端點

- **WHEN** 執行預期帳號守衛的列舉測試
- **THEN** `app.routes` 列舉出的使用者資料路由含 `POST /api/import`，與樣本表一致（共 15 條）；該樣本在帳號不符、缺少或空白標頭時回 `401 ACCOUNT_MISMATCH` 且資料不變
- **驗收**：`hono-pickball/test/expected-user-guard.test.ts`（樣本表補 `POST /api/import`），it 名稱「每條使用者資料路由在預期帳號與 session 不符時皆回 401 ACCOUNT_MISMATCH 且資料不變」「缺少或空白的預期帳號標頭使使用者資料路由回 401 ACCOUNT_MISMATCH 且資料不變」「列舉出的使用者資料路由恰與守衛樣本表一致」

#### Scenario: 匯入 API：匯入的歷史可依區間與排序讀回

- **GIVEN** 雲端為空
- **WHEN** 匯入依序 `h1`（`playedAt` 為 T1）、`h2`、`h3`（兩者 `playedAt` 皆為 T2，T2 > T1）的歷史，之後以 `GET /api/matchmaker/history` 讀取：不帶參數、`order=asc`、`from=<T2 毫秒>`、`to=<T2 毫秒>`
- **THEN** 不帶參數（desc）為 `h2`、`h3`、`h1`；`asc` 為 `h1`、`h2`、`h3`；`from=T2` 只含 `h2`、`h3`；`to=T2` 只含 `h1`；每筆 `data` 與匯入值深度相等、`version` 為 1
- **驗收**：`hono-pickball/test/local-import.test.ts`，it 名稱「匯入的歷史可被歷史端點依區間與兩種排序讀回」

#### Scenario: 匯入 API：單段參數恰為上限時匯入、超過時回 413 且不寫入

- **GIVEN** 雲端為空
- **WHEN** 分別送出：歷史段經 `serializeImportSegments` 後恰為 1,900,000 位元組的請求；歷史段多 1 位元組的請求；參賽者段多 1 位元組的請求（三者各用不同使用者）
- **THEN** 第一個回 200 且歷史已寫入；後兩個皆回 `413 { "error": "PAYLOAD_TOO_LARGE" }`，該使用者在 `USER_DATA_TABLES` 每張表與 `sync_batch_guards` 皆無任何列
- **驗收**：`hono-pickball/test/local-import.test.ts`，it 名稱「單段 JSON 參數恰為上限時匯入成功，超過一位元組時回 413 PAYLOAD_TOO_LARGE 且雲端不寫入」

#### Scenario: 匯入 API：參賽者超過 500 位時回 413 且不寫入

- **WHEN** 分別匯入恰 500 位與 501 位參賽者（各用不同使用者，其餘段為空）
- **THEN** 前者回 200 且 `matchmaker_players` 有 500 列；後者回 `413 { "error": "PAYLOAD_TOO_LARGE" }` 且該使用者在 `USER_DATA_TABLES` 每張表中皆無任何列
- **驗收**：`hono-pickball/test/local-import.test.ts`，it 名稱「參賽者恰為 500 位時匯入成功，501 位時回 413 PAYLOAD_TOO_LARGE 且雲端不寫入」

#### Scenario: 匯入 API：請求 body 超過上限時回 413 且不寫入

- **WHEN** 送出一份 schema 合法、但另含一個約 10MB 未知欄位而使 body 超過 10,000,000 位元組的匯入請求
- **THEN** 回 `413 { "error": "PAYLOAD_TOO_LARGE" }`（未知欄位在 schema 驗證時會被剝除，所以只有 body 上限能擋下）；該使用者在 `USER_DATA_TABLES` 每張表中皆無任何列
- **驗收**：`hono-pickball/test/local-import.test.ts`，it 名稱「請求 body 超過匯入上限時回 413 PAYLOAD_TOO_LARGE 且雲端不寫入」

#### Scenario: 匯入 API：超過上限時不送出 D1 batch

- **GIVEN** 一個 `batch` 被呼叫即計數並拋錯的 D1 替身（`prepare` 照常委派給真實 D1，session 驗證可通過）
- **WHEN** 以該替身送出參賽者 501 位的匯入請求
- **THEN** 回 413 `PAYLOAD_TOO_LARGE`，替身的 `batch` 被呼叫 0 次
- **驗收**：`hono-pickball/test/local-import.test.ts`，it 名稱「超過上限的匯入不呼叫 D1 batch」

#### Scenario: 匯入 API：batch 的非守衛錯誤回 500 而非 409

- **GIVEN** 一個 `batch` 一律拋出一般錯誤的 D1 替身
- **WHEN** 以該替身送出一份合法且未超過上限的匯入請求
- **THEN** 回 500（不是 409）
- **驗收**：`hono-pickball/test/local-import.test.ts`，it 名稱「batch 拋出非守衛錯誤時匯入回 500 而非 409」

#### Scenario: 匯入 API：參賽者 id 為空字串時回 400 且不寫入

- **WHEN** 送出含一位 `id` 為 `""` 的參賽者（其餘欄位合法）的匯入請求
- **THEN** 回 `400 { "error": "INVALID_BODY" }`；該使用者在 `USER_DATA_TABLES` 每張表中皆無任何列
- **驗收**：`hono-pickball/test/local-import.test.ts`，it 名稱「參賽者 id 為空字串的匯入請求回 400 且不寫入」

#### Scenario: 匯入 API：共用的匯入參數形狀與位元組數

- **WHEN** 以一份五段皆有資料的請求呼叫 `serializeImportSegments`；另以 ASCII、2 位元組、3 位元組（中文）、4 位元組（emoji）字元與單獨的代理字元呼叫 `utf8ByteLength`
- **THEN** 五段依序為 `[{ id, data, sortOrder }]`（`sortOrder` 為陣列索引）、`[{ data }]`（回合；`currentRound` 為 null 時為 `[]`）、`[{ matchId, data }]`、`[{ matchId, playedAt: Date.parse(playedAt), data }]`、`[{ data }]`（獨立計分板；null 時為 `[]`）的 `JSON.stringify` 結果；
  `utf8ByteLength` 與 `new TextEncoder().encode(text).length` 逐一相等
- **驗收**：`packages/pickball-core/test/api/import-limits.test.ts`，it 名稱「serializeImportSegments 產生後端 json_each 參數的五段 JSON」「utf8ByteLength 與 TextEncoder 的位元組數一致」

#### Scenario: 匯入 API：共用的上限判定

- **WHEN** 以 `checkImportLimits` 判定：五段各自恰為 1,900,000 位元組、各自多 1 位元組；參賽者恰 500 位與 501 位；兩段各約 1,200,000 位元組（加總超過上限）
- **THEN** 恰為上限、500 位、兩段各自未超過者 `ok` 為 true 且回傳的 `segments` 等於 `serializeImportSegments` 的輸出；任一段多 1 位元組或 501 位者 `ok` 為 false
- **驗收**：`packages/pickball-core/test/api/import-limits.test.ts`，it 名稱「checkImportLimits 依後端參數形狀判定，五段各自恰為上限時通過、多一位元組即超過」「checkImportLimits 拒絕超過 500 位參賽者且不以各段加總判定」

### Requirement: 使用者資料請求的預期帳號守衛

同一瀏覽器的多個分頁共用同一個 session cookie；另一分頁換成其他帳號後，本分頁的請求會以新帳號的身分通過 `requireSession`。
為使「前端以為的帳號」由伺服器驗證，`hono-pickball/src/auth/require-expected-user.ts` SHALL 匯出 `requireExpectedUser`（`createMiddleware<SessionAppEnv>`）：

- 讀取請求標頭 `X-Expected-User-Id`（名稱取自 `@pickball/core/api/headers` 的 `EXPECTED_USER_ID_HEADER`；標頭名稱比對不分大小寫）。
- 標頭缺少、為空字串、或值不**完全等於** `c.var.user.id`（不 trim、不接受逗號串接的多值）時 MUST 回 `401 { "error": "ACCOUNT_MISMATCH" }`，
  且 SHALL NOT 執行之後的 validator 與 handler——資料 MUST 不變，GET 亦 SHALL NOT 回傳任何資料。所有 HTTP 方法（含 GET）一律要求標頭。
- 相符時 MUST 原樣交給下一層，資料仍只以 `c.var.user.id` 決定。

守衛 MUST 位於 `localAuth` 與 `requireSession` 之後：auth 停用時仍回 404、未登入時仍回 `401 UNAUTHORIZED`、`getSession` 例外時仍回 500。
缺標頭與不符共用同一個錯誤碼，SHALL NOT 另設 400 類錯誤碼。

`@pickball/core/api/errors` 的 `API_ERROR_CODES` SHALL 恰含 `UNAUTHORIZED`、`VERSION_CONFLICT`、`INVALID_BODY`、`ACCOUNT_MISMATCH`、`PAYLOAD_TOO_LARGE` 五個鍵（本 Requirement 補充「版本化讀寫契約」所列的錯誤碼清單；`PAYLOAD_TOO_LARGE` 的語意見「批次寫入端點的筆數與 body 上限」）；
`@pickball/core/api/headers` SHALL 匯出 `EXPECTED_USER_ID_HEADER = "X-Expected-User-Id"`，前後端 MUST 使用同一個常數。

守衛範圍 MUST 為「所有使用者資料路由」：`hono-pickball/src/index.ts` 的 app 中，除 `/api/health`、`/api/cookie-check`、`/api/auth/*`、`/api/me`、`/api/session` 之外的每一條路由。
本 change 時為 13 條：`GET／PUT /api/scoreboard/current`；`GET /api/matchmaker/players`、`PUT／DELETE /api/matchmaker/players/:id`、`POST /api/matchmaker/players/import`、`POST /api/matchmaker/reset`；
`GET／PUT /api/matchmaker/round`、`GET /api/matchmaker/slots`、`GET／PUT /api/matchmaker/slots/:matchId`、`POST /api/matchmaker/round/matches/:matchId/score`。
`hono-pickball/test/expected-user-guard.test.ts` MUST 以 `app.routes` 列舉這些路由逐一驗證，每條路由一份「若放行就會改變或回傳資料」的樣本請求，
且列舉結果 MUST 與樣本表的鍵完全一致——之後的 change 新增端點或 sub-app 時，未補樣本或未掛守衛都會使該測試失敗。

#### Scenario: 預期帳號守衛：帳號不符時每條使用者資料路由回 401 且資料不變

- **GIVEN** 使用者 A 與 B 皆已登入，且各自在計分板、名單、回合與分槽皆有資料
- **WHEN** 對每一條使用者資料路由，以 B 的 cookie 與 `X-Expected-User-Id: <A 的 id>` 送出合法的樣本請求
- **THEN** 每一條皆回 `401 { "error": "ACCOUNT_MISMATCH" }`；請求前後 `USER_DATA_TABLES` 每張表中 A 與 B 的列完全相同
- **驗收**：`hono-pickball/test/expected-user-guard.test.ts`，it 名稱「每條使用者資料路由在預期帳號與 session 不符時皆回 401 ACCOUNT_MISMATCH 且資料不變」

#### Scenario: 預期帳號守衛：缺少標頭時每條使用者資料路由回 401 且資料不變

- **GIVEN** 使用者 B 已登入且已有資料
- **WHEN** 對每一條使用者資料路由，以 B 的 cookie、不帶 `X-Expected-User-Id`（另一輪帶空字串）送出合法的樣本請求
- **THEN** 每一條皆回 `401 { "error": "ACCOUNT_MISMATCH" }`，資料不變
- **驗收**：`hono-pickball/test/expected-user-guard.test.ts`，it 名稱「缺少或空白的預期帳號標頭使使用者資料路由回 401 ACCOUNT_MISMATCH 且資料不變」

#### Scenario: 預期帳號守衛：列舉出的路由恰與樣本表一致

- **WHEN** 由 `app.routes` 取出所有路由，排除 method `ALL` 與上列非使用者資料路由
- **THEN** 取得的「方法＋路徑」集合與樣本表的鍵完全相同，且數量為 13
- **驗收**：`hono-pickball/test/expected-user-guard.test.ts`，it 名稱「列舉出的使用者資料路由恰與守衛樣本表一致」

#### Scenario: 預期帳號守衛：未登入與停用的回應優先於帳號守衛

- **WHEN** 不帶 cookie 也不帶標頭呼叫每一條使用者資料路由；另以 auth 停用且無 DB binding 的 env 呼叫同一批路由
- **THEN** 前者皆為 `401 { "error": "UNAUTHORIZED" }`，後者皆為 404
- **驗收**：`hono-pickball/test/expected-user-guard.test.ts`，it 名稱「未登入回 UNAUTHORIZED、停用回 404，皆優先於帳號守衛」

#### Scenario: 預期帳號守衛：標頭與 session 相符時照常處理

- **GIVEN** 使用者 A 已登入
- **WHEN** 以 A 的 cookie 與 `x-expected-user-id: <A 的 id>`（小寫標頭名）呼叫 `PUT /api/scoreboard/current`（`version: 0`），再 GET
- **THEN** PUT 回 200 與 `version: 1`，GET 取回相同資料
- **驗收**：`hono-pickball/test/expected-user-guard.test.ts`，it 名稱「標頭與 session 相符時使用者資料端點照常處理且標頭名稱不分大小寫」

#### Scenario: 預期帳號守衛：非使用者資料路由不要求標頭

- **GIVEN** 使用者 A 已登入
- **WHEN** 以 A 的 cookie、不帶 `X-Expected-User-Id` 呼叫 `GET /api/me`、`GET /api/session`、`GET /api/health`
- **THEN** 三者皆回 200，`/api/me` 與 `/api/session` 的 `user.id` 為 A
- **驗收**：`hono-pickball/test/expected-user-guard.test.ts`，it 名稱「非使用者資料路由不要求預期帳號標頭」

#### Scenario: 預期帳號守衛：錯誤碼常數含 ACCOUNT_MISMATCH

- **WHEN** 匯入 `@pickball/core/api/errors` 的 `API_ERROR_CODES`
- **THEN** 恰含 `UNAUTHORIZED`、`VERSION_CONFLICT`、`INVALID_BODY`、`ACCOUNT_MISMATCH`、`PAYLOAD_TOO_LARGE` 五個鍵，且各鍵的值等於鍵名
- **驗收**：`packages/pickball-core/test/api/errors.test.ts`，it 名稱「API_ERROR_CODES 恰為五個錯誤碼且值等於鍵名」

#### Scenario: 預期帳號守衛：標頭名稱常數

- **WHEN** 匯入 `@pickball/core/api/headers` 的 `EXPECTED_USER_ID_HEADER`
- **THEN** 其值為 `"X-Expected-User-Id"`
- **驗收**：`packages/pickball-core/test/api/headers.test.ts`，it 名稱「EXPECTED_USER_ID_HEADER 為 X-Expected-User-Id」

## ADDED Requirements

### Requirement: 批次寫入端點的筆數與 body 上限

「批次寫入端點」指以客戶端送來的陣列一次寫入多列的使用者資料端點，目前恰為 `POST /api/matchmaker/players/import` 與 `POST /api/import`；
其餘寫入端點（各 `PUT`、`DELETE`、`POST /api/matchmaker/reset`、送出比分）每次只寫入單筆或由伺服器產生固定筆數，不屬此類。之後新增批次寫入端點時 MUST 同樣遵守本 Requirement。

每個批次寫入端點 SHALL 同時具備：

- **body 上限**：以 `hono-pickball/src/http/body-limit.ts` 的共用 middleware（包裝 `hono/body-limit` 的 `bodyLimit`）掛在該路由的 validator **之前**；超過時 MUST 回 `413 { "error": "PAYLOAD_TOO_LARGE" }`，SHALL NOT 執行 validator 與 handler。
  middleware 位於 sub-app 的 `localAuth`、`requireSession`、`requireExpectedUser` 之後：未登入、停用與帳號不符的回應仍優先。
- **筆數上限**：參賽者一次最多 `MAX_PLAYERS_PER_IMPORT`（500）位；超過時 MUST 回 `413 { "error": "PAYLOAD_TOO_LARGE" }`。歷史與分槽不另設筆數上限，由單段位元組上限約束（見「本機資料匯入雲端的 API」）。
- **在寫入前拒絕**：超過任一上限時 MUST 在呼叫 `db.batch()` 之前回應，SHALL NOT 寫入任何列；恰等於上限時 MUST 照常處理。

所有上限數值 MUST 定義在 `@pickball/core`（`api/players` 的 `MAX_PLAYERS_PER_IMPORT`、`PLAYER_IMPORT_BODY_LIMIT_BYTES`；`api/import` 的 `IMPORT_SEGMENT_LIMIT_BYTES`、`IMPORT_BODY_LIMIT_BYTES`），前後端引用同一個常數，SHALL NOT 在任一端另寫數字。
錯誤碼 `PAYLOAD_TOO_LARGE` 只用於本 Requirement 所列的超過上限；schema 不合法仍為 `400 INVALID_BODY`。前端 `requestJson` 對 413 照既有規則分類為 `{ kind: "rejected", status: 413 }`，由各呼叫端依狀態碼轉為「超過上限」的結果。

#### Scenario: 批次寫入上限：共用 body 上限 middleware 回 413 JSON

- **WHEN** 以只掛共用 body 上限 middleware（上限 16 位元組）的測試用 Hono app 分別送出 16 位元組與 17 位元組的 body，以及不帶 `Content-Length` 的 17 位元組串流 body
- **THEN** 16 位元組時交給下一層（回 200）；17 位元組與串流 17 位元組皆回 `413 { "error": "PAYLOAD_TOO_LARGE" }`，且下一層未被執行
- **驗收**：`hono-pickball/test/body-limit.test.ts`，it 名稱「共用 body 上限 middleware 超過上限時回 413 PAYLOAD_TOO_LARGE 且不執行下一層」

#### Scenario: 批次寫入上限：錯誤碼與上限常數由核心匯出

- **WHEN** 匯入 `@pickball/core/api/players` 與 `@pickball/core/api/import` 的上限常數
- **THEN** `MAX_PLAYERS_PER_IMPORT` 為 500、`PLAYER_IMPORT_BODY_LIMIT_BYTES` 為 1,000,000、`IMPORT_SEGMENT_LIMIT_BYTES` 為 1,900,000、`IMPORT_BODY_LIMIT_BYTES` 為 10,000,000；`IMPORT_SEGMENT_LIMIT_BYTES` 小於 D1 單一字串上限 2,000,000，`PLAYER_IMPORT_BODY_LIMIT_BYTES` 亦小於 2,000,000
- **驗收**：`packages/pickball-core/test/api/import-limits.test.ts`，it 名稱「批次寫入的上限常數皆小於 D1 單一字串上限」
