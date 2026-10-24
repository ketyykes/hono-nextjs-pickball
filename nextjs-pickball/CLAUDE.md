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
- `/quiz`、`/scoreboard`、`/tour`、`/health` — 測驗、單場 side-out 計分板、導覽動畫、健康檢查。`/scoreboard` **登入時以雲端為準**（經後端 API 同步，見「目錄約定」的 `lib/sync/`）：未綁定場次走計分板雲端同步（B5），綁定場次（`?match=`）走雲端場次分槽（B7，`useRemoteMatchSlotStore`）；訪客仍走 LocalStorage
- `/matchmaker` — 對戰頁（場次舞台：本輪設定、場地色塊網格、比分輸入與送出、休息名單），milestone M5 = matchmaker-match-stage-ui change。**全站 navbar 的 matchmaker 入口指向這裡**，SHALL NOT 同時掛第二條指向名單頁的連結。
  本頁另提供**匯出 JPG 與列印 PDF**（milestone M9 = matchmaker-visual-export change）：兩者共用
  `lib/matchmaker/export-scene.ts` 的同一份 `ExportScene`，JPG 走 `lib/matchmaker/scene-canvas.ts`
  的 canvas 手繪（**零外部套件**），PDF 走瀏覽器列印流程（`window.print()` + `app/globals.css`
  的 `@media print` 區塊 + `components/matchmaker/PrintSheet.tsx` 列印版）
  各場地色塊的「進入計分板」入口導向 `/scoreboard?match=<matchId>` 時，兩隊名稱行會顯示該隊球員姓名與雙色漸層色塊（milestone M12 = matchmaker-scoreboard-team-labels change）；獨立開啟 `/scoreboard`（無 `match` 參數）維持「我方」／「對方」純文字，零行為變更
- `/matchmaker/players` — 參賽者名單（milestone M1 = add-player-roster change，見 openspec archive）。**不在全站 navbar**，由 matchmaker 區段導覽抵達
- `/matchmaker/history`（M7）、`/matchmaker/data`（M8）— 歷史賽果與資料匯入匯出，同樣不在全站 navbar
  - `/matchmaker/data` 登入態差異（B6／B7）：JSON 匯出的 players 與 currentRound 取自雲端（`GET /api/matchmaker/round`），歷史取自本機（B8 前）；JSON 還原停用，改顯示說明；參賽者 CSV 匯入以雲端名單計算後一次 `POST` import；歷史 CSV 與清除本機資料不變
  - `/matchmaker/players` 的「重置名單」在登入時呼叫 `POST /api/matchmaker/reset`，成功後只清本機歷史（`resetLocalMatchProgress()`，B7 後只移除 `matchmaker:history:v1`），保留本機 roster key；雲端的回合與分槽由後端 reset batch 一併刪除
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

matchmaker 的儲存依登入態分流（引擎的分配、評分等純邏輯仍在前端或核心套件，是刻意決策，不是待搬的後端邏輯）：
- 訪客（含 auth 停用、session 載入中）仍全走 LocalStorage
- 登入後**參賽者名單**以雲端為準（B6：`/api/matchmaker/*`，選擇器 `useRosterStore` 依 `resolveStorageMode` 切換）
- 登入後**回合與場次分槽**以雲端為準（B7：`useRoundStore` 選擇器切 `useRemoteRoundStore`；計分板帶 `?match=` 時 `useScoreboardStore` 切 `useRemoteMatchSlotStore`）；**送出比分由後端權威**（`POST /api/matchmaker/round/matches/:matchId/score`，評分、回合完成狀態、歷史、刪除分槽在同一個 batch，前端不逐人 PUT 評分）
- 歷史讀取（歷史頁、統計頁、歷史 CSV）仍在本機，待 B8；過渡期登入時歷史寫入雲端但畫面讀本機，`useRemoteRoundStore` 的 `history` 恆為空陣列
- 雲端模式下使用者操作不會改動本機 `matchmaker:roster:v1`（該 key 保留訪客時期名單，作為 B9 匯入來源）；但選擇器仍會掛載本機 hook（hooks 不可條件式呼叫），mount 時依既有逐筆降級規則讀取並寫回同一份名單
- 後續 change 須知：登入態 JSON 還原目前停用，B9 決定其去留；B8 讓歷史頁與統計頁改讀雲端後，刪除 `resetLocalMatchProgress()`，`buildRemoteBackupSnapshot()` 的 `history` 改取雲端（詳見 openspec change `matchmaker-round-score-backend` design「交接給 B8～B9」）

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
  - **`user-data` project**（第六個，Desktop Chrome、`testDir` 為 `tests/e2e/user-data/`、單 worker）：使用者資料（雲端同步）spec 只放 `tests/e2e/user-data/`，既有五個 project 維持訪客且不設 `storageState`；spec 以 `test.use({ storageState })` 取用登入態，`beforeEach` 呼叫 `tests/e2e/helpers/user-data.ts` 的 `clearTestAccountUserData()` 清空測試帳號的雲端資料（依 `USER_DATA_TABLES` 逐表刪除）。驗收迴圈要多跑一次 `--project=user-data`（名單同步 spec 為 `tests/e2e/user-data/roster-sync.spec.ts`，回合與分槽同步 spec 為 `tests/e2e/user-data/round-sync.spec.ts`；訪客守護為 `tests/e2e/specs/matchmaker-local-mode.spec.ts`）

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
  - matchmaker 回合與場次分槽雲端同步（B7）：`useRemoteRoundStore`（歸 round-lifecycle 清單；由 `useRoundStore` 選擇器切換，本機實作 `useLocalRoundStore`）、`useRemoteMatchSlotStore`（歸 scoreboard 清單；由 `useScoreboardStore` 選擇器在帶 `matchId` 時切換）
    - `useRemoteRoundStore` 實作要點：回合變更走命令佇列（單一在途），送出時以最新已確認回合重新套用命令，不送算好的舊快照；送出比分走 `POST …/score`，不逐人 PUT 評分；回合 409 整份重載（回合與分槽）並呼叫 `reloadRemotePlayers`，401 交給 session refresh；全部分槽由本 hook 一併載入並以 `remoteMatchSlots` 回傳（雲端模式有值，本機為 `null`）
    - `useRemoteMatchSlotStore` 實作要點：分槽不存在代表場次已失效（`bindingStatus` 為 `missing`），此時不寫入
    - 對戰頁雲端模式：回填與鎖定判定以 `remoteMatchSlots` 為來源、不呼叫 `clearMatchSlots`（後端送出比分的 batch 已刪除分槽）；名單就緒（`isRosterReady`）前不回填，effect 依賴陣列含 `remoteMatchSlots` 與 `isRosterReady`；`CourtCard` 經 `remoteNavigate` 先 await 分槽 `PUT`（version 0），結果為 ok 或 conflict 才導向 `/scoreboard?match=<id>`，其他結果顯示錯誤
  - matchmaker 名單雲端同步（B6）：`useRemoteRosterStore`（歸 player-roster 清單；由 `useRosterStore` 選擇器切換，本機實作 `useLocalRosterStore` 一行未改）
    - 雲端 hook 實作要點：每位參賽者一個最新優先佇列、任一 409 整份重載、401 交給 session refresh；loading、load-failed、重載中、重置中都不送出也不改名單
    - 對戰、參賽者、統計三頁在 loading／load-failed 時以 `SyncStatusNotice` 取代內容，`data-sync-status` 只在非 local 時輸出
- `lib/` — `utils.ts`（cn）、`health.ts`、`navHeight.ts`；`auth/`（session-client、session-store）、`matchmaker/`（名單、儲存、匯出入、計時等留在前端的模組，如 roster、storage、round-storage、round-timer、csv、scene-canvas）、`scoreboard/`（storage、storage-keys、match-slots、radio-navigation）、`sync/`（雲端同步共用基礎：`storage-mode` 的 `resolveStorageMode`、`api-client` 的 `requestJson`、`latest-wins-saver` 的 `createLatestWinsSaver`、`sync-status` 的 `SyncStatus`）
  - `lib/sync/roster-api.ts`：名單 API 薄包裝，一律經 `requestJson`
  - `lib/sync/round-api.ts`：回合、場次分槽、送出比分的路徑字串與回應 schema 的唯一來源，一律經 `requestJson`，hook 不自行拼路徑
  - `lib/sync/round-command-queue.ts`：回合命令佇列（無 React 相依，由 `useRemoteRoundStore` 持有），單一在途、先進先出
  - `lib/matchmaker/remote-transfer.ts`：資料頁雲端分支，含 `importRemoteRoster`、`buildRemoteBackupSnapshot`、`REMOTE_TRANSFER_MESSAGES`
  - `lib/matchmaker/storage.ts` 的 `resetLocalMatchProgress()`：登入時重置只清本機歷史（回合與分槽已在雲端，由後端 reset batch 刪除）
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
