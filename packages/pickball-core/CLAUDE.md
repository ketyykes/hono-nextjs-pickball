# CLAUDE.md

本檔描述 **packages/pickball-core workspace**（`@pickball/core`）：前後端共用的純邏輯與契約。root 層規則見 [`../../CLAUDE.md`](../../CLAUDE.md)。

## 定位

- 放「前端與後端都會用到」的純函式、型別與常數：計分機（`scoreboard/{types,rules,reducer}`）與對戰分配機（`matchmaker/*` 的 15 個純邏輯模組）。B5～B9 需要的共用契約（API envelope、路徑常數等）**一律加在這裡**，不要各自複製到前後端。
- **無建置產物**：`exports` 為 `{"./*": "./src/*.ts"}`，消費端直接吃 `.ts` 原始碼，匯入寫法為 `@pickball/core/<area>/<module>`。前端靠 `next.config.ts` 的 `transpilePackages`，後端靠 vitest-pool-workers／esbuild 本身即可解析。
- `dependencies` 只有 `zod`；沒有 `type` 欄位（刻意，見下方「注意事項」第 3 點）。

## 零瀏覽器 API（兩層強制）

模組 MUST NOT 碰瀏覽器全域、計時器或 I/O（`window`、`localStorage`、`document`、`setTimeout`、`fetch` 等），後端 workerd 與測試環境都不保證存在。由兩層把關：

1. `tsconfig.json` 的 `lib: ["ESNext"]`、`types: []`、`include: ["src"]`——沒有 DOM／node 型別，用到會 tsc 失敗。
2. 測試在 node 環境載入每個核心模組（`test/module-boundary.test.ts`），並斷言 `window`／`document`／`localStorage` 不存在。

兩層能力不同：執行期層只攔得到 node 環境本身不存在的瀏覽器全域；Node 本身具備的全域（`setTimeout`、`fetch`、`console`）在 node 下載入不會出錯，只能靠 tsc 那層攔截。實測在 `src/` 內引用 `setTimeout`、`fetch`、`console` 三者，tsc 皆報 `TS2304`／`TS2584` 找不到名稱。

## 新增模組

- 新增核心模組 MUST 同步更新 `test/module-boundary.test.ts` 的 `CORE_MODULES`（目前 18 項），否則邊界測試轉紅。
- 需要瀏覽器 I/O 的程式（localStorage、Blob 下載、canvas）留在前端，不進本套件。

## 測試

- 被搬移的 18 個模組，其**既有**單元測試（其中 `scoreboard/types`、`matchmaker/{allocation-types,rating-math,rating-types,labels,transfer-types}` 6 個本來就沒有同名測試檔）**刻意留在前端原位** `nextjs-pickball/lib/{scoreboard,matchmaker}/*.test.ts`（主 spec 的驗收錨點以測試檔路徑定位），由前端 vitest 執行；不是漏搬。
- 目前本套件的 `test/` 只有套件層守衛（模組邊界等）；新增核心模組的行為測試放哪裡由該 change 決定，若放在本套件須在 `test/**/*.test.ts`（vitest `include` 僅含此範圍）。`src/**` 的行為邏輯一律照 root `CLAUDE.md` 的 TDD 三步。
- `pnpm test`＝vitest（不加 `--passWithNoTests`）；`pnpm typecheck`＝`tsc --noEmit && tsc --noEmit -p test/tsconfig.json`（兩段都要）；`pnpm build`＝`tsc --noEmit`。
- 單檔測試（在 repo root）：`pnpm --filter ./packages/pickball-core test --run test/<檔>.test.ts`（**`--run` 前不可加 `--`**）。

## 注意事項

1. **ESLint**：root 的逐檔 ESLint hook 只針對前端；編輯本套件檔案會空跑並輸出 "File ignored"，無害。本套件不在任何 ESLint 範圍，以 strict tsc 彌補。
2. **Playwright 與 symlink**：Playwright 只轉譯絕對路徑不含 `/node_modules/` 的檔案；pnpm workspace symlink 經 Node 解析取 realpath（`packages/pickball-core/src/...`）才會被轉譯。任何工具加 `--preserve-symlinks` 或 `NODE_PRESERVE_SYMLINKS=1` 會使 E2E 載入核心套件失敗。
3. **不設 `"type": "module"` 是刻意的**：Playwright 以 CJS 載入 E2E spec 鏈（`matchmaker-data-transfer.spec.ts` → `roster-csv.ts` → `@pickball/core/matchmaker/transfer-types`）。代價是直接用 node 執行核心 `.ts` 會出現 `MODULE_TYPELESS_PACKAGE_JSON` 警告；Vite／esbuild／Next 消費端不受影響。
4. **舊路徑對照**：既有主 spec 中的 `nextjs-pickball/lib/...` 舊路徑，依 `pickball-core` capability 的路徑對照表解讀為 `packages/pickball-core/src/...`。
5. **已知缺口**：emoji 守門測試 `nextjs-pickball/app/emojiFree.test.ts` 的掃描範圍不含本套件（`matchmaker/labels.ts` 有介面文字）。
6. **部署待驗**：Workers Builds 在 root directory `nextjs-pickball`／`hono-pickball` 下能否解析 workspace 相依，屬遠端驗證，尚未驗證。
