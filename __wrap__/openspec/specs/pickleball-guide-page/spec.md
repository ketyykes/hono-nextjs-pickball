## Purpose

定義匹克球新手指南頁面（`/`）的完整規格，包含頁面結構、元件架構、資料層、互動行為與視覺動畫。

## Requirements

### Requirement: 首頁顯示完整匹克球指南

系統 SHALL 在路由 `/` 直接渲染完整匹克球新手指南，包含 Hero、TOC、Part 01（規則 5 段）、Part 02（選購 5 段）、Conclusion 區塊，與原型 `pickleball-guide.html` 結構一致。TocBar SHALL 以 fixed overlay 方式於頁面載入即顯示於視窗頂端，而非 sticky（非捲動後才出現）。TocBar SHALL 使用 `top-14`，固定在 SiteNavbar（高度 h-14 = 56px）下方，不與 Navbar 重疊。

#### Scenario: 訪問首頁可看到 Hero badge 與主標題
- **GIVEN** 使用者開啟 `/`
- **WHEN** 頁面載入完成
- **THEN** 畫面顯示「2025 完全入門指南」badge、主標題「匹克球新手完全入門」與三項統計數字（14萬+、¼、11）

#### Scenario: TocBar 於頁面載入即顯示並列出 10 個 section 連結
- **GIVEN** 使用者開啟 `/`
- **WHEN** 頁面載入完成且 `window.scrollY === 0`
- **THEN** TocBar 即時可見於視窗頂端，列出 court / serve / scoring / fouls / kitchen / materials / specs / brands / tw-market / starter 共 10 個錨點連結

#### Scenario: TocBar 位置（有 SiteNavbar 時）

- **WHEN** 使用者瀏覽首頁（`/`）
- **THEN** TocBar 顯示在 viewport top + 56px 的位置，SiteNavbar 佔據最上方 56px

#### Scenario: 每個 section 都有對應錨點 id
- **GIVEN** 頁面渲染完成
- **WHEN** DOM 解析完成
- **THEN** 存在 `#court`、`#serve`、`#scoring`、`#fouls`、`#kitchen`、`#materials`、`#specs`、`#brands`、`#tw-market`、`#starter` 共 10 個 id

### Requirement: 共用展示元件全部建構於 shadcn 元件之上

系統的 BrandCard、TipCard、HighlightBox、MythRow（之 myth/fact cell）SHALL 使用 shadcn `Card` 為基底；3 張比較表 SHALL 使用 shadcn `Table`；所有 badge 樣式 SHALL 使用 shadcn `Badge`；分隔線 SHALL 使用 shadcn `Separator`。

#### Scenario: 比較表使用 shadcn Table

- **GIVEN** 進入 Court / Materials / Specs / TwMarket section
- **WHEN** 渲染表格
- **THEN** DOM 中表格元件由 shadcn `Table`、`TableHeader`、`TableBody`、`TableRow`、`TableHead`、`TableCell` 組成

#### Scenario: Badge 不在本專案擴充 variants

- **GIVEN** 完成實作
- **WHEN** 檢查 `components/ui/badge.tsx`
- **THEN** 檔案內容與 `pnpm dlx shadcn@latest add badge` 當前產出一致（本專案未自行新增 variant）；所有顏色變化由使用端 className 控制

### Requirement: 色票全對應 Tailwind palette 或 shadcn token

系統 SHALL NOT 在 `app/globals.css` 的 `@theme inline` 內新增任何匹克球專用色票變數（例如 `--color-pickle-green`）。所有色彩 SHALL 透過既有 Tailwind palette utility（如 `lime-400`、`slate-900`、`orange-500`、`emerald-700`、`amber-400`）或既有 shadcn semantic token（`background`、`foreground`、`muted`、`muted-foreground`、`border`、`card`）表達。

#### Scenario: index.css 不新增品牌色變數
- **GIVEN** 完成實作
- **WHEN** 檢查 `app/globals.css` 的 `@theme inline` 區塊
- **THEN** 不存在 `--color-pickle-green`、`--color-court-blue`、`--color-court-surface`、`--color-accent-coral`、`--color-accent-yellow` 任何一條

### Requirement: 字型保留三套並由 app/layout.tsx 以 next/font/google 載入

系統 SHALL 在 `app/layout.tsx` 使用 `next/font/google` 匯入 Noto Sans TC、Bebas Neue、Outfit 三家族，並以 CSS variable（`--font-noto-sans-tc`、`--font-bebas-neue`、`--font-outfit`）掛載到 `<html>`。元件 SHALL 透過 Tailwind utility class（如 `font-bebas`、`font-outfit`）套用。

#### Scenario: app/layout.tsx 使用 next/font/google 載入三家族
- **GIVEN** 完成實作
- **WHEN** 檢查 `app/layout.tsx`
- **THEN** 檔案匯入 `Noto_Sans_TC`、`Bebas_Neue`、`Outfit`，各自指定 `variable` 並附加到 `<html>` 的 `className`

#### Scenario: HTML lang 與 metadata title 已設定
- **GIVEN** 完成實作
- **WHEN** 檢查 `app/layout.tsx`
- **THEN** `<html>` 的 `lang` 屬性為 `zh-Hant`，`metadata.title` 內含「匹克球新手完全入門」

### Requirement: keyframes 與對應 utility 寫在 app/globals.css

系統 SHALL 在 `app/globals.css` 定義 `@keyframes` 與對應 `animate-*` utility class，至少包含六組：`fadeIn`、`slideUp`、`scaleIn`、`floatBall`、`bounceDown`、`fadeUp`。Hero 浮球 SHALL 套用 `animate-float-ball`、scroll indicator SHALL 套用 `animate-bounce-down`、Hero badge / 標題 / 統計區 SHALL 套用 `animate-fade-up`、scroll-triggered 出現的 section 內容 SHALL 套用由 `useFadeInOnView` 控制的 fade 效果（沿用 `fadeIn` 語意，以 opacity + translate transition 呈現）。

#### Scenario: Hero 浮球持續上下漂浮

- **GIVEN** 使用者開啟頁面
- **WHEN** Hero 渲染完成
- **THEN** 浮球元素的 computed style 含有名稱為 `floatBall`（或對應 utility class `animate-float-ball`）的動畫且 `iteration-count` 為 `infinite`

#### Scenario: scroll indicator 持續上下跳動

- **GIVEN** 使用者停留於 Hero 且尚未捲動
- **WHEN** 渲染 scroll indicator
- **THEN** scroll indicator 元素套用 `animate-bounce-down`（對應 `@keyframes bounceDown`）且 `iteration-count` 為 `infinite`

### Requirement: 互動行為由三支 hooks 提供且各有 smoke test

系統 SHALL 提供四支 React hooks：`useScrollShadow`、`useScrollSpy`、`useFadeInOnView`、`useScrolledPast`，分別位於 `hooks/`。每支 hook SHALL 有對應 `*.test.ts` 檔，包含至少一個 happy-path scenario。`useScrolledPast` SHALL 接受 `threshold: number | (() => number)`：為 `number` 時以該值為固定門檻，為 function 時於每次 scroll 事件呼叫以取得當前門檻（供動態讀取 `window.innerHeight - navHeight` 等情境）。

#### Scenario: useScrollShadow 在 scrollY 超過 threshold 時回傳 true
- **GIVEN** 測試環境呼叫 `useScrollShadow(100)`
- **WHEN** `window.scrollY` 設為 150 並 dispatch `scroll` 事件
- **THEN** hook 回傳值為 `true`
- **驗收**：`hooks/useScrollShadow.test.ts`，it 名稱「應在 scrollY 超過 threshold 時回傳 true」

#### Scenario: useScrollSpy 回傳目前可視 section 的 id
- **GIVEN** 測試 mock 了 IntersectionObserver 並呼叫 `useScrollSpy(['court', 'serve'])`
- **WHEN** 模擬 `serve` section 進入視窗（callback 觸發 entry.isIntersecting=true）
- **THEN** hook 回傳值為 `'serve'`
- **驗收**：`hooks/useScrollSpy.test.ts`，it 名稱「應回傳目前可視 section 的 id」

#### Scenario: useFadeInOnView 在元素進入視窗時將 isVisible 設為 true
- **GIVEN** 測試 mock 了 IntersectionObserver 並 render 一個使用 `useFadeInOnView()` 的測試元件
- **WHEN** 模擬目標元素進入視窗
- **THEN** hook 回傳的 `isVisible` 為 `true`
- **驗收**：`hooks/useFadeInOnView.test.ts`，it 名稱「應在元素進入視窗時將 isVisible 設為 true」

#### Scenario: useScrolledPast 在 scrollY 超過固定 threshold 時回傳 true
- **GIVEN** 測試環境呼叫 `useScrolledPast(500)`
- **WHEN** `window.scrollY` 設為 600 並 dispatch `scroll` 事件
- **THEN** hook 回傳值為 `true`
- **驗收**：`hooks/useScrolledPast.test.ts`，it 名稱「應在 scrollY 超過固定 threshold 時回傳 true」

#### Scenario: useScrolledPast 以 function threshold 動態判定
- **GIVEN** 測試環境呼叫 `useScrolledPast(() => window.innerHeight - 56)`，並將 `window.innerHeight` 設為 800（門檻 = 744）
- **WHEN** `window.scrollY` 設為 800 並 dispatch `scroll` 事件
- **THEN** hook 回傳值為 `true`
- **驗收**：`hooks/useScrolledPast.test.ts`，it 名稱「應以 function threshold 動態判定是否已捲過門檻」

### Requirement: 沿用 hooks 控制 sticky shadow / 主動 TOC link / scroll fade-in

`HomePage` 與 `TocBar` 與 section 元件 SHALL 透過 `useScrollShadow`、`useScrollSpy`、`useFadeInOnView`、`useScrolledPast` 四支 hooks 提供等同於原型的互動體驗。TocBar SHALL 以 `useScrolledPast(() => window.innerHeight - navHeight)` 判定是否已捲離 Hero，並以此切換兩種視覺狀態：Hero 範圍內為透明底 + 極輕 backdrop-blur + 白色/半透明白文字；捲離 Hero 後為白底 + shadow-md + 深色文字。`useScrollShadow` 保留供「單純 scrollY 超過固定門檻即加陰影」情境使用，TocBar 本次改動後不再直接依賴此 hook。

#### Scenario: TocBar 在 Hero 範圍內顯示為透明底 + 極輕 backdrop-blur
- **GIVEN** 使用者位於首頁且 `window.scrollY` 未超過 `window.innerHeight - navHeight`
- **WHEN** 渲染 TocBar
- **THEN** TocBar 根元素的 className 組合對應透明/半透明底（例如包含 `bg-slate-900/20` 或等價 utility）與 `backdrop-blur-sm`，且文字顏色為白色系（例如 `text-white` / `text-white/70`），不含 `shadow-md`

#### Scenario: TocBar 在捲離 Hero 後切換為白底 + shadow-md
- **GIVEN** 使用者位於首頁
- **WHEN** `window.scrollY > window.innerHeight - navHeight` 並 dispatch `scroll` 事件
- **THEN** TocBar 根元素的 className 組合對應白底（例如包含 `bg-background/90` 或等價 utility）與 `shadow-md`，且文字顏色為深色系（例如 `text-muted-foreground` / active `text-slate-900`）

#### Scenario: TOC link 在對應 section 進入視窗時高亮
- **GIVEN** 使用者捲動到 `#kitchen` section
- **WHEN** IntersectionObserver 判定 `#kitchen` 為目前可視 section
- **THEN** TocBar 中 `href="#kitchen"` 的連結具有 active style（由 `useScrollSpy` 回傳值控制；底線顏色為 `lime-400`）

#### Scenario: section 內容捲入視窗時淡入
- **GIVEN** 使用者捲動頁面
- **WHEN** 任一掛載 `useFadeInOnView` 的元素進入視窗
- **THEN** 該元素由 `opacity-0 translate-y-6` 過渡為 `opacity-100 translate-y-0`

### Requirement: 拆檔結構符合 components / data / hooks 三層

系統 SHALL 將實作拆成下列檔案結構：

- `app/page.tsx`：純組合，不含資料宣告
- `components/guide/`：頂層共 15 個元件檔，包含 10 個 `*Section`（`CourtSection`、`ServeSection`、`ScoringSection`、`FoulsSection`、`KitchenSection`、`MaterialsSection`、`SpecsSection`、`BrandsSection`、`TwMarketSection`、`StarterSection`）、`Hero`、`TocBar`、`PartDivider`、`Conclusion`、`CourtDiagram`
- `components/guide/shared/`：6 個共用元件（`BrandCard`、`TipCard`、`HighlightBox`、`MythRow`、`Section`、`ComparisonTable`）
- `data/guide/`：7 個資料檔（tocItems、courtComparison、paddleMaterials、paddleWeights、brands、twMarketPrices、kitchenMyths）
- `hooks/`：4 個 hook 檔（useScrollShadow、useScrollSpy、useFadeInOnView、useScrolledPast）+ 各自 `.test.ts`

#### Scenario: HomePage 不含資料宣告

- **GIVEN** 完成實作
- **WHEN** 檢查 `app/page.tsx`
- **THEN** 檔案不含品牌資料、表格資料或 myth/fact 資料的 inline 陣列；所有 list-driven 內容由對應 `data/guide/*.ts` 匯入

#### Scenario: 每個 data 檔以 named export 提供常數

- **GIVEN** 完成實作
- **WHEN** 檢查 `data/guide/` 下任一檔案
- **THEN** 提供至少一個具型別標註的 named export 常數，可被 section 元件 import

#### Scenario: shared 目錄含六個共用元件

- **GIVEN** 完成實作
- **WHEN** 列出 `components/guide/shared/` 下的 `.tsx` 檔
- **THEN** 恰好存在 `BrandCard.tsx`、`TipCard.tsx`、`HighlightBox.tsx`、`MythRow.tsx`、`Section.tsx`、`ComparisonTable.tsx` 六個檔

#### Scenario: guide 目錄頂層含十五個元件檔

- **GIVEN** 完成實作
- **WHEN** 列出 `components/guide/` 下的 `.tsx` 檔（不含 `shared/`）
- **THEN** 恰好存在 10 個 `*Section.tsx` 加上 `Hero.tsx`、`TocBar.tsx`、`PartDivider.tsx`、`Conclusion.tsx`、`CourtDiagram.tsx`，共 15 個檔

### Requirement: 原型 HTML 保存於 docs/ 作為設計參考

系統 SHALL 將 `pickleball-guide.html` 放置於 `docs/pickleball-guide.html` 作為設計對照，並於 `.gitignore` 明確列入以避免誤提交。

#### Scenario: docs/ 含原型檔案
- **GIVEN** 完成實作
- **WHEN** `ls docs/pickleball-guide.html`
- **THEN** 檔案存在

#### Scenario: gitignore 含原型路徑
- **GIVEN** 完成實作
- **WHEN** 檢查 `.gitignore`
- **THEN** 內容含一行 `docs/pickleball-guide.html`

### Requirement: HomePage 移除 starter 樣板內容

系統 SHALL 從 `app/page.tsx` 移除既有的 starter Card / Button import 與「React + Express Template」歡迎內容。

#### Scenario: HomePage 不再 import starter 用 Card / Button
- **GIVEN** 完成實作
- **WHEN** 檢查 `app/page.tsx`
- **THEN** 不存在 `import ... from "@/components/ui/card"` 或 `import ... from "@/components/ui/button"` 用於展示「React + Express Template」歡迎卡片之用法
