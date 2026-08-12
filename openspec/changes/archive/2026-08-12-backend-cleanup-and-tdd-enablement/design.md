## Context

本 change 把後端從「零測試的 scaffold 殘骸」升級為有工具鏈、有契約測試、文件不說謊的 workspace。
技術風險是全批 8 個 change 中最高的：它是唯一需要建立**新執行環境**（workerd runtime 測試）的一個，
而官方文件與實際安裝版本之間有兩處不相容。

## TDD 分層判定

| 項目 | 分類 | 依據 |
|---|---|---|
| `hono-pickball/vitest.config.ts`、`test/tsconfig.json`、`tsconfig.json`、`package.json` | **例外層** | `config.yaml` 的「入口與配置」 |
| `hono-pickball/src/index.ts` 刪除 `GET /` | **行為邏輯** | 走三步，真 red-first |
| `src/index.ts` 泛型化 `Bindings` | **例外層（型別）** | 見 D-④-4 |
| `test/{smoke,api-health,api-cookie-check}.test.ts` | **characterization test，非 TDD** | 見 D-④-3 |
| root / workspace 的 `CLAUDE.md`、`README.md`、`openspec/config.yaml` | **例外層** | 純文件與設定 |

## 關鍵決策

### D-④-1｜必須先加 script，紅燈才是真的

原始計畫的順序是「先跑 `pnpm --filter ./hono-pickball test --run test/smoke.test.ts` 看紅燈」。
**那個紅燈是假的** —— script 不存在時 pnpm 對缺少的 script 是**靜默成功**（無輸出、EXIT=0），
根本不會紅。

正確順序：先在 `package.json` 加 `"test": "vitest"`，**再**跑該指令。
此時 vitest 因無設定、無測試檔而輸出 `Exit status 1`，這才是合法的紅燈證據。

同一個陷阱也解釋了為什麼 root `pnpm build` 長期宣稱「兩個 workspace 都跑 build」卻沒人發現：
`pnpm -r` 對缺少的 script 一樣靜默成功。**「沒有失敗」不等於「有執行」。**

### D-④-2｜官方文件與安裝版本的兩處不相容（實測，非推測）

本 change 執行時實地檢查了 `node_modules/@cloudflare/vitest-pool-workers`：

| 官方舊範例 | 0.16.13 實際 | 後果 |
|---|---|---|
| `import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config"` | `exports` 只有 `.` / `./types` / `./codemods/vitest-v3-to-v4`；根匯出為 `cloudflareTest` | 照抄會 import 失敗 |
| `test/tsconfig.json` 的 `include` 寫 `../src/worker-configuration.d.ts` | 本 repo 該檔在 **workspace 根**（`hono-pickball/worker-configuration.d.ts`） | include 到不存在的路徑 |

另外 `types/cloudflare-test.d.ts` 中 `SELF` 與 `env` 皆已標 `@deprecated`，
現行寫法是 `import { exports } from "cloudflare:workers"` + `exports.default.fetch()`。
這個寫法對 Hono app 型別安全，不需要 cast。

**教訓**：涉及 Cloudflare 工具鏈時，先讀 `node_modules` 裡的 `.d.ts` 與 `package.json#exports`，
再參考文件。版本落差在這個生態系是常態。

### D-④-3｜三組 characterization test 誠實標註

`/api/health`、`/api/cookie-check` 與工具鏈冒煙都是**行為早已存在**，先寫測試會直接綠燈。
依 `config.yaml` 的例外層規則處理，在 tasks.md 記為
「① 紅燈＝端點尚無任何測試覆蓋 ② 補測試至 green，`src/` 不動 ③ refactor: skipped」，
**不套三步、不偽造紅燈**。

刻意不斷言的項目與理由：
- **`Secure` 屬性**：現行實作沒設。加上去會讓 `http://localhost:3005` 的 dev 流程收不到 cookie。
  是否該加屬產品決策，不應由測試偷渡進來
- **`Max-Age` / `Expires`**：現行為 session cookie，沒有需求文件支持特定存活期
- **`timestamp` 的固定值**：時間每次都不同，只驗 `Date.parse` 可解析性，不做快照

已知的坑（實測）：`setCookie` 會對 ISO 字串的 `:` 做 percent-encoding，
讀回時已解碼。比對前必須 `decodeURIComponent(issued)`，否則會誤紅。
`exports.default.fetch()` 沒有 cookie jar，第二次呼叫要手動組 `Cookie` header ——
這反而讓測試完全確定性、無順序耦合。

### D-④-4｜`Bindings` 泛型化不寫測試

`worker-configuration.d.ts` 的 `CloudflareBindings` 目前是空介面（`wrangler.jsonc` 的
D1 / KV / R2 全被註解掉）。泛型化後 **runtime 零變化、`c.env` 一個欄位都不會多**。
用 `@ts-expect-error` 湊出的「型別測試」是空測試，驗收方式是 `typecheck` exit 0。

真正該寫紅燈的時機是「新增第一個 binding」那個未來 change。

### D-④-5｜與 change ⑤ 的職責切分

本 change 建立的四個測試檔，**同時是 ⑤ 的 `api-connectivity` spec 的驗收錨點**。
切分原則：

- **④ 規範「怎麼測」**：workerd runtime、`test/` 目錄、`cloudflareTest()`、
  `exports.default.fetch()`、根層指令涵蓋範圍 → 歸 `dev-workflow` capability
- **⑤ 規範「測什麼」**：`/api/health` 的四個欄位、cookie 的三個屬性與來回穿透、
  `GET /` 回 404 的對外約定 → 歸 `api-connectivity` capability

因此 ⑤ **必須排在 ④ 之後** —— `config.yaml` 要求「行為邏輯情境須附測試檔路徑與 it 名稱」，
沒有 ④ 就沒有可引用的錨點。

### D-④-6｜`GET /` 刪除而非改寫（決策 D2）

兩個選項：(A) 刪掉回 404；(B) 改成 `c.json({ service: 'hono-pickball' })` 並立為 Requirement。
採 A。理由：
1. 前端 catch-all 只掛 `/api/*`，`/` 的請求在正常架構下到不了 Hono
2. `hono-pickball/CLAUDE.md` 路由約定明寫「對外 API 一律掛 `/api/*` 之下」，保留 `GET /` 是未記載的例外
3. 唯一可達路徑是 workers.dev 網域，回 `Hello Hono!` 對外洩露框架身分卻零功能價值

**必須配套**：spec 要把「root path 回 404」寫成**刻意行為**並註明「不代表部署失敗」。
否則下次有人打 workers.dev 根路徑看到 404 會誤判為部署異常 —— 這是刪除的唯一真實成本。

## 不做的事

- **不移除 7 個零使用依賴**（決策 D5）。實測 `wrangler deploy --dry-run` = gzip **16.91 KiB**，
  對照 CF Free plan 的 3 MiB 上限餘裕極大。改為在 `CLAUDE.md` 記 **2026-11-12 複審期限**
- **不刪 `wrangler.jsonc` 被註解掉的 d1 / kv / r2 樣板**：保留作為未來 binding 的填空模板
- **不加 coverage**：若日後要加，`provider` 必須是 `istanbul` ——
  `cloudflareTest` 的 config hook 在 `coverage.enabled && provider === "v8"` 時會直接 throw。
  已寫進 `config.yaml` 備註
- **不寫「前端 → binding → Hono」的端到端測試**：pool 的 `exports.default` 只能觸及
  hono-pickball 單一 worker，跨 worker 穿透目前由既有的 Playwright E2E
  （`nextjs-pickball/tests/e2e/specs/api-health.spec.ts`）覆蓋
