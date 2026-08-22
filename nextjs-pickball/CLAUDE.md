@AGENTS.md

# CLAUDE.md

本檔描述 **nextjs-pickball workspace**（monorepo 前端）。以下指令除特別標註外皆假設 cwd 在 `nextjs-pickball/`；從 repo root 執行請用 `pnpm --filter ./nextjs-pickball <script>`。

## 環境

- Node 版本固定為 `.node-version` 的 `22.22.1`；repo root 與本 workspace 各有一份，**以 root 為準**
- 套件管理工具為 pnpm；lockfile 只在 repo root（本 workspace 沒有自己的 `pnpm-lock.yaml`）

## 常用指令

- `pnpm dev` — Next.js dev server（**http://localhost:3005**，埠號由 `next dev --port 3005` 固定）
- `pnpm build` / `pnpm start` — 正式建置／執行建置產物
- `pnpm lint` — ESLint（編輯檔案時 root hook 也會逐檔自動跑，見 root CLAUDE.md「Hooks」）
- `pnpm test` — Vitest watch 模式；`pnpm test:ui` 開 UI 介面、`pnpm test:coverage` 產生 v8 覆蓋率
- `pnpm test:e2e` — Playwright E2E（五個 browser project）
- 執行單一測試檔：`pnpm test --run hooks/useScrollSpy.test.ts`（**`--run` 前不可加 `--`**，否則 vitest 收不到路徑會跑完整套）
- 以關鍵字過濾測試：`pnpm test -t "應回傳目前可視 section 的 id"`

## 架構總覽

Next.js 16 App Router + React 19 + TypeScript + Tailwind CSS v4 + shadcn/ui。**已是多路由應用**：

- `/` — 匹克球指南（Hero、TocBar、Part 01/02、Conclusion）
- `/quiz`、`/scoreboard`、`/tour`、`/health` — 測驗、單場 side-out 計分板、導覽動畫、健康檢查
- `/matchmaker/players` — 參賽者名單（milestone M1 = add-player-roster change，見 openspec archive）。對戰分配引擎（`lib/matchmaker/` 的 allocation、candidates、pairing、duplication）**已完成但尚未接 UI**，等後續對戰畫面 milestone；同目錄的 roster／types／colors／storage 已由本路由使用
- `app/api/[[...route]]/route.ts` — service binding proxy，把 `/api/*` 原樣轉發給 hono-pickball（瀏覽器視角 same-origin）。**不要在前端另寫 API route，後端邏輯一律放 hono-pickball**

matchmaker 依 root `prd.md` 為 **LocalStorage-only 純前端功能**（名單、回合、比分都存瀏覽器，不上傳後端）——引擎放前端是刻意決策，不是待搬的後端邏輯。

### shadcn/ui

- 設定檔 `components.json`（style: `new-york`、baseColor: `slate`、iconLibrary: `lucide`、`rsc: true`）
- `components/ui/` 由 shadcn CLI 管理，**不自行修改結構**；新增元件用 `pnpm dlx shadcn@latest add <component>`（**必須在 `nextjs-pickball/` 內執行**，`components.json` 在此）
- `lib/utils.ts` 的 `cn()` 是 `clsx` + `tailwind-merge` 組合工具

### 路徑別名

`@/*` 對應 workspace 根（不使用 `src/`）。於 `tsconfig.json` 與 `vitest.config.ts` **兩處同步設定**。

### 測試架構

- **單元測試（Vitest + happy-dom）**，鄰近程式碼以 `*.test.ts(x)` 放置，使用 `@testing-library/react`
  - `globals: true` **只在執行期成立**：`tsconfig.json` 的 `types` 為 `["react/canary"]`，**不含 `vitest/globals`**，因此 `describe`／`it`／`expect`／`vi`／`beforeEach` 一律**必須顯式 `import ... from "vitest"`**（既有測試檔全數如此）。省略 import 時 vitest 跑得過但 `tsc --noEmit` 會失敗，root Stop hook 會擋下
  - 全域 setup `tests/setup.ts` 每個測試後自動 `cleanup()`；include `**/*.{test,spec}.{ts,tsx}`，排除 `**/e2e/**`、`.next`
- **E2E（Playwright，`tests/e2e/specs/`）**：Chromium、Firefox、WebKit、Mobile Chrome、Mobile Safari 五個 project
  - `webServer` 有**兩組**：先起 hono-pickball（:8787），再起 Next.js（:3005）。service binding 需前後端同時運行，缺一則 `/api/*` 相關 E2E 必失敗
  - `baseURL: http://localhost:3005`、`testIdAttribute: data-testid`

### 目錄約定

以下路徑皆相對 `nextjs-pickball/`：

- `app/` — 各路由進入點（見「架構總覽」）＋ `layout.tsx`、`globals.css`
- `components/` — 依功能分子目錄：`ui/`（shadcn）、`guide/`（指南區塊，共用小元件在 `guide/shared/`）、`layout/`（SiteNavbar）、`matchmaker/`、`quiz/`、`scoreboard/`、`tour/`
  - `guide/HeroTourCta` 是 **server component 例外**（其餘 guide 元件皆標 `"use client"`）；其行為由 **tour-experience** capability 規範，不屬 pickleball-guide-page
- `hooks/` — 依 capability 分組。跨 capability 歸屬清單的**單一來源**是 `openspec/specs/pickleball-guide-page/spec.md` 的「互動行為由三支 hooks 提供且各有 smoke test」Requirement——**任何** capability 新增 hook 時，其 change 須一併更新該清單（歷史上曾漏更新導致規格失真）：
  - pickleball-guide-page：`useScrollShadow`、`useScrollSpy`、`useScrolledPast`
  - quiz：`useQuiz`；player-roster：`useRosterStore`
  - scoreboard：`useScoreboardStore`、`useFullscreen`、`useOrientation`、`useFocusMode`
  - tour-experience：`useEnterAnimationProgress`、`useReducedMotion`
- `lib/` — `utils.ts`（cn）、`health.ts`、`navHeight.ts`；`matchmaker/`（分配引擎、名單、儲存等純函式模組）、`scoreboard/`（reducer、rules、storage、radio-navigation 等）
- `data/` — `guide/`、`quiz/`、`tour/` 純 TS 資料檔

### TDD（spec-driven）

`openspec/` 在 repo root，openspec CLI 一律從 repo root 執行；規格內引用本 workspace 的檔案路徑須帶 `nextjs-pickball/` 前綴。本 workspace 的 TDD 適用範圍與例外層（原 `openspec/config.yaml` 所載，該檔現在只指定 workflow schema）：

- `app/**`、`components/**`、`hooks/**`、`lib/**`、`data/**` 下的行為邏輯模組採 TDD：先寫失敗測試 → 實作至綠 → refactor（三步規則與紅燈要求見 root CLAUDE.md）
- 例外（不強制 TDD，鼓勵補 smoke / E2E）：純樣式檔（`*.css`）、型別檔（`*.d.ts`）、入口與配置（`app/**/page.tsx`、`app/**/layout.tsx`、各種 `*.config.*`、`wrangler.jsonc`、`components.json`、`tsconfig.json`）、API proxy route、Playwright E2E 與測試基礎建設（`tests/**`）
- **純呈現型元件不強制單元 TDD**（以 Playwright E2E 驗收）；行為邏輯下放 `hooks/`、`lib/` 再對其做 TDD
- 規格情境用 Given/When/Then 撰寫，行為邏輯情境須可直接對應到 Vitest test case

## Cloudflare Workers 部署（OpenNext）

本 workspace 經 `@opennextjs/cloudflare` 建置為 Cloudflare Worker（名稱 `nextjs-pickball`），正式部署走 CF Dashboard Workers Builds。

- `open-next.config.ts` — 目前為空設定（純靜態＋client 互動，無 ISR / data cache 需求）
- `wrangler.jsonc` — `main` 指向 `.open-next/worker.js`，宣告 service binding `HONO_API → hono-pickball`
- `cloudflare-env.d.ts` — `cf-typegen` 產物（`CloudflareEnv` 介面）；改 `wrangler.jsonc` 後 root hook 會自動重跑，不必手動
- `types/cloudflare-fetcher.d.ts` — 最小 `Fetcher` 宣告；`cf-typegen` 以 `--include-runtime=false` 產生，因 workers runtime 型別會與 DOM lib 衝突（HTMLRewriter 的 `Element` 會污染全域）
- `.open-next/` — build 產物，已 .gitignore
- Scripts：`pnpm preview`（本機 workerd 預覽，整合驗證用）、`pnpm run deploy`（手動部署；`deploy` 與 pnpm 內建指令撞名**必須加 `run`**；正式環境走 Workers Builds，平常不手動）、`pnpm upload`（僅上傳新版本不切流量）、`pnpm cf-typegen`

## 專案規範提醒

- 所有註解與說明使用繁體中文（台灣用語）；程式碼命名使用英文
- TypeScript `strict`、`verbatimModuleSyntax` 皆開啟——匯入純型別時需使用 `import type`
- 使用 window / IntersectionObserver / useState 的元件務必標 `"use client"`；純靜態內容可留在 server component
- 新增字型時於 `app/layout.tsx` 透過 `next/font/google` 載入，並在 `app/globals.css` 的 `@theme inline` 註冊對應 `--font-*` 變數才能被 Tailwind `font-*` utility class 取用
