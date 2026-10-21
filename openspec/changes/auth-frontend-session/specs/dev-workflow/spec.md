## ADDED Requirements

### Requirement: E2E 登入夾具

`nextjs-pickball/playwright.config.ts` SHALL 設定 `globalSetup: "./tests/e2e/global-setup.ts"`。Playwright 先啟動 `webServer`
再執行 `globalSetup`，因此 setup 內可以呼叫前端 origin。`global-setup.ts` MUST：

1. 以 B2 的 `tests/e2e/helpers/test-account.ts` 讀取測試帳密（`readTestAccount()`，或需要列出缺少的變數名稱時用 `readTestAccountResult()`）；缺帳密時，
   刪除舊的 storage state 檔（若存在）、以 `console.warn` 說明缺少的變數後直接結束，SHALL NOT 讓整個 E2E 失敗——既有訪客 E2E 不依賴登入。
2. 否則呼叫 `ensureTestAccountSeeded()`（本機 migration＋seed），再以 Playwright `request.newContext({ baseURL: "http://localhost:3005" })`
   帶 `Origin: http://localhost:3005` 對 `/api/auth/sign-in/email` 登入，成功後 `storageState({ path: "tests/e2e/.auth/test-account.json" })`。
   登入失敗 MUST throw（帳密齊備卻登不進去是真問題，不得吞掉）。

既有五個 project 的 `use` SHALL NOT 設定 `storageState`——既有 E2E 一律維持訪客。需要登入態的 spec SHALL 以
`test.use({ storageState: "tests/e2e/.auth/test-account.json" })` 取用；需要「獨立 session」的情境（登入流程、登出）SHALL 以全新 context 走登入頁，
SHALL NOT 對共用 storage state 的 session 執行登出（會讓其他使用該 state 的測試失效）。

需要登入態或測試帳密的 spec 在 storage state 檔不存在時 MUST `test.skip` 並在原因中寫明「需要 hono-pickball/.dev.vars 的 TEST_ACCOUNT_* 與 ENVIRONMENT=development」。
change 的驗收執行時 `.dev.vars` MUST 齊備，skip 不算通過。

`nextjs-pickball/.gitignore` MUST 含 `/tests/e2e/.auth/`（storage state 內含 session token）。

D6 所述「每個 spec 檔開頭以 `wrangler d1 execute --local` 清空測試帳號的使用者資料」在出現第一張使用者資料表的 change 才實作，本 Requirement 不涵蓋。

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
- **THEN** 五個 project 的 `use` 皆不含 `storageState`，top-level `use` 亦不含
- **驗收**：tasks.md 指令驗收 C5（閱讀紀錄）
