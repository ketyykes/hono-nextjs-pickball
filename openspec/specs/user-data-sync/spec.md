# user-data-sync Specification

## Purpose
TBD - created by archiving change scoreboard-backend. Update Purpose after archive.

## Requirements

### Requirement: 使用者資料 API 的路由、授權與停用閘門

所有讀寫使用者資料的後端端點 SHALL 掛在 `/api/<feature>/...` 之下，以 `hono-pickball/src/routes/<feature>.ts` 的 Hono sub-app 實作，
並以 `app.route("/api/<feature>", <sub-app>)` 掛載。sub-app MUST 以 `use("*", localAuth, requireSession, requireExpectedUser)` 保護其下所有路由：

- `localAuth` SHALL 位於 `hono-pickball/src/auth/local-auth-middleware.ts`，是 `/api/auth/*`、`/api/me` 與所有使用者資料 API **共用的唯一**停用閘門：
  `isLocalAuthEnabled(env)` 為假時 MUST 回 `404`，且 SHALL NOT 建立 auth 實例、SHALL NOT 觸碰 D1（D4：正式站在 G1 前行為與現在相同）。
- `requireSession` 無有效 session 時 MUST 回 `401 { "error": "UNAUTHORIZED" }`。
- `requireExpectedUser` SHALL 位於 `hono-pickball/src/auth/require-expected-user.ts`，規則見「使用者資料請求的預期帳號守衛」。它只掛在使用者資料 sub-app；
  `requireSession` 本身 SHALL NOT 檢查預期帳號（`GET /api/me` 沿用 `localAuth, requireSession` 而不要求標頭）。
- 端點 MUST 只以 `c.var.user.id` 決定讀寫哪一位使用者的資料；SHALL NOT 從 path、query、body 或 header 接受使用者 id 作為讀寫對象。
  預期帳號標頭只用於**比對**：相符時照常以 `c.var.user.id` 讀寫，不符時整個請求被拒，因此不構成「接受使用者 id」。

其他 capability 中「sub-app 以 `localAuth`＋`requireSession` 保護」之類的敘述（例：`round-lifecycle`「回合與送出比分的雲端 API」），一律以本 Requirement 的完整 middleware 鏈為準。

Hono 型別參數 SHALL 分為兩層：`AuthAppEnv`（`Variables` 只有 `auth`）與 `SessionAppEnv`（再加 `user`、`session`）。
`requireSession` MUST 以 `createMiddleware<SessionAppEnv>` 宣告，使未經 `requireSession` 的 handler 讀取 `c.var.user` 成為型別錯誤
（B2 時兩者為同一型別，漏掛 middleware 不會被 tsc 發現）。

每個使用者資料端點 MUST 在 `hono-pickball/test/` 各有至少一個測試涵蓋四類情境：**未登入回 401**、**存取他人資料被拒**（以另一位使用者的 cookie 讀不到、改不到本人資料）、
**auth 停用回 404**（以 `app.request(path, init, { ...env, ENVIRONMENT: undefined, DB: undefined })` 注入，證明不觸碰 D1）、
**預期帳號缺少或不符回 401 `ACCOUNT_MISMATCH` 且資料不變**（由「使用者資料請求的預期帳號守衛」的列舉測試涵蓋，新增端點時補上該測試的樣本請求即可）。
各 change 的 test-plan.md MUST 附「後端 API 授權覆蓋表」逐端點列出這四類測試的 it 名稱。
後端測試以 cookie 送出的成功路徑請求 MUST 同時帶上該 cookie 所屬使用者的 `X-Expected-User-Id`（由 `hono-pickball/test/helpers/` 的請求 helper 集中處理）。

#### Scenario: auth 停用時使用者資料 API 回 404 且不觸碰 D1

- **GIVEN** env 不含 `ENVIRONMENT` 也不含 `DB`
- **WHEN** 分別呼叫 `GET /api/scoreboard/current` 與 `PUT /api/scoreboard/current`（合法 body）
- **THEN** 兩者皆回 404（而非 500）
- **驗收**：`hono-pickball/test/scoreboard-current.test.ts`，it 名稱「auth 停用且無 DB binding 時 GET 與 PUT /api/scoreboard/current 皆回 404」

#### Scenario: 未登入呼叫使用者資料 API 回 401

- **GIVEN** 本機登入啟用
- **WHEN** 不帶 cookie 分別呼叫 `GET` 與 `PUT /api/scoreboard/current`
- **THEN** 兩者皆回 401，body 為 `{ "error": "UNAUTHORIZED" }`
- **驗收**：`hono-pickball/test/scoreboard-current.test.ts`，it 名稱「未登入呼叫 GET 與 PUT /api/scoreboard/current 皆回 401」

#### Scenario: 只能存取本人的資料

- **GIVEN** 使用者 A 已寫入計分板（比分 5:3），使用者 B 已登入
- **WHEN** B 的 cookie 呼叫 `GET /api/scoreboard/current`，再以 `version: 0` 呼叫 `PUT`
- **THEN** B 的 GET 回 `{ data: null, version: 0 }`；B 的 PUT 成功建立 B 自己的資料；之後以 A 的 cookie GET 仍回比分 5:3 與原 version
- **驗收**：`hono-pickball/test/scoreboard-current.test.ts`，it 名稱「B 的 cookie 讀不到 A 的計分板且寫入不影響 A」

#### Scenario: 未經 requireSession 的 handler 讀取 user 為型別錯誤

- **GIVEN** `hono-pickball/test/auth-env-types.test.ts` 內以 `new Hono<AuthAppEnv>()` 宣告、未掛 `requireSession` 的 handler，在讀取 `c.var.user` 的那一行上方標註 `// @ts-expect-error`
- **WHEN** 執行 `pnpm --filter ./hono-pickball typecheck`
- **THEN** exit 0（該行確實是型別錯誤）；同檔另一個以 `SessionAppEnv` 經 `requireSession` 的 handler 讀取 `c.var.user.id` 無型別錯誤
- **驗收**：tasks.md 中該 RED／GREEN 的 typecheck 實跑紀錄（RED 時為「Unused '@ts-expect-error' directive」）

### Requirement: 版本化讀寫契約

每位使用者單筆的資料（本 change：計分板目前比賽；之後的 change 沿用於其他單筆資料）SHALL 以版本化契約讀寫（D3）：

- `GET` MUST 回 `200 { "data": <T> | null, "version": <非負整數> }`；尚無資料時 MUST 回 `{ "data": null, "version": 0 }`，SHALL NOT 回 404
  （瀏覽器會把 4xx 記為 console 錯誤，與 `/api/session` 永遠 200 同理）。
- `PUT` 的 body MUST 為 `{ "data": <T>, "version": <非負整數> }`，`version` 為呼叫端最後一次讀到或寫成的版本：
  - `version` 為 0 且尚無資料 → 建立，回 `200 { data, version: 1 }`；
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

### Requirement: 使用者資料表的命名與欄位慣例

存放使用者資料的 D1 表 SHALL 遵循：

- 表名 `<feature>_<entity>`，snake_case（例：`scoreboard_current`；B6 起 `matchmaker_players` 等）；欄位 snake_case。
- MUST 有 `user_id text not null`，以 foreign key 參照 `user(id)` 並 `on delete cascade`；單筆資料以 `user_id` 為主鍵，多筆資料以 `(user_id, <id>)` 為複合主鍵。
- MUST 有 `version integer not null` 與 `updated_at integer not null`（drizzle `timestamp_ms`）。
- 以 JSON 快照保存的資料存於 `data text not null`（drizzle `text(..., { mode: "json" })`），寫入前 MUST 經核心套件的 schema 驗證；
  需要被查詢或排序的欄位才拆成獨立欄位。

`@pickball/core/api/user-data-tables` SHALL 匯出 `USER_DATA_TABLES`（所有使用者資料表名稱）。auth 核心四張表（`user`、`session`、`account`、`verification`）
以外的每張資料表都 MUST 列入，且清單中的每個名稱都 MUST 存在——由後端測試**雙向**比對 `sqlite_master`。E2E 的資料清空以此清單為唯一來源，
漏列會讓測試帳號殘留資料、使登入態 E2E 互相污染。

#### Scenario: USER_DATA_TABLES 與實際資料表一致

- **GIVEN** 測試用 D1 已套用全部 migration
- **WHEN** 列出 `sqlite_master` 中的資料表，排除 `sqlite_%`、`_cf_%`、`d1_migrations` 與 auth 核心四張表
- **THEN** 排序後等於排序後的 `USER_DATA_TABLES`，且清單長度大於等於 1
- **驗收**：`hono-pickball/test/user-data-tables.test.ts`，it 名稱「USER_DATA_TABLES 恰為 auth 以外的所有資料表」

#### Scenario: 每張使用者資料表符合欄位慣例

- **WHEN** 對 `USER_DATA_TABLES` 的每張表查 `pragma_table_info` 與 `pragma_foreign_key_list`
- **THEN** 皆有 `user_id`、`version`、`updated_at` 三欄且為 NOT NULL；`user_id` 的 foreign key 指向 `user.id` 且 `on_delete` 為 `CASCADE`
- **驗收**：`hono-pickball/test/user-data-tables.test.ts`，it 名稱「每張使用者資料表皆有 user_id、version 與 updated_at 且 user_id 參照 user 並 cascade」

### Requirement: 前端依 session 選擇儲存模式

`nextjs-pickball/lib/sync/storage-mode.ts` SHALL 匯出 `resolveStorageMode(snapshot: SessionSnapshot): "local" | "remote"`，
是前端「存本機還是存雲端」的**唯一判斷**：只有 `status === "ready"`、`authEnabled === true` 且 `user !== null` 時回 `"remote"`，其餘一律 `"local"`。

session 仍在載入時 MUST 為 `"local"`：訪客（含正式站，auth 停用）的首屏時序 SHALL NOT 因等待 `/api/session` 而改變（runbook R3）。
代價是已登入使用者在 session 回應前會先看到本機資料一瞬間，之後切換為雲端載入中——此為刻意取捨，SHALL NOT 以「等 session 就緒才渲染」改變訪客時序。

各資料的 store hook SHALL 以「選擇器」形態接上儲存模式：既有本機實作原封不動保留（改名為同檔的 `useLocal<X>Store`），
新增 `hooks/useRemote<X>Store.ts`（參數含 `enabled: boolean` 與 `onUnauthorized: () => void`），對外名稱 `use<X>Store` 依 `useSession()` 與 `resolveStorageMode` 擇一回傳。
兩個 hook 每次 render 都呼叫（遵守 hooks 規則），未被選用的一方 SHALL NOT 發出請求或寫入 localStorage 以外的副作用。
雲端 hook 收到 401 時 MUST 呼叫 `onUnauthorized`（選擇器傳入 `useSession().refresh`），使 session 更新後自動回到本機模式。

#### Scenario: 只有就緒、啟用且已登入時為 remote

- **WHEN** 以 `{ status: "loading" }`、`{ status: "ready", authEnabled: false, user: null }`、`{ status: "ready", authEnabled: true, user: null }`、`{ status: "ready", authEnabled: true, user: <使用者> }` 分別呼叫
- **THEN** 只有最後一種回 `"remote"`，其餘皆為 `"local"`
- **驗收**：`nextjs-pickball/lib/sync/storage-mode.test.ts`，it 名稱「只有 session 就緒、auth 啟用且有 user 時為 remote」

### Requirement: 前端 API 請求的結果分類

`nextjs-pickball/lib/sync/api-client.ts` SHALL 匯出 `requestJson(method, path, { body?, schema })`，是使用者資料 API 的唯一 fetch 入口，
MUST NOT throw，回傳以下其一：

| 結果 | 條件 |
|---|---|
| `{ kind: "ok", value }` | 2xx，且回應 JSON 通過 `schema`（204 時 `value` 為 `undefined`，不驗證） |
| `{ kind: "conflict" }` | 409 |
| `{ kind: "unauthorized" }` | 401 |
| `{ kind: "rejected", status }` | 其餘 4xx（重試不會成功，如 400、404） |
| `{ kind: "failed" }` | 5xx、網路錯誤、回應不是 JSON 或不符 `schema`（可重試） |

請求 MUST 使用相對路徑（same-origin，經前端 proxy）並帶 `credentials: "same-origin"`；有 `body` 時以 `JSON.stringify` 送出並帶
`Content-Type: application/json`；`GET` MUST 帶 `keepalive: true`（WebKit 在導覽中斷 GET 時會記 console 錯誤，B3 Open Questions 第 14 條的同一處理）。

#### Scenario: 成功回應通過 schema 時為 ok

- **WHEN** fetch 回 200 與符合 schema 的 JSON
- **THEN** 回傳 `{ kind: "ok", value }`，`value` 為 schema 解析後的值
- **驗收**：`nextjs-pickball/lib/sync/api-client.test.ts`，it 名稱「2xx 且回應符合 schema 時為 ok」

#### Scenario: 409 與 401 各自分類

- **WHEN** fetch 分別回 409 與 401
- **THEN** 分別回傳 `conflict` 與 `unauthorized`
- **驗收**：`nextjs-pickball/lib/sync/api-client.test.ts`，it 名稱「409 為 conflict、401 為 unauthorized」

#### Scenario: 其餘 4xx 為 rejected

- **WHEN** fetch 分別回 400 與 404
- **THEN** 皆回傳 `rejected`，`status` 為原狀態碼
- **驗收**：`nextjs-pickball/lib/sync/api-client.test.ts`，it 名稱「其餘 4xx 為 rejected 並帶狀態碼」

#### Scenario: 可重試的失敗不 throw

- **WHEN** fetch 分別回 500、reject（網路錯誤）、回 200 但 body 不是 JSON、回 200 但不符 schema
- **THEN** 皆回傳 `failed`，呼叫端的 promise 不 reject
- **驗收**：`nextjs-pickball/lib/sync/api-client.test.ts`，it 名稱「5xx、網路錯誤或回應不符 schema 時為 failed 且不 throw」

#### Scenario: 請求帶正確的 fetch 選項

- **WHEN** 分別以 `GET` 與帶 body 的 `PUT` 呼叫
- **THEN** 兩者皆帶 `credentials: "same-origin"`；GET 帶 `keepalive: true` 且無 body；PUT 的 body 為 `JSON.stringify(body)` 且 header 含 `Content-Type: application/json`
- **驗收**：`nextjs-pickball/lib/sync/api-client.test.ts`，it 名稱「GET 帶 keepalive，有 body 時帶 JSON content-type，皆為 same-origin 憑證」

### Requirement: 最新優先的雲端儲存與自動重試

`nextjs-pickball/lib/sync/latest-wins-saver.ts` SHALL 匯出 `createLatestWinsSaver<T>({ send, onResult })`，供雲端 hook 儲存狀態：

- 同一時間 MUST 只有一個 `send` 在途；在途期間再呼叫 `save(payload)` 只保留**最新**一份待送，舊的待送值直接丟棄（中間狀態不必送達，最終狀態必達）。
- `send` 結果為 `ok` 時若有待送值，MUST 立即送出下一份；呼叫端在 `send` 內自行帶入最新 `version`。
- 結果為 `failed` 時 MUST 以 1、2、4、8 秒的間隔重試，之後每 8 秒重試，直到成功或被停止；等待期間的新 `save` 取代待送值，不重置等待時間。
- 結果為 `conflict`、`unauthorized`、`rejected` 時 MUST 停止（取消計時器、丟棄待送值），由呼叫端決定後續（重新載入、回本機模式、提示）。
- `dispose()` MUST 取消計時器並忽略之後到達的結果（元件卸載）。
- 每次狀態轉換 MUST 透過 `onResult` 通知呼叫端：`saving`、`saved`、`retrying`、以及停止時的結果種類。

重新整理或關閉頁面時尚未送達的變更會遺失；系統以「同步狀態提示」告知，本 change SHALL NOT 把待送值持久化到 localStorage。

#### Scenario: 同時只送一個請求且只保留最新一份

- **GIVEN** 第一次 `save(A)` 的 `send` 尚未完成
- **WHEN** 依序呼叫 `save(B)`、`save(C)`，接著讓第一次 `send` 回 ok
- **THEN** `send` 總共被呼叫兩次，參數依序為 A 與 C；B 從未送出
- **驗收**：`nextjs-pickball/lib/sync/latest-wins-saver.test.ts`，it 名稱「同時只送一個請求，在途期間再存只保留最新一份」

#### Scenario: 失敗時以退避間隔重試

- **GIVEN** `send` 持續回 failed（fake timers）
- **WHEN** 呼叫 `save(A)` 並推進時間
- **THEN** 第 2～7 次呼叫分別發生在前一次失敗後的 1、2、4、8、8、8 秒，`onResult` 回報 `retrying`；某次回 ok 後停止重試並回報 `saved`
- **驗收**：`nextjs-pickball/lib/sync/latest-wins-saver.test.ts`，it 名稱「failed 時依 1、2、4、8 秒後每 8 秒重試，成功後停止」

#### Scenario: 不可重試的結果停止佇列

- **WHEN** `send` 分別回 conflict、unauthorized、rejected，且呼叫前已有待送值
- **THEN** 不再呼叫 `send`、待送值被丟棄，`onResult` 回報對應種類；之後推進時間也不會再送
- **驗收**：`nextjs-pickball/lib/sync/latest-wins-saver.test.ts`，it 名稱「conflict、unauthorized、rejected 時停止並丟棄待送資料」

#### Scenario: 重試等待期間的新資料取代待送值

- **GIVEN** `save(A)` 失敗、正在等待 1 秒後重試
- **WHEN** 等待期間呼叫 `save(B)`，再推進 1 秒
- **THEN** 重試送出的是 B，且送出時間仍為原定的 1 秒後
- **驗收**：`nextjs-pickball/lib/sync/latest-wins-saver.test.ts`，it 名稱「重試等待期間的新資料取代待送值且不重置等待時間」

#### Scenario: dispose 後不再送出

- **GIVEN** 正在等待重試
- **WHEN** 呼叫 `dispose()` 並推進時間；另一情境為在途 `send` 於 `dispose()` 後才回 ok
- **THEN** 不再呼叫 `send`，`onResult` 不再被呼叫
- **驗收**：`nextjs-pickball/lib/sync/latest-wins-saver.test.ts`，it 名稱「dispose 後取消重試並忽略在途結果」

### Requirement: 同步狀態與提示

雲端 hook SHALL 對外回報 `SyncStatus`（`nextjs-pickball/lib/sync/sync-status.ts`）：
`local`（本機模式）、`loading`（雲端載入中）、`synced`（已與雲端一致）、`saving`（儲存中）、`retrying`（儲存失敗、等待重試）、
`conflict`（版本衝突，已重新載入）、`load-failed`（載入失敗）、`rejected`（雲端拒絕儲存）。
同檔 SHALL 匯出 `syncStatusMessage(status): string | null`，文案固定如下（MUST 逐字）：

| 狀態 | 文案 |
|---|---|
| `local`、`synced`、`saving` | `null`（不顯示） |
| `loading` | 正在載入雲端資料… |
| `retrying` | 尚未儲存到雲端，將自動重試 |
| `conflict` | 資料已在其他裝置更新，已重新載入最新資料 |
| `load-failed` | 無法載入雲端資料，請重新整理頁面 |
| `rejected` | 雲端拒絕儲存，請重新整理頁面 |

`nextjs-pickball/components/sync/SyncStatusNotice.tsx` SHALL 以 `role="status"` 呈現非 `null` 的文案，文案為 `null` 時不渲染任何元素。
本機模式（`local`）下頁面 SHALL NOT 渲染任何同步相關元素或屬性（含 `data-sync-status`），使訪客的 DOM 與本 change 前相同。

`conflict` 的處理 MUST 為：停止儲存佇列 → 重新 `GET` → 以雲端資料取代畫面狀態 → 顯示衝突文案；SHALL NOT 合併兩邊的變更（D3）。
衝突文案維持顯示，直到下一次儲存成功（`synced`）為止。

#### Scenario: 只有需要使用者注意的狀態才有文案

- **WHEN** 對八種狀態逐一呼叫 `syncStatusMessage`
- **THEN** `local`、`synced`、`saving` 回 `null`，其餘五種回上表文案（逐字比對）
- **驗收**：`nextjs-pickball/lib/sync/sync-status.test.ts`，it 名稱「local、synced、saving 不顯示提示，其餘狀態各有固定文案」

#### Scenario: 訪客的計分板不渲染同步元素

- **GIVEN** 未登入（或 auth 停用）
- **WHEN** 開啟 `/scoreboard` 並得分一次
- **THEN** 頁面上不存在 `[data-sync-status]` 元素，也不存在同步提示文案
- **驗收**：`nextjs-pickball/tests/e2e/specs/scoreboard-local-mode.spec.ts`，test 名稱「訪客模式下計分板不渲染同步提示與 data-sync-status」

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
- **批次附加**：`POST /api/<feature>/<items>/import`，body `{ "<items>": [<T>, ...] }`（至少一筆、id 互不重複，否則 400），
  MUST 以單一 D1 `batch()` 依序插入（`sort_order` 接續現有最大值），任一筆 id 已存在時**整份不寫入**並回 409；成功回 `200 { "items": [{ data, version: 1 }, ...] }`。
  原子性來自 D1 batch：任一陳述式失敗時整批回滾（design 的 Context7 查證）。
- **重置**：`POST /api/<feature>/reset` MUST 以單一 `batch()` 刪除該使用者在此 feature 的所有使用者資料表的列並回 `204`；之後的 change 為同一 feature 新增資料表時 MUST 把該表加進這個 batch。

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

### Requirement: 後端多表寫入以單一 batch 與整批守衛完成

同一個請求需要寫入多張使用者資料表（或同一張表的多列），且其中任一寫入以版本或存在性為前提時，後端 SHALL 以**單一** D1 `batch()` 完成全部寫入，
SHALL NOT 拆成多次 `run()`／`batch()`、SHALL NOT 以「先寫、失敗再手動補償」的方式達成原子性——D1 沒有互動式 transaction（runbook R2），
多次呼叫之間的失敗會留下部分寫入。

batch 中**影響 0 列的 UPDATE／DELETE 不是錯誤**，不會讓整批回滾（design Decision 2 的 Context7 查證與 characterization 測試）。因此版本條件 SHALL NOT 只寫在各 UPDATE 的 `WHERE` 中；
MUST 以**整批守衛**表達：batch 的第一條陳述式為

```sql
INSERT INTO sync_batch_guards (user_id, version, updated_at)
VALUES (?, CASE WHEN <全部前提成立> THEN 1 END, ?)
```

前提不成立時 `CASE` 得到 `NULL`、違反 `version` 的 NOT NULL 約束，該陳述式失敗並使整批回滾；batch 的最後一條陳述式 MUST 刪除這一列，使 `sync_batch_guards` 在任何 batch 結束後恆為空。
守衛陳述式 SHALL NOT 使用 `INSERT OR IGNORE`、`INSERT OR REPLACE` 或改變 NOT NULL 衝突處理的寫法——`OR IGNORE` 會把違反約束的列靜默略過，使守衛失效。
`<全部前提成立>` MUST 是只讀取資料庫目前內容的純 SQL 條件（例：`(SELECT version FROM matchmaker_round WHERE user_id = ?) = ?`），SHALL NOT 依賴 batch 外先讀到的值——
先讀後寫之間的競態正是守衛要消除的。

守衛失敗的錯誤 MUST 被分類為 `409 { "error": "VERSION_CONFLICT" }`；其他資料庫錯誤 SHALL NOT 被吞成 409，MUST 照常回 500。分類邏輯集中在
`hono-pickball/src/matchmaker/batch-guard.ts`，以錯誤訊息是否指向 `sync_batch_guards.version`（或該 Requirement 明列的唯一性約束）判定。

#### Scenario: batch 中影響 0 列的 UPDATE 不會使整批回滾

- **GIVEN** 測試用 D1 已套用全部 migration，有一位使用者
- **WHEN** 執行 `batch([插入一列 matchmaker_round, 對不存在的 user_id 執行 UPDATE matchmaker_players])`
- **THEN** batch 不拋出，`matchmaker_round` 的那一列已寫入
- **驗收**：`hono-pickball/test/d1-batch-guard.test.ts`，it 名稱「batch 中影響 0 列的 UPDATE 不會使整批回滾」

#### Scenario: 整批守衛的條件不成立時整批回滾

- **GIVEN** 同上
- **WHEN** 執行 `batch([守衛（條件為假）, 插入一列 matchmaker_round, 刪除守衛列])`
- **THEN** batch 拋出且錯誤被 `batch-guard.ts` 分類為版本衝突；`matchmaker_round` 與 `sync_batch_guards` 皆無該使用者的列
- **AND** 條件為真時同一組陳述式成功，`matchmaker_round` 有一列、`sync_batch_guards` 為空
- **驗收**：`hono-pickball/test/d1-batch-guard.test.ts`，it 名稱「整批守衛的條件不成立時整批回滾且被分類為版本衝突」

#### Scenario: 非守衛的資料庫錯誤不被分類為版本衝突

- **WHEN** 以一個 foreign key 違反的錯誤（不存在的 `user_id`）呼叫分類函式
- **THEN** 分類結果不是版本衝突
- **驗收**：`hono-pickball/test/d1-batch-guard.test.ts`，it 名稱「非守衛的資料庫錯誤不被分類為版本衝突」

### Requirement: 使用者資料請求的預期帳號守衛

同一瀏覽器的多個分頁共用同一個 session cookie；另一分頁換成其他帳號後，本分頁的請求會以新帳號的身分通過 `requireSession`。
為使「前端以為的帳號」由伺服器驗證，`hono-pickball/src/auth/require-expected-user.ts` SHALL 匯出 `requireExpectedUser`（`createMiddleware<SessionAppEnv>`）：

- 讀取請求標頭 `X-Expected-User-Id`（名稱取自 `@pickball/core/api/headers` 的 `EXPECTED_USER_ID_HEADER`；標頭名稱比對不分大小寫）。
- 標頭缺少、為空字串、或值不**完全等於** `c.var.user.id`（不 trim、不接受逗號串接的多值）時 MUST 回 `401 { "error": "ACCOUNT_MISMATCH" }`，
  且 SHALL NOT 執行之後的 validator 與 handler——資料 MUST 不變，GET 亦 SHALL NOT 回傳任何資料。所有 HTTP 方法（含 GET）一律要求標頭。
- 相符時 MUST 原樣交給下一層，資料仍只以 `c.var.user.id` 決定。

守衛 MUST 位於 `localAuth` 與 `requireSession` 之後：auth 停用時仍回 404、未登入時仍回 `401 UNAUTHORIZED`、`getSession` 例外時仍回 500。
缺標頭與不符共用同一個錯誤碼，SHALL NOT 另設 400 類錯誤碼。

`@pickball/core/api/errors` 的 `API_ERROR_CODES` SHALL 恰含 `UNAUTHORIZED`、`VERSION_CONFLICT`、`INVALID_BODY`、`ACCOUNT_MISMATCH` 四個鍵（本 Requirement 補充「版本化讀寫契約」所列的錯誤碼清單）；
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
- **THEN** 恰含 `UNAUTHORIZED`、`VERSION_CONFLICT`、`INVALID_BODY`、`ACCOUNT_MISMATCH` 四個鍵，且各鍵的值等於鍵名
- **驗收**：`packages/pickball-core/test/api/errors.test.ts`，it 名稱「API_ERROR_CODES 恰為四個錯誤碼且值等於鍵名」

#### Scenario: 預期帳號守衛：標頭名稱常數

- **WHEN** 匯入 `@pickball/core/api/headers` 的 `EXPECTED_USER_ID_HEADER`
- **THEN** 其值為 `"X-Expected-User-Id"`
- **驗收**：`packages/pickball-core/test/api/headers.test.ts`，it 名稱「EXPECTED_USER_ID_HEADER 為 X-Expected-User-Id」

### Requirement: 前端使用者資料請求帶預期帳號

本 Requirement 補充「前端 API 請求的結果分類」：`requestJson` 的 options SHALL 為 `{ body?, schema, expectedUserId }`，`expectedUserId: string` 為**必填**（型別層面不可能漏帶）。
每個請求（含 GET）MUST 帶標頭 `X-Expected-User-Id: <expectedUserId>`（名稱取自 `EXPECTED_USER_ID_HEADER`），有 body 時與 `Content-Type: application/json` 並存於同一個 headers 物件。
401 一律分類為 `{ kind: "unauthorized" }`，不區分 `UNAUTHORIZED` 與 `ACCOUNT_MISMATCH`（兩者的處置相同：停止並 refresh session）。

`requestJson` SHALL NOT 自行讀取 session store（`lib/sync` 維持與 auth 解耦）：預期帳號 MUST 由呼叫端提供，且 MUST 代表「這份資料屬於誰」——
雲端 store 傳入該世代載入時的 user id，一次性操作傳入觸發當下元件所見的 user id（見「雲端 store 以登入帳號為界」）。

所有使用者資料 API 薄包裝（`lib/sync/roster-api.ts`、`lib/sync/round-api.ts`、`lib/matchmaker/remote-transfer.ts`，以及之後的 change 新增者）MUST 以**第一個參數**接收 `expectedUserId` 並原樣交給 `requestJson`；
直接呼叫 `requestJson` 的雲端 hook（`useRemoteScoreboardStore`）同樣 MUST 傳入。`lib/sync/round-command-queue.ts` 的 `putRound`／`submitScore` options MUST 為「已綁定帳號」的函式型別
（不含 `expectedUserId` 參數），由持有佇列的 hook 在每個世代以閉包綁定帳號後傳入；佇列本身不知道帳號。

#### Scenario: 請求標頭：每個請求帶預期帳號標頭

- **WHEN** 分別以 `GET`（無 body）與 `PUT`（有 body）呼叫 `requestJson`，`expectedUserId` 為 `"user-a"`
- **THEN** 兩者的 headers 皆含 `X-Expected-User-Id: user-a`；PUT 同時含 `Content-Type: application/json`
- **驗收**：`nextjs-pickball/lib/sync/api-client.test.ts`，it 名稱「每個請求帶 X-Expected-User-Id 標頭，有 body 時與 Content-Type 並存」

#### Scenario: 請求標頭：預期帳號只來自呼叫端

- **GIVEN** session store 的快照為使用者 B
- **WHEN** 以 `expectedUserId: "user-a"` 呼叫 `requestJson`
- **THEN** 送出的 `X-Expected-User-Id` 為 `user-a`
- **驗收**：`nextjs-pickball/lib/sync/api-client.test.ts`，it 名稱「requestJson 只使用呼叫端給的 expectedUserId，不讀 session store」

#### Scenario: 請求標頭：帳號不符的 401 同樣分類為 unauthorized

- **WHEN** fetch 回 `401 { "error": "ACCOUNT_MISMATCH" }`
- **THEN** 回傳 `{ kind: "unauthorized" }`
- **驗收**：`nextjs-pickball/lib/sync/api-client.test.ts`，it 名稱「401 ACCOUNT_MISMATCH 同樣分類為 unauthorized」

#### Scenario: 請求標頭：API 薄包裝把預期帳號原樣交給 requestJson

- **WHEN** 以 `"user-a"` 為第一參數呼叫名單（列出、PUT、DELETE、批次附加、重置）、回合（GET、PUT）、分槽（清單、單筆 GET、PUT）與送出比分的每個包裝函式
- **THEN** 每次 `requestJson` 呼叫的 `expectedUserId` 皆為 `"user-a"`，方法、路徑、body 與 schema 與既有斷言相同
- **驗收**：`nextjs-pickball/lib/sync/roster-api.test.ts` 與 `nextjs-pickball/lib/sync/round-api.test.ts`，it 名稱皆為「包裝把 expectedUserId 交給 requestJson」

### Requirement: 雲端 store 以登入帳號為界

所有雲端 store hook（`useRemoteScoreboardStore`、`useRemoteRosterStore`、`useRemoteRoundStore`、`useRemoteMatchSlotStore`，以及之後的 change 新增者）的 options MUST 含 `userId: string | null`；
`user-data-sync`「前端依 session 選擇儲存模式」、`scoreboard`、`player-roster`、`round-lifecycle` 中 `useRemote<X>Store({ enabled, … })` 的參數列以本 Requirement 補充的 `userId` 為準。
選擇器（`useScoreboardStore`、`useRosterStore`、`useRoundStore`）MUST 把 `useSession()` 快照中的 user id 作為 `userId` 傳入（session 為 `loading` 或無 user 時為 `null`）。
`enabled` 為 true 而 `userId` 為 `null` 時 MUST 視同停用（不發請求）。

- **世代**：hook 的載入與儲存以「世代」為單位，`enabled`、`userId`（分槽另含 `matchId`）任一改變即結束舊世代、開始新世代。世代內的**每一個**請求（載入、儲存、重試、重置、送出比分、衝突後重載）
  MUST 以該世代的 `userId` 作為 `expectedUserId`，SHALL NOT 在送出當下改讀其他來源。
- **結束舊世代**：MUST 停止並丟棄所有儲存佇列與命令佇列（待送值、退避計時器），忽略所有在途請求的結果；舊世代的結果 SHALL NOT 更新狀態，
  也 SHALL NOT 呼叫跨 store 的 port（`applyRemotePlayers`、`reloadRemotePlayers`）或 `updatePlayer`。舊帳號的待送變更被丟棄時 SHALL NOT 新增提示文案或 `SyncStatus`。
- **新世代**：`syncStatus` 為 `loading`，以新的 `userId` 重新載入，成功後以回應取代狀態（無資料時為初始狀態），SHALL NOT 立即寫回。
- **不顯示前一帳號的資料**：hook MUST 記錄目前狀態所屬的 `userId`；render 時若與 options 的 `userId` 不同，MUST 回傳初始狀態（計分板為初始比分、名單為空、回合為 `null` 且 `remoteMatchSlots` 為空物件、分槽為初始狀態）
  與 `syncStatus: "loading"`，且此期間所有使用者操作 MUST 不送出請求、不改變狀態。
- **401（含 `ACCOUNT_MISMATCH`）**：沿用既有規則停止並呼叫 `onUnauthorized`；session refresh 後 user id 改變時，依上列規則以新帳號開始新世代。
- **一次性雲端操作**（參賽者 CSV 雲端匯入、雲端 JSON 匯出、`CourtCard` 建立雲端分槽，以及之後的 change 新增者）MUST 以觸發當下元件經 `useSession()` 取得的 user id 呼叫 API 包裝；
  同一次操作內的多個請求 MUST 使用同一個 user id；結果為未授權時 MUST 呼叫 `useSession().refresh()`（另照常顯示既有錯誤訊息）。
  為此 `lib/matchmaker/remote-transfer.ts` 的失敗結果 MUST 以機器可讀的欄位標示「未授權」，元件 SHALL NOT 以比對訊息字串判斷。

#### Scenario: 帳號世代：計分板換帳號時丟棄待送變更並以新帳號重新載入

- **GIVEN** `enabled: true`、`userId: "user-a"`，載入完成後得分一次，該次 PUT 回 500、正在等待重試（fake timers）
- **WHEN** 以 `userId: "user-b"` rerender，GET 回 `{ data: <比分 4:2 的狀態>, version: 3 }`，再推進 30 秒
- **THEN** rerender 之後送出的請求只有一次帶 `X-Expected-User-Id: user-b` 的 GET，不再有任何 PUT；狀態為 4:2、`syncStatus` 為 `synced`
- **驗收**：`nextjs-pickball/hooks/useRemoteScoreboardStore.test.tsx`，it 名稱「userId 變更時丟棄前一帳號的待送變更並以新帳號重新載入」

#### Scenario: 帳號世代：名單換帳號時丟棄待送變更並以新帳號重新載入

- **GIVEN** `enabled: true`、`userId: "user-a"`，載入兩位參賽者後新增一位，該次 PUT 回 500、正在等待重試
- **WHEN** 以 `userId: "user-b"` rerender，GET 回一位不同的參賽者，再推進 30 秒
- **THEN** 不再有任何 PUT 或 DELETE；名單為 B 的那一位、`syncStatus` 為 `synced`；該 GET 帶 `X-Expected-User-Id: user-b`
- **驗收**：`nextjs-pickball/hooks/useRemoteRosterStore.test.tsx`，it 名稱「userId 變更時丟棄前一帳號的待送變更並以新帳號重新載入」

#### Scenario: 帳號世代：回合換帳號時丟棄命令佇列並以新帳號重新載入

- **GIVEN** `enabled: true`、`userId: "user-a"`，回合載入完成後執行一次回合變更，該次 PUT 回 500、正在等待重試
- **WHEN** 以 `userId: "user-b"` rerender，`GET /round` 與 `GET /slots` 回 B 的資料，再推進 30 秒
- **THEN** 不再有任何回合 PUT 或送出比分 POST；`round` 與 `remoteMatchSlots` 為 B 的資料；兩個 GET 皆帶 `X-Expected-User-Id: user-b`；`updatePlayer` 未被呼叫
- **驗收**：`nextjs-pickball/hooks/useRemoteRoundStore.test.tsx`，it 名稱「userId 變更時丟棄前一帳號的命令佇列並以新帳號重新載入」

#### Scenario: 帳號世代：分槽換帳號時丟棄待送變更並以新帳號重新載入

- **GIVEN** `enabled: true`、`matchId: "m1"`、`userId: "user-a"`，載入後得分一次，該次 PUT 回 500、正在等待重試
- **WHEN** 以 `userId: "user-b"` rerender，`GET /slots/m1` 回 `{ data: null, version: 0 }`，再推進 30 秒
- **THEN** 不再有任何 PUT；`bindingStatus` 為 `missing`；該 GET 帶 `X-Expected-User-Id: user-b`
- **驗收**：`nextjs-pickball/hooks/useRemoteMatchSlotStore.test.tsx`，it 名稱「userId 變更時丟棄前一帳號的待送變更並以新帳號重新載入」

#### Scenario: 帳號世代：每個世代的請求一律帶該世代的帳號

- **GIVEN** `userId: "user-a"`，載入、儲存一次、失敗後重試一次
- **WHEN** 以 `userId: "user-b"` rerender 後再載入與儲存一次
- **THEN** rerender 前的所有請求 `X-Expected-User-Id` 皆為 `user-a`，之後的所有請求皆為 `user-b`
- **驗收**：`nextjs-pickball/hooks/useRemoteScoreboardStore.test.tsx` 與 `nextjs-pickball/hooks/useRemoteRosterStore.test.tsx`，it 名稱皆為「每個世代的請求一律帶該世代的帳號」

#### Scenario: 帳號世代：換帳號的那一次 render 起不回傳前一帳號的資料

- **GIVEN** `userId: "user-a"` 已載入資料（計分板 7:5；名單兩位；回合一輪且有一個分槽）
- **WHEN** 以 `userId: "user-b"` rerender，B 的 GET 尚未回應
- **THEN** rerender 後立即讀到的回傳值為初始狀態（計分板 0:0；名單為空；`round` 為 `null`、`remoteMatchSlots` 為空物件）且 `syncStatus` 為 `loading`；此時呼叫使用者操作不送出請求、不改變狀態
- **驗收**：`nextjs-pickball/hooks/useRemoteScoreboardStore.test.tsx`、`nextjs-pickball/hooks/useRemoteRosterStore.test.tsx` 與 `nextjs-pickball/hooks/useRemoteRoundStore.test.tsx`，it 名稱皆為「userId 變更的那一次 render 起不回傳前一帳號的資料」

#### Scenario: 帳號世代：userId 為 null 時視同停用

- **WHEN** 以 `enabled: true`、`userId: null` mount 並呼叫各操作
- **THEN** fetch 未被呼叫
- **驗收**：`nextjs-pickball/hooks/useRemoteScoreboardStore.test.tsx`、`nextjs-pickball/hooks/useRemoteRosterStore.test.tsx`、`nextjs-pickball/hooks/useRemoteRoundStore.test.tsx` 與 `nextjs-pickball/hooks/useRemoteMatchSlotStore.test.tsx`，it 名稱皆為「enabled 為 true 但 userId 為 null 時不發出任何請求」

#### Scenario: 帳號世代：換帳號後才回來的送出比分結果不影響名單

- **GIVEN** `userId: "user-a"`，送出比分的 POST 在途
- **WHEN** 以 `userId: "user-b"` rerender 後，該 POST 才回 200 與四位參賽者
- **THEN** `applyRemotePlayers` 與 `reloadRemotePlayers` 皆未被呼叫，`round` 不含該次結果
- **驗收**：`nextjs-pickball/hooks/useRemoteRoundStore.test.tsx`，it 名稱「換帳號後才回來的送出比分結果不呼叫 applyRemotePlayers」

#### Scenario: 帳號世代：選擇器把 session 的 user id 交給雲端 hook

- **GIVEN** `useSession` 先回已登入的使用者 A，之後改回使用者 B
- **WHEN** 分別渲染 `useScoreboardStore()`（含帶 `matchId` 的分槽分支）、`useRosterStore()`、`useRoundStore(...)`
- **THEN** 對應的雲端 hook 依序以 A 的 id、B 的 id 送出載入請求的 `X-Expected-User-Id`；session 為 loading 或訪客時沒有任何使用者資料請求
- **驗收**：`nextjs-pickball/hooks/useScoreboardStore.test.tsx`、`nextjs-pickball/hooks/useRosterStore.test.tsx`、`nextjs-pickball/hooks/useRoundStore.test.tsx`，it 名稱皆為「選擇器把 session 的 user id 傳給雲端 hook」

#### Scenario: 帳號世代：一次性雲端操作以觸發當下的帳號送出

- **WHEN** 以 `"user-a"` 呼叫 `importRemoteRoster` 與 `buildRemoteBackupSnapshot`
- **THEN** 其中每一個請求（匯入前的 GET、匯入的 POST、備份的名單與回合 GET）的 `expectedUserId` 皆為 `"user-a"`
- **驗收**：`nextjs-pickball/lib/matchmaker/remote-transfer.test.ts`，it 名稱「雲端匯入與備份的每個請求都帶呼叫端給的帳號」

#### Scenario: 帳號世代：一次性雲端操作標示未授權

- **WHEN** 雲端匯入的 GET 或 POST、雲端備份的任一 GET 回 401
- **THEN** 回傳的失敗結果帶有未授權標示（訊息仍為既有的 `REMOTE_TRANSFER_MESSAGES.unauthorized`）；其他失敗不帶該標示
- **驗收**：`nextjs-pickball/lib/matchmaker/remote-transfer.test.ts`，it 名稱「雲端匯入與備份遇到 401 時以機器可讀欄位標示未授權」

#### Scenario: 帳號世代：建立雲端分槽帶入目前帳號且未授權時刷新 session

- **GIVEN** 雲端模式（傳入 `remoteNavigate`），`useSession` 為使用者 A
- **WHEN** 點擊「進入計分板」，分槽 PUT 回 `unauthorized`
- **THEN** PUT 的 `expectedUserId` 為 A 的 id；`refresh` 被呼叫一次；顯示既有錯誤訊息且 `remoteNavigate` 未被呼叫
- **驗收**：`nextjs-pickball/components/matchmaker/CourtCard.test.tsx`，it 名稱「雲端建立分槽帶入目前帳號且未授權時刷新 session 並不導向」

### Requirement: 另一分頁換帳號時本分頁不寫入新帳號

以測試帳號 A 的 storage state 開啟頁面並同步完成後，同一 context 以衍生的第二帳號 B 登入（cookie 被覆寫，等同另一分頁換帳號）。
此後本分頁的任何使用者資料寫入 MUST 被後端以 401 拒絕且 B 與 A 的雲端資料皆不變；頁面 MUST 經 session refresh 改以 B 的身分與資料呈現（帳號入口顯示 B 的名稱）。
經前端 proxy 送出的使用者資料請求 MUST 帶上目前帳號的 `X-Expected-User-Id`（proxy 原樣轉發標頭，不需修改）。

#### Scenario: 換帳號 E2E：本分頁的計分不寫入新帳號

- **GIVEN** 以 A 開啟 `/scoreboard` 並同步完成；切換為 B 後，以 B 的身分把 B 的雲端計分板寫為 2:0
- **WHEN** 在原頁得分一次
- **THEN** 該次 PUT 回 401；頁面最終顯示 B 的 2:0 且帳號入口顯示 B 的名稱；以 B 讀取仍為 2:0 與原 version；以 A 的 storage state 另開 context 讀取 A 的計分板未變
- **驗收**：`nextjs-pickball/tests/e2e/user-data/account-switch.spec.ts`，test 名稱「另一分頁換成帳號 B 後，本分頁的計分不會寫入 B 且改以 B 的資料重新載入」

#### Scenario: 換帳號 E2E：本分頁新增的參賽者不寫入新帳號

- **GIVEN** 以 A 開啟 `/matchmaker/players` 並同步完成；切換為 B 後，B 的名單有一位參賽者
- **WHEN** 在原頁新增一位參賽者
- **THEN** 該次 PUT 回 401；B 的名單仍只有原本那一位；A 的名單未變；頁面最終顯示 B 的名單
- **驗收**：`nextjs-pickball/tests/e2e/user-data/account-switch.spec.ts`，test 名稱「另一分頁換成帳號 B 後，本分頁新增的參賽者不會寫入 B 的名單」

#### Scenario: 換帳號 E2E：本分頁的重置不刪除新帳號的資料

- **GIVEN** 同上，B 的名單有一位參賽者
- **WHEN** 在原頁確認重置名單
- **THEN** `POST /api/matchmaker/reset` 回 401；B 的名單仍有那一位；A 的名單未變
- **驗收**：`nextjs-pickball/tests/e2e/user-data/account-switch.spec.ts`，test 名稱「另一分頁換成帳號 B 後，本分頁的重置不會刪除 B 的資料」

#### Scenario: 換帳號 E2E：本分頁產生的對戰不寫入新帳號

- **GIVEN** 以 A 開啟 `/matchmaker`，A 的名單有四位且同步完成；切換為 B（B 沒有回合）
- **WHEN** 在原頁產生一輪對戰
- **THEN** 回合 PUT 回 401；以 B 讀取 `GET /api/matchmaker/round` 仍為 `{ data: null, version: 0 }`；A 的回合未變
- **驗收**：`nextjs-pickball/tests/e2e/user-data/account-switch.spec.ts`，test 名稱「另一分頁換成帳號 B 後，本分頁產生的對戰不會寫入 B 的回合」

#### Scenario: 換帳號 E2E：本分頁送出比分不寫入新帳號

- **GIVEN** 以 A 開啟 `/matchmaker` 並已產生一輪、同步完成；切換為 B
- **WHEN** 在原頁對一場送出比分
- **THEN** 送出比分的 POST 回 401；B 的回合與名單不變；以 A 的 storage state 另開 context，A 的該場仍為未完成
- **驗收**：`nextjs-pickball/tests/e2e/user-data/account-switch.spec.ts`，test 名稱「另一分頁換成帳號 B 後，本分頁送出比分不會寫入 B 的回合與歷史」

#### Scenario: 換帳號 E2E：本分頁進入計分板不在新帳號建立分槽

- **GIVEN** 以 A 開啟 `/matchmaker` 並已產生一輪、同步完成；切換為 B
- **WHEN** 在原頁點擊某場的「進入計分板」
- **THEN** 分槽 PUT 回 401；頁面停留在 `/matchmaker` 並顯示錯誤；帳號入口最終顯示 B 的名稱；以 B 讀取 `GET /api/matchmaker/slots` 為空清單
- **驗收**：`nextjs-pickball/tests/e2e/user-data/account-switch.spec.ts`，test 名稱「另一分頁換成帳號 B 後，本分頁進入計分板不會在 B 建立分槽」

#### Scenario: 換帳號 E2E：經前端 proxy 的請求帶上目前帳號

- **GIVEN** 已以 A 登入，開啟 `/scoreboard`
- **WHEN** 頁面送出 `GET /api/scoreboard/current`
- **THEN** 該請求的 `x-expected-user-id` 等於 `GET /api/session` 回傳的 `user.id`，回應為 200
- **驗收**：`nextjs-pickball/tests/e2e/user-data/account-switch.spec.ts`，test 名稱「使用者資料請求經前端 proxy 帶上目前帳號的標頭」

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
- **THEN** 回 200；兩表筆數分別為 300 與 2,000，且列的順序與 `match_id` 依陣列順序
- **AND** 另一次匯入的單段 JSON 參數超過 D1 單一參數上限（2MB）時回 500，且該使用者在各使用者資料表與 `sync_batch_guards` 皆無任何列（整批回滾；非守衛錯誤不被分類為 409）
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
