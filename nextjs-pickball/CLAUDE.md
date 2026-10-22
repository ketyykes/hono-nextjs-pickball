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
- `/quiz`、`/scoreboard`、`/tour`、`/health` — 測驗、單場 side-out 計分板、導覽動畫、健康檢查。`/scoreboard` **登入且未綁定場次時以雲端為準**（經後端 API 同步，見「目錄約定」的 `lib/sync/`）；訪客或綁定場次（`?match=`）仍走 LocalStorage
- `/matchmaker` — 對戰頁（場次舞台：本輪設定、場地色塊網格、比分輸入與送出、休息名單），milestone M5 = matchmaker-match-stage-ui change。**全站 navbar 的 matchmaker 入口指向這裡**，SHALL NOT 同時掛第二條指向名單頁的連結。
  本頁另提供**匯出 JPG 與列印 PDF**（milestone M9 = matchmaker-visual-export change）：兩者共用
  `lib/matchmaker/export-scene.ts` 的同一份 `ExportScene`，JPG 走 `lib/matchmaker/scene-canvas.ts`
  的 canvas 手繪（**零外部套件**），PDF 走瀏覽器列印流程（`window.print()` + `app/globals.css`
  的 `@media print` 區塊 + `components/matchmaker/PrintSheet.tsx` 列印版）
  各場地色塊的「進入計分板」入口導向 `/scoreboard?match=<matchId>` 時，兩隊名稱行會顯示該隊球員姓名與雙色漸層色塊（milestone M12 = matchmaker-scoreboard-team-labels change）；獨立開啟 `/scoreboard`（無 `match` 參數）維持「我方」／「對方」純文字，零行為變更
- `/matchmaker/players` — 參賽者名單（milestone M1 = add-player-roster change，見 openspec archive）。**不在全站 navbar**，由 matchmaker 區段導覽抵達
- `/matchmaker/history`（M7）、`/matchmaker/data`（M8）— 歷史賽果與資料匯入匯出，同樣不在全站 navbar
- `/matchmaker/stats` — 球員統計與排行榜（milestone M11 = matchmaker-player-stats change），同樣不在全站 navbar。
  統計計算為 `lib/matchmaker/player-stats.ts` 的純函式 `computePlayerStats(history, players)`
  （球員範圍為「目前名單」與「歷史紀錄」的**聯集**，回傳已排序完成），呈現層為
  `components/matchmaker/PlayerStatsTable.tsx`（九欄）。區間篩選與空狀態**重用 M7 的既有元件**
  （`HistoryRangeFilter`／`EmptyHistory`），SHALL NOT 另寫第二套。
  ⚠️ 本頁比照對戰頁形態直接持有 `useRosterStore`／`useRoundStore`，因此**載入時會經由兩個 store
  的 write effect 把三個 storage key 重新序列化回寫**（M4／M5 既有的 hydration pattern，非本頁引入）；
  頁面本身零 store setter 呼叫。細節見該 change 的 design.md Open Questions 第 1-c 條
- 上述**五頁**共用 `app/matchmaker/layout.tsx` 的區段導覽（「對戰／參賽者／歷史／資料／統計」；分頁清單與 active 判定在 `lib/matchmaker/section-nav.ts`，不寫在元件內）。
  **列印時整條區段導覽會被 `@media print` 隱藏**，新增分頁不需要另加 CSS 規則
- `/login` — 本機測試帳號登入頁（`LoginForm`；已登入時顯示「登出」按鈕）。**不在 navbar 的 `NAV_LINKS`**，由 navbar 的帳號圖示（`AccountEntry`）進入。帳號入口在 `< sm`（640px）隱藏（`hidden sm:inline-flex`），窄螢幕的登入／登出改由直接造訪 `/login` 提供；行動裝置登入入口為 G1 待辦
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
  - **E2E 登入夾具**：`playwright.config.ts` 的 `globalSetup`（`tests/e2e/global-setup.ts`）在 webServer 啟動後執行 migrate＋seed，再以 API 登入並存成 `tests/e2e/.auth/test-account.json`（已 gitignore）。**seed 只在 globalSetup 做，spec 不得自行 seed**：seed 會刪除同 email 的 user 並 cascade 刪除 session，使已存的 storage state 失效
    - 需要登入態的 spec 以 `test.use({ storageState })` 取用；登入／登出流程用新 context，**不得對共用 state 登出**
    - 缺 `hono-pickball/.dev.vars` 的 `TEST_ACCOUNT_*` 或 `ENVIRONMENT=development` 時，globalSetup 會刪除舊 state 並 warn，auth spec 整檔 skip
    - state 路徑與 skip 原因的單一來源是 `tests/e2e/helpers/storage-state.ts`
  - **`user-data` project**（第六個，Desktop Chrome、`testDir` 為 `tests/e2e/user-data/`、單 worker）：使用者資料（雲端同步）spec 只放 `tests/e2e/user-data/`，既有五個 project 維持訪客且不設 `storageState`；spec 以 `test.use({ storageState })` 取用登入態，`beforeEach` 呼叫 `tests/e2e/helpers/user-data.ts` 的 `clearTestAccountUserData()` 清空測試帳號的雲端資料（依 `USER_DATA_TABLES` 逐表刪除）。驗收迴圈要多跑一次 `--project=user-data`

### 目錄約定

以下路徑皆相對 `nextjs-pickball/`：

- `app/` — 各路由進入點（見「架構總覽」）＋ `layout.tsx`、`globals.css`
- `components/` — 依功能分子目錄：`ui/`（shadcn）、`auth/`（`LoginForm`）、`guide/`（指南區塊，共用小元件在 `guide/shared/`）、`layout/`（`SiteNavbar`、`AccountEntry`、`navItemStyles`——SiteNavbar 連結與 AccountEntry 共用內距與配色）、`matchmaker/`、`quiz/`、`scoreboard/`、`sync/`（`SyncStatusNotice`，同步狀態單行提示）、`tour/`
  - `guide/HeroTourCta` 是 **server component 例外**（其餘 guide 元件皆標 `"use client"`）；其行為由 **tour-experience** capability 規範，不屬 pickleball-guide-page
- `hooks/` — 依 capability 分組。跨 capability 歸屬清單的**單一來源**是 `openspec/specs/pickleball-guide-page/spec.md` 的「互動行為由三支 hooks 提供且各有 smoke test」Requirement——**任何** capability 新增 hook 時，其 change 須一併更新該清單（歷史上曾漏更新導致規格失真）：
  - pickleball-guide-page：`useScrollShadow`、`useScrollSpy`、`useScrolledPast`
  - quiz：`useQuiz`；player-roster：`useRosterStore`；round-lifecycle：`useRoundStore`、`useRoundTimer`
  - scoreboard：`useScoreboardStore`、`useFullscreen`、`useOrientation`、`useFocusMode`
  - tour-experience：`useEnterAnimationProgress`、`useReducedMotion`
  - auth：`useSession`
  - scoreboard 雲端同步（B5）：`useRemoteScoreboardStore`（歸 scoreboard 清單；由 `useScoreboardStore` 這個**選擇器 hook** 依 `resolveStorageMode` 在本機與雲端實作間切換，本機 hook 不改動；新增雲端 feature 比照此慣例，並同步更新上述主 spec 清單）
    - 雲端 hook 實作要點：`HYDRATE`（載入雲端資料）不寫回；`createLatestWinsSaver` 於 effect 內建立；`Scoreboard.tsx` 在雲端載入中／失敗時以 `loading`／`load-failed` 取代畫面，`data-sync-status` 屬性只在非 local 模式渲染
- `lib/` — `utils.ts`（cn）、`health.ts`、`navHeight.ts`；`auth/`（session-client、session-store）、`matchmaker/`（名單、儲存、匯出入、計時等留在前端的模組，如 roster、storage、round-storage、round-timer、csv、scene-canvas）、`scoreboard/`（storage、storage-keys、match-slots、radio-navigation）、`sync/`（雲端同步共用基礎：`storage-mode` 的 `resolveStorageMode`、`api-client` 的 `requestJson`、`latest-wins-saver` 的 `createLatestWinsSaver`、`sync-status` 的 `SyncStatus`）
  - **18 個純邏輯模組已移至核心套件 `@pickball/core`**（`scoreboard/{types,rules,reducer}`、`matchmaker/{types,allocation-types,allocation,candidates,duplication,pairing,rating-math,rating-types,rating,labels,round-types,round,history,history-range,transfer-types}`），這裡的舊路徑已不存在，且不留 re-export 轉址殼；一律從 `@pickball/core/<area>/<module>` 匯入。**它們的單元測試刻意留在 `lib/{scoreboard,matchmaker}/*.test.ts` 原位**（主 spec 以測試檔路徑為驗收錨點），不是漏搬。`next.config.ts` 以 `transpilePackages: ["@pickball/core"]` 讓 Next 轉譯該套件的 `.ts` 原始碼。新增純邏輯模組是否放核心套件，見 [`packages/pickball-core/CLAUDE.md`](../packages/pickball-core/CLAUDE.md)
  - **瀏覽器 I/O 擺放慣例**（M9 Final Review F-4 的 repo 級收斂，2026-09-03 定案）：`localStorage` 讀寫放 `lib/`（如 `matchmaker/round-storage.ts`、`scoreboard/storage.ts`）；`Blob`／`<a download>`／`File.text()` 等下載與選檔樣板放**元件層**（M8 design Decision 7，如 `components/matchmaker/downloadTextFile.ts`、`FileTextPicker.tsx`）。唯一例外：`lib/matchmaker/scene-canvas.ts`——canvas 繪製與 Blob 下載不可分割，理由見下方 TDD 例外清單與該檔檔頭
- `data/` — `guide/`、`quiz/`、`tour/` 純 TS 資料檔

### TDD（spec-driven）

`openspec/` 在 repo root，openspec CLI 一律從 repo root 執行；規格內引用本 workspace 的檔案路徑須帶 `nextjs-pickball/` 前綴。本 workspace 的 TDD 適用範圍與例外層（原 `openspec/config.yaml` 所載；該檔現在只放 `schema` 與 `context` 兩項設定，不含規則內文）：

- `app/**`、`components/**`、`hooks/**`、`lib/**`、`data/**` 下的行為邏輯模組採 TDD：先寫失敗測試 → 實作至綠 → refactor（三步規則與紅燈要求見 root CLAUDE.md）
- 例外（不強制 TDD，鼓勵補 smoke / E2E）：純樣式檔（`*.css`）、型別檔（`*.d.ts`）、入口與配置（`app/**/page.tsx`、`app/**/layout.tsx`、各種 `*.config.*`、`wrangler.jsonc`、`components.json`、`tsconfig.json`）、API proxy route、Playwright E2E 與測試基礎建設（`tests/**`）、`lib/matchmaker/scene-canvas.ts`（canvas 繪製與下載：所有決策都已在 `ExportScene` 內定死，本檔零分支、happy-dom 無 2D context，改以 `tests/e2e/specs/visual-export.spec.ts` 驗收，理由見該檔檔頭）
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
