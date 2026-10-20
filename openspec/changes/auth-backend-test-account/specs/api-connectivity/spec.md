## ADDED Requirements

### Requirement: better-auth 的 session cookie 經 proxy 原樣穿透

本機登入啟用時，瀏覽器對前端 origin 發出的 `POST /api/auth/sign-in/email` 經 `nextjs-pickball/app/api/[[...route]]/route.ts`
與 `HONO_API` service binding 轉發後，hono-pickball 發出的 `Set-Cookie: better-auth.session_token=…` MUST 原樣回到瀏覽器，
落在前端 origin（`http://localhost:3005`）；之後同一瀏覽器 context 對 `/api/me` 的請求 MUST 帶回該 cookie 並取得本人資料。

此為 `GET /api/cookie-check` 契約所預告的「未來 better-auth 直接依賴此行為」的兌現。驗收走真實的前後端兩個 dev server，
proxy 程式碼 SHALL NOT 為此修改（`route.ts` 既有的 headers 原樣轉發已足夠；若 E2E 失敗，先依 root `CLAUDE.md` 排查重複的 dev server）。

本 E2E 依賴開發者本機的 `hono-pickball/.dev.vars`（`ENVIRONMENT=development` 與測試帳密）與已 seed 的本機 D1；
缺 `.dev.vars` 測試帳密時 MUST 以 `test.skip` 跳過並在原因中寫明缺少的變數，SHALL NOT 靜默通過。
驗收執行時 `.dev.vars` MUST 齊備（skip 不算通過）。

#### Scenario: 經 proxy 登入後取得 session cookie 並可呼叫 /api/me

- **GIVEN** 前後端 dev server 皆已啟動，本機登入啟用，測試帳號已 seed
- **WHEN** Playwright 的 `request` context 以 `Origin: http://localhost:3005` 對 `http://localhost:3005/api/auth/sign-in/email` 送出正確帳密，接著對 `http://localhost:3005/api/me` 發出 GET
- **THEN** 登入回應 status 200 且 `Set-Cookie` 含 `better-auth.session_token=` 與 `HttpOnly`；`/api/me` 回 200，`user.email` 等於測試帳號
- **驗收**：`nextjs-pickball/tests/e2e/specs/auth-proxy.spec.ts`，test 名稱「經 proxy 登入後 session cookie 落在前端 origin 並可取得 /api/me」

#### Scenario: 經 proxy 呼叫 /api/session 回 200

- **GIVEN** 前後端 dev server 皆已啟動
- **WHEN** 不帶 cookie 對 `http://localhost:3005/api/session` 發出 GET
- **THEN** status 200，body 含布林值 `authEnabled` 與 `user: null`
- **驗收**：`nextjs-pickball/tests/e2e/specs/auth-proxy.spec.ts`，test 名稱「經 proxy 呼叫 /api/session 未登入時回 200 與 user null」
