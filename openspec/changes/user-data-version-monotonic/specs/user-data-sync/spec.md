## ADDED Requirements

### Requirement: 刪除後重建的使用者資料版本不得重複

樂觀鎖只比對「呼叫端持有的 `version` 是否等於目前 `version`」。`matchmaker_players`、`matchmaker_round`、`matchmaker_match_slots`（以下稱**可重建的版本化表**）的列被刪除後，
可能以**同一個主鍵**重新建立（重置後再建立回合；重置或刪除後以原 id 匯入參賽者與分槽）；若重建的列 `version` 從 1 起算，仍持有舊列版本的裝置會比對成功而靜默覆蓋新資料（ABA）。
因此後端 SHALL 維持下列不變式：**同一主鍵的列在任何時點的 `version`，都大於該主鍵先前任何一代列曾出現過的 `version`**。

- **版本下限**：後端 SHALL 為每位使用者保存一個版本下限（表 `sync_version_floors`，每位使用者至多一列，`version` 欄即下限；沒有列視為 0）。下限只升不降。
- **刪除時提高下限**：任何刪除可重建的版本化表之列的寫入，MUST 在**同一個** D1 `batch()` 內、於刪除陳述式**之前**，把下限設為 `max(目前下限, 將被刪除之列的最大 version)`；
  將被刪除的列 MUST 以與刪除陳述式相同的條件在 SQL 內選出，SHALL NOT 依賴 batch 外先讀到的值。沒有任何列將被刪除時，SHALL NOT 寫入或改動下限列，且該陳述式 SHALL NOT 失敗（不得因 `max()` 得到 NULL 而違反 NOT NULL 使整批回滾）。
  適用的刪除路徑為：`DELETE /api/matchmaker/players/:id`、`POST /api/matchmaker/reset`、`PUT /api/matchmaker/round` 的孤兒分槽清除、`POST /api/matchmaker/round/matches/:matchId/score` 的該場分槽刪除；
  之後新增任何會刪除這三張表之列的寫入 MUST 同樣處理。
- **建立時取下限加一**：在可重建的版本化表建立列時（`PUT` 以 `version: 0` 建立參賽者、回合或分槽；`POST /api/matchmaker/players/import`；`POST /api/import` 的參賽者、回合、分槽三段），
  初始 `version` MUST 為「下限 + 1」，且下限 MUST 在建立的**同一條**陳述式內以 SQL 子查詢讀取，SHALL NOT 先在 JS 端讀取再寫入。從未刪除過這三張表之列的使用者下限為 0，初始 `version` 仍為 1。
  回應中的 `version` MUST 為實際寫入的值。
- **更新不變**：既有列的更新仍為 `version + 1`（「版本化讀寫契約」）；更新不讀也不改下限。
- **不適用的表**：`scoreboard_current` 沒有任何刪除路徑（重置不含此表、匯入為 `ON CONFLICT DO NOTHING`），`version` 只增不減；`matchmaker_history` 沒有任何接受呼叫端 `version` 的寫入端點（只增不改，`version` 恆為 1）；
  `sync_batch_guards` 在每個 batch 結束時即被刪除且 `version` 不對外。三者的寫入 SHALL NOT 讀取或提高下限，建立時 `version` 維持 1。
- **重置與匯入**：`POST /api/matchmaker/reset` SHALL NOT 刪除下限列；`POST /api/import` 的整批守衛條件 SHALL NOT 包含 `sync_version_floors`。
- 下限只屬於本人：所有讀寫 MUST 帶 `user_id = c.var.user.id`，一位使用者的刪除 SHALL NOT 影響其他使用者的建立版本。

#### Scenario: 版本下限：重置後重建的回合不被持舊版本的裝置覆寫

- **GIVEN** 回合以 `version: 0` 建立後再更新一次（目前 version 2），另一台裝置持有 version 1 與 version 2 的回合
- **WHEN** 呼叫 `POST /api/matchmaker/reset`，再以 `version: 0` PUT 新回合 R2，接著分別以 `version: 1`、`version: 2` PUT 舊回合 R1′
- **THEN** 重建的回合 version 為 3；兩次舊版本 PUT 皆回 `409 { "error": "VERSION_CONFLICT" }`；`GET /api/matchmaker/round` 為 R2 且 version 3
- **驗收**：`hono-pickball/test/version-floor.test.ts`，it 名稱「重置後重建的回合版本大於重置前且持舊版本的 PUT 回 409」

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

#### Scenario: 版本下限：重置在同一個 batch 內提高下限並刪除四張表

- **WHEN** 以記錄 `batch()` 呼叫的 D1 替身注入 env，呼叫 `POST /api/matchmaker/reset`
- **THEN** 回 204；只送出一次 `batch()`，含五條陳述式（提高下限與四條刪除）
- **驗收**：`hono-pickball/test/matchmaker-players.test.ts`，it 名稱「重置以單一 D1 batch 送出四條刪除」（既有 it，斷言由 `[4]` 改為 `[5]`）

## MODIFIED Requirements

### Requirement: 版本化讀寫契約

每位使用者單筆的資料（本 change：計分板目前比賽；之後的 change 沿用於其他單筆資料）SHALL 以版本化契約讀寫（D3）：

- `GET` MUST 回 `200 { "data": <T> | null, "version": <非負整數> }`；尚無資料時 MUST 回 `{ "data": null, "version": 0 }`，SHALL NOT 回 404
  （瀏覽器會把 4xx 記為 console 錯誤，與 `/api/session` 永遠 200 同理）。
- `PUT` 的 body MUST 為 `{ "data": <T>, "version": <非負整數> }`，`version` 為呼叫端最後一次讀到或寫成的版本：
  - `version` 為 0 且尚無資料 → 建立，回 `200 { data, version: <初始版本> }`。初始版本為 1；資料表屬於「刪除後重建的使用者資料版本不得重複」所列的可重建版本化表（例：`matchmaker_round`）時，
    初始版本為該使用者的版本下限加一（從未刪除過該類資料的使用者下限為 0，初始版本仍為 1），且下限 MUST 在建立的同一條陳述式內以子查詢讀取；
  - `version` 等於目前版本 → 更新，回 `200 { data, version: 目前版本 + 1 }`；
  - 其他情況（含「已有資料卻送 0」「尚無資料卻送 n > 0」）→ `409 { "error": "VERSION_CONFLICT" }`，資料 MUST 不變。
- 版本比對與寫入 MUST 是單一條件式 SQL（`INSERT ... ON CONFLICT DO NOTHING RETURNING` 或 `UPDATE ... WHERE user_id = ? AND version = ? RETURNING`），
  以「回傳列數為 0」判定衝突；SHALL NOT 先讀再寫（兩次呼叫之間會被其他裝置插隊）。
- body 不是 JSON、`Content-Type` 不是 JSON、或不符 schema → `400 { "error": "INVALID_BODY" }`；`data` MUST 以 `@pickball/core` 的共用 schema 驗證，
  寫入與回傳的是**驗證後的輸出**（含 schema 補上的預設值）。

契約的 zod schema 與錯誤碼 SHALL 放在核心套件：`@pickball/core/api/versioned`（`versionedEnvelopeSchema(dataSchema)`、`versionedWriteSchema(dataSchema)`）
與 `@pickball/core/api/errors`（`API_ERROR_CODES`：`UNAUTHORIZED`、`VERSION_CONFLICT`、`INVALID_BODY`）。前端解析回應與後端驗證請求 MUST 用同一份。

#### Scenario: 尚無資料時 GET 回 data null 與 version 0

- **GIVEN** 已登入、從未寫入
- **WHEN** `GET /api/scoreboard/current`
- **THEN** status 200，body 為 `{ "data": null, "version": 0 }`
- **驗收**：`hono-pickball/test/scoreboard-current.test.ts`，it 名稱「尚無資料時 GET 回 data null 與 version 0」

#### Scenario: 以 version 0 首次寫入

- **GIVEN** 已登入、從未寫入
- **WHEN** 以 `{ data: <合法且 matchId 為 null 的 ScoreboardState>, version: 0 }` 呼叫 `PUT`
- **THEN** status 200，`version` 為 1；接著 GET 取回相同 `data` 與 `version: 1`
- **驗收**：`hono-pickball/test/scoreboard-current.test.ts`，it 名稱「以 version 0 首次寫入成功並回 version 1」

#### Scenario: 以目前版本更新

- **GIVEN** 目前版本為 1
- **WHEN** 以 `version: 1` 與新的比分呼叫 `PUT`
- **THEN** status 200，`version` 為 2；GET 取回新的比分
- **驗收**：`hono-pickball/test/scoreboard-current.test.ts`，it 名稱「以目前 version 寫入成功並遞增 version，GET 取回相同資料」

#### Scenario: 版本不符時回 409 且資料不變

- **GIVEN** 目前版本為 2
- **WHEN** 分別以 `version: 1`、`version: 3` 呼叫 `PUT`
- **THEN** 兩者皆回 409 與 `{ "error": "VERSION_CONFLICT" }`；GET 仍回版本 2 的資料
- **驗收**：`hono-pickball/test/scoreboard-current.test.ts`，it 名稱「version 不符時回 409 VERSION_CONFLICT 且資料不變」

#### Scenario: 已有資料時以 version 0 寫入回 409

- **GIVEN** 已有資料（版本 1）
- **WHEN** 以 `version: 0` 呼叫 `PUT`
- **THEN** 回 409；資料與版本不變
- **驗收**：`hono-pickball/test/scoreboard-current.test.ts`，it 名稱「已有資料時以 version 0 寫入回 409」

#### Scenario: body 不合法時回 400

- **WHEN** 分別以「`data` 缺必要欄位」「`version` 為 -1」「`version` 為 1.5」「`Content-Type: text/plain` 的合法 JSON 字串」呼叫 `PUT`
- **THEN** 皆回 400 與 `{ "error": "INVALID_BODY" }`，且不建立任何資料
- **驗收**：`hono-pickball/test/scoreboard-current.test.ts`，it 名稱「body 不符 schema 或 content-type 非 JSON 時回 400 INVALID_BODY」

#### Scenario: 共用契約 schema 的邊界

- **WHEN** 以 `versionedEnvelopeSchema(z.object({ n: z.number() }))` 與 `versionedWriteSchema(...)` 解析各種輸入
- **THEN** envelope 接受 `data: null` 與非負整數 `version`、拒絕負數與小數 `version`；write 拒絕 `data: null`、負數與小數 `version`
- **驗收**：`packages/pickball-core/test/api/versioned.test.ts`，it 名稱「versionedEnvelopeSchema 接受 data null 與非負整數 version」與「versionedWriteSchema 拒絕 null data 與負數或非整數 version」

### Requirement: 多筆使用者資料的逐筆版本化契約

每位使用者有多筆、以 id 區分的資料（B6：對戰分配機參賽者；B7：對戰場次的計分板分槽；之後的 change 沿用於同型資料）SHALL 以「逐筆版本化」契約讀寫，
其餘規則（路由、授權、停用閘門、400／401／404／409 的錯誤碼）與「版本化讀寫契約」及「使用者資料 API 的路由、授權與停用閘門」相同：

- **列出**：`GET /api/<feature>/<items>` MUST 回 `200 { "items": [{ "data": <T>, "version": <正整數> }] }`；沒有資料時 `items` 為空陣列。
  排列順序 MUST 由該資料的 Requirement 定義；未另行定義時依建立順序（`sort_order` 遞增）。
- **建立或更新單筆**：`PUT /api/<feature>/<items>/:id`，body `{ "data": <T>, "version": <非負整數> }`。`data` 中代表 id 的欄位 MUST 等於 path 的 `:id`，否則 400。
  版本規則同單筆契約（0 為建立、等於目前版本才更新並回 `version + 1`、其餘 409 且資料不變）；資料有 `sort_order` 時，新建立的那筆為該使用者現有最大值加一。
  資料的 Requirement 可以為「建立」再加前置條件（例：分槽的場次必須屬於目前回合），條件不成立時 MUST 回 409 且不寫入。
- **刪除單筆**：`DELETE /api/<feature>/<items>/:id` MUST 回 `204`，不比對版本、**冪等**（不存在也回 204）。刪除表達的是使用者明確意圖；
  與另一裝置的編輯同時發生時以刪除為準，對方下一次 PUT 會因資料不存在（`version > 0`）而得到 409 並重新載入。
  刪除 MUST 依「刪除後重建的使用者資料版本不得重複」在同一個 `batch()` 內先提高版本下限：之後即使以同一 id 重建，對方持有的舊 version 也不會與新列相等。
- **批次附加**：`POST /api/<feature>/<items>/import`，body `{ "<items>": [<T>, ...] }`（至少一筆、id 互不重複，否則 400），
  MUST 以單一 D1 `batch()` 依序插入（`sort_order` 接續現有最大值），任一筆 id 已存在時**整份不寫入**並回 409；成功回 `200 { "items": [{ data, version }, ...] }`，`version` 為實際寫入的初始版本（同單筆契約：從未刪除過該類資料時為 1，否則為版本下限加一）。
  原子性來自 D1 batch：任一陳述式失敗時整批回滾（design 的 Context7 查證）。
- **重置**：`POST /api/<feature>/reset` MUST 以單一 `batch()` 刪除該使用者在此 feature 的所有使用者資料表的列並回 `204`；該 batch 的第一條 MUST 依「刪除後重建的使用者資料版本不得重複」提高版本下限；之後的 change 為同一 feature 新增資料表時 MUST 把該表加進這個 batch。

各資料 MAY 只提供上列端點的**子集**（例：分槽不提供批次附加；歷史只增不改，不提供 PUT），但提供的端點 MUST 依上列語意；子集與排序 MUST 在該資料的 Requirement 中明列。

前端對多筆資料 MUST 採樂觀更新，並以**每筆一個**最新優先儲存佇列（`createLatestWinsSaver`）送出 PUT／DELETE；任一筆收到 409 時 MUST 停止所有佇列、
丟棄待送值、重新 `GET` 整份清單取代畫面狀態，並回報 `conflict`——SHALL NOT 嘗試逐筆合併（D3）。多個佇列的狀態彙總為單一 `SyncStatus`：
任一在重試中為 `retrying`、否則任一在途為 `saving`、否則 `synced`。

#### Scenario: 共用的清單與匯入 schema

- **WHEN** 以 `PlayerImportRequestSchema` 解析「空陣列」「含兩筆相同 id」「兩筆合法且 id 相異」，以 `PlayerListResponseSchema` 解析「含一筆 `rating` 為 99」的回應
- **THEN** 只有「兩筆合法且 id 相異」通過；清單回應因該筆不合 `PlayerSchema` 而失敗
- **驗收**：`packages/pickball-core/test/api/players.test.ts`，it 名稱「PlayerImportRequestSchema 要求至少一位且 id 不重複」與「PlayerListResponseSchema 以 PlayerSchema 驗證每一筆」

#### Scenario: 分槽清單 schema 要求 matchId 非 null

- **WHEN** 以 `MatchSlotListResponseSchema` 解析「一筆 `data.matchId` 為 `null`」與「兩筆 `matchId` 皆為字串」的回應
- **THEN** 前者失敗、後者通過
- **驗收**：`packages/pickball-core/test/api/round.test.ts`，it 名稱「MatchSlotListResponseSchema 要求每筆分槽的 matchId 為字串」

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
守衛條件 SHALL NOT 包含 `sync_version_floors`：重置後該使用者的下限列仍存在，納入會使重置後永遠無法匯入。
同一份資料重複匯入時，第二次必因第一次已寫入名單、回合或歷史而被守衛拒絕；歷史的 `(user_id, match_id)` 主鍵是第二道防線。因此重複匯入 SHALL NOT 產生重複歷史。

**陳述式數量為常數**：參賽者、分槽、歷史各以**一條** `INSERT … SELECT … FROM json_each(?)` 寫入（整段陣列為單一參數），SHALL NOT 逐筆展開成多條陳述式或多個參數——
D1 每條陳述式最多 100 個參數、單一字串最多 2,000,000 位元組（見 design「查證紀錄」）。插入順序 MUST 依陣列順序（`ORDER BY key`）：
參賽者的 `sort_order` 為陣列索引；歷史的 `played_at` 為 `Date.parse(playedAt)`、插入順序即本機的追加順序（B8 的同時間排序依 `rowid`）。參賽者、回合、分槽列的 `version` 為該使用者的版本下限加一（以子查詢在同一條 `INSERT … SELECT` 內讀取，不增加陳述式數量；從未刪除過對戰分配機資料時為 1），
歷史與獨立計分板列的 `version` 為 1——見「刪除後重建的使用者資料版本不得重複」。

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
