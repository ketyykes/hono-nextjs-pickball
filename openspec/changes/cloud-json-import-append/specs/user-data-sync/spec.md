# Specification: user-data-sync

## ADDED Requirements

### Requirement: 本機備份附加到雲端的 API

後端 SHALL 提供 `POST /api/import/append`，掛在「本機資料匯入雲端的 API」的同一個 sub-app（`hono-pickball/src/routes/import.ts`，開頭的 `use("*", localAuth, requireSession, requireExpectedUser)` 與 `onError(userDataOnError)` 因此一併適用；授權、停用閘門、預期帳號守衛與錯誤碼依「使用者資料 API 的路由、授權與停用閘門」與「使用者資料請求的預期帳號守衛」；SQL MUST 帶 `user_id = c.var.user.id`），
把一份備份中的參賽者與歷史**附加**到雲端：只新增雲端沒有的，SHALL NOT 覆寫、刪除或改動雲端任何既有的列。用途是讓使用者自行決定把 session 無法確認期間在本機產生的資料（經 JSON 備份）救回雲端（使用者定案）。

**請求**以核心 `@pickball/core/api/import` 的 `AppendImportRequestSchema` 驗證：

```
AppendImportRequestSchema = { players: PlayerWriteSchema[], history: MatchHistoryEntry[] }
```

- 不含回合、分槽與獨立計分板：備份中的進行中回合 SHALL NOT 匯入（使用者定案）；未知欄位依 zod 預設剝除。
- MUST 額外拒絕（`400 INVALID_BODY`）：參賽者 id 為空字串、參賽者 id 重複、歷史 `matchId` 重複、兩段皆為空。參賽者與歷史本身不合 `PlayerWriteSchema`／`MatchHistoryEntrySchema` 時同樣回 400。
- 不合法時 SHALL NOT 寫入任何列。

**大小與筆數上限**（依「批次寫入端點的筆數與 body 上限」）：

- body 上限 MUST 沿用 `IMPORT_BODY_LIMIT_BYTES`（10,000,000 位元組），以共用 body 上限 middleware 掛在 validator 之前；超過時回 `413 { "error": "PAYLOAD_TOO_LARGE" }`，不執行 validator 與 handler。
- 通過 schema 後以核心 `checkAppendLimits(request)` 判定：參賽者（去重前的請求筆數）超過 `MAX_PLAYERS_PER_IMPORT`（500）位，或 `serializeAppendSegments(request)` 產生的三段 JSON 參數（參賽者、參賽者對照、歷史）任一段的 UTF-8 位元組數超過 `IMPORT_SEGMENT_LIMIT_BYTES`（1,900,000）時，
  MUST 回 `413 { "error": "PAYLOAD_TOO_LARGE" }`，且 MUST 在呼叫 `db.batch()` **之前**拒絕。恰等於上限時 MUST 照常附加。各段分別計算，SHALL NOT 以加總判定。
- 送進 `json_each` 的三個參數 MUST 就是 `checkAppendLimits` 通過時回傳的 `segments`，repository SHALL NOT 另組 JSON。

**共用的參數形狀**（`serializeAppendSegments`，純函式）：

- 參賽者段為 `[{ id, data }]` 的 `JSON.stringify` 結果，只含請求中**每個名稱的第一位**（名稱以 `data.name` 完全相同判定；`PlayerSchema` 已 trim 名稱，大小寫、全半形與中間空白視為不同），順序為請求順序。
  同一份請求內的同名去重在這裡完成，因為同一條 `INSERT … SELECT` 看不到自己剛插入的列，SQL 無法替同批資料去重。
- 參賽者對照段為請求中**全部**參賽者（不去重）的 `[{ id, name }]`（`name` 為 `data.name`），順序為請求順序；只用於下方歷史球員 id 的改寫，不寫入任何表。
- 歷史段 MUST 與 `serializeImportSegments` 對同一個歷史陣列產生的歷史段逐字相同（`[{ matchId, playedAt: Date.parse(playedAt), data }]`）。

**寫入規則**（使用者定案）：

- **參賽者**：同名視為同一人。名稱與雲端名單任一位（本人的 `matchmaker_players`）完全相同者 MUST 略過；`id` 已存在於本人雲端名單者（同一筆資料，即使名稱不同）MUST 略過；兩者皆不覆寫雲端那一列。
  其餘依參賽者段的順序新增：每位新增者的 `sort_order` MUST 大於附加前本人雲端名單的最大 `sort_order`，且依參賽者段順序遞增（`GET /api/matchmaker/players` 因此依原名單、再依備份順序列出）；
  `data` 原樣寫入（強度分數取自備份，雲端同名者的分數不變）。
  本規則與 `data-transfer`「參賽者 CSV 匯入的預覽、附加寫入與整份原子性」的「同名視為不同人」刻意不同：CSV 匯入的是新名單，本端點附加的是同一群人在另一台裝置上的資料。
- **歷史**：`(user_id, match_id)` 已存在者 MUST 略過且不覆寫；其餘依陣列順序插入（`ORDER BY key`，同 `played_at` 時讀回順序即備份順序），`played_at` 為 `Date.parse(playedAt)`。
- **歷史中的球員 id 改寫**（使用者定案，讓附加的比賽算到雲端同名球員身上——`player-stats` 以球員 id 為統計鍵）：附加寫入的每筆歷史，其 `teamA.players[].id` 與 `teamB.players[].id`（歷史中唯一引用球員 id 的欄位；`doublesComposition` 不含 id）MUST 依下列規則逐一決定，
  判定所用的雲端名單 MUST 是同一個 batch 中**參賽者寫入之後**的本人 `matchmaker_players`：
  ① 該 id 已是本人雲端名單的 id（雲端原有或本次新增）→ 不變；
  ② 否則若該 id 屬於請求中的某位參賽者（參賽者對照段）→ 改寫為本人雲端名單中與該參賽者**同名**、`sort_order` 最小（同值依 `rowid`）者的 id——即因雲端同名而略過者對應到雲端那位，備份內同名的第二位以後對應到同名的第一位（雲端已有則為雲端那位，否則為本次新增的那位）；
  ③ 否則（歷史中出現、但不在備份名單的球員；或屬於備份名單但雲端名單找不到同名者，例如該名稱的第一位因 id 已存在而略過）→ 不變。
  每個球員的 `name`、`ratingBefore`、`ratingAfter` 與陣列順序 MUST 不變，歷史的其他欄位 MUST 原樣寫入；略過（`matchId` 已存在）的歷史不寫入，自然也不改寫。
  改寫 MUST 在歷史那條 `INSERT … SELECT` 內以 SQL 完成，SHALL NOT 依賴 batch 外先讀到的雲端名單——略過判定與 id 對應看到的必須是同一份名單。
- **不碰的表**：SHALL NOT 寫入、刪除或改動 `matchmaker_round`、`matchmaker_match_slots`、`scoreboard_current`、`sync_version_floors`、`sync_batch_guards`。
- **版本**：新增參賽者的 `version` MUST 依「刪除後重建的使用者資料版本不得重複」為本人的版本下限加一（`initialVersion`，以子查詢寫在同一條陳述式內）；附加的歷史 `version` 為 1。雲端既有列的 `version` 不變，
  因此其他裝置對既有參賽者的樂觀並行不受影響；其他已開啟的裝置或分頁要到重新載入（或因其他寫入衝突而重新讀取）時才看到附加的資料——雲端 store 只在掛載與衝突時讀取，沒有輪詢，本端點不為此另加通知。

**原子性、冪等與陳述式數量**：

- 全部寫入 MUST 在**單一** D1 `batch()` 內完成，固定兩條 `INSERT … SELECT … FROM json_each(?)`（參賽者；含 id 改寫的歷史），SHALL NOT 逐筆展開；任一條失敗時整批回滾（D1 平台行為）。
- 本端點沒有「全部寫入或全部不寫」的前提：逐列略過即為預期語意，因此 SHALL NOT 使用整批守衛；略過條件 MUST 寫在同一條 SQL 內、對資料庫目前內容判定，SHALL NOT 依賴 batch 外先讀到的值。
- 同一份備份附加兩次時，第二次 MUST 全部略過（新增 0 位、0 筆），SHALL NOT 產生重複的參賽者或歷史。
- batch 拋出的錯誤 MUST 照常回 500，SHALL NOT 被分類為 409；本端點沒有 409 回應。

**回應**：成功回 `200 { appended: { players: { added, skipped }, history: { added, skipped } } }`（以 `AppendImportResponseSchema` 定義，四者皆為非負整數）。
`added` 為實際寫入的列數（取自同一個 batch 的 `RETURNING` 結果），`skipped` 為請求筆數減 `added`——參賽者的 `skipped` 含請求內同名的第二位以後、雲端已有同名者與 id 已存在者。

**預期帳號守衛**：`hono-pickball/test/expected-user-guard.test.ts` 的樣本表 MUST 補 `POST /api/import/append` 一條（合法的附加 body），列舉出的使用者資料路由由 15 條變為 16 條。

#### Scenario: 附加 API：auth 停用時附加端點回 404

- **WHEN** 以 auth 停用且無 DB binding 的 env 呼叫 `POST /api/import/append`
- **THEN** 回 404
- **驗收**：`hono-pickball/test/local-import-append.test.ts`，it 名稱「auth 停用且無 DB binding 時附加端點回 404」

#### Scenario: 附加 API：未登入時附加端點回 401

- **WHEN** 未帶 session 呼叫 `POST /api/import/append`
- **THEN** 回 `401 { "error": "UNAUTHORIZED" }`
- **驗收**：`hono-pickball/test/local-import-append.test.ts`，it 名稱「未登入呼叫附加端點回 401」

#### Scenario: 附加 API：略過同名或已存在的參賽者與重複歷史，其餘依備份順序接在後面

- **GIVEN** 本人雲端名單依序為 `c1`「甲」（rating 3）、`c2`「乙」，雲端歷史有 `h1`
- **WHEN** 附加參賽者 `b1`「甲」（rating 5）、`b2`「丙」、`c2`「改名乙」、`b3`「丁」，歷史 `h1`（內容與雲端不同）、`h2`、`h3`（`h2`、`h3` 的 `playedAt` 相同且晚於 `h1`）
- **THEN** 回 200，`appended` 為 `{ players: { added: 2, skipped: 2 }, history: { added: 2, skipped: 1 } }`；
  `GET /api/matchmaker/players` 依序為 `c1`「甲」（rating 仍為 3）、`c2`「乙」、`b2`「丙」、`b3`「丁」，`b2`、`b3` 的 `sort_order` 皆大於附加前的最大值；
  `GET /api/matchmaker/history?order=asc` 依序為 `h1`（仍為雲端原內容）、`h2`、`h3`
- **驗收**：`hono-pickball/test/local-import-append.test.ts`，it 名稱「雲端已有資料時附加略過同名或已存在 id 的參賽者與重複歷史，其餘依備份順序接在後面」

#### Scenario: 附加 API：附加不改動回合、分槽、獨立計分板、版本下限與守衛表

- **GIVEN** 本人雲端有回合、`m1` 的分槽、獨立計分板與版本下限列
- **WHEN** 附加一位新參賽者與一筆新歷史
- **THEN** 回 200；`matchmaker_round`、`matchmaker_match_slots`、`scoreboard_current`、`sync_version_floors` 的本人列與附加前逐列相同；`sync_batch_guards` 沒有本人的列
- **驗收**：`hono-pickball/test/local-import-append.test.ts`，it 名稱「附加不改動回合、分槽、獨立計分板、版本下限與整批守衛表」

#### Scenario: 附加 API：同一份備份附加兩次

- **GIVEN** 雲端已有一位參賽者
- **WHEN** 以同一份含 2 位新參賽者與 2 筆新歷史的請求連續附加兩次
- **THEN** 第一次 `added` 為 2 與 2；第二次為 `{ players: { added: 0, skipped: 2 }, history: { added: 0, skipped: 2 } }`；`matchmaker_players` 為 3 列、`matchmaker_history` 為 2 列
- **驗收**：`hono-pickball/test/local-import-append.test.ts`，it 名稱「同一份備份附加兩次時第二次全部略過且不產生重複」

#### Scenario: 附加 API：備份內同名的參賽者只新增第一位

- **GIVEN** 雲端名單只有「甲」
- **WHEN** 附加 `x1`「戊」、`x2`「戊」、`x3`「己」
- **THEN** `appended.players` 為 `{ added: 2, skipped: 1 }`；新增的「戊」為 `x1`，`x2` 不存在
- **驗收**：`hono-pickball/test/local-import-append.test.ts`，it 名稱「備份內同名的參賽者只新增第一位」

#### Scenario: 附加 API：附加的歷史中因同名而略過的參賽者 id 改寫為雲端那位的 id

- **GIVEN** 本人雲端名單依序為 `c1`「甲」、`c5`「甲」（同名的第二位）
- **WHEN** 附加參賽者 `b1`「甲」、`b2`「丙」、`b9`「丙」；歷史 `r1`（單打：teamA `[b1]`、teamB `[b2]`）與 `r2`（雙打：teamA `[b1, b9]`、teamB `[z1, b2]`，`z1` 不在備份名單）
- **THEN** `appended.players` 為 `{ added: 1, skipped: 2 }`（新增 `b2`）；讀回的 `r1` teamA 為 `[c1]`、teamB 為 `[b2]`；`r2` teamA 為 `[c1, b2]`、teamB 為 `[z1, b2]`；
  每位球員的 `name`、`ratingBefore`、`ratingAfter` 與陣列順序不變，兩筆歷史除上述 id 外與請求深度相等（含 `doublesComposition`）
- **AND** 讀回的兩筆歷史中不再出現 `b1`、`b9`（`player-stats` 以球員 id 為統計鍵，故 `c1` 的出場會包含這兩場；統計頁的端到端證據見 `data-transfer`「登入資料工具：雲端已有資料時以 JSON 備份附加參賽者與歷史」）
- **驗收**：`hono-pickball/test/local-import-append.test.ts`，it 名稱「附加的歷史中因同名而略過的參賽者 id 改寫為雲端同名者的 id，其餘欄位不變」

#### Scenario: 附加 API：附加的參賽者與歷史版本

- **GIVEN** 本人的參賽者 `p1` 更新到 version 3 後呼叫重置（版本下限為 3），再以 `version: 0` PUT 一位參賽者 `p2`「甲」（version 4）
- **WHEN** 附加參賽者 `p1`「乙」與一筆歷史
- **THEN** 附加的 `p1` version 為 4（下限加一，大於重置前的 3），「甲」仍為 version 4；附加的歷史 version 為 1；以 `version: 3` PUT `p1` 回 409
- **驗收**：`hono-pickball/test/local-import-append.test.ts`，it 名稱「附加的參賽者版本為版本下限加一，附加的歷史版本為 1」

#### Scenario: 附加 API：附加只寫入本人且不受他人資料影響

- **GIVEN** 使用者 A 有參賽者「甲」（id `s1`）與歷史 `h1`；B 的雲端只有一位「乙」
- **WHEN** B 附加參賽者 `s1`「甲」與歷史 `h1`
- **THEN** B 回 200 且 `added` 為 1 與 1；A 的各表逐列不變
- **驗收**：`hono-pickball/test/local-import-append.test.ts`，it 名稱「B 的附加不受 A 的資料影響且不改動 A」

#### Scenario: 附加 API：不合法的附加請求

- **WHEN** 分別送出：參賽者 id 為空字串、參賽者 id 重複、歷史 `matchId` 重複、兩段皆空、一位 `rating` 為 99 的參賽者
- **THEN** 五者皆回 `400 { "error": "INVALID_BODY" }`；該使用者在 `USER_DATA_TABLES` 每張表的列與送出前相同
- **驗收**：`hono-pickball/test/local-import-append.test.ts`，it 名稱「空字串或重複的參賽者 id、重複的歷史 matchId 或兩段皆空的附加請求回 400 且不寫入」

#### Scenario: 附加 API：超過筆數或單段上限時回 413 且不送出 batch

- **GIVEN** 一個 `batch` 被呼叫即計數並拋錯的 D1 替身（`prepare` 委派給真實 D1）；另以真實 D1 準備恰為上限的請求
- **WHEN** 分別送出：501 位參賽者；歷史段經 `serializeAppendSegments` 後多 1 位元組；歷史段恰為 1,900,000 位元組（真實 D1）
- **THEN** 前兩者回 `413 { "error": "PAYLOAD_TOO_LARGE" }` 且替身的 `batch` 被呼叫 0 次；恰為上限者回 200 且歷史已寫入
- **驗收**：`hono-pickball/test/local-import-append.test.ts`，it 名稱「附加的參賽者超過 500 位或單段參數超過上限時回 413 PAYLOAD_TOO_LARGE 且不呼叫 D1 batch」

#### Scenario: 附加 API：請求 body 超過上限時回 413 且不寫入

- **WHEN** 送出一份 schema 合法、但另含約 10MB 未知欄位而使 body 超過 10,000,000 位元組的附加請求
- **THEN** 回 `413 { "error": "PAYLOAD_TOO_LARGE" }`；該使用者在 `USER_DATA_TABLES` 每張表的列與送出前相同
- **驗收**：`hono-pickball/test/local-import-append.test.ts`，it 名稱「請求 body 超過附加上限時回 413 PAYLOAD_TOO_LARGE 且雲端不寫入」

#### Scenario: 附加 API：預期帳號與 session 不符時回 401 且雲端不寫入

- **GIVEN** 使用者 A、B 皆已登入，B 的雲端有一位參賽者
- **WHEN** 以 B 的 cookie 分別帶 `X-Expected-User-Id: <A 的 id>`、不帶該標頭、帶空字串，送出一份合法的附加請求
- **THEN** 三者皆回 `401 { "error": "ACCOUNT_MISMATCH" }`；A 與 B 在 `USER_DATA_TABLES` 每張表的列與送出前相同
- **驗收**：`hono-pickball/test/local-import-append.test.ts`，it 名稱「預期帳號缺少或與 session 不符時附加回 401 ACCOUNT_MISMATCH 且雲端不寫入」

#### Scenario: 附加 API：大量資料以單一 batch 的固定兩條陳述式附加

- **GIVEN** 一個記錄 `batch()` 呼叫並委派給真實 D1 的替身；雲端已有一位參賽者
- **WHEN** 附加 300 位參賽者與 2,000 筆歷史
- **THEN** 回 200 且 `added` 為 300 與 2,000；`batch()` 只被呼叫一次且含 2 條陳述式；兩表的列與 `match_id` 依陣列順序
- **驗收**：`hono-pickball/test/local-import-append.test.ts`，it 名稱「附加以單一 D1 batch 的固定兩條陳述式寫入 300 位參賽者與 2000 筆歷史」

#### Scenario: 附加 API：batch 錯誤回 500 而非 409

- **GIVEN** 一個 `batch` 一律拋出一般錯誤的 D1 替身
- **WHEN** 送出一份合法且未超過上限的附加請求
- **THEN** 回 500
- **驗收**：`hono-pickball/test/local-import-append.test.ts`，it 名稱「batch 拋出錯誤時附加回 500」

#### Scenario: 附加 API：守衛樣本表含附加端點

- **WHEN** 執行預期帳號守衛的列舉測試
- **THEN** `app.routes` 列舉出的使用者資料路由含 `POST /api/import/append`，與樣本表一致（共 16 條）；該樣本在帳號不符、缺少或空白標頭時回 `401 ACCOUNT_MISMATCH` 且資料不變
- **驗收**：`hono-pickball/test/expected-user-guard.test.ts`（樣本表補 `POST /api/import/append`，長度斷言改為 16），it 名稱「每條使用者資料路由在預期帳號與 session 不符時皆回 401 ACCOUNT_MISMATCH 且資料不變」「缺少或空白的預期帳號標頭使使用者資料路由回 401 ACCOUNT_MISMATCH 且資料不變」「列舉出的使用者資料路由恰與守衛樣本表一致」

#### Scenario: 附加 API：共用的附加請求與回應 schema

- **WHEN** 以 `AppendImportRequestSchema` 解析：參賽者 id 為空字串、參賽者 id 重複、歷史 `matchId` 重複、兩段皆空、只有歷史、只有參賽者、帶 `currentRound` 的合法請求；以 `AppendImportResponseSchema` 解析缺欄位、負數、小數與合法回應
- **THEN** 前四者失敗；只有歷史、只有參賽者通過；帶 `currentRound` 者通過且解析結果不含 `currentRound`；回應只有合法者通過
- **驗收**：`packages/pickball-core/test/api/import.test.ts`，it 名稱「AppendImportRequestSchema 拒絕空字串或重複的參賽者 id、重複的歷史 matchId 與兩段皆空」「AppendImportResponseSchema 只接受新增與略過筆數的固定形狀」

#### Scenario: 附加 API：共用的附加參數形狀

- **WHEN** 以參賽者依序為 `x1`「戊」、`x2`「己」、`x3`「戊」與兩筆歷史的請求呼叫 `serializeAppendSegments`
- **THEN** 參賽者段等於 `JSON.stringify([{ id: "x1", data: <x1> }, { id: "x2", data: <x2> }])`；參賽者對照段等於 `JSON.stringify([{ id: "x1", name: "戊" }, { id: "x2", name: "己" }, { id: "x3", name: "戊" }])`；歷史段等於以同一歷史陣列呼叫 `serializeImportSegments` 所得的歷史段
- **驗收**：`packages/pickball-core/test/api/import-limits.test.ts`，it 名稱「serializeAppendSegments 同名只保留第一位參賽者，對照段含全部參賽者，歷史段與整份匯入的歷史段相同」

#### Scenario: 附加 API：共用的附加上限判定

- **WHEN** 以 `checkAppendLimits` 判定：參賽者段、參賽者對照段、歷史段各自恰為 1,900,000 位元組與各自多 1 位元組；參賽者恰 500 位與 501 位（其中有同名，去重後少於 500 位）；參賽者段與歷史段各約 1,200,000 位元組（加總超過上限）
- **THEN** 恰為上限、500 位與各段各自未超過者 `ok` 為 true 且 `segments` 等於 `serializeAppendSegments` 的輸出；任一段多 1 位元組或 501 位者 `ok` 為 false
- **驗收**：`packages/pickball-core/test/api/import-limits.test.ts`，it 名稱「checkAppendLimits 三段各自恰為上限時通過，多一位元組或超過 500 位參賽者即不通過」

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
雲端已有資料時把備份的參賽者與歷史附加到雲端，由「本機備份附加到雲端的 API」（`POST /api/import/append`）另行提供；本端點的拒絕規則 SHALL NOT 因此改變。

**原子性與冪等**：全部寫入 MUST 在**單一** D1 `batch()` 內完成，第一條為整批守衛（條件：上述四張表皆無該使用者的列），依「後端多表寫入以單一 batch 與整批守衛完成」。
守衛條件 SHALL NOT 包含 `sync_version_floors`：重置後該使用者的下限列仍存在，納入會使重置後永遠無法匯入。
同一份資料重複匯入時，第二次必因第一次已寫入名單、回合或歷史而被守衛拒絕；歷史的 `(user_id, match_id)` 主鍵是第二道防線。因此重複匯入 SHALL NOT 產生重複歷史。

**陳述式數量為常數**：參賽者、分槽、歷史各以**一條** `INSERT … SELECT … FROM json_each(?)` 寫入（整段陣列為單一參數），SHALL NOT 逐筆展開成多條陳述式或多個參數——
D1 每條陳述式最多 100 個參數、單一字串最多 2,000,000 位元組（見 design「查證紀錄」）。插入順序 MUST 依陣列順序（`ORDER BY key`）：
參賽者的 `sort_order` 為陣列索引；歷史的 `played_at` 為 `Date.parse(playedAt)`、插入順序即本機的追加順序（B8 的同時間排序依 `rowid`）。參賽者、回合、分槽列的 `version` 為該使用者的版本下限加一（以子查詢在同一條 `INSERT … SELECT` 內讀取，不增加陳述式數量；從未刪除過對戰分配機資料時為 1），
歷史與獨立計分板列的 `version` 為 1——見「刪除後重建的使用者資料版本不得重複」。

成功回 `200 { imported: { players, round: boolean, slots, history, scoreboardCurrent: "imported" | "skipped" | "none" } }`。

**預期帳號守衛**：本端點是使用者資料路由，`hono-pickball/test/expected-user-guard.test.ts` 的樣本表 MUST 補 `POST /api/import` 一條（合法的匯入 body），列舉出的使用者資料路由由 14 條變為 15 條（之後「本機備份附加到雲端的 API」再補 `POST /api/import/append`，目前共 16 條）。
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
- **AND** 另一次匯入的歷史段 JSON 參數約 2.4MB（超過 D1 單一字串上限 2,000,000 位元組）時回 `413 { "error": "PAYLOAD_TOO_LARGE" }`，且該使用者在各使用者資料表與 `sync_batch_guards` 皆無任何列
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
- **THEN** `app.routes` 列舉出的使用者資料路由含 `POST /api/import`，與樣本表一致（共 16 條，含「本機備份附加到雲端的 API」的 `POST /api/import/append`）；該樣本在帳號不符、缺少或空白標頭時回 `401 ACCOUNT_MISMATCH` 且資料不變
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

### Requirement: 批次寫入端點的筆數與 body 上限

「批次寫入端點」指以客戶端送來的陣列一次寫入多列的使用者資料端點，目前恰為 `POST /api/matchmaker/players/import`、`POST /api/import` 與 `POST /api/import/append`；
其餘寫入端點（各 `PUT`、`DELETE`、`POST /api/matchmaker/reset`、送出比分）每次只寫入單筆或由伺服器產生固定筆數，不屬此類。之後新增批次寫入端點時 MUST 同樣遵守本 Requirement。

每個批次寫入端點 SHALL 同時具備：

- **body 上限**：以 `hono-pickball/src/http/body-limit.ts` 的共用 middleware（包裝 `hono/body-limit` 的 `bodyLimit`）掛在該路由的 validator **之前**；超過時 MUST 回 `413 { "error": "PAYLOAD_TOO_LARGE" }`，SHALL NOT 執行 validator 與 handler。
  middleware 位於 sub-app 的 `localAuth`、`requireSession`、`requireExpectedUser` 之後：未登入、停用與帳號不符的回應仍優先。
- **筆數上限**：參賽者一次最多 `MAX_PLAYERS_PER_IMPORT`（500）位；超過時 MUST 回 `413 { "error": "PAYLOAD_TOO_LARGE" }`。歷史與分槽不另設筆數上限，由單段位元組上限約束（見「本機資料匯入雲端的 API」與「本機備份附加到雲端的 API」；兩者的 body 上限皆為 `IMPORT_BODY_LIMIT_BYTES`，單段判定分別為 `checkImportLimits` 與 `checkAppendLimits`）。
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

### Requirement: 刪除後重建的使用者資料版本不得重複

樂觀鎖只比對「呼叫端持有的 `version` 是否等於目前 `version`」。`matchmaker_players`、`matchmaker_round`、`matchmaker_match_slots`（以下稱**可重建的版本化表**）的列被刪除後，
可能以**同一個主鍵**重新建立（重置後再建立回合；重置或刪除後以原 id 匯入參賽者與分槽）；若重建的列 `version` 從 1 起算，仍持有舊列版本的裝置會比對成功而靜默覆蓋新資料（ABA）。
因此後端 SHALL 維持下列不變式：**同一主鍵的列在任何時點的 `version`，都大於該主鍵先前任何一代列曾出現過的 `version`**。

- **版本下限**：後端 SHALL 為每位使用者保存一個版本下限（表 `sync_version_floors`，每位使用者至多一列，`version` 欄即下限；沒有列視為 0）。下限只升不降。
- **刪除時提高下限**：任何刪除可重建的版本化表之列的寫入，MUST 在**同一個** D1 `batch()` 內、於刪除陳述式**之前**，把下限設為 `max(目前下限, 將被刪除之列的最大 version)`；
  將被刪除的列 MUST 以與刪除陳述式相同的條件在 SQL 內選出，SHALL NOT 依賴 batch 外先讀到的值。沒有任何列將被刪除時，SHALL NOT 寫入或改動下限列，且該陳述式 SHALL NOT 失敗（不得因 `max()` 得到 NULL 而違反 NOT NULL 使整批回滾）。
  適用的刪除路徑為：`DELETE /api/matchmaker/players/:id`、`POST /api/matchmaker/reset`、`PUT /api/matchmaker/round` 的孤兒分槽清除、`POST /api/matchmaker/round/matches/:matchId/score` 的該場分槽刪除；
  之後新增任何會刪除這三張表之列的寫入 MUST 同樣處理。
- **建立時取下限加一**：在可重建的版本化表建立列時（`PUT` 以 `version: 0` 建立參賽者、回合或分槽；`POST /api/matchmaker/players/import`；`POST /api/import` 的參賽者、回合、分槽三段；`POST /api/import/append` 新增的參賽者），
  初始 `version` MUST 為「下限 + 1」，且下限 MUST 在建立的**同一條**陳述式內以 SQL 子查詢讀取，SHALL NOT 先在 JS 端讀取再寫入。從未刪除過這三張表之列的使用者下限為 0，初始 `version` 仍為 1。
  回應中的 `version` MUST 為實際寫入的值。
- **更新不變**：既有列的更新仍為 `version + 1`（「版本化讀寫契約」）；更新不讀也不改下限。
- **不適用的表**：`scoreboard_current` 沒有任何刪除路徑（重置不含此表、匯入為 `ON CONFLICT DO NOTHING`），`version` 只增不減；`matchmaker_history` 沒有任何接受呼叫端 `version` 的寫入端點（只增不改，`version` 恆為 1）；
  `sync_batch_guards` 在每個 batch 結束時即被刪除且 `version` 不對外。三者的寫入 SHALL NOT 讀取或提高下限，建立時 `version` 維持 1。
- **重置與匯入**：`POST /api/matchmaker/reset` SHALL NOT 刪除下限列；`POST /api/import` 的整批守衛條件 SHALL NOT 包含 `sync_version_floors`。`POST /api/import/append` 只在建立參賽者時以子查詢讀取下限，SHALL NOT 寫入或改動下限列；它附加的歷史 `version` 為 1（`matchmaker_history` 不適用下限）。
- 下限只屬於本人：所有讀寫 MUST 帶 `user_id = c.var.user.id`，一位使用者的刪除 SHALL NOT 影響其他使用者的建立版本。

#### Scenario: 版本下限：重置後重建的回合不被持舊版本的裝置覆寫

- **GIVEN** 回合以 `version: 0` 建立後再更新一次（目前 version 2），另一台裝置持有 version 1 與 version 2 的回合
- **WHEN** 呼叫 `POST /api/matchmaker/reset`，再以 `version: 0` PUT 新回合 R2，接著分別以 `version: 1`、`version: 2` PUT 舊回合 R1′；
  之後再呼叫重置，並以 `POST /api/import` 匯入一位參賽者、一筆歷史與獨立計分板（不含回合與分槽）
- **THEN** 重建的回合 version 為 3；兩次舊版本 PUT 皆回 `409 { "error": "VERSION_CONFLICT" }`；`GET /api/matchmaker/round` 為 R2 且 version 3；
  匯入回 200，匯入的參賽者 version 為 4（下限取自第二次重置前的回合 version 3），歷史與獨立計分板的 version 皆為 1（不適用下限）
- **驗收**：`hono-pickball/test/version-floor.test.ts`，it 名稱「重置後重建的回合版本大於重置前且持舊版本的 PUT 回 409，再重置後匯入的歷史與獨立計分板版本仍為 1」

#### Scenario: 版本下限：重置後以 version 0 重建同 id 的參賽者

- **GIVEN** 參賽者 p1 為 version 3、p2 為 version 1
- **WHEN** 呼叫重置，以 `version: 0` PUT p1，再以 `version: 3` PUT p1
- **THEN** 重建的 p1 version 為 4；`version: 3` 的 PUT 回 409；`GET /api/matchmaker/players` 的 p1 為重建值與 version 4
- **驗收**：`hono-pickball/test/version-floor.test.ts`，it 名稱「重置後以 version 0 重建同 id 的參賽者版本大於重置前且持舊版本的 PUT 回 409」

#### Scenario: 版本下限：重置後批次附加同 id 的參賽者

- **GIVEN** 參賽者 p1 為 version 2
- **WHEN** 呼叫重置，以 `POST /api/matchmaker/players/import` 附加 p1、p2，再分別以 `version: 1`、`version: 2` PUT p1
- **THEN** 匯入回應的兩筆 `version` 皆為 3，且等於 `GET /api/matchmaker/players` 讀回的 version；兩次舊版本 PUT 皆回 409
- **驗收**：`hono-pickball/test/version-floor.test.ts`，it 名稱「重置後批次附加同 id 的參賽者回應實際版本且持舊版本的 PUT 回 409」

#### Scenario: 版本下限：重置後重建同場次的分槽

- **GIVEN** 回合（version 1）含 `pending` 的 `m1`，`m1` 的分槽為 version 2
- **WHEN** 呼叫重置，以 `version: 0` PUT 含 `pending` 的 `m1` 的回合，再以 `version: 0` PUT `m1` 的分槽，接著分別以 `version: 1`、`version: 2` PUT `m1` 的分槽
- **THEN** 重建的回合與分槽 version 皆為 3；兩次舊版本 PUT 皆回 409；`GET /api/matchmaker/slots/m1` 為重建值
- **驗收**：`hono-pickball/test/version-floor.test.ts`，it 名稱「重置後重建同場次的分槽版本大於重置前且持舊版本的 PUT 回 409」

#### Scenario: 版本下限：重置後重新匯入同一份本機資料時持舊版本的寫入皆被拒

- **GIVEN** 雲端為空時以 `POST /api/import` 匯入資料 P（參賽者——含 `m1` 兩隊的選手、含 `pending` 場次 `m1` 的回合、`m1` 的分槽、歷史 `h1`、獨立計分板），另一台裝置讀到的參賽者、回合、分槽皆為 version 1
- **WHEN** 呼叫重置後再匯入同一份 P，接著依該裝置持有的舊版本：以 `version: 1` PUT 其中一位參賽者、以 `version: 1` PUT 回合、以 `version: 1` PUT `m1` 的分槽、以 `roundVersion: 1` 對 `m1` 送出比分
- **THEN** 第二次匯入回 200 且 `scoreboardCurrent` 為 `"skipped"`；重新匯入的參賽者、回合、分槽 version 皆為 2，歷史 `h1` 的 version 為 1，獨立計分板仍為原值與 version 1；
  四個舊版本寫入皆回 409，名單、回合、分槽與歷史皆與第二次匯入後相同
- **驗收**：`hono-pickball/test/version-floor.test.ts`，it 名稱「重置後重新匯入同一份本機資料時持舊版本的寫入皆回 409」

#### Scenario: 版本下限：刪除參賽者後以同 id 重建

- **GIVEN** 參賽者 p1 為 version 3、p2 為 version 1
- **WHEN** 依序 `DELETE` p1、`DELETE` p2，再以 `version: 0` PUT p1，接著以 `version: 3` PUT p1
- **THEN** 兩次 DELETE 皆回 204；重建的 p1 version 為 4（下限取較大者，不被後一次較小的值降低）；`version: 3` 的 PUT 回 409
- **驗收**：`hono-pickball/test/version-floor.test.ts`，it 名稱「刪除參賽者後以同 id 重建時版本大於刪除前」

#### Scenario: 版本下限：刪除參賽者以單一 batch 提高下限並刪除

- **WHEN** 以記錄 `batch()` 呼叫的 D1 替身注入 env，`DELETE` 一位既有參賽者
- **THEN** 回 204；只送出一次 `batch()`，含兩條陳述式（提高下限、刪除）
- **驗收**：`hono-pickball/test/version-floor.test.ts`，it 名稱「刪除參賽者以單一 D1 batch 提高版本下限並刪除」

#### Scenario: 版本下限：回合 PUT 清除的分槽以同場次重建

- **GIVEN** 回合含 `pending` 的 `m1`、`m2`，`m1` 的分槽為 version 3
- **WHEN** PUT 只含 `m2`、`m3` 的回合（`m1` 的分槽被清除），再 PUT 把 `pending` 的 `m1` 加回的回合，接著以 `version: 0` PUT `m1` 的分槽，最後以 `version: 3` PUT `m1` 的分槽
- **THEN** 重建的分槽 version 為 4；`version: 3` 的 PUT 回 409
- **驗收**：`hono-pickball/test/version-floor.test.ts`，it 名稱「回合 PUT 清除的分槽以同場次重建時版本大於清除前」

#### Scenario: 版本下限：送出比分刪除的分槽在重置後重新匯入

- **GIVEN** 以 `POST /api/import` 匯入參賽者（含 `m1` 兩隊的選手）、含 `pending` 的 `m1` 的回合與 `m1` 的分槽後，把 `m1` 的分槽更新到 version 5，再對 `m1` 送出比分（分槽被刪除；回合與參與該場的參賽者變為 version 2）
- **WHEN** 呼叫重置後再匯入同一份資料
- **THEN** 重新匯入的 `m1` 分槽 version 為 6（大於送出比分前的 5，而非只取重置當下其餘列的最大值加一）
- **驗收**：`hono-pickball/test/version-floor.test.ts`，it 名稱「送出比分刪除的分槽在重置後重新匯入時版本大於刪除前」

#### Scenario: 版本下限：逐筆刪除路徑只依本人的資料提高下限

- **GIVEN** 使用者 B 的參賽者 p1 為 version 5，回合（version 6）含 `pending` 的 `m1`、`m2`，兩者的分槽皆為 version 9
- **WHEN** 使用者 A 依序：建立 p1（version 1）後 `DELETE` p1；以 `version: 0` PUT 含 `m1`、`m2` 的回合並建立 `m1` 的分槽，再 PUT 只含 `m2` 的回合（`m1` 的分槽被清除）；建立 `m2` 兩隊的選手與 `m2` 的分槽後對 `m2` 送出比分
- **THEN** 三步之後 A 的下限依序為 1、2、3（只取自 A 被刪除的列）；B 的參賽者與分槽 version 不變，`sync_version_floors` 沒有 B 的列
- **驗收**：`hono-pickball/test/version-floor.test.ts`，it 名稱「其他使用者有較高版本的同 id 資料時逐筆刪除路徑只依本人的資料提高下限」

#### Scenario: 版本下限：沒有任何資料時重置不失敗

- **GIVEN** 使用者從未寫入任何對戰分配機資料
- **WHEN** 呼叫重置，再以 `version: 0` PUT 回合與一位參賽者
- **THEN** 重置回 204；回合與參賽者的 version 皆為 1；`sync_version_floors` 沒有該使用者的列
- **驗收**：`hono-pickball/test/version-floor.test.ts`，it 名稱「沒有任何資料時重置仍回 204 且之後建立的版本為 1」

#### Scenario: 版本下限：一位使用者的下限不影響他人

- **GIVEN** 使用者 A 的回合為 version 3 並已重置
- **WHEN** 從未刪除過資料的使用者 B 以 `version: 0` PUT 回合與一位參賽者
- **THEN** B 的回合與參賽者 version 皆為 1；`sync_version_floors` 沒有 B 的列
- **驗收**：`hono-pickball/test/version-floor.test.ts`，it 名稱「一位使用者的重置不影響其他使用者的建立版本」

#### Scenario: 版本下限：重置只依本人的資料提高下限

- **GIVEN** 使用者 B 的參賽者 p1 為 version 5、回合為 version 6、`m1` 的分槽為 version 7；使用者 A 的參賽者 p1 為 version 2、回合與 `m1` 的分槽為 version 1
- **WHEN** A 呼叫重置，再以 `version: 0` PUT 回合、參賽者 p1 與 `m1` 的分槽
- **THEN** 重置回 204；A 的下限為 2；A 重建的回合、參賽者與分槽 version 皆為 3；B 的參賽者、回合、分槽 version 仍為 5、6、7，且 `sync_version_floors` 沒有 B 的列
- **驗收**：`hono-pickball/test/version-floor.test.ts`，it 名稱「其他使用者有較高版本的資料時重置只依本人的資料提高下限」

#### Scenario: 版本下限：重置在同一個 batch 內提高下限並刪除四張表

- **WHEN** 以記錄 `batch()` 呼叫的 D1 替身注入 env，呼叫 `POST /api/matchmaker/reset`
- **THEN** 回 204；只送出一次 `batch()`，含五條陳述式（提高下限與四條刪除）
- **驗收**：`hono-pickball/test/matchmaker-players.test.ts`，it 名稱「重置以單一 D1 batch 送出四條刪除」（既有 it，斷言由 `[4]` 改為 `[5]`）
