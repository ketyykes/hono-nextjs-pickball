# Specification: api-connectivity

## MODIFIED Requirements

### Requirement: `/api/*` 經 service binding 原樣轉發

`nextjs-pickball/app/api/[[...route]]/route.ts` SHALL 將所有 `/api/*` 請求經 `HONO_API` service binding 轉發給 hono-pickball Worker，並 SHALL 支援 GET / POST / PUT / PATCH / DELETE / OPTIONS / HEAD 七個 method（全部指向同一個 handler）。

轉發時第一個參數 MUST 為原始的 `request.url` **字串**，SHALL NOT 傳入任何 `Request` 實例（連 `new Request()` 重建的也不行）。原因：`next dev` 下 `getCloudflareContext()` 取得的 binding 是 miniflare proxy，跨 realm 的 `Request` 物件會被字串化成 `[object Request]` 而拋 Invalid URL。

轉發的 init MUST 帶 `redirect: "manual"`：service binding 的 `fetch(url, init)` 依 Fetch API 隱含建立新的 `Request`，其 `redirect` 預設為 `follow`，會在前端 Worker 內自行跟隨後端回傳的 3xx，
瀏覽器因此收不到轉址與該回應上的 `Set-Cookie`（better-auth 的 OAuth callback 以 302 設定 session cookie 並導向 `callbackURL`，跟隨後 Google 登入無法完成）。
upstream 的 3xx MUST 連同 `Location` 與全部 `Set-Cookie` 原樣回到瀏覽器，由瀏覽器自行跟隨。

回傳 MUST 為在本 realm 重建的新 `Response`，並保留 upstream 的 `status` / `statusText` / `headers` / `body`。原因同上：miniflare 回傳的是 Next.js 認不得的跨 realm `Response`。

host 與 query string SHALL NOT 被改寫 —— 瀏覽器視角必須維持 same-origin，better-auth 的 `Set-Cookie` 才會直接落在前端 origin 而無跨域 cookie 問題。

#### Scenario: GET / HEAD 不帶 body 與 duplex

- **WHEN** 以 GET 或 HEAD 呼叫 proxy
- **THEN** 傳給 binding 的 init 中 `body` 為 `undefined` 且不存在 `duplex` 鍵
- **驗收**：`nextjs-pickball/app/api/[[...route]]/route.test.ts`，it 名稱「GET 請求不帶 body 也不帶 duplex」與「HEAD 請求不帶 body 也不帶 duplex」

#### Scenario: 有 body 的 method 帶 duplex: half

- **WHEN** 以 POST 呼叫 proxy 並帶 body
- **THEN** 傳給 binding 的 init 含 `body` 且 `duplex === "half"`（串流 request body 時 undici/workerd 的要求）
- **驗收**：`nextjs-pickball/app/api/[[...route]]/route.test.ts`，it 名稱「POST 請求帶 request.body 與 duplex: half」

#### Scenario: 七個 method 共用同一 handler

- **WHEN** 檢查 route 模組的匯出
- **THEN** GET / POST / PUT / PATCH / DELETE / OPTIONS / HEAD 全部指向同一個函式實例
- **驗收**：`nextjs-pickball/app/api/[[...route]]/route.test.ts`，it 名稱「PUT / PATCH / DELETE 皆走同一 proxy handler」

#### Scenario: URL 不被改寫且不傳 Request 實例

- **WHEN** 以 `https://example.com/api/health?probe=1` 呼叫 proxy
- **THEN** 傳給 binding 的第一參數為型別 `string` 且等於原 URL
- **驗收**：`nextjs-pickball/app/api/[[...route]]/route.test.ts`，it 名稱「轉發時第一參數為原始 request.url，host 與 query string 不被改寫」

#### Scenario: 回傳為本 realm 重建的 Response

- **WHEN** upstream 回傳 201 Created 並帶自訂 header 與 body
- **THEN** proxy 回傳的是**不同的** Response 實例，但 status / statusText / headers / body 完全保留
- **驗收**：`nextjs-pickball/app/api/[[...route]]/route.test.ts`，it 名稱「回傳的 Response 為新實例且保留 status / statusText / body」

#### Scenario: 轉發不在 proxy 內跟隨轉址

- **WHEN** 分別以 GET 與 POST 呼叫 proxy
- **THEN** 兩次傳給 binding 的 init 皆含 `redirect: "manual"`
- **驗收**：`nextjs-pickball/app/api/[[...route]]/route.test.ts`，it 名稱「轉發時以 redirect: manual 呼叫 binding，不在 proxy 內跟隨轉址」

#### Scenario: upstream 的轉址連同 Location 與 Set-Cookie 原樣回傳

- **WHEN** upstream 回傳 302、`Location: http://localhost:3005/`，並帶兩個 `Set-Cookie`
- **THEN** proxy 回傳的 status 為 302、`Location` 相同，且 `headers.getSetCookie()` 含同樣兩個值
- **驗收**：`nextjs-pickball/app/api/[[...route]]/route.test.ts`，it 名稱「upstream 的 3xx 轉址連同 Location 與多個 Set-Cookie 原樣回傳」

#### Scenario: OAuth callback 的轉址經 proxy 回到瀏覽器

- **GIVEN** 前後端 dev server 皆已啟動，本機登入啟用
- **WHEN** Playwright 的 `request` context 以 `maxRedirects: 0` 對 `http://localhost:3005/api/auth/callback/google` 發出 GET（不帶 state，better-auth 以轉址回報錯誤）
- **THEN** status 介於 300 與 399，且 `location` 標頭以 `http://localhost:3005/` 開頭
- **驗收**：`nextjs-pickball/tests/e2e/specs/auth-proxy.spec.ts`，test 名稱「經 proxy 呼叫 OAuth callback 時轉址原樣回到瀏覽器」
