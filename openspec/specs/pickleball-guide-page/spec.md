## Purpose

定義匹克球新手指南頁面（`/`）的完整規格，包含頁面結構、元件架構、資料層、互動行為與視覺動畫。

本頁為站台首頁，內容涵蓋 Part 01 規則（場地、發球、計分、犯規、非截擊區）與 Part 02 選購
（材質、規格、品牌、台灣市場、入門套組）共 10 個 section，並提供 fixed overlay 的 TocBar
快速導覽、捲動觸發的進場動畫，以及通往 `/tour` 完整體驗的 CTA。

## Requirements

### Requirement: 首頁顯示完整匹克球指南

系統 SHALL 在路由 `/` 直接渲染完整匹克球新手指南，包含 Hero、TOC、Part 01（規則 5 段）、Part 02（選購 5 段）、Conclusion 區塊，與原型 `pickleball-guide.html` 結構一致。TocBar SHALL 以 fixed overlay 方式於頁面載入即顯示於視窗頂端，而非 sticky（非捲動後才出現）。TocBar SHALL 使用 `top-14`，固定在 SiteNavbar（高度 h-14 = 56px）下方，不與 Navbar 重疊。TocBar 在透明態 SHALL 採用 `bg-slate-900/30 backdrop-blur-sm` 且不再渲染 `border-b`，與 SiteNavbar 的 `slate-900/20` 形成自然漸深階序，避免兩條 nav 視覺切割。

#### Scenario: 訪問首頁可看到 Hero badge 與主標題
- **GIVEN** 使用者開啟 `/`
- **WHEN** 頁面載入完成
- **THEN** 畫面顯示「完全入門指南」badge、主標題「匹克球新手完全入門」與三項統計數字（14萬+、¼、11）

#### Scenario: TocBar 於頁面載入即顯示並列出 10 個 section 連結
- **GIVEN** 使用者開啟 `/`
- **WHEN** 頁面載入完成且 `window.scrollY === 0`
- **THEN** TocBar 即時可見於視窗頂端，列出 court / serve / scoring / fouls / kitchen / materials / specs / brands / tw-market / starter 共 10 個錨點連結

#### Scenario: TocBar 位置（有 SiteNavbar 時）

- **WHEN** 使用者瀏覽首頁（`/`）
- **THEN** TocBar 顯示在 viewport top + 56px 的位置，SiteNavbar 佔據最上方 56px

#### Scenario: TocBar 透明態無 border-b 切割

- **WHEN** 路由為 `/`，且 `window.scrollY === 0`
- **THEN** `TocBar` 不渲染 `border-b` 樣式，背景為 `bg-slate-900/30 backdrop-blur-sm`

#### Scenario: 每個 section 都有對應錨點 id
- **GIVEN** 頁面渲染完成
- **WHEN** DOM 解析完成
- **THEN** 存在 `#court`、`#serve`、`#scoring`、`#fouls`、`#kitchen`、`#materials`、`#specs`、`#brands`、`#tw-market`、`#starter` 共 10 個 id

### Requirement: Hero 浮球與主內容避開 fixed nav 合計高度

`nextjs-pickball/components/guide/Hero.tsx` 的浮球（`aria-hidden` 的右上 lime 圓球）與主內容（含 badge、主標題、副標、統計、CTA）SHALL 全部落在 `SiteNavbar (56px) + TocBar (56px)` = 112px 之下的可用視覺區。具體實作方式：浮球與主內容掛在 Hero 內一層 `pt-[calc(var(--site-nav-h)+var(--toc-bar-h))]` 的偏移層之內。**主內容**（motion.div）為 flow child、由偏移層的 `pt-` + `flex flex-col items-center justify-center` 自動推到 nav 之下置中。**浮球**為 absolute child、不受 padding 影響，其 `top` SHALL 明確含 nav offset：`top-[calc(var(--site-nav-h)+var(--toc-bar-h)+15%)]`、`max-md:top-[calc(var(--site-nav-h)+var(--toc-bar-h)+10%)]`，確保在矮視窗（≤ 700px viewport height）下不被 fixed nav 遮擋。

背景光暈 SHALL 仍鋪滿整個 section（含 nav 區），維持透明 navbar 之下的深色背景延伸感。Hero section 本身仍維持 `min-h-screen overflow-hidden bg-slate-900` 不變。

#### Scenario: globals.css 定義 --toc-bar-h

- **WHEN** 檢查 `nextjs-pickball/app/globals.css`
- **THEN** `:root` 區塊內存在 `--toc-bar-h: 3.5rem;` 一條 CSS variable

#### Scenario: Hero 浮球與主內容包在 nav 偏移層內

- **WHEN** 檢查 `nextjs-pickball/components/guide/Hero.tsx` 的 JSX
- **THEN** 浮球與 motion.div 主內容皆為「nav 偏移層」之子節點；該偏移層套用 `pt-[calc(var(--site-nav-h)+var(--toc-bar-h))]`

#### Scenario: 矮視窗下浮球不被 fixed nav 遮擋

- **GIVEN** 使用者開啟 `/`，viewport height 為 700px
- **WHEN** 頁面載入完成、`window.scrollY === 0`
- **THEN** 浮球元素 `getBoundingClientRect().top` 大於等於 112px（fixed nav 合計高度）

#### Scenario: 主標題仍位於視窗可視區內

- **GIVEN** 使用者開啟 `/`，viewport height 為 800px
- **WHEN** 頁面載入完成
- **THEN** 主標題 `<h1>匹克球新手完全入門</h1>` 完整位於視窗範圍內且未被遮擋

### Requirement: 共用展示元件全部建構於 shadcn 元件之上

系統的 BrandCard、TipCard、HighlightBox、MythRow（之 myth/fact cell）SHALL 使用 shadcn `Card` 為基底；4 張比較表 SHALL 使用 shadcn `Table`；所有 badge 樣式 SHALL 使用 shadcn `Badge`；分隔線 SHALL 使用 shadcn `Separator`。

#### Scenario: 比較表使用 shadcn Table

- **GIVEN** 進入 Court / Materials / Specs / TwMarket section
- **WHEN** 渲染表格
- **THEN** 四個 section 皆使用 `ComparisonTable`，其 DOM 由 shadcn `Table`、`TableHeader`、`TableBody`、`TableRow`、`TableHead`、`TableCell` 組成（使用端：`CourtSection.tsx`、`MaterialsSection.tsx`、`SpecsSection.tsx`、`TwMarketSection.tsx`）

#### Scenario: Badge 不在本專案擴充 variants

- **GIVEN** 完成實作
- **WHEN** 檢查 `nextjs-pickball/components/ui/badge.tsx`
- **THEN** 檔案內容與 `pnpm dlx shadcn@latest add badge` 當前產出一致（本專案未自行新增 variant）；所有顏色變化由使用端 className 控制

### Requirement: 色票全對應 Tailwind palette 或 shadcn token

系統 SHALL NOT 在 `nextjs-pickball/app/globals.css` 的 `@theme inline` 內新增任何匹克球專用色票變數（例如 `--color-pickle-green`）。所有色彩 SHALL 透過既有 Tailwind palette utility（如 `lime-400`、`slate-900`、`orange-500`、`emerald-700`、`amber-400`）或既有 shadcn semantic token（`background`、`foreground`、`muted`、`muted-foreground`、`border`、`card`）表達。

#### Scenario: index.css 不新增品牌色變數
- **GIVEN** 完成實作
- **WHEN** 檢查 `nextjs-pickball/app/globals.css` 的 `@theme inline` 區塊
- **THEN** 不存在 `--color-pickle-green`、`--color-court-blue`、`--color-court-surface`、`--color-accent-coral`、`--color-accent-yellow` 任何一條

### Requirement: 字型保留三套並由 nextjs-pickball/app/layout.tsx 以 next/font/google 載入

系統 SHALL 在 `nextjs-pickball/app/layout.tsx` 使用 `next/font/google` 匯入 Noto Sans TC、Bebas Neue、Outfit 三家族，並以 CSS variable（`--font-noto-sans-tc`、`--font-bebas-neue`、`--font-outfit`）掛載到 `<html>`。元件 SHALL 透過 Tailwind utility class（如 `font-bebas`、`font-outfit`）套用。

#### Scenario: nextjs-pickball/app/layout.tsx 使用 next/font/google 載入三家族
- **GIVEN** 完成實作
- **WHEN** 檢查 `nextjs-pickball/app/layout.tsx`
- **THEN** 檔案匯入 `Noto_Sans_TC`、`Bebas_Neue`、`Outfit`，各自指定 `variable` 並附加到 `<html>` 的 `className`

#### Scenario: HTML lang 與 metadata title 已設定
- **GIVEN** 完成實作
- **WHEN** 檢查 `nextjs-pickball/app/layout.tsx`
- **THEN** `<html>` 的 `lang` 屬性為 `zh-Hant`，`metadata.title` 內含「匹克球新手完全入門」

### Requirement: keyframes 與對應 utility 寫在 nextjs-pickball/app/globals.css

系統 SHALL 在 `nextjs-pickball/app/globals.css` 只定義**實際被使用**的 `@keyframes` 與對應 `animate-*` utility class，SHALL NOT 保留零使用的動畫定義。

Hero 浮球 SHALL 套用 `animate-float-ball`（`@keyframes floatBall`）；scroll indicator SHALL 套用 `animate-bounce-down`（`@keyframes bounceDown`）；scoreboard 得分回饋 SHALL 套用 `animate-rally-feedback`（`@keyframes rallyFeedback`）。

Hero 的 badge / 標題 / 統計區進場 SHALL 由 motion 的 `staggerChildren` 提供，SHALL NOT 使用 CSS keyframe（避免同一效果存在兩套機制）。section 內容的捲入淡入 SHALL 由 `motion` 的 `whileInView` 提供，見「section 捲入視窗時以 motion whileInView 淡入」Requirement。

#### Scenario: Hero 浮球持續上下漂浮

- **GIVEN** 使用者開啟頁面
- **WHEN** Hero 渲染完成
- **THEN** 浮球元素的 computed style 含有名稱為 `floatBall`（或對應 utility class `animate-float-ball`）的動畫且 `iteration-count` 為 `infinite`

#### Scenario: scroll indicator 持續上下跳動

- **GIVEN** 使用者停留於 Hero 且尚未捲動
- **WHEN** 渲染 scroll indicator
- **THEN** scroll indicator 元素套用 `animate-bounce-down`（對應 `@keyframes bounceDown`）且 `iteration-count` 為 `infinite`

#### Scenario: 不存在零使用的動畫定義

- **WHEN** 對 `nextjs-pickball/app/globals.css` 定義的每個 `animate-*` utility，於 `nextjs-pickball/app/**` 與 `nextjs-pickball/components/**` 搜尋其使用處
- **THEN** 每個 utility 至少有一處使用；`animate-fade-in`、`animate-slide-up`、`animate-scale-in` 已連同其 `@keyframes` 一併移除

#### Scenario: 不存在 fadeUp 動畫

- **WHEN** 於 `nextjs-pickball/app/globals.css` 搜尋 `fadeUp` 或 `animate-fade-up`
- **THEN** 零命中 —— Hero 進場改由 motion `staggerChildren` 提供（`nextjs-pickball/components/guide/Hero.tsx`），不再需要 CSS 版本

### Requirement: 互動行為由三支 hooks 提供且各有 smoke test

系統 SHALL 提供三支 scroll / observer React hooks：`useScrollShadow`、`useScrollSpy`、`useScrolledPast`，分別位於 `nextjs-pickball/hooks/`。每支 hook SHALL 有對應 `*.test.ts` 檔，包含至少一個 happy-path scenario。`useScrolledPast` SHALL 接受 `threshold: number | (() => number)`：為 `number` 時以該值為固定門檻，為 function 時於每次 scroll 事件呼叫以取得當前門檻（供動態讀取 `window.innerHeight - navHeight` 等情境）。

本 capability 只擁有上述三支；`nextjs-pickball/hooks/` 下其餘 hook 歸屬其他 capability（`useQuiz` → quiz；`useRosterStore` → player-roster；`useRoundStore` → round-lifecycle；`useScoreboardStore`、`useFullscreen`、`useOrientation`、`useFocusMode` → scoreboard；`useEnterAnimationProgress`、`useReducedMotion` → tour-experience）。

此歸屬清單為 `nextjs-pickball/hooks/` 跨 capability 分工的**單一來源**。其他 capability 於該目錄新增 hook 時，其 change SHALL 一併更新此清單 —— 否則本 capability 的規格會單邊失真。此規則已失效兩次：`4c5b724` 新增 `useFocusMode` 時只更新了 `scoreboard` 規格；change `add-player-roster`（實作 commit `d00fea6`、歸檔 commit `0974918`）新增 `useRosterStore` 時只更新了 `player-roster` 規格，且該 change 的 proposal 還明文宣告「對 `pickleball-guide-page` 無影響」—— 新增 hook 前 SHALL 直接核對本清單，SHALL NOT 以「本 capability 與 pickleball-guide-page 無關」推論無影響。

此清單與 `nextjs-pickball/hooks/` 的實際檔案 SHALL 由自動化守衛測試雙向驗證：目錄下每支 hook 都要出現在清單段落內，且清單段落提及的每個 hook 名稱都要有對應檔案。比對範圍 SHALL 限定為本 Requirement 起始至「此歸屬清單為」之前的兩段（本 capability 自己的三支，加其餘 capability 的歸屬），SHALL NOT 涵蓋其後的先例敘述 —— 先例句本身就會提到 hook 名稱，納入比對會讓「清單漏列、但先例句提過」的 hook 靜默通過（開發時實測確認過此漏洞）。散文規則已證實擋不住漏更新（上述兩次先例），守衛測試把它變成會轉紅的失敗。

#### Scenario: useScrollShadow 在 scrollY 超過 threshold 時回傳 true
- **GIVEN** 測試環境呼叫 `useScrollShadow(100)`
- **WHEN** `window.scrollY` 設為 150 並 dispatch `scroll` 事件
- **THEN** hook 回傳值為 `true`
- **驗收**：`nextjs-pickball/hooks/useScrollShadow.test.ts`，it 名稱「應在 scrollY 超過 threshold 時回傳 true」

#### Scenario: useScrollSpy 回傳目前可視 section 的 id
- **GIVEN** 測試 mock 了 IntersectionObserver 並呼叫 `useScrollSpy(['court', 'serve'])`
- **WHEN** 模擬 `serve` section 進入視窗（callback 觸發 entry.isIntersecting=true）
- **THEN** hook 回傳值為 `'serve'`
- **驗收**：`nextjs-pickball/hooks/useScrollSpy.test.ts`，it 名稱「應回傳目前可視 section 的 id」

#### Scenario: useScrolledPast 在 scrollY 超過固定 threshold 時回傳 true
- **GIVEN** 測試環境呼叫 `useScrolledPast(500)`
- **WHEN** `window.scrollY` 設為 600 並 dispatch `scroll` 事件
- **THEN** hook 回傳值為 `true`
- **驗收**：`nextjs-pickball/hooks/useScrolledPast.test.ts`，it 名稱「應在 scrollY 超過固定 threshold 時回傳 true」

#### Scenario: useScrolledPast 以 function threshold 動態判定
- **GIVEN** 測試環境呼叫 `useScrolledPast(() => window.innerHeight - 56)`，並將 `window.innerHeight` 設為 800（門檻 = 744）
- **WHEN** `window.scrollY` 設為 800 並 dispatch `scroll` 事件
- **THEN** hook 回傳值為 `true`
- **驗收**：`nextjs-pickball/hooks/useScrolledPast.test.ts`，it 名稱「應以 function threshold 動態判定是否已捲過門檻」

#### Scenario: hooks 目錄的每支 hook 都在歸屬清單內
- **GIVEN** `nextjs-pickball/hooks/` 下所有非測試檔的 hook
- **WHEN** 於清單段落（Requirement 起始至「此歸屬清單為」之前）內搜尋每支 hook 的名稱
- **THEN** 無任何一支缺漏（改單邊即靜默失效的跨檔耦合，需有測試守住）
- **驗收**：`nextjs-pickball/hooks/hooksInventory.test.ts`，it 名稱「hooks 目錄下每支 hook 都能在規格的歸屬清單中找到」

#### Scenario: 歸屬清單提及的 hook 都有對應檔案
- **GIVEN** 清單段落內提及的所有以 `use` 開頭的 hook 名稱
- **WHEN** 逐一檢查 `nextjs-pickball/hooks/` 是否存在同名 `.ts` 或 `.tsx` 檔
- **THEN** 無任何一個名稱指向不存在的檔案（hook 被移除或改名時清單須同步）
- **驗收**：`nextjs-pickball/hooks/hooksInventory.test.ts`，it 名稱「歸屬清單提及的每個 hook 名稱都有對應檔案」

### Requirement: 沿用 hooks 控制 sticky shadow / 主動 TOC link / scroll fade-in

`HomePage`、`TocBar` 與 section 元件 SHALL 透過 `useScrollShadow`、`useScrollSpy`、`useScrolledPast` 三支 hooks 提供等同於原型的互動體驗。TocBar SHALL 以 `useScrolledPast(() => window.innerHeight - navHeight)` 判定是否已捲離 Hero，並以此切換兩種視覺狀態：Hero 範圍內為透明底 + 極輕 backdrop-blur + 白色/半透明白文字；捲離 Hero 後為白底 + `shadow-sm` + 深色文字。`useScrollShadow` 保留供「單純 scrollY 超過固定門檻即加陰影」情境使用，TocBar 不直接依賴此 hook。

section 的捲入淡入不再由 hook 提供，改由 motion `whileInView` 負責，見「section 捲入視窗時以 motion whileInView 淡入」Requirement。

#### Scenario: TocBar 在 Hero 範圍內顯示為透明底 + 極輕 backdrop-blur
- **GIVEN** 使用者位於首頁且 `window.scrollY` 未超過 `window.innerHeight - navHeight`
- **WHEN** 渲染 TocBar
- **THEN** TocBar 根元素 className 含 `bg-slate-900/30` 與 `backdrop-blur-sm`，不含任何 `shadow-*`
- **驗收**：`nextjs-pickball/components/guide/TocBar.test.tsx`，it 名稱「TocBar 在 Hero 範圍內為透明底且不帶 shadow」

#### Scenario: TocBar 在捲離 Hero 後切換為白底 + shadow-sm
- **GIVEN** 使用者位於首頁
- **WHEN** `window.scrollY > window.innerHeight - navHeight` 並 dispatch `scroll` 事件
- **THEN** TocBar 根元素 className 含 `bg-background/90`、`shadow-sm` 與 `backdrop-blur-md`
- **驗收**：`nextjs-pickball/components/guide/TocBar.test.tsx`，it 名稱「TocBar 在捲離 Hero 後為白底加 shadow-sm」

#### Scenario: TOC link 在對應 section 進入視窗時高亮
- **GIVEN** 使用者捲動到 `#kitchen` section
- **WHEN** IntersectionObserver 判定 `#kitchen` 為目前可視 section
- **THEN** TocBar 中 `href="#kitchen"` 的連結具有 active style（由 `useScrollSpy` 回傳值控制）
- **驗收**：`nextjs-pickball/components/guide/TocBar.test.tsx`，it 名稱「TOC link 在對應 section 進入視窗時高亮」

#### Scenario: TOC 項目與 section 錨點一一對應
- **GIVEN** `nextjs-pickball/data/guide/tocItems.ts` 定義 10 個 TOC 項目
- **WHEN** 比對每個 item 的 `id` 與 `nextjs-pickball/components/guide/` 下 section 元件實際渲染的 `id` 屬性
- **THEN** 每個 TOC id 都能找到對應的 section id（改單邊即靜默失效的跨檔耦合，需有測試守住）
- **驗收**：`nextjs-pickball/data/guide/tocItems.test.ts`，it 名稱「每個 TOC item 的 id 都能在 guide section 元件中找到對應 id 屬性」

### Requirement: 拆檔結構符合 components / data / hooks 三層

系統 SHALL 將實作拆成下列檔案結構：

- `nextjs-pickball/app/page.tsx`：純組合，不含資料宣告
- `nextjs-pickball/components/guide/`：頂層至少包含 10 個 `*Section`（`CourtSection`、`ServeSection`、`ScoringSection`、`FoulsSection`、`KitchenSection`、`MaterialsSection`、`SpecsSection`、`BrandsSection`、`TwMarketSection`、`StarterSection`）與 `Hero`、`TocBar`、`PartDivider`、`Conclusion`、`CourtDiagram`；另有 `HeroTourCta`，其行為由 tour-experience capability 規範
- `nextjs-pickball/components/guide/shared/`：7 個共用元件（`BrandCard`、`TipCard`、`HighlightBox`、`MythRow`、`Section`、`ComparisonTable`、`PriceStars`）
- `nextjs-pickball/data/guide/`：7 個資料檔（tocItems、courtComparison、paddleMaterials、paddleWeights、brands、twMarketPrices、kitchenMyths）
- `nextjs-pickball/hooks/`：本 capability 擁有 3 支（useScrollShadow、useScrollSpy、useScrolledPast）+ 各自 `.test.ts`；目錄下另有歸屬其他 capability 的 hook，清單見「互動行為由三支 hooks 提供且各有 smoke test」Requirement。該數量會隨其他 capability 增修而變動，SHALL NOT 於此寫死

驗收 SHALL 以「必要檔案是否存在」表述，SHALL NOT 使用「恰好 N 個檔」的數量斷言 —— 後者會在其他 capability 於同目錄新增檔案時誤報。

#### Scenario: HomePage 不含資料宣告

- **GIVEN** 完成實作
- **WHEN** 檢查 `nextjs-pickball/app/page.tsx`
- **THEN** 檔案不含品牌資料、表格資料或 myth/fact 資料的 inline 陣列；所有 list-driven 內容由對應 `nextjs-pickball/data/guide/*.ts` 匯入

#### Scenario: 每個 data 檔以 named export 提供常數

- **GIVEN** 完成實作
- **WHEN** 檢查 `nextjs-pickball/data/guide/` 下任一檔案
- **THEN** 提供至少一個具型別標註的 named export 常數，可被 section 元件 import

#### Scenario: shared 目錄含全部必要共用元件

- **GIVEN** 完成實作
- **WHEN** 列出 `nextjs-pickball/components/guide/shared/` 下的 `.tsx` 檔（不含 `*.test.tsx`）
- **THEN** `BrandCard.tsx`、`TipCard.tsx`、`HighlightBox.tsx`、`MythRow.tsx`、`Section.tsx`、`ComparisonTable.tsx`、`PriceStars.tsx` 皆存在

#### Scenario: guide 目錄頂層含全部必要元件檔

- **GIVEN** 完成實作
- **WHEN** 列出 `nextjs-pickball/components/guide/` 下的 `.tsx` 檔（不含 `shared/` 與 `*.test.tsx`）
- **THEN** 10 個 `*Section.tsx` 與 `Hero.tsx`、`TocBar.tsx`、`PartDivider.tsx`、`Conclusion.tsx`、`CourtDiagram.tsx` 皆存在

### Requirement: 原型 HTML 保存於 nextjs-pickball/docs/ 作為設計參考

原型 `pickleball-guide.html` SHALL 被視為**本機開發者選配**的設計對照資產，SHALL 於 `nextjs-pickball/.gitignore` 列入以避免誤提交，且 SHALL NOT 被任何驗收條件要求其存在。

原因：該檔被 gitignore 因而不入版控，任何「檔案必須存在」的斷言在乾淨 clone 上必然失敗。規格不得要求一個刻意不進版控的產物存在。

#### Scenario: gitignore 含原型路徑
- **GIVEN** 完成實作
- **WHEN** 檢查 `nextjs-pickball/.gitignore`
- **THEN** 內容含一行 `docs/pickleball-guide.html`（gitignore 規則相對其所在 workspace 根目錄，不加前綴）

#### Scenario: 乾淨 clone 不因缺少原型而驗收失敗
- **GIVEN** 一份未包含 gitignore 檔案的全新 clone
- **WHEN** 執行本 capability 的所有驗收
- **THEN** 沒有任何一條因 `nextjs-pickball/docs/pickleball-guide.html` 不存在而失敗

### Requirement: HomePage 移除 starter 樣板內容

系統 SHALL 從 `nextjs-pickball/app/page.tsx` 移除既有的 starter Card / Button import 與「React + Express Template」歡迎內容。

#### Scenario: HomePage 不再 import starter 用 Card / Button
- **GIVEN** 完成實作
- **WHEN** 檢查 `nextjs-pickball/app/page.tsx`
- **THEN** 不存在 `import ... from "@/components/ui/card"` 或 `import ... from "@/components/ui/button"` 用於展示「React + Express Template」歡迎卡片之用法

### Requirement: section 捲入視窗時以 motion whileInView 淡入

`nextjs-pickball/components/guide/shared/Section.tsx` SHALL 以 motion 的 `whileInView` 提供捲入淡入效果，且 `viewport.once` MUST 為 `true`（同一 section 只播放一次）。

當使用者偏好 `prefers-reduced-motion: reduce` 時，Section SHALL NOT 套用位移動畫，MUST 直接以終點狀態渲染。此降級 MUST 由 `nextjs-pickball/hooks/useReducedMotion` 判定，SHALL NOT 依賴 `app/globals.css` 的 `@media (prefers-reduced-motion: reduce)` —— 該 media query 只作用於 `::view-transition-*`，管不到 motion 產生的 inline transform。

本 Requirement 取代先前由 `useFadeInOnView` hook 提供的等效行為；該 hook 已於 commit `17ce6c6` 移除。

#### Scenario: 一般情況以 whileInView 觸發淡入且只播一次

- **GIVEN** 使用者未啟用 reduced motion
- **WHEN** 渲染 `Section`
- **THEN** 元素帶有 `initial={{ opacity: 0, y: 24 }}`、`whileInView={{ opacity: 1, y: 0 }}`，且 `viewport.once === true`
- **驗收**：`nextjs-pickball/components/guide/shared/Section.test.tsx`，it 名稱「一般情況下以 whileInView 觸發淡入且 viewport.once 為 true」

#### Scenario: reduced motion 下不套用位移

- **GIVEN** 使用者系統偏好為 `prefers-reduced-motion: reduce`
- **WHEN** 渲染 `Section`
- **THEN** 不套用 `initial` 的位移狀態，內容直接以終點狀態顯示
- **驗收**：`nextjs-pickball/components/guide/shared/Section.test.tsx`，it 名稱「prefers-reduced-motion 啟用時不套用 initial 位移」

#### Scenario: Section 結構不受動畫設定影響

- **WHEN** 渲染 `Section` 並傳入 `id`、`tag`、`title`、`children`
- **THEN** 四者皆正確輸出，與 reduced motion 與否無關
- **驗收**：`nextjs-pickball/components/guide/shared/Section.test.tsx`，it 名稱「渲染 id、tag 與 title，children 原樣輸出」

### Requirement: 價位以 1~10 星級呈現，不揭露實際金額

系統 SHALL 以 1~10 顆星表達 guide 內的所有價位資訊，SHALL NOT 於 guide 的資料檔、元件與首頁原始碼中出現實際金額字樣。理由：金額具時效性，寫死金額會使內容隨市場與匯率變動而過期；星級表達的是**相對價位帶**，不因幣值調整而失效。

`nextjs-pickball/data/guide/` 的 `brands`、`paddleMaterials`、`twMarketPrices` SHALL 各自以 `priceStars` 欄位承載價位，其值 SHALL 為 1（最平價）至 10（頂級）的整數。

系統 SHALL 提供共用元件 `nextjs-pickball/components/guide/shared/PriceStars.tsx`：接受 `stars: number`，一律渲染 10 顆星形元素，實心星數為 `clamp(round(stars), 1, 10)`；`stars` 為非有限數（`NaN`、`Infinity`）時 SHALL 收斂至最小值 1，SHALL NOT 產生含 `NaN` 的標籤。元件 SHALL 以 `role="img"` 搭配 `aria-label="價位 N／10 顆星"` 提供輔助科技語意，個別星形元素 SHALL 標記 `aria-hidden` 並以 `data-star="filled" | "empty"` 區分。

金額字樣的守門範圍 SHALL 涵蓋 `nextjs-pickball/data/guide/`、`nextjs-pickball/components/guide/`、`nextjs-pickball/components/guide/shared/` 與 `nextjs-pickball/app/`（各目錄下的 `.ts` / `.tsx`，不含 `*.test.*`），比對 pattern SHALL 為 `/NT\$|US\$|NTD|TWD|USD/`。

> ⚠️ `nextjs-pickball/app/` **不屬本 capability 的專屬領地**（`app/layout.tsx`、`app/tour/`、`app/quiz/` 等歸其他 capability）。其他 capability 於該目錄寫入金額字樣同樣會使本守門測試轉紅 —— 這是刻意的跨檔耦合，與 `data/guide/tocItems.ts` 的 id 守衛同一性質，故在此明寫，避免對方看到一個沒頭沒尾的失敗。

#### Scenario: PriceStars 以 aria-label 表達星級語意

- **GIVEN** 以 `stars={7}` 渲染 `PriceStars`
- **WHEN** 以 `role="img"` 查詢該元素
- **THEN** 其 accessible name 為「價位 7／10 顆星」
- **驗收**：`nextjs-pickball/components/guide/shared/PriceStars.test.tsx`，it 名稱「以 aria-label 表達 1~10 星的價位語意」

#### Scenario: 一律渲染 10 顆星且實心數等於 stars

- **GIVEN** 以 `stars={4}` 渲染 `PriceStars`
- **WHEN** 計算 `[data-star='filled']` 與 `[data-star='empty']` 的元素數
- **THEN** 實心 4 顆、空心 6 顆，總數恆為 10
- **驗收**：`nextjs-pickball/components/guide/shared/PriceStars.test.tsx`，it 名稱「渲染 10 顆星，其中實心星數量等於 stars」

#### Scenario: 超出 1~10 範圍的 stars 收斂至邊界

- **GIVEN** 分別以 `stars={12}` 與 `stars={0}` 渲染 `PriceStars`
- **WHEN** 計算實心星數
- **THEN** 分別為 10 與 1，不會出現 12 顆星或 0 顆星
- **驗收**：`nextjs-pickball/components/guide/shared/PriceStars.test.tsx`，it 名稱「stars 超出範圍時收斂至 1~10 的邊界」

#### Scenario: 非有限數不產生 NaN 標籤

- **GIVEN** 以 `stars={Number.NaN}` 渲染 `PriceStars`
- **WHEN** 以 `role="img"` 查詢該元素
- **THEN** accessible name 為「價位 1／10 顆星」，不含 `NaN` 字樣
- **驗收**：`nextjs-pickball/components/guide/shared/PriceStars.test.tsx`，it 名稱「stars 為 NaN 時仍收斂至最小值，不產生 NaN 標籤」

#### Scenario: 三個資料檔的 priceStars 皆為 1~10 整數

- **GIVEN** `brands`、`paddleMaterials`、`twMarketPrices` 三個資料檔
- **WHEN** 逐筆檢查 `priceStars`
- **THEN** 每筆皆為整數且落在 1~10 之間
- **驗收**：`nextjs-pickball/data/guide/priceStars.test.ts`，it 名稱「每筆資料的 priceStars 都是 1~10 的整數」

#### Scenario: guide 與 app 原始碼不得殘留金額字樣

- **GIVEN** `data/guide`、`components/guide`、`components/guide/shared`、`app` 四個目錄下的 `.ts` / `.tsx`（不含 `*.test.*`）
- **WHEN** 以 pattern `/NT\$|US\$|NTD|TWD|USD/` 掃描檔案內容
- **THEN** 命中檔案清單為空陣列（改單邊即靜默失效的跨檔耦合，需有測試守住）
- **驗收**：`nextjs-pickball/data/guide/priceStars.test.ts`，it 名稱「guide 原始碼（資料檔、元件、首頁）不得殘留金額字樣」
