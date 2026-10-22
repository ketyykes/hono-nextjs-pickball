# Design: pickball-core-package

## Context

- runbook 裁決 D1 = (a)：新增第三個 workspace `packages/pickball-core`，純 TS＋zod，前後端都 import。B5 起後端要以共用 schema 驗證寫入（D2），
  B7 要在後端權威執行 `submitScore`（評分＋歷史），B8 要用同一份 `history-range` 區間切點，B9 要用 `BackupSchema`。
- 目前這些模組全在 `nextjs-pickball/lib/{scoreboard,matchmaker}/`，以相對路徑互相匯入；前端其他檔案以 `@/lib/...` 匯入（main@414d822 以 grep 盤點：
  84 個檔案、其中 40 個測試檔；E2E 只有 `scoreboard-binding.spec.ts` 一個 type-only import 直接指向被搬模組，另 `matchmaker-data-transfer.spec.ts`
  經 `roster-csv.ts` 間接載入）。
- 既有主 spec 以「驗收：`nextjs-pickball/lib/.../*.test.ts`」定位測試，被搬模組的測試錨點約 250 處（`round.test.ts` 56、`rating.test.ts` 30、`reducer.test.ts` 19…）；
  另有約 40 處「實作位於 `nextjs-pickball/lib/...`」的模組路徑敘述。
- 工具鏈：前端 TS 5.9／Next.js 16.2.9（Turbopack，`turbopack.root` 與 `outputFileTracingRoot` 已指向 monorepo root）／Vitest 4.1.8（happy-dom）／
  Playwright 1.60（以 CJS 載入 spec，B3 Open Questions 第 5 條）；後端 TS 6.0.3／wrangler 4.99／`@cloudflare/vitest-pool-workers` 0.16.13（Vite）。
  zod 兩端皆為 `^4.4.3`（lockfile 解析為 4.4.3）。
- 被搬模組的程式碼**沒有**任何 `console`、計時器、`crypto`、`globalThis`、瀏覽器全域的實際使用（main@414d822 以 grep 排除註解後確認），
  因此能在不含 DOM 的 `lib` 下通過型別檢查。
- Stop hook 在主 worktree 會以 exit 2 擋下 tsc 失敗；本批 apply 在主 repo 進行，所以「搬檔」與「改 import」必須在同一個 commit 內完成，不能留下中間的紅 tsc 狀態跨越 session 停止點。

## Goals

- 後端（B5～B9）能以 `@pickball/core/...` 匯入 schema 與純函式，wrangler 與 vitest-pool-workers 皆能解析。
- 前端行為零變更：既有單元測試與 E2E 原樣通過，前端測試數不變。
- 「零瀏覽器 API」由工具強制，不靠審查。
- 給 B5～B9 一個清楚的落點：共用契約（API envelope、路徑常數）加在核心套件。

## Non-Goals

- 任何行為、API、資料表變更；搬移只有前端用的純函式；改寫被搬模組的內容或註解；Workers Builds 的遠端驗證（G1）。

## Decisions

### Decision 1：`exports` 直接指向原始碼，不建置

**Choice**：`packages/pickball-core/package.json`：`"name": "@pickball/core"`、`"private": true`、`"exports": { "./*": "./src/*.ts" }`、
`"dependencies": { "zod": "^4.4.3" }`；**不設 `"type"`**（見 Decision 6）。前端 `next.config.ts` 加 `transpilePackages: ["@pickball/core"]`。

**Rationale**：
- Context7（`/vercel/next.js/v16.2.9`，`docs/01-app/03-api-reference/05-config/01-next-config-js/transpilePackages.mdx`、`docs/03-architecture/nextjs-compiler.mdx`）：
  「Next.js can automatically transpile and bundle dependencies from local packages, such as those in monorepos」，設定為 `transpilePackages: ['@acme/ui']`。
  文件未區分 webpack／Turbopack，Next.js 16 預設 Turbopack，`turbopack.root` 已是 monorepo root，`packages/` 在其範圍內。
- Context7（`/websites/pnpm_io`，Workspace 協定）：`workspace:*` 讓 pnpm「refuse to resolve to anything other than a local workspace package」，連結為 symlink。
- Vite（前端 vitest 與 vitest-pool-workers）與 wrangler 的 esbuild 皆以 realpath 解析 symlink，`packages/pickball-core/src` 不在 `node_modules` 內，會被當作原始碼轉譯。
  Context7（`/cloudflare/workers-sdk`，`fixtures/vitest-plugin-examples/module-resolution/README.md`）只記載 CJS／UMD 套件需要 `deps.optimizer.ssr` 預打包；
  本套件為 ESM 語法的 TS 原始碼，**預期不需要**任何額外設定——以後端 workerd 測試實證（tasks 3.1），失敗時才依該文件加 `deps.optimizer`，並記入 Open Questions。
- OpenNext：Context7（`/websites/opennext_js`）的 monorepo 指引要求 `outputFileTracingRoot` 指向 repo root——本專案 `next.config.ts` 已設定；
  transpilePackages 後核心套件被打進 Next 的 server chunk，OpenNext 不需另外處理。以 `opennextjs-cloudflare build` 實證（C4）。

**Alternatives considered**：
- 以 tsup 等建置 `dist/`：多一個建置步驟與新相依，且 dev 時要 watch；本套件只有兩個內部消費者。不選。
- tsconfig `paths` 別名指向 `../packages/...`：只有 tsc 與部分工具認得，wrangler／Playwright 需各自設定，且繞過了 pnpm 的相依宣告。不選。
- 列舉每個子路徑的 `exports`：之後每加一個模組都要改 `package.json`；單一樣式 `./*` 已足夠，模組清單由邊界測試守住（Decision 5）。不選。

### Decision 2：搬移範圍＝後端需要的模組及其遞移相依（18 個）

**Choice**：`scoreboard/{types,rules,reducer}`；`matchmaker/{types,allocation-types,allocation,candidates,duplication,pairing,rating-math,rating-types,rating,labels,round-types,round,history,history-range,transfer-types}`。

**Rationale**：
- 後端需求逐一對應：B5 `ScoreboardStateSchema`；B6 `PlayerSchema`；B7 `RoundSchema`、`submitScore`（`round.ts`）；B8 `history-range`；B9 `BackupSchema`（`transfer-types.ts`）。
  runbook B4 另列 reducer／rules（計分板純函式），一併搬入，使計分規則只有一份。
- 遞移閉包以實際 import 圖計算（`round.ts` → `allocation`、`duplication`、`pairing`、`rating`、`labels`、`history`…；`allocation` → `candidates`）；
  閉包內**沒有**任何模組匯入前端專屬模組，跨 area 也只有 scoreboard／matchmaker 各自內部的相對 import——所以 `git mv` 後內容零修改即可編譯。
- 留在前端：`roster`（依賴 `colors`；B6 後端只需驗證 `PlayerSchema`，不需重算名單操作）、`colors`（E2E `scoreboard-binding.spec.ts` 直接匯入，搬了會擴大 Playwright 風險）、
  `roster-csv`／`csv`／`history-csv`（解析與匯出在前端做）、`player-stats`（B8 自行決定是否搬）、`round-settings`、`round-timer`、`rating-bounds`、`stage-layout`、`tile-style`、
  `export-scene`、`scoreboard-binding`、`section-nav`、`print-guard`、`export-filename`，以及所有 storage 模組。

**Alternatives considered**：
- 搬全部純函式：擴大 diff 與路徑對照表、把 UI 專屬邏輯（配色、匯出版面）放進共用套件，且無消費者。不選。
- 只搬 schema：B7 後端權威 `submitScore` 需要 `round.ts` 全閉包，B7 屆時仍要搬一次。不選。

### Decision 3：被搬模組的單元測試留在前端原位

**Choice**：`nextjs-pickball/lib/**/*.test.ts` 不移動，只把受測模組的 import 改為 `@pickball/core/...`；核心套件的 `test/` 只放套件層守衛。

**Rationale**：主 spec 約 250 處驗收錨點以測試檔路徑定位，搬測試會讓它們全數失效（要嘛大量 MODIFIED、要嘛靠對照表間接指路，後者讓 Reviewer 找不到測試）。
留在原位時：錨點照舊有效、runbook B4 驗收「前端單元測試數不減」字面成立、前端 vitest 執行這些測試同時證明了 Vite 能解析核心套件。
代價是「測試與受測碼不在同一個 workspace」——寫進三份 `CLAUDE.md`，避免後人以為是漏搬。

**Alternatives considered**：
- 測試跟著搬進核心套件（在 node 環境執行）：與 runbook「前端測試數不減」衝突，且錨點大量失效。不選。

### Decision 4：既有 spec 的舊模組路徑以對照表處理，不大量 MODIFIED

**Choice**：`pickball-core` capability 新增「既有規格中舊模組路徑的對照」Requirement（18 列）。之後的 change 修改到引用舊路徑的 Requirement 時，同一份 delta 內順手改成新路徑。

**Rationale**：MODIFIED 必須複製整段 Requirement；為了約 40 處路徑敘述而複製 `round-lifecycle`、`match-rating`、`scoreboard` 等十幾個大型 Requirement，
本身就是漂移與 archive 覆寫的來源（runbook「主 spec 不可直接編輯」的教訓）。對照表是唯一、可機械核對（與 `CORE_MODULES` 一致）的來源。

**Alternatives considered**：全面 MODIFIED（見上，不選）；放著不管（之後的 agent 會照舊路徑找檔案，失敗是沉默的；不選）。

### Decision 5：零瀏覽器 API 由「無 DOM 的 tsc」＋「node 環境的模組邊界測試」強制

**Choice**：
- `packages/pickball-core/tsconfig.json`：`strict`、`verbatimModuleSyntax`、`isolatedModules`、`module: "esnext"`、`moduleResolution: "bundler"`、`target: "ES2022"`、
  `lib: ["ESNext"]`、`types: []`、`noEmit`、`skipLibCheck`、`include: ["src"]`。
- `test/tsconfig.json` 繼承上者，`types: ["node"]`、`include: ["."]`（測試要讀檔案系統）；`typecheck` = 兩段 tsc；`build` = `tsc --noEmit`；`test` = `vitest`。
- `vitest.config.ts`：`environment: "node"`、`include: ["test/**/*.test.ts"]`，不開 globals（與後端一致，顯式 import）。
- `test/module-boundary.test.ts`：`CORE_MODULES` 清單＋兩個 it（清單與檔案一致；node 環境逐一動態匯入且皆有具名匯出）。
- devDependencies：`typescript`（`^5`，與前端同）、`vitest`（`^4.1.5`，與前端同）、`@types/node`（`^20`，與前端同）——皆為 lockfile 既有套件。

**Rationale**：型別層擋「使用」，執行層擋「頂層副作用」，兩者互補；文字掃描會被註解（被搬模組的註解大量提到 `localStorage`、`Date.now()`）誤判。
後端 tsconfig 同樣是 `lib: ["ESNext"]`，B5 起後端匯入核心套件時多一道防線。前端 tsc 也會編譯核心套件（含 DOM lib），不影響上述保證。

**Alternatives considered**：ESLint `no-restricted-globals`（核心套件不在前端 ESLint 範圍、要另建設定）；原始碼文字掃描（誤判註解）。不選。

### Decision 6：核心套件的 `package.json` 不設 `"type": "module"`

**Choice**：比照 `nextjs-pickball/package.json`（沒有 `type` 欄位）。

**Rationale**：Playwright 以 CJS 載入 E2E spec 與其匯入鏈（B3 Open Questions 第 5 條：helper 用 `__dirname`），`matchmaker-data-transfer.spec.ts` → `roster-csv.ts` →
`@pickball/core/matchmaker/transfer-types`。套件若宣告 `"type": "module"`，`.ts` 檔會被視為 ESM，Playwright 的 CJS 轉譯鏈要改走 ESM loader，風險未知；
不設 `type` 時其行為與前端自身的 `.ts` 檔完全相同。Next.js／Vite／esbuild 對原始碼的 ESM 語法不依賴此欄位。
Context7（`/websites/playwright_dev`，`docs/test-typescript`）：Playwright 對「每個被載入的原始檔」各自找最近的 `tsconfig.json`，只支援 `allowJs`／`baseUrl`／`paths`／`references`／`extends`；
文件**沒有**明說是否轉譯 `node_modules` 下的檔案。pnpm 的 workspace 連結是 symlink，Node 的 CJS 解析預設取 realpath（`packages/pickball-core/src/...`，路徑不含 `node_modules`），
推論 Playwright 會把它當一般原始碼轉譯——屬未經文件證實的推論，以 `playwright test --list`（C5）實證；若仍失敗，依 Escalation 上報，不得以把 `roster-csv` 改回相對路徑等方式繞過。

**Alternatives considered**：`"type": "module"`（與後端一致，但 Playwright 風險較高）。不選。

### Decision 7：後端在 B4 只以測試與暫存入口驗證，不動 `src/**`

**Choice**：`hono-pickball/package.json` 加相依；新增 `test/pickball-core-import.test.ts`（workerd 中匯入並執行）；
另以 `hono-pickball/.core-bundle-check.ts`（暫存、不 commit）跑 `wrangler deploy --dry-run <入口> --outdir <暫存目錄>` 驗證 esbuild 打包（C3）。

**Rationale**：B4 承諾「行為零變更」，後端 `src/**` 匯入核心套件要等 B5 有真正的用途；但 B5 開工時才發現打包不了就太晚——兩種驗證都在 B4 做掉。

### Decision 8：前端直接改寫 import，不留 re-export 轉址殼

**Choice**：84 個檔案的 `@/lib/scoreboard/{types,rules,reducer}`、`@/lib/matchmaker/<18 之一>` 與 `lib/` 內同層相對 import（`./round` 等）一律改為 `@pickball/core/<area>/<module>`。
以腳本機械改寫（tasks 2.4 規定的核對方式），不留 `nextjs-pickball/lib/matchmaker/round.ts` 之類的 `export * from` 殼。

**Rationale**：轉址殼會讓 B5～B9 的作者誤以為邏輯還在前端（本 repo 既有的 re-export 先例是「key 常數搬家」這種同 workspace 的細節，與跨 workspace 的邏輯歸屬不同）；
「只改 import 指定字串」可以用 diff 機械驗證（C6）。

**Alternatives considered**：轉址殼（diff 最小，但兩個名字指向同一模組、歸屬不清）。不選。

## Risks / Trade-offs

- **[Risk] Playwright 載入 workspace 套件 `.ts` 失敗**（`matchmaker-data-transfer.spec.ts` 間接匯入）→ Mitigation：§1 先以 `playwright test --list` 取得基線、§4 再跑一次比對（C5）；失敗即停止上報。
- [Risk] Turbopack dev 或 `next build` 對 symlink workspace 套件的解析問題 → Mitigation：`transpilePackages`＋既有 `turbopack.root`；C4 實跑 `next build` 與 OpenNext build；完整 E2E（dev server）為最終驗收。
- [Risk] vitest-pool-workers 未轉譯 symlink 套件（被視為外部相依）→ Mitigation：tasks 3.1 的 workerd 測試直接暴露；依 Context7 module-resolution 範例加 `deps.optimizer.ssr.include` 並記錄。
- [Risk] 前端 `tsconfig` 的 `include: ["**/*.ts"]` 不涵蓋 `packages/`，但被匯入的檔案仍會被編譯，前端 tsc（含 DOM lib）不會抓到核心套件誤用瀏覽器 API → Mitigation：Decision 5 的核心套件自身 tsc。
- [Risk] 編輯 `packages/**` 時 root 的逐檔 ESLint hook 會以前端設定空跑（路徑含 `nextjs-pickball` 字樣，輸出 "File ignored"）→ 無害，記入核心套件 `CLAUDE.md`。
- [Risk] Workers Builds 的 root directory（`nextjs-pickball`／`hono-pickball`）下 `pnpm install` 能否解析 `packages/` → 只能在遠端驗證，**G1 使用者步驟第 5 點**；本棒不 push（D4）。
- [Risk] 2.1 建立核心套件 tsconfig 後、2.3 搬入模組前，`src/` 不存在，核心套件 `tsc` 回 TS18003（no inputs），主 repo 的 Stop hook 會以 exit 2 擋下 →
  Mitigation：tasks.md 規定 2.1～2.3 由同一個 Implementer 在一次派工內完成，leader 在 §2 交件前不結束回合。
- [Trade-off] 測試與受測碼分屬不同 workspace（Decision 3）。
- [Trade-off] 主 spec 留有舊路徑字面值，靠對照表解讀（Decision 4）。

## Migration Plan

- 合併後：`pnpm install` 一次（建立 workspace 連結）；之後一切指令照舊，root `pnpm test`／`pnpm build` 多出核心套件那一段。
- **不 push**（D4）。回滾：revert 合併 commit 後 `pnpm install`。

## apply §1 查證紀錄

（2026-10-22，apply leader 實跑；`main`@`cc5c1c1`）

### 1.2 盤點

- 以 grep 掃 `nextjs-pickball/` 全部 `.ts`／`.tsx`／`.mts`／`.js`／`.mjs`（排除 `node_modules`、`.next`、`.open-next`），收集「模組指定字串指向 18 個被搬模組」的檔案：
  `@/lib/scoreboard/<3>`、`@/lib/matchmaker/<15>`、`lib/scoreboard/` 與 `lib/matchmaker/` 內的同層 `./<被搬模組>`，以及 `../scoreboard/<被搬模組>`。
  扣除 18 個被搬模組本身後為 **84 個檔案**（與 main@414d822 盤點一致）：其中 **40 個單元測試檔＋1 個 E2E**（`tests/e2e/specs/scoreboard-binding.spec.ts`，
  `import type { TeamPlayers } from "@/lib/scoreboard/types"`）；84 檔中 46 檔位於 `lib/{scoreboard,matchmaker}/`。
- **與 design／tasks 敘述的差異**：除 `@/lib/...` 與同層 `./...` 外，另有 **3 個檔案以跨 area 相對路徑 `../scoreboard/...` 匯入被搬模組**——
  `lib/matchmaker/scoreboard-binding.ts`（`../scoreboard/reducer`、`../scoreboard/types`）、`lib/matchmaker/round-types.test.ts`（`../scoreboard/types`）、
  `lib/matchmaker/scoreboard-binding.test.ts`（`../scoreboard/reducer`）。Decision 8 與 tasks 2.3 ② 只列「`@/lib/...` 與同層相對 import」，
  但這 3 處同樣必須改寫為 `@pickball/core/scoreboard/...`（搬移後舊路徑不存在）；已計入 84 檔，§2 派工單明確告知 Implementer。
- 18 個被搬模組的 import 只有 `zod` 與同 area 的 `./<被搬模組>`：**沒有**跨 area 匯入、**沒有**匯入任何留在前端的模組——遞移閉包成立，`git mv` 後內容零修改即可編譯。
- `vi.mock`／`vi.doMock` 指向被搬模組：**0 處**。非 `from "..."` 形式（動態 `import()`、`require`）指向被搬模組：**0 處**。
- 被搬模組去除註解後掃 `window`／`document`／`localStorage`／`fetch`／`setTimeout`／`setInterval`／`console`／`crypto`／`globalThis`／`Date.now`／`Math.random`：**0 處**。

### 1.3 Context7 查證

| Library ID | 查證項目 | 結果 | 與 design 的關係 |
|---|---|---|---|
| `/vercel/next.js/v16.2.9` | `transpilePackages` 對 Turbopack dev 與 build 的適用 | `docs/01-app/03-api-reference/05-config/01-next-config-js/transpilePackages.mdx`：「automatically transpile and bundle dependencies from local packages, such as those in monorepos」；`docs/03-architecture/nextjs-compiler.mdx` 範例 `transpilePackages: ['@acme/ui', ...]`。文件不區分 webpack／Turbopack，也不區分 dev／build | 與 Decision 1 一致；Turbopack dev／build 實際行為以 C4（`next build`、OpenNext）與 C7（dev server E2E）實證 |
| `/cloudflare/workers-sdk` | vitest-pool-workers 對 workspace symlink 套件的解析、`deps.optimizer` | `fixtures/vitest-plugin-examples/module-resolution/README.md`：`deps.optimizer.ssr.include` 只針對「CommonJS 或 UMD 套件」出現 `Cannot use require() to import an ES Module`／`No such module` 時使用；`packages/vitest-plugin/AGENTS.md`：`cloudflareTest()` 設定 resolve conditions `workerd`／`worker`／`browser` | 與 Decision 1 一致：ESM 語法的 TS 原始碼預期不需 `deps.optimizer`；核心套件 `exports` 為單一字串樣式、不含 conditions，不受 resolve conditions 影響。以 tasks 3.1／3.2 實證 |
| `/microsoft/playwright` | TS spec 匯入 workspace 套件 `.ts` 的轉譯行為 | `packages/playwright/src/transform/compilationCache.ts` 的 `belongsToNodeModules(file)`：**以絕對路徑是否含 `/node_modules/` 判斷**；`transform.ts` 的 `shouldTransform` 是唯一閘門（不看 testDir）；CJS loader（`pirates.ts`）與 ESM loader 皆先經此閘門，落在 `node_modules` 的檔案交給 Node 原生載入、**不做 TS 轉譯** | **補強 Decision 6 的推論**：關鍵在 Node 解析出的路徑。pnpm workspace 連結是 symlink，Node CJS 解析預設取 realpath（`packages/pickball-core/src/...`，不含 `node_modules`）→ 會被轉譯。若某工具以 `--preserve-symlinks` 執行則會走 `nextjs-pickball/node_modules/@pickball/core/...` 而**不轉譯、直接失敗**——本 repo 未使用該旗標。以 C5（`playwright test --list`）實證 |
| `/websites/opennext_js` | monorepo | `aws/config/nx`：`outputFileTracingRoot` 必須指向 repo root 才能偵測 monorepo；`aws/inner_workings/architecture`：monorepo 輸出結構。Cloudflare 頁面無額外 workspace 套件設定 | 與 Decision 1 一致（`next.config.ts` 已設 `outputFileTracingRoot`）；以 C4 實證 |

## Open Questions

1. 既有漂移（非本 change 造成）：`dev-workflow`「根層彙總指令必須涵蓋所有 workspace」要求每個 workspace 都有 `typecheck` script，但 `nextjs-pickball/package.json` 沒有；
   root `typecheck` 走 `pnpm -r exec tsc --noEmit` 所以實際未漏檢。本 change 不補（範圍外），留待文件同步類 change 處理。
2. vitest 在核心套件的 peer 組合（無 happy-dom／coverage／ui）可能讓 lockfile 多一個 `vitest@4.1.8(...)` 解析變體；套件與版本不變。§1 實測後記錄於此。
3. B7 若需要 `roster.ts` 的 `updatePlayer` 語意（rating round）在後端重算，屆時連同 `colors.ts` 一起搬入並更新對照表與 `CORE_MODULES`。
4. 核心套件不在任何 ESLint 設定範圍內（root `pnpm lint` 只跑 `nextjs-pickball`），被搬的 18 個模組因此失去 lint 覆蓋；以核心套件的 strict tsc 彌補。
   為核心套件加 ESLint 屬新設定，本 change 不做，留待需要時另提。
5. （apply §1.2 發現）跨 area 相對 import `../scoreboard/{reducer,types}` 共 3 檔（見「apply §1 查證紀錄」），Decision 8／tasks 2.3 ② 的列舉未涵蓋；
   處置：同樣改寫為 `@pickball/core/scoreboard/...`，屬「只改 import 指定字串」範圍內，不影響 C6 驗收。
6. （apply §1.2 發現）`nextjs-pickball/app/emojiFree.test.ts` 的 `SCAN_DIRS` 為 `app`／`components`／`data`／`lib`／`hooks`（相對 `nextjs-pickball/`），
   搬移後 18 個核心模組（含 `labels.ts` 的 `FORMAT_LABEL` 等介面文字）**不再受 emoji 守門掃描**。本 change 規定不得修改既有測試，故不擴大其掃描範圍；
   留待後續 change 決定是否把 `../packages/pickball-core/src` 納入，或在核心套件加同類守衛。
7. （apply §1.3）Playwright 是否轉譯 workspace 套件取決於「解析後的絕對路徑是否含 `/node_modules/`」（見查證紀錄），與 Decision 6 推論一致但條件更明確；
   未來若有人為任何工具加 `--preserve-symlinks`／`NODE_PRESERVE_SYMLINKS=1`，E2E 會在載入核心套件時失敗。記入核心套件 `CLAUDE.md`。
8. （apply §2）RED `b750e1b` 的測試檔在核心套件無 DOM 的 `test/tsconfig.json` 下有型別錯誤（`globalThis.window` → TS7017），GREEN `3c9aed4` 以 `Reflect.get(globalThis, "window")` 等價改寫。
   Stage 1 判定為流程偏差（GREEN 改了測試）；leader 裁定接受：斷言語意不變、紅燈原因（`src/` 不存在）已機械複驗。教訓：無 DOM lib 的套件寫 RED 時，先跑該套件 `typecheck` 再 commit。
9. （apply §2，回填 Open Questions 2）實測 lockfile：核心套件 importer 的 vitest 解析為與前端相同的 `4.1.8(...)` 變體，**未**產生新解析變體；`packages:`／`snapshots:` 段零改動
   （`pnpm install` 曾展開 3 處 `eslint-plugin-import` 快照鍵的 peer 後綴，`9b41602` 已還原且 `pnpm install`／`--frozen-lockfile` 皆不再改寫）。
10. （apply §2 Stage 2 建議，不擋）前端（含測試與 E2E）註解約 20 處、被搬模組自身註解（如 `labels.ts` 第 1 行）仍寫舊路徑 `lib/matchmaker/...`／`lib/scoreboard/...`；
    依 Non-Goals 本 change 不改，路徑以 `pickball-core` 對照表解讀，留待後續 change 統一更新。另：`module-boundary.test.ts` 的 `export const CORE_MODULES` 目前無外部匯入者、
    `Reflect.get(globalThis, "window")` 可補一行註解說明 TS7017——皆屬可讀性建議，本 change 不動。
11. （apply §4 執行方式）4.9 完整 E2E 由 leader 親自執行（execution-plan 原定整組由同一 Implementer 做完）：E2E 需長時間輪詢且失敗須由 coordinator 裁定，
    交由 leader 持有較可靠；4.1～4.8、4.10 仍由 §4 Implementer 執行並經兩階段審查。E2E 首跑 webkit 3/3 的 1 個失敗與重跑紀錄見 tasks 4.9，待 coordinator 裁定。
12. （apply §4 Stage 2 未採納建議，留後續）`.claude/hooks/stop-typecheck.sh` 檔頭註解與 `.claude/agents/code-reviewer-readonly.md` 仍寫「兩個 workspace」
    （屬 `.claude/` 設定，不在 tasks 4.1 範圍）；核心套件沒有 `AGENTS.md` 入口；README 第 3 行「管理前後端」措辭未提核心套件。
13. （apply §4 流程）coordinator 於 14:06 起規定 E2E／eslint／全套 vitest／build 須先取得 `/tmp/heavy-lock.sh` 共用鎖；規定送達前已派出的 §4 修正 Implementer
    曾在未持鎖下跑一次 `pnpm lint`（約 14:08，當時鎖由 min4wd 持有）。之後的重運算皆依規定持鎖。
14. （apply Final Code Review，2026-10-22）✅ 通過，無必須修。diff ⊆ proposal Impact、主 spec 與 `.claude/**`／runbook／其他 change 零改動；lockfile 只有三段 importers；
    `CORE_MODULES`＝對照表＝`src`＝文件清單；tsc 三段 exit 0；持鎖 `pnpm test` 核心 1／2、前端 87／823、後端 13／51；lint 0／3；B5 暫存 probe 於 `hono-pickball/src` 匯入核心套件 `tsc` exit 0。
    建議（另開 change）：`scoreboard.spec.ts:187` 點選 radio 後補 `aria-checked` 斷言以避免 hydration 前點擊遺失。
