## ADDED Requirements

### Requirement: 首頁顯示完整匹克球指南

系統 SHALL 在路由 `/` 直接渲染完整匹克球新手指南，包含 Hero、TOC、Part 01（規則 5 段）、Part 02（選購 5 段）、Conclusion 區塊，與原型 `pickleball-guide.html` 結構一致。

#### Scenario: 訪問首頁可看到 Hero badge 與主標題
- **GIVEN** 使用者開啟 `/`
- **WHEN** 頁面載入完成
- **THEN** 畫面顯示「2025 完全入門指南」badge、主標題「匹克球新手完全入門」與三項統計數字（14萬+、¼、11）

#### Scenario: TOC 列出 10 個 section 連結
- **GIVEN** 使用者捲動到 Hero 下方
- **WHEN** TocBar 出現
- **THEN** 列出 court / serve / scoring / fouls / kitchen / materials / specs / brands / tw-market / starter 共 10 個錨點連結

#### Scenario: 每個 section 都有對應錨點 id
- **GIVEN** 頁面渲染完成
- **WHEN** DOM 解析完成
- **THEN** 存在 `#court`、`#serve`、`#scoring`、`#fouls`、`#kitchen`、`#materials`、`#specs`、`#brands`、`#tw-market`、`#starter` 共 10 個 id

### Requirement: 共用展示元件全部建構於 shadcn 元件之上

系統的 BrandCard、TipCard、HighlightBox、ConclusionCard、MythRow（之 myth/fact cell）SHALL 使用 shadcn `Card` 為基底；3 張比較表 SHALL 使用 shadcn `Table`；所有 badge 樣式 SHALL 使用 shadcn `Badge`；分隔線 SHALL 使用 shadcn `Separator`。

#### Scenario: 比較表使用 shadcn Table
- **GIVEN** 進入 Court / Materials / Specs / TwMarket section
- **WHEN** 渲染表格
- **THEN** DOM 中表格元件由 shadcn `Table`、`TableHeader`、`TableBody`、`TableRow`、`TableHead`、`TableCell` 組成

#### Scenario: Badge 不擴充 variants
- **GIVEN** 完成實作
- **WHEN** 檢查 `src/components/ui/badge.tsx`
- **THEN** 檔案內容與 `pnpm dlx shadcn@latest add badge` 產出一致，未新增 variant；所有顏色變化由使用端 className 控制

### Requirement: 色票全對應 Tailwind palette 或 shadcn token

系統 SHALL NOT 在 `src/index.css` 的 `@theme inline` 內新增任何匹克球專用色票變數（例如 `--color-pickle-green`）。所有色彩 SHALL 透過既有 Tailwind palette utility（如 `lime-400`、`slate-900`、`orange-500`、`emerald-700`、`amber-400`）或既有 shadcn semantic token（`background`、`foreground`、`muted`、`muted-foreground`、`border`、`card`）表達。

#### Scenario: index.css 不新增品牌色變數
- **GIVEN** 完成實作
- **WHEN** 檢查 `src/index.css` 的 `@theme inline` 區塊
- **THEN** 不存在 `--color-pickle-green`、`--color-court-blue`、`--color-court-surface`、`--color-accent-coral`、`--color-accent-yellow` 任何一條

### Requirement: 字型保留三套並由 index.html 載入

系統 SHALL 在 `index.html` `<head>` 加入 Google Fonts preconnect 與 Noto Sans TC、Bebas Neue、Outfit 三家族的 stylesheet link。元件 SHALL 透過 Tailwind arbitrary value（如 `font-['Bebas_Neue']`）套用。

#### Scenario: index.html 包含三家族字型
- **GIVEN** 完成實作
- **WHEN** 檢查 `index.html`
- **THEN** `<head>` 內含 `<link rel="preconnect" href="https://fonts.googleapis.com">` 且 stylesheet href 同時包含 `family=Noto+Sans+TC`、`family=Bebas+Neue`、`family=Outfit`

#### Scenario: HTML lang 與 title 已調整
- **GIVEN** 完成實作
- **WHEN** 檢查 `index.html`
- **THEN** `<html>` 的 `lang` 屬性為 `zh-Hant`，`<title>` 內含「匹克球新手完全入門」

### Requirement: 4 組 keyframes 與 utility 寫在 index.css

系統 SHALL 在 `src/index.css` 定義 `@keyframes` 與對應 `animate-*` utility class 共四組：`floatBall`、`bounce`、`fadeUp`、scroll-triggered fade-in（沿用既有 `fadeIn`）。Hero 浮球 SHALL 套用 `floatBall`、scroll indicator SHALL 套用 `bounce`、Hero badge / 標題 / 統計區 SHALL 套用 `fadeUp`、scroll-triggered 出現的 section 內容 SHALL 套用由 `useFadeInOnView` 控制的 fade 效果。

#### Scenario: Hero 浮球持續上下漂浮
- **GIVEN** 使用者開啟頁面
- **WHEN** Hero 渲染完成
- **THEN** 浮球元素的 computed style 含有名稱為 `floatBall`（或對應 utility class `animate-float-ball`）的動畫且 `iteration-count` 為 `infinite`

### Requirement: 互動行為由三支 hooks 提供且各有 smoke test

系統 SHALL 提供三支 React hooks：`useScrollShadow`、`useScrollSpy`、`useFadeInOnView`，分別位於 `src/hooks/`。每支 hook SHALL 有對應 `*.test.ts` 檔，包含至少一個 happy-path scenario。

#### Scenario: useScrollShadow 在 scrollY 超過 threshold 時回傳 true
- **GIVEN** 測試環境呼叫 `useScrollShadow(100)`
- **WHEN** `window.scrollY` 設為 150 並 dispatch `scroll` 事件
- **THEN** hook 回傳值為 `true`
- **驗收**：`src/hooks/useScrollShadow.test.ts`，it 名稱「應在 scrollY 超過 threshold 時回傳 true」

#### Scenario: useScrollSpy 回傳目前可視 section 的 id
- **GIVEN** 測試 mock 了 IntersectionObserver 並呼叫 `useScrollSpy(['court', 'serve'])`
- **WHEN** 模擬 `serve` section 進入視窗（callback 觸發 entry.isIntersecting=true）
- **THEN** hook 回傳值為 `'serve'`
- **驗收**：`src/hooks/useScrollSpy.test.ts`，it 名稱「應回傳目前可視 section 的 id」

#### Scenario: useFadeInOnView 在元素進入視窗時將 isVisible 設為 true
- **GIVEN** 測試 mock 了 IntersectionObserver 並 render 一個使用 `useFadeInOnView()` 的測試元件
- **WHEN** 模擬目標元素進入視窗
- **THEN** hook 回傳的 `isVisible` 為 `true`
- **驗收**：`src/hooks/useFadeInOnView.test.ts`，it 名稱「應在元素進入視窗時將 isVisible 設為 true」

### Requirement: 沿用 hooks 控制 sticky shadow / 主動 TOC link / scroll fade-in

`HomePage` 與 `TocBar` 與 section 元件 SHALL 透過上述 hooks 提供等同於原型的互動體驗。

#### Scenario: TOC bar 在 scroll 超過 100px 時加上陰影
- **GIVEN** 使用者捲動頁面
- **WHEN** `window.scrollY > 100`
- **THEN** TocBar 元素的 className 含有由 `useScrollShadow` 切換而來、表示 elevated 狀態的 class（如 `shadow-md` 或等價 utility）

#### Scenario: TOC link 在對應 section 進入視窗時高亮
- **GIVEN** 使用者捲動到 `#kitchen` section
- **WHEN** IntersectionObserver 判定 `#kitchen` 為目前可視 section
- **THEN** TocBar 中 `href="#kitchen"` 的連結具有 active style（由 `useScrollSpy` 回傳值控制）

#### Scenario: section 內容捲入視窗時淡入
- **GIVEN** 使用者捲動頁面
- **WHEN** 任一掛載 `useFadeInOnView` 的元素進入視窗
- **THEN** 該元素由 `opacity-0 translate-y-6` 過渡為 `opacity-100 translate-y-0`

### Requirement: 拆檔結構符合 components / data / hooks 三層

系統 SHALL 將實作拆成下列檔案結構：

- `src/pages/HomePage.tsx`：純組合，不含資料宣告
- `src/components/guide/`：11 個 section 元件 + `shared/` 子目錄含 5 個共用元件
- `src/data/guide/`：7 個資料檔（tocItems、courtComparison、paddleMaterials、paddleWeights、brands、twMarketPrices、kitchenMyths）
- `src/hooks/`：3 個 hook 檔 + 各自 `.test.ts`

#### Scenario: HomePage 不含資料宣告
- **GIVEN** 完成實作
- **WHEN** 檢查 `src/pages/HomePage.tsx`
- **THEN** 檔案不含品牌資料、表格資料或 myth/fact 資料的 inline 陣列；所有 list-driven 內容由對應 `data/guide/*.ts` 匯入

#### Scenario: 每個 data 檔以 named export 提供常數
- **GIVEN** 完成實作
- **WHEN** 檢查 `src/data/guide/` 下任一檔案
- **THEN** 提供至少一個具型別標註的 named export 常數，可被 section 元件 import

### Requirement: 原型 HTML 加入 .gitignore 但檔案保留

系統 SHALL 將 `pickleball-guide.html` 加入 `.gitignore`，但 SHALL NOT 從 working tree 刪除該檔案。

#### Scenario: gitignore 含原型路徑
- **GIVEN** 完成實作
- **WHEN** 檢查 `.gitignore`
- **THEN** 內容含一行 `pickleball-guide.html`

#### Scenario: 原型檔案仍存在
- **GIVEN** 完成實作
- **WHEN** `ls pickleball-guide.html`
- **THEN** 檔案存在

### Requirement: HomePage 移除 starter 樣板內容

系統 SHALL 從 `src/pages/HomePage.tsx` 移除既有的 starter Card / Button import 與「React + Express Template」歡迎內容。

#### Scenario: HomePage 不再 import starter 用 Card / Button
- **GIVEN** 完成實作
- **WHEN** 檢查 `src/pages/HomePage.tsx`
- **THEN** 不存在 `import ... from "@/components/ui/card"` 或 `import ... from "@/components/ui/button"` 用於展示「React + Express Template」歡迎卡片之用法
