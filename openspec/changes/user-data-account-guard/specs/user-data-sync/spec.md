# Specification: user-data-sync

## MODIFIED Requirements

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

## ADDED Requirements

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
