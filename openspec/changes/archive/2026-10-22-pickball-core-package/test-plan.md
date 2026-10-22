# Test Plan: pickball-core-package

> **RED-phase 承諾書**。只寫「先寫哪些測試、斷言什麼、為什麼先寫」，不寫實作邏輯。
>
> Tier：
> - `unit`：`packages/pickball-core/test/**`，vitest `environment: "node"`，不碰網路與檔案以外的 I/O。
> - `integration`：`hono-pickball/test/**`，跑在 workerd（`@cloudflare/vitest-pool-workers`）。
> - `e2e`：本 change **不新增** E2E；既有 E2E 為 regression guard（C7）。
>
> 本 change 是**純搬移**：既有前端單元測試（含被搬模組留在 `nextjs-pickball/lib/**` 原位的測試）與既有 E2E 是行為零變更的 regression guard，
> 只允許改 import 指定字串。新增測試只有兩支，皆在對應程式碼／套件**不存在**時寫下，紅燈是「模組或套件不存在」——真紅燈。
>
> **it 名稱 MUST 與 delta spec 的「驗收」錨點逐字一致。**
>
> **後端 API 授權覆蓋表**：本 change 不新增任何後端端點（N/A）；`hono-pickball/src/**` 零改動（Final Reviewer 以 diff 確認）。

## pickball-core

### Requirement: 共用核心套件的位置、名稱與匯出方式

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| 核心模組清單與 src 實際檔案一致 | 核心模組清單與 src 實際檔案一致 | 遞迴列出 `src/**/*.ts`（排除 `*.test.ts`）、去副檔名、排序後 `toEqual` 排序後的 `CORE_MODULES`；另斷言 `CORE_MODULES.length >= 18` | golden path：清單是對照表與之後 change 新增模組的唯一機械錨點；先寫時 `src/` 不存在 → 紅（ENOENT） | unit |
| workerd 中可匯入核心套件並以其 schema 驗證資料 | 後端在 workerd 中可匯入並執行核心套件 | `ScoreboardStateSchema.safeParse(createInitialState()).success === true`；`PlayerSchema.safeParse({}).success === false` | 跨 workspace 解析的最大風險點（vitest-pool-workers 對 symlink 套件）；先寫時後端未宣告相依 → 紅（模組解析失敗） | integration |

### Requirement: 核心套件零瀏覽器 API 與零 I/O

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| 每個核心模組可在沒有瀏覽器全域的 node 環境載入 | 每個核心模組可在沒有瀏覽器全域的 node 環境載入 | 先斷言 `globalThis.window`／`document`／`localStorage` 為 `undefined`（環境前提）；對 `CORE_MODULES` 逐一 `await import(\`../src/${m}.ts\`)` 不拋錯，且 `Object.keys(mod).length > 0` | edge case：頂層副作用觸碰瀏覽器 API 時只有執行期能抓到；先寫時模組不存在 → 紅 | unit |

### Requirement: 純搬移行為零變更

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| （既有前端單元測試全體，regression guard） | 前端測試數與基線相同 | 檔數與測試數等於 Step 0 基線、全數通過 | 行為零變更的主要證據；搬移前後各跑一次 | unit |

## dev-workflow

### Requirement: 根層彙總指令必須涵蓋所有 workspace／部署前品質門檻

設定層與文件，以指令驗收 C1、C2、C4、C8 確認（見下表）。

## 指令驗收（非 Vitest，tasks 中標為「驗收（指令）」）

| # | 對應 Scenario | 指令 | 期望 |
|---|---|---|---|
| C1 | 前端測試數與基線相同；root test 涵蓋前後端（含核心套件） | `pnpm test` | 三組統計皆出現；前端檔數／測試數＝基線；後端＝基線＋1 檔／＋1 測試；核心套件 1 檔／2 測試；全綠 |
| C2 | 核心套件的型別檢查不含 DOM；核心套件 typecheck 涵蓋測試檔 | 閱讀 `packages/pickball-core/tsconfig.json`；`pnpm --filter ./packages/pickball-core typecheck`；`pnpm -r exec tsc --noEmit`；`pnpm --filter ./hono-pickball typecheck` | `lib` 為 `["ESNext"]`、`types` 為 `[]`、`include` 為 `["src"]`；四段皆 exit 0 |
| C3 | 後端打包工具能解析核心套件 | 建立 `hono-pickball/.core-bundle-check.ts`（匯入 `@pickball/core/matchmaker/round` 的 `submitScore` 並在 `fetch` 中引用、匯出 `default { fetch }`），執行 `pnpm --dir <repo>/hono-pickball exec wrangler deploy --dry-run .core-bundle-check.ts --outdir <mktemp -d 的目錄>`，之後刪除兩者 | exit 0、輸出含 `Total Upload`；`git status --porcelain` 不列出暫存檔 |
| C4 | 前端正式建置與 OpenNext 建置能轉譯核心套件；root build 涵蓋前後端（含核心套件） | `pnpm build`；`pnpm --filter ./nextjs-pickball exec opennextjs-cloudflare build` | 皆 exit 0；`pnpm build` 輸出含三個 workspace 的 build 段與 `Total Upload` |
| C5 | E2E spec 能載入經由前端模組間接匯入的核心套件 | `pnpm --filter ./nextjs-pickball exec playwright test --list` | exit 0；總數等於 §1 記錄的搬移前數字 |
| C6 | 被搬移的模組內容零修改；前端既有檔案只改 import 指定字串；舊路徑已不存在且未留下轉址殼；對照表涵蓋所有被搬移的模組 | `git diff -M100% --name-status main -- packages/pickball-core/src nextjs-pickball/lib`；對每個被修改的前端既有檔案 `git diff -U0 main -- <f>` 過濾 `^[-+](import\|export).*from \|^[-+]\s+.*from "` 之外的增刪行；`ls` 18 個舊路徑 | 18 列皆為 `R100`；過濾後無剩餘增刪（`next.config.ts`、`package.json` 除外）；舊路徑皆不存在、`grep -rln "export \* from \"@pickball/core" nextjs-pickball` 無輸出；change 內 `specs/pickball-core/spec.md` 對照表右欄（去掉 `packages/pickball-core/src/` 與 `.ts`）排序後等於排序後的 `CORE_MODULES` |
| C7 | （訪客零迴歸）既有 E2E 原樣通過 | 依 project 分開執行（runbook 教訓 14）：chromium／firefox／mobile-chrome 各一次 `--workers=1`；webkit／mobile-safari 各以 `--shard=i/3` 分三次 | 合計 passed／skipped 與基線相同（B3 後為 667／38）、0 failed |
| C8 | 檢查清單存在且可執行 | 閱讀 root `README.md`「部署前手動檢查清單」 | 含核心套件單元測試一步，順序仍由快到慢 |
| C9 | （lint） | `pnpm lint` | 0 errors、warning 不多於基線（3） |
| C10 | （規格） | `DO_NOT_TRACK=1 openspec validate pickball-core-package --strict` | valid |

## Checklist

- [x] 每個新增 Requirement 至少一列（測試或指令驗收）
- [x] 新增測試的紅燈原因皆為「模組／套件不存在」，非 mutation
- [x] 既有測試只當 regression guard，不新增、不修改斷言
- [x] 本 change 無後端端點，授權覆蓋表標 N/A
