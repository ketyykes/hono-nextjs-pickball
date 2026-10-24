# Specification: dev-workflow

## ADDED Requirements

### Requirement: 換帳號 E2E 夾具

本 Requirement 補充「E2E 登入夾具」：

- `nextjs-pickball/tests/e2e/helpers/test-account.ts` SHALL 以與 `deriveSwitchAccountEmail` **相同的規則**（前端與後端不共用 src，各寫一份）提供衍生第二帳號的帳密，
  並提供「在既有 context 內以第二帳號登入」的 helper：以 `context.request` 帶 `Origin: http://localhost:3005` 呼叫 `/api/auth/sign-in/email`，覆寫同一 origin 的 session cookie。
  登入不會撤銷原 session（better-auth 未啟用 multi-session），因此不違反「SHALL NOT 對共用 storage state 的 session 執行登出」。以衍生帳密登入失敗 MUST throw（seed 與 helper 的規則漂移時立即現形），SHALL NOT `test.skip`。
- 第二帳號由 globalSetup 既有的 `ensureTestAccountSeeded()` 一併建立；SHALL NOT 新增 spec 自行 seed 的路徑，也 SHALL NOT 為第二帳號另存 storage state。
- `nextjs-pickball/tests/e2e/helpers/user-data.ts` 的 `clearTestAccountUserData()` MUST 刪除 `USER_DATA_TABLES` 中 `user_id` 屬於測試帳號**或其衍生的第二帳號**的所有列
  （子查詢 `SELECT id FROM user WHERE email IN (...)`，兩個 email 皆跳脫單引號）；仍 SHALL NOT 刪除 `user`、`session`、`account`、`verification` 的任何列。
- 同檔 SHALL 匯出 `expectedUserHeaders(request)`：以傳入的 Playwright `APIRequestContext` 呼叫 `GET /api/session` 取得目前 user id，回傳 `{ "X-Expected-User-Id": <id> }`；
  取不到 user 時 MUST throw。spec 以 `page.request`／`context.request` 直接呼叫使用者資料 API 時 MUST 帶上它（否則依 `user-data-sync`「使用者資料請求的預期帳號守衛」回 401）。

#### Scenario: 換帳號夾具：清空使用者資料涵蓋衍生帳號

- **GIVEN** 測試帳號與其衍生的第二帳號都已有雲端資料（由前一個 test 留下）
- **WHEN** `beforeEach` 呼叫 `clearTestAccountUserData()` 後，以第二帳號讀取雲端計分板
- **THEN** 為 `{ data: null, version: 0 }`；測試帳號的 storage state 仍可使用（頁面 `data-sync-status` 可達 `synced`）
- **驗收**：`nextjs-pickball/tests/e2e/user-data/account-switch.spec.ts`，test「另一分頁換成帳號 B 後，本分頁的計分不會寫入 B 且改以 B 的資料重新載入」以「切換後 B 讀到初始計分板」為前置斷言

#### Scenario: 換帳號夾具：既有 spec 直接呼叫 API 時帶預期帳號標頭

- **GIVEN** 後端已掛預期帳號守衛
- **WHEN** 執行 `pnpm --filter ./nextjs-pickball exec playwright test --workers=1 --project=user-data`
- **THEN** `roster-sync.spec.ts` 與 `round-sync.spec.ts` 中以 `page.request` 直接呼叫使用者資料 API 的 test 全數通過（皆帶 `expectedUserHeaders()`），整個 project 0 failed、0 skipped
- **驗收**：tasks.md 指令驗收 C4 的實跑紀錄
