# Proposal: user-data-account-guard

## Why

同一瀏覽器的兩個分頁共用同一個 better-auth session cookie：分頁 2 登出後改以帳號 B 登入，分頁 1 仍以帳號 A 的畫面與 store 狀態運作，
但它送出的每個請求在後端都以 **B 的身分**通過 `requireSession`——不會回 401，既有「401 → `session.refresh()`」流程不會啟動。
結果是分頁 1 把 A 的計分、名單、回合、分槽與送出比分**寫進 B 的雲端資料**（`POST /api/matchmaker/reset` 甚至會刪光 B 的名單、回合、分槽與歷史），
讀取時也以「已登入：A」顯示 B 的資料（B5 design OQ10、B6 design OQ6、B7 design OQ8 皆記為「G1 前必修」）。
B7 已合併並 archive（`5cdf647`），雲端端點擴大到 13 條；在 B8（歷史讀取）與 B9（`POST /api/import`）再增加入口之前，先把防線建好（runbook 記為 **B7.5**）。

**前提**：B4～B7 皆已合併並 archive（`user-data-sync` 主 spec 含多筆契約與整批守衛；`/api/matchmaker/{round,slots,…/score}`、
`useRemoteRoundStore`、`useRemoteMatchSlotStore`、`lib/sync/round-api.ts`、`lib/sync/round-command-queue.ts`、`CourtCard` 的雲端建立分槽皆已存在）。

## What Changes

**核心套件**
- `@pickball/core/api/errors` 的 `API_ERROR_CODES` 加 `ACCOUNT_MISMATCH`。
- 新模組 `@pickball/core/api/headers`：`EXPECTED_USER_ID_HEADER = "X-Expected-User-Id"`（前後端共用；`CORE_MODULES` 加一項）。

**後端**
- 新 middleware `hono-pickball/src/auth/require-expected-user.ts`（`requireExpectedUser`）：請求標頭 `X-Expected-User-Id` **缺少或不等於** session 的 `user.id` 時回
  `401 { "error": "ACCOUNT_MISMATCH" }`，不執行 validator 與 handler（**含 GET**，fail-closed）。
- `src/routes/scoreboard.ts`、`src/routes/matchmaker.ts` 的 sub-app 開頭改為 `use("*", localAuth, requireSession, requireExpectedUser)`：
  B5 的 2 條、B6 的 5 條與 B7 的 6 條（`GET／PUT /round`、`GET /slots`、`GET／PUT /slots/:matchId`、`POST /round/matches/:matchId/score`）全數受保護。
  `requireSession`、`GET /api/me`、`/api/session`、`/api/auth/*` 不變。
- 新測試以 `app.routes` 列舉所有使用者資料路由逐條驗證，之後的 change（B8、B9）新增端點而漏掛守衛時必然紅燈。
- seed 腳本另建一個由測試帳號 email 衍生（plus addressing、同密碼）的第二帳號，供換帳號 E2E 使用；**不新增 `.dev.vars` 變數**。

**前端**
- `requestJson` 的 options 新增**必填** `expectedUserId`，每個請求（含 GET）帶 `X-Expected-User-Id`；`requestJson` 不讀 session store。
- API 薄包裝（`lib/sync/roster-api.ts`、`lib/sync/round-api.ts`、`lib/matchmaker/remote-transfer.ts`）以第一參數接收 `expectedUserId`；
  `round-command-queue.ts` 的 `putRound`／`submitScore` 改為「已綁定帳號」的函式型別。
- 四支雲端 hook（`useRemoteScoreboardStore`、`useRemoteRosterStore`、`useRemoteRoundStore`、`useRemoteMatchSlotStore`）新增 `userId` option：
  以「世代」為單位（主 effect 依賴加 `userId`），世代內每個請求帶該世代的帳號；換帳號時丟棄舊世代的待送、重試與在途結果（不呼叫跨 store port），以新帳號重新載入；
  換帳號的那一次 render 起不回傳前一帳號的資料。
- 三個選擇器（`useScoreboardStore`、`useRosterStore`、`useRoundStore`）把 `useSession()` 的 user id 傳給雲端 hook。
- 一次性雲端操作（參賽者 CSV 雲端匯入、JSON 雲端匯出、`CourtCard` 建立分槽）以觸發當下 `useSession()` 的 user id 呼叫；收到 401 時另呼叫 `session.refresh()`。

**E2E**：新 spec `tests/e2e/user-data/account-switch.spec.ts`（同一 context 以衍生帳號登入覆寫 cookie，模擬「另一分頁換帳號」）；
`tests/e2e/helpers/user-data.ts` 的 `clearTestAccountUserData()` 涵蓋第二帳號、新增 `expectedUserHeaders()`；`roster-sync.spec.ts`、`round-sync.spec.ts` 直接打 API 處帶標頭。

**文件**：`hono-pickball/CLAUDE.md`（使用者資料 API 的 middleware 鏈、授權覆蓋表改四類、curl 範例帶標頭、seed 建兩個帳號）、`nextjs-pickball/CLAUDE.md`（`lib/sync` 與雲端 hook 的帳號世代、E2E 第二帳號）。

**BREAKING**（僅對直接呼叫 API 者）：所有使用者資料端點在缺少 `X-Expected-User-Id` 時回 401——人工 curl、後端測試與 E2E 直接打 API 都必須帶標頭。瀏覽器使用者路徑不受影響。

## Capabilities

### New Capabilities

（無）

### Modified Capabilities

- `user-data-sync`：MODIFIED「使用者資料 API 的路由、授權與停用閘門」（middleware 鏈加 `requireExpectedUser`、授權覆蓋改為四類）；
  ADDED「使用者資料請求的預期帳號守衛」「前端使用者資料請求帶預期帳號」「雲端 store 以登入帳號為界」「另一分頁換帳號時本分頁不寫入新帳號」。
- `auth`：ADDED「換帳號用的衍生測試帳號」（seed 另建衍生帳號）。
- `dev-workflow`：ADDED「換帳號 E2E 夾具」（清空資料涵蓋第二帳號、`expectedUserHeaders()`、以衍生帳號覆寫 cookie 的規則）。

`scoreboard`／`player-roster`／`round-lifecycle`／`data-transfer` 主 spec 中雲端 hook 的參數列與一次性操作**不重寫**（coordinator 裁定 Q9），
由 `user-data-sync`「雲端 store 以登入帳號為界」統一補充；`pickball-core` 新增模組屬既有 Requirement 允許的範圍，不需 delta。不新增 hook，`pickleball-guide-page` 不變。

## Impact

- **後端**：新增 `src/auth/require-expected-user.ts`；修改 `src/routes/{scoreboard,matchmaker}.ts`（各一行）、`src/db/seed/test-account.ts`、`scripts/seed-test-account.ts`；
  新增 `test/expected-user-guard.test.ts`；機械修改 `test/helpers/{session,matchmaker-fixtures}.ts` 與既有測試檔內的本地請求 helper／inline 請求（只加標頭）。
- **核心套件**：`src/api/errors.ts`、新增 `src/api/headers.ts`、`test/api/{errors,headers}.test.ts`、`test/module-boundary.test.ts`。
- **前端**：`lib/sync/{api-client,roster-api,round-api,round-command-queue}.ts`、`lib/matchmaker/remote-transfer.ts`、
  `hooks/{useRemoteScoreboardStore,useRemoteRosterStore,useRemoteRoundStore,useRemoteMatchSlotStore,useScoreboardStore,useRosterStore,useRoundStore}.ts`、
  `components/matchmaker/{CourtCard,JsonBackupSection,RosterCsvImportSection}.tsx` 與對應測試；本機 hook 本體、訪客路徑零變更。
- **E2E**：`tests/e2e/helpers/{test-account,user-data}.ts`、新 `tests/e2e/user-data/account-switch.spec.ts`、`roster-sync.spec.ts`／`round-sync.spec.ts`（只改直接 API 呼叫的 headers）。
- **API**：使用者資料端點新增必要請求標頭；錯誤碼多一個；路由、schema、資料表皆不變，**無 migration**。
- **相依**：不新增任何第三方相依。**`.dev.vars`**：不新增變數。
- **後續 change**：B8（`GET /api/matchmaker/history`）、B9（`POST /api/import`）須掛同一 middleware、前端呼叫帶 `expectedUserId`（design「交接給 B8／B9」）。
