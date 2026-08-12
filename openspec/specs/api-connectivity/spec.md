# api-connectivity Specification

## Purpose
TBD - created by archiving change add-api-connectivity-spec. Update Purpose after archive.
## Requirements
### Requirement: `/api/*` 經 service binding 原樣轉發

`nextjs-pickball/app/api/[[...route]]/route.ts` SHALL 將所有 `/api/*` 請求經 `HONO_API` service binding 轉發給 hono-pickball Worker，並 SHALL 支援 GET / POST / PUT / PATCH / DELETE / OPTIONS / HEAD 七個 method（全部指向同一個 handler）。

轉發時第一個參數 MUST 為原始的 `request.url` **字串**，SHALL NOT 傳入任何 `Request` 實例（連 `new Request()` 重建的也不行）。原因：`next dev` 下 `getCloudflareContext()` 取得的 binding 是 miniflare proxy，跨 realm 的 `Request` 物件會被字串化成 `[object Request]` 而拋 Invalid URL。

回傳 MUST 為在本 realm 重建的新 `Response`，並保留 upstream 的 `status` / `statusText` / `headers` / `body`。原因同上：miniflare 回傳的是 Next.js 認不得的跨 realm `Response`。

host 與 query string SHALL NOT 被改寫 —— 瀏覽器視角必須維持 same-origin，未來 better-auth 的 `Set-Cookie` 才會直接落在前端 origin 而無跨域 cookie 問題。

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

### Requirement: 後端對外端點一律掛在 `/api/*` 之下

hono-pickball 所有對外可用的端點 SHALL 掛在 `/api/*` 路徑之下。這是**系統性約束而非命名慣例** —— 前端 catch-all proxy 只轉發 `/api/*`，掛在其他路徑的端點瀏覽器根本打不到。

root path（`GET /`）SHALL 回傳 404，且此為**刻意行為**。文件與監控 SHALL NOT 將該 404 解讀為部署失敗。

#### Scenario: root path 回 404

- **WHEN** 對 hono-pickball 發出 `GET /`
- **THEN** 回應 status 為 404
- **驗收**：`hono-pickball/test/routing.test.ts`，it 名稱「GET / 應回傳 404（對外路由一律掛在 /api/* 之下）」

#### Scenario: 未定義的 /api 路徑回 404

- **WHEN** 對 hono-pickball 發出 `GET /api/does-not-exist`
- **THEN** 回應 status 為 404
- **驗收**：`hono-pickball/test/routing.test.ts`，it 名稱「未定義的 /api/* 路徑應回傳 404」

### Requirement: `GET /api/health` 回應契約

`GET /api/health` SHALL 回傳 HTTP 200 與 `application/json`，body MUST 包含 `status`、`service`、`timestamp`、`requestUrl` 四個字串欄位。

`status` MUST 為 `"ok"`；`service` MUST 為 `"hono-pickball"`；`timestamp` MUST 為可被 `Date.parse` 解析的 ISO 8601 字串；`requestUrl` MUST 原樣反映實際處理請求的 URL —— 該欄位是「service binding 轉發時 host 未被改寫」的證據來源。

#### Scenario: 回應 200 與 JSON

- **WHEN** 呼叫 `GET /api/health`
- **THEN** status 為 200，`content-type` 含 `application/json`
- **驗收**：`hono-pickball/test/api-health.test.ts`，it 名稱「應回傳 HTTP 200 與 application/json」

#### Scenario: 四個欄位皆符合契約

- **WHEN** 解析 `GET /api/health` 的 body
- **THEN** `status === "ok"`、`service === "hono-pickball"`、`timestamp` 可被 `Date.parse` 解析、`requestUrl` 等於請求的 URL
- **驗收**：`hono-pickball/test/api-health.test.ts`，it 名稱「status 應為 ok」、「service 應為 hono-pickball」、「timestamp 應為可被 Date 解析的 ISO 8601 字串」、「requestUrl 應原樣反映請求的 URL 而未被改寫」

### Requirement: `GET /api/cookie-check` 的 cookie 穿透契約

`GET /api/cookie-check` SHALL 設定名為 `pickball-cookie-check` 的 cookie，其 `Set-Cookie` MUST 具備 `HttpOnly`、`SameSite=Lax` 與 `Path=/` 三個屬性。

回應 body MUST 包含 `cookieSet` 與 `receivedPreviousValue`；帶著前次 cookie 再次呼叫時，`receivedPreviousValue` MUST 等於前次寫入的值 —— 這是「Set-Cookie 能經 service binding 原樣穿透回瀏覽器」的驗證，未來 better-auth 直接依賴此行為。

本端點 SHALL NOT 設定 `Secure` 屬性：dev 環境為 `http://localhost:3005`，加上 `Secure` 會使該流程收不到 cookie。是否改為僅在正式環境加 `Secure` 屬產品決策，SHALL NOT 由測試偷渡。

#### Scenario: cookie 屬性符合契約

- **WHEN** 呼叫 `GET /api/cookie-check`
- **THEN** `Set-Cookie` 含 `pickball-cookie-check=`、`HttpOnly`、`SameSite=Lax`、`Path=/`
- **驗收**：`hono-pickball/test/api-cookie-check.test.ts`，it 名稱「應設定名為 pickball-cookie-check 的 cookie」、「Set-Cookie 應含 HttpOnly」、「Set-Cookie 應含 SameSite=Lax」、「Set-Cookie 應含 Path=/」

#### Scenario: 首次呼叫無前次值

- **WHEN** 未帶任何 cookie 呼叫
- **THEN** `cookieSet === true` 且 `receivedPreviousValue === null`
- **驗收**：`hono-pickball/test/api-cookie-check.test.ts`，it 名稱「未帶 cookie 時 receivedPreviousValue 應為 null 且 cookieSet 為 true」

#### Scenario: 帶前次 cookie 時回傳前次值

- **GIVEN** 前一次呼叫已取得 `Set-Cookie` 中的值
- **WHEN** 帶著該 cookie 再次呼叫
- **THEN** `receivedPreviousValue` 等於前次寫入的值（比對前需 `decodeURIComponent`，因 `setCookie` 會對 ISO 字串的 `:` 做 percent-encoding）
- **驗收**：`hono-pickball/test/api-cookie-check.test.ts`，it 名稱「帶著前次 cookie 時 receivedPreviousValue 應等於前次寫入的值」

#### Scenario: 其他 cookie 不影響判定

- **WHEN** 帶著其他名稱的 cookie 呼叫
- **THEN** `receivedPreviousValue` 仍為 `null`
- **驗收**：`hono-pickball/test/api-cookie-check.test.ts`，it 名稱「帶著其他名稱的 cookie 時 receivedPreviousValue 仍為 null」

### Requirement: `checkHonoHealth` 絕不 throw 且驗證回應形狀

`nextjs-pickball/lib/health.ts` 的 `checkHonoHealth(binding)` SHALL NOT 在任何情況下 throw；所有錯誤 MUST 降級為 `{ ok: false, error, latencyMs }`，確保 `/health` 頁面永遠能 render。

檢查路徑 MUST 固定為 `/api/health`。回應 payload MUST 經形狀驗證：`status`、`service`、`timestamp`、`requestUrl` 四個欄位皆為字串時才視為合法。**只檢查 `status` 是不夠的** —— 上游若少給其他欄位，頁面會顯示三個 `undefined` 卻自稱 ok。

所有分支（成功與失敗）MUST 回報 `latencyMs`。

#### Scenario: 成功分支回傳完整欄位

- **WHEN** 上游回 200 且 payload 四欄位齊全、`status === "ok"`
- **THEN** 回傳 `ok: true` 與 service / timestamp / requestUrl / latencyMs
- **驗收**：`nextjs-pickball/lib/health.test.ts`，it 名稱「回應 200 且 status=ok 時回傳 ok:true 與各欄位」

#### Scenario: 非 2xx 降級

- **WHEN** 上游回 500
- **THEN** 回傳 `ok: false`、`error === "HTTP 500"`
- **驗收**：`nextjs-pickball/lib/health.test.ts`，it 名稱「非 2xx 狀態碼時回傳 ok:false 與 HTTP 錯誤」

#### Scenario: fetch 例外降級

- **WHEN** `binding.fetch` 拋出例外
- **THEN** 回傳 `ok: false` 與例外訊息，不向外 throw
- **驗收**：`nextjs-pickball/lib/health.test.ts`，it 名稱「binding.fetch 例外時回傳 ok:false 與例外訊息」

#### Scenario: status 不為 ok 時降級

- **WHEN** 上游回 200 但 `status === "degraded"`
- **THEN** 回傳 `ok: false`、`error === "unexpected status: degraded"`
- **驗收**：`nextjs-pickball/lib/health.test.ts`，it 名稱「回應 200 但 status 不為 ok 時回傳 ok:false 與 unexpected status 錯誤」

#### Scenario: JSON 解析失敗降級

- **WHEN** 上游回 200 但 body 不是合法 JSON
- **THEN** 回傳 `ok: false` 與錯誤訊息
- **驗收**：`nextjs-pickball/lib/health.test.ts`，it 名稱「回應 200 但 body 不是合法 JSON 時回傳 ok:false 與解析錯誤」

#### Scenario: payload 形狀不完整時降級

- **WHEN** 上游回 200 且 `status === "ok"`，但缺少 `service` / `timestamp` / `requestUrl`
- **THEN** 回傳 `ok: false`，SHALL NOT 走成功分支
- **驗收**：`nextjs-pickball/lib/health.test.ts`，it 名稱「payload 缺少 service 或 timestamp 時回傳 ok:false」

#### Scenario: 檢查路徑固定為 /api/health

- **WHEN** 呼叫 `checkHonoHealth`
- **THEN** `binding.fetch` 被呼叫一次，且其 URL 的 pathname 為 `/api/health`
- **驗收**：`nextjs-pickball/lib/health.test.ts`，it 名稱「binding.fetch 被呼叫時路徑為 /api/health」

#### Scenario: 失敗分支也回報延遲

- **WHEN** 走 HTTP 錯誤或例外分支
- **THEN** 回傳值仍含數值型的 `latencyMs`
- **驗收**：`nextjs-pickball/lib/health.test.ts`，it 名稱「失敗分支也會回報 latencyMs」

### Requirement: `/health` 為內部診斷路由

`/health` SHALL 於每次 request 即時經 `HONO_API` binding 檢查通路，MUST 宣告 `export const dynamic = "force-dynamic"`，SHALL NOT 於 build 期預渲染（屆時無 binding 的 runtime context）。

`/health` MUST 匯出 `metadata` 且 `robots.index` MUST 為 `false` —— 這是內部診斷頁，不應進搜尋索引。此 noindex 要求**只對 `/health` 成立**，`/quiz`、`/scoreboard`、`/tour` 是公開內容頁不得比照。

`/health` SHALL NOT 列入 `SiteNavbar` 的 `NAV_LINKS`。

頁面 MUST 在後端不可用時仍正常 render；`data-testid="health-status"` 與 `data-status` 為 E2E 依賴的對外契約，SHALL NOT 隨意更名。

#### Scenario: 匯出 noindex metadata

- **WHEN** 檢查 `/health` 模組的匯出
- **THEN** `metadata.robots.index === false`，且 `metadata.title` 為非空字串
- **驗收**：`nextjs-pickball/app/health/page.test.ts`，it 名稱「/health 匯出 metadata 且 robots.index 為 false」與「/health metadata 具備可辨識的 title」

#### Scenario: 不於 build 期預渲染

- **WHEN** 檢查 `/health` 模組的匯出
- **THEN** `dynamic === "force-dynamic"`
- **驗收**：`nextjs-pickball/app/health/page.test.ts`，it 名稱「/health 維持 dynamic = force-dynamic（不得於 build 期預渲染）」

#### Scenario: 端到端通路可用

- **GIVEN** 前後端兩個 dev server 皆已啟動（service binding 需兩者同時運行才通）
- **WHEN** Playwright 開啟 `/health`
- **THEN** `data-testid="health-status"` 的元素存在且 `data-status` 為 `ok`
- **驗收**：`nextjs-pickball/tests/e2e/specs/api-health.spec.ts`

