## Why

`hono-pickball` 是一個**有正式端點在線上服務、卻完全沒有測試**的 workspace，
而且 repo 的根層指令會讓人以為它有被涵蓋。

實測（本 change 開工前）：

| 宣稱 | 實際 |
|---|---|
| `openspec/config.yaml`「後端 change 的 TDD 規範待後端功能開發時補充」 | 後端已有 3 個運行中端點（`/`、`/api/health`、`/api/cookie-check`） |
| root `CLAUDE.md` / `README.md`「`pnpm build` 兩個 workspace 都跑 build」 | 後端**無 `build` script**，`pnpm -r` 對缺少的 script 回傳 exit 0 → 靜默跳過 |
| root `pnpm test` | 只跑 `--filter ./nextjs-pickball`，後端完全不在範圍內 |
| `@cloudflare/vitest-pool-workers ^0.16.13` + `vitest ^4.1.8` 已安裝 | **零測試檔、零 vitest 設定、package.json 無 test script** —— 是死重依賴 |

也就是說：後端一旦開始寫實質功能（better-auth / drizzle 都已預裝待用），
會直接落進一個沒有測試、沒有型別檢查、沒有 build 驗證、且規範明文說「待補充」的真空。

另有一個 scaffold 殘留：`src/index.ts` 的 `GET /` 仍回 `Hello Hono!`。
它違反本 repo 自己的路由約定（對外 API 一律掛 `/api/*`），且該路徑在正常架構下
根本到不了 Hono（前端 catch-all 只轉發 `/api/*`），唯一可達路徑是 workers.dev 網域 ——
對外洩露框架身分卻零功能價值。

## What Changes

### 工具鏈建置

- `hono-pickball/package.json` 新增 `test`、`typecheck`、`build` 三個 script
- 新增 `hono-pickball/vitest.config.ts`，用 `cloudflareTest()` plugin
  - ⚠️ 本版（0.16.13）**沒有 `defineWorkersConfig`、也沒有 `./config` subpath**（已實測 `exports` 只有 `.` / `./types` / `./codemods/vitest-v3-to-v4`）。照抄舊版官方範例會 import 失敗
- 新增 `hono-pickball/test/tsconfig.json`
  - ⚠️ 官方範例寫 `../src/worker-configuration.d.ts`，本 repo 該檔在 **workspace 根**而非 `src/`
- `hono-pickball/tsconfig.json` 補 `include`，避免加了 `test/` 之後 `tsc --noEmit` 把測試檔一起編而汙染 build 語意
- root `package.json`：`test` 改為 `pnpm -r test`，新增 `typecheck` / `test:web` / `test:api`

### 測試

- **真 TDD**（唯一一組）：`test/routing.test.ts` 要求 `GET /` 回 404 → 先寫必紅（現行回 200 + `Hello Hono!`）→ 刪除該路由至綠
- **characterization test**（3 組，實作已存在、寫測試直接綠燈，誠實標註）：
  - `test/smoke.test.ts` — 工具鏈可在 workerd runtime 中執行
  - `test/api-health.test.ts` — 200 / json / status / service / timestamp 可解析 / requestUrl 未被改寫
  - `test/api-cookie-check.test.ts` — cookie 屬性（HttpOnly / SameSite=Lax / Path=/）與來回穿透

### 規範與文件

- `openspec/config.yaml`：移除「待補充」，寫入後端 TDD 範圍、測試工具、目錄慣例、
  沙箱陷阱、coverage 的 istanbul 限制；context 補上 CF 部署與通路架構
- `hono-pickball/CLAUDE.md`：新增「測試慣例」段；路由約定補「root path 回 404 是刻意行為」；
  依賴段補上決策 D5 的保留理由與 **2026-11-12 複審期限**
- root `CLAUDE.md` / `README.md`：把 ① 記錄的「build 靜默跳過後端」警告改為現況

### 型別

- `src/index.ts` 的 Hono 實例泛型化為 `new Hono<{ Bindings: CloudflareBindings }>()`

## Capabilities

### New Capabilities

無。

### Modified Capabilities

- `dev-workflow`（由 change ① 建立）：3 條 ADDED
  1. 後端測試在 workerd runtime 中執行（含目錄慣例、API 版本陷阱、沙箱陷阱）
  2. 根層彙總指令必須涵蓋所有 workspace
  3. 後端 Hono app 必須帶入 binding 型別

> **與 change ⑤ 的邊界**：本 change 只規範「**怎麼測**」（工具鏈與流程），
> 端點本身的契約（`/api/health` 的四個欄位、`/api/cookie-check` 的 cookie 語意、
> `GET /` 回 404 的對外約定）全部歸 ⑤ 的 `api-connectivity` capability。
> 本 change 寫的測試就是 ⑤ 那些 Requirement 的驗收錨點，因此 ⑤ 必須排在 ④ 之後。

## Impact

- **受影響檔案**
  - 新增：`hono-pickball/vitest.config.ts`、`test/tsconfig.json`、`test/{smoke,routing,api-health,api-cookie-check}.test.ts`
  - 修改：`hono-pickball/{package.json,tsconfig.json,CLAUDE.md}`、`hono-pickball/src/index.ts`、
    root `{package.json,CLAUDE.md,README.md}`、`openspec/config.yaml`
- **測試影響**：後端 0 → **4 檔 16 測**；root `pnpm test` 由 19 檔 93 測變為 23 檔 109 測
- **行為變更**：`GET /` 由 200 `Hello Hono!` 變 **404**
  - ⚠️ 副作用：`hono-pickball.<subdomain>.workers.dev` 的根路徑會變 404。
    這是刻意行為，已寫進 `hono-pickball/CLAUDE.md` 與（將由 ⑤ 寫入）`api-connectivity` spec，
    避免日後有人看到 404 誤判為部署壞掉
- **風險**
  - 新增 `build` script **可能**讓 CF Dashboard 的 Workers Builds 改跑 `wrangler deploy --dry-run`
    （結果無害但屬行為改變）。該設定不在 git 內，**落地前需人工到 Dashboard 確認 build command**
- **明確不做**（決策 D5）
  - 不移除 7 個零使用依賴。實測 `wrangler deploy --dry-run` 產物為 gzip **16.91 KiB**，
    離 CF Free plan 的 3 MiB 上限餘裕極大；體積沒壓力時移除的收益低於日後重裝的摩擦
  - 改為在 `hono-pickball/CLAUDE.md` 記錄 **2026-11-12 複審期限**，讓決策有到期日而非無限期拖延
