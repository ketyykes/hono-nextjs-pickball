## ADDED Requirements

### Requirement: 本機資料匯入雲端的 API

後端 SHALL 提供 `POST /api/import`（sub-app `src/routes/import.ts`，型別 `SessionAppEnv`，開頭 MUST 為 `use("*", localAuth, requireSession, requireExpectedUser)`、錯誤處理沿用 `userDataOnError`；以 `app.route("/api/import", …)` 掛載；授權、停用閘門、預期帳號守衛與錯誤碼依「使用者資料 API 的路由、授權與停用閘門」與「使用者資料請求的預期帳號守衛」；SQL MUST 帶 `user_id = c.var.user.id`），
把一份本機資料一次寫入雲端。請求以核心 `@pickball/core/api/import` 的 `LocalImportRequestSchema` 驗證：

```
LocalImportRequestSchema = BackupSchema.extend({
  scoreboard: { current: ScoreboardState（matchId 為 null）| null, matches: ScoreboardState[]（matchId 皆非 null） }
})
```

`matches` 每一筆即一個場次分槽，分槽鍵為該筆的 `matchId`（與 B7 `matchmaker_match_slots` 的 `match_id` 等於 `data.matchId` 的不變式一致）。

並 MUST 額外拒絕（`400 INVALID_BODY`）：參賽者 id 重複、歷史 `matchId` 重複、分槽 `matchId` 重複、分槽的 `matchId` 不屬於 `currentRound` 中未完成的場次（`currentRound` 為 `null` 時不得有分槽）、
五段皆為空（無參賽者、無回合、無歷史、無分槽、無獨立計分板）。

**拒絕規則（使用者定案）**：該使用者在 `matchmaker_players`、`matchmaker_round`、`matchmaker_match_slots`、`matchmaker_history` 任一表已有資料時，
MUST 回 `409 VERSION_CONFLICT` 且**整份不寫入**——SHALL NOT 覆寫、SHALL NOT 合併。獨立計分板（`scoreboard_current`）不在拒絕條件內：
雲端已有一筆時該段 MUST 略過（不覆寫），其餘照常匯入，並在回應中標示 `scoreboardCurrent: "skipped"`——
獨立計分板只是「一場進行中的比賽」，若也納入拒絕條件，使用過登入態計分板的使用者將永遠無法匯入名單。

**原子性與冪等**：全部寫入 MUST 在**單一** D1 `batch()` 內完成，第一條為整批守衛（條件：上述四張表皆無該使用者的列），依「後端多表寫入以單一 batch 與整批守衛完成」。
同一份資料重複匯入時，第二次必因第一次已寫入名單、回合或歷史而被守衛拒絕；歷史的 `(user_id, match_id)` 主鍵是第二道防線。因此重複匯入 SHALL NOT 產生重複歷史。

**陳述式數量為常數**：參賽者、分槽、歷史各以**一條** `INSERT … SELECT … FROM json_each(?)` 寫入（整段陣列為單一參數），SHALL NOT 逐筆展開成多條陳述式或多個參數——
D1 每條陳述式最多 100 個參數、每個參數最多 2MB（design Decision 2 的 Context7 查證）。插入順序 MUST 依陣列順序（`ORDER BY key`）：
參賽者的 `sort_order` 為陣列索引；歷史的 `played_at` 為 `Date.parse(playedAt)`、插入順序即本機的追加順序（B8 的同時間排序依 `rowid`）。所有匯入列的 `version` 為 1。

成功回 `200 { imported: { players, round: boolean, slots, history, scoreboardCurrent: "imported" | "skipped" | "none" } }`。

**預期帳號守衛**：本端點是使用者資料路由，`hono-pickball/test/expected-user-guard.test.ts` 的樣本表 MUST 補 `POST /api/import` 一條（合法的匯入 body），列舉出的使用者資料路由由 14 條變為 15 條。
匯入一旦寫錯帳號，整份訪客資料會進入另一位使用者的雲端且無法以 API 撤回，因此本端點另在自身測試檔驗證「缺少或不符時雲端不寫入」。

**歷史可被讀回**：匯入的歷史列 MUST 能被 `GET /api/matchmaker/history`（`hono-pickball/src/matchmaker/history-repository.ts`）依區間與兩種排序讀回：`played_at` 為 `Date.parse(playedAt)` 的毫秒值，同 `played_at` 時依插入順序（`rowid`）。

**陳述式上限**：整個 batch 為固定的 7 條陳述式（守衛、參賽者、回合、分槽、歷史、獨立計分板、釋放守衛），不隨資料筆數增加；任一段的 JSON 參數超過 D1 單一參數上限（2MB）時 D1 拋錯、整批回滾、回 500（前端以 1,900,000 位元組先行阻擋，見 `data-transfer`「登入後匯入本機資料到雲端」）。

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
- **THEN** 回 200；兩表筆數分別為 300 與 2,000
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
