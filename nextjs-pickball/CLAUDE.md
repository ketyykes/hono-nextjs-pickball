@AGENTS.md

# CLAUDE.md

本檔指引 Claude Code 在此 repository 中工作。

## 環境

- Node 版本固定為 `.node-version` 中的 `22.22.1`（可搭配 fnm／nvm／volta 等版本管理工具）
- 套件管理工具為 pnpm（見 `pnpm-lock.yaml`）

## 常用指令

- `pnpm dev` — 啟動 Next.js 開發伺服器（預設 http://localhost:3000）
- `pnpm build` — Next.js 正式建置
- `pnpm start` — 執行正式建置產物
- `pnpm lint` — 執行 ESLint 檢查
- `pnpm test` — 以 watch 模式執行 Vitest 單元測試
- `pnpm test:ui` — 開啟 Vitest UI 介面
- `pnpm test:coverage` — 產生 v8 測試覆蓋率報告
- `pnpm test:e2e` — 執行 Playwright E2E 測試（含五個 browser project）
- 執行單一測試檔：`pnpm test -- --run hooks/useScrollSpy.test.ts`
- 以關鍵字過濾測試：`pnpm test -t "應回傳目前可視 section 的 id"`

## 架構總覽

採用 **Next.js 16 App Router + React 19 + TypeScript + Tailwind CSS v4 + shadcn/ui** 的單頁匹克球指南應用。

### 進入點

- `app/layout.tsx`：Root Layout，透過 `next/font/google` 載入 Noto Sans TC、Bebas Neue、Outfit 三套字型，並宣告 `<html lang="zh-Hant">` 與 metadata
- `app/page.tsx`：首頁（對應 `/`），組合 Hero、TocBar、Part 01/02、Conclusion 區塊
- `app/globals.css`：Tailwind v4 + `tw-animate-css` + OKLCH semantic colors + 6 組自訂 keyframes

### shadcn/ui 元件

- 設定檔：`components.json`（style: `new-york`、baseColor: `slate`、iconLibrary: `lucide`、`rsc: true`）
- UI 元件位置：`components/ui/`（已含 badge、button、card、input、label、separator、table、textarea 共 8 個）
- 新增元件：`pnpm dlx shadcn@latest add <component>`
- `lib/utils.ts` 的 `cn()` 是 `clsx` + `tailwind-merge` 組合工具
- shadcn 元件頂部統一標註 `"use client"`，避免父層 event handler 觸發 RSC 邊界錯誤

### 路徑別名

`@/*` 對應根目錄 `./*`（不使用 `src/`）。於 `tsconfig.json` 與 `vitest.config.ts` 兩處同步設定。

### 測試架構

- **單元測試（Vitest）**：設定於 `vitest.config.ts`，使用 `happy-dom` 環境、globals 啟用（不需 import `describe`/`it`/`expect`）
  - 全域 setup：`tests/setup.ts` 每個測試後自動 `cleanup()`
  - Include 模式：`**/*.{test,spec}.{ts,tsx}`，排除 `**/e2e/**`、`.next`、`legacy-react-pickball`
  - 使用 `@testing-library/react`
- **E2E 測試（Playwright）**：`tests/e2e/specs/` 下的測試會跑 Chromium、Firefox、WebKit、Mobile Chrome、Mobile Safari 五個 project；`webServer` 自動執行 `pnpm dev`
  - `baseURL: http://localhost:3000`、`testIdAttribute: data-testid`

### 目錄約定

- `app/` — Next.js App Router 進入點（layout、page、globals.css）
- `components/ui/` — shadcn/ui 原生元件（不自行修改結構，更新請用 shadcn CLI）
- `components/guide/` — 自訂指南元件（Hero、TocBar、11 個 Section、shared/ 下 6 個共用元件；統一標 `"use client"`）
- `hooks/` — scroll / observer 類 hooks（4 支）與對應 `.test.ts`
- `lib/` — 共用工具（`utils.ts` 的 `cn()`）
- `data/guide/` — 純 TS 資料檔（7 個，tocItems、brands 等）
- `docs/` — 非原始碼文件；包含 `pickleball-guide.html` 原型參考（已 .gitignore）
- `legacy-react-pickball/` — 舊版 Vite 專案保留為對照組，遷移驗證完成後可刪除

### OpenSpec 工作流程（spec-driven TDD）

根目錄的 `openspec/`（`config.yaml`、`changes/`、`specs/`）定義 spec-driven 開發流程：

- `app/**`、`components/**`、`hooks/**`、`lib/**`、`data/**` 下的行為邏輯模組採通用 TDD：先寫 failing Vitest 測試 → 實作至通過 → refactor
- 例外（不強制 TDD，但鼓勵補 smoke / E2E）：
  - 純樣式檔（`*.css`）
  - 型別檔（`*.d.ts`、`next-env.d.ts`）
  - 入口與配置（`app/layout.tsx`、`app/page.tsx`、`next.config.ts`、`postcss.config.mjs`）
  - Playwright E2E（`tests/e2e/**`）
- 單元測試鄰近程式碼以 `*.test.ts(x)` 形式放置；E2E 放 `tests/e2e/specs/`
- 行為邏輯 task 須拆三步：① 新增失敗測試並用 `pnpm test -- --run <path>` 確認紅燈 ② 最小實作至 green ③ refactor（無壞味道可註記 skipped）
- 規格情境用 Given/When/Then 撰寫，行為邏輯情境須可直接對應到 Vitest test case

## 專案規範提醒

- 所有註解與說明使用繁體中文（台灣用語）；程式碼命名使用英文
- TypeScript `strict`、`verbatimModuleSyntax` 皆為開啟狀態——匯入純型別時需使用 `import type`
- 使用 window / IntersectionObserver / useState 的元件務必標 `"use client"`；純靜態內容可留在 server component
- 新增字型時於 `app/layout.tsx` 透過 `next/font/google` 載入，並在 `app/globals.css` 的 `@theme inline` 註冊對應 `--font-*` 變數才能被 Tailwind `font-*` utility class 取用
