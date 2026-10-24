# Tasks: user-data-account-guard

> **TDD 三步**（root `CLAUDE.md`）：RED（先寫失敗測試，以單檔指令在 shell 實際看到紅燈並貼出輸出）→ GREEN（最小實作至綠）→ REFACTOR（無壞味道註記 skipped）。
> 單檔指令：前端 `pnpm --filter ./nextjs-pickball test --run <path>`；後端 `pnpm --filter ./hono-pickball test --run test/<檔>.test.ts`；
> 核心 `pnpm --filter ./packages/pickball-core test --run test/<檔>.test.ts`。**`--run` 前不可加 `--`**。
>
> **紅燈要是真的**：加入即綠者 MUST 誠實標註 regression guard，**SHALL NOT 用「改斷言看紅再改回」偽造紅燈**。
> 一個 RED task 可一次寫入多個 it（皆須在 GREEN 前實際看到紅），會先綠的 it 必須在紀錄中逐一點名並標 regression guard。
> E2E 為**驗收型 RED**：§4 寫入並以 `--project=user-data` 實跑看到紅，GREEN 在 §9（前後端皆完成後）轉綠。
>
> **標註**：`TDD`；`regression guard`；`設定層`（`tests/**` 與 `hono-pickball/test/helpers/**` helper、seed 腳本 I/O、文件）；`例外層`（純呈現或 I/O 樣板元件，以 E2E 或閱讀驗收）；`驗收（指令）`（test-plan C1～C10）。
>
> **前提**：B4～B7 皆已合併回 `main` 並 archive（B7 archive `5cdf647`）。**不新增任何第三方相依**；**禁止任何遠端 CF 操作**（`wrangler d1` 一律 `--local --env local`）；不 push；不改 `.dev.vars`。
> 測試帳密不得寫進任何會被 commit 的檔案或訊息。it／test 名稱 MUST 與 delta spec「驗收」錨點逐字一致；測試一律顯式匯入。
> E2E、lint、全套 `pnpm test`、build 前先 `/tmp/heavy-lock.sh acquire nextjspickball "<說明>"`，跑完 release；load ≥ 20 時等待。
>
> **訪客路徑零迴歸**：本機實作（`useLocalScoreboardStore`、`useLocalRosterStore`、`useLocalRoundStore` 本體）、`lib/auth/session-store.ts`、`app/api/[[...route]]/route.ts`、`requireSession`、`GET /api/me` 一行不改。
>
> **允許修改的既有測試檔（只允許三種改動：呼叫處新增 `expectedUserId`／`userId` 參數、請求加 `X-Expected-User-Id` 標頭、新增 `vi.mock` 區塊與新 it；SHALL NOT 改 it 名稱、斷言與其他輸入；C10 以 `git diff` 逐行確認）**：
> - 後端：`test/helpers/session.ts`、`test/helpers/matchmaker-fixtures.ts`、`test/scoreboard-current.test.ts`（本地 helper 與 inline 請求）、`test/matchmaker-players.test.ts`（本地 helper 與 inline 請求）、
>   `test/matchmaker-round.test.ts`／`test/matchmaker-slots.test.ts`／`test/matchmaker-score.test.ts`（僅 §1.2 盤點出的 inline 請求）、`test/seed-test-account.test.ts`（新 it）
> - 核心：`test/module-boundary.test.ts`（`CORE_MODULES` 加一項）
> - 前端：`lib/sync/api-client.test.ts`、`lib/sync/roster-api.test.ts`、`lib/sync/round-api.test.ts`、`lib/sync/round-command-queue.test.ts`、`lib/matchmaker/remote-transfer.test.ts`、
>   `hooks/useRemoteScoreboardStore.test.tsx`、`hooks/useRemoteRosterStore.test.tsx`、`hooks/useRemoteRoundStore.test.tsx`、`hooks/useRemoteMatchSlotStore.test.tsx`、
>   `hooks/useScoreboardStore.test.tsx`、`hooks/useRosterStore.test.tsx`、`hooks/useRoundStore.test.tsx`、`components/matchmaker/CourtCard.test.tsx`
> - E2E：`tests/e2e/user-data/roster-sync.spec.ts`、`tests/e2e/user-data/round-sync.spec.ts`（只改直接 API 呼叫的 headers）
>
> **雲端 hook 既有 it 的注意事項**：GREEN 後「`enabled` 為 true 但 `userId` 為 null 視同停用」，vitest 不做型別檢查——既有 hook it 若未在呼叫處補 `userId` 會因不發請求而轉紅，MUST 與 GREEN 同一個 commit 補上。

## 1. 對齊 main＋查證（不寫產品程式碼）

- [x] 1.1 驗收（指令）：確認分支 `change/user-data-account-guard`、工作樹乾淨；`pnpm install` 後 lockfile 零變動；`db:migrate:local`、`db:seed:local` 成功；
  持鎖跑 `pnpm test` baseline（三個 workspace）、三段 typecheck、`pnpm lint`；`playwright test --list` 各 project 數量；回填 environment.md Verification 並 commit
- [ ] 1.2 對齊 B7 實際落地並盤點機械改動點：`lib/sync/{api-client,roster-api,round-api,round-command-queue}.ts` 簽章、四支雲端 hook 的 options 與主 effect 依賴、三個選擇器、
  `CourtCard` 雲端建立分槽、`JsonBackupSection`／`RosterCsvImportSection`、`remote-transfer.ts`；`rg -n "Cookie:|exports.default.fetch|app.request\(" hono-pickball/test` 與 `rg -n "requestJson\(|page.request|context.request" nextjs-pickball` 逐一列表（哪些需要帶標頭、哪些在守衛之前結束而不需要）。
  比對本 change MODIFIED「使用者資料 API 的路由、授權與停用閘門」與目前主 spec 的既有段落與四個 Scenario，若有差異以主 spec 為底重新套用並 commit。與 design Context 不同處記入 design「apply §1 查證紀錄」
- [ ] 1.3 一次性實測（不 commit）：Hono `app.routes` 是否含經 `app.route()` 掛載的 sub-app 路由、路徑是否已合併前綴、`use()` 的 method 是否為 `ALL`、是否出現自動 HEAD；
  better-auth 登入回應 body 是否含 `user.id`；同一 cookie jar 以第二帳號登入後，第一帳號的 session token 是否仍有效。結果記入查證紀錄（決定 design Decision 4、10 是否走退路）
- [ ] 1.4 Context7 查證（附 library ID 記入查證紀錄）：`/better-auth/better-auth/v1.6.23`（無 multi-session 時再次登入覆寫 cookie、不撤銷舊 session）；`/websites/hono_dev`（`app.routes`、`createMiddleware`、`c.req.header` 不分大小寫）

## 2. 核心套件：錯誤碼與標頭常數

Depends on: §1

- [ ] 2.1 RED（TDD）：新增 `packages/pickball-core/test/api/errors.test.ts`「API_ERROR_CODES 恰為四個錯誤碼且值等於鍵名」、`test/api/headers.test.ts`「EXPECTED_USER_ID_HEADER 為 X-Expected-User-Id」。確認兩者皆紅並貼輸出
- [ ] 2.2 GREEN（TDD）：`src/api/errors.ts` 加 `ACCOUNT_MISMATCH`；新增 `src/api/headers.ts`；`test/module-boundary.test.ts` 的 `CORE_MODULES` 加 `api/headers`（24 項）。
  驗收（指令）：核心全套綠、`pnpm --filter ./packages/pickball-core typecheck` exit 0

## 3. 後端：測試 helper 先帶標頭（設定層）

Depends on: §2

- [ ] 3.1 設定層（tests helper）：`test/helpers/session.ts` 的 `signIn` 記錄 cookie → user id 並匯出 `expectedUserHeader(cookie)`（design Decision 10；取得 user id 的方式依 1.3 結果）；
  `test/helpers/matchmaker-fixtures.ts` 的 `request()`／`appRequestInit()` 有 cookie 時自動帶 `X-Expected-User-Id`（標頭名取自 `EXPECTED_USER_ID_HEADER`）；
  `scoreboard-current.test.ts`、`matchmaker-players.test.ts` 的本地 helper 與 1.2 盤點出的 inline 請求補標頭。**此時守衛尚未存在，後端全套必須照綠**（證明只是加標頭、未改行為）
- [ ] 3.2 驗收（指令）：後端全套通過數與 1.1 baseline 相同；`pnpm --filter ./hono-pickball typecheck` exit 0；`git diff main -- hono-pickball/test` 只見標頭與 helper 變更（C10 後端部分）

## 4. 衍生第二帳號、E2E 夾具與換帳號 E2E（驗收型 RED）

Depends on: §3

- [ ] 4.1 RED（TDD）：`hono-pickball/test/seed-test-account.test.ts` 新增「deriveSwitchAccountEmail 產生不同於原值且固定的 email」「衍生帳號與原帳號以同一組密碼皆可登入且為不同使用者」。確認紅燈
- [ ] 4.2 GREEN（TDD）：`src/db/seed/test-account.ts` 加 `deriveSwitchAccountEmail`（design Decision 9）。4.1 全綠
- [ ] 4.3 設定層（腳本 I/O）：`scripts/seed-test-account.ts` 以同一組密碼產生兩個帳號的 SQL（同一暫存檔、同一次 `--local --env local` 執行）。驗收（指令）C2
- [ ] 4.4 設定層（tests helper）：`tests/e2e/helpers/test-account.ts` 加同一衍生規則與「在既有 context 以第二帳號登入」helper（失敗 throw）；
  `tests/e2e/helpers/user-data.ts` 的 `clearTestAccountUserData()` 改清兩個帳號、新增 `expectedUserHeaders(request)`；
  `roster-sync.spec.ts`、`round-sync.spec.ts` 的 `page.request` 直接 API 呼叫改帶 `expectedUserHeaders(page.request)`（守衛尚未存在，持鎖跑 `--project=user-data` 既有 spec 必須照綠，證明只是加標頭）
- [ ] 4.5 RED（E2E 驗收型）：新增 `tests/e2e/user-data/account-switch.spec.ts` 的七個 test（spec「另一分頁換帳號時本分頁不寫入新帳號」錨點；`test.use({ storageState })`、`beforeEach` 呼叫 `clearTestAccountUserData()`）。
  持鎖以 `pnpm --filter ./nextjs-pickball exec playwright test --workers=1 --project=user-data tests/e2e/user-data/account-switch.spec.ts` 實跑並貼輸出：七條皆紅。
  守衛尚未存在，紅燈為真：計分、新增參賽者、重置、產生對戰四條因「本分頁的寫入進了 B」而紅；進入計分板一條因 409 被當成已存在而導向；
  「使用者資料請求經前端 proxy 帶上目前帳號的標頭」因標頭不存在而紅；「送出比分」一條的紅燈只來自狀態碼（預期 401 實得 409），依 design Open Questions 2 如實註明。GREEN 見 §9

## 5. 後端：預期帳號守衛

Depends on: §4

- [ ] 5.1 RED（TDD）：新增 `hono-pickball/test/expected-user-guard.test.ts` 的六個 it（spec「使用者資料請求的預期帳號守衛」錨點；13 條路由的樣本表與「B 先 seed 計分板、名單、回合含 pending 場次、分槽」的夾具，design Decision 4）。確認紅燈並貼輸出：
  「每條使用者資料路由在預期帳號與 session 不符時…」「缺少或空白的預期帳號標頭…」為真紅（守衛不存在時以 B 身分成功）；
  **「列舉出的使用者資料路由恰與守衛樣本表一致」「未登入回 UNAUTHORIZED、停用回 404…」「標頭與 session 相符時…」「非使用者資料路由不要求…」預期先綠——逐一點名標 regression guard**
- [ ] 5.2 GREEN（TDD）：新增 `src/auth/require-expected-user.ts`；`src/routes/scoreboard.ts`、`src/routes/matchmaker.ts` 的 `use("*", …)` 加上 `requireExpectedUser`。5.1 全綠；後端全套（含 B5～B7 既有測試）全綠
- [ ] 5.3 REFACTOR：樣本表與夾具的可讀性（例：樣本以端點表驅動）；無壞味道則註記 skipped
- [ ] 5.4 驗收（指令）：`pnpm --filter ./hono-pickball typecheck`（兩段）exit 0；持鎖 `pnpm --filter ./hono-pickball build` exit 0

## 6. 前端：requestJson 與 API 包裝

Depends on: §2（§6～§8 由同一位 Implementer 以同一張派工單連續完成，見 execution-plan）

- [ ] 6.1 RED（TDD）：`lib/sync/api-client.test.ts` 新增「每個請求帶 X-Expected-User-Id 標頭，有 body 時與 Content-Type 並存」「requestJson 只使用呼叫端給的 expectedUserId，不讀 session store」「401 ACCOUNT_MISMATCH 同樣分類為 unauthorized」；
  `roster-api.test.ts`、`round-api.test.ts` 各新增「包裝把 expectedUserId 交給 requestJson」。確認紅燈並貼輸出；
  **「401 ACCOUNT_MISMATCH 同樣分類為 unauthorized」預期先綠——點名標 regression guard**
- [ ] 6.2 GREEN（TDD）：`requestJson` 新增必填 `expectedUserId` 與標頭；`roster-api.ts`、`round-api.ts` 以第一參數接收；`round-command-queue.ts` options 改為已綁定帳號的函式型別（design Decision 6）；
  同步更新允許清單內既有測試的呼叫處（只加參數）。6.1 全綠。**前端 tsc 此時預期仍紅**（hook 與元件呼叫處在 §7～§8 補），不在此交件

## 7. 前端：雲端 hook 的帳號世代

Depends on: §6

- [ ] 7.1 RED（TDD）：四支雲端 hook 測試新增 spec「雲端 store 以登入帳號為界」中屬 hook 的 it——
  `useRemoteScoreboardStore.test.tsx`：「userId 變更時丟棄前一帳號的待送變更並以新帳號重新載入」「每個世代的請求一律帶該世代的帳號」「userId 變更的那一次 render 起不回傳前一帳號的資料」「enabled 為 true 但 userId 為 null 時不發出任何請求」；
  `useRemoteRosterStore.test.tsx`：同上四個；
  `useRemoteRoundStore.test.tsx`：「userId 變更時丟棄前一帳號的命令佇列並以新帳號重新載入」「userId 變更的那一次 render 起不回傳前一帳號的資料」「enabled 為 true 但 userId 為 null 時不發出任何請求」「換帳號後才回來的送出比分結果不呼叫 applyRemotePlayers」；
  `useRemoteMatchSlotStore.test.tsx`：「userId 變更時丟棄前一帳號的待送變更並以新帳號重新載入」「enabled 為 true 但 userId 為 null 時不發出任何請求」。確認紅燈並貼輸出
- [ ] 7.2 GREEN（TDD）：四支 hook 加 `userId` option、主 effect 依賴加 `userId`、世代閉包帶 `expectedUserId`（含 saver、命令佇列綁定函式、衝突重載、reset）、擁有者標記與 render 期判斷、舊世代結果不呼叫 port（design Decision 7）；
  既有 hook it 的呼叫處補 `userId`（同一 commit）。7.1 全綠、四支 hook 既有 it 全綠
- [ ] 7.3 REFACTOR：四支 hook 的擁有者判斷若重複，抽 `lib/sync/` 小工具（並為其補單元測試或以既有 hook it 覆蓋說明）；否則 skipped

## 8. 前端：選擇器與一次性雲端操作

Depends on: §7

- [ ] 8.1 RED（TDD）：`useScoreboardStore.test.tsx`、`useRosterStore.test.tsx`、`useRoundStore.test.tsx` 各新增「選擇器把 session 的 user id 傳給雲端 hook」；
  `lib/matchmaker/remote-transfer.test.ts` 新增「雲端匯入與備份的每個請求都帶呼叫端給的帳號」「雲端匯入與備份遇到 401 時以機器可讀欄位標示未授權」；
  `components/matchmaker/CourtCard.test.tsx` 新增 `vi.mock("@/hooks/useSession", …)`、`vi.mock("@/lib/sync/round-api", …)` 與「雲端建立分槽帶入目前帳號且未授權時刷新 session 並不導向」（design Open Questions 3）。確認紅燈並貼輸出
- [ ] 8.2 GREEN（TDD）：三個選擇器傳入 `userId`；`remote-transfer.ts` 以第一參數接收 `expectedUserId` 並加未授權欄位；`CourtCard` 以 `useSession()` 的 user id 呼叫 `putRemoteSlot`、未授權時 `refresh()`＋既有錯誤且不導向。8.1 全綠
- [ ] 8.3 例外層（元件呼叫）：`RosterCsvImportSection`、`JsonBackupSection` 以 `useSession()` 的 user id 呼叫 `importRemoteRoster`／`buildRemoteBackupSnapshot`，結果帶未授權欄位時呼叫 `refresh()`（design Decision 8、Open Questions 1；以 Stage 2 閱讀驗收）
- [ ] 8.4 驗收（指令）：持鎖 `pnpm test:web` 全綠；`pnpm -r exec tsc --noEmit` exit 0；`pnpm lint` 0 errors；`git diff main -- nextjs-pickball/hooks nextjs-pickball/lib nextjs-pickball/components` 的既有測試檔只見允許改動（C10 前端部分）

## 9. E2E 轉綠、文件與收尾

Depends on: §4、§5、§8

- [ ] 9.1 驗收（指令）C4：持鎖 `pnpm --filter ./nextjs-pickball exec playwright test --workers=1 --project=user-data` 全數 passed、0 skipped（§4.5 的七條轉綠，貼輸出；`roster-sync.spec.ts`、`round-sync.spec.ts`、`scoreboard-sync.spec.ts` 原樣通過）
- [ ] 9.2 驗收（指令）C9：WebKit／Safari 手動走一次登入態計分板（keepalive GET＋自訂標頭）並把結果記入本 task
- [ ] 9.3 設定層（文件）：`hono-pickball/CLAUDE.md`「使用者資料 API」改為 `use("*", localAuth, requireSession, requireExpectedUser)`、授權覆蓋表改四類、curl 範例帶 `X-Expected-User-Id`、`db:seed:local` 會建立兩個帳號、「後續 change 須知」加入 B8／B9 的守衛樣本表；
  `nextjs-pickball/CLAUDE.md` 的 `lib/sync` 與雲端 hook 實作要點（`requestJson` 的 `expectedUserId`、`userId` 世代與擁有者標記、一次性操作 refresh）、E2E 第二帳號與 `expectedUserHeaders()`
- [ ] 9.4 驗收（指令）：README 部署前檢查清單 lint → tsc（C1）→ 前端 unit → 核心 unit → 後端 unit（C6）→ 完整 E2E（C5，含 user-data）→ build（C7）→ `DO_NOT_TRACK=1 openspec validate user-data-account-guard --strict`（C8）；C10 全量 `git diff` 檢查。
  runbook 由 coordinator 更新（leader 不得改 runbook）
