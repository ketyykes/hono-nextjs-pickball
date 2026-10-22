# Overview: pickball-core-package（B4）

## Scope

把計分板與對戰分配機「後端也需要的」zod schema 與純函式（18 個模組）從前端搬到新的 workspace 套件 `@pickball/core`，
讓 B5～B9 的後端能以同一份 schema 驗證寫入、以同一份 `submitScore` 權威計分。純搬移，使用者看到的一切不變。

**Size**: medium — 影響 2 個 capability（新增 `pickball-core`、修改 `dev-workflow`），新增一個 workspace 套件，tasks 約 20 項。
**Frontend involved**: no — 前端只改 import 指定字串與 `next.config.ts`，沒有任何介面或互動變更。
**DB schema touched**: no — 不新增資料表或 migration（B5 起）。
**Data migration**: no — localStorage 的 key 與資料形狀完全不變。
**Cross-component flow**: no — 沒有新的執行期流程；後端 `src/**` 零改動。

---

## What Changes

- 新增 `packages/pickball-core`（`@pickball/core`；`exports: {"./*": "./src/*.ts"}`；只依賴 zod；tsc 不含 DOM）
- `git mv` 18 個模組（scoreboard 3、matchmaker 15），內容零修改；其測試留在前端原位
- 前端 84 個檔案只改 import 指定字串；`next.config.ts` 加 `transpilePackages`
- 後端只加相依與一支 workerd 匯入測試；以暫存入口驗證 wrangler 打包
- 三份 CLAUDE.md、root AGENTS.md、README 檢查清單同步；新增核心套件 CLAUDE.md

搬移前後的模組歸屬：

```
=== Before ===
nextjs-pickball/lib/scoreboard/  types rules reducer storage ...
nextjs-pickball/lib/matchmaker/  types round rating history ...
                                 roster colors csv storage ...
hono-pickball/src/               (無法取用上述 schema)

=== After ===
packages/pickball-core/src/scoreboard/  types rules reducer
packages/pickball-core/src/matchmaker/  types round rating history
                                        (+ 遞移相依, 共 15)
nextjs-pickball/lib/scoreboard/  storage ... + 原有 *.test.ts
nextjs-pickball/lib/matchmaker/  roster colors csv storage ...
                                 + 原有 *.test.ts
hono-pickball/src/               可 import "@pickball/core/..."
                                 (B4 尚未使用, B5 起)
```

---

## Architecture

相依方向：前後端都依賴核心套件，核心套件只依賴 zod；各消費端的工具鏈直接轉譯它的 `.ts` 原始碼。

```
            ┌───────────────────────────────┐
            │ packages/pickball-core        │
            │ @pickball/core  (src/*.ts)    │
            │ deps: zod   lib: ESNext(無DOM)│
            └───────▲───────────────▲───────┘
      workspace:*   │               │   workspace:*
                    │               │
┌───────────────────┴──┐     ┌──────┴────────────────┐
│ nextjs-pickball      │     │ hono-pickball         │
│ next build/dev       │     │ wrangler (esbuild)    │
│  transpilePackages   │     │ vitest-pool-workers   │
│ vitest (happy-dom)   │     │  (Vite)               │
│ playwright (CJS TS)  │     │                       │
│ OpenNext build       │     │                       │
└──────────────────────┘     └───────────────────────┘

驗證點: next build / OpenNext build (C4)
        playwright --list (C5)
        wrangler --dry-run 暫存入口 (C3)
        workerd 匯入測試 (3.1)
```

---

## Task Tree

依賴為嚴格序列；§2 的 GREEN 必須在單一 commit 內完成搬檔與改 import，避免主 repo 的 Stop hook 擋下中間狀態。

```
1. 對齊 main + Context7 查證 (baseline, playwright --list 基線)
2. 核心套件骨架與搬移 (depends on 1)
├── 2.1 設定層: package.json / tsconfig / vitest / workspace
├── 2.2 RED: module-boundary 兩個 it
├── 2.3 GREEN: git mv 18 模組 + 改寫 84 檔 import
│              + transpilePackages (同一 commit)
└── 2.4 REFACTOR
3. 後端取用 (depends on 2)
├── 3.1 RED: pickball-core-import (workerd)
├── 3.2 GREEN: 後端宣告相依
└── 3.3 驗收 C3: wrangler 暫存入口打包
4. 文件同步與總驗收 (depends on 3)
```

---

## Cross-Cutting Impact

| File / module | Change kind | Risk |
|---------------|-------------|------|
| `packages/pickball-core/**` | new | medium（工具鏈解析） |
| `nextjs-pickball/lib/{scoreboard,matchmaker}/` 18 模組 | move（R100） | low |
| 前端 84 個檔案的 import | modify（只改指定字串） | low |
| `nextjs-pickball/next.config.ts` | modify（transpilePackages） | medium |
| `pnpm-workspace.yaml`、兩個 `package.json`、lockfile | modify | low |
| `hono-pickball/test/pickball-core-import.test.ts` | new | low |
| 三份 CLAUDE.md、AGENTS.md、README | docs | low |
| CF Workers Builds 解析 workspace | 遠端（G1） | medium |
