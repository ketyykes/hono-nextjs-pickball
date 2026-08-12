## ADDED Requirements

### Requirement: 後端測試在 workerd runtime 中執行

`hono-pickball` 的單元測試 SHALL 在真正的 workerd runtime 中執行，SHALL NOT 使用 node 或 happy-dom 模擬 —— 後端程式碼依賴 Cloudflare Workers 的執行環境語意（`cloudflare:workers` 模組、binding、Request/Response 實作），在模擬環境中通過的測試不足以證明部署後可運作。

測試 MUST 放在 `hono-pickball/test/` 獨立目錄，SHALL NOT 鄰近 `src/`（與前端慣例相反）。理由有二：官方 pool 的 tsconfig 分層以 `test/` 為邊界；且 `src/` 會被 `wrangler deploy` 打包，測試檔不應混入部署產物。

設定 MUST 使用從 `@cloudflare/vitest-pool-workers` 套件根匯入的 `cloudflareTest()` Vite plugin。本版（0.16.13）不存在 `defineWorkersConfig`，`exports` 亦無 `./config` subpath。

測試 MUST 使用 `import { exports } from "cloudflare:workers"` 搭配 `exports.default.fetch()`，SHALL NOT 使用 `SELF` 或 `env` —— 兩者在 `@cloudflare/vitest-pool-workers/types` 中皆已標記 `@deprecated`。

#### Scenario: 後端測試可在 workerd runtime 中取得 worker

- **WHEN** 執行 `pnpm --filter ./hono-pickball test --run test/smoke.test.ts`
- **THEN** 測試通過，且 `exports.default.fetch` 為可呼叫的函式
- **驗收**：`hono-pickball/test/smoke.test.ts`，it 名稱「可在 workerd runtime 中執行並存取 Hono worker」

#### Scenario: 測試檔位於獨立的 test/ 目錄

- **WHEN** 列出 `hono-pickball/` 下的測試檔
- **THEN** 全部位於 `test/` 目錄，`src/` 下不存在任何 `*.test.ts`

#### Scenario: 受限沙箱中的失敗不得被誤判為設定錯誤

- **GIVEN** 執行環境禁止程序監聽 localhost
- **WHEN** 執行後端測試
- **THEN** 會出現 `listen EPERM: operation not permitted 127.0.0.1`（miniflare 需開 localhost server）
- **AND** 此為環境限制而非設定錯誤，處置方式是放行後重跑，SHALL NOT 因此修改 `vitest.config.ts`

### Requirement: 根層彙總指令必須涵蓋所有 workspace

root `package.json` 的 `build`、`test`、`typecheck` SHALL 實際涵蓋每一個 workspace，SHALL NOT 因某個 workspace 缺少對應 script 而靜默跳過（`pnpm -r` 對缺少的 script 回傳 exit 0，會讓「全部通過」的假象成立）。

每個 workspace MUST 提供 `build`、`test`、`typecheck` 三個 script。後端的 `build` MUST 同時包含型別檢查與打包驗證（`tsc --noEmit && wrangler deploy --dry-run`）—— 兩者互補：前者抓型別但抓不到打包錯，後者走真 esbuild 打包並驗證 `wrangler.jsonc` 但不做型別檢查。

後端 `typecheck` MUST 包含 `test/tsconfig.json` 這一段，否則該設定檔會成為沒人執行的死設定（root tsconfig 的 `include` 不含 `test/`）。

#### Scenario: root test 涵蓋前後端

- **WHEN** 於 repo root 執行 `pnpm test`
- **THEN** 輸出同時出現 `nextjs-pickball test:` 與 `hono-pickball test:` 兩組測試統計

#### Scenario: root build 涵蓋前後端

- **WHEN** 於 repo root 執行 `pnpm build`
- **THEN** 輸出同時出現前端 Next.js 建置與後端 `wrangler deploy --dry-run` 的結果（含 Total Upload / gzip 數字）

#### Scenario: 後端 typecheck 涵蓋測試檔

- **WHEN** 執行 `pnpm --filter ./hono-pickball typecheck`
- **THEN** 依序執行 `tsc --noEmit` 與 `tsc --noEmit -p test/tsconfig.json`，兩段皆 exit 0

### Requirement: 後端 Hono app 必須帶入 binding 型別

`hono-pickball/src/index.ts` 的 Hono 實例 SHALL 宣告為 `new Hono<{ Bindings: CloudflareBindings }>()`，使 `c.env` 具備由 `wrangler types` 產生的型別。

`CloudflareBindings` 為 `worker-configuration.d.ts` 宣告的全域介面，SHALL NOT 額外 import。改動 `wrangler.jsonc` 後 MUST 重跑 `pnpm cf-typegen`（root `.claude/settings.json` 已有 PostToolUse hook 自動觸發）。

此為型別層要求，SHALL NOT 以單元測試驗收 —— 目前 binding 清單為空，泛型化後 runtime 行為零變化，用 `@ts-expect-error` 湊出的「型別測試」是空測試。驗收方式為 `typecheck` exit 0。

#### Scenario: Hono 實例帶入 CloudflareBindings

- **WHEN** 檢查 `hono-pickball/src/index.ts` 的 Hono 建構
- **THEN** 為 `new Hono<{ Bindings: CloudflareBindings }>()`，且檔案未 import `CloudflareBindings`

#### Scenario: 型別檢查通過

- **WHEN** 執行 `pnpm --filter ./hono-pickball typecheck`
- **THEN** exit 0
