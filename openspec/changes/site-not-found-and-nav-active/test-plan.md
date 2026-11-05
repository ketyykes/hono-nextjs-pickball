# Test Plan: site-not-found-and-nav-active

> **RED-phase 承諾書**。只寫「先寫哪些測試、斷言什麼、為什麼先寫」，不寫實作邏輯。
>
> Tier：`unit`（Vitest＋happy-dom；`SiteNavbar.test.tsx` 沿用既有 module-level `vi.mock("next/navigation")`、`vi.mock("@/hooks/useScrolledPast")`、`vi.mock("@/hooks/useSession")`）；
> `e2e`（`tests/e2e/specs/**`，五個 browser project，訪客、不設 `storageState`）。本 change 無 integration（後端零變更）。
>
> **it／test 名稱 MUST 與 delta spec 的「驗收」錨點逐字一致。**
>
> **class 斷言的共同要求**：active／muted 一律以 `className.split(/\s+/)` 的精確 token 比對（`text-slate-900` 是 `hover:text-slate-900` 的子字串，不得用 substring），比照既有 it「路由為 /matchmaker 時對戰分配連結套用 active 樣式」。
> **`aria-current` 斷言的共同要求**：active 以 `getAttribute("aria-current") === "page"`；非 active 以 `getAttribute("aria-current")` 為 `null`（不得只驗「不等於 page」——`"false"` 也算違規）。E2E 用 `toHaveAttribute("aria-current", "page")`／`not.toHaveAttribute("aria-current")`。
> **pathname mock 的共同要求**：以 `usePathname.mockReturnValue(...)` 覆寫；檔案 `afterEach` 已有 `vi.resetAllMocks()`，不得移除。
> **E2E 查找範圍**：404 頁的連結一律在 `page.getByRole("main")` 內查找；navbar 連結一律在 `page.getByRole("banner")` 內查找、`exact: true`（navbar 也有「首頁」「對戰分配」，區段導覽也有「對戰」）。404 test 不使用 `trackConsoleIssues`（瀏覽器會把主文件 404 記為 console error，屬預期）。E2E SHALL NOT 使用 `waitForTimeout`。

## site-navbar

### Requirement: 導航連結 active 判定涵蓋子路由並以 aria-current 標示（ADDED）

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| 首頁連結只在 pathname 恰為 / 時為 active | active 判定：首頁連結只在 pathname 恰為 / 時 active | `isNavLinkActive("/", "/")` → `true`；`("/", "/quiz")`、`("/", "/matchmaker/players")` → `false` | 首頁特判是唯一例外分支；模組不存在 → **真紅** | unit |
| pathname 與 href 完全相等時為 active | active 判定：pathname 與 href 完全相等時 active | `("/quiz", "/quiz")`、`("/matchmaker", "/matchmaker")` → `true` | golden path；模組不存在 → **真紅** | unit |
| pathname 為 href 的子路由時為 active | active 判定：子路由時 active | `("/matchmaker", p)`，`p` 為 `/matchmaker/players`、`/matchmaker/history`、`/matchmaker/stats`、`/matchmaker/data` → 皆 `true` | 本 change 的核心新行為；模組不存在 → **真紅** | unit |
| 前綴相似但非子路由時不為 active | active 判定：前綴相似但非子路由時不 active | `("/matchmaker", "/matchmakerx")`、`("/matchmaker", "/matchmaker-old")`、`("/tour", "/tournament")`、`("/quiz", "/scoreboard")` → 皆 `false` | 擋住 `startsWith(href)` 的錯誤實作；模組不存在 → **真紅** | unit |
| pathname 帶尾斜線時仍視為同一區段 | active 判定：pathname 帶尾斜線時仍屬同一區段 | `("/quiz", "/quiz/")`、`("/matchmaker", "/matchmaker/players/")` → `true` | 邊界；模組不存在 → **真紅** | unit |
| 路由為 %s 時對戰分配連結帶 aria-current 並套用 active 樣式 | navbar 在 matchmaker 子頁標示對戰分配並帶 aria-current | `it.each` 四個子頁 pathname → 「對戰分配」`aria-current === "page"`、token 含 `text-slate-900` 不含 `text-muted-foreground`；「首頁」「完整體驗」「計分板」「測驗」`aria-current` 為 `null`、token 含 `text-muted-foreground` | 現行精確比對下子頁不 active、且無 `aria-current` → **真紅** | unit |
| 完全相等時只有 active 連結帶 aria-current=page | 完全相等時只有 active 連結帶 aria-current | pathname `/quiz` → `container.querySelectorAll("header [aria-current]")` 長度為 1，該元素為「測驗」連結且值 `page`；logo 連結（`href="/"` 且不在 `<nav>` 內）`aria-current` 為 `null` | 現行無任何 `aria-current` → **真紅**；同時擋「全部連結都輸出屬性」 | unit |
| 路由非 /matchmaker 時對戰分配連結不套用 active 樣式（既有，授權修改） | 前綴相似但非子路由時對戰分配不 active | pathname 改為 `/matchmakerx` → 既有兩行斷言（token 含 `text-muted-foreground`、不含 `text-slate-900`）原樣＋新增 `aria-current` 為 `null` | 原 pathname `/matchmaker/players` 與新行為矛盾；改後在現行與新實作皆綠 → **regression guard**（必須在 RED commit 內一併改，否則 GREEN 後轉紅） | unit |
| （既有）路由為 /matchmaker 時對戰分配連結套用 active 樣式；Navbar 顯示對戰分配連結且指向 /matchmaker；導航列不包含內部診斷路由 /health；logo 與所有導航連結皆套用 whitespace-nowrap；窄螢幕下導航連結內距與容器間距依斷點遞減；logo 以 LogoMark 符號呈現而非 emoji；兩條 --site-nav-h 門檻 it | 既有「對戰分配連結」「測驗連結」「窄螢幕導航呈現」等 Scenario | 原樣通過，名稱與斷言一字不改 | regression guard（active 判定替換不得改變完全相等時的輸出與 class 組成） | unit |
| 參賽者頁的 navbar 對戰分配連結帶 aria-current | E2E 在參賽者頁 navbar 的對戰分配連結帶 aria-current | 開 `/matchmaker/players` → banner 內「對戰分配」`toHaveAttribute("aria-current","page")`、「首頁」`not.toHaveAttribute("aria-current")`；「對戰分配區段導覽」內「參賽者」`aria-current="page"`、「對戰」不帶 | 端到端證據（真瀏覽器的 `usePathname`）；現行無屬性 → **真紅** | e2e |
| （既有）區段導覽可在對戰頁與參賽者名單頁之間來回切換；可由對戰頁的區段導覽點擊進入統計頁；從首頁點擊 Navbar 的對戰分配連結進入對戰頁；`navbar-rwd.spec.ts`、`navbar-account-entry.spec.ts` 全部 | 既有 Scenario | 原樣通過（皆以 `getByRole("navigation", { name: "對戰分配區段導覽" })` 限定範圍，或不涉及 `aria-current`） | regression guard（navbar 新增的 `aria-current` 不得讓既有 locator 變成多重命中） | e2e |

## site-not-found

### Requirement: 全站未匹配路由顯示中文 404 頁（ADDED）

| Test name | Scenario | Assertion | Why first | Tier |
|-----------|----------|-----------|-----------|------|
| 404 頁匯出中文 metadata 標題 | 404 頁匯出中文 metadata 標題 | `import { metadata } from "./not-found"` → `metadata.title === "找不到頁面 \| 匹克球指南"` | 檔案不存在 → **真紅**（入口層例外，仍先寫測試，design Decision 6） | unit |
| 404 頁顯示中文標題、說明與回首頁、前往對戰分配兩個連結 | 404 頁顯示中文標題、說明與兩個導回連結 | `render(<NotFound />)` → `getByRole("heading", { level: 1, name: "找不到這個頁面" })`；`getByRole("main")` 內至少一個 `p` 元素的 `textContent` 去空白後非空；`getByRole("link", { name: "回首頁" })` `href` 為 `/`、`getByRole("link", { name: "前往對戰分配" })` `href` 為 `/matchmaker`，兩者 `data-slot === "button"`；`main` token 含 `pt-(--site-nav-h)` | 檔案不存在 → **真紅**；鎖住文案、href、按鈕元件與 navbar 避讓 | unit |
| 造訪不存在的路徑回應 404 並顯示中文說明與導回連結 | 造訪不存在的路徑回應 404 並顯示中文 404 頁 | `const res = await page.goto("/this-page-does-not-exist")` → `res.status() === 404`；`toHaveTitle("找不到頁面 \| 匹克球指南")`；main 內 heading「找不到這個頁面」、連結「回首頁」「前往對戰分配」可見；`page.getByText("This page could not be found")` `toHaveCount(0)`；`page.getByRole("banner")` 可見 | 現行為英文預設頁、title 英文 → **真紅**（status 404 本來就成立，紅燈落在 title／heading） | e2e |
| 404 頁點擊回首頁後導回首頁 | 從 404 頁點擊回首頁 | 開 `/this-page-does-not-exist` → 點 main 內「回首頁」→ `toHaveURL(/\/$/)`（以 baseURL 結尾）；heading「找不到這個頁面」`toHaveCount(0)` | 現行無此連結 → **真紅** | e2e |
| app、components、data、lib、hooks 的介面文字不含 emoji 或 emoji 類符號（既有） | 404 頁文案不含 emoji | 原樣通過（自動掃到新檔 `app/not-found.tsx`） | regression guard（寫入即綠，屬既有守門測試的涵蓋範圍） | unit |

## 指令驗收（非 Vitest，tasks 中標為「驗收（指令）」）

| # | 對應 Scenario | 指令 | 期望 |
|---|---|---|---|
| C1 | （型別） | `pnpm -r exec tsc --noEmit`；`pnpm --filter ./hono-pickball typecheck`；`pnpm --filter ./packages/pickball-core typecheck` | 皆 exit 0 |
| C2 | （lint） | `pnpm lint`（雙鎖） | 0 errors、warning 不多於基線 |
| C3 | （單元） | `pnpm test`（雙鎖） | 三組皆綠；前端檔數＝基線＋2（`lib/navActive.test.ts`、`app/not-found.test.tsx`）、測試數＝基線＋12（navActive 5＋not-found 2＋SiteNavbar `it.each` 4＋1）；後端、核心與基線相同 |
| C4 | （建置） | `pnpm build`（雙鎖） | exit 0；前端建置輸出的 route 清單含 `/_not-found`；建置後 `git status --porcelain` 為空 |
| C5 | （E2E） | 依 project 分開跑（雙鎖）：`pnpm --filter ./nextjs-pickball exec playwright test --workers=1 --project=<p>`（chromium、firefox、mobile-chrome 各一次；webkit、mobile-safari 各 `--shard=1/3`～`3/3`）；user-data 跑一次確認不受影響 | 五個 browser project 各＝基線＋3 且全 passed（skip 只限既有瀏覽器條件）；user-data 與基線相同且全 passed |
| C6 | （範圍） | `git diff main --stat -- nextjs-pickball/components/matchmaker nextjs-pickball/lib/matchmaker nextjs-pickball/hooks nextjs-pickball/app/layout.tsx nextjs-pickball/app/globals.css nextjs-pickball/components/ui nextjs-pickball/components/layout/navItemStyles.ts nextjs-pickball/components/layout/AccountEntry.tsx hono-pickball packages` | 輸出為空 |
| C7 | （規格） | `DO_NOT_TRACK=1 openspec validate site-not-found-and-nav-active --strict` | valid |

## Checklist

- [x] 每個 Requirement 至少一列（2 條 ADDED）
- [x] 每個 Scenario 至少一列（site-navbar 9 條、site-not-found 5 條）
- [x] 每列皆有 Tier（unit | e2e）
- [x] 授權修改的既有測試只有一處（`SiteNavbar.test.tsx` 一個 it 的 pathname、註解與新增一行），並標明原因
- [x] 新增 it 定義 10 個（展開為 12 個 test case）、E2E 3 條
