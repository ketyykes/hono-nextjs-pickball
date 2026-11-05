# Design: site-not-found-and-nav-active

## Context

- `nextjs-pickball/components/layout/SiteNavbar.tsx`（`"use client"`）以 `usePathname()` 取得路由，在 `NAV_LINKS.map` 內以 `const active = pathname === link.href` 判定 active，active 時以 `cn(...)` 追加 `text-slate-900`（solid）或 `text-white`（透明），沒有任何 `aria-*` 屬性。`NAV_LINKS` 為 `/`、`/tour`、`/scoreboard`、`/quiz`、`/matchmaker` 五條。
- `/matchmaker/players`、`/history`、`/stats`、`/data` 四個子頁共用 `app/matchmaker/layout.tsx` 的區段導覽 `MatchmakerTabs`，其 active 判定在 `lib/matchmaker/section-nav.ts`，**刻意**用精確比對（檔頭註解：前綴比對會讓「對戰」在每個子頁亮起），並對 active 分頁加 `aria-current="page"`。
- 既有 `SiteNavbar.test.tsx` 的 it「路由非 /matchmaker 時對戰分配連結不套用 active 樣式」以 `/matchmaker/players` 斷言「對戰分配」**不** active，註解寫明「名單頁誤判為 active 會讓使用者誤以為自己在對戰頁」。這是 `add-match-stage` 時的判斷；本 change 推翻它（Decision 2），需授權修改該 it。主 spec 沒有任何 Scenario 以該 it 為錨點（`grep "路由非 /matchmaker" openspec/specs` 無結果）。
- `nextjs-pickball/app/` 沒有 `not-found.tsx`、`loading.tsx`、`error.tsx`，也沒有 `proxy.ts`／`middleware.ts`。`app/api/[[...route]]/route.ts` 是 optional catch-all，只位於 `app/api/` 下，只吃 `/api` 與 `/api/*`，不會攔到其他未匹配路徑。
- 站內頁面避開固定 navbar 的寫法有兩種：`app/quiz/page.tsx`、`app/login/page.tsx`、`app/matchmaker/layout.tsx` 用 `pt-14` 加註解指向 `--site-nav-h`；`components/scoreboard/Scoreboard.tsx` 用 `pt-(--site-nav-h)`（Tailwind v4 的 CSS 變數簡寫）。主 spec「全域 navbar 高度以 CSS variable 暴露」要求 layout 元件透過變數取用高度。
- 按鈕：`components/ui/button.tsx`（shadcn，`"use client"`，支援 `asChild`）；Server Component 以 `<Button asChild><Link …/></Button>` 使用的先例為 `components/guide/HeroTourCta.tsx`。
- `app/emojiFree.test.ts` 以 AST 掃描 `app`、`components`、`data`、`lib`、`hooks` 下所有檔案的介面文字，新檔自動納入。

### Next.js 16（本機 16.2.9）慣例查證

- 來源：`nextjs-pickball/node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/not-found.md`（依 `nextjs-pickball/AGENTS.md` 規定先讀本機文件），並以 Context7 `/vercel/next.js/v16.2.9` 對照。
- 「root `app/not-found.js` 與 `app/global-not-found.js` 除了處理 `notFound()`，也處理整個 app 的未匹配 URL」；`not-found` 預設為 Server Component、不接受 props。
- 狀態碼：「non-streamed 回應回 `404`，streamed 回應回 `200`」；串流在 Suspense fallback（例如 `loading.tsx`）渲染時開始（`loading.md` 的 Status Codes 節）。本 app 沒有 `loading.tsx`，404 頁本身不 suspend，因此回 404。
- `metadata`：文件的 Metadata 範例只示範 `global-not-found.js`，沒有明文寫 `not-found.js` 可匯出 `metadata`；查 `node_modules/next/dist/lib/metadata/resolve-metadata.js`，`collectMetadata` 在 `errorConvention` 為 `not-found` 時會讀取該模組（`getComponentTypeModule(tree, errorConvention)`）的 metadata，故 root `not-found.tsx` 的 `metadata` 會生效。E2E 以 `toHaveTitle` 實測把關（Risk 1）。
- `global-not-found.js` 仍是 experimental（需 `experimental.globalNotFound`），適用於多個 root layout 或 root layout 位於動態 segment 的情況；本 app 只有一個 root layout，不需要。

## Goals

- 未匹配路由顯示中文 404 頁（中文 `<title>`、標題、說明、兩個導回連結），狀態碼 404，navbar 照常可用。
- navbar 在子路由也標示所屬區段，active 連結帶 `aria-current="page"`。
- active 判定抽成可單元測試的純函式，元件只呈現。

## Non-Goals

- `error.tsx`／`global-error.tsx`／`loading.tsx`／`global-not-found.tsx`、Open Graph metadata。
- navbar 視覺重設計（底線、背景色塊）、`<nav>` 的 `aria-label`、`NAV_LINKS` 增刪。
- `MatchmakerTabs`／`section-nav.ts` 任何改動。
- 404 頁依網址猜測「你是不是要找…」、顯示被請求的路徑（需 client hook，見 Decision 5）。

## Decisions

### Decision 1：active 判定抽成 `lib/navActive.ts` 的 `isNavLinkActive(href, pathname)`

**Choice**：新模組 `nextjs-pickball/lib/navActive.ts`，匯出 `isNavLinkActive(href: string, pathname: string): boolean`：`href === "/"` 時回傳 `pathname === "/"`；否則回傳 `pathname === href || pathname.startsWith(href + "/")`。不 import React／`next/navigation`。檔名比照同層 `navHeight.ts` 的 camelCase。`SiteNavbar` 改為 `const active = isNavLinkActive(link.href, pathname)`。

**Rationale**：
- `nextjs-pickball/CLAUDE.md` TDD 節：「行為邏輯下放 `hooks/`、`lib/` 再對其做 TDD」；`section-nav.ts` 是同樣的先例（判定在 `lib/`，元件只呈現）。
- 「`href + "/"` 前綴」同時涵蓋尾斜線（`/quiz/`）與多層子路由（`/matchmaker/players/`），且擋下 `/matchmakerx`、`/tournament`（對 `/tour`）這類前綴相似路徑。
- 首頁特判：`"/" + "/"` 為 `//`，一般 pathname 不會以此開頭，但若不特判，`pathname.startsWith("/")` 類的簡化寫法會讓首頁永遠 active；明寫特判讓意圖清楚，並由單元測試鎖住。

**Alternatives considered**：
- 留在元件內寫比對式：無法在 `lib/` 層單元測試，只能經元件 render 驗證，前綴相似的邊界要多寫元件 it。不選。
- 在 `NAV_LINKS` 每筆加 `match: "exact" | "prefix"` 欄位：五條連結只有 `/` 需要例外，多一個欄位是為單一例外加抽象。不選。
- 放進 `lib/matchmaker/section-nav.ts` 共用：兩者語意不同（Decision 2），且 navbar 不屬 matchmaker。不選。
- 正規化尾斜線後再精確比對＋子路由比對：結果與「`href + "/"` 前綴」相同，多一步。不選。

### Decision 2：navbar 以「區段」語意標示，區段導覽維持「頁」語意

**Choice**：navbar 的「對戰分配」在 `/matchmaker` 與四個子頁都 active；區段導覽 `MatchmakerTabs` 維持精確比對不改。既有 it「路由非 /matchmaker 時對戰分配連結不套用 active 樣式」的 pathname 由 `/matchmaker/players` 改為 `/matchmakerx`，保留它作為「前綴相似但非子路由」的元件層 guard（名稱字面仍成立），並補一行 `aria-current` 為 null 的斷言。

**Rationale**：
- navbar 的連結是**全站區段**入口，子頁沒有任何連結亮起時使用者看不出自己在哪個區段（coordinator 裁定的問題陳述）；區段導覽在同一畫面已用「參賽者」等分頁標示具體頁面，兩層各自標示自己層級的位置，不會讓使用者誤以為在對戰頁——前一個 change 註解的顧慮由區段導覽的標示消解。
- 修改既有 it 而非刪除：它守的「不得把前綴相似路徑誤判為 active」在新規則下仍有價值，只是原本選的路徑剛好落在新規則的「子路由」上。

**Alternatives considered**：
- 子頁時 navbar 用另一種較淡的「區段 active」樣式：屬視覺重設計，超出範圍。不選。
- 同時把 `section-nav.ts` 改成前綴比對：會讓「對戰」在每個子頁亮起，正是該檔檔頭註解要防的錯誤。不選。
- 刪除舊 it、另寫新 it：失去既有錨點、多一次命名；改 pathname 即可保留意圖。不選。

### Decision 3：`aria-current` 一律用 `"page"`，非 active 時不輸出屬性

**Choice**：active 連結 `aria-current="page"`，非 active 傳 `undefined`（React 不輸出該屬性），寫法比照 `MatchmakerTabs.tsx` 的 `aria-current={tab.active ? "page" : undefined}`。子路由時也用 `"page"`。

**Rationale**：
- coordinator 範圍裁定明訂「active 連結 MUST 帶 `aria-current="page"`」。
- 與站內唯一既有先例 `MatchmakerTabs` 一致；E2E 與元件測試以 `toHaveAttribute("aria-current", "page")`／`not.toHaveAttribute("aria-current")` 斷言，兩組導覽的測試寫法相同。
- 子頁時頁面上會同時有兩個 `aria-current="page"`（navbar 的「對戰分配」與區段導覽的「參賽者」），但分屬兩個 `<nav>`、兩組不同的導覽集合；WAI-ARIA 對 `aria-current` 的要求是「在一組相關元素中」標示目前項，不同集合各標一個不衝突。

**Alternatives considered**：
- 子路由時用 `aria-current="true"`、完全相等時才用 `"page"`：語意上更精確（navbar 連結指向的不是「目前這一頁」），但與 coordinator 裁定字面不符，且多一個分支與測試。不選；列為 Risk 3 供日後評估。
- 非 active 時輸出 `aria-current="false"`：規格允許但無益，且與 `MatchmakerTabs` 不一致。不選。

### Decision 4：404 頁歸屬新 capability `site-not-found`

**Choice**：新增小 capability `site-not-found`，以 ADDED 一條 Requirement 規範 404 頁。

**Rationale**：`site-navbar` 的 Purpose 是「全站共享的固定頂部導航列」，404 頁不是 navbar 的一部分；`emoji-free-ui`、`api-connectivity` 皆不適合。新開小 capability 讓日後若要補 error 頁等全站特殊頁，有清楚的落點（屆時可另開或併入，由該 change 決定）。

**Alternatives considered**：
- 併入 `site-navbar`：會讓 spec 主詞擴張為「全站外框」，與其 Purpose 不符。不選。
- 命名為 `site-shell`／`site-special-pages`：範圍太寬，今晚只有 404 一條 Requirement，名稱應貼合內容。不選。

### Decision 5：404 頁為無狀態 Server Component，兩個導回連結為「回首頁」與「前往對戰分配」

**Choice**：`app/not-found.tsx` 不標 `"use client"`、不使用 `usePathname`／`headers()`，不顯示被請求的路徑。結構：`<main className="… pt-(--site-nav-h)">` → 置中容器 → 小字 `404` 標籤 → `h1`「找不到這個頁面」→ 說明 `p`（「你要找的網址不存在，可能是連結已失效或網址輸入有誤。」）→ 兩個按鈕：`<Button asChild><Link href="/" transitionTypes={["nav-back"]}>回首頁</Link></Button>` 與 `<Button asChild variant="outline"><Link href="/matchmaker" transitionTypes={["nav-forward"]}>前往對戰分配</Link></Button>`。`metadata = { title: "找不到頁面 | 匹克球指南" }`。版面 token 比照 `app/quiz/page.tsx`（`min-h-screen bg-background`、`mx-auto max-w-[640px] px-6 py-12`、標題 `font-outfit … font-bold tracking-tight`、說明 `text-muted-foreground`）。

**Rationale**：
- 第二個連結選 `/matchmaker`：站內唯一有多層子路由的區段就是 `/matchmaker/*`（五頁），手打或舊書籤打錯的網址最可能落在這裡（如 `/matchmaker/player`）；對戰分配也是回訪使用者最常用的工具入口。計分板只有單頁，從首頁或 navbar 一鍵可達。
- 不顯示被請求路徑：文件說要用 `usePathname` 必須在 client 端取得；為一行輔助文字把整頁變成 Client Component 或另拆 client 子元件，超出「中文說明＋導回連結」的範圍。
- `pt-(--site-nav-h)`：直接透過變數取高度，符合主 spec「全域 navbar 高度以 CSS variable 暴露」，`Scoreboard.tsx` 已證實此簡寫在本專案的 Tailwind v4 管線可用。
- `transitionTypes`：與 navbar、`HeroTourCta` 一致，回首頁為 `nav-back`、前往其他區段為 `nav-forward`，讓 root layout 的 `<ViewTransition>` 動畫方向一致。
- `robots`：404 回應 Next 會自動注入 `noindex`（文件 Metadata 節的 Good to know），不需在 `metadata` 另寫。

**Alternatives considered**：
- 第二個連結選「計分板」：見上，較不可能是使用者打錯網址時想去的地方。不選。
- 三個以上連結（把 navbar 五條全列）：navbar 本來就在畫面上，重複列出只是噪音。不選。
- `pt-14` 加註解（quiz／login／matchmaker layout 的寫法）：也可行，但等於再多一處硬寫數值；主 spec 的方向是變數。不選。
- `global-not-found.tsx`：experimental、需自帶 `<html>`／字型／`globals.css`，且繞過 root layout 會失去 navbar。不選。

### Decision 6：404 頁也以單元測試先行，UI 流程與狀態碼以 E2E 驗收

**Choice**：`nextjs-pickball/CLAUDE.md` 把 `app/**/page.tsx`、`app/**/layout.tsx` 列為入口層例外，`not-found.tsx` 屬同類入口檔，**不強制** TDD；但本 change 仍比照 `app/login/page.test.ts`、`app/health/page.test.ts` 的先例，寫 `app/not-found.test.tsx`（2 個 it：`metadata.title`、render 後的標題與兩個連結），RED 時模組不存在而真紅。HTTP 404、`<title>` 實際生效、點擊導回、navbar 仍在由 E2E 驗收。tasks 中如實標註「入口層例外、仍以單元測試先行」。

**Rationale**：render 測試成本低（同步 Server Component、無資料），可在 E2E 之前就鎖住文案與 href；`metadata` 是否真的被 Next 套用只有 E2E 能證明（Context 的 metadata 查證）。

**Alternatives considered**：
- 只做 E2E：E2E 慢且要雙鎖，文案或 href 打錯要跑完 E2E 才知道。不選。
- 只做單元測試：驗不到狀態碼與 metadata 實際生效。不選。

### Decision 7：E2E 分兩個新檔，在五個 browser project 執行

**Choice**：`tests/e2e/specs/site-not-found.spec.ts`（2 個 test）與 `tests/e2e/specs/navbar-active.spec.ts`（1 個 test），不加瀏覽器條件 skip。404 test 以 `page.goto("/this-page-does-not-exist")` 取得 `response.status()`；導回連結一律在 `page.getByRole("main")` 內查找（navbar 也有「首頁」「對戰分配」連結）；navbar 連結以 `page.getByRole("banner")` 範圍查找。404 test **不**使用 `trackConsoleIssues`：瀏覽器會把主文件的 404 回應記成 console error，屬預期。

**Rationale**：
- 不放進 `navbar-rwd.spec.ts`：該檔整個 describe 只在 chromium 跑，主題是窄螢幕排版；aria-current 與 404 是行為，五個引擎都該驗，且放進去會讓檔名與內容脫節。
- 不放進 `match-stage.spec.ts`：該檔是對戰頁行為，已近 600 行。

**Alternatives considered**：
- 合併成一個檔：兩個 capability 的驗收錨點會指向同一檔，日後拆 capability 時要搬。不選。

## Risks / Trade-offs

- [Risk 1] root `not-found.tsx` 的 `metadata` 在 Next 16.2.9 未被文件明文保證（文件範例只示範 `global-not-found`）→ Mitigation：已查 `resolve-metadata.js` 確認 `not-found` 慣例模組的 metadata 會被收集；E2E 以 `toHaveTitle` 實測；若 apply 時 E2E 顯示 title 未生效，Implementer 回報 `BLOCKED`，不得自行改用 `global-not-found` 或 client 端改 `document.title`（屬範圍變更）。
- [Risk 2] 狀態碼在 `next dev` 與 OpenNext／workerd 之間不一致（E2E 跑的是 `next dev`）→ Mitigation：Next 對未匹配路由的 404 判定在路由層，與 runtime 無關；`pnpm build` 產出 `/_not-found` 路由（C4 檢查建置輸出含該路由）。preview 實測不列入驗收（`pnpm preview` 預設埠與後端 `:8787` 衝突，且需整套 build），列為部署後人工確認項，寫進 tasks 的 C 驗收說明。
- [Risk 3] 子頁時頁面上同時有兩個 `aria-current="page"`（Decision 3），部分螢幕閱讀器會在 navbar 讀到「目前頁面：對戰分配」，而實際頁面是參賽者 → Mitigation：兩者分屬兩個導覽集合，符合 WAI-ARIA；若日後回報困擾，可另開 change 把子路由改為 `aria-current="true"`（只動 `SiteNavbar` 一行與對應測試）。
- [Risk 4] 未匹配的 `/matchmaker/xxx` 會讓 navbar 的「對戰分配」active（pathname 以 `/matchmaker/` 開頭），而頁面是 404 → 接受：使用者確實是在對戰分配區段下打錯網址，404 頁的「前往對戰分配」正好是回到該區段的出口；不為此在 navbar 引入「目前是否為 404」的狀態。
- [Risk 5] 授權修改的既有 it 若被誤改成刪除或改名，會失去前綴相似的元件層 guard → Mitigation：tasks 檔頭逐字列出可改的三處（pathname、註解、新增一行），Stage 1 對照；`lib/navActive.test.ts` 另有同義的純函式 it。
- [Risk 6] 其他並行 change（`scoreboard-bound-game-over`、`target-score-lock-current-round`）若也動 `SiteNavbar.tsx` 或 `app/` 根目錄 → Mitigation：§1 對齊 main 時以 `git diff <propose HEAD> main -- <本 change 會動的檔>` 確認；目前兩者目錄名稱顯示為計分板相關，預期無交集。

## Migration Plan

無資料或 schema 遷移；不新增相依。只影響前端 Worker，部署照 README「部署前手動檢查清單」（部署順序規則不變，後端不需重新部署）。回滾：revert `SiteNavbar.tsx`、刪除 `lib/navActive.ts`、`app/not-found.tsx` 與其測試即可。

## Open Questions

（無。設計裁量皆已於上方 Decisions 定案；apply 階段的阻塞事項由 leader 追加於此。）

- **apply 流程裁量（leader，2026-11-06）**：依 coordinator 裁定，因重負載鎖只在 04:19 前可用，執行順序調整為「§1 精簡 → 先寫 2.4、3.2 兩個 E2E RED 並一次取鎖跑紅 → §2、§3 單元層 RED→GREEN（同一個 Implementer 依序完成、逐 task commit）→ Stage 1／Stage 2 各一次合審兩組」；task 內容與驗收條件不變。E2E 綠燈（2.5、3.3 的雙鎖 E2E 項）與 C2～C5 由 coordinator 於合併前驗收執行。§1.1 的全套基線改採 coordinator 提供的數字。
- **存活變異（Stage 2 回報，未修）**：`app/not-found.test.tsx` 的 render it 以「`main` 內至少一個 `p` 非空」驗說明文字，`404` 小標本身就是 `p`，刪除說明段落時仍綠。斷言與 test-plan 字面一致，故不在本 change 內改寫；若要加嚴，可改為「存在含中文的 `p`」或把 `404` 小標改用非 `p` 元素（需另開 change 或由 coordinator 授權）。
- **4.1 文件先行**：`nextjs-pickball/CLAUDE.md` 的文件 commit（`3ef33b0`）為趕時程提前到 §2／§3 實作之前提交；內容只描述 tasks 指定的行為，其後 GREEN 與之一致（Stage 1 確認）。
