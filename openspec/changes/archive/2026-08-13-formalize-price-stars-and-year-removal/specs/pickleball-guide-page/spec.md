## MODIFIED Requirements

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

### Requirement: 拆檔結構符合 components / data / hooks 三層

系統 SHALL 將實作拆成下列檔案結構：

- `nextjs-pickball/app/page.tsx`：純組合，不含資料宣告
- `nextjs-pickball/components/guide/`：頂層至少包含 10 個 `*Section`（`CourtSection`、`ServeSection`、`ScoringSection`、`FoulsSection`、`KitchenSection`、`MaterialsSection`、`SpecsSection`、`BrandsSection`、`TwMarketSection`、`StarterSection`）與 `Hero`、`TocBar`、`PartDivider`、`Conclusion`、`CourtDiagram`；另有 `HeroTourCta`，其行為由 tour-experience capability 規範
- `nextjs-pickball/components/guide/shared/`：7 個共用元件（`BrandCard`、`TipCard`、`HighlightBox`、`MythRow`、`Section`、`ComparisonTable`、`PriceStars`）
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

#### Scenario: shared 目錄含全部必要共用元件

- **GIVEN** 完成實作
- **WHEN** 列出 `nextjs-pickball/components/guide/shared/` 下的 `.tsx` 檔（不含 `*.test.tsx`）
- **THEN** `BrandCard.tsx`、`TipCard.tsx`、`HighlightBox.tsx`、`MythRow.tsx`、`Section.tsx`、`ComparisonTable.tsx`、`PriceStars.tsx` 皆存在

#### Scenario: guide 目錄頂層含全部必要元件檔

- **GIVEN** 完成實作
- **WHEN** 列出 `nextjs-pickball/components/guide/` 下的 `.tsx` 檔（不含 `shared/` 與 `*.test.tsx`）
- **THEN** 10 個 `*Section.tsx` 與 `Hero.tsx`、`TocBar.tsx`、`PartDivider.tsx`、`Conclusion.tsx`、`CourtDiagram.tsx` 皆存在

## ADDED Requirements

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
