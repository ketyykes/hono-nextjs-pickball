## MODIFIED Requirements

### Requirement: 回合與送出比分的雲端 API

後端 SHALL 於 `/api/matchmaker/*` sub-app（B6，`localAuth`＋`requireSession`）提供下列端點，授權、停用閘門與錯誤碼依 `user-data-sync`；所有 SQL MUST 帶 `user_id = c.var.user.id`：

| 端點 | 契約 |
|---|---|
| `GET /api/matchmaker/round` | 單筆契約：`{ data: Round \| null, version }` |
| `PUT /api/matchmaker/round` | 單筆契約，`data` 以核心 `RoundSchema` 驗證；另加下列「完成狀態不可經 PUT 改變」與「分槽清理」規則 |
| `GET /api/matchmaker/slots` | 多筆契約的列出：`{ items: [{ data: ScoreboardState, version }] }`，依 `match_id` 遞增排列 |
| `GET /api/matchmaker/slots/:matchId` | 單筆讀取：`{ data: ScoreboardState \| null, version }`（不存在時 `null`／`0`） |
| `PUT /api/matchmaker/slots/:matchId` | 多筆契約的建立或更新；`data.matchId` MUST 等於 `:matchId`；建立（version 0）的前置條件：該場次存在於目前回合且尚未 `completed`，否則 409 |
| `POST /api/matchmaker/round/matches/:matchId/score` | body `{ scoreA: string, scoreB: string, roundVersion: 正整數 }`；見下 |

分槽不提供批次附加與 DELETE（多筆契約的子集）：分槽的刪除一律由伺服器在回合 PUT、送出比分與重置的 batch 內完成。

**完成狀態不可經 PUT 改變**：`PUT /api/matchmaker/round` 的 `data` 中每一場 `status` 為 `completed` 的場次，MUST 在雲端目前回合中存在同 id、且內容完全相同的已完成場次；
否則回 `400 INVALID_BODY`——場次只能經送出比分端點完成（後端權威），否則評分與歷史不會被寫入。比對以讀出的目前回合為準，
寫入本身是帶版本條件的單一 UPDATE：比對後回合若已被改動，UPDATE 影響 0 列而回 409，因此比對與寫入之間沒有可被利用的競態。

**分槽清理**：`PUT /api/matchmaker/round` 的寫入與「刪除該使用者所有 `match_id` 不屬於（寫入後的）目前回合中**未完成**場次的分槽」MUST 在同一個 batch 內；
刪除條件 MUST 以資料庫中的回合內容推導（`json_each(matchmaker_round.data, '$.matches')`），使「分槽只存在於目前回合的未完成場次」這個不變式由伺服器維護，
不論該次 PUT 成功或因版本不符而未寫入都成立（`round-lifecycle`「重排本輪或重置名單時清除對應計分板進度」在雲端模式的實現）。
同一個 batch MUST 在回合寫入之後、分槽刪除之前，以與刪除**相同的條件**提高版本下限（`user-data-sync`「刪除後重建的使用者資料版本不得重複」），因此該 batch 為三條陳述式；
下限陳述式放在回合寫入之後，才能以寫入後的回合判定哪些分槽將被刪除。

**送出比分**：

1. 讀出目前回合與該使用者全部參賽者；回合不存在或 `version !== roundVersion` 時回 409。
2. 以核心 `submitScore({ round, players, matchId, rawScoreA: scoreA, rawScoreB: scoreB, now: 伺服器時間 })` 計算。
   失敗碼為 `empty-field`、`invalid-number`、`negative-score`、`tie` 時回 `400 INVALID_BODY`；`match-not-found`、`already-completed`、`scoring-failed` 時回 409。
3. 以**單一 batch** 依序：整批守衛（回合 version 等於 `roundVersion`，且每位被更新球員的 version 等於步驟 1 讀到的值）→ 插入歷史 → 更新回合（version + 1）→ 逐一更新被更新球員（`rating`、`gamesPlayed`，version + 1）→ 提高版本下限（該場分槽的 version；`user-data-sync`「刪除後重建的使用者資料版本不得重複」）→ 刪除該場分槽 → 刪除守衛列。
   守衛失敗或 `matchmaker_history` 主鍵衝突時回 409，資料不變。
4. 成功回 `200 { round: { data, version }, players: [{ data, version }]（僅被更新者）, historyEntry, boundaryHits }`。

`POST /api/matchmaker/reset` 的 batch MUST 刪除該使用者在 `matchmaker_players`、`matchmaker_round`、`matchmaker_match_slots`、`matchmaker_history` 四張表的列；
該 batch 的第一條 MUST 先以 `matchmaker_players`、`matchmaker_round`、`matchmaker_match_slots` 中該使用者列的最大 version 提高版本下限（`user-data-sync`「刪除後重建的使用者資料版本不得重複」）。

請求與回應的 schema 由核心套件 `@pickball/core/api/round` 匯出，前後端共用。

#### Scenario: auth 停用時回合、分槽與送出比分端點回 404

- **WHEN** 以 auth 停用且無 DB binding 的 env 呼叫本 Requirement 表中六個端點
- **THEN** 六者逐一回 404
- **驗收**：`hono-pickball/test/matchmaker-round.test.ts`，it 名稱「auth 停用且無 DB binding 時回合、分槽與送出比分端點皆回 404」

#### Scenario: 未登入時回合、分槽與送出比分端點回 401

- **WHEN** 未帶 session 呼叫六個端點
- **THEN** 六者逐一回 `401 { "error": "UNAUTHORIZED" }`
- **驗收**：`hono-pickball/test/matchmaker-round.test.ts`，it 名稱「未登入呼叫回合、分槽與送出比分端點皆回 401」

#### Scenario: 他人的回合與分槽不可見也不可改

- **GIVEN** 使用者 A 有回合（version 1）與 `m1` 的分槽
- **WHEN** 使用者 B 呼叫 `GET /round`、`GET /slots`、`GET /slots/m1`，並以 version 1 PUT 回合與 `m1` 的分槽
- **THEN** B 的三個 GET 為空（`null`／空清單）；B 的分槽 PUT 回 409（`m1` 不在 B 的回合中）；B 的回合 PUT（version 1）回 409；A 的回合與分槽不變
- **驗收**：`hono-pickball/test/matchmaker-round.test.ts`，it 名稱「B 看不到也改不到 A 的回合與分槽」

#### Scenario: 他人無法對本人的場次送出比分

- **GIVEN** 使用者 A 的回合（version 1）有 `pending` 的 `m1`
- **WHEN** 使用者 B 以 `roundVersion: 1` 對 `m1` 送出比分
- **THEN** 回 409；A 的名單、回合、歷史皆不變
- **驗收**：`hono-pickball/test/matchmaker-score.test.ts`，it 名稱「B 對 A 的場次送出比分回 409 且 A 的資料不變」

#### Scenario: 回合的單筆版本化讀寫

- **WHEN** 依序 GET（無資料）、以 version 0 PUT、以 version 1 PUT、再以 version 1 PUT
- **THEN** 依序得到 `{ data: null, version: 0 }`、`{ version: 1 }`、`{ version: 2 }`、409
- **驗收**：`hono-pickball/test/matchmaker-round.test.ts`，it 名稱「回合依單筆契約建立、更新並在版本不符時回 409」

#### Scenario: 回合 PUT 不得改變場次的完成狀態

- **GIVEN** 雲端回合中 `m1` 為 `pending`、`m2` 為 `completed`
- **WHEN** 分別 PUT「把 `m1` 改為 `completed`」與「把 `m2` 的比分改掉」的回合
- **THEN** 兩者皆回 400 `INVALID_BODY`；雲端回合不變
- **AND** 以 version 0 建立一個含 `completed` 場次的回合同樣回 400
- **驗收**：`hono-pickball/test/matchmaker-round.test.ts`，it 名稱「回合 PUT 改變場次完成狀態或已完成場次內容時回 400」

#### Scenario: 回合 PUT 在同一 batch 內清除不屬於新回合的分槽

- **GIVEN** 雲端回合有 `m1`、`m2`，兩者皆有分槽
- **WHEN** PUT 一個只含 `m1` 與新場次 `m3` 的回合（重排）
- **THEN** `m1` 的分槽保留、`m2` 的分槽已刪除
- **AND** 以過期 version PUT（回 409）時，分槽清單仍與雲端目前回合一致
- **驗收**：`hono-pickball/test/matchmaker-round.test.ts`，it 名稱「回合 PUT 刪除不屬於新回合的分槽且衝突時分槽仍與雲端回合一致」

#### Scenario: 分槽只能為目前回合的未完成場次建立

- **GIVEN** 雲端回合有 `pending` 的 `m1` 與 `completed` 的 `m2`
- **WHEN** 分別以 version 0 PUT `m1`、`m2` 與不存在的 `m9` 的分槽
- **THEN** `m1` 回 200 且 version 為 1；`m2` 與 `m9` 回 409 且未寫入
- **驗收**：`hono-pickball/test/matchmaker-slots.test.ts`，it 名稱「分槽只能為目前回合中未完成的場次建立」

#### Scenario: 分槽的逐筆版本化更新與讀取

- **GIVEN** `m1` 的分槽 version 為 1
- **WHEN** 以 version 1 PUT 新比分、再以 version 1 PUT，最後 `GET /slots/m1` 與 `GET /slots`
- **THEN** 第一次回 version 2、第二次回 409；兩個 GET 皆回 version 2 的資料；`GET /slots` 依 `match_id` 遞增排列
- **驗收**：`hono-pickball/test/matchmaker-slots.test.ts`，it 名稱「分槽依版本更新並可單筆或整份讀取」

#### Scenario: 不合法的分槽寫入

- **WHEN** PUT 的 `data.matchId` 與 path 不同、`data.matchId` 為 `null`、或 `data` 不合 `ScoreboardState`
- **THEN** 三者皆回 400 `INVALID_BODY`
- **驗收**：`hono-pickball/test/matchmaker-slots.test.ts`，it 名稱「分槽的 matchId 與 path 不一致或資料不合法時回 400」

#### Scenario: 比分格式錯誤回 400、場次狀態不符回 409

- **WHEN** 分別以空字串、非數字、負數、非計時回合的同分、不存在的場次、已完成的場次送出比分
- **THEN** 前四者回 400 `INVALID_BODY`，後二者回 409 `VERSION_CONFLICT`；六者皆不寫入任何資料
- **驗收**：`hono-pickball/test/matchmaker-score.test.ts`，it 名稱「送出比分的格式錯誤回 400、場次不存在或已完成回 409，且皆不寫入」

#### Scenario: 同一場次重複送出只寫入一筆歷史

- **GIVEN** `m1` 已以 version 3 送出成功（回合變為 version 4）
- **WHEN** 以 `roundVersion: 4` 再次對 `m1` 送出
- **THEN** 回 409；`matchmaker_history` 中 `m1` 仍只有一筆，四位球員的 `gamesPlayed` 只加過一次
- **驗收**：`hono-pickball/test/matchmaker-score.test.ts`，it 名稱「同一場次重複送出時回 409 且歷史只有一筆」

#### Scenario: 重置刪除名單、回合、分槽與歷史

- **GIVEN** 使用者在四張表皆有資料；另一位使用者也有資料
- **WHEN** 呼叫 `POST /api/matchmaker/reset`
- **THEN** 回 204；本人四張表皆為空；另一位使用者的資料不變
- **驗收**：`hono-pickball/test/matchmaker-players.test.ts`，it 名稱「重置在同一 batch 內刪除本人的名單、回合、分槽與歷史」

#### Scenario: 共用的回合與送出比分 schema

- **WHEN** 以 `SubmitScoreRequestSchema` 解析「`roundVersion` 為 0」「缺 `scoreB`」「合法輸入」
- **THEN** 只有合法輸入通過
- **驗收**：`packages/pickball-core/test/api/round.test.ts`，it 名稱「SubmitScoreRequestSchema 要求兩個比分字串與正整數 roundVersion」

#### Scenario: 回合雲端 API：回合 PUT 以單一 batch 寫入、提高下限並清除分槽

- **WHEN** 以記錄 `batch()` 呼叫的 D1 替身注入 env，以 `version: 0` 建立回合後，再以同一個（已過期的）body PUT 一次
- **THEN** 前者回 200、後者回 409；兩次各只送出一次 `batch()`，各含三條陳述式（回合寫入、提高版本下限、清除分槽）
- **驗收**：`hono-pickball/test/matchmaker-round.test.ts`，it 名稱「回合 PUT 的寫入與孤兒分槽清除在同一個 D1 batch 內送出」（既有 it，斷言由 `[2, 2]` 改為 `[3, 3]`）
