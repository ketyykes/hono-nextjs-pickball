## MODIFIED Requirements

### Requirement: E2E 登入夾具

`nextjs-pickball/playwright.config.ts` SHALL 設定 `globalSetup: "./tests/e2e/global-setup.ts"`。Playwright 先啟動 `webServer`
再執行 `globalSetup`，因此 setup 內可以呼叫前端 origin。`global-setup.ts` MUST：

1. 以 B2 的 `tests/e2e/helpers/test-account.ts` 讀取測試帳密（`readTestAccount()`，或需要列出缺少的變數名稱時用 `readTestAccountResult()`）；缺帳密時，
   刪除舊的 storage state 檔（若存在）、以 `console.warn` 說明缺少的變數後直接結束，SHALL NOT 讓整個 E2E 失敗——既有訪客 E2E 不依賴登入。
2. 否則呼叫 `ensureTestAccountSeeded()`（本機 migration＋seed），再以 Playwright `request.newContext({ baseURL: "http://localhost:3005" })`
   帶 `Origin: http://localhost:3005` 對 `/api/auth/sign-in/email` 登入，成功後 `storageState({ path: "tests/e2e/.auth/test-account.json" })`。
   登入失敗 MUST throw（帳密齊備卻登不進去是真問題，不得吞掉）。

既有五個瀏覽器 project（`chromium`、`firefox`、`webkit`、`mobile-chrome`、`mobile-safari`）的 `use` SHALL NOT 設定 `storageState`——既有 E2E 一律維持訪客。需要登入態的 spec SHALL 以
`test.use({ storageState: "tests/e2e/.auth/test-account.json" })` 取用；需要「獨立 session」的情境（登入流程、登出）SHALL 以全新 context 走登入頁，
SHALL NOT 對共用 storage state 的 session 執行登出（會讓其他使用該 state 的測試失效）。

需要登入態或測試帳密的 spec 在 storage state 檔不存在時 MUST `test.skip` 並在原因中寫明「需要 hono-pickball/.dev.vars 的 TEST_ACCOUNT_* 與 ENVIRONMENT=development」。
change 的驗收執行時 `.dev.vars` MUST 齊備，skip 不算通過。

`nextjs-pickball/.gitignore` MUST 含 `/tests/e2e/.auth/`（storage state 內含 session token）。

**使用者資料 E2E**（D6；自 `scoreboard-backend` 起）：會讀寫雲端使用者資料的 spec SHALL 放在 `nextjs-pickball/tests/e2e/user-data/`，
並只由第六個 project `user-data` 執行：該 project MUST 設定 `testDir: "./tests/e2e/user-data"`、`workers: 1`、`fullyParallel: false`、
`use: { ...devices["Desktop Chrome"] }`（不在 project 層設定 `storageState`，spec 仍以 `test.use` 取用）。
所有使用者資料 spec 共用同一個測試帳號，`workers: 1` 讓它們在任何執行方式下（含 `pnpm test:e2e` 的預設平行）都不會同時改同一份資料；
既有五個 project 的 `testDir` 沿用 top-level 的 `./tests/e2e/specs`，因此**不需要也 SHALL NOT** 為此修改既有 project 的設定。

`nextjs-pickball/tests/e2e/helpers/user-data.ts` SHALL 匯出 `clearTestAccountUserData()`：以
`pnpm --dir <hono-pickball> exec wrangler d1 execute DB --local --env local --command "<SQL>"` 刪除
`@pickball/core/api/user-data-tables` 的 `USER_DATA_TABLES` 中、`user_id` 屬於測試帳號（以 `.dev.vars` 的 email 經子查詢 `SELECT id FROM user WHERE email = ...` 取得）的所有列。
它 SHALL NOT 刪除 `user`、`session`、`account`、`verification` 的任何列——刪 user 會 cascade 刪除 session，讓 globalSetup 存下的 storage state 失效；
SHALL NOT 新增任何 reset API。email 放進 SQL 字串前 MUST 跳脫單引號。每個使用者資料 spec MUST 在 `test.beforeEach` 呼叫它，使每個 test 從空的雲端資料開始。

#### Scenario: 帳密齊備時產生 storage state

- **GIVEN** `.dev.vars` 齊備
- **WHEN** 執行任一 E2E（例：`pnpm --filter ./nextjs-pickball exec playwright test --workers=1 tests/e2e/specs/auth-session.spec.ts`）
- **THEN** `nextjs-pickball/tests/e2e/.auth/test-account.json` 存在且含一個名稱以 `better-auth.session_token` 結尾的 cookie；`git status --porcelain` 不列出該檔
- **驗收**：tasks.md 指令驗收 C3 的實測紀錄

#### Scenario: 缺帳密時既有 E2E 照常執行、登入 spec 明確 skip

- **GIVEN** 暫時移除 `.dev.vars`
- **WHEN** 執行 `pnpm --filter ./nextjs-pickball exec playwright test --workers=1 tests/e2e/specs/api-health.spec.ts tests/e2e/specs/auth-session.spec.ts`
- **THEN** `api-health.spec.ts` 照常通過；`auth-session.spec.ts` 全數 skipped 且 skip 原因含「TEST_ACCOUNT_」；指令 exit 0
- **驗收**：tasks.md 指令驗收 C4 的實測紀錄

#### Scenario: 既有 project 維持訪客

- **WHEN** 檢查 `nextjs-pickball/playwright.config.ts`
- **THEN** 既有五個瀏覽器 project 的 `use` 皆不含 `storageState`、皆未設定 `testDir`，top-level `use` 亦不含 `storageState`；`user-data` project 的 `use` 亦不含 `storageState`
- **驗收**：tasks.md 指令驗收 C5（閱讀紀錄）

#### Scenario: 使用者資料 spec 只在 user-data project 執行

- **WHEN** 執行 `pnpm --filter ./nextjs-pickball exec playwright test --list`
- **THEN** `tests/e2e/user-data/` 下的 test 只出現在 `[user-data]`；`[user-data]` 沒有 `tests/e2e/specs/` 下的 test；既有五個 project 的 test 數與本 change 前相同（另加本 change 新增的訪客 spec）
- **驗收**：tasks.md 指令驗收的 `--list` 紀錄

#### Scenario: 清空使用者資料不影響登入態

- **GIVEN** `.dev.vars` 齊備、storage state 已由 globalSetup 產生，測試帳號已有雲端計分板資料
- **WHEN** 呼叫 `clearTestAccountUserData()` 後以 storage state 開啟 `/scoreboard`
- **THEN** 計分板為初始比分（雲端資料已清空）且 `data-sync-status` 為 `synced`（session 仍有效，未退回本機模式）
- **驗收**：`nextjs-pickball/tests/e2e/user-data/scoreboard-sync.spec.ts`，test 名稱「清空使用者資料後仍為登入態且雲端為初始比分」
