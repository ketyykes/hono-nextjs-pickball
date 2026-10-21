## ADDED Requirements

### Requirement: 共用核心套件的位置、名稱與匯出方式

前後端共用的 zod schema 與純函式 SHALL 放在 repo root 的 `packages/pickball-core/`，套件名稱為 `@pickball/core`，
並列於 root `pnpm-workspace.yaml` 的 `packages`。`nextjs-pickball` 與 `hono-pickball` 的 `package.json` SHALL 以
`"@pickball/core": "workspace:*"` 宣告相依（pnpm 的 `workspace:` 協定保證只會連結到本地套件，不會誤從 registry 安裝）。

核心套件 SHALL NOT 有建置產物：`package.json` 的 `exports` MUST 為單一子路徑樣式 `{ "./*": "./src/*.ts" }`，
由消費端的工具鏈（Next.js `transpilePackages`、Vite／Vitest、wrangler 的 esbuild、Playwright 的 TS 轉譯）直接轉譯原始碼。
消費端 MUST 以 `@pickball/core/<area>/<module>`（例：`@pickball/core/matchmaker/round`）匯入，
SHALL NOT 以相對路徑（`../../packages/...`）或 tsconfig `paths` 別名跨越 workspace 邊界——繞過套件邊界的匯入會讓
「後端能否打包」與「前端能否轉譯」只在其中一個工具鏈成立。

`nextjs-pickball/next.config.ts` MUST 設定 `transpilePackages: ["@pickball/core"]`（Next.js 16 對 monorepo 本地套件的官方作法）。

`packages/pickball-core/test/module-boundary.test.ts` SHALL 維護核心模組清單 `CORE_MODULES`（相對 `src/`、不含副檔名），
並以測試驗證清單與 `src/` 下的實際 `.ts` 檔案（不含 `*.test.ts`）**完全一致**——之後任何 change 新增核心模組時 MUST 同步更新清單，
否則該測試轉紅。

#### Scenario: 核心模組清單與 src 實際檔案一致

- **GIVEN** `packages/pickball-core/src/` 下的 `.ts` 檔案（遞迴，不含 `*.test.ts`）
- **WHEN** 與 `CORE_MODULES` 排序後比對
- **THEN** 兩者完全相等，且清單長度 MUST 大於等於 18（擋掉兩邊皆空的恆真）
- **驗收**：`packages/pickball-core/test/module-boundary.test.ts`，it 名稱「核心模組清單與 src 實際檔案一致」

#### Scenario: 後端在 workerd 中可匯入並執行核心套件

- **GIVEN** `hono-pickball` 以 `workspace:*` 相依核心套件
- **WHEN** 在 workerd 測試中自 `@pickball/core/scoreboard/reducer` 匯入 `createInitialState`、自 `@pickball/core/scoreboard/types` 匯入 `ScoreboardStateSchema`、自 `@pickball/core/matchmaker/types` 匯入 `PlayerSchema`
- **THEN** `ScoreboardStateSchema.safeParse(createInitialState()).success` 為 `true`，且 `PlayerSchema.safeParse({}).success` 為 `false`
- **驗收**：`hono-pickball/test/pickball-core-import.test.ts`，it 名稱「workerd 中可匯入核心套件並以其 schema 驗證資料」

#### Scenario: 後端打包工具能解析核心套件

- **GIVEN** `hono-pickball/` 下一個只供本驗收使用、匯入 `@pickball/core/matchmaker/round` 並匯出 `fetch` 的暫存入口檔（驗收後刪除，不 commit）
- **WHEN** 以 `wrangler deploy --dry-run` 打包該入口
- **THEN** exit 0，輸出含 Total Upload
- **驗收**：tasks.md 指令驗收 C3 的實跑紀錄

#### Scenario: 前端正式建置與 OpenNext 建置能轉譯核心套件

- **WHEN** 依序執行 `pnpm --filter ./nextjs-pickball build` 與 `pnpm --filter ./nextjs-pickball exec opennextjs-cloudflare build`
- **THEN** 兩者皆 exit 0
- **驗收**：tasks.md 指令驗收 C4 的實跑紀錄

#### Scenario: E2E spec 能載入經由前端模組間接匯入的核心套件

- **WHEN** 執行 `pnpm --filter ./nextjs-pickball exec playwright test --list`
- **THEN** exit 0，列出的 test 數與搬移前相同（`matchmaker-data-transfer.spec.ts` 經 `roster-csv.ts` 載入核心套件時不出現模組解析或語法錯誤）
- **驗收**：tasks.md 指令驗收 C5 的實跑紀錄

### Requirement: 核心套件零瀏覽器 API 與零 I/O

`packages/pickball-core/src/**` SHALL 只含純資料定義（zod schema、型別、常數）與純函式：SHALL NOT 存取 `window`、`document`、
`localStorage`、`fetch`、計時器或任何 I/O，SHALL NOT 匯入 React 或任何前端／後端專屬模組。時間、id 等外部輸入沿用既有慣例由呼叫端注入。
`package.json` 的 `dependencies` MUST 只有 `zod`。

此約束 MUST 由工具在兩層強制，而非只靠審查：

1. **編譯期**：`packages/pickball-core/tsconfig.json` 的 `include` 只含 `src/`，`lib` MUST 為 `["ESNext"]`（不含 `DOM`）且 `types` 為空陣列——
   任何瀏覽器全域的使用都是型別錯誤；`typecheck` script 為 `tsc --noEmit && tsc --noEmit -p test/tsconfig.json`。
2. **執行期**：模組邊界測試在 vitest 的 `node` 環境中逐一動態匯入 `CORE_MODULES` 的每個模組，證明模組在**沒有任何瀏覽器全域**的環境下載入時不拋錯
   （頂層程式碼不得觸碰瀏覽器 API）。

`localStorage` 讀寫、`Blob` 下載等瀏覽器 I/O 維持 `nextjs-pickball/CLAUDE.md`「瀏覽器 I/O 擺放慣例」，留在前端 `lib/` 或元件層。

#### Scenario: 每個核心模組可在沒有瀏覽器全域的 node 環境載入

- **GIVEN** vitest `environment: "node"`，且 `globalThis.window`、`globalThis.document`、`globalThis.localStorage` 皆為 `undefined`
- **WHEN** 逐一 `await import()` `CORE_MODULES` 的每個模組
- **THEN** 每次匯入都成功，且每個模組至少有一個具名匯出
- **驗收**：`packages/pickball-core/test/module-boundary.test.ts`，it 名稱「每個核心模組可在沒有瀏覽器全域的 node 環境載入」

#### Scenario: 核心套件的型別檢查不含 DOM

- **WHEN** 檢查 `packages/pickball-core/tsconfig.json` 並執行 `pnpm --filter ./packages/pickball-core typecheck`
- **THEN** `lib` 為 `["ESNext"]`、`types` 為 `[]`、`include` 只含 `src`；指令 exit 0
- **驗收**：tasks.md 指令驗收 C2 的實跑與閱讀紀錄

### Requirement: 純搬移行為零變更

本次抽出 MUST 為純搬移：被搬移的 18 個模組以 `git mv` 移動且**檔案內容零修改**；前端其餘檔案（含測試檔與 E2E spec）**只允許**改寫
import 指定字串，SHALL NOT 改動任何 it／test 的名稱、斷言或 mock 內容。

被搬移模組的既有單元測試 SHALL 留在 `nextjs-pickball/lib/{scoreboard,matchmaker}/` 原位（改為自 `@pickball/core/...` 匯入受測模組），
理由是既有 spec 約 250 處「驗收」錨點以測試檔路徑定位，搬移測試會讓錨點全數失效；前端 vitest 執行這些測試同時證明了 Vite 能解析核心套件。
核心套件自身的 `test/` 只放套件層級的守衛（模組清單、載入邊界），新增的核心模組行為測試由後續 change 依其需要決定放在核心套件或消費端。

搬移後前端單元測試的檔數與測試數 MUST 與搬移前**完全相同**；`pnpm test` 的總數為「前端（不變）＋後端（＋1 檔）＋核心套件（新增）」。

#### Scenario: 被搬移的模組內容零修改

- **WHEN** 執行 `git diff -M100% --stat main -- packages/pickball-core/src nextjs-pickball/lib`（以 apply 分支對 `main`）
- **THEN** 18 個模組皆顯示為 100% 相似度的 rename，無任何內容差異
- **驗收**：tasks.md 指令驗收 C6 的實跑紀錄

#### Scenario: 前端既有檔案只改 import 指定字串

- **WHEN** 對 `nextjs-pickball/` 下每個被修改的既有檔案取 `git diff -U0 main`，過濾掉 `import`／`export … from` 所在行的增刪
- **THEN** 沒有任何剩餘的增刪行（`next.config.ts` 與 `package.json` 除外，兩者屬設定層、另行審查）
- **驗收**：tasks.md 指令驗收 C6 的實跑紀錄

#### Scenario: 前端測試數與基線相同

- **WHEN** 執行 `pnpm --filter ./nextjs-pickball test --run`
- **THEN** 測試檔數與測試數皆等於 apply Step 0 記錄的基線，全數通過
- **驗收**：tasks.md 指令驗收 C1 的實跑紀錄

### Requirement: 既有規格中舊模組路徑的對照

既有主 spec 中出現的下列路徑（「實作位於…」或文字敘述），自本 change 起 SHALL 解讀為右欄的新位置；**測試檔路徑不在此表**（測試檔未搬移，錨點照舊有效）。

| 舊路徑（主 spec 中的寫法） | 新位置 |
|---|---|
| `nextjs-pickball/lib/scoreboard/types.ts` | `packages/pickball-core/src/scoreboard/types.ts` |
| `nextjs-pickball/lib/scoreboard/rules.ts` | `packages/pickball-core/src/scoreboard/rules.ts` |
| `nextjs-pickball/lib/scoreboard/reducer.ts` | `packages/pickball-core/src/scoreboard/reducer.ts` |
| `nextjs-pickball/lib/matchmaker/types.ts` | `packages/pickball-core/src/matchmaker/types.ts` |
| `nextjs-pickball/lib/matchmaker/allocation-types.ts` | `packages/pickball-core/src/matchmaker/allocation-types.ts` |
| `nextjs-pickball/lib/matchmaker/allocation.ts` | `packages/pickball-core/src/matchmaker/allocation.ts` |
| `nextjs-pickball/lib/matchmaker/candidates.ts` | `packages/pickball-core/src/matchmaker/candidates.ts` |
| `nextjs-pickball/lib/matchmaker/duplication.ts` | `packages/pickball-core/src/matchmaker/duplication.ts` |
| `nextjs-pickball/lib/matchmaker/pairing.ts` | `packages/pickball-core/src/matchmaker/pairing.ts` |
| `nextjs-pickball/lib/matchmaker/rating-math.ts` | `packages/pickball-core/src/matchmaker/rating-math.ts` |
| `nextjs-pickball/lib/matchmaker/rating-types.ts` | `packages/pickball-core/src/matchmaker/rating-types.ts` |
| `nextjs-pickball/lib/matchmaker/rating.ts` | `packages/pickball-core/src/matchmaker/rating.ts` |
| `nextjs-pickball/lib/matchmaker/labels.ts` | `packages/pickball-core/src/matchmaker/labels.ts` |
| `nextjs-pickball/lib/matchmaker/round-types.ts` | `packages/pickball-core/src/matchmaker/round-types.ts` |
| `nextjs-pickball/lib/matchmaker/round.ts` | `packages/pickball-core/src/matchmaker/round.ts` |
| `nextjs-pickball/lib/matchmaker/history.ts` | `packages/pickball-core/src/matchmaker/history.ts` |
| `nextjs-pickball/lib/matchmaker/history-range.ts` | `packages/pickball-core/src/matchmaker/history-range.ts` |
| `nextjs-pickball/lib/matchmaker/transfer-types.ts` | `packages/pickball-core/src/matchmaker/transfer-types.ts` |

之後的 change 以 MODIFIED 改寫任何引用上表舊路徑的 Requirement 時，MUST 在同一份 delta 內把該 Requirement 的路徑改為新位置；
SHALL NOT 為了改路徑而單獨大量 MODIFIED 既有 Requirement（MODIFIED 必須複製整段內容，大量複製本身就是漂移來源）。
本表 18 列的新位置 MUST 皆列於 `CORE_MODULES`（之後的 change 新增的核心模組不在本表，因為它們沒有舊路徑）。

#### Scenario: 對照表涵蓋所有被搬移的模組

- **WHEN** 比對本表右欄與 `packages/pickball-core/test/module-boundary.test.ts` 的 `CORE_MODULES`
- **THEN** 本表 18 列與 `CORE_MODULES` 於本 change 合併時的 18 項逐一對應，無多無漏（之後的 change 只會在 `CORE_MODULES` 增加本表以外的新模組）
- **驗收**：tasks.md 指令驗收 C6 的核對紀錄（以腳本抽出本表右欄與 `CORE_MODULES` 比對）

#### Scenario: 舊路徑已不存在且未留下轉址殼

- **WHEN** 列出 `nextjs-pickball/lib/scoreboard/` 與 `nextjs-pickball/lib/matchmaker/` 的非測試檔
- **THEN** 表中 18 個舊路徑皆不存在；前端沒有任何「只做 re-export」的轉址檔指向核心套件
- **驗收**：tasks.md 指令驗收 C6 的實跑紀錄
