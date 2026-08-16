@AGENTS.md

# CLAUDE.md

本檔描述 **nextjs-pickball workspace**（monorepo 前端）。以下指令除特別標註外皆假設 cwd 在 `nextjs-pickball/`；從 repo root 執行請用 `pnpm --filter ./nextjs-pickball <script>`。

## 環境

- Node 版本固定為 `.node-version` 中的 `22.22.1`（可搭配 fnm／nvm／volta 等版本管理工具）；repo root 與本 workspace 各有一份 `.node-version`，**以 root 為準**
- 套件管理工具為 pnpm；`pnpm-lock.yaml` 已整併至 repo root（本 workspace 不再有自己的 lockfile）

## 常用指令

- `pnpm dev` — 啟動 Next.js 開發伺服器（http://localhost:3005，埠號由 `package.json` 的 `next dev --port 3005` 固定）
- `pnpm build` — Next.js 正式建置
- `pnpm start` — 執行正式建置產物
- `pnpm lint` — 執行 ESLint 檢查
- `pnpm test` — 以 watch 模式執行 Vitest 單元測試
- `pnpm test:ui` — 開啟 Vitest UI 介面
- `pnpm test:coverage` — 產生 v8 測試覆蓋率報告
- `pnpm test:e2e` — 執行 Playwright E2E 測試（含五個 browser project）
- 執行單一測試檔：`pnpm test --run hooks/useScrollSpy.test.ts`（**`--run` 前不可加 `--`**，否則 vitest 收不到路徑會跑完整套）
- 以關鍵字過濾測試：`pnpm test -t "應回傳目前可視 section 的 id"`

## 架構總覽

採用 **Next.js 16 App Router + React 19 + TypeScript + Tailwind CSS v4 + shadcn/ui** 的單頁匹克球指南應用。

### 進入點

- `app/layout.tsx`：Root Layout，透過 `next/font/google` 載入 Noto Sans TC、Bebas Neue、Outfit 三套字型，並宣告 `<html lang="zh-Hant">` 與 metadata
- `app/page.tsx`：首頁（對應 `/`），組合 Hero、TocBar、Part 01/02、Conclusion 區塊
- `app/globals.css`：Tailwind v4 + `tw-animate-css` + OKLCH semantic colors + 6 組自訂 keyframes

### shadcn/ui 元件

- 設定檔：`components.json`（style: `new-york`、baseColor: `slate`、iconLibrary: `lucide`、`rsc: true`）
- UI 元件位置：`components/ui/`（共 11 個：alert-dialog、badge、button、card、dialog、input、label、select、separator、table、textarea）
- 新增元件：`pnpm dlx shadcn@latest add <component>`（**必須在 `nextjs-pickball/` 內執行**，`components.json` 在此）
- `lib/utils.ts` 的 `cn()` 是 `clsx` + `tailwind-merge` 組合工具
- shadcn 元件頂部統一標註 `"use client"`，避免父層 event handler 觸發 RSC 邊界錯誤

### 路徑別名

`@/*` 對應 workspace 根（`nextjs-pickball/`，不使用 `src/`）。於 `tsconfig.json` 與 `vitest.config.ts` 兩處同步設定。

### 測試架構

- **單元測試（Vitest）**：設定於 `vitest.config.ts`，使用 `happy-dom` 環境
  - `globals: true` **只在執行期成立**：`tsconfig.json` 的 `types` 為 `["react/canary"]`，**不含 `vitest/globals`**，
    因此 `describe`／`it`／`expect`／`vi`／`beforeEach` 一律**必須顯式 `import ... from "vitest"`**（現有 31 個測試檔皆如此）。
    省略 import 時 vitest 跑得過但 `tsc --noEmit` 會失敗，Stop hook 會擋下 commit
  - 全域 setup：`tests/setup.ts` 每個測試後自動 `cleanup()`
  - Include 模式：`**/*.{test,spec}.{ts,tsx}`，排除 `**/e2e/**`、`.next`
  - 使用 `@testing-library/react`
- **E2E 測試（Playwright）**：`tests/e2e/specs/` 下的測試會跑 Chromium、Firefox、WebKit、Mobile Chrome、Mobile Safari 五個 project
  - `webServer` 為**兩組**（`playwright.config.ts:29-42`）：先起 hono-pickball（`pnpm --filter hono-pickball dev`，:8787），再起 Next.js（`pnpm dev`，:3005）。service binding 需前後端同時運行才通，缺一則 `/api/*` 相關 E2E 必失敗
  - `baseURL: http://localhost:3005`、`testIdAttribute: data-testid`

### 目錄約定

以下路徑皆相對 `nextjs-pickball/`：

- `app/` — Next.js App Router 進入點（layout、page、globals.css）
- `components/ui/` — shadcn/ui 原生元件（不自行修改結構，更新請用 shadcn CLI）
- `components/guide/` — 自訂指南元件（頂層 16 個：10 個 `*Section`、Hero、TocBar、PartDivider、Conclusion、CourtDiagram、HeroTourCta；`shared/` 下為 `BrandCard`、`TipCard`、`HighlightBox`、`MythRow`、`Section`、`ComparisonTable`、`PriceStars`；統一標 `"use client"`）
  - `HeroTourCta` 雖放在 guide/ 下，其行為由 **tour-experience** capability 規範，不屬 pickleball-guide-page
- `hooks/` — 各 hook 與對應測試，依 capability 分組（歸屬的單一來源為 `openspec/specs/pickleball-guide-page/spec.md` 的「互動行為由三支 hooks 提供」Requirement，新增 hook 時須一併更新該處）：
  - pickleball-guide-page：`useScrollShadow`、`useScrollSpy`、`useScrolledPast`
  - quiz：`useQuiz`
  - scoreboard：`useScoreboardStore`、`useFullscreen`、`useOrientation`、`useFocusMode`
  - tour-experience：`useEnterAnimationProgress`、`useReducedMotion`
- `lib/` — 共用工具（`utils.ts` 的 `cn()`）
- `data/guide/` — 純 TS 資料檔（7 個，tocItems、brands 等）
- `docs/` — 非原始碼文件；包含 `pickleball-guide.html` 原型參考（已 .gitignore）

### OpenSpec 工作流程（spec-driven TDD）

`openspec/`（`config.yaml`、`changes/`、`specs/`）已搬到 **repo root**，openspec CLI 一律從 repo root 執行；規格內引用本 workspace 的檔案路徑須帶 `nextjs-pickball/` 前綴。其定義的 spec-driven 開發流程：

- `app/**`、`components/**`、`hooks/**`、`lib/**`、`data/**` 下的行為邏輯模組採通用 TDD：先寫 failing Vitest 測試 → 實作至通過 → refactor
- 例外（不強制 TDD，但鼓勵補 smoke / E2E）：
  - 純樣式檔（`*.css`）
  - 型別檔（`*.d.ts`、`next-env.d.ts`）
  - 入口與配置（`app/layout.tsx`、`app/page.tsx`、`next.config.ts`、`postcss.config.mjs`）
  - Playwright E2E（`tests/e2e/**`）
- 單元測試鄰近程式碼以 `*.test.ts(x)` 形式放置；E2E 放 `tests/e2e/specs/`
- 行為邏輯 task 須拆三步：① 新增失敗測試並用 `pnpm test --run <path>` 確認紅燈 ② 最小實作至 green ③ refactor（無壞味道可註記 skipped）
- 規格情境用 Given/When/Then 撰寫，行為邏輯情境須可直接對應到 Vitest test case

## Cloudflare Workers 部署（OpenNext）

本 workspace 經 `@opennextjs/cloudflare` 建置為 Cloudflare Worker（Worker 名稱 `nextjs-pickball`），正式部署走 CF Dashboard Workers Builds。

### 相關檔案

- `open-next.config.ts` — OpenNext 設定；目前為空設定（純靜態＋client 互動，無 ISR / data cache 需求）
- `wrangler.jsonc` — Worker 設定；`main` 指向 `.open-next/worker.js`，並宣告 service binding `HONO_API → hono-pickball`
- `cloudflare-env.d.ts` — `cf-typegen` 產物（`CloudflareEnv` 介面）；改 `wrangler.jsonc` 後需重跑 `pnpm cf-typegen`
- `types/cloudflare-fetcher.d.ts` — 最小 `Fetcher` 宣告；`cf-typegen` 以 `--include-runtime=false` 產生，因 workers runtime 型別會與 DOM lib 衝突（HTMLRewriter 的 `Element` 會污染全域）
- `.open-next/` — build 產物，已 .gitignore

### Scripts

- `pnpm preview` — OpenNext build 後在本機 workerd runtime 預覽（整合驗證用）
- `pnpm run deploy` — OpenNext build 後手動部署（注意：`deploy` 與 pnpm 內建指令撞名，必須加 `run`；正式環境走 Workers Builds，平常不手動 deploy）
- `pnpm upload` — OpenNext build 後僅上傳新版本（不切流量）
- `pnpm cf-typegen` — 重新產生 `cloudflare-env.d.ts`

### API 約定

`app/api/[[...route]]/route.ts` 是 service binding proxy，把 `/api/*` 原樣轉發給 hono-pickball Worker（瀏覽器視角 same-origin）。**不要在前端另寫 API route，後端邏輯一律放 hono-pickball。**

## 專案規範提醒

- 所有註解與說明使用繁體中文（台灣用語）；程式碼命名使用英文
- TypeScript `strict`、`verbatimModuleSyntax` 皆為開啟狀態——匯入純型別時需使用 `import type`
- 使用 window / IntersectionObserver / useState 的元件務必標 `"use client"`；純靜態內容可留在 server component
- 新增字型時於 `app/layout.tsx` 透過 `next/font/google` 載入，並在 `app/globals.css` 的 `@theme inline` 註冊對應 `--font-*` 變數才能被 Tailwind `font-*` utility class 取用
