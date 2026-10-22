# Tasks: pickball-core-package

> **TDD 三步**（root `CLAUDE.md`）：RED（先寫失敗測試，以單檔指令在 shell 實際看到紅燈並貼出輸出）→ GREEN（最小實作至綠）→ REFACTOR（無壞味道註記 skipped）。
> 單檔指令：核心套件 `pnpm --filter ./packages/pickball-core test --run test/<檔>.test.ts`；後端 `pnpm --filter ./hono-pickball test --run test/<檔>.test.ts`。
> **`--run` 前不可加 `--`**。
>
> **紅燈要是真的**：本 change 兩個 RED 的紅燈原因都是「模組／套件不存在」。**SHALL NOT 用「改斷言看紅再改回」偽造紅燈**。
>
> **標註**：
> - `TDD`：RED／GREEN 成對（2.2～2.3、3.1～3.2）。
> - `regression guard`：既有前端單元測試與既有 E2E——本 change 是純搬移，它們只允許改 import 指定字串，**不得刪改任何 it 的名稱、斷言或 mock 內容**。
> - `設定層`：`package.json`、`pnpm-workspace.yaml`、`pnpm-lock.yaml`、`tsconfig*.json`、`vitest.config.ts`、`next.config.ts`、文件（不需紅燈）。
> - `驗收（指令）`：test-plan C1～C10。
>
> **前提**：Wave 1（B1～B3）已合併並 archive、S1 通過。**不新增任何第三方套件**（核心套件的 devDeps 皆為 lockfile 既有套件與版本）；**禁止任何遠端 CF 操作**、不 push。
> **主 repo Stop hook**：主 worktree 的 tsc 失敗會以 exit 2 擋下 session；2.3 的「搬檔＋改 import」MUST 在同一個 commit 內完成，不得跨越 session 停止點留下紅 tsc。
> 另：2.1 建立核心套件 tsconfig 後、2.3 搬入模組前，`src/` 尚不存在，核心套件的 `tsc --noEmit` 會回 TS18003（no inputs）——`pnpm -r exec tsc --noEmit` 因而轉紅。
> 這是預期的中間狀態，**§2 MUST 由同一個 Implementer 在一次派工內做完 2.1～2.3**，leader 在 §2 交件（tsc 已綠）前不得結束回合（Stop hook 只在主 session 停止時觸發）。
> it 名稱 MUST 與 delta spec「驗收」錨點逐字一致。

## 1. 對齊 main＋Context7 查證（不寫產品程式碼）

- [x] 1.1 確認分支 `change/pickball-core-package`、工作樹乾淨；`pnpm install` 後 lockfile 零變動；`pnpm test` baseline（B3 後預期前端 87 檔／823、後端 12 檔／50，以實測為準）、
  `pnpm -r exec tsc --noEmit`、`pnpm --filter ./hono-pickball typecheck`、`pnpm lint`（基線 0 errors／3 warnings）；`pnpm --filter ./nextjs-pickball exec playwright test --list` 的總數（C5 基線）；回填 environment.md 並 commit
- [x] 1.2 盤點：以 grep 重算「import 被搬 18 模組的前端檔案」清單（main@414d822 為 84 檔、其中 40 個測試檔、E2E 1 檔），確認被搬模組間只有 scoreboard／matchmaker 各自內部的相對 import、
  沒有任何被搬模組匯入留在前端的模組、沒有 `vi.mock` 指向被搬模組；確認被搬模組（排除註解）沒有 `window`／`document`／`localStorage`／`fetch`／`setTimeout`／`console`／`crypto` 的使用。差異記入 design.md Open Questions
- [x] 1.3 Context7 查證（MUST，附 library ID 記入 design.md「apply §1 查證紀錄」）：`/vercel/next.js/v16.2.9`（`transpilePackages` 對 Turbopack dev 與 build 的適用）；
  `/cloudflare/workers-sdk`（vitest-pool-workers 對 workspace symlink 套件的解析、`deps.optimizer`）；`/microsoft/playwright`（或最接近的 ID；TS spec 匯入 `node_modules` 下 workspace 套件 `.ts` 的轉譯行為）；
  `/websites/opennext_js`（monorepo）。與 design Decision 1、6 的差異記入 Open Questions

## 2. 核心套件骨架與搬移

Depends on: §1

- [x] 2.1 設定層：新增 `packages/pickball-core/{package.json, tsconfig.json, test/tsconfig.json, vitest.config.ts}`（design Decision 1、5、6；`exports: {"./*": "./src/*.ts"}`、不設 `type`、
  `dependencies: {zod: "^4.4.3"}`、devDeps `typescript ^5`／`vitest ^4.1.5`／`@types/node ^20`；scripts `build`＝`tsc --noEmit`、`test`＝`vitest`、`typecheck`＝`tsc --noEmit && tsc --noEmit -p test/tsconfig.json`）；
  root `pnpm-workspace.yaml` 的 `packages` 加 `packages/pickball-core`；`pnpm install`。記錄 `git diff --stat main -- pnpm-lock.yaml` 與新增的解析變體（design Open Questions 2）；
  確認 lockfile 的 `packages:` 段沒有新的套件名稱或版本（新增項只可能是既有套件因 peer 組合不同的解析變體，`snapshots:` 段同理）
- [x] 2.2 RED（TDD）：新增 `packages/pickball-core/test/module-boundary.test.ts`，寫入 `CORE_MODULES`（18 項）與兩個 it：「核心模組清單與 src 實際檔案一致」「每個核心模組可在沒有瀏覽器全域的 node 環境載入」。
  以單檔指令確認紅燈（`src/` 不存在：ENOENT／模組解析失敗）並貼出輸出
- [x] 2.3 GREEN（TDD）：**同一個 commit 內**：① `git mv` 18 個模組到 `packages/pickball-core/src/{scoreboard,matchmaker}/`（內容零修改）；
  ② 以腳本把前端所有 `@/lib/scoreboard/{types,rules,reducer}`、`@/lib/matchmaker/<被搬模組>` 與 `lib/` 內同層相對 import（`./round` 等，僅限指向被搬模組者）改為 `@pickball/core/<area>/<module>`
  （含測試檔與 `tests/e2e/specs/scoreboard-binding.spec.ts`）；③ `nextjs-pickball/package.json` 加 `"@pickball/core": "workspace:*"`、`next.config.ts` 加 `transpilePackages: ["@pickball/core"]`；`pnpm install`。
  完成後：2.2 轉綠；`pnpm --filter ./nextjs-pickball test --run` 檔數／測試數＝1.1 基線且全綠（regression guard）；`pnpm -r exec tsc --noEmit` exit 0；`pnpm lint` 不多於基線
  > **apply 紀錄（2.2／2.3）**：RED `b750e1b` 紅燈原因經 `git show b750e1b^:packages/pickball-core/src` 機械複驗為「`src/` 不存在」（ENOENT＋`Cannot find module`），屬真紅燈。
  > GREEN `3c9aed4` 內對測試檔有一處**型別層調整**：環境前提斷言 `expect(globalThis.window).toBeUndefined()`（`document`、`localStorage` 同）改為 `expect(Reflect.get(globalThis, "window")).toBeUndefined()`——
  > 核心套件 `test/tsconfig.json` 繼承 `lib: ["ESNext"]`，`globalThis.window` 是 TS7017 型別錯誤；`Reflect.get` 的執行期語意相同（皆讀取該屬性並斷言為 `undefined`）。
  > Stage 1 指出此為「GREEN 修改測試」的流程偏差；leader 裁定接受（斷言語意不變、不影響紅燈真實性），不改寫歷史，記錄於此與 design.md Open Questions 8。
  > lockfile：`9b41602` 還原 `pnpm install` 對 3 處 `eslint-plugin-import` 快照鍵的 peer 後綴展開；相對 `main` 只剩 `importers` 新增（`packages/pickball-core` 與 `nextjs-pickball` 的 `link:`），vitest 未產生新解析變體。
- [x] 2.4 REFACTOR：檢查改寫後的 import 排序與既有風格一致（同檔多行 import 是否需合併）；無壞味道則註記 skipped。**不得**修改被搬模組內容
  > **skipped**：改寫為原地替換指定字串；同檔對同一 `@pickball/core/...` 指定字串出現多次者共 25 組，Stage 2 逐一比對 `main` 皆為原本就有的 `import`＋`import type` 拆法，改寫未新增重複；前端 ESLint 無 import/order 規則，排序維持各檔原風格。

## 3. 後端取用

Depends on: §2

- [x] 3.1 RED（TDD）：新增 `hono-pickball/test/pickball-core-import.test.ts`，it「workerd 中可匯入核心套件並以其 schema 驗證資料」。確認紅燈（後端未宣告相依 → 模組解析失敗）並貼出輸出
- [x] 3.2 GREEN（TDD）：`hono-pickball/package.json` 加 `"@pickball/core": "workspace:*"`；`pnpm install`。若 vitest-pool-workers 仍無法解析，依 1.3 查證結果最小調整 `hono-pickball/vitest.config.ts`
  並記入 design.md Open Questions；**不得**修改 `hono-pickball/src/**`
- [x] 3.3 驗收（指令）C3：建立暫存入口 `hono-pickball/.core-bundle-check.ts`，以 `wrangler deploy --dry-run <入口> --outdir <mktemp -d>` 打包；exit 0 且輸出含 Total Upload；刪除暫存檔與目錄，`git status --porcelain` 不列出；結果寫在本 task 後方
  > **C3 結果（2026-10-22）**：暫存入口 `hono-pickball/.core-bundle-check.ts`（匯入 `@pickball/core/matchmaker/round` 的 `submitScore`、在 `fetch` 中引用、`export default { fetch }`）；
  > `pnpm --dir <repo>/hono-pickball exec wrangler deploy --dry-run .core-bundle-check.ts --outdir <mktemp -d>` **exit 0**，輸出 `Total Upload: 567.97 KiB / gzip: 86.88 KiB`、`--dry-run: exiting now.`（未要求登入）。
  > bundle（outdir 內隱藏檔 `.core-bundle-check.js`）含 `// ../packages/pickball-core/src/matchmaker/round.ts` 等來源註記與 `function submitScore(input) {`，無殘留 `@pickball/core` 指定字串——核心套件被打包而非 external。
  > Implementer、Stage 1 各獨立重跑一次，結果相同；暫存檔與目錄已刪除，`git status --porcelain` 為空。
  > 3.1 RED `0733f3a` 紅燈：`Error: Cannot find package '@pickball/core/scoreboard/reducer' imported from .../hono-pickball/test/pickball-core-import.test.ts`（`git show 0733f3a^:hono-pickball/package.json` 無此相依）。
  > 3.2 GREEN `83ae867`：未調整 `vitest.config.ts`（vitest-pool-workers 直接解析 symlink 套件，與 Decision 1 預期一致）；後端 13 檔／51 綠。

## 4. 文件同步與總驗收

Depends on: §3

- [x] 4.1 設定層（文件）：root `CLAUDE.md`（結構圖加 `packages/pickball-core/`；「Stop → tsc」段的 `pnpm-workspace.yaml` 改為三個 workspace；常用指令表 `pnpm test`／`pnpm build` 的敘述）；
  root `AGENTS.md` 指標表加 `packages/pickball-core/CLAUDE.md`；root `README.md` 部署前檢查清單加「核心套件單元測試」一步（第 3 步之後）；
  `nextjs-pickball/CLAUDE.md`（`lib/` 目錄約定：18 個模組已移至核心套件、其測試留在原位；`transpilePackages`）；
  `hono-pickball/CLAUDE.md`（架構段：可匯入 `@pickball/core`；相依段：zod 由核心套件引入，B5 起 `src` 才使用）；
  新增 `packages/pickball-core/CLAUDE.md`（定位、零瀏覽器 API、`CORE_MODULES` 必須同步、測試位置、逐檔 ESLint hook 空跑無害）
  > `7862165`＋Stage 1 退回修正 `62c553a`（root `CLAUDE.md` 補第三份「測試留原位」說明，Decision 3）＋Stage 2 退回修正 `e2943a2`（README 指令表與結構樹改為三個 workspace、`nextjs-pickball/CLAUDE.md` `lib/` 父層條列只列留在前端的模組、核心 `CLAUDE.md` 測試位置與兩層強制的實測說明、Stop hook 限制 ① 並列核心 `test/**`）。
- [x] 4.2 驗收（指令）C2：閱讀核心套件 tsconfig；`pnpm --filter ./packages/pickball-core typecheck`、`pnpm -r exec tsc --noEmit`、`pnpm --filter ./hono-pickball typecheck` 皆 exit 0
  > 核心 tsconfig `lib: ["ESNext"]`、`types: []`、`include: ["src"]`；核心 `typecheck`（兩段）、`pnpm -r exec tsc --noEmit`、`hono-pickball typecheck` 皆 exit 0。
- [x] 4.3 驗收（指令）C9：`pnpm lint` 0 errors、warning 不多於基線
  > `✖ 3 problems (0 errors, 3 warnings)`（與基線相同的 3 個 unused-vars）。
- [x] 4.4 驗收（指令）C1：`pnpm test` 三組統計皆出現；前端＝基線、後端＝基線＋1 檔／＋1、核心 1 檔／2；全綠
  > `pnpm test` exit 0：`packages/pickball-core` 1 檔／2、`nextjs-pickball` 87 檔／823（＝基線）、`hono-pickball` 13 檔／51（基線＋1／＋1）。
- [x] 4.5 驗收（指令）C4：`pnpm build`（三段皆出現、含 Total Upload）與 `pnpm --filter ./nextjs-pickball exec opennextjs-cloudflare build` 皆 exit 0
  > `pnpm build` exit 0：`packages/pickball-core build$ tsc --noEmit`、`hono-pickball build: Total Upload: 1978.04 KiB / gzip: 340.66 KiB`、`nextjs-pickball build: ✓ Compiled successfully`；`opennextjs-cloudflare build` 結尾 `OpenNext build complete.` exit 0。
- [x] 4.6 驗收（指令）C5：`pnpm --filter ./nextjs-pickball exec playwright test --list` exit 0，總數＝1.1 基線
  > exit 0，`Total: 705 tests in 15 files`（＝1.1 基線）。
- [x] 4.7 驗收（指令）C6：rename 全為 R100；前端既有檔案的 diff 除 `next.config.ts`／`package.json` 外只有含 `from "` 的 import／export 行增刪；18 個舊路徑不存在、無 re-export 轉址殼；
  `git diff main --stat -- hono-pickball/src` 為空；對照表右欄與 `CORE_MODULES` 以腳本比對一致（`pickball-core`「對照表涵蓋所有被搬移的模組」）
  > 18 列 R100；18 個舊路徑不存在；無 `export * from "@pickball/core` 殼；前端 M 檔（扣除 `next.config.ts`、`package.json`、文件 `nextjs-pickball/CLAUDE.md`）過濾 import／export from 行後無剩餘增刪；`hono-pickball/src` diff 為空；對照表右欄 18 項與 `CORE_MODULES` 排序後一致。
- [x] 4.8 驗收（指令）：`pnpm --filter ./hono-pickball db:migrate:local` 輸出「No migrations to apply」（本 change 無 migration，確認未誤動 D1）
  > `✅ No migrations to apply!`，exit 0。
- [x] 4.9 驗收（指令）C7：`.dev.vars` 齊備下依 project 分開跑完整 E2E（前後清殘留 dev server）：
  `for p in chromium firefox mobile-chrome; do pnpm --filter ./nextjs-pickball exec playwright test --workers=1 --project=$p; done`；
  `for p in webkit mobile-safari; do for i in 1 2 3; do pnpm --filter ./nextjs-pickball exec playwright test --workers=1 --project=$p --shard=$i/3; done; done`；
  合計 passed／skipped 與基線相同（B3 後 667／38）、0 failed。結果寫在本 task 後方；失敗不得自行判定為雜訊
  > **C7 結果（2026-10-22，leader 執行；`.dev.vars` 齊備；前後 `lsof`／`ps` 皆無本 repo 殘留）**：
  > | project | passed | skipped | failed | 開始時 load（1/5/15 分） |
  > |---|---|---|---|---|
  > | chromium | 141 | 0 | 0 | 15.55 17.51 17.88 |
  > | firefox | 129 | 12 | 0 | 10.31 16.11 17.36 |
  > | mobile-chrome | 139 | 2 | 0 | 25.25 17.96 17.47 |
  > | webkit 1/3、2/3 | 42＋40 | 5＋7 | 0 | 15.64…／7.34… |
  > | webkit 3/3（首跑） | 46 | 0 | **1** | 28.91 19.67 17.71 |
  > | webkit 3/3（重跑，取得共用重運算鎖後） | 47 | 0 | 0 | 6.11 28.91 59.63 |
  > | mobile-safari 1/3、2/3、3/3 | 42＋40＋47 | 5＋7＋0 | 0 | 28.59…／61.10…／257.06… |
  > **合計（webkit 3/3 以重跑計）：667 passed／38 skipped／0 failed，與基線相同。**
  > 首跑失敗：`scoreboard.spec.ts:187`「15 分制下連贏 11 球不觸發 GameOverDialog」（`toBeHidden` 收到 visible，即 15 分制設定未生效），同時段 dev server 記錄 `ChunkLoadError`（Turbopack HMR client chunk 載入失敗），當時機器另有其他工作造成高負載。
  > 隔離重跑：該 it `--repeat-each=3` 3/3 passed（load 18.65）；整個 webkit 3/3 第一次重跑時 load 飆至 300（外部工作），另有 3 個不同 it 失敗且伴隨 `ChunkLoadError`，不採為結論；取得共用重運算鎖、load 6.11 下第二次重跑 47/47 passed。
  > **判定交由 coordinator 裁定**（leader 未自行判定為雜訊）；證據：`/tmp/b4-e2e-run1/`（`summary.txt`、`webkit-3.log`、`isolate-webkit.log`、`webkit-3-rerun.log`、`webkit-3-rerun2.log`）。
- [x] 4.10 驗收（指令）C10：`DO_NOT_TRACK=1 openspec validate pickball-core-package --strict` 通過
  > `Change 'pickball-core-package' is valid`，exit 0。
