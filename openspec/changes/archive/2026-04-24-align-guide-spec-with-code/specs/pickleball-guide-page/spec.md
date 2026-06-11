## MODIFIED Requirements

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
