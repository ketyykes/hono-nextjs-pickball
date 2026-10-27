# Specification: auth

## ADDED Requirements

### Requirement: 換帳號用的衍生測試帳號

本 Requirement 補充「測試帳號以 seed 寫入本機 D1」：`hono-pickball/src/db/seed/test-account.ts` SHALL 另匯出 `deriveSwitchAccountEmail(email)`，
回傳由測試帳號 email 衍生、必定不同於原值且對同一輸入恆定的第二個 email（plus addressing：本地部分加上固定後綴；本地部分已含 `+` 時仍 MUST 產生不同的值），
供「另一分頁換帳號」的 E2E 使用。

`hono-pickball/scripts/seed-test-account.ts` SHALL 以同一組 `TEST_ACCOUNT_PASSWORD` 產生**兩個**帳號的 seed SQL（沿用 `buildTestAccountSeedSql`）：
原測試帳號，以及 `deriveSwitchAccountEmail(TEST_ACCOUNT_EMAIL)`（name 為 `TEST_ACCOUNT_NAME` 加上「（B）」），兩者寫入同一個暫存檔、以同一次 `wrangler d1 execute DB --local --env local --file` 執行。
腳本 SHALL NOT 新增任何 `.dev.vars` 變數（第二帳號完全由既有三個變數衍生）；既有的「只寫本機 D1」「SQL 不含明文密碼」「重複 seed 不產生重複使用者」規則對第二帳號同樣成立。

#### Scenario: 衍生測試帳號：衍生 email 必與原值不同且恆定

- **WHEN** 分別以 `tester@example.com` 與 `tester+x@example.com` 呼叫 `deriveSwitchAccountEmail`，各呼叫兩次
- **THEN** 回傳值皆含一個 `@` 且網域與輸入相同、皆不等於輸入，且同一輸入兩次結果相同
- **驗收**：`hono-pickball/test/seed-test-account.test.ts`，it 名稱「deriveSwitchAccountEmail 產生不同於原值且固定的 email」

#### Scenario: 衍生測試帳號：衍生帳號以同一組密碼可以登入

- **GIVEN** 把原 email 與其衍生 email 以同一組密碼產生的 seed SQL 套用到測試用 D1
- **WHEN** 分別以兩個 email 與該密碼呼叫 `POST /api/auth/sign-in/email`
- **THEN** 兩者皆回 200，且兩者的 `user.id` 不同
- **驗收**：`hono-pickball/test/seed-test-account.test.ts`，it 名稱「衍生帳號與原帳號以同一組密碼皆可登入且為不同使用者」

#### Scenario: 衍生測試帳號：seed 腳本建立原帳號與衍生帳號

- **GIVEN** `.dev.vars` 齊備，已執行 `db:migrate:local`
- **WHEN** 執行 `pnpm --filter ./hono-pickball db:seed:local` 兩次
- **THEN** 兩次皆 exit 0；`user` 表中原 email 與衍生 email 各恰 1 筆；兩個帳號都能以 `TEST_ACCOUNT_PASSWORD` 登入；腳本全檔不含 `--remote`
- **驗收**：tasks.md 指令驗收 C2（seed 後以 `wrangler d1 execute DB --local --env local` 計數、以 curl 登入兩個帳號的紀錄；紀錄不得含密碼值）
