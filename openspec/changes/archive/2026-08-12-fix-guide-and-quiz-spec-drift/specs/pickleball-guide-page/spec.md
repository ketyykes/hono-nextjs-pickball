## MODIFIED Requirements

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

本 capability 只擁有上述三支；`nextjs-pickball/hooks/` 下其餘 hook 歸屬其他 capability（`useQuiz` → quiz；`useScoreboardStore`、`useFullscreen`、`useOrientation` → scoreboard；`useEnterAnimationProgress`、`useReducedMotion` → tour-experience）。

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
- `nextjs-pickball/components/guide/shared/`：6 個共用元件（`BrandCard`、`TipCard`、`HighlightBox`、`MythRow`、`Section`、`ComparisonTable`）
- `nextjs-pickball/data/guide/`：7 個資料檔（tocItems、courtComparison、paddleMaterials、paddleWeights、brands、twMarketPrices、kitchenMyths）
- `nextjs-pickball/hooks/`：本 capability 擁有 3 支（useScrollShadow、useScrollSpy、useScrolledPast）+ 各自 `.test.ts`；目錄下另有 6 支歸屬其他 capability

驗收 SHALL 以「必要檔案是否存在」表述，SHALL NOT 使用「恰好 N 個檔」的數量斷言 —— 後者會在其他 capability 於同目錄新增檔案時誤報。

#### Scenario: HomePage 不含資料宣告

- **GIVEN** 完成實作
- **WHEN** 檢查 `nextjs-pickball/app/page.tsx`
- **THEN** 檔案不含品牌資料、表格資料或 myth/fact 資料的 inline 陣列；所有 list-driven 內容由對應 `nextjs-pickball/data/guide/*.ts` 匯入

#### Scenario: 每個 data 檔以 named export 提供常數

- **GIVEN** 完成實作
- **WHEN** 檢查 `nextjs-pickball/data/guide/` 下任一檔案
- **THEN** 提供至少一個具型別標註的 named export 常數，可被 section 元件 import

#### Scenario: shared 目錄含六個共用元件

- **GIVEN** 完成實作
- **WHEN** 列出 `nextjs-pickball/components/guide/shared/` 下的 `.tsx` 檔（不含 `*.test.tsx`）
- **THEN** 恰好存在 `BrandCard.tsx`、`TipCard.tsx`、`HighlightBox.tsx`、`MythRow.tsx`、`Section.tsx`、`ComparisonTable.tsx` 六個檔

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

## ADDED Requirements

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
