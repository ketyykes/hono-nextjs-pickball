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
- `/quiz`、`/scoreboard`、`/tour`、`/health` — 測驗、單場 side-out 計分板、導覽動畫、健康檢查。`/scoreboard` **登入時以雲端為準**（經後端 API 同步，見「目錄約定」的 `lib/sync/`）：未綁定場次走計分板雲端同步，綁定場次（`?match=`）走雲端場次分槽（`useRemoteMatchSlotStore`）；訪客仍走 LocalStorage
- `/matchmaker` — 對戰頁（場次舞台：本輪設定、場地色塊網格、比分輸入與送出、休息名單）。**全站 navbar 的 matchmaker 入口指向這裡**，SHALL NOT 同時掛第二條指向名單頁的連結。
  本頁另提供**匯出 JPG 與列印 PDF**：兩者共用
  `lib/matchmaker/export-scene.ts` 的同一份 `ExportScene`，JPG 走 `lib/matchmaker/scene-canvas.ts`
  的 canvas 手繪（**零外部套件**），PDF 走瀏覽器列印流程（`window.print()` + `app/globals.css`
  的 `@media print` 區塊 + `components/matchmaker/PrintSheet.tsx` 列印版）
  各場地色塊的「進入計分板」入口導向 `/scoreboard?match=<matchId>` 時，兩隊名稱行會顯示該隊球員姓名與雙色漸層色塊；獨立開啟 `/scoreboard`（無 `match` 參數）維持「我方」／「對方」純文字
- `/matchmaker/players` — 參賽者名單。**不在全站 navbar**，由 matchmaker 區段導覽抵達。navbar 的「對戰分配」在 `/matchmaker/*` 子頁亦標示 active（`aria-current="page"`），判定在 `lib/navActive.ts`
- `/matchmaker/history`、`/matchmaker/data` — 歷史賽果與資料匯入匯出，同樣不在全站 navbar
  - `/matchmaker/history` 登入態：`app/matchmaker/history/page.tsx` 為 server component，由 client 小元件 `HistoryModeSwitch` 依 `resolveStorageMode` 擇一渲染；remote 掛 `RemoteHistoryView`（經 `useRemoteHistory` 讀雲端），其餘為 `HistoryView`（本機）；例外是儲存模式 `pending`（session 尚未確認）時只渲染等待中容器（`data-sync-status` 為 `pending`，session 無法確認時為 `unavailable` 並顯示失敗提示與「先用這台裝置的資料」按鈕），兩個歷史元件都不掛載。區間界線由前端以核心 `rangeBounds` 計算後傳給後端，後端不推算區間。雲端歷史 loading／load-failed 時保留區間篩選，只把紀錄區塊換成 `SyncStatusNotice`（且不顯示損毀提示），篩選器不卸載、焦點不遺失；失敗後改選區間即重新載入
  - `/matchmaker/data` 登入態差異：JSON 匯出的 players 與 currentRound 取自雲端（`GET /api/matchmaker/round`），history 取自雲端（`GET /api/matchmaker/history?order=asc`）；JSON 還原改為「從 JSON 備份匯入到雲端」（見下方「本機資料匯入雲端」），本機覆寫式還原只在訪客時渲染；參賽者 CSV 匯入以雲端名單計算後一次 `POST` import；歷史 CSV 登入時改讀雲端（`buildRemoteHistoryCsv`）；清除本機資料兩種模式相同（只清本機）
  - **本機資料匯入雲端**：登入後把訪客時期留在本機的五個 key（名單、回合、歷史、`scoreboard:matches:v1` 中屬於回合未完成場次的分槽、`scoreboard:current:v1`）一次 `POST /api/import`。
    - 入口：資料頁的 `LocalDataImportSection`（錨點 `#local-import`；本機無資料顯示「本機沒有可匯入的資料」且無按鈕、超過單次上限顯示 oversize 說明）；參賽者頁在名單 `synced` 且為空、本機有可匯入資料時顯示 `LocalImportNotice`（連到該錨點）；兩者只在雲端模式渲染，訪客 DOM 不變
    - JSON 還原在登入時的語意：`JsonBackupSection` 雲端分支選檔 → `parseBackup` → `backupToImportRequest`（計分板段為空）→ 同一端點、同一拒絕規則；不寫入本機、不 reload
    - **使用者定案**：匯入成功後**保留**本機資料（不寫入、不清除任何本機 key）；雲端四張對戰分配機表任一已有本人資料即 409、整份不寫入（不覆寫、不合併；要以本機取代須先「重置名單」）；雲端已有獨立計分板時略過該段並標 `skipped`；重複匯入被守衛拒絕，不產生重複歷史
    - 一次性雲端操作：以點擊當下 `useSession()` 的 user id 呼叫、`null` 時不送出，`unauthorized` 時 `refresh()`；兩個入口的文案與結果轉換集中在 `components/matchmaker/local-import-view.ts`（`LOCAL_IMPORT_MESSAGES`、`describeImportOutcome`），結果呈現共用 `LocalImportResultMessage`
  - `/matchmaker/players` 的「重置名單」在登入時呼叫 `POST /api/matchmaker/reset`，成功後不清除任何本機 key（本機資料是訪客時期的資料，留作匯入來源）；雲端的名單、回合、分槽與歷史由後端 reset batch 一併刪除
- `/matchmaker/stats` — 球員統計與排行榜，同樣不在全站 navbar。
  統計頁入口：`app/matchmaker/stats/page.tsx` 依 `resolveStorageMode` 擇一渲染，登入時為 `RemoteStatsContent`（經 `useRemoteHistory` 讀雲端歷史），訪客與 session 載入中為 `LocalStatsContent`（本機內容；`pending` 時同樣掛它，由它依選擇器回報的顯示狀態顯示等待中提示；`pending` 有兩種來源：儲存模式未定〔等 session 確認，選擇器不交出本機資料；其中 session 無法確認時顯示狀態為 `unavailable`，見儲存三態條目〕與本機資料讀入前）；兩者共用下列計算與呈現元件。雲端歷史 loading／load-failed 時保留標題與區間篩選，只把排行榜區塊換成 `SyncStatusNotice`，焦點不遺失；失敗後改選區間即重新載入。名單 loading／load-failed 時仍整段以提示取代（不顯示標題與篩選器）。
  統計計算為 `lib/matchmaker/player-stats.ts` 的純函式 `computePlayerStats(history, players)`
  （球員範圍為「目前名單」與「歷史紀錄」的**聯集**，回傳已排序完成），呈現層為
  `components/matchmaker/PlayerStatsTable.tsx`（九欄）。區間篩選與空狀態**重用歷史頁的既有元件**
  （`HistoryRangeFilter`／`EmptyHistory`），SHALL NOT 另寫第二套。
  ⚠️ 本頁比照對戰頁形態直接持有 `useRosterStore`／`useRoundStore`，因此**載入時會經由兩個 store
  的 write effect 把三個 storage key 重新序列化回寫**（兩個 store 既有的 hydration pattern，非本頁引入）；
  頁面本身零 store setter 呼叫
- 上述**五頁**共用 `app/matchmaker/layout.tsx` 的區段導覽（「對戰／參賽者／歷史／資料／統計」；分頁清單與 active 判定在 `lib/matchmaker/section-nav.ts`，不寫在元件內）。
  **列印時整條區段導覽會被 `@media print` 隱藏**，新增分頁不需要另加 CSS 規則
- `/login` — 登入頁（`LoginForm`；已登入時顯示「登出」按鈕）。**顯示哪種登入方式只看 `/api/session` 的 `signInMethods`**：`google` 為真顯示「使用 Google 登入」按鈕、`emailPassword` 為真顯示測試帳號表單，兩者皆真時按鈕在上、表單在下，兩者皆假顯示「此環境未開放登入」；快照不含 `signInMethods`（舊後端）時視為 `{ google: false, emailPassword: true }`。正式站只有 Google，本機預設只有測試帳號（`.dev.vars` 填了 Google 才多出按鈕）。Google 登入由 `lib/auth/session-client.ts` 的 `startGoogleSignIn()` 發起：POST `/api/auth/sign-in/social`（`provider: "google"`、`callbackURL: "/"`、`errorCallbackURL: "/login"`），**只接受 `https:` 的回應 `url`** 才整頁導向（防止回應被竄改成 `javascript:` 等協定），絕不 throw、失敗回 `{ ok: false }`；`navigate` 參數只為單元測試替換導向。登入入口（navbar 的 `AccountEntry`）是否出現仍只看 `authEnabled`。**不在 navbar 的 `NAV_LINKS`**，由 navbar 的帳號圖示（`AccountEntry`）進入。帳號入口在所有寬度顯示（窄螢幕的空間由 `NAV_ITEM_BASE` 的連結內距與 navbar 容器間距讓出），載入中與 auth 停用時以隱形佔位元素保留寬度，回應前後導航連結位置不變
- 未匹配路由 — 由 `app/not-found.tsx`（Server Component）顯示中文 404 頁，HTTP 404、含「回首頁」「前往對戰分配」；`/api/*` 不經此頁（仍由 proxy 轉發後端）
- `app/api/[[...route]]/route.ts` — service binding proxy，把 `/api/*` 原樣轉發給 hono-pickball（瀏覽器視角 same-origin）。**不要在前端另寫 API route，後端邏輯一律放 hono-pickball**。轉發時 **`redirect: "manual"` 為必要**：binding 的 `fetch(url, init)` 預設跟隨轉址，後端的 3xx（OAuth callback 的轉址）會在 proxy 內被吞掉，瀏覽器收不到轉址與 callback 回應上的 `Set-Cookie`，登入就不會成立。實測 `next dev` 下 miniflare 的 service binding 同樣會跟隨轉址（加之前 GET `/api/auth/callback/google` 得 200 而非 3xx），所以本機與正式環境都需要這個設定

matchmaker 的儲存依登入態分流（引擎的分配、評分等純邏輯仍在前端或核心套件，是刻意決策，不是待搬的後端邏輯）：
- 儲存模式為三態（`resolveStorageMode`）：`local`（訪客、auth 停用，以及 hydration 後無上次登入提示的 session 載入中）全走 LocalStorage；`remote`（已登入）走雲端；`pending`（資料來源未定）一律不顯示也不操作資料。儲存模式為 `pending` 涵蓋伺服器輸出（無從得知提示）、hydration 前、session 載入中且帶上次登入提示；另有「本機資料讀入前」——此時儲存模式仍是 `local`，只是**顯示狀態**（`DataStatus`）為 `pending`（由 `lib/sync/sync-status.ts` 的 `localDataStatus(hydrated)` 判定，讀入後為 `local`）。兩種 `pending` 畫面統一顯示「正在載入資料…」（`DATA_PENDING_MESSAGE`，由 `SyncStatusNotice` 的 `pending` 呈現），不畫空狀態或預設值。
  **session 無法確認**（有上次登入提示，而 `/api/session` 請求失敗或帶提示等待逾時 10 秒）時，儲存模式仍為 `pending`，顯示狀態為 `unavailable`（由 `pendingDataStatus(snapshot)` 判定，使用端不自行讀快照欄位）：以 `syncStatusMessage("load-failed")` 的失敗文案加按鈕「先用這台裝置的資料」（`LOCAL_FALLBACK_ACTION_LABEL`）取代內容，不再自動退回本機。按下後呼叫 `chooseLocalFallback()` 進入本機備援（儲存模式 `local`），root layout 的 `LocalFallbackBanner` 常駐顯示 `LOCAL_FALLBACK_NOTICE`；重新整理頁面可再次連線雲端。無提示時請求失敗仍為 auth 停用的 `ready`（`local`）
- 登入後**參賽者名單**以雲端為準（`/api/matchmaker/*`，選擇器 `useRosterStore` 依 `resolveStorageMode` 切換）
- 登入後**回合與場次分槽**以雲端為準（`useRoundStore` 選擇器切 `useRemoteRoundStore`；計分板帶 `?match=` 時 `useScoreboardStore` 切 `useRemoteMatchSlotStore`）；**送出比分由後端權威**（`POST /api/matchmaker/round/matches/:matchId/score`，評分、回合完成狀態、歷史、刪除分槽在同一個 batch，前端不逐人 PUT 評分）
- 登入後**歷史讀取**以雲端為準（歷史頁、統計頁、歷史 CSV、JSON 匯出的 history 皆讀 `GET /api/matchmaker/history`）；區間界線由前端以核心 `rangeBounds(range, now)` 以使用者裝置時區算成毫秒（`from` 含、`to` 不含）後傳給後端，後端不計算區間（Workers 為 UTC，在後端算「今日」會讓台灣使用者到早上 8 點才換日）。歷史由 `useRemoteHistory` 讀取，`useRemoteRoundStore` 的 `history` 恆為空陣列（該 hook 不讀歷史，畫面一律由 `useRemoteHistory` 取得）；雲端略過的損毀列由 `droppedCount` 提示，不刪除
- 雲端模式下使用者操作不會改動本機 `matchmaker:roster:v1`（該 key 保留訪客時期名單，作為本機資料匯入雲端的來源）；但選擇器仍會掛載本機 hook（hooks 不可條件式呼叫），mount 時依既有逐筆降級規則讀取並寫回同一份名單
- 登入態 JSON 還原為「從 JSON 備份匯入到雲端」（見上方「本機資料匯入雲端」）；`buildRemoteBackupSnapshot()` 的 `history` 取自雲端
- **匯入歷史的約束**：① 匯入的歷史 MUST 寫入 `played_at`（`Date.parse(playedAt)`），否則歷史的區間查詢會漏掉；② 匯入的歷史以 `asc` 讀回時順序為 `played_at` 加插入順序，匯入時 MUST 依本機的追加順序插入，同時間的紀錄才會維持原順序；③ 登入時重置不碰本機，本機五個 key 皆保留，都可作為匯入來源

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
  - **`user-data` project**（第六個，Desktop Chrome、`testDir` 為 `tests/e2e/user-data/`、單 worker）：使用者資料（雲端同步）spec 只放 `tests/e2e/user-data/`，既有五個 project 維持訪客且不設 `storageState`；spec 以 `test.use({ storageState })` 取用登入態，`beforeEach` 呼叫 `tests/e2e/helpers/user-data.ts` 的 `clearTestAccountUserData()` 清空測試帳號的雲端資料（依 `USER_DATA_TABLES` 逐表刪除，含第二帳號）。spec 直接打 API 時用同檔的 `expectedUserHeaders()` 帶預期帳號標頭；換帳號 spec 為 `tests/e2e/user-data/account-switch.spec.ts`，使用 seed 衍生的第二帳號。驗收迴圈要多跑一次 `--project=user-data`（名單同步 spec 為 `tests/e2e/user-data/roster-sync.spec.ts`，回合與分槽同步 spec 為 `tests/e2e/user-data/round-sync.spec.ts`；訪客守護為 `tests/e2e/specs/matchmaker-local-mode.spec.ts`）

### 目錄約定

以下路徑皆相對 `nextjs-pickball/`：

- `app/` — 各路由進入點（見「架構總覽」）＋ `layout.tsx`、`globals.css`
- `components/` — 依功能分子目錄：`ui/`（shadcn）、`auth/`（`LoginForm`）、`guide/`（指南區塊，共用小元件在 `guide/shared/`）、`layout/`（`SiteNavbar`、`AccountEntry`、`navItemStyles`——SiteNavbar 連結與 AccountEntry 共用內距與配色）、`matchmaker/`（歷史與統計的雲端／本機分支元件：`HistoryModeSwitch`、`RemoteHistoryView`、`RemoteStatsContent`、`LocalStatsContent`）、`quiz/`、`scoreboard/`、`sync/`（`SyncStatusNotice`，同步狀態單行提示；`unavailable` 時另附「先用這台裝置的資料」按鈕，按鈕在 `role="status"` 之外；`LocalFallbackBanner`，本機備援期間常駐的固定定位提示，掛在 `app/layout.tsx`）、`tour/`
  - `guide/HeroTourCta` 是 **server component 例外**（其餘 guide 元件皆標 `"use client"`）；其行為由 **tour-experience** capability 規範，不屬 pickleball-guide-page
- `hooks/` — 依 capability 分組。跨 capability 歸屬清單的**單一來源**是 `openspec/specs/pickleball-guide-page/spec.md` 的「互動行為由三支 hooks 提供且各有 smoke test」Requirement——**任何** capability 新增 hook 時，其 change 須一併更新該清單（歷史上曾漏更新導致規格失真）：
  - pickleball-guide-page：`useScrollShadow`、`useScrollSpy`、`useScrolledPast`
  - quiz：`useQuiz`；player-roster：`useRosterStore`；round-lifecycle：`useRoundStore`、`useRoundTimer`
  - scoreboard：`useScoreboardStore`、`useFullscreen`、`useOrientation`、`useFocusMode`
  - tour-experience：`useEnterAnimationProgress`、`useReducedMotion`
  - auth：`useSession`（回傳含 `hydrated`：伺服器快照為 false、hydration 後為 true，供 `resolveStorageMode` 判斷）
  - matchmaker 歷史雲端讀取：`useRemoteHistory`（歸 match-history 清單；唯讀，收 `enabled`、`userId`、`range`、`onUnauthorized`，依 `rangeBounds` 算界線並帶 `expectedUserId` 請求，換帳號即換世代、以擁有者標記擋前一帳號的資料；回傳 `items`、`total`、`droppedCount`、`syncStatus`）。使用端為 `RemoteHistoryView`、`RemoteStatsContent`；`HistoryModeSwitch` 與統計頁入口負責本機與雲端擇一
  - scoreboard 雲端同步：`useRemoteScoreboardStore`（歸 scoreboard 清單；由 `useScoreboardStore` 這個**選擇器 hook** 依 `resolveStorageMode` 在本機與雲端實作間切換，本機 hook 不改動；新增雲端 feature 比照此慣例，並同步更新上述主 spec 清單）
    - **帳號世代（四支雲端 hook 共通）**：hook 收 `userId` option，主 effect 依賴含 `userId`；一個世代內所有請求（載入、儲存、重試、重置、衝突重載）都帶該世代的 `expectedUserId`，換帳號即丟棄舊世代的待送變更並重新載入；以 reducer 保存的擁有者標記（`owner`）與 `userId` 不同時，render 期就不回傳前一帳號的資料、操作不送出；`userId` 為 `null` 時不發任何請求。一次性雲端操作（`CourtCard` 建立分槽、JSON 備份、CSV 匯入、本機資料匯入與雲端 JSON 匯入）以觸發當下 `useSession()` 的 user id 呼叫，未授權時 `refresh()`
    - 雲端 hook 實作要點：`HYDRATE`（載入雲端資料）不寫回；`createLatestWinsSaver` 於 effect 內建立；`Scoreboard.tsx` 在 `isContentBlocked`（`pending`、`unavailable`、`loading`、`load-failed`）時取代畫面，`data-sync-status` 屬性只在非 local 模式渲染
  - matchmaker 回合與場次分槽雲端同步：`useRemoteRoundStore`（歸 round-lifecycle 清單；由 `useRoundStore` 選擇器切換，本機實作 `useLocalRoundStore`）、`useRemoteMatchSlotStore`（歸 scoreboard 清單；由 `useScoreboardStore` 選擇器在帶 `matchId` 時切換）
    - `useRemoteRoundStore` 實作要點：回合變更走命令佇列（單一在途），送出時以最新已確認回合重新套用命令，不送算好的舊快照；送出比分走 `POST …/score`，不逐人 PUT 評分；回合 409 整份重載（回合與分槽）並呼叫 `reloadRemotePlayers`，401 交給 session refresh；全部分槽由本 hook 一併載入並以 `remoteMatchSlots` 回傳（雲端模式有值，本機為 `null`）
    - `useRemoteMatchSlotStore` 實作要點：分槽不存在代表場次已失效（`bindingStatus` 為 `missing`），此時不寫入
    - 對戰頁雲端模式：回填與鎖定判定以 `remoteMatchSlots` 為來源、不呼叫 `clearMatchSlots`（後端送出比分的 batch 已刪除分槽）；名單就緒（`isRosterReady`）前不回填，effect 依賴陣列含 `remoteMatchSlots` 與 `isRosterReady`；`CourtCard` 經 `remoteNavigate` 先 await 分槽 `PUT`（version 0），結果為 ok 或 conflict 才導向 `/scoreboard?match=<id>`，其他結果顯示錯誤
  - matchmaker 名單雲端同步：`useRemoteRosterStore`（歸 player-roster 清單；由 `useRosterStore` 選擇器切換，本機實作 `useLocalRosterStore`）
    - 雲端 hook 實作要點：每位參賽者一個最新優先佇列、任一 409 整份重載、401 交給 session refresh；loading、load-failed、重載中、重置中都不送出也不改名單
    - 對戰、參賽者、統計三頁在 `isContentBlocked(status)`（`pending`、`unavailable`、`loading`、`load-failed`）時以 `SyncStatusNotice` 取代內容，`data-sync-status` 只在非 local 時輸出
- `lib/` — `utils.ts`（cn）、`health.ts`、`navHeight.ts`、`navActive.ts`（navbar 連結 active 判定）；`auth/`（session-client：`fetchSession` 請求失敗（非 200、形狀不符、網路錯誤）回 `null`，不再當成 auth 停用；session-store：依提示把 `null` 轉為無法確認或 auth 停用的 ready，並提供 `chooseLocalFallback`（只在無法確認時有效，切為本機備援）；session-hint：只存布林的「上次確認為已登入」提示）、`matchmaker/`（名單、儲存、匯出入、計時等留在前端的模組，如 roster、storage、round-storage、round-timer、csv、scene-canvas）、`scoreboard/`（storage、storage-keys、match-slots、radio-navigation）、`sync/`（雲端同步共用基礎：`storage-mode` 的 `resolveStorageMode`（回傳 `local`／`remote`／`pending` 三態）、`api-client` 的 `requestJson`、`latest-wins-saver` 的 `createLatestWinsSaver`、`sync-status` 的 `SyncStatus`、`DataStatus`（`SyncStatus` 加 `pending`、`unavailable`）、`localDataStatus`（本機資料讀入前為 `pending`）、`pendingDataStatus`（儲存模式 `pending` 時回 `pending` 或 `unavailable`）、`isContentBlocked`、`DATA_PENDING_MESSAGE`、`LOCAL_FALLBACK_ACTION_LABEL`、`LOCAL_FALLBACK_NOTICE`）
  - `lib/sync/api-client.ts` 的 `requestJson`：**必填 `expectedUserId`**，每個請求帶 `X-Expected-User-Id`；只用呼叫端給的值、不讀 session store，401（含 `ACCOUNT_MISMATCH`）分類為 `unauthorized`。API 包裝（`roster-api`、`round-api`、`remote-transfer`）一律以 `expectedUserId` 為第一參數
  - `lib/sync/roster-api.ts`：名單 API 薄包裝，一律經 `requestJson`
  - `lib/sync/round-api.ts`：回合、場次分槽、送出比分的路徑字串與回應 schema 的唯一來源，一律經 `requestJson`，hook 不自行拼路徑
  - `lib/sync/history-api.ts`：歷史路徑字串與回應 schema 的唯一來源（`fetchRemoteHistory(expectedUserId, { from, to, order })`），一律經 `requestJson`，hook 與 `remote-transfer` 不自行拼路徑
  - `lib/sync/local-import.ts`：`/api/import` 路徑字串的唯一來源，一律經 `requestJson`。`buildLocalImportPayload()` 只經既有 reader 讀本機五個 key（分槽只讀回合未完成場次、歷史依 `matchId` 去重並回報略過筆數、以核心 `checkImportLimits` 判定 `oversize`：五段包裝後各 ≤ 1,900,000 位元組、參賽者 ≤ 500 位，與後端同一份判定），本模組不寫入本機（reader 遇損毀資料的既有清理除外）；`importLocalData(expectedUserId, payload)` 分類為 `imported`／`cloud-not-empty`（409）／`too-large`（413）／`unauthorized`（401）／`failed`；`backupToImportRequest()`、`hasImportableLocalData()`（oversize 時仍為 true，由資料頁顯示說明）
  - `lib/sync/round-command-queue.ts`：回合命令佇列（無 React 相依，由 `useRemoteRoundStore` 持有），單一在途、先進先出
  - `lib/matchmaker/remote-transfer.ts`：資料頁雲端分支（備份快照與歷史 CSV 的歷史皆經 `fetchRemoteHistory({ order: "asc" })` 取自雲端），413 → `importTooLarge` 文案，含 `importRemoteRoster`、`buildRemoteBackupSnapshot`、`buildRemoteHistoryCsv`、`REMOTE_TRANSFER_MESSAGES`
  - **18 個純邏輯模組已移至核心套件 `@pickball/core`**（`scoreboard/{types,rules,reducer}`、`matchmaker/{types,allocation-types,allocation,candidates,duplication,pairing,rating-math,rating-types,rating,labels,round-types,round,history,history-range,transfer-types}`），這裡的舊路徑已不存在，且不留 re-export 轉址殼；一律從 `@pickball/core/<area>/<module>` 匯入。**它們的單元測試刻意留在 `lib/{scoreboard,matchmaker}/*.test.ts` 原位**（主 spec 以測試檔路徑為驗收錨點），不是漏搬。`next.config.ts` 以 `transpilePackages: ["@pickball/core"]` 讓 Next 轉譯該套件的 `.ts` 原始碼。新增純邏輯模組是否放核心套件，見 [`packages/pickball-core/CLAUDE.md`](../packages/pickball-core/CLAUDE.md)
  - **瀏覽器 I/O 擺放慣例**（repo 級慣例）：`localStorage` 讀寫放 `lib/`（如 `matchmaker/round-storage.ts`、`scoreboard/storage.ts`）；`Blob`／`<a download>`／`File.text()` 等下載與選檔樣板放**元件層**（如 `components/matchmaker/downloadTextFile.ts`、`FileTextPicker.tsx`）。唯一例外：`lib/matchmaker/scene-canvas.ts`——canvas 繪製與 Blob 下載不可分割，理由見下方 TDD 例外清單與該檔檔頭
- `data/` — `guide/`、`quiz/`、`tour/` 純 TS 資料檔

### TDD（spec-driven）

`openspec/` 在 repo root，openspec CLI 一律從 repo root 執行；規格內引用本 workspace 的檔案路徑須帶 `nextjs-pickball/` 前綴。本 workspace 的 TDD 適用範圍與例外層（原 `openspec/config.yaml` 所載；該檔現在只放 `schema` 與 `context` 兩項設定，不含規則內文）：

- `app/**`、`components/**`、`hooks/**`、`lib/**`、`data/**` 下的行為邏輯模組採 TDD：先寫失敗測試 → 實作至綠 → refactor（三步規則與紅燈要求見 root CLAUDE.md）
- 例外（不強制 TDD，鼓勵補 smoke / E2E）：純樣式檔（`*.css`）、型別檔（`*.d.ts`）、入口與配置（`app/**/page.tsx`、`app/**/layout.tsx`、`app/not-found.tsx`、各種 `*.config.*`、`wrangler.jsonc`、`components.json`、`tsconfig.json`）、API proxy route、Playwright E2E 與測試基礎建設（`tests/**`）、`lib/matchmaker/scene-canvas.ts`（canvas 繪製與下載：所有決策都已在 `ExportScene` 內定死，本檔零分支、happy-dom 無 2D context，改以 `tests/e2e/specs/visual-export.spec.ts` 驗收，理由見該檔檔頭）
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
