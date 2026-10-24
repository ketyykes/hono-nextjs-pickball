# user-data-sync Specification

## Purpose
TBD - created by archiving change scoreboard-backend. Update Purpose after archive.

## Requirements

### Requirement: 使用者資料 API 的路由、授權與停用閘門

所有讀寫使用者資料的後端端點 SHALL 掛在 `/api/<feature>/...` 之下，以 `hono-pickball/src/routes/<feature>.ts` 的 Hono sub-app 實作，
並以 `app.route("/api/<feature>", <sub-app>)` 掛載。sub-app MUST 以 `use("*", localAuth, requireSession)` 保護其下所有路由：

- `localAuth` SHALL 位於 `hono-pickball/src/auth/local-auth-middleware.ts`，是 `/api/auth/*`、`/api/me` 與所有使用者資料 API **共用的唯一**停用閘門：
  `isLocalAuthEnabled(env)` 為假時 MUST 回 `404`，且 SHALL NOT 建立 auth 實例、SHALL NOT 觸碰 D1（D4：正式站在 G1 前行為與現在相同）。
- `requireSession` 無有效 session 時 MUST 回 `401 { "error": "UNAUTHORIZED" }`。
- 端點 MUST 只以 `c.var.user.id` 決定讀寫哪一位使用者的資料；SHALL NOT 從 path、query 或 body 接受使用者 id。

Hono 型別參數 SHALL 分為兩層：`AuthAppEnv`（`Variables` 只有 `auth`）與 `SessionAppEnv`（再加 `user`、`session`）。
`requireSession` MUST 以 `createMiddleware<SessionAppEnv>` 宣告，使未經 `requireSession` 的 handler 讀取 `c.var.user` 成為型別錯誤
（B2 時兩者為同一型別，漏掛 middleware 不會被 tsc 發現）。

每個使用者資料端點 MUST 在 `hono-pickball/test/` 各有至少一個測試涵蓋三類情境：**未登入回 401**、**存取他人資料被拒**（以另一位使用者的 cookie 讀不到、改不到本人資料）、
**auth 停用回 404**（以 `app.request(path, init, { ...env, ENVIRONMENT: undefined, DB: undefined })` 注入，證明不觸碰 D1）。
各 change 的 test-plan.md MUST 附「後端 API 授權覆蓋表」逐端點列出這三類測試的 it 名稱。

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
