# Specification: player-roster

## MODIFIED Requirements

### Requirement: 參賽者雲端 API

`hono-pickball/src/routes/matchmaker.ts` SHALL 以 `/api/matchmaker` sub-app 提供下列端點（`user-data-sync`「多筆使用者資料的逐筆版本化契約」的第一個實作），
`data` 一律以核心套件的 `PlayerSchema` 驗證，唯批次匯入的每一筆改以 `PlayerWriteSchema` 驗證（見下方「寫入雲端的參賽者 id」）：

| 方法與路徑 | 行為 |
|---|---|
| `GET /api/matchmaker/players` | `200 { items }`，依 `sort_order` |
| `PUT /api/matchmaker/players/:id` | 建立（`version: 0`）或依版本更新；path id ≠ `data.id` → 400 |
| `DELETE /api/matchmaker/players/:id` | `204`，冪等 |
| `POST /api/matchmaker/players/import` | `{ players }` 整份附加（D1 `batch()`）；任一 id 已存在 → 409 且不寫入；body 超過 `PLAYER_IMPORT_BODY_LIMIT_BYTES`（1,000,000 位元組）或超過 `MAX_PLAYERS_PER_IMPORT`（500）位 → `413 PAYLOAD_TOO_LARGE` 且不寫入 |
| `POST /api/matchmaker/reset` | `204`，以 `batch()` 刪除本人的對戰分配機資料（本 change：`matchmaker_players`） |

資料存取 SHALL 位於 `hono-pickball/src/matchmaker/players-repository.ts`。所有查詢 MUST 以 `user_id = c.var.user.id` 為條件。

**批次匯入的上限**（`user-data-sync`「批次寫入端點的筆數與 body 上限」）：body 上限 middleware 掛在 validator 之前；筆數檢查在 schema 通過之後、讀取 `sort_order` 與 `db.batch()` 之前。
恰 500 位 MUST 照常匯入。body 上限 1,000,000 位元組小於 D1 單一列上限 2,000,000 位元組，因此通過上限的請求中任一位參賽者的 `data` 都不會超過 D1 的列大小。
D1 的「每次 Worker 呼叫的 query 數」把一次 `db.batch()` 計為一個 query（Context7 查證，見 design），逐筆一條陳述式的匯入不受 Free 方案 50 個 query 的限制；500 位的上限用於約束單次 batch 的執行時間與 Worker CPU，並涵蓋球聚名單的實際規模。

**寫入雲端的參賽者 id**：`@pickball/core/api/players` SHALL 匯出 `PlayerWriteSchema = PlayerSchema.extend({ id: z.string().min(1) })`；`PlayerImportRequestSchema` 的每一筆與 `user-data-sync` 的 `LocalImportRequestSchema.players` MUST 以它驗證，
`id` 為空字串時 MUST 回 `400 INVALID_BODY` 且不寫入。`PUT /api/matchmaker/players/:id` 不需另行收緊：path 的 `:id` 不可能為空字串（`/api/matchmaker/players/` 不符合該路由），而 `data.id` MUST 等於 path id。
**`PlayerSchema` 本身 SHALL NOT 改變**：它同時用於訪客本機名單的逐筆降級（「LocalStorage 持久化與逐筆降級」）、本機 JSON 還原（`BackupSchema`）與雲端回應的解析；
收緊它會讓訪客既有的 id 為空字串的參賽者在下次讀取時被捨棄並回寫清除，因此只在寫入雲端的邊界收緊。

#### Scenario: auth 停用時所有端點回 404

- **GIVEN** env 不含 `ENVIRONMENT` 也不含 `DB`
- **WHEN** 分別呼叫上表五個端點（合法 body）
- **THEN** 皆回 404
- **驗收**：`hono-pickball/test/matchmaker-players.test.ts`，it 名稱「auth 停用且無 DB binding 時所有 /api/matchmaker 端點皆回 404」

#### Scenario: 未登入時所有端點回 401

- **WHEN** 不帶 cookie 分別呼叫上表五個端點
- **THEN** 皆回 401 與 `{ "error": "UNAUTHORIZED" }`
- **驗收**：`hono-pickball/test/matchmaker-players.test.ts`，it 名稱「未登入呼叫所有 /api/matchmaker 端點皆回 401」

#### Scenario: 他人的參賽者不可見也不可改

- **GIVEN** A 有參賽者 p1（version 1）
- **WHEN** B 呼叫 GET、以 `version: 1` PUT p1、DELETE p1
- **THEN** B 的 GET 不含 p1；B 的 PUT 回 409（B 沒有 p1）；B 的 DELETE 回 204；之後 A 的 GET 仍有 p1 且 version 為 1
- **驗收**：`hono-pickball/test/matchmaker-players.test.ts`，it 名稱「B 看不到 A 的參賽者，且以相同 id 的 PUT 與 DELETE 不影響 A」

#### Scenario: 他人的匯入與重置不影響本人

- **GIVEN** A 有兩位參賽者
- **WHEN** B 以與 A 相同的 id 匯入兩位參賽者，再呼叫重置
- **THEN** B 的匯入成功（id 只在使用者內唯一）；B 重置後 A 的 GET 仍為原本兩位
- **驗收**：`hono-pickball/test/matchmaker-players.test.ts`，it 名稱「B 的匯入與重置不影響 A 的名單」

#### Scenario: 尚無參賽者時回空清單

- **WHEN** 已登入、從未寫入時 GET
- **THEN** 200，`{ "items": [] }`
- **驗收**：`hono-pickball/test/matchmaker-players.test.ts`，it 名稱「尚無參賽者時 GET 回空的 items」

#### Scenario: 建立參賽者並依建立順序列出

- **WHEN** 依序以 `version: 0` PUT p2、p1
- **THEN** 兩者皆回 `version: 1`；GET 的順序為 p2、p1
- **驗收**：`hono-pickball/test/matchmaker-players.test.ts`，it 名稱「以 version 0 建立參賽者並依建立順序列出」

#### Scenario: 依版本更新參賽者

- **GIVEN** p1 的 version 為 1
- **WHEN** 以 `version: 1` PUT 改名後的 p1
- **THEN** 回 `version: 2`；GET 取回新名字，且順序不變
- **驗收**：`hono-pickball/test/matchmaker-players.test.ts`，it 名稱「以目前 version 更新參賽者並遞增 version」

#### Scenario: 參賽者版本不符

- **GIVEN** p1 的 version 為 2
- **WHEN** 分別以 `version: 1`、`version: 3` PUT
- **THEN** 皆回 409 `{ "error": "VERSION_CONFLICT" }`；GET 仍為 version 2 的資料
- **驗收**：`hono-pickball/test/matchmaker-players.test.ts`，it 名稱「參賽者 version 不符時回 409 且資料不變」

#### Scenario: 參賽者已存在時以 version 0 寫入

- **GIVEN** p1 已存在
- **WHEN** 以 `version: 0` PUT p1
- **THEN** 回 409；資料不變
- **驗收**：`hono-pickball/test/matchmaker-players.test.ts`，it 名稱「參賽者已存在時以 version 0 寫入回 409」

#### Scenario: 不合法的參賽者寫入

- **WHEN** 以 path `p1`、`data.id` 為 `p2` PUT；以 `rating` 為 99 的資料 PUT；以 `Content-Type: text/plain` PUT
- **THEN** 皆回 400 `{ "error": "INVALID_BODY" }`，且沒有任何資料被建立
- **驗收**：`hono-pickball/test/matchmaker-players.test.ts`，it 名稱「path id 與 data.id 不一致或資料不合 PlayerSchema 時回 400」

#### Scenario: 刪除冪等

- **GIVEN** p1 存在
- **WHEN** 連續兩次 DELETE p1
- **THEN** 兩次皆回 204；GET 不含 p1
- **驗收**：`hono-pickball/test/matchmaker-players.test.ts`，it 名稱「刪除參賽者回 204 且重複刪除仍回 204」

#### Scenario: 匯入附加在既有名單之後

- **GIVEN** 已有 p1
- **WHEN** POST import `[p2, p3]`
- **THEN** 200，回應 `items` 為 p2、p3 且 version 皆為 1；GET 順序為 p1、p2、p3
- **驗收**：`hono-pickball/test/matchmaker-players.test.ts`，it 名稱「匯入的參賽者附加在既有名單之後並各自為 version 1」

#### Scenario: 匯入整份原子性

- **GIVEN** 已有 p1
- **WHEN** POST import `[p4, p1, p5]`
- **THEN** 回 409；GET 只有 p1（p4、p5 皆未寫入）
- **驗收**：`hono-pickball/test/matchmaker-players.test.ts`，it 名稱「匯入時任一 id 已存在則整份不寫入並回 409」

#### Scenario: 不合法的匯入請求

- **WHEN** POST import `{ players: [] }` 與含兩筆相同 id 的清單
- **THEN** 皆回 400 `{ "error": "INVALID_BODY" }`，沒有任何資料被寫入
- **驗收**：`hono-pickball/test/matchmaker-players.test.ts`，it 名稱「匯入清單為空或含重複 id 時回 400」

#### Scenario: 重置刪除本人全部參賽者

- **GIVEN** 本人有三位參賽者
- **WHEN** POST reset
- **THEN** 回 204；GET 為空清單
- **驗收**：`hono-pickball/test/matchmaker-players.test.ts`，it 名稱「重置刪除本人全部參賽者並回 204」

#### Scenario: 名單匯入超過 500 位時回 413 且不寫入

- **WHEN** 分別以不同使用者匯入恰 500 位與 501 位參賽者
- **THEN** 前者回 200 且 GET 有 500 位；後者回 `413 { "error": "PAYLOAD_TOO_LARGE" }`，GET 為空清單
- **驗收**：`hono-pickball/test/matchmaker-players.test.ts`，it 名稱「匯入恰 500 位參賽者成功，501 位時回 413 PAYLOAD_TOO_LARGE 且不寫入」

#### Scenario: 名單匯入的 body 超過上限時回 413 且不寫入

- **WHEN** 匯入一位 `name` 長度使 body 超過 1,000,000 位元組的參賽者
- **THEN** 回 `413 { "error": "PAYLOAD_TOO_LARGE" }`；GET 為空清單
- **驗收**：`hono-pickball/test/matchmaker-players.test.ts`，it 名稱「匯入請求 body 超過上限時回 413 PAYLOAD_TOO_LARGE 且不寫入」

#### Scenario: 名單匯入的參賽者 id 為空字串時回 400

- **WHEN** 匯入 `[p1, { ...p2, id: "" }]`
- **THEN** 回 `400 { "error": "INVALID_BODY" }`；GET 為空清單
- **驗收**：`hono-pickball/test/matchmaker-players.test.ts`，it 名稱「匯入含 id 為空字串的參賽者時回 400 且不寫入」

#### Scenario: 寫入雲端的參賽者 schema 只在邊界收緊 id

- **WHEN** 以 `PlayerSchema`、`PlayerWriteSchema`、`PlayerImportRequestSchema`、`LocalImportRequestSchema` 分別解析含 `id: ""` 的參賽者（其餘欄位合法），並以 `PlayerWriteSchema` 解析 `id: "p1"` 的同一筆
- **THEN** `PlayerSchema` 通過；`PlayerWriteSchema`、`PlayerImportRequestSchema`、`LocalImportRequestSchema` 皆失敗；`id: "p1"` 時 `PlayerWriteSchema` 通過且輸出與 `PlayerSchema` 相同
- **驗收**：`packages/pickball-core/test/api/players.test.ts`，it 名稱「PlayerWriteSchema 拒絕空字串 id 而 PlayerSchema 照舊接受」

#### Scenario: 訪客本機名單照舊保留 id 為空字串的參賽者

- **GIVEN** 本機 `matchmaker:roster:v1` 含一位 `id` 為 `""` 與一位 `id` 為 `"p2"` 的合法參賽者
- **WHEN** 呼叫 `readRoster()`
- **THEN** 回傳兩位、`droppedCount` 為 0，且 key 的內容未被回寫改變
- **驗收**：`nextjs-pickball/lib/matchmaker/storage.test.ts`，it 名稱「id 為空字串的參賽者照常讀回且不被捨棄」
