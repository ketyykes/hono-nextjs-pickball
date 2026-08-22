# Health check 頁面 + 通路驗證測試 — 設計

> 📌 **本文件已由 openspec 取代。**
> `/health` 與 `/api/*` 通路的正式規格見 `openspec/specs/api-connectivity/spec.md`
> （change `add-api-connectivity-spec`）。本檔僅保留為當時的設計脈絡紀錄，不再更新。

> ⚠️ 本檔為歷史紀錄，指令原文刻意保留未改。
> 文中 `pnpm ... test -- --run <path>` 已知失效：那個 `--` 會讓 vitest 收不到路徑而跑完整套，
> 紅燈證據會被既有綠燈淹沒。正確寫法為 `pnpm --filter ./<workspace> test --run <path>`，
> 見 root `CLAUDE.md` 的「常用指令」節（原載於 `openspec/config.yaml`，該檔已只放 openspec
> workflow schema 與輸出語言設定）。（change: fix-tdd-toolchain-and-config → sync-doc-drift-and-guard-hooks-inventory）

- 日期：2026-07-18
- 範圍：`nextjs-pickball` workspace（前端）
- 後端 `hono-pickball`：**不需改動**

## 目標

讓 Next.js 端能明確、可重複地確認「Next.js → service binding `HONO_API` → Hono」這條 API 通路是通的：

1. 提供一個看得到的 **health check 頁面**（`/health`），render 時直連 service binding 顯示後端狀態。
2. 提供 **E2E 測試**自動驗證通路，`pnpm test:e2e` 一鍵可跑、CI 也能跑。

## 背景與現況

- 後端 `hono-pickball/src/index.ts` **已存在** `GET /api/health`，回傳 `{ status, service, timestamp, requestUrl }`。
- 前端 `app/api/[[...route]]/route.ts` **已存在** catch-all proxy，把 `/api/*` 經 service binding 原樣轉發給 Hono（瀏覽器視角 same-origin）。
- `next.config.ts` 已呼叫 `initOpenNextCloudflareForDev()`，故 `next dev` 下 Server Component render 時 `getCloudflareContext()` 可取得 `env.HONO_API`。
- `HONO_API: Fetcher` 型別已在 `cloudflare-env.d.ts`；`Fetcher.fetch = typeof fetch`。
- shadcn 已含 `card`、`badge`、`separator`、`button`，頁面 UI 無需另裝。

**關鍵限制**：service binding 只有在**前端（`next dev`）與後端（`wrangler dev`）同時運行、dev registry 接通**時才會通。

## 已確認的決策

- **環境策略①**：Playwright `webServer` 改為陣列，測試自動同時帶起 `wrangler dev` 與 `next dev`（一鍵、CI 友善、測試自足）。
- **頁面型態**：Server Component，render 時直連 service binding（`export const dynamic = "force-dynamic"`）。
- **E2E 保留 Test A + Test B 兩者**（見下）。
- 保留 `latencyMs`。

## 組成

### 1. 檢查邏輯 `lib/health.ts`（純函式，走 TDD）

把「打 binding + 解析回應」抽成可注入、可測試的函式，與頁面呈現分離。

```ts
export type HealthResult =
  | { ok: true;  service: string; timestamp: string; requestUrl: string; latencyMs: number }
  | { ok: false; error: string; latencyMs: number }

export async function checkHonoHealth(binding: Fetcher): Promise<HealthResult>
```

行為：

- 量測往返時間 `latencyMs`（`Date.now()` 前後差）。
- `binding.fetch("https://hono-pickball.internal/api/health")`。host 任意（binding 直接路由到目標 worker，不經 DNS），路徑須為 `/api/health`。
- 成功條件：`res.ok`（2xx）且 JSON `status === 'ok'` → `{ ok: true, service, timestamp, requestUrl, latencyMs }`。
- 失敗條件（皆回 `{ ok: false, error, latencyMs }`，**絕不 throw**，確保頁面永遠能 render）：
  - 非 2xx 狀態碼。
  - JSON 解析失敗。
  - `status !== 'ok'`。
  - `binding.fetch` 例外（後端未起／連不上）。

`Fetcher` 型別沿用 `types/cloudflare-fetcher.d.ts` 的全域宣告，無需 import。

### 2. 頁面 `app/health/page.tsx`（Server Component）

- `export const dynamic = "force-dynamic"`：確保 request 時 render，build 時不執行 binding（避免預渲染期無 runtime context）。
- `const { env } = getCloudflareContext()` → `await checkHonoHealth(env.HONO_API)`。
- 以 shadcn `Card` + `Badge` 呈現：
  - 成功：綠色 badge `ok` + `service` / `timestamp` / `requestUrl` / `latencyMs`。
  - 失敗：紅色（destructive）badge `fail` + `error` 訊息。
- 狀態容器掛 `data-testid="health-status"` 且 `data-status={ok ? "ok" : "fail"}`，E2E 以此 `data-status` 斷言（避免依賴顯示文字）。
- 屬入口頁面，**免單元 TDD**，由 E2E smoke 覆蓋。

### 3. E2E 測試 `tests/e2e/specs/api-health.spec.ts`

- **Test A — 頁面通路**：開 `/health`，斷言 `health-status` 顯示 `ok`。驗證 Server Component 直連 binding + 頁面呈現。
- **Test B — proxy 通路**：`request.get('/api/health')`，斷言狀態 200 且 body `status === 'ok'`。驗證 `/api/*` catch-all proxy 這條 same-origin 通路（未來所有 API 皆走此路）。
- 兩測試只在 `chromium` project 執行（API 通路無須 5 瀏覽器重複）；以 `test.skip(browserName !== 'chromium', ...)` 或等效方式限制。

### 4. `playwright.config.ts`：`webServer` 改陣列

```ts
webServer: [
  { command: "pnpm --filter hono-pickball dev", url: "http://localhost:8787", reuseExistingServer: !process.env.CI, timeout: 120000 },
  { command: "pnpm dev",                         url: "http://localhost:3005", reuseExistingServer: !process.env.CI, timeout: 120000 },
]
```

- 用 **package name** filter（`hono-pickball`）而非相對路徑，確保從 `nextjs-pickball/` cwd 也能解析到 workspace 內的 package。
- 兩 dev 並行 → wrangler dev 註冊到 dev registry → next dev 的 binding 在測試 runtime 連上。

## 風險與緩解（實作時驗證）

- **wrangler dev 在 CI 首次啟動的遙測提示**：必要時設環境變數 `WRANGLER_SEND_METRICS=false`。
- **dev registry 接通時序**：首跑偶爾 flaky。緩解：頁面本身容錯（顯示 fail 不 crash）；E2E 可靠 Playwright retry；斷言前可等待頁面就緒。

## TDD 拆解（依 openspec 慣例）

- `lib/health.ts`：行為邏輯 → ① 先寫 `lib/health.test.ts` 失敗測試（`pnpm test -- --run lib/health.test.ts` 確認紅燈）② 最小實作至 green ③ refactor。
- `app/health/page.tsx`：入口頁面 → 免 TDD，補 E2E smoke。
- `tests/e2e/specs/api-health.spec.ts`：本身即測試。
- `playwright.config.ts`：配置 → 免 TDD。

## 驗收標準

1. `pnpm test -- --run lib/health.test.ts`：`checkHonoHealth` 三分支（成功／非 2xx／例外）皆綠。
2. 本機 root `pnpm dev` 起前後端後，瀏覽器開 `http://localhost:3005/health` 顯示綠色 `ok` 與後端欄位。
3. 後端未起時開 `/health` 顯示紅色 `fail` 且頁面不 crash。
4. `pnpm test:e2e`（在 nextjs-pickball workspace）能自動帶起前後端並讓 Test A、Test B 於 chromium 通過。

## 影響檔案

| 檔案 | 動作 |
|---|---|
| `nextjs-pickball/lib/health.ts` | 新增（邏輯） |
| `nextjs-pickball/lib/health.test.ts` | 新增（Vitest TDD） |
| `nextjs-pickball/app/health/page.tsx` | 新增（頁面） |
| `nextjs-pickball/tests/e2e/specs/api-health.spec.ts` | 新增（E2E） |
| `nextjs-pickball/playwright.config.ts` | 修改（webServer 陣列） |
