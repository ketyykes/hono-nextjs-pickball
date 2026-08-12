## Why

「前端 proxy → service binding → Hono」是本站**唯一**的 API 通道，卻完全沒有規格。

實測（本 change 開工前）：

```
grep -rin "health\|HONO_API\|service binding" openspec/specs/   → 0 行命中
```

五份既有 capability spec（pickleball-guide-page / quiz / scoreboard / site-navbar / tour-experience）
沒有任何一份提到它。具體缺口：

- `/health` 是 `app/` 下 **5 個 user-facing 路由中唯一**沒有 capability spec、也沒有 archive change 的
- `app/api/[[...route]]/route.ts` 的三條關鍵不變量（不可傳 `Request` 實例、GET/HEAD 不帶 duplex、
  回傳需在本 realm 重建）**只活在程式碼註解裡**，沒有任何測試或規格保護 ——
  而這些是 commit `ef7fff4` 花了時間 debug 才找出來的
- hono-pickball 三個端點的契約（回應形狀、cookie 屬性）沒被規格化，
  未來 better-auth 的 `Set-Cookie` 穿透行為完全依賴這條通路

本 change 執行時另外發現一個**真 bug**（不只是規格債）：

`nextjs-pickball/lib/health.ts` 只檢查 `payload.status !== "ok"`，不驗形狀。
傳 `{ status: "ok" }` 會走到成功分支回 `ok: true`，而 `service` / `timestamp` / `requestUrl`
全為 `undefined` —— `/health` 頁面會顯示三個空欄位卻掛著綠色 ok badge。

## What Changes

### 新增 capability `api-connectivity`（6 條 Requirement）

1. **`/api/*` 經 service binding 原樣轉發** —— 把 `route.ts:3-27` 註解裡的三條 workaround 升格為 SHALL
2. **後端對外端點一律掛在 `/api/*` 之下** —— 系統性約束（proxy 只轉發這條），含 root path 回 404 的刻意行為
3. **`GET /api/health` 回應契約** —— 四個欄位，`requestUrl` 是「host 未被改寫」的證據來源
4. **`GET /api/cookie-check` 的 cookie 穿透契約** —— HttpOnly / SameSite=Lax / Path=/ 與來回穿透
5. **`checkHonoHealth` 絕不 throw 且驗證回應形狀** —— 8 個 Scenario 對應 8 個 it
6. **`/health` 為內部診斷路由** —— force-dynamic、noindex、不入 NAV_LINKS、E2E 契約

### 程式碼變更

- **真 TDD ①**：`lib/health.ts` 新增 `isValidPayload` 形狀驗證（修上述真 bug）
- **真 TDD ②**：`app/health/page.tsx` 新增 `metadata` 與 `robots.index: false`
  - `/health` 是 `app/` 下**唯一**沒有 `export const metadata` 的路由（其餘四個都有）
- **regression guard**：`app/api/[[...route]]/route.test.ts` 7 條 proxy 契約斷言
- **regression guard**：`lib/health.test.ts` 補「檢查路徑為 /api/health」與「失敗分支也回報 latencyMs」

### site-navbar 修正

- 「非首頁路由樣式」的 WHEN 從列舉 `/tour`、`/scoreboard`、`/quiz` 改為「路由不為 `/`」
  - 實作是 `const solid = !isHome || pastHero`，列舉必然在新增路由時漏列（`/health` 就是這樣漏的）
- 新增 Scenario 明訂診斷路由不入 `NAV_LINKS`

## Capabilities

### New Capabilities

- `api-connectivity` —— 前端 proxy、service binding、後端端點契約、health 檢查邏輯與診斷頁

### Modified Capabilities

- `site-navbar`：1 條 MODIFIED（路由判定改為「不為 `/`」，並新增診斷路由不入導航列的 Scenario）

> **與 change ④ 的邊界**：④ 規範「怎麼測」（workerd runtime、`test/` 目錄、工具鏈），
> 本 change 規範「測什麼」（端點契約與行為）。本 change 引用的後端錨點全部由 ④ 建立，
> 因此**必須排在 ④ 之後**。

## Impact

- **受影響檔案**
  - 新增：`openspec/specs/api-connectivity/`（archive 時建立）、
    `nextjs-pickball/app/api/[[...route]]/route.test.ts`、`nextjs-pickball/app/health/page.test.ts`
  - 修改：`nextjs-pickball/lib/health.ts`（形狀驗證）、`nextjs-pickball/lib/health.test.ts`（+3 it）、
    `nextjs-pickball/app/health/page.tsx`（metadata）
- **測試影響**：前端 19 檔 93 測 → **21 檔 106 測**
- **行為變更**
  - `checkHonoHealth` 在 payload 不完整時由 `ok: true` 改為 `ok: false`（**這是修 bug**）
  - `/health` 新增 noindex（先前無 metadata，等同預設允許索引）
- **風險**
  - 形狀驗證若過嚴會讓正常回應被判 fail。已對齊 `hono-pickball/src/index.ts:11-19`
    實際回傳的四個欄位，且後端有 `test/api-health.test.ts` 守住該形狀，雙邊一致
- **明確不做**
  - **不為 proxy 加 try/catch 回 502**：`route.ts:11-28` 目前沒有錯誤處理，binding 失敗會冒成
    Next.js 未處理錯誤。改成「上游不可用時回 502 + JSON error body」會是真正的 red-first，
    但那是**行為變更**，不可在補測試時偷渡。需要時另開 change
  - **不把 `duplex: "half"` 等 workerd 繞道寫成 spec 的實作細節**：Requirement 只描述
    「必須帶 duplex」這個可觀察契約，繞道的原因留在 `route.ts:3-10` 的註解
