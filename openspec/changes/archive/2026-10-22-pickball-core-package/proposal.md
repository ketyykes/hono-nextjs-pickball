# Proposal: pickball-core-package

## Why

runbook B4（裁決 D1 = (a)）：Wave 2 的後端（B5～B9）要以**同一份** zod schema 驗證前端送來的計分板快照、球員與回合資料，
B7 更要在後端以同一份 `submitScore` 權威計算評分與歷史。目前這些 schema 與純函式全在 `nextjs-pickball/lib/`，後端無從 import；
複製一份會漂移（D1 (b)），只存不驗會失去把關（D1 (c)）。本 change 把它們抽成第三個 workspace 套件 `@pickball/core`，
前後端都以 workspace 相依取用。**純搬移，行為零變更**——既有測試是 regression guard。

**前提**：Wave 1（B1～B3）已合併並 archive、S1 通過（runbook 狀態快照）。

## What Changes

- 新增 workspace `packages/pickball-core`（套件名 `@pickball/core`，純 TS＋zod，零瀏覽器 API、零 I/O、無建置產物——
  `exports` 直接指向 `src/*.ts`，由消費端的 bundler／測試工具轉譯）。
- 以 `git mv` 把下列 **18 個模組**從 `nextjs-pickball/lib/` 原樣搬入 `packages/pickball-core/src/`（**檔案內容零修改**，模組間相對 import 因目錄結構相同而不變）：
  - `scoreboard/`：`types`、`rules`、`reducer`
  - `matchmaker/`：`types`、`allocation-types`、`allocation`、`candidates`、`duplication`、`pairing`、`rating-math`、`rating-types`、`rating`、
    `labels`、`round-types`、`round`、`history`、`history-range`、`transfer-types`
  - 範圍原則：**後端（B5～B9）需要的 schema 與運算，及其遞移相依**；只有前端使用的純函式（`roster`、`colors`、`roster-csv`、`csv`、
    `player-stats`、`round-settings`、`round-timer`、`rating-bounds`、`stage-layout`、`export-scene` 等）與所有 `localStorage` I/O 模組**留在前端**。
- 前端所有 import 這 18 個模組的程式碼與測試改用 `@pickball/core/<area>/<module>`（**只改 import 指定字串**）；
  **這些模組的既有單元測試留在 `nextjs-pickball/lib/**` 原位**（spec 的「驗收」錨點以測試檔路徑為準，搬移會讓約 250 處錨點失效），
  不刪改任何 it 的名稱與斷言，前端測試檔數／測試數與基線完全相同。
- `pnpm-workspace.yaml` 加入 `packages/pickball-core`；前後端 `package.json` 加 `"@pickball/core": "workspace:*"`；
  `nextjs-pickball/next.config.ts` 加 `transpilePackages: ["@pickball/core"]`。
- 核心套件自帶 `build`／`test`／`typecheck` script（`dev-workflow`「根層彙總指令必須涵蓋所有 workspace」）：
  `tsc` 以**不含 DOM 的 lib** 檢查 `src/`（編譯期守住零瀏覽器 API），vitest（node 環境）的模組邊界測試守住「清單與檔案一致、可在無瀏覽器全域的環境載入」。
- 後端新增一條 workerd 測試證明 vitest-pool-workers 能解析並執行核心套件；另以暫存入口檔的 `wrangler deploy --dry-run` 證明 esbuild 能打包它
  （B4 不在 `src/**` 匯入核心套件，後端執行期行為零變更）。
- 文件：root `CLAUDE.md` 結構圖與 `pnpm -r` 範圍說明、root `AGENTS.md` 指標表、root `README.md` 部署前檢查清單、
  `nextjs-pickball/CLAUDE.md`、`hono-pickball/CLAUDE.md`，新增 `packages/pickball-core/CLAUDE.md`。

### 明確不做

- 任何行為變更、任何 API、任何 D1 資料表（B5 起）。
- 搬移只有前端使用的純函式；改寫被搬移模組的內容（含註解中的舊路徑敘述）。
- 為既有規格大量改寫「實作位於…」路徑——改以 `pickball-core` capability 的**路徑對照表**統一處理（design Decision 4），
  之後各 change 修改到該 Requirement 時才順手改為新路徑。
- Workers Builds（CF Dashboard）能否在 root directory 下解析 workspace 相依：屬遠端驗證，記為 G1 使用者步驟第 5 點，本棒不驗。

## Capabilities

### New Capabilities

- `pickball-core`：共用核心套件的位置、匯出方式、模組清單、零瀏覽器 API／零 I/O 約束、前後端取用方式，以及既有規格舊路徑的對照規則。

### Modified Capabilities

- `dev-workflow`：「根層彙總指令必須涵蓋所有 workspace」（加入第三個 workspace）、「部署前品質門檻」（清單加入核心套件單元測試）。

## Impact

- **程式碼**：新增 `packages/pickball-core/**`；`nextjs-pickball/lib/{scoreboard,matchmaker}/` 少 18 個模組（測試檔不動位置）；
  前端 84 個檔案（其中 40 個測試檔；main@414d822 以 grep 盤點）的 import 指定字串改寫（含 `tests/e2e/specs/scoreboard-binding.spec.ts` 的一個 type-only import）；
  `next.config.ts`、兩個 workspace 的 `package.json`、`pnpm-workspace.yaml`、`pnpm-lock.yaml`；
  後端只新增 `test/pickball-core-import.test.ts` 與 `package.json` 相依，**`src/**` 零改動**。
- **行為**：零變更。訪客與正式站完全相同；既有 E2E 原樣通過。
- **相依**：**不新增任何第三方套件**。核心套件宣告的 `zod`（`^4.4.3`）、`typescript`（`^5`）、`vitest`（`^4.1.5`）、`@types/node`（`^20`）
  皆為 lockfile 既有的套件與版本；lockfile 只增加 `packages/pickball-core` importer 與 `link:` 相依（vitest 可能因 peer 組合不同多一個解析變體，
  套件與版本不變——§1 實測並記錄）。
- **後續 change**：B5～B9 的共用契約（API envelope、路徑常數等）一律加在 `@pickball/core`；新模組要同步更新邊界測試的模組清單。
- **風險**：Playwright 以 CJS 載入 E2E spec 時要能轉譯 workspace 套件的 `.ts`（`matchmaker-data-transfer.spec.ts` 經 `roster-csv.ts` 間接載入核心套件）——
  §1 以 `playwright test --list` 先行驗證（design Risks）。
